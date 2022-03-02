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

import "../../interfaces/ISwapFactoryLike.sol";
import "../../interfaces/ISwapPairLike.sol";
import "../../interfaces/IBaseV1Router01.sol";
import "../../interfaces/IStrategy.sol";
import "../../interfaces/IWNativeRelayer.sol";
import "../../interfaces/IMultiRewardWorker03.sol";

import "../../../utils/SafeToken.sol";

contract SolidlyStrategyWithdrawMinimizeTrading is OwnableUpgradeable, ReentrancyGuardUpgradeable, IStrategy {
  using SafeToken for address;

  event LogSetWorkerOk(address[] indexed workers, bool isOk);

  ISwapFactoryLike public factory;
  IBaseV1Router01 public router;
  address public wftm;
  IWNativeRelayer public wNativeRelayer;

  mapping(address => bool) public okWorkers;

  /// @notice require that only allowed workers are able to do the rest of the method call
  modifier onlyWhitelistedWorkers() {
    require(okWorkers[msg.sender], "bad worker");
    _;
  }

  /// @dev Create a new withdraw minimize trading strategy instance.
  /// @param _router The Solidly Router smart contract.
  /// @param _wNativeRelayer The relayer to support native transfer
  function initialize(IBaseV1Router01 _router, IWNativeRelayer _wNativeRelayer) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
    factory = ISwapFactoryLike(_router.factory());
    router = _router;
    wftm = _router.wftm();
    wNativeRelayer = _wNativeRelayer;
  }

  /// @dev Execute worker strategy. Take LP tokens. Return FarmingToken + BaseToken.
  /// However, some BaseToken will be deducted to pay the debt
  /// @param user User address to withdraw liquidity.
  /// @param debt Debt amount in WAD of the user.
  /// @param data Extra calldata information passed along to this strategy.
  function execute(
    address user,
    uint256 debt,
    bytes calldata data
  ) external override onlyWhitelistedWorkers nonReentrant {
    // 1. Find out what farming token we are dealing with.
    uint256 minFarmingToken = abi.decode(data, (uint256));
    IMultiRewardWorker03 worker = IMultiRewardWorker03(msg.sender);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    ISwapPairLike lpToken = worker.lpToken();
    // 2. Approve router to do their stuffs
    address(lpToken).safeApprove(address(router), type(uint256).max);
    farmingToken.safeApprove(address(router), type(uint256).max);
    // 3. Remove all liquidity back to BaseToken and farming tokens.
    router.removeLiquidity(
      baseToken,
      farmingToken,
      false,
      lpToken.balanceOf(address(this)),
      0,
      0,
      address(this),
      block.timestamp
    );
    // 4. Convert farming tokens to BaseToken.
    address[] memory path = new address[](2);
    path[0] = farmingToken;
    path[1] = baseToken;
    uint256 balance = baseToken.myBalance();
    if (debt > balance) {
      // Convert some farming tokens to BaseToken.
      uint256 remainingDebt = debt - (balance);
      swapTokensForExactTokensSimple(remainingDebt, path[0], path[1]);
    }
    // 5. Return BaseToken back to the original caller.
    uint256 remainingBalance = baseToken.myBalance();
    baseToken.safeTransfer(msg.sender, remainingBalance);
    // 6. Return remaining farming tokens to user.
    uint256 remainingFarmingToken = farmingToken.myBalance();
    require(remainingFarmingToken >= minFarmingToken, "insufficient farming tokens received");
    if (remainingFarmingToken > 0) {
      if (farmingToken == address(wftm)) {
        SafeToken.safeTransfer(farmingToken, address(wNativeRelayer), remainingFarmingToken);
        wNativeRelayer.withdraw(remainingFarmingToken);
        SafeToken.safeTransferETH(user, remainingFarmingToken);
      } else {
        SafeToken.safeTransfer(farmingToken, user, remainingFarmingToken);
      }
    }
    // 7. Reset approval for safety reason
    address(lpToken).safeApprove(address(router), 0);
    farmingToken.safeApprove(address(router), 0);
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < workers.length; idx++) {
      okWorkers[workers[idx]] = isOk;
    }
    emit LogSetWorkerOk(workers, isOk);
  }

  function swapTokensForExactTokensSimple(
    uint256 amountOut,
    address tokenFrom,
    address tokenTo
  ) internal {
    (uint256 reserveIn, uint256 reserveOut) = router.getReserves(tokenFrom, tokenTo, false);
    uint256 numerator = reserveIn * amountOut * 10000;
    uint256 denominator = (reserveOut - amountOut) * 9999;
    uint256 amountIn = (numerator / denominator) + 1;
    require(amountIn <= tokenFrom.myBalance(), "insufficient farming token");
    router.swapExactTokensForTokensSimple(
      amountIn,
      amountOut,
      tokenFrom,
      tokenTo,
      false,
      address(this),
      block.timestamp
    );
  }

  receive() external payable {}
}
