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
  event LogSetLeverageLevel(address indexed _caller, uint8 _newLeverageLevel);
  event LogSetFees(address indexed _caller, uint256 _depositFeeBps, uint256 _mangementFeeBps);

  error LeverageLevelTooLow();
  error TooMuchFee(uint256 _depositFeeBps, uint256 _mangementFeeBps);

  /// @dev constants
  uint8 private constant MIN_LEVERAGE_LEVEL = 3;
  uint256 private constant MAX_DEPOSIT_FEE_BPS = 1000;
  uint256 private constant MAX_MANGEMENT_FEE_BPS = 1000;
  /// @dev Configuration for Delta Neutral Vault
  /// getWrappedNativeAddr - address for wrapped native eg WBNB, WETH
  /// getWNativeRelayer - address for wNtive Relayer
  /// fairLaunchAddr - FairLaunch contract address
  /// treasury - address of treasury account
  /// rebalanceFactor - threshold that must be reached to allow rebalancing
  /// positionValueTolerance- Tolerance bps that allow margin for misc calculation
  /// depositFeeBps - Fee when user deposit to delta neutral vault
  /// mangementFeeBps Fee collected as a manager of delta neutral vault
  /// leverageLevel - Leverage level used for underlying positions
  /// whitelistedCallers - mapping of whitelisted callers
  /// whitelistedRebalancers - list of whitelisted rebalancers.

  address public override getWrappedNativeAddr;
  address public override getWNativeRelayer;
  address public fairLaunchAddr;
  address public treasury;

  uint256 public override rebalanceFactor;
  uint256 public override positionValueTolerance;

  uint256 public override depositFeeBps;
  uint256 public override mangementFeeBps;

  uint8 public override leverageLevel;

  mapping(address => bool) public whitelistedCallers;
  mapping(address => bool) public whitelistedRebalancers;

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
  /// @param _newDepositFeeBps Fee when user deposit to delta neutral vault.
  /// @param _newMangementFeeBps Mangement Fee.
  function setFees(uint256 _newDepositFeeBps, uint256 _newMangementFeeBps) external onlyOwner {
    if (_newDepositFeeBps > MAX_DEPOSIT_FEE_BPS || _newMangementFeeBps > MAX_MANGEMENT_FEE_BPS) {
      revert TooMuchFee(_newDepositFeeBps, MAX_MANGEMENT_FEE_BPS);
    }
    depositFeeBps = _newDepositFeeBps;
    mangementFeeBps = _newMangementFeeBps;
    emit LogSetFees(msg.sender, _newDepositFeeBps, _newMangementFeeBps);
  }

  /// @dev Return the treasuryAddr.
  function getTreasuryAddr() external view override returns (address) {
    return treasury == address(0) ? 0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51 : treasury;
  }
}
