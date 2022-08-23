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

pragma solidity 0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/Math.sol";

import "../../apis/pancake/IPancakeRouter02.sol";
import "../../interfaces/IPancakeFactory.sol";
import "../../interfaces/IPancakePair.sol";

import "../../interfaces/IStrategy.sol";
import "../../interfaces/IWETH.sol";
import "../../interfaces/IWNativeRelayer.sol";
import "../../interfaces/IWorker.sol";

import "../../../utils/SafeToken.sol";

contract PancakeswapV2RestrictedDnxStrategyPartialCloseNoTrading is
  OwnableUpgradeSafe,
  ReentrancyGuardUpgradeSafe,
  IStrategy
{
  using SafeToken for address;
  using SafeMath for uint256;

  IPancakeFactory public factory;
  IPancakeRouter02 public router;
  IWETH public wbnb;
  IWNativeRelayer public wNativeRelayer;

  mapping(address => bool) public okWorkers;
  mapping(address => bool) public okDeltaNeutralVaults;

  event PancakeswapV2RestrictedDnxStrategyPartialCloseNoTradingEvent(
    address indexed baseToken,
    address indexed farmToken,
    uint256 amounToLiquidate
  );

  /// @notice require that only allowed workers are able to do the rest of the method call
  modifier onlyWhitelistedWorkers() {
    require(okWorkers[msg.sender], "bad worker");
    _;
  }

  /// @dev Create a new withdraw minimize trading strategy instance.
  /// @param _router The PancakeSwap Router smart contract.
  /// @param _wbnb The wrapped BNB token.
  /// @param _wNativeRelayer The relayer to support native transfer
  function initialize(
    IPancakeRouter02 _router,
    IWETH _wbnb,
    IWNativeRelayer _wNativeRelayer
  ) external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
    factory = IPancakeFactory(_router.factory());
    router = _router;
    wbnb = _wbnb;
    wNativeRelayer = _wNativeRelayer;
  }

  /// @dev Execute worker strategy. Take LP tokens. Return farming token + base token.
  /// However, some base token will be deducted to pay the debt
  /// @param user User address to withdraw liquidity.
  /// @param data Extra calldata information passed along to this strategy.
  function execute(
    address user,
    uint256, /*debt*/
    bytes calldata data
  ) external override onlyWhitelistedWorkers nonReentrant {
    // 1. Decode variables from extra data & load required variables.
    // - maxLpTokenToLiquidate -> maximum lpToken amount that user want to liquidate.
    // - minFarmingTokenAmount -> minimum farmingToken amount that user want to receive.
    (uint256 maxLpTokenToLiquidate, uint256 minFarmingToken) = abi.decode(data, (uint256, uint256));
    IWorker worker = IWorker(msg.sender);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    IPancakePair lpToken = IPancakePair(factory.getPair(farmingToken, baseToken));
    uint256 lpTokenToLiquidate = Math.min(address(lpToken).myBalance(), maxLpTokenToLiquidate);
    // 2. Approve router to do their stuffs.
    address(lpToken).safeApprove(address(router), uint256(-1));
    farmingToken.safeApprove(address(router), uint256(-1));
    // 3. Remove all liquidity back to base token and farming token.
    router.removeLiquidity(baseToken, farmingToken, lpTokenToLiquidate, 0, 0, address(this), now);
    // 4. Return remaining LP token back to the original caller.
    address(lpToken).safeTransfer(msg.sender, lpToken.balanceOf(address(this)));
    // 6. Return base token back to the original caller.
    // TODO: send base token to delta neutral vault
    baseToken.safeTransfer(msg.sender, baseToken.myBalance());
    // 7. Return remaining farming tokens to user.
    // TODO: send base token to delta neutral vault
    uint256 remainingFarmingToken = farmingToken.myBalance();
    require(remainingFarmingToken >= minFarmingToken, "!enough ftoken");
    SafeToken.safeTransfer(farmingToken, user, remainingFarmingToken);

    // 8. Reset approval for safety reason.
    address(lpToken).safeApprove(address(router), 0);
    farmingToken.safeApprove(address(router), 0);

    emit PancakeswapV2RestrictedDnxStrategyPartialCloseNoTradingEvent(baseToken, farmingToken, lpTokenToLiquidate);
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < workers.length; idx++) {
      okWorkers[workers[idx]] = isOk;
    }
  }

  function setDeltaNeutralVaultsOk(address[] calldata deltaNeutralVaults, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < deltaNeutralVaults.length; idx++) {
      okDeltaNeutralVaults[deltaNeutralVaults[idx]] = isOk;
    }
  }

  receive() external payable {}
}
