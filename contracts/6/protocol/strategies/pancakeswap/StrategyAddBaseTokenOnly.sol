pragma solidity 0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakeFactory.sol";
import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakePair.sol";

import "../../apis/pancake/IPancakeRouter02.sol";
import "../../interfaces/IStrategy.sol";
import "../../../utils/SafeToken.sol";
import "../../../utils/AlpacaMath.sol";

contract StrategyAddBaseTokenOnly is ReentrancyGuardUpgradeSafe, IStrategy {
  using SafeToken for address;
  using SafeMath for uint256;

  address public wNative;

  IPancakeFactory public factory;
  IPancakeRouter02 public router;

  /// @dev Create a new add Token only strategy instance.
  /// @param _router The Uniswap router smart contract.
  function initialize(IPancakeRouter02 _router) public initializer {
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();

    factory = IPancakeFactory(_router.factory());
    router = _router;
  }

  /// @dev Execute worker strategy. Take BaseToken. Return LP tokens.
  /// @param data Extra calldata information passed along to this strategy.
  function execute(address /* user */, uint256 /* debt */, bytes calldata data)
    external
    override
    payable
    nonReentrant
  {
    // 1. Find out what farming token we are dealing with and min additional LP tokens.
    (
      address baseToken,
      address farmingToken,
      uint256 minLPAmount
    ) = abi.decode(data, (address, address, uint256));
    IPancakePair lpToken = IPancakePair(factory.getPair(farmingToken, baseToken));
    // 2. Approve router to do their stuffs
    farmingToken.safeApprove(address(router), uint256(-1));
    baseToken.safeApprove(address(router), uint256(-1));
    // 3. Compute the optimal amount of baseToken to be converted to farmingToken.
    uint256 balance = baseToken.myBalance();
    (uint256 r0, uint256 r1, ) = lpToken.getReserves();
    uint256 rIn = lpToken.token0() == baseToken ? r0 : r1;
    // find how many baseToken need to be converted to farmingToken
    // Constants come from
    // 4(1-f) = 4*998*1000 = 3992000, where f = 0.002 and 1,000 is a way to avoid floating point
    // 1998^2 = 3992004
    uint256 aIn = AlpacaMath.sqrt(rIn.mul(balance.mul(3992000).add(rIn.mul(3992004)))).sub(rIn.mul(1998)) / 1996;
    // 4. Convert that portion of baseToken to farmingToken.
    address[] memory path = new address[](2);
    path[0] = baseToken;
    path[1] = farmingToken;
    router.swapExactTokensForTokens(aIn, 0, path, address(this), now);
    // 5. Mint more LP tokens and return all LP tokens to the sender.
    (,, uint256 moreLPAmount) = router.addLiquidity(
      baseToken, farmingToken, baseToken.myBalance(), farmingToken.myBalance(), 0, 0, address(this), now
    );
    require(moreLPAmount >= minLPAmount, "StrategyAddBaseTokenOnly::execute:: insufficient LP tokens received");
    lpToken.transfer(msg.sender, lpToken.balanceOf(address(this)));
    // 6. Reset approval for safety reason
    baseToken.safeApprove(address(router), 0);
    farmingToken.safeApprove(address(router), 0);
  }
}
