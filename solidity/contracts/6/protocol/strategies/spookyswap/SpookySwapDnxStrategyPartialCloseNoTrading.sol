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

import "../../interfaces/ISwapRouter02Like.sol";
import "../../interfaces/ISwapFactoryLike.sol";
import "../../interfaces/ISwapPairLike.sol";

import "../../interfaces/IStrategy.sol";
import "../../interfaces/IWorker03.sol";

import "../../../utils/SafeToken.sol";

contract SpookySwapDnxStrategyPartialCloseNoTrading is OwnableUpgradeSafe, ReentrancyGuardUpgradeSafe, IStrategy {
  using SafeToken for address;
  using SafeMath for uint256;

  ISwapFactoryLike public factory;
  ISwapRouter02Like public router;

  mapping(address => bool) public okWorkers;
  mapping(address => bool) public okDeltaNeutralVaults;

  event SpookySwapDnxStrategyPartialCloseNoTradingS(
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
  /// @param _router The SpookySwap Router smart contract.
  function initialize(ISwapRouter02Like _router) external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
    factory = ISwapFactoryLike(_router.factory());
    router = _router;
  }

  /// @dev Execute worker strategy. Take LP tokens. Return farming token + base token.
  /// However, some base token will be deducted to pay the debt
  /// @param data Extra calldata information passed along to this strategy.
  function execute(
    address /*user*/,
    uint256 /*debt*/,
    bytes calldata data
  ) external override onlyWhitelistedWorkers nonReentrant {
    // 1. Decode variables from extra data & load required variables.
    (uint256 maxLpTokenToLiquidate, address _deltaNeutralVault) = abi.decode(data, (uint256, address));
    require(okDeltaNeutralVaults[_deltaNeutralVault], "bad target");

    IWorker03 worker = IWorker03(msg.sender);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    ISwapPairLike lpToken = ISwapPairLike(factory.getPair(farmingToken, baseToken));
    uint256 lpTokenToLiquidate = Math.min(address(lpToken).myBalance(), maxLpTokenToLiquidate);
    // 2. Approve router to do their stuffs.
    address(lpToken).safeApprove(address(router), uint256(-1));

    // 3. Remove all liquidity back to base token and farming token.
    router.removeLiquidity(baseToken, farmingToken, lpTokenToLiquidate, 0, 0, address(this), now);

    // 4. Return remaining LP token back to the original caller.
    if (lpToken.balanceOf(address(this)) > 0) {
      address(lpToken).safeTransfer(msg.sender, lpToken.balanceOf(address(this)));
    }

    // 5. Return base token back to the delta neutral vault.
    baseToken.safeTransfer(_deltaNeutralVault, baseToken.myBalance());

    // 6. Return farming token back to the delta neutral vault.
    farmingToken.safeTransfer(_deltaNeutralVault, farmingToken.myBalance());

    // 7. Reset approval for safety reason.
    address(lpToken).safeApprove(address(router), 0);

    emit SpookySwapDnxStrategyPartialCloseNoTradingS(baseToken, farmingToken, lpTokenToLiquidate);
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    uint256 length = workers.length;
    for (uint256 idx = 0; idx < length; idx++) {
      okWorkers[workers[idx]] = isOk;
    }
  }

  function setDeltaNeutralVaultsOk(address[] calldata deltaNeutralVaults, bool isOk) external onlyOwner {
    uint256 length = deltaNeutralVaults.length;
    for (uint256 idx = 0; idx < length; idx++) {
      okDeltaNeutralVaults[deltaNeutralVaults[idx]] = isOk;
    }
  }
}
