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

import "../../interfaces/IStrategy.sol";
import "../../../utils/SafeToken.sol";
import "../../../utils/AlpacaMath.sol";
import "../../interfaces/IWorker.sol";
import "../../apis/mdex/IMdexRouter.sol";
import "../../apis/mdex/IMdexFactory.sol";
import "../../apis/mdex/SwapMining.sol";

contract MdexRestrictedStrategyAddBaseTokenOnly is OwnableUpgradeSafe, ReentrancyGuardUpgradeSafe, IStrategy {
  using SafeToken for address;
  using SafeMath for uint256;

  IMdexFactory public factory;
  IMdexRouter public router;
  mapping(address => bool) public okWorkers;
  address public mdx;

  /// @notice require that only allowed workers are able to do the rest of the method call
  modifier onlyWhitelistedWorkers() {
    require(okWorkers[msg.sender], "MdexRestrictedStrategyAddBaseTokenOnly::onlyWhitelistedWorkers:: bad worker");
    _;
  }

  /// @dev Create a new add Token only strategy instance.
  /// @param _router The WaultSwap Router smart contract.
  function initialize(IMdexRouter _router, address _mdx) external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
    factory = IMdexFactory(_router.factory());
    router = _router;
    mdx = _mdx;
  }

  /// @dev Execute worker strategy. Take BaseToken. Return LP tokens.
  /// @param data Extra calldata information passed along to this strategy.
  function execute(
    address, /* user */
    uint256, /* debt */
    bytes calldata data
  ) external override onlyWhitelistedWorkers nonReentrant {
    // 1. Find out what farming token we are dealing with and min additional LP tokens.
    uint256 minLPAmount = abi.decode(data, (uint256));
    IWorker worker = IWorker(msg.sender);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    IPancakePair lpToken = IPancakePair(factory.getPair(farmingToken, baseToken));
    // get trading fee of each pairs
    uint256 fee = factory.getPairFees(address(lpToken));
    // 2. Approve router to do their stuffs
    baseToken.safeApprove(address(router), uint256(-1));
    farmingToken.safeApprove(address(router), uint256(-1));
    // 3. Compute the optimal amount of baseToken to be converted to farmingToken.
    uint256 balance = baseToken.myBalance();
    (uint256 r0, uint256 r1, ) = lpToken.getReserves();
    uint256 rIn = lpToken.token0() == baseToken ? r0 : r1;
    // find how many baseToken need to be converted to farmingToken
    uint256 aIn = _calculateAIn(fee, rIn, balance);
    // 4. Convert that portion of baseToken to farmingToken.
    address[] memory path = new address[](2);
    path[0] = baseToken;
    path[1] = farmingToken;
    router.swapExactTokensForTokens(aIn, 0, path, address(this), now);
    // 5. Mint more LP tokens and return all LP tokens to the sender.
    (, , uint256 moreLPAmount) =
      router.addLiquidity(
        baseToken,
        farmingToken,
        baseToken.myBalance(),
        farmingToken.myBalance(),
        0,
        0,
        address(this),
        now
      );
    require(
      moreLPAmount >= minLPAmount,
      "MdexRestrictedStrategyAddBaseTokenOnly::execute:: insufficient LP tokens received"
    );
    require(
      lpToken.transfer(msg.sender, lpToken.balanceOf(address(this))),
      "MdexRestrictedStrategyAddBaseTokenOnly::execute:: failed to transfer LP token to msg.sender"
    );
    // 6. Reset approval for safety reason
    baseToken.safeApprove(address(router), 0);
    farmingToken.safeApprove(address(router), 0);
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < workers.length; idx++) {
      okWorkers[workers[idx]] = isOk;
    }
  }

  /// @dev Formular for calculating optimal swap come from UniSwapV2
  function _calculateAIn(
    uint256 fee,
    uint256 rIn,
    uint256 balance
  ) internal pure returns (uint256) {
    uint256 feeDenom = 10000;
    uint256 feeConstantA = feeDenom.mul(2).sub(fee);
    uint256 feeConstantB = feeDenom.mul(4).mul(feeDenom.sub(fee));
    uint256 feeConstantC = feeConstantA**2;
    uint256 nominator =
      AlpacaMath.sqrt(rIn.mul(balance.mul(feeConstantB).add(rIn.mul(feeConstantC)))).sub(rIn.mul(feeConstantA));
    return nominator / feeConstantB.mul(2);
  }

  /// @dev Withdraw trading all reward.
  /// @param to The address to transfer trading reward to.
  function withdrawTradingRewards(address to) external onlyOwner {
    SwapMining(router.swapMining()).takerWithdraw();
    SafeToken.safeTransfer(mdx, to, SafeToken.myBalance(mdx));
  }
}
