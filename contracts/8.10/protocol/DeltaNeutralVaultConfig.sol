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

import "./interfaces/IDeltaNeutralVaultConfig.sol";

contract DeltaNeutralVaultConfig is IDeltaNeutralVaultConfig, OwnableUpgradeable {
  /// @dev Events
  event LogSetParams(
    address indexed _caller,
    address _getWrappedNativeAddr,
    address _getWNativeRelayer,
    address _fairLaunchAddr,
    uint256 _rebalanceFactor,
    uint256 _positionValueTolerance,
    address _treasury
  );
  event LogSetWhitelistedCallers(address indexed _caller, address indexed _address, bool _ok);
  event LogSetWhitelistedRebalancers(address indexed _caller, address indexed _address, bool _ok);
  event LogSetWhitelistedConvertAssetTokens(address indexed _caller, address indexed _address, bool _ok);
  event LogSetLeverageLevel(address indexed _caller, uint8 _newLeverageLevel);
  event LogSetFees(address indexed _caller, uint256 _depositFeeBps);

  /// @dev Errors
  error InvalidSetSwapRoute();
  error LeverageLevelTooLow();

  struct SwapRoute {
    address router;
    address[] paths;
  }

  /// @notice Constants
  uint8 private constant MIN_LEVERAGE_LEVEL = 3;

  /// address for wrapped native eg WBNB, WETH
  address public override getWrappedNativeAddr;

  /// address for wNtive Relayer
  address public override getWNativeRelayer;

  /// FairLaunch contract address
  address public fairLaunchAddr;

  /// threshold that must be reached to allow rebalancing
  uint256 public override rebalanceFactor;
  /// Tolerance bps that allow margin for misc calculation
  uint256 public override positionValueTolerance;

  /// @notice Fee when user deposit to delta neutral vault
  uint256 public override depositFeeBps;

  /// @notice address of treasury account
  address public treasury;

  /// list of whitelisted callers.
  mapping(address => bool) public whitelistedCallers;
  /// list of whitelisted rebalancers.
  mapping(address => bool) public whitelistedRebalancers;

  mapping(address => bool) public whitelistedConvertAssetTokens;

  mapping(address => mapping(address => SwapRoute)) public swapRoutes;

  uint8 public override leverageLevel;

  function initialize(
    address _getWrappedNativeAddr,
    address _getWNativeRelayer,
    address _fairLaunchAddr,
    uint256 _rebalanceFactor,
    uint256 _positionValueTolerance,
    address _treasury
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();

    setParams(
      _getWrappedNativeAddr,
      _getWNativeRelayer,
      _fairLaunchAddr,
      _rebalanceFactor,
      _positionValueTolerance,
      _treasury
    );
  }

  function setParams(
    address _getWrappedNativeAddr,
    address _getWNativeRelayer,
    address _fairLaunchAddr,
    uint256 _rebalanceFactor,
    uint256 _positionValueTolerance,
    address _treasury
  ) public onlyOwner {
    getWrappedNativeAddr = _getWrappedNativeAddr;
    getWNativeRelayer = _getWNativeRelayer;
    fairLaunchAddr = _fairLaunchAddr;
    rebalanceFactor = _rebalanceFactor;
    positionValueTolerance = _positionValueTolerance;
    treasury = _treasury;

    emit LogSetParams(
      msg.sender,
      _getWrappedNativeAddr,
      _getWNativeRelayer,
      _fairLaunchAddr,
      _rebalanceFactor,
      _positionValueTolerance,
      _treasury
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

  /// @notice Set swapRoute.
  /// @dev Must only be called by owner.
  /// @param _from addresses from
  /// @param _to addresses to
  /// @param _swapRoutes swap route
  function setSwapRoutes(
    address[] calldata _from,
    address[] calldata _to,
    SwapRoute[] calldata _swapRoutes
  ) external onlyOwner {
    if (_from.length != _to.length || _from.length != _swapRoutes.length) {
      revert InvalidSetSwapRoute();
    }
    for (uint256 _idx = 0; _idx < _from.length; _idx++) {
      swapRoutes[_from[_idx]][_to[_idx]] = _swapRoutes[_idx];
    }
  }

  function getSwapRouteRouterAddr(address _source, address _destination) external view returns (address) {
    return (swapRoutes[_source][_destination].router);
  }

  function getSwapRoutePathsAddr(address _source, address _destination) external view returns (address[] memory) {
    return (swapRoutes[_source][_destination].paths);
  }

  /// @notice Set leverage level.
  /// @dev Must only be called by owner.
  /// @param _newLeverageLevel The new leverage level to be set. Must be >= 3
  function setLeverageLevel(uint8 _newLeverageLevel) external onlyOwner {
    if (_newLeverageLevel < MIN_LEVERAGE_LEVEL) {
      revert LeverageLevelTooLow();
    }
    leverageLevel = _newLeverageLevel;
    emit LogSetLeverageLevel(msg.sender, _newLeverageLevel);
  }

  /// @notice Set fees.
  /// @dev Must only be called by owner.
  /// @param _depositFeeBps Fee when user deposit to delta neutral vault.
  function setFees(uint256 _depositFeeBps) external onlyOwner {
    depositFeeBps = _depositFeeBps;
    emit LogSetFees(msg.sender, _depositFeeBps);
  }

  /// @dev Return the treasuryAddr.
  function getTreasuryAddr() external view override returns (address) {
    return treasury == address(0) ? 0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51 : treasury;
  }
}
