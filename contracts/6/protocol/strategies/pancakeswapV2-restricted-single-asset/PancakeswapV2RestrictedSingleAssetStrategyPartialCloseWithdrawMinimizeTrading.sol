// SPDX-License-Identifier: BUSL-1.1
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
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakeFactory.sol";
import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakePair.sol";


import "../../apis/pancake/IPancakeRouter02.sol";
import "../../interfaces/IStrategy.sol";
import "../../../utils/SafeToken.sol";
import "../../../utils/AlpacaMath.sol";
import "../../interfaces/IWorker02.sol";
import "../../interfaces/IWNativeRelayer.sol";
import "hardhat/console.sol";


contract PancakeswapV2RestrictedSingleAssetStrategyPartialCloseWithdrawMinimizeTrading is OwnableUpgradeSafe, ReentrancyGuardUpgradeSafe, IStrategy {
  using SafeToken for address;
  using SafeMath for uint256;

  IPancakeFactory public factory;
  IPancakeRouter02 public router;
  address public wbnb;
  mapping(address => bool) public okWorkers;
  IWNativeRelayer public wNativeRelayer;

  event PancakeswapV2RestrictedSingleAssetStrategyPartialCloseWithdrawMinimizeTradingEvent(
    address indexed baseToken,
    address indexed farmToken,
    uint256 amounToLiquidate,
    uint256 amountToRepayDebt
  );

  // @notice require that only allowed workers are able to do the rest of the method call
  modifier onlyWhitelistedWorkers() {
    require(okWorkers[msg.sender], "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker");
    _;
  } 

  /// @dev Create a new add Token only strategy instance.
  /// @param _router The Pancakeswap router smart contract.
  function initialize(IPancakeRouter02 _router, IWNativeRelayer _wNativeRelayer) external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
    factory = IPancakeFactory(_router.factory());
    router = _router;
    wbnb = _router.WETH();
    wNativeRelayer = _wNativeRelayer;
  }

  /// @dev Execute worker strategy. take farmingToken, return farmingToken + basetoken that is enough to repay the debt
  /// @param data Extra calldata information passed along to this strategy.
  function execute(address user, uint256 /*debt*/, bytes calldata data)
    external
    override
    onlyWhitelistedWorkers
    nonReentrant
  {
    // 1. minFarmingTokenAmount for validating a farmingToken amount after leaving the stake.
    (
      uint256 minFarmingTokenAmount,
      uint256 farmingTokenToLiquidate,
      uint256 toRepaidBaseTokenDebt
    ) = abi.decode(data, (uint256, uint256, uint256));
    IWorker02 worker = IWorker02(msg.sender);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    // 2. Approve router to do their stuffs
    farmingToken.safeApprove(address(router), uint256(-1));
    // 3. Swap from farming token -> base token according to worker's path
    uint256 farmingTokenBalance = farmingToken.myBalance();
    require(farmingTokenBalance >= farmingTokenToLiquidate, "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseWithdrawMinimizeTrading::execute:: insufficient farmingToken received from worker");
    uint256 farmingTokenToBeRepaidDebt = 0;
    if (toRepaidBaseTokenDebt > 0) {
        uint256[] memory farmingTokenToBeRepaidDebts = router.getAmountsIn(toRepaidBaseTokenDebt, worker.getReversedPath());
        farmingTokenToBeRepaidDebt = farmingTokenToBeRepaidDebts[0];
        require(farmingTokenToLiquidate >= farmingTokenToBeRepaidDebts[0], "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseWithdrawMinimizeTrading::execute:: not enough to pay back debt");
        router.swapTokensForExactTokens(toRepaidBaseTokenDebt, farmingTokenBalance, worker.getReversedPath(), address(this), now);
    }
    uint256 farmingTokenBalanceToBeSentToTheUser = farmingTokenToLiquidate.sub(farmingTokenToBeRepaidDebt);
    // 4. Return baseToken back to the original caller in order to repay the debt.
    baseToken.safeTransfer(msg.sender, baseToken.myBalance());
    // 5. Return the remaining farmingTokens back to the user.
    require(farmingTokenBalanceToBeSentToTheUser >= minFarmingTokenAmount, "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseWithdrawMinimizeTrading::execute:: insufficient farmingToken amount received");
    if (farmingTokenBalanceToBeSentToTheUser > 0) {
      if (farmingToken == address(wbnb)) {
        SafeToken.safeTransfer(farmingToken, address(wNativeRelayer), farmingTokenBalanceToBeSentToTheUser);
        wNativeRelayer.withdraw(farmingTokenBalanceToBeSentToTheUser);
        SafeToken.safeTransferETH(user, farmingTokenBalanceToBeSentToTheUser);
      } else {
        SafeToken.safeTransfer(farmingToken, user, farmingTokenBalanceToBeSentToTheUser);
      }
    }
    // 6. Reset approval for safety reason
    farmingToken.safeApprove(address(router), 0);
    uint256 lpTokenToLiquidate = 0;
    emit PancakeswapV2RestrictedSingleAssetStrategyPartialCloseWithdrawMinimizeTradingEvent(
      baseToken,
      farmingToken,
      lpTokenToLiquidate,
      toRepaidBaseTokenDebt
    );
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < workers.length; idx++) {
      okWorkers[workers[idx]] = isOk;
    }
  }

  receive() external payable {}
}
