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
    bool isStable;
    bool isReserveConsistent;
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
  mapping(address => WorkerConfig) public workers;
  /// address for wrapped native eg WBNB, WETH
  address public override getWrappedNativeAddr;
  /// address for wNative relater
  address public override getWNativeRelayer;
  /// address of fairLaunch contract
  address public override getFairLaunchAddr;
  /// list of whitelisted callers
  mapping(address => bool) public override whitelistedCallers;
  /// The portion of reward that will be transferred to treasury account after successfully killing a position.
  uint256 public override getKillTreasuryBps;
  /// address of treasury account
  address public treasury;
  // Mapping of approved add strategies
  mapping(address => bool) public override approvedAddStrategies;
  // list of whitelisted liquidators
  mapping(address => bool) public override whitelistedLiquidators;

  function initialize(
    uint256 _minDebtSize,
    uint256 _interestRate,
    uint256 _reservePoolBps,
    uint256 _killBps,
    address _getWrappedNativeAddr,
    address _getWNativeRelayer,
    address _getFairLaunchAddr,
    uint256 _getKillTreasuryBps,
    address _treasury
  ) external initializer {
    OwnableUpgradeSafe.__Ownable_init();

    setParams(
      _minDebtSize,
      _interestRate,
      _reservePoolBps,
      _killBps,
      _getWrappedNativeAddr,
      _getWNativeRelayer,
      _getFairLaunchAddr,
      _getKillTreasuryBps,
      _treasury
    );
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
    address _getWrappedNativeAddr,
    address _getWNativeRelayer,
    address _getFairLaunchAddr,
    uint256 _getKillTreasuryBps,
    address _treasury
  ) public onlyOwner {
    minDebtSize = _minDebtSize;
    interestRate = _interestRate;
    getReservePoolBps = _reservePoolBps;
    getKillBps = _killBps;
    getWrappedNativeAddr = _getWrappedNativeAddr;
    getWNativeRelayer = _getWNativeRelayer;
    getFairLaunchAddr = _getFairLaunchAddr;
    getKillTreasuryBps = _getKillTreasuryBps;
    treasury = _treasury;
  }

  /// @dev Set the configuration for the given worker. Must only be called by the owner.
  /// @param worker The worker address to set configuration.
  /// @param _isWorker Whether the given address is a valid worker.
  /// @param _acceptDebt Whether the worker is accepting new debts.
  /// @param _workFactor The work factor value for this worker.
  /// @param _killFactor The kill factor value for this worker.
  /// @param _isStable Whether the given worker is stable or not.
  function setWorker(
    address worker,
    bool _isWorker,
    bool _acceptDebt,
    uint256 _workFactor,
    uint256 _killFactor,
    bool _isStable,
    bool _isReserveConsistent
  ) public onlyOwner {
    workers[worker] = WorkerConfig({
      isWorker: _isWorker,
      acceptDebt: _acceptDebt,
      workFactor: _workFactor,
      killFactor: _killFactor,
      isStable: _isStable,
      isReserveConsistent: _isReserveConsistent
    });
  }

  /// @dev Set whitelisted callers. Must only be called by the owner.
  function setWhitelistedCallers(address[] calldata callers, bool ok) external onlyOwner {
    for (uint256 idx = 0; idx < callers.length; idx++) {
      whitelistedCallers[callers[idx]] = ok;
    }
  }

  /// @dev Set whitelisted liquidators. Must only be called by the owner.
  function setWhitelistedLiquidators(address[] calldata callers, bool ok) external onlyOwner {
    for (uint256 idx = 0; idx < callers.length; idx++) {
      whitelistedLiquidators[callers[idx]] = ok;
    }
  }

  /// @dev Set approved add strategies. Must only be called by the owner.
  function setApprovedAddStrategy(address[] calldata addStrats, bool ok) external onlyOwner {
    for (uint256 idx = 0; idx < addStrats.length; idx++) {
      approvedAddStrategies[addStrats[idx]] = ok;
    }
  }

  /// @dev Return the interest rate per second, using 1e18 as denom.
  function getInterestRate(
    uint256, /* debt */
    uint256 /* floating */
  ) external view override returns (uint256) {
    return interestRate;
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
  function workFactor(
    address worker,
    uint256 /* debt */
  ) external view override returns (uint256) {
    require(workers[worker].isWorker, "SimpleVaultConfig::workFactor:: !worker");
    return workers[worker].workFactor;
  }

  /// @dev Return the kill factor for the worker + BaseToken debt, using 1e4 as denom. Revert on non-worker.
  function killFactor(
    address worker,
    uint256 /* debt */
  ) external view override returns (uint256) {
    require(workers[worker].isWorker, "SimpleVaultConfig::killFactor:: !worker");
    return workers[worker].killFactor;
  }

  /// @dev Return the kill factor for the worker + BaseToken debt, using 1e4 as denom.
  function rawKillFactor(
    address worker,
    uint256 /* debt */
  ) external view override returns (uint256) {
    require(workers[worker].isWorker, "SimpleVaultConfig::killFactor:: !worker");
    return workers[worker].killFactor;
  }

  /// @dev Return worker stability
  function isWorkerStable(address worker) external view override returns (bool) {
    require(workers[worker].isWorker, "SimpleVaultConfig::isWorkerStable:: !worker");
    return workers[worker].isStable;
  }

  /// @dev Return if pools is consistent
  function isWorkerReserveConsistent(address worker) external view override returns (bool) {
    return workers[worker].isReserveConsistent;
  }

  /// @dev Return the treasuryAddr
  function getTreasuryAddr() external view override returns (address) {
    return treasury == address(0) ? 0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51 : treasury;
  }
}
