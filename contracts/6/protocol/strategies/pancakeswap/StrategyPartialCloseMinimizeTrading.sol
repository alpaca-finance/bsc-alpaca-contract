pragma solidity 0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/Math.sol";

import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakeFactory.sol";
import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakePair.sol";

import "../../apis/pancake/IPancakeRouter02.sol";
import "../../interfaces/IStrategy.sol";
import "../../interfaces/IWETH.sol";
import "../../interfaces/IWNativeRelayer.sol";
import "../../../utils/SafeToken.sol";

import "hardhat/console.sol";

contract StrategyPartialMinimizeTrading is ReentrancyGuardUpgradeSafe, IStrategy {
  using SafeMath for uint256;
  using SafeToken for address;

  IPancakeFactory public factory;
  IPancakeRouter02 public router;
  IWETH public wbnb;
  IWNativeRelayer public wNativeRelayer;

  /// @dev Create a new liquidate strategy instance.
  /// @param _router The Uniswap router smart contract.
  function initialize(IPancakeRouter02 _router, IWETH _wbnb, IWNativeRelayer _wNativeRelayer) public initializer {
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();

    factory = IPancakeFactory(_router.factory());
    router = _router;
    wbnb = _wbnb;
    wNativeRelayer = _wNativeRelayer;
  }

  /// @dev Execute worker strategy. Take LP token. Return  BaseToken.
  /// @param data Extra calldata information passed along to this strategy.
  function execute(address user, uint256 debt, bytes calldata data)
    external
    override
    payable
    nonReentrant
  {
    // 1. Find out what farming token we are dealing with.
    (
      address baseToken,
      address farmingToken,
      uint256 returnLpToken,
      uint256 maxReturn,
      uint256 minFarmingToken
    ) = abi.decode(data, (address, address, uint256, uint256, uint256));
    console.log("wbnb: ", address(wbnb));
    console.log("wnative: ", address(wNativeRelayer));
    IPancakePair lpToken = IPancakePair(factory.getPair(farmingToken, baseToken));
    require(lpToken.balanceOf(address(this)) >= returnLpToken, "StrategyPartialCloseMinimizeTrading::execute:: insufficient LP amount recevied from worker");
    // 2. Approve router to do their stuffs
    lpToken.approve(address(router), uint256(-1));
    farmingToken.safeApprove(address(router), uint256(-1));
    // 3. Remove some LP back to BaseToken and farming tokens as we want to return some of the position.
    router.removeLiquidity(baseToken, farmingToken, returnLpToken, 0, 0, address(this), now);
    // 4. Convert farming tokens to baseToken.
    address[] memory path = new address[](2);
    path[0] = farmingToken;
    path[1] = baseToken;
    uint256 lessDebt = Math.min(debt, maxReturn);
    if (lessDebt > baseToken.myBalance()) {
      // Convert farmingToken to baseToken that is enough for maxReturn
      uint256 remainingReturnAmount = lessDebt.sub(baseToken.myBalance());
      console.log("debt: ", debt);
      console.log("remainingReturnAmount: ", remainingReturnAmount);
      console.log("farmingToken: ", farmingToken.myBalance());
      router.swapTokensForExactTokens(remainingReturnAmount, farmingToken.myBalance(), path, address(this), now);
    }
    // 5. Return BaseToken back to the original caller.
    uint256 remainingBalance = baseToken.myBalance();
    baseToken.safeTransfer(msg.sender, remainingBalance);
    // 6. Return remaining farming tokens to user.
    uint256 remainingFarmingToken = farmingToken.myBalance();
    require(remainingFarmingToken >= minFarmingToken, "StrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received");
    if (remainingFarmingToken > 0) {
      if (farmingToken == address(wbnb)) {
        console.log("remainingFarmingToken: ", remainingFarmingToken);
        SafeToken.safeTransfer(farmingToken, address(wNativeRelayer), remainingFarmingToken);
        wNativeRelayer.withdraw(remainingFarmingToken);
        SafeToken.safeTransferETH(user, remainingFarmingToken);
      } else {
        SafeToken.safeTransfer(farmingToken, user, remainingFarmingToken);
      }
    }
    // 7. Return leftover lp back to the caller
    lpToken.transfer(msg.sender, lpToken.balanceOf(address(this)));
    // 8. Reset approval for safety reason
    lpToken.approve(address(router), 0);
    farmingToken.safeApprove(address(router), 0);
  }

  receive() external payable {}
}
