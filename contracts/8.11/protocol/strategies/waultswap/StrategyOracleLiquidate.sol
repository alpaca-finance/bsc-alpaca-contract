// SPDX-License-Identifier: MIT
/**
  ∩~~~~∩ 
  ξ ･×･ ξ 
  ξ　~　ξ 
  ξ　　 ξ 
  ξ　　 “~～~～〇 
  ξ　　　　　　 ξ 
  ξ ξ ξ~～~ξ ξ ξ 
　 ξ_ξξ_ξ　ξ_ξξ_ξ
Alpaca Fin Corporation
*/

pragma solidity 0.8.11;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable, SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import { IPriceOracle } from "../../interfaces/IPriceOracle.sol";
import { ISwapFactoryLike } from "../../interfaces/ISwapFactoryLike.sol";
import { ISwapPairLike } from "../../interfaces/ISwapPairLike.sol";
import { ISwapRouter02Like } from "../../interfaces/ISwapRouter02Like.sol";
import { IStrategy } from "../../interfaces/IStrategy.sol";
import { IWETH } from "../../interfaces/IWETH.sol";
import { IWNativeRelayer } from "../../interfaces/IWNativeRelayer.sol";
import { IWorker } from "../../interfaces/IWorker.sol";

import { SafeTransfer } from "../../../utils/SafeTransfer.sol";

/// @title StrategyOracleLiquidate - Close position at oracle price with discount factor
// solhint-disable not-rely-on-time
contract StrategyOracleLiquidate is OwnableUpgradeable, ReentrancyGuardUpgradeable, IStrategy {
  /// @notice Libraries
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /// @notice Errors
  error StrategyOracleLiquidate_BadArguments();
  error StrategyOracleLiquidate_NotWhitelistedWorker();
  error StrategyOracleLiquidate_PriceStale();
  error StrategyOracleLiquidate_Slippage();

  /// @notice Configs
  string public name;
  uint256 public defaultDiscountFactor;
  mapping(address => mapping(address => uint256)) public discountFactors;

  address public liquiditySource;
  IPriceOracle public priceOracle;

  ISwapFactoryLike public factory;
  ISwapRouter02Like public router;

  mapping(address => bool) public okWorkers;

  /// @notice Events
  event LogSetDiscountFactor(address _token0, address _token1, uint256 _discountFactor);
  event LogSetWorkersOk(address[] _workers, bool _isOk);

  /// @notice Modifier to allow only whitelisted workers to call the rest of the method
  modifier onlyWhitelistedWorkers() {
    if (!okWorkers[msg.sender]) revert StrategyOracleLiquidate_NotWhitelistedWorker();
    _;
  }

  function initialize(
    string calldata _name,
    ISwapRouter02Like _router,
    IPriceOracle _priceOracle,
    address _liquiditySource,
    uint256 _defaultDiscountFactor
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();

    name = _name;
    factory = ISwapFactoryLike(_router.factory());
    router = _router;
    priceOracle = _priceOracle;
    liquiditySource = _liquiditySource;
    defaultDiscountFactor = _defaultDiscountFactor;
  }

  function calBaseFromLiquiditySource(
    address _baseToken,
    address _farmingToken,
    uint256 _farmBasePrice,
    uint256 _farmAmount
  ) internal view returns (uint256) {
    uint256 _baseTo18Factor = 18 - uint256(ERC20Upgradeable(_baseToken).decimals());
    uint256 _farmTo18Factor = 18 - uint256(ERC20Upgradeable(_farmingToken).decimals());

    return
      (_farmAmount *
        10**_farmTo18Factor *
        ((_farmBasePrice * getDiscountFactor(address(_farmingToken), address(_baseToken))) / 10000)) /
      (10**(18 + _baseTo18Factor));
  }

  function execute(
    address, /* _user */
    uint256 _debt,
    bytes calldata _data
  ) external onlyWhitelistedWorkers nonReentrant {
    // 1. Load all required data
    uint256 _minBaseToken = abi.decode(_data, (uint256));
    IWorker _worker = IWorker(msg.sender);
    IERC20Upgradeable _baseToken = IERC20Upgradeable(_worker.baseToken());
    IERC20Upgradeable _farmingToken = IERC20Upgradeable(_worker.farmingToken());
    IERC20Upgradeable _lpToken = IERC20Upgradeable(factory.getPair(address(_farmingToken), address(_baseToken)));
    (uint256 _farmBasePrice, uint256 _lastUpdate) = priceOracle.getPrice(address(_farmingToken), address(_baseToken));
    if (_lastUpdate < block.timestamp - 1 days) revert StrategyOracleLiquidate_PriceStale();
    // 2. Approve router to take out LPs
    _lpToken.safeApprove(address(router), type(uint256).max);
    // 3. Remove liquidity
    router.removeLiquidity(
      address(_baseToken),
      address(_farmingToken),
      _lpToken.balanceOf(address(this)),
      0,
      0,
      address(this),
      block.timestamp
    );
    // 4. Convert farming token to base token through liquidity source
    uint256 _farmingTokenBalance = _farmingToken.balanceOf(address(this));
    _farmingToken.safeTransfer(liquiditySource, _farmingToken.balanceOf(address(this)));
    _baseToken.safeTransferFrom(
      liquiditySource,
      address(this),
      calBaseFromLiquiditySource(address(_baseToken), address(_farmingToken), _farmBasePrice, _farmingTokenBalance)
    );
    uint256 _baseTokenBalance = _baseToken.balanceOf(address(this));
    if (_debt <= _baseTokenBalance)
      if (_baseTokenBalance - _debt < _minBaseToken) revert StrategyOracleLiquidate_Slippage();
    // 5. Return base token back to the worker
    _baseToken.safeTransfer(msg.sender, _baseToken.balanceOf(address(this)));
    // 6. Reset approval
    _lpToken.safeApprove(address(router), 0);
  }

  function getDiscountFactor(address _token0, address _token1) public view returns (uint256) {
    if (discountFactors[_token0][_token1] != 0) return discountFactors[_token0][_token1];
    return defaultDiscountFactor;
  }

  function setDiscountFactor(
    address _token0,
    address _token1,
    uint256 _discountFactor
  ) external onlyOwner {
    if (_discountFactor < 5000 || _discountFactor > 10000) revert StrategyOracleLiquidate_BadArguments();

    discountFactors[_token0][_token1] = _discountFactor;
    discountFactors[_token1][_token0] = _discountFactor;

    emit LogSetDiscountFactor(_token0, _token1, _discountFactor);
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < workers.length; idx++) okWorkers[workers[idx]] = isOk;
    emit LogSetWorkersOk(workers, isOk);
  }
}
