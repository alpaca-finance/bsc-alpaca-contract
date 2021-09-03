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
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakePair.sol";

import "../../apis/mdex/IMdexFactory.sol";
import "../../apis/mdex/IMdexRouter.sol";
import "../../interfaces/IStrategy.sol";
import "../../interfaces/IWETH.sol";
import "../../interfaces/IWNativeRelayer.sol";
import "../../../utils/SafeToken.sol";
import "../../interfaces/IWorker.sol";
import "../../apis/mdex/SwapMining.sol";

contract MdexRestrictedStrategyWithdrawMinimizeTrading is OwnableUpgradeSafe, ReentrancyGuardUpgradeSafe, IStrategy {
  using SafeToken for address;
  using SafeMath for uint256;

  IMdexFactory public factory;
  IMdexRouter public router;
  IWETH public wbnb;
  IWNativeRelayer public wNativeRelayer;
  address public mdx;

  mapping(address => bool) public okWorkers;

  /// @notice require that only allowed workers are able to do the rest of the method call
  modifier onlyWhitelistedWorkers() {
    require(
      okWorkers[msg.sender],
      "MdexRestrictedStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker"
    );
    _;
  }

  /// @dev Create a new withdraw minimize trading strategy instance.
  /// @param _router The Mdex Router smart contract.
  /// @param _wbnb The wrapped BNB token.
  /// @param _wNativeRelayer The relayer to support native transfer
  /// @param _mdx The address of mdex token.
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
    IWorker worker = IWorker(msg.sender);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    IPancakePair lpToken = IPancakePair(factory.getPair(farmingToken, baseToken));
    // 2. Approve router to do their stuffs
    require(
      lpToken.approve(address(router), uint256(-1)),
      "MdexRestrictedStrategyWithdrawMinimizeTrading::execute:: failed to approve LP token"
    );
    farmingToken.safeApprove(address(router), uint256(-1));
    // 3. Remove all liquidity back to BaseToken and farming tokens.
    router.removeLiquidity(baseToken, farmingToken, lpToken.balanceOf(address(this)), 0, 0, address(this), now);
    // 4. Convert farming tokens to BaseToken.
    address[] memory path = new address[](2);
    path[0] = farmingToken;
    path[1] = baseToken;
    uint256 balance = baseToken.myBalance();
    if (debt > balance) {
      // Convert some farming tokens to BaseToken.
      uint256 remainingDebt = debt.sub(balance);
      router.swapTokensForExactTokens(remainingDebt, farmingToken.myBalance(), path, address(this), now);
    }
    // 5. Return BaseToken back to the original caller.
    uint256 remainingBalance = baseToken.myBalance();
    baseToken.safeTransfer(msg.sender, remainingBalance);
    // 6. Return remaining farming tokens to user.
    uint256 remainingFarmingToken = farmingToken.myBalance();
    require(
      remainingFarmingToken >= minFarmingToken,
      "MdexRestrictedStrategyWithdrawMinimizeTrading::execute:: insufficient farming tokens received"
    );
    if (remainingFarmingToken > 0) {
      if (farmingToken == address(wbnb)) {
        SafeToken.safeTransfer(farmingToken, address(wNativeRelayer), remainingFarmingToken);
        wNativeRelayer.withdraw(remainingFarmingToken);
        SafeToken.safeTransferETH(user, remainingFarmingToken);
      } else {
        SafeToken.safeTransfer(farmingToken, user, remainingFarmingToken);
      }
    }
    // 7. Reset approval for safety reason
    require(
      lpToken.approve(address(router), 0),
      "MdexRestrictedStrategyWithdrawMinimizeTrading::execute:: unable to reset lp token approval"
    );
    farmingToken.safeApprove(address(router), 0);
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < workers.length; idx++) {
      okWorkers[workers[idx]] = isOk;
    }
  }

  /// @dev Withdraw trading all reward.
  /// @param to The address to transfer trading reward to.
  function withdrawTradingRewards(address to) external onlyOwner {
    SwapMining(router.swapMining()).takerWithdraw();
    SafeToken.safeTransfer(mdx, to, SafeToken.myBalance(mdx));
  }

  receive() external payable {}
}
