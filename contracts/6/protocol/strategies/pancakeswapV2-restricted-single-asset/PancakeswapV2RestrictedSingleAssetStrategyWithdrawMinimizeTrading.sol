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

import "../../interfaces/IPancakeFactory.sol";
import "../../interfaces/IPancakePair.sol";

import "../../apis/pancake/IPancakeRouter02.sol";
import "../../interfaces/IStrategy.sol";
import "../../../utils/SafeToken.sol";
import "../../../utils/AlpacaMath.sol";
import "../../interfaces/IWorker02.sol";
import "../../interfaces/IWNativeRelayer.sol";

contract PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading is
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
  IWNativeRelayer public wNativeRelayer;

  /// @notice require that only allowed workers are able to do the rest of the method call
  modifier onlyWhitelistedWorkers() {
    require(
      okWorkers[msg.sender],
      "PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker"
    );
    _;
  }

  /// @dev Create a new add Token only strategy instance.
  /// @param _router The Pancakeswap router smart contract.
  function initialize(IPancakeRouter02 _router, IWNativeRelayer _wNativeRelayer) external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
    factory = IPancakeFactory(_router.factory());
    router = _router;
    wNative = _router.WETH();
    wNativeRelayer = _wNativeRelayer;
  }

  /// @dev Execute worker strategy. take farmingToken, return farmingToken + basetoken that is enough to repay the debt
  /// @param data Extra calldata information passed along to this strategy.
  function execute(
    address user,
    uint256 debt,
    bytes calldata data
  ) external override onlyWhitelistedWorkers nonReentrant {
    // 1. minFarmingTokenAmount for validating a farmingToken amount after leaving the stake.
    uint256 minFarmingTokenAmount = abi.decode(data, (uint256));
    IWorker02 worker = IWorker02(msg.sender);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    // 2. Approve router to do their stuffs
    farmingToken.safeApprove(address(router), uint256(-1));
    // 3. Swap from farming token -> base token according to worker's path
    if (debt > 0) {
      uint256[] memory amts = new uint256[](2);
      amts = router.swapTokensForExactTokens(
        debt,
        farmingToken.myBalance(),
        worker.getReversedPath(),
        address(this),
        now
      );
    }
    // 4. Return baseToken back to the original caller in order to repay the debt.
    baseToken.safeTransfer(msg.sender, baseToken.myBalance());
    // 5. Return the remaining farmingTokens back to the user.
    uint256 remainingFarmingToken = farmingToken.myBalance();
    require(
      remainingFarmingToken >= minFarmingTokenAmount,
      "PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading::execute:: insufficient farmingToken amount received"
    );
    if (remainingFarmingToken > 0) {
      if (farmingToken == address(wNative)) {
        SafeToken.safeTransfer(farmingToken, address(wNativeRelayer), remainingFarmingToken);
        wNativeRelayer.withdraw(remainingFarmingToken);
        SafeToken.safeTransferETH(user, remainingFarmingToken);
      } else {
        SafeToken.safeTransfer(farmingToken, user, remainingFarmingToken);
      }
    }
    // 6. Reset approval for safety reason
    farmingToken.safeApprove(address(router), 0);
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < workers.length; idx++) {
      okWorkers[workers[idx]] = isOk;
    }
  }

  receive() external payable {}
}
