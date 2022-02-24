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

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/Math.sol";

import "../../apis/pancake/IPancakeRouter02.sol";
import "../../interfaces/IPancakeFactory.sol";

import "../../interfaces/IStrategy.sol";
import "../../interfaces/IVault.sol";
import "../../interfaces/IWorker02.sol";

import "../../../utils/SafeToken.sol";

contract PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate is
  OwnableUpgradeSafe,
  ReentrancyGuardUpgradeSafe,
  IStrategy
{
  using SafeToken for address;
  using SafeMath for uint256;

  IPancakeFactory public factory;
  IPancakeRouter02 public router;
  address public wNative;
  mapping(address => bool) public okWorkers;

  event PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidateEvent(
    address indexed baseToken,
    address indexed farmToken,
    uint256 amounToLiquidate,
    uint256 amountToRepayDebt
  );

  /// @notice require that only allowed workers are able to do the rest of the method call
  modifier onlyWhitelistedWorkers() {
    require(
      okWorkers[msg.sender],
      "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate::onlyWhitelistedWorkers:: bad worker"
    );
    _;
  }

  /// @dev Create a new add Token only strategy instance.
  /// @param _router The Pancakeswap router smart contract.
  function initialize(IPancakeRouter02 _router) external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
    factory = IPancakeFactory(_router.factory());
    router = _router;
    wNative = _router.WETH();
  }

  /// @dev Execute worker strategy. take farmingToken return Basetoken
  /// @param data Extra calldata information passed along to this strategy.
  function execute(
    address, /* user */
    uint256 debt,
    bytes calldata data
  ) external override onlyWhitelistedWorkers nonReentrant {
    // 1. Decode variables from extra data & load required variables.
    // - maxFarmingTokenToLiquidate - maximum farmingToken amount that user want to liquidate.
    // - maxDebtRepayment -> maximum BTOKEN amount that user want to repaid debt.
    // - minBaseTokenAmount - minimum baseToken amount that user want to receive.
    (uint256 maxFarmingTokenToLiquidate, uint256 maxDebtRepayment, uint256 minBaseTokenAmount) = abi.decode(
      data,
      (uint256, uint256, uint256)
    );
    IWorker02 worker = IWorker02(msg.sender);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    uint256 farmingTokenToLiquidate = Math.min(farmingToken.myBalance(), maxFarmingTokenToLiquidate);
    uint256 lessDebt = Math.min(debt, maxDebtRepayment);
    // 2. Approve router to do their stuffs.
    farmingToken.safeApprove(address(router), uint256(-1));
    // 3. Convert some farmingTokens back to a baseTokens.
    uint256 baseTokenBefore = baseToken.myBalance();
    router.swapExactTokensForTokens(farmingTokenToLiquidate, 0, worker.getReversedPath(), address(this), now);
    uint256 baseTokenAfter = baseToken.myBalance();
    // 4. Transfer all baseTokens (as a result of a conversion) back to the calling worker.
    require(
      baseTokenAfter.sub(baseTokenBefore).sub(lessDebt) >= minBaseTokenAmount,
      "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate::execute:: insufficient baseToken amount received"
    );
    baseToken.safeTransfer(msg.sender, baseTokenAfter);
    // 5. transfer remaining farmingTokens back to worker.
    farmingToken.safeTransfer(msg.sender, farmingToken.myBalance());
    // 6. Reset approval for safety reason.
    farmingToken.safeApprove(address(router), 0);

    emit PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidateEvent(
      baseToken,
      farmingToken,
      farmingTokenToLiquidate,
      lessDebt
    );
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < workers.length; idx++) {
      okWorkers[workers[idx]] = isOk;
    }
  }
}
