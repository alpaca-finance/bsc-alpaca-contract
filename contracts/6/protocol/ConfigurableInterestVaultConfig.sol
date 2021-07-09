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
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

import "./interfaces/IVaultConfig.sol";
import "./interfaces/IWorkerConfig.sol";
import "./interfaces/InterestModel.sol";

contract ConfigurableInterestVaultConfig is IVaultConfig, OwnableUpgradeSafe {
  /// @notice Events
  event SetWhitelistedCaller(address indexed caller, address indexed addr, bool ok);
  event SetParams(
    address indexed caller,
    uint256 minDebtSize,
    uint256 reservePoolBps,
    uint256 killBps,
    address interestModel,
    address wrappedNative,
    address wNativeRelayer,
    address fairLaunch,
    uint256 buybackBps,
    address buyback
  );
  event SetWorkers(address indexed caller, address worker, address workerConfig);
  event SetMaxKillBps(address indexed caller, uint256 maxKillBps);

  /// The minimum debt size per position.
  uint256 public override minDebtSize;
  /// The portion of interests allocated to the reserve pool.
  uint256 public override getReservePoolBps;
  /// The reward for successfully killing a position.
  uint256 public override getKillBps;
  /// Mapping for worker address to its configuration.
  mapping(address => IWorkerConfig) public workers;
  /// Interest rate model
  InterestModel public interestModel;
  /// address for wrapped native eg WBNB, WETH
  address public override getWrappedNativeAddr;
  /// address for wNtive Relayer
  address public override getWNativeRelayerAddr;
  /// address of fairLaunch contract
  address public override getFairLaunchAddr;
  /// maximum killBps
  uint256 public maxKillBps;
  /// list of whitelisted callers
  mapping(address => bool) public override whitelistedCallers;
  // The portion of reward for buyback and burn after successfully killing a position.
  uint256 public override getBuybackBps;
  // The address where buyback and burn portion will be transferred to.
  address public override getBuybackAddr;

  function initialize(
    uint256 _minDebtSize,
    uint256 _reservePoolBps,
    uint256 _killBps,
    InterestModel _interestModel,
    address _getWrappedNativeAddr,
    address _getWNativeRelayer,
    address _getFairLaunchAddr,
    uint256 _buybackBps,
    address _getbuybackAddr
  ) external initializer {
    OwnableUpgradeSafe.__Ownable_init();

    maxKillBps = 500;
    setParams(
      _minDebtSize,
      _reservePoolBps,
      _killBps,
      _interestModel,
      _getWrappedNativeAddr,
      _getWNativeRelayer,
      _getFairLaunchAddr,
      _buybackBps,
      _getbuybackAddr
    );
  }

  /// @dev Set all the basic parameters. Must only be called by the owner.
  /// @param _minDebtSize The new minimum debt size value.
  /// @param _reservePoolBps The new interests allocated to the reserve pool value.
  /// @param _killBps The new reward for killing a position value.
  /// @param _interestModel The new interest rate model contract.
  /// @param _buybackBps The portion of reward for buyback and burn after successfully killing a position.
  /// @param _getbuybackAddr The address where buyback and burn portion will be transferred to.
  function setParams(
    uint256 _minDebtSize,
    uint256 _reservePoolBps,
    uint256 _killBps,
    InterestModel _interestModel,
    address _getWrappedNativeAddr,
    address _getWNativeRelayer,
    address _getFairLaunchAddr,
    uint256 _buybackBps,
    address _getbuybackAddr
  ) public onlyOwner {
    require(_killBps <= maxKillBps, "ConfigurableInterestVaultConfig::setParams:: kill bps exceeded max kill bps");

    minDebtSize = _minDebtSize;
    getReservePoolBps = _reservePoolBps;
    getKillBps = _killBps;
    interestModel = _interestModel;
    getWrappedNativeAddr = _getWrappedNativeAddr;
    getWNativeRelayerAddr = _getWNativeRelayer;
    getFairLaunchAddr = _getFairLaunchAddr;
    getBuybackBps = _buybackBps;
    getBuybackAddr = _getbuybackAddr;

    emit SetParams(
      _msgSender(),
      minDebtSize,
      getReservePoolBps,
      getKillBps,
      address(interestModel),
      getWrappedNativeAddr,
      getWNativeRelayerAddr,
      getFairLaunchAddr,
      getBuybackBps,
      getBuybackAddr
    );
  }

  /// @dev Set the configuration for the given workers. Must only be called by the owner.
  function setWorkers(address[] calldata addrs, IWorkerConfig[] calldata configs) external onlyOwner {
    require(addrs.length == configs.length, "ConfigurableInterestVaultConfig::setWorkers:: bad length");
    for (uint256 idx = 0; idx < addrs.length; idx++) {
      workers[addrs[idx]] = configs[idx];
      emit SetWorkers(_msgSender(), addrs[idx], address(configs[idx]));
    }
  }

  /// @dev Set whitelisted callers. Must only be called by the owner.
  function setWhitelistedCallers(address[] calldata callers, bool ok) external onlyOwner {
    for (uint256 idx = 0; idx < callers.length; idx++) {
      whitelistedCallers[callers[idx]] = ok;
      emit SetWhitelistedCaller(_msgSender(), callers[idx], ok);
    }
  }

  /// @dev Set max kill bps. Must only be called by the owner.
  function setMaxKillBps(uint256 _maxKillBps) external onlyOwner {
    require(_maxKillBps < 1000, "ConfigurableInterestVaultConfig::setMaxKillBps:: bad _maxKillBps");
    maxKillBps = _maxKillBps;
    emit SetMaxKillBps(_msgSender(), maxKillBps);
  }

  /// @dev Return the interest rate per second, using 1e18 as denom.
  function getInterestRate(uint256 debt, uint256 floating) external view override returns (uint256) {
    return interestModel.getInterestRate(debt, floating);
  }

  /// @dev Return whether the given address is a worker.
  function isWorker(address worker) external view override returns (bool) {
    return address(workers[worker]) != address(0);
  }

  /// @dev Return whether the given worker accepts more debt. Revert on non-worker.
  function acceptDebt(address worker) external view override returns (bool) {
    return workers[worker].acceptDebt(worker);
  }

  /// @dev Return the work factor for the worker + debt, using 1e4 as denom. Revert on non-worker.
  function workFactor(address worker, uint256 debt) external view override returns (uint256) {
    return workers[worker].workFactor(worker, debt);
  }

  /// @dev Return the kill factor for the worker + debt, using 1e4 as denom. Revert on non-worker.
  function killFactor(address worker, uint256 debt) external view override returns (uint256) {
    return workers[worker].killFactor(worker, debt);
  }
}
