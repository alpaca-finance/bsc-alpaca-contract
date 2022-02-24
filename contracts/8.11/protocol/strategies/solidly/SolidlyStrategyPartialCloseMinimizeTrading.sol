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
import "../../interfaces/IWNativeRelayer.sol";
import "../../interfaces/IMultiRewardWorker03.sol";

import "../../../utils/SafeToken.sol";

contract SpookySwapStrategyPartialCloseMinimizeTrading is OwnableUpgradeable, ReentrancyGuardUpgradeable, IStrategy {
  using SafeToken for address;

  event LogSetWorkerOk(address[] indexed workers, bool isOk);

  ISwapFactoryLike public factory;
  ISwapRouter02Like public router;
  address public wftm;
  IWNativeRelayer public wNativeRelayer;

  mapping(address => bool) public okWorkers;

  event LogSpookySwapStrategyPartialCloseMinimizeTrading(
    address indexed baseToken,
    address indexed farmToken,
    uint256 amounToLiquidate,
    uint256 amountToRepayDebt
  );

  /// @notice require that only allowed workers are able to do the rest of the method call
  modifier onlyWhitelistedWorkers() {
    require(okWorkers[msg.sender], "bad worker");
    _;
  }

  /// @dev Create a new withdraw minimize trading strategy instance.
  /// @param _router The SpookySwap Router smart contract.
  /// @param _wNativeRelayer The relayer to support native transfer
  function initialize(ISwapRouter02Like _router, IWNativeRelayer _wNativeRelayer) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
    factory = ISwapFactoryLike(_router.factory());
    router = _router;
    wftm = _router.WETH();
    wNativeRelayer = _wNativeRelayer;
  }

  /// @dev Execute worker strategy. Take LP tokens. Return farming token + base token.
  /// However, some base token will be deducted to pay the debt
  /// @param user User address to withdraw liquidity.
  /// @param data Extra calldata information passed along to this strategy.
  function execute(
    address user,
    uint256 debt,
    bytes calldata data
  ) external override onlyWhitelistedWorkers nonReentrant {
    // 1. Decode variables from extra data & load required variables.
    // - maxLpTokenToLiquidate -> maximum lpToken amount that user want to liquidate.
    // - maxDebtRepayment -> maximum BTOKEN amount that user want to repaid debt.
    // - minFarmingTokenAmount -> minimum farmingToken amount that user want to receive.
    (uint256 maxLpTokenToLiquidate, uint256 maxDebtRepayment, uint256 minFarmingToken) = abi.decode(
      data,
      (uint256, uint256, uint256)
    );
    IMultiRewardWorker03 worker = IMultiRewardWorker03(msg.sender);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    ISwapPairLike lpToken = worker.lpToken();
    uint256 lpTokenToLiquidate = MathUpgradeable.min(address(lpToken).myBalance(), maxLpTokenToLiquidate);
    uint256 lessDebt = MathUpgradeable.min(debt, maxDebtRepayment);
    // 2. Approve router to do their stuffs.
    address(lpToken).safeApprove(address(router), type(uint256).max);
    farmingToken.safeApprove(address(router), type(uint256).max);
    // 3. Remove all liquidity back to base token and farming tokens.
    router.removeLiquidity(baseToken, farmingToken, lpTokenToLiquidate, 0, 0, address(this), block.timestamp);
    // 4. Convert farming tokens to base token.
    {
      uint256 balance = baseToken.myBalance();
      uint256 farmingTokenbalance = farmingToken.myBalance();
      if (lessDebt > balance) {
        // Convert some farming tokens to base token.
        address[] memory path = new address[](2);
        path[0] = farmingToken;
        path[1] = baseToken;
        uint256 remainingDebt = lessDebt - (balance);
        // Router will revert with if not enough farmingToken
        router.swapTokensForExactTokens(remainingDebt, farmingTokenbalance, path, address(this), block.timestamp);
      }
    }
    // 5. Return remaining LP token back to the original caller.
    address(lpToken).safeTransfer(msg.sender, lpToken.balanceOf(address(this)));
    // 6. Return base token back to the original caller.
    baseToken.safeTransfer(msg.sender, baseToken.myBalance());
    // 7. Return remaining farming tokens to user.
    uint256 remainingFarmingToken = farmingToken.myBalance();
    require(remainingFarmingToken >= minFarmingToken, "insufficient farming tokens received");
    if (remainingFarmingToken > 0) {
      if (farmingToken == wftm) {
        SafeToken.safeTransfer(farmingToken, address(wNativeRelayer), remainingFarmingToken);
        wNativeRelayer.withdraw(remainingFarmingToken);
        SafeToken.safeTransferETH(user, remainingFarmingToken);
      } else {
        SafeToken.safeTransfer(farmingToken, user, remainingFarmingToken);
      }
    }
    // 8. Reset approval for safety reason.
    address(lpToken).safeApprove(address(router), 0);
    farmingToken.safeApprove(address(router), 0);

    emit LogSpookySwapStrategyPartialCloseMinimizeTrading(baseToken, farmingToken, lpTokenToLiquidate, lessDebt);
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < workers.length; idx++) {
      okWorkers[workers[idx]] = isOk;
    }
    emit LogSetWorkerOk(workers, isOk);
  }

  receive() external payable {}
}
