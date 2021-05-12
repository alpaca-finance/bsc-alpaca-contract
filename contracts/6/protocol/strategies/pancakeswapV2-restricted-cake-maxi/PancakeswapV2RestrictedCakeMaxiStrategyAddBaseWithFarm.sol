pragma solidity 0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakeFactory.sol";
import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakePair.sol";


import "../../apis/pancake/IPancakeRouter02.sol";
import "../../interfaces/IStrategy.sol";
import "../../interfaces/IVault.sol";
import "../../../utils/SafeToken.sol";
import "../../../utils/AlpacaMath.sol";
import "../../interfaces/IWorker.sol";


contract PancakeswapV2RestrictedCakeMaxiStrategyAddBaseWithFarm is OwnableUpgradeSafe, ReentrancyGuardUpgradeSafe, IStrategy {
  using SafeToken for address;
  using SafeMath for uint256;

  IPancakeFactory public factory;
  IPancakeRouter02 public router;
  address public wNative;
  mapping(address => bool) public okWorkers;
  IVault public vault;

  // @notice require that only allowed workers are able to do the rest of the method call
  modifier onlyWhitelistedWorkers() {
    require(okWorkers[msg.sender], "PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly::onlyWhitelistedWorkers:: bad worker");
    _;
  } 

  /// @dev Create a new add Token only strategy instance.
  /// @param _router The Uniswap router smart contract.
  function initialize(IPancakeRouter02 _router, IVault _vault) external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
    factory = IPancakeFactory(_router.factory());
    router = _router;
    wNative = _router.WETH();
    vault = _vault;
  }

  /// @dev Execute worker strategy. Take BaseToken. Return LP tokens.
  /// @param data Extra calldata information passed along to this strategy.
  function execute(address /* user */, uint256 /* debt */, bytes calldata data)
    external
    override
    onlyWhitelistedWorkers
    nonReentrant
  {
    // 1. Find out what farming token we are dealing with and min additional LP tokens.
    (
      uint256 inputFarmingAmount,
      uint256 minFarmingAmount
    ) = abi.decode(data, (uint256, uint256));
    IWorker worker = IWorker(msg.sender);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    IPancakePair lpToken = IPancakePair(factory.getPair(farmingToken, baseToken));
    // 2. Approve router to do their stuffs
    baseToken.safeApprove(address(router), uint256(-1));
    // 3. request a fund from the vault using inputFarmingAmount
    vault.requestFunds(farmingToken, inputFarmingAmount);
    // 4. Compute the optimal amount of baseToken to be converted to farmingToken.
    uint256 balance = baseToken.myBalance();
    (uint256 r0, uint256 r1, ) = lpToken.getReserves();
    uint256 rIn = lpToken.token0() == baseToken ? r0 : r1;
    // find how many baseToken need to be converted to farmingToken
    // Constants come from
    // 2-f = 2-0.0025 = 19975
    // 4(1-f) = 4*9975*10000 = 399000000, where f = 0.0025 and 10,000 is a way to avoid floating point
    // 19975^2 = 399000625
    // 9975*2 = 19950
    uint256 aIn = AlpacaMath.sqrt(rIn.mul(balance.mul(399000000).add(rIn.mul(399000625)))).sub(rIn.mul(19975)) / 19950;
    // 5. Convert that portion of a baseToken to a farmingToken.
    address[] memory path;
    if (baseToken == wNative) {
      path = new address[](2);
      path[0] = address(wNative);
      path[1] = address(farmingToken);
    } else {
      path = new address[](3);
      path[0] = address(baseToken);
      path[1] = address(wNative);
      path[2] = address(farmingToken);
    }
    router.swapExactTokensForTokens(aIn, 0, path, address(this), now);
    // 5. Transfer all farming token (as a result of conversion) back to the calling worker
    require(farmingToken.myBalance() >= minFarmingAmount, "PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly::execute:: insufficient farming token amount received");
    farmingToken.safeTransfer(msg.sender, farmingToken.myBalance());
    // 6. Reset approval for safety reason
    baseToken.safeApprove(address(router), 0);
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < workers.length; idx++) {
      okWorkers[workers[idx]] = isOk;
    }
  }
}
