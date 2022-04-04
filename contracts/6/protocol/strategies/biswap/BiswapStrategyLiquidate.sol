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

import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";

import "../../interfaces/ISwapFactoryLike.sol";
import "../../interfaces/IBiswapLiquidityPair.sol";
import "../../interfaces/ISwapRouter02Like.sol";
import "../../interfaces/IStrategy.sol";
import "../../interfaces/IWorker03.sol";

import "../../../utils/SafeToken.sol";

contract BiswapStrategyLiquidate is OwnableUpgradeSafe, ReentrancyGuardUpgradeSafe, IStrategy {
  using SafeMath for uint256;
  using SafeToken for address;

  event LogSetWorkerOk(address[] indexed workers, bool isOk);

  ISwapFactoryLike public factory;
  ISwapRouter02Like public router;

  mapping(address => bool) public okWorkers;

  /// @notice require that only allowed workers are able to do the rest of the method call
  modifier onlyWhitelistedWorkers() {
    require(okWorkers[msg.sender], "bad worker");
    _;
  }

  /// @dev Create a new liquidate strategy instance.
  /// @param _router The WaultSwap Router smart contract.
  function initialize(ISwapRouter02Like _router) external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
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
    // 1. Find out what farming token we are dealing with.
    uint256 minBaseToken = abi.decode(data, (uint256));
    IWorker03 worker = IWorker03(msg.sender);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    IBiswapLiquidityPair lpToken = IBiswapLiquidityPair(address(worker.lpToken()));
    // 2. Approve router to do their stuffs
    address(lpToken).safeApprove(address(router), uint256(-1));
    farmingToken.safeApprove(address(router), uint256(-1));
    // 3. Remove all liquidity back to BaseToken and farming tokens.
    router.removeLiquidity(baseToken, farmingToken, lpToken.balanceOf(address(this)), 0, 0, address(this), now);
    // 4. Convert farming tokens to baseToken.
    address[] memory path = new address[](2);
    path[0] = farmingToken;
    path[1] = baseToken;
    router.swapExactTokensForTokens(farmingToken.myBalance(), 0, path, address(this), now);
    // 5. Return all baseToken back to the original caller.
    uint256 balance = baseToken.myBalance();
    require(balance.sub(debt) >= minBaseToken, "insufficient baseToken received");
    SafeToken.safeTransfer(baseToken, msg.sender, balance);
    // 6. Reset approve for safety reason
    address(lpToken).safeApprove(address(router), 0);
    farmingToken.safeApprove(address(router), 0);
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < workers.length; idx++) {
      okWorkers[workers[idx]] = isOk;
    }
    emit LogSetWorkerOk(workers, isOk);
  }
}
