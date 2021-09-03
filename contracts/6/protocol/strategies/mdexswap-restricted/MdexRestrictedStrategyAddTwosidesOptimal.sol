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

import "../../apis/mdex/IMdexFactory.sol";
import "../../apis/mdex/IMdexRouter.sol";
import "../../interfaces/IStrategy.sol";
import "../../interfaces/IVault.sol";
import "../../../utils/SafeToken.sol";
import "../../../utils/AlpacaMath.sol";
import "../../interfaces/IWorker.sol";
import "../../apis/mdex/SwapMining.sol";

import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakePair.sol";

import "hardhat/console.sol";

contract MdexRestrictedStrategyAddTwoSidesOptimal is OwnableUpgradeSafe, ReentrancyGuardUpgradeSafe, IStrategy {
  using SafeToken for address;
  using SafeMath for uint256;

  IMdexFactory public factory;
  IMdexRouter public router;
  IVault public vault;
  address public mdx;

  mapping(address => bool) public okWorkers;

  /// @notice require that only allowed workers are able to do the rest of the method call
  modifier onlyWhitelistedWorkers() {
    require(okWorkers[msg.sender], "MdexRestrictedStrategyAddTwoSidesOptimal::onlyWhitelistedWorkers:: bad worker");
    _;
  }

  /// @dev Create a new add two-side optimal strategy instance.
  /// @param _router The Mdex Router smart contract.
  /// @param _vault The vault contract to request fund.
  /// @param _mdx The address of mdex token.
  function initialize(
    IMdexRouter _router,
    IVault _vault,
    address _mdx
  ) external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
    factory = IMdexFactory(_router.factory());
    router = _router;
    vault = _vault;
    mdx = _mdx;
  }

  /// @dev Compute optimal deposit amount
  /// @param amtA amount of token A desired to deposit
  /// @param amtB amonut of token B desired to deposit
  /// @param resA amount of token A in reserve
  /// @param resB amount of token B in reserve
  function optimalDeposit(
    uint256 amtA,
    uint256 amtB,
    uint256 resA,
    uint256 resB,
    uint256 fee
  ) internal pure returns (uint256 swapAmt, bool isReversed) {
    if (amtA.mul(resB) >= amtB.mul(resA)) {
      swapAmt = _optimalDepositA(amtA, amtB, resA, resB, fee);
      isReversed = false;
    } else {
      swapAmt = _optimalDepositA(amtB, amtA, resB, resA, fee);
      isReversed = true;
    }
  }

  /// @dev Compute optimal deposit amount helper
  /// @param amtA amount of token A desired to deposit
  /// @param amtB amonut of token B desired to deposit
  /// @param resA amount of token A in reserve
  /// @param resB amount of token B in reserve
  function _optimalDepositA(
    uint256 amtA,
    uint256 amtB,
    uint256 resA,
    uint256 resB,
    uint256 fee
  ) internal pure returns (uint256) {
    require(amtA.mul(resB) >= amtB.mul(resA), "Reversed");

    uint256 a = uint256(10000).sub(fee);
    uint256 b = uint256(20000).sub(fee).mul(resA);
    uint256 _c = (amtA.mul(resB)).sub(amtB.mul(resA));
    uint256 c = _c.mul(10000).div(amtB.add(resB)).mul(resA);

    uint256 d = a.mul(c).mul(4);
    uint256 e = AlpacaMath.sqrt(b.mul(b).add(d));

    uint256 numerator = e.sub(b);
    uint256 denominator = a.mul(2);

    return numerator.div(denominator);
  }

  /// @dev Execute worker strategy. Take BaseToken + FarmingToken. Return LP tokens.
  /// @param data Extra calldata information passed along to this strategy.
  function execute(
    address, /* user */
    uint256,
    /* debt */
    bytes calldata data
  ) external override onlyWhitelistedWorkers nonReentrant {
    console.log("MdexRestrictedStrategyAddTwoSidesOptimal:execute");
    // 1. Find out what farming token we are dealing with.
    (uint256 farmingTokenAmount, uint256 minLPAmount) = abi.decode(data, (uint256, uint256));
    IWorker worker = IWorker(msg.sender);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    IPancakePair lpToken = IPancakePair(factory.getPair(farmingToken, baseToken));

    uint256 fee = factory.getPairFees(address(lpToken));
    console.log("MdexRestrictedStrategyAddTwoSidesOptimal:execute:fee", fee);
    // 2. Approve router to do their stuffs
    baseToken.safeApprove(address(router), uint256(-1));
    farmingToken.safeApprove(address(router), uint256(-1));
    // 3. Compute the optimal amount of BaseToken and FarmingToken to be converted.
    vault.requestFunds(farmingToken, farmingTokenAmount);
    uint256 baseTokenBalance = baseToken.myBalance();
    uint256 swapAmt;
    bool isReversed;
    {
      (uint256 r0, uint256 r1, ) = lpToken.getReserves();
      (uint256 baseTokenReserve, uint256 farmingTokenReserve) = lpToken.token0() == baseToken ? (r0, r1) : (r1, r0);
      (swapAmt, isReversed) = optimalDeposit(
        baseTokenBalance,
        farmingToken.myBalance(),
        baseTokenReserve,
        farmingTokenReserve,
        fee
      );
    }

    console.log("MdexRestrictedStrategyAddTwoSidesOptimal:execute:Before step 4");
    // 4. Convert between BaseToken and farming tokens
    address[] memory path = new address[](2);
    (path[0], path[1]) = isReversed ? (farmingToken, baseToken) : (baseToken, farmingToken);
    // 5. Swap according to path
    if (swapAmt > 0) router.swapExactTokensForTokens(swapAmt, 0, path, address(this), now);
    console.log("MdexRestrictedStrategyAddTwoSidesOptimal:execute: after swap");
    // 6. Mint more LP tokens and return all LP tokens to the sender.
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
      "MdexRestrictedStrategyAddTwoSidesOptimal::execute:: insufficient LP tokens received"
    );
    require(
      lpToken.transfer(msg.sender, lpToken.balanceOf(address(this))),
      "MdexRestrictedStrategyAddTwoSidesOptimal::execute:: failed to transfer LP token to msg.sender"
    );
    // 7. Reset approve to 0 for safety reason
    farmingToken.safeApprove(address(router), 0);
    baseToken.safeApprove(address(router), 0);
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < workers.length; idx++) {
      okWorkers[workers[idx]] = isOk;
    }
  }

  /// @dev Withdraw trading all reward.
  /// @param to The address to transfer trading reward to.
  function withdrawTradingRewards(address to) external onlyOwner {
    console.log("MdexRestrictedStrategyAddTwoSidesOptimal:withdrawTradingRewards");
    console.log("MdexRestrictedStrategyAddTwoSidesOptimal:router.swapMining()", router.swapMining());
    SwapMining(router.swapMining()).takerWithdraw();
    console.log("MdexRestrictedStrategyAddTwoSidesOptimal:after takeReward");
    SafeToken.safeTransfer(mdx, to, SafeToken.myBalance(mdx));
  }
}
