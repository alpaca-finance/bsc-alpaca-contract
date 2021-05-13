pragma solidity 0.6.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakeFactory.sol";
import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakePair.sol";

import "../interfaces/IWorker.sol";
import "../apis/pancake/IPancakeRouter02.sol";
import "../interfaces/IWorkerConfig.sol";
import "../PriceOracle.sol";
import "../../utils/SafeToken.sol";

contract WorkerConfig is OwnableUpgradeSafe, IWorkerConfig {
  using SafeToken for address;
  using SafeMath for uint256;

  struct Config {
    bool acceptDebt;
    uint64 workFactor;
    uint64 killFactor;
    uint64 maxPriceDiff;
  }

  PriceOracle public oracle;
  IPancakeFactory public factory;
  IPancakeRouter02 public router;
  address public wNative;
  mapping (address => Config) public workers;

  function initialize(PriceOracle _oracle, IPancakeRouter02 _router) external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    oracle = _oracle;
    router = _router;
    factory = IPancakeFactory(_router.factory());
    wNative = _router.WETH();
  }

  /// @dev Set oracle address. Must be called by owner.
  function setOracle(PriceOracle _oracle) external onlyOwner {
    oracle = _oracle;
  }

  /// @dev Set worker configurations. Must be called by owner.
  function setConfigs(address[] calldata addrs, Config[] calldata configs) external onlyOwner {
    uint256 len = addrs.length;
    require(configs.length == len, "CakeMaxiWorkerConfig::setConfigs:: bad len");
    for (uint256 idx = 0; idx < len; idx++) {
      workers[addrs[idx]] = Config({
        acceptDebt: configs[idx].acceptDebt,
        workFactor: configs[idx].workFactor,
        killFactor: configs[idx].killFactor,
        maxPriceDiff: configs[idx].maxPriceDiff
      });
    }
  }

  /// @dev Return whether the given worker is stable, presumably not under manipulation.
  function isStable(address _worker) public view returns (bool) {
    IWorker worker = IWorker(_worker);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    address[] memory path;
    if (baseToken == wNative) {
      path = new address[](2);
      path[0] = address(farmingToken);
      path[1] = address(wNative);
    } else if (farmingToken == wNative) {
      path = new address[](2);
      path[0] = address(wNative);
      path[1] = address(baseToken);
    } else {
      path = new address[](3);
      path[0] = address(farmingToken);
      path[1] = address(wNative);
      path[2] = address(baseToken);
    }
    // @notice loop over the path for validating the price of each pair
    IPancakePair currentLP;
    uint256 maxPriceDiff = workers[_worker].maxPriceDiff;
    for(uint256 i = 1; i < path.length; i++) {
        // 1. Get the position's LP balance and LP total supply.
        currentLP = IPancakePair(factory.getPair(path[i-1], path[i]));
        address token0 = currentLP.token0();
        address token1 = currentLP.token1();
        // 2. Check that reserves and balances are consistent (within 1%)
        (uint256 r0, uint256 r1,) = currentLP.getReserves();
        uint256 t0bal = token0.balanceOf(address(currentLP));
        uint256 t1bal = token1.balanceOf(address(currentLP));
        require(t0bal.mul(100) <= r0.mul(101), "CakeMaxiWorkerConfig::isStable:: bad t0 balance");
        require(t1bal.mul(100) <= r1.mul(101), "CakeMaxiWorkerConfig::isStable:: bad t1 balance");
        // 3. Check that price is in the acceptable range
        (uint256 price, uint256 lastUpdate) = oracle.getPrice(token0, token1);
        require(lastUpdate >= now - 7 days, "CakeMaxiWorkerConfig::isStable:: price too stale");
        uint256 lpPrice = r1.mul(1e18).div(r0);
        require(lpPrice <= price.mul(maxPriceDiff).div(10000), "CakeMaxiWorkerConfig::isStable:: price too high");
        require(lpPrice >= price.mul(10000).div(maxPriceDiff), "CakeMaxiWorkerConfig::isStable:: price too low");
    }
    return true;
  }

  /// @dev Return whether the given worker accepts more debt.
  function acceptDebt(address worker) external override view returns (bool) {
    require(isStable(worker), "CakeMaxiWorkerConfig::acceptDebt:: !stable");
    return workers[worker].acceptDebt;
  }

  /// @dev Return the work factor for the worker + BaseToken debt, using 1e4 as denom.
  function workFactor(address worker, uint256 /* debt */) external override view returns (uint256) {
    require(isStable(worker), "CakeMaxiWorkerConfig::workFactor:: !stable");
    return uint256(workers[worker].workFactor);
  }

  /// @dev Return the kill factor for the worker + BaseToken debt, using 1e4 as denom.
  function killFactor(address worker, uint256 /* debt */) external override view returns (uint256) {
    require(isStable(worker), "CakeMaxiWorkerConfig::killFactor:: !stable");
    return uint256(workers[worker].killFactor);
  }
}