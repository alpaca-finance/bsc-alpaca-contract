pragma solidity 0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

import "./interfaces/IVaultConfig.sol";

contract SimpleVaultConfig is IVaultConfig, OwnableUpgradeSafe {
  /// @notice Configuration for each worker.
  struct WorkerConfig {
    bool isWorker;
    bool acceptDebt;
    uint256 workFactor;
    uint256 killFactor;
  }

  /// The minimum BaseToken debt size per position.
  uint256 public override minDebtSize;
  /// The interest rate per second, multiplied by 1e18.
  uint256 public interestRate;
  /// The portion of interests allocated to the reserve pool.
  uint256 public override getReservePoolBps;
  /// The reward for successfully killing a position.
  uint256 public override getKillBps;
  /// Mapping for worker address to its configuration.
  mapping (address => WorkerConfig) public workers;
  // address for wrapped native eg WBNB, WETH
  address public wrappedNativeAddr;
  // address for wNative relater
  address public wNativeRelayer;

  // address of fairLaunch contract
  address public fairLaunch;

  function initialize(
    uint256 _minDebtSize,
    uint256 _interestRate,
    uint256 _reservePoolBps,
    uint256 _killBps,
    address _wrappedNative,
    address _wNativeRelayer,
    address _fairLaunch
  ) public initializer {
    OwnableUpgradeSafe.__Ownable_init();

    setParams(
      _minDebtSize,
      _interestRate,
      _reservePoolBps,
      _killBps,
      _wrappedNative,
      _wNativeRelayer,
      _fairLaunch);
  }

  /// @dev Set all the basic parameters. Must only be called by the owner.
  /// @param _minDebtSize The new minimum debt size value.
  /// @param _interestRate The new interest rate per second value.
  /// @param _reservePoolBps The new interests allocated to the reserve pool value.
  /// @param _killBps The new reward for killing a position value.
  function setParams(
    uint256 _minDebtSize,
    uint256 _interestRate,
    uint256 _reservePoolBps,
    uint256 _killBps,
    address _wrappedNative,
    address _wNativeRelayer,
    address _fairLaunch
  ) public onlyOwner {
    minDebtSize = _minDebtSize;
    interestRate = _interestRate;
    getReservePoolBps = _reservePoolBps;
    getKillBps = _killBps;
    wrappedNativeAddr = _wrappedNative;
    wNativeRelayer = _wNativeRelayer;
    fairLaunch = _fairLaunch;
  }

  /// @dev Set the configuration for the given worker. Must only be called by the owner.
  /// @param worker The worker address to set configuration.
  /// @param _isWorker Whether the given address is a valid worker.
  /// @param _acceptDebt Whether the worker is accepting new debts.
  /// @param _workFactor The work factor value for this worker.
  /// @param _killFactor The kill factor value for this worker.
  function setWorker(
    address worker,
    bool _isWorker,
    bool _acceptDebt,
    uint256 _workFactor,
    uint256 _killFactor
  ) public onlyOwner {
    workers[worker] = WorkerConfig({
      isWorker: _isWorker,
      acceptDebt: _acceptDebt,
      workFactor: _workFactor,
      killFactor: _killFactor
    });
  }

  /// @dev Return the interest rate per second, using 1e18 as denom.
  function getInterestRate(uint256 /* debt */, uint256 /* floating */) external view override returns (uint256) {
    return interestRate;
  }

  /// @dev Return the address of wrapped native token
  function getWrappedNativeAddr() external view override returns (address) {
    return wrappedNativeAddr;
  }

  function getWNativeRelayer() external view override returns (address) {
    return wNativeRelayer;
  }

  /// @dev Return the address of fair launch contract
  function getFairLaunchAddr() external view override returns (address) {
    return fairLaunch;
  }

  /// @dev Return whether the given address is a worker.
  function isWorker(address worker) external view override returns (bool) {
    return workers[worker].isWorker;
  }

  /// @dev Return whether the given worker accepts more debt. Revert on non-worker.
  function acceptDebt(address worker) external view override returns (bool) {
    require(workers[worker].isWorker, "SimpleVaultConfig::acceptDebt:: !worker");
    return workers[worker].acceptDebt;
  }

  /// @dev Return the work factor for the worker + BaseToken debt, using 1e4 as denom. Revert on non-worker.
  function workFactor(address worker, uint256 /* debt */) external view override returns (uint256) {
    require(workers[worker].isWorker, "SimpleVaultConfig::workFactor:: !worker");
    return workers[worker].workFactor;
  }

  /// @dev Return the kill factor for the worker + BaseToken debt, using 1e4 as denom. Revert on non-worker.
  function killFactor(address worker, uint256 /* debt */) external view override returns (uint256) {
    require(workers[worker].isWorker, "SimpleVaultConfig::killFactor:: !worker");
    return workers[worker].killFactor;
  }

}
