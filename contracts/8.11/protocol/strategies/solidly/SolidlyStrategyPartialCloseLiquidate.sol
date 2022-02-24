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

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

import "../../interfaces/ISwapFactoryLike.sol";
import "../../interfaces/ISwapPairLike.sol";
import "../../interfaces/ISwapRouter02Like.sol";
import "../../interfaces/IStrategy.sol";
import "../../interfaces/IMultiRewardWorker03.sol";

import "../../../utils/SafeToken.sol";

contract SpookySwapStrategyPartialCloseLiquidate is OwnableUpgradeable, ReentrancyGuardUpgradeable, IStrategy {
  using SafeToken for address;

  event LogSetWorkerOk(address[] indexed workers, bool isOk);

  ISwapFactoryLike public factory;
  ISwapRouter02Like public router;

  mapping(address => bool) public okWorkers;

  event LogSpookySwapStrategyPartialCloseLiquidate(
    address indexed baseToken,
    address indexed farmToken,
    uint256 amountToLiquidate,
    uint256 amountToRepayDebt
  );

  /// @notice require that only allowed workers are able to do the rest of the method call
  modifier onlyWhitelistedWorkers() {
    require(okWorkers[msg.sender], "bad worker");
    _;
  }

  /// @dev Create a new liquidate strategy instance.
  /// @param _router The WaultSwap Router smart contract.
  function initialize(ISwapRouter02Like _router) public initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
    factory = ISwapFactoryLike(_router.factory());
    router = _router;
  }

  /// @dev Execute worker strategy. Take LP token. Return  BaseToken.
  /// @param data Extra calldata information passed along to this strategy.
  function execute(
    address, /* user */
    uint256 debt,
    bytes calldata data
  ) external override onlyWhitelistedWorkers nonReentrant {
    // 1. Decode variables from extra data & load required variables.
    // - maxLpTokenToLiquidate -> maximum lpToken amount that user want to liquidate.
    // - maxDebtRepayment -> maximum BTOKEN amount that user want to repaid debt.
    // - minBaseToken -> minimum baseToken amount that user want to receive.
    (uint256 maxLpTokenToLiquidate, uint256 maxDebtRepayment, uint256 minBaseToken) = abi.decode(
      data,
      (uint256, uint256, uint256)
    );
    IMultiRewardWorker03 worker = IMultiRewardWorker03(msg.sender);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    ISwapPairLike lpToken = ISwapPairLike(factory.getPair(farmingToken, baseToken));
    uint256 lpTokenToLiquidate = MathUpgradeable.min(address(lpToken).myBalance(), maxLpTokenToLiquidate);
    uint256 lessDebt = MathUpgradeable.min(debt, maxDebtRepayment);
    uint256 baseTokenBefore = baseToken.myBalance();
    // 2. Approve router to do their stuffs.
    address(lpToken).safeApprove(address(router), type(uint256).max);
    farmingToken.safeApprove(address(router), type(uint256).max);
    // 3. Remove some LP back to BaseToken and farming tokens as we want to return some of the position.
    router.removeLiquidity(baseToken, farmingToken, lpTokenToLiquidate, 0, 0, address(this), block.timestamp);
    // 4. Convert farming tokens to baseToken.
    address[] memory path = new address[](2);
    path[0] = farmingToken;
    path[1] = baseToken;
    router.swapExactTokensForTokens(farmingToken.myBalance(), 0, path, address(this), block.timestamp);
    // 5. Return all baseToken back to the original caller.
    uint256 baseTokenAfter = baseToken.myBalance();
    require(baseTokenAfter - (baseTokenBefore) - (lessDebt) >= minBaseToken, "insufficient baseToken received");
    SafeToken.safeTransfer(baseToken, msg.sender, baseTokenAfter);
    address(lpToken).safeTransfer(msg.sender, lpToken.balanceOf(address(this)));
    // 6. Reset approve for safety reason.
    address(lpToken).safeApprove(address(router), 0);
    farmingToken.safeApprove(address(router), 0);

    emit LogSpookySwapStrategyPartialCloseLiquidate(baseToken, farmingToken, lpTokenToLiquidate, lessDebt);
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < workers.length; idx++) {
      okWorkers[workers[idx]] = isOk;
    }
    emit LogSetWorkerOk(workers, isOk);
  }
}
