// SPDX-License-Identifier: BUSL
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

pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../utils/SafeToken.sol";

import "./interfaces/IDeltaNeutralVaultConfig.sol";

contract DeltaNeutralVaultConfig is IDeltaNeutralVaultConfig, OwnableUpgradeable {
  using SafeToken for address;

  /// @dev Events
  event LogSetParams(
    address indexed _caller,
    address _getWrappedNativeAddr,
    address _getWNativeRelayer,
    address _fairLaunchAddr,
    address _routerAddr,
    uint256 _rebalanceFactor,
    uint256 _positionValueTolerance
  );
  event LogSetWhitelistedCallers(address indexed _caller, address indexed _address, bool _ok);
  event LogSetWhitelistedRebalancers(address indexed _caller, address indexed _address, bool _ok);

  /// address for wrapped native eg WBNB, WETH
  address public override getWrappedNativeAddr;
  /// address for wNtive Relayer
  address public override getWNativeRelayer;

  address public fairLaunchAddr;

  address public routerAddr;

  //
  uint256 public override rebalanceFactor;
  //
  uint256 public override positionValueTolerance;

  /// @notice debt of delta neutral stable pool Id
  uint256 public debtStablePoolId;
  /// @notice debt of delta neutral asset pool Id
  uint256 public debtAssetPoolId;

  /// list of whitelisted callers.
  mapping(address => bool) public whitelistedCallers;
  /// list of whitelisted rebalancers.
  mapping(address => bool) public whitelistedRebalancers;

  function initialize(
    address _getWrappedNativeAddr,
    address _getWNativeRelayer,
    address _fairLaunchAddr,
    address _routerAddr,
    uint256 _rebalanceFactor,
    uint256 _positionValueTolerance
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();

    setParams(
      _getWrappedNativeAddr,
      _getWNativeRelayer,
      _fairLaunchAddr,
      _routerAddr,
      _rebalanceFactor,
      _positionValueTolerance
    );
  }

  function setParams(
    address _getWrappedNativeAddr,
    address _getWNativeRelayer,
    address _fairLaunchAddr,
    address _routerAddr,
    uint256 _rebalanceFactor,
    uint256 _positionValueTolerance
  ) public onlyOwner {
    getWrappedNativeAddr = _getWrappedNativeAddr;
    getWNativeRelayer = _getWNativeRelayer;
    fairLaunchAddr = _fairLaunchAddr;
    routerAddr = _routerAddr;
    rebalanceFactor = _rebalanceFactor;
    positionValueTolerance = _positionValueTolerance;

    emit LogSetParams(
      msg.sender,
      _getWrappedNativeAddr,
      _getWNativeRelayer,
      _fairLaunchAddr,
      _routerAddr,
      _rebalanceFactor,
      _positionValueTolerance
    );
  }

  /// @notice Set whitelisted callers.
  /// @dev Must only be called by owner.
  /// @param _callers addresses to be whitelisted.
  /// @param _ok The new ok flag for callers.
  function setWhitelistedCallers(address[] calldata _callers, bool _ok) external onlyOwner {
    for (uint256 _idx = 0; _idx < _callers.length; _idx++) {
      whitelistedCallers[_callers[_idx]] = _ok;
      emit LogSetWhitelistedCallers(msg.sender, _callers[_idx], _ok);
    }
  }

  /// @notice Set whitelisted rebalancers.
  /// @dev Must only be called by owner.
  /// @param _callers addresses to be whitelisted.
  /// @param _ok The new ok flag for callers.
  function setWhitelistedRebalancer(address[] calldata _callers, bool _ok) external onlyOwner {
    for (uint256 _idx = 0; _idx < _callers.length; _idx++) {
      whitelistedRebalancers[_callers[_idx]] = _ok;
      emit LogSetWhitelistedRebalancers(msg.sender, _callers[_idx], _ok);
    }
  }
}
