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

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/Math.sol";

import "../../apis/mdex/IMdexFactory.sol";
import "../../apis/mdex/IMdexRouter.sol";
import "../../interfaces/IPancakePair.sol";
import "../../interfaces/IMdexSwapMining.sol";

import "../../interfaces/IStrategy.sol";
import "../../interfaces/IWETH.sol";
import "../../interfaces/IWNativeRelayer.sol";
import "../../interfaces/IVault.sol";
import "../../interfaces/IWorker.sol";

import "../../../utils/SafeToken.sol";
import "../../../utils/AlpacaMath.sol";

contract MdexRestrictedStrategyPartialCloseMinimizeTrading is
  OwnableUpgradeSafe,
  ReentrancyGuardUpgradeSafe,
  IStrategy
{
  using SafeToken for address;
  using SafeMath for uint256;

  /// @notice Events
  event SetWorkerOk(address indexed caller, address worker, bool isOk);
  event WithdrawTradingRewards(address indexed caller, address to, uint256 amount);

  IMdexFactory public factory;
  IMdexRouter public router;
  address public mdx;
  IWETH public wbnb;
  IWNativeRelayer public wNativeRelayer;

  mapping(address => bool) public okWorkers;

  event MdexRestrictedStrategyPartialCloseMinimizeTradingEvent(
    address indexed baseToken,
    address indexed farmToken,
    uint256 amounToLiquidate,
    uint256 amountToRepayDebt
  );

  /// @notice require that only allowed workers are able to do the rest of the method call
  modifier onlyWhitelistedWorkers() {
    require(
      okWorkers[msg.sender],
      "MdexRestrictedStrategyPartialCloseMinimizeTrading::onlyWhitelistedWorkers:: bad worker"
    );
    _;
  }

  /// @dev Create a new withdraw minimize trading strategy instance.
  /// @param _router The Mdex Router smart contract.
  /// @param _wbnb The wrapped BNB token.
  /// @param _wNativeRelayer The relayer to support native transfer
  /// @param _mdx The address of mdex token
  function initialize(
    IMdexRouter _router,
    IWETH _wbnb,
    IWNativeRelayer _wNativeRelayer,
    address _mdx
  ) external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
    factory = IMdexFactory(_router.factory());
    router = _router;
    wbnb = _wbnb;
    wNativeRelayer = _wNativeRelayer;
    mdx = _mdx;
  }

  /// @dev Execute worker strategy. Take LP tokens. Return farming token + base token.
  /// However, some base token will be deducted to pay the debt
  /// @param user User address to withdraw liquidity.
  /// @param debt Debt amount in WAD of the user.
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
    IWorker worker = IWorker(msg.sender);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    IPancakePair lpToken = IPancakePair(factory.getPair(farmingToken, baseToken));
    uint256 lessDebt = Math.min(debt, maxDebtRepayment);
    uint256 lpTokenToLiquidate = Math.min(address(lpToken).myBalance(), maxLpTokenToLiquidate);
    // 2. Approve router to do their stuffs.
    address(lpToken).safeApprove(address(router), uint256(-1));
    farmingToken.safeApprove(address(router), uint256(-1));
    // 3. Remove all liquidity back to base token and farming token.
    router.removeLiquidity(baseToken, farmingToken, lpTokenToLiquidate, 0, 0, address(this), now);
    // 4. Convert farming tokens to base token.
    {
      uint256 balance = baseToken.myBalance();
      uint256 farmingTokenbalance = farmingToken.myBalance();
      if (lessDebt > balance) {
        address[] memory path = new address[](2);
        path[0] = farmingToken;
        path[1] = baseToken;
        uint256 remainingDebt = lessDebt.sub(balance);
        // Router will revert with 'MdexRouter: EXCESSIVE_INPUT_AMOUNT' if not enough farmingToken
        router.swapTokensForExactTokens(remainingDebt, farmingTokenbalance, path, address(this), now);
      }
    }
    // 5. Return remaining LP token back to the original caller.
    address(lpToken).safeTransfer(msg.sender, lpToken.balanceOf(address(this)));
    // 6. Return base token back to the original caller.
    baseToken.safeTransfer(msg.sender, baseToken.myBalance());
    // 7. Return remaining farming tokens to user.
    uint256 remainingFarmingToken = farmingToken.myBalance();
    require(
      remainingFarmingToken >= minFarmingToken,
      "MdexRestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received"
    );
    if (remainingFarmingToken > 0) {
      if (farmingToken == address(wbnb)) {
        farmingToken.safeTransfer(address(wNativeRelayer), remainingFarmingToken);
        wNativeRelayer.withdraw(remainingFarmingToken);
        SafeToken.safeTransferETH(user, remainingFarmingToken);
      } else {
        farmingToken.safeTransfer(user, remainingFarmingToken);
      }
    }
    // 8. Reset approval for safety reason.
    address(lpToken).safeApprove(address(router), 0);
    farmingToken.safeApprove(address(router), 0);

    emit MdexRestrictedStrategyPartialCloseMinimizeTradingEvent(baseToken, farmingToken, lpTokenToLiquidate, lessDebt);
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < workers.length; idx++) {
      okWorkers[workers[idx]] = isOk;
      emit SetWorkerOk(msg.sender, workers[idx], isOk);
    }
  }

  /// @dev Withdraw trading all reward.
  /// @param to The address to transfer trading reward to.
  function withdrawTradingRewards(address to) external onlyOwner {
    uint256 mdxBalanceBefore = mdx.myBalance();
    IMdexSwapMining(router.swapMining()).takerWithdraw();
    uint256 mdxBalanceAfter = mdx.myBalance().sub(mdxBalanceBefore);
    mdx.safeTransfer(to, mdxBalanceAfter);
    emit WithdrawTradingRewards(msg.sender, to, mdxBalanceAfter);
  }

  /// @dev Get trading rewards by pIds.
  /// @param pIds pool ids to retrieve reward amount.
  function getMiningRewards(uint256[] calldata pIds) external view returns (uint256) {
    address swapMiningAddress = router.swapMining();
    uint256 totalReward;
    for (uint256 index = 0; index < pIds.length; index++) {
      (uint256 reward, ) = IMdexSwapMining(swapMiningAddress).getUserReward(pIds[index]);
      totalReward = totalReward.add(reward);
    }
    return totalReward;
  }

  receive() external payable {}
}
