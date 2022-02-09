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
    address _treasury,
    uint256 _alpacaBountyBps
  );
  event LogSetWhitelistedCallers(address indexed _caller, address indexed _address, bool _ok);
  event LogSetWhitelistedRebalancers(address indexed _caller, address indexed _address, bool _ok);
  event LogSetFeeExemptedCallers(address indexed _caller, address indexed _address, bool _ok);
  event LogSetSwapRoute(address indexed _caller, address indexed _swapRouter, address source, address destination);
  event LogSetLeverageLevel(address indexed _caller, uint8 _newLeverageLevel);
  event LogSetAlpacaBounty(address indexed _caller, uint256 _alpacaBountyBps);
  event LogSetWhitelistedReinvestors(address indexed _caller, address indexed _address, bool _ok);
  event LogSetValueLimit(address indexed _caller, uint256 _maxVaultPositionValue);
  event LogSetFees(
    address indexed _caller,
    uint256 _depositFeeBps,
    uint256 _withdrawalFeeBps,
    uint256 _mangementFeeBps
  );
  event SetSwapRouter(address indexed _caller, address _swapRouter);
  event SetReinvestPath(address indexed _caller, address[] _reinvestPath);

  /// @dev Errors
  error LeverageLevelTooLow();
  error TooMuchFee(uint256 _depositFeeBps, uint256 _mangementFeeBps);

  error InvalidSwapRouter();
  error InvalidReinvestPath();
  error InvalidReinvestPathLength();

  /// @notice Constants
  uint8 private constant MIN_LEVERAGE_LEVEL = 3;
  uint256 private constant MAX_DEPOSIT_FEE_BPS = 1000;
  uint256 private constant MAX_WITHDRAWAL_FEE_BPS = 1000;
  uint256 private constant MAX_MANGEMENT_FEE_BPS = 1000;

  /// @dev Configuration for Delta Neutral Vault
  /// getWrappedNativeAddr - address for wrapped native eg WBNB, WETH
  /// getWNativeRelayer - address for wNtive Relayer
  /// fairLaunchAddr - FairLaunch contract address
  /// treasury - address of treasury account
  /// maxVaultPositionValue - maximum total position value in vault.
  /// rebalanceFactor - threshold that must be reached to allow rebalancing
  /// positionValueTolerance- Tolerance bps that allow margin for misc calculation
  /// depositFeeBps - Fee when user deposit to delta neutral vault
  /// withdrawalFeeBps - Fee when user withdraw from delta neutral vault
  /// mangementFeeBps Fee collected as a manager of delta neutral vault
  /// leverageLevel - Leverage level used for underlying positions
  /// alpacaToken - address of alpaca token
  /// swapRouter - address of router for swap
  /// whitelistedCallers - mapping of whitelisted callers
  /// whitelistedRebalancers - list of whitelisted rebalancers.
  /// router - Router address.

  address public override getWrappedNativeAddr;
  address public override getWNativeRelayer;
  address public fairLaunchAddr;
  address public treasury;

  uint256 private maxVaultPositionValue;
  uint256 public override rebalanceFactor;
  uint256 public override positionValueTolerance;

  uint256 public override depositFeeBps;
  uint256 public override withdrawalFeeBps;
  uint256 public override mangementFeeBps;

  uint8 public override leverageLevel;

  address public alpacaToken;
  address public swapRouter;
  address[] public reinvestPath;

  mapping(address => bool) public whitelistedCallers;
  mapping(address => bool) public whitelistedRebalancers;

  // list of exempted callers.
  mapping(address => bool) public feeExemptedCallers;

  /// list of reinvestors
  mapping(address => bool) public whitelistedReinvestors;

  uint256 public alpacaBountyBps;

  function initialize(
    address _getWrappedNativeAddr,
    address _getWNativeRelayer,
    address _fairLaunchAddr,
    uint256 _rebalanceFactor,
    uint256 _positionValueTolerance,
    address _treasury,
    uint256 _alpacaBountyBps,
    address _alpacaToken
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();

    alpacaToken = _alpacaToken;
    setParams(
      _getWrappedNativeAddr,
      _getWNativeRelayer,
      _fairLaunchAddr,
      _rebalanceFactor,
      _positionValueTolerance,
      _treasury,
      _alpacaBountyBps
    );
  }

  function setParams(
    address _getWrappedNativeAddr,
    address _getWNativeRelayer,
    address _fairLaunchAddr,
    uint256 _rebalanceFactor,
    uint256 _positionValueTolerance,
    address _treasury,
    uint256 _alpacaBountyBps
  ) public onlyOwner {
    getWrappedNativeAddr = _getWrappedNativeAddr;
    getWNativeRelayer = _getWNativeRelayer;
    fairLaunchAddr = _fairLaunchAddr;
    rebalanceFactor = _rebalanceFactor;
    positionValueTolerance = _positionValueTolerance;
    treasury = _treasury;
    alpacaBountyBps = _alpacaBountyBps;

    emit LogSetParams(
      msg.sender,
      _getWrappedNativeAddr,
      _getWNativeRelayer,
      _fairLaunchAddr,
      _rebalanceFactor,
      _positionValueTolerance,
      _treasury,
      _alpacaBountyBps
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

  /// @notice Set whitelisted reinvestors.
  /// @dev Must only be called by owner.
  /// @param _callers addresses to be whitelisted.
  /// @param _ok The new ok flag for callers.
  function setwhitelistedReinvestors(address[] calldata _callers, bool _ok) external onlyOwner {
    for (uint256 _idx = 0; _idx < _callers.length; _idx++) {
      whitelistedReinvestors[_callers[_idx]] = _ok;
      emit LogSetWhitelistedReinvestors(msg.sender, _callers[_idx], _ok);
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

  /// @notice Set exempted fee callers.
  /// @dev Must only be called by owner.
  /// @param _callers addresses to be exempted.
  /// @param _ok The new ok flag for callers.
  function setFeeExemptedCallers(address[] calldata _callers, bool _ok) external onlyOwner {
    for (uint256 _idx = 0; _idx < _callers.length; _idx++) {
      feeExemptedCallers[_callers[_idx]] = _ok;
      emit LogSetFeeExemptedCallers(msg.sender, _callers[_idx], _ok);
    }
  }

  /// @notice Set fees.
  /// @dev Must only be called by owner.
  /// @param _newDepositFeeBps Fee when user deposit to delta neutral vault.
  /// @param _newWithdrawalFeeBps Fee when user deposit to delta neutral vault.
  /// @param _newMangementFeeBps Mangement Fee.
  function setFees(
    uint256 _newDepositFeeBps,
    uint256 _newWithdrawalFeeBps,
    uint256 _newMangementFeeBps
  ) external onlyOwner {
    if (_newDepositFeeBps > MAX_DEPOSIT_FEE_BPS || _newMangementFeeBps > MAX_MANGEMENT_FEE_BPS) {
      revert TooMuchFee(_newDepositFeeBps, MAX_MANGEMENT_FEE_BPS);
    }
    depositFeeBps = _newDepositFeeBps;
    withdrawalFeeBps = _newWithdrawalFeeBps;
    mangementFeeBps = _newMangementFeeBps;
    emit LogSetFees(msg.sender, _newDepositFeeBps, _newWithdrawalFeeBps, _newMangementFeeBps);
  }

  /// @notice Set alpacaBountyBps.
  /// @dev Must only be called by owner.
  /// @param _alpacaBountyBps Fee when user deposit to delta neutral vault.
  function setAlpacaBountyBps(uint256 _alpacaBountyBps) external onlyOwner {
    alpacaBountyBps = _alpacaBountyBps;
    emit LogSetAlpacaBounty(msg.sender, alpacaBountyBps);
  }

  /// @dev Return the treasuryAddr.
  function getTreasuryAddr() external view override returns (address) {
    return treasury == address(0) ? 0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51 : treasury;
  }

  /// @notice Set position value limit.
  /// @dev Must only be called by owner.
  /// @param _maxVaultPositionValue Maximum vault size position value.
  function setValueLimit(uint256 _maxVaultPositionValue) external onlyOwner {
    maxVaultPositionValue = _maxVaultPositionValue;
    emit LogSetValueLimit(msg.sender, _maxVaultPositionValue);
  }

  /// @notice Return if vault can accept new position value.
  /// @param _totalPositionValue new vault position value.
  function isVaultSizeAcceptable(uint256 _totalPositionValue) external view returns (bool) {
    if (_totalPositionValue > maxVaultPositionValue) {
      return false;
    }
    return true;
  }

  /// @dev Get the swap router
  function getSwapRouter() external view returns (address) {
    return swapRouter;
  }

  /// @dev Set the reinvest configuration.
  /// @param _swapRouter - The router address to update.
  function setSwapRouter(address _swapRouter) external onlyOwner {
    if (_swapRouter == address(0)) revert InvalidSwapRouter();
    swapRouter = _swapRouter;
    emit SetSwapRouter(msg.sender, _swapRouter);
  }

  /// @dev Set the reinvest path.
  /// @param _reinvestPath - The reinvest path to update.
  function setReinvestPath(address[] calldata _reinvestPath) external onlyOwner {
    if (_reinvestPath.length < 2) revert InvalidReinvestPathLength();

    if (_reinvestPath[0] != alpacaToken) revert InvalidReinvestPath();

    reinvestPath = _reinvestPath;
    emit SetReinvestPath(msg.sender, _reinvestPath);
  }

  /// @dev Get the reinvest path.
  function getReinvestPath() external view returns (address[] memory) {
    return reinvestPath;
  }
}
