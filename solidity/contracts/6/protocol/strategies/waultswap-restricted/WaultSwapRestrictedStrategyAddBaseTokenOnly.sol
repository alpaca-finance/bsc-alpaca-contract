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
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";

import "../../apis/wault/IWaultSwapFactory.sol";
import "../../interfaces/IPancakePair.sol";

import "../../apis/wault/IWaultSwapRouter02.sol";
import "../../interfaces/IStrategy.sol";
import "../../../utils/SafeToken.sol";
import "../../../utils/AlpacaMath.sol";
import "../../interfaces/IWorker.sol";

contract WaultSwapRestrictedStrategyAddBaseTokenOnly is OwnableUpgradeSafe, ReentrancyGuardUpgradeSafe, IStrategy {
  using SafeToken for address;
  using SafeMath for uint256;

  IWaultSwapFactory public factory;
  IWaultSwapRouter02 public router;
  mapping(address => bool) public okWorkers;

  /// @notice require that only allowed workers are able to do the rest of the method call
  modifier onlyWhitelistedWorkers() {
    require(okWorkers[msg.sender], "WaultSwapRestrictedStrategyAddBaseTokenOnly::onlyWhitelistedWorkers:: bad worker");
    _;
  }

  /// @dev Create a new add Token only strategy instance.
  /// @param _router The WaultSwap Router smart contract.
  function initialize(IWaultSwapRouter02 _router) external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
    factory = IWaultSwapFactory(_router.factory());
    router = _router;
  }

  /// @notice This function is written base on fee=988, feeDenom=1000
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
    // 2. Approve router to do their stuffs
    baseToken.safeApprove(address(router), uint256(-1));
    farmingToken.safeApprove(address(router), uint256(-1));
    // 3. Compute the optimal amount of baseToken to be converted to farmingToken.
    uint256 balance = baseToken.myBalance();
    (uint256 r0, uint256 r1, ) = lpToken.getReserves();
    uint256 rIn = lpToken.token0() == baseToken ? r0 : r1;
    // find how many baseToken need to be converted to farmingToken
    // Constants come from
    // 2-f = 2-0.002 = 1.998
    // 4(1-f) = 4*998*1000 = 3992000, where f = 0.0020 and 1,000 is a way to avoid floating point
    // 1998^2 = 3992004
    // 998*2 = 1996
    uint256 aIn = AlpacaMath.sqrt(rIn.mul(balance.mul(3992000).add(rIn.mul(3992004)))).sub(rIn.mul(1998)) / 1996;
    // 4. Convert that portion of baseToken to farmingToken.
    address[] memory path = new address[](2);
    path[0] = baseToken;
    path[1] = farmingToken;
    router.swapExactTokensForTokens(aIn, 0, path, address(this), now);
    // 5. Mint more LP tokens and return all LP tokens to the sender.
    (, , uint256 moreLPAmount) = router.addLiquidity(
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
      "WaultSwapRestrictedStrategyAddBaseTokenOnly::execute:: insufficient LP tokens received"
    );
    require(
      lpToken.transfer(msg.sender, lpToken.balanceOf(address(this))),
      "WaultSwapRestrictedStrategyAddBaseTokenOnly::execute:: failed to transfer LP token to msg.sender"
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
}
