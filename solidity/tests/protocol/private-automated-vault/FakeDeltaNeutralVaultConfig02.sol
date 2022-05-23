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

pragma solidity 0.8.13;

/// @title FakeDeltaNeutralVaultConfig - Simpler Variance of the original contract
// solhint-disable max-states-count
contract FakeDeltaNeutralVaultConfig02 {
  // --- Errors ---
  error DeltaNeutralVaultConfig_LeverageLevelTooLow();
  error DeltaNeutralVaultConfig_TooMuchFee(uint256 _depositFeeBps, uint256 _withdrawalFeeBps, uint256 _mangementFeeBps);
  error DeltaNeutralVaultConfig_TooMuchBounty(uint256 _bounty);
  error DeltaNeutralVaultConfig_InvalidSwapRouter();
  error DeltaNeutralVaultConfig_InvalidReinvestPath();
  error DeltaNeutralVaultConfig_InvalidReinvestPathLength();

  // --- Constants ---
  uint8 private constant MIN_LEVERAGE_LEVEL = 3;
  uint256 private constant MAX_DEPOSIT_FEE_BPS = 1000;
  uint256 private constant MAX_WITHDRAWAL_FEE_BPS = 1000;
  uint256 private constant MAX_MANGEMENT_FEE_PER_SEC = 3170979198;
  uint256 private constant MAX_ALPACA_BOUNTY_BPS = 2500;
  uint256 private constant MAX_ALPACA_BENEFICIARY_BPS = 6000;

  // Configuration for Delta Neutral Vault
  // Address for wrapped native eg WBNB, WETH
  address public getWrappedNativeAddr;
  // Address for wNtive Relayer
  address public getWNativeRelayer;
  // FairLaunch contract address
  address public fairLaunchAddr;

  // The maximum position value in USD that can be held in the vault
  uint256 public maxVaultPositionValue;
  // If debt ratio went above rebalanceFactor, then rebalance
  uint256 public rebalanceFactor;
  // Tolerance bps that allow margin for misc calculation
  uint256 public positionValueTolerance;
  // Specific Tolerance bps use for debt ratio check during withdraw
  uint256 public debtRatioTolerance;

  // Deposit fee treasury.
  address public depositFeeTreasury;
  // Fee when user deposit to delta neutral vault
  uint256 public depositFeeBps;
  // Withdrawal fee treasury.
  address public withdrawalFeeTreasury;
  // Fee when user withdraw from delta neutral vault
  uint256 public withdrawalFeeBps;
  // Management fee treausry.
  address public managementFeeTreasury;
  // Management fee when users is using the vault
  uint256 public managementFeePerSec;

  // Targeted leverage level used for underlying positions
  uint8 public leverageLevel;

  // ALPACA token
  address public alpacaToken;
  // The router to be used for swaping ALPACA to other assets
  address public getSwapRouter;
  // The path to be used for reinvesting
  address[] public reinvestPath;

  // Mapping of whitelisted rebalancers
  mapping(address => bool) public whitelistedRebalancers;

  // list of exempted callers.
  mapping(address => bool) public feeExemptedCallers;

  // list of reinvestors
  mapping(address => bool) public whitelistedReinvestors;

  // ALPACA treausry
  address public alpacaReinvestFeeTreasury;
  // ALPACA bounty percentage.
  uint256 public alpacaBountyBps;
  // ALPACA beneficiary. This is the address that will receive portion of the bounty.
  address public alpacaBeneficiary;
  // ALPACA beneficiary percentage.
  uint256 public alpacaBeneficiaryBps;

  // Automated vault controller
  address public controller;

  function setParams(
    address _getWrappedNativeAddr,
    address _getWNativeRelayer,
    address _fairLaunchAddr,
    uint256 _rebalanceFactor,
    uint256 _positionValueTolerance,
    uint256 _debtRatioTolerance
  ) public {
    getWrappedNativeAddr = _getWrappedNativeAddr;
    getWNativeRelayer = _getWNativeRelayer;
    fairLaunchAddr = _fairLaunchAddr;
    rebalanceFactor = _rebalanceFactor;
    positionValueTolerance = _positionValueTolerance;
    debtRatioTolerance = _debtRatioTolerance;
  }

  /// @notice Set whitelisted rebalancers.
  /// @dev Must only be called by owner.
  /// @param _callers addresses to be whitelisted.
  /// @param _ok The new ok flag for callers.
  function setWhitelistedRebalancer(address[] calldata _callers, bool _ok) external {
    for (uint256 _idx = 0; _idx < _callers.length; _idx++) {
      whitelistedRebalancers[_callers[_idx]] = _ok;
    }
  }

  /// @notice Set whitelisted reinvestors.
  /// @dev Must only be called by owner.
  /// @param _callers addresses to be whitelisted.
  /// @param _ok The new ok flag for callers.
  function setwhitelistedReinvestors(address[] calldata _callers, bool _ok) external {
    for (uint256 _idx = 0; _idx < _callers.length; _idx++) {
      whitelistedReinvestors[_callers[_idx]] = _ok;
    }
  }

  /// @notice Set leverage level.
  /// @dev Must only be called by owner.
  /// @param _newLeverageLevel The new leverage level to be set. Must be >= 3
  function setLeverageLevel(uint8 _newLeverageLevel) external {
    if (_newLeverageLevel < MIN_LEVERAGE_LEVEL) {
      revert DeltaNeutralVaultConfig_LeverageLevelTooLow();
    }
    leverageLevel = _newLeverageLevel;
  }

  /// @notice Set exempted fee callers.
  /// @dev Must only be called by owner.
  /// @param _callers addresses to be exempted.
  /// @param _ok The new ok flag for callers.
  function setFeeExemptedCallers(address[] calldata _callers, bool _ok) external {
    for (uint256 _idx = 0; _idx < _callers.length; _idx++) {
      feeExemptedCallers[_callers[_idx]] = _ok;
    }
  }

  /// @notice Set fees.
  /// @dev Must only be called by owner.
  /// @param _newDepositFeeBps Fee when user deposit to delta neutral vault.
  /// @param _newWithdrawalFeeBps Fee when user deposit to delta neutral vault.
  /// @param _newManagementFeePerSec Mangement Fee per second.
  function setFees(
    address _newDepositFeeTreasury,
    uint256 _newDepositFeeBps,
    address _newWithdrawalFeeTreasury,
    uint256 _newWithdrawalFeeBps,
    address _newManagementFeeTreasury,
    uint256 _newManagementFeePerSec
  ) public {
    if (
      _newDepositFeeBps > MAX_DEPOSIT_FEE_BPS ||
      _newWithdrawalFeeBps > MAX_WITHDRAWAL_FEE_BPS ||
      _newManagementFeePerSec > MAX_MANGEMENT_FEE_PER_SEC
    ) {
      revert DeltaNeutralVaultConfig_TooMuchFee(_newDepositFeeBps, _newWithdrawalFeeBps, _newManagementFeePerSec);
    }

    depositFeeTreasury = _newDepositFeeTreasury;
    depositFeeBps = _newDepositFeeBps;

    withdrawalFeeTreasury = _newWithdrawalFeeTreasury;
    withdrawalFeeBps = _newWithdrawalFeeBps;

    managementFeeTreasury = _newManagementFeeTreasury;
    managementFeePerSec = _newManagementFeePerSec;
  }

  /// @notice Set alpacaBountyBps.
  /// @dev Must only be called by owner.
  /// @param _newAlpacaReinvestFeeTreasury The new address to received ALPACA reinvest fee
  /// @param _newAlpacaBountyBps Fee from reinvesting ALPACA to positions.
  function setAlpacaBountyConfig(address _newAlpacaReinvestFeeTreasury, uint256 _newAlpacaBountyBps) external {
    if (_newAlpacaBountyBps > MAX_ALPACA_BOUNTY_BPS) {
      revert DeltaNeutralVaultConfig_TooMuchBounty(_newAlpacaBountyBps);
    }

    alpacaReinvestFeeTreasury = _newAlpacaReinvestFeeTreasury;
    alpacaBountyBps = _newAlpacaBountyBps;
  }

  /// @notice Set alpacaBeneficiaryBps.
  /// @dev Must only be called by owner.
  /// @param _newAlpacaBeneficiary The new address to received ALPACA reinvest fee
  /// @param _newAlpacaBeneficiaryBps Fee from reinvesting ALPACA to positions.
  function setAlpacaBeneficiaryConfig(address _newAlpacaBeneficiary, uint256 _newAlpacaBeneficiaryBps) external {
    if (_newAlpacaBeneficiaryBps > MAX_ALPACA_BENEFICIARY_BPS) {
      revert DeltaNeutralVaultConfig_TooMuchBounty(_newAlpacaBeneficiaryBps);
    }

    alpacaBeneficiary = _newAlpacaBeneficiary;
    alpacaBeneficiaryBps = _newAlpacaBeneficiaryBps;
  }

  /// @notice Set position value limit.
  /// @dev Must only be called by owner.
  /// @param _maxVaultPositionValue Maximum vault size position value.
  function setValueLimit(uint256 _maxVaultPositionValue) external {
    maxVaultPositionValue = _maxVaultPositionValue;
  }

  /// @notice Return if vault can accept new position value.
  function isVaultSizeAcceptable(
    uint256 /*_totalPositionValue*/
  ) external pure returns (bool) {
    return true;
  }

  /// @dev Set the reinvest configuration.
  /// @param _swapRouter - The router address to update.
  function setSwapRouter(address _swapRouter) external {
    if (_swapRouter == address(0)) revert DeltaNeutralVaultConfig_InvalidSwapRouter();
    getSwapRouter = _swapRouter;
  }

  /// @dev Set the reinvest path.
  /// @param _reinvestPath - The reinvest path to update.
  function setReinvestPath(address[] calldata _reinvestPath) external {
    if (_reinvestPath.length < 2) revert DeltaNeutralVaultConfig_InvalidReinvestPathLength();

    if (_reinvestPath[0] != alpacaToken) revert DeltaNeutralVaultConfig_InvalidReinvestPath();

    reinvestPath = _reinvestPath;
  }

  /// @dev Get the reinvest path.
  function getReinvestPath() external view returns (address[] memory) {
    return reinvestPath;
  }

  /// @dev everyone can call
  function whitelistedCallers(
    address /*_address*/
  ) external pure returns (bool) {
    return true;
  }

  function setController(address _controller) external {
    controller = _controller;
  }
}
