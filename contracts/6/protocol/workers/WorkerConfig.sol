pragma solidity 0.6.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

import "../interfaces/IWorker.sol";
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
  mapping (address => Config) public workers;

  function initialize(PriceOracle _oracle) public initializer {
    OwnableUpgradeSafe.__Ownable_init();
    oracle = _oracle;
  }

  /// @dev Set oracle address. Must be called by owner.
  function setOracle(PriceOracle _oracle) external onlyOwner {
    oracle = _oracle;
  }

  /// @dev Set worker configurations. Must be called by owner.
  function setConfigs(address[] calldata addrs, Config[] calldata configs) external onlyOwner {
    uint256 len = addrs.length;
    require(configs.length == len, "WorkConfig::setConfigs:: bad len");
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
  function isStable(address worker) public view returns (bool) {
    IPancakePair lp = IWorker(worker).lpToken();
    address token0 = lp.token0();
    address token1 = lp.token1();
    // 1. Check that reserves and balances are consistent (within 1%)
    (uint256 r0, uint256 r1,) = lp.getReserves();
    uint256 t0bal = token0.balanceOf(address(lp));
    uint256 t1bal = token1.balanceOf(address(lp));
    require(t0bal.mul(100) <= r0.mul(101), "WorkerConfig::setConfigs:: bad t0 balance");
    require(t1bal.mul(100) <= r1.mul(101), "WorkerConfig::setConfigs:: bad t1 balance");
    // 2. Check that price is in the acceptable range
    (uint256 price, uint256 lastUpdate) = oracle.getPrice(token0, token1);
    require(lastUpdate >= now - 7 days, "WorkerConfig::setConfigs:: price too stale");
    uint256 lpPrice = r1.mul(1e18).div(r0);
    uint256 maxPriceDiff = workers[worker].maxPriceDiff;
    require(lpPrice <= price.mul(maxPriceDiff).div(10000), "WorkerConfig::setConfigs:: price too high");
    require(lpPrice >= price.mul(10000).div(maxPriceDiff), "WorkerConfig::setConfigs:: price too low");
    // 3. Done
    return true;
  }

  /// @dev Return whether the given worker accepts more debt.
  function acceptDebt(address worker) external override view returns (bool) {
    require(isStable(worker), "WorkerConfig::acceptDebt:: !stable");
    return workers[worker].acceptDebt;
  }

  /// @dev Return the work factor for the worker + BaseToken debt, using 1e4 as denom.
  function workFactor(address worker, uint256 /* debt */) external override view returns (uint256) {
    require(isStable(worker), "WorkerConfig::workFactor:: !stable");
    return uint256(workers[worker].workFactor);
  }

  /// @dev Return the kill factor for the worker + BaseToken debt, using 1e4 as denom.
  function killFactor(address worker, uint256 /* debt */) external override view returns (uint256) {
    require(isStable(worker), "WorkerConfig::killFactor:: !stable");
    return uint256(workers[worker].killFactor);
  }
}