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
pragma solidity ^0.8.4;

interface DeltaNeutralVault04Like {
  error DeltaNeutralVault_BadActionSize();
  error DeltaNeutralVault_BadReinvestPath();
  error DeltaNeutralVault_IncorrectNativeAmountDeposit();
  error DeltaNeutralVault_InsufficientShareReceived(uint256 _requiredAmount, uint256 _receivedAmount);
  error DeltaNeutralVault_InsufficientTokenReceived(address _token, uint256 _requiredAmount, uint256 _receivedAmount);
  error DeltaNeutralVault_InvalidInitializedAddress();
  error DeltaNeutralVault_InvalidLpToken();
  error DeltaNeutralVault_InvalidPositions(address _vault, uint256 _positionId);
  error DeltaNeutralVault_InvalidShareAmount();
  error DeltaNeutralVault_PositionValueExceedLimit();
  error DeltaNeutralVault_PositionsAlreadyInitialized();
  error DeltaNeutralVault_PositionsIsHealthy();
  error DeltaNeutralVault_PositionsNotInitialized();
  error DeltaNeutralVault_UnTrustedPrice();
  error DeltaNeutralVault_Unauthorized(address _caller);
  error DeltaNeutralVault_UnsafeDebtRatio();
  error DeltaNeutralVault_UnsafeDebtValue();
  error DeltaNeutralVault_UnsafeOutstanding(address _token, uint256 _amountBefore, uint256 _amountAfter);
  error DeltaNeutralVault_UnsafePositionEquity();
  error DeltaNeutralVault_UnsafePositionValue();
  error DeltaNeutralVault_UnsupportedDecimals(uint256 _decimals);
  error DeltaNeutralVault_WithdrawValueExceedShareValue(uint256 _withdrawValue, uint256 _shareValue);
  event Approval(address indexed owner, address indexed spender, uint256 value);
  event LogDeposit(
    address indexed _from,
    address indexed _shareReceiver,
    uint256 _shares,
    uint256 _stableTokenAmount,
    uint256 _assetTokenAmount
  );
  event LogInitializePositions(address indexed _from, uint256 _stableVaultPosId, uint256 _assetVaultPosId);
  event LogRebalance(uint256 _equityBefore, uint256 _equityAfter);
  event LogReinvest(uint256 _equityBefore, uint256 _equityAfter);
  event LogSetDeltaNeutralOracle(address indexed _caller, address _priceOracle);
  event LogSetDeltaNeutralVaultConfig(address indexed _caller, address _config);
  event LogWithdraw(address indexed _shareOwner, uint256 _minStableTokenAmount, uint256 _minAssetTokenAmount);
  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
  event Transfer(address indexed from, address indexed to, uint256 value);

  function allowance(address owner, address spender) external view returns (uint256);

  function alpacaToken() external view returns (address);

  function approve(address spender, uint256 amount) external returns (bool);

  function assetTo18ConversionFactor() external view returns (uint256);

  function assetToken() external view returns (address);

  function assetVault() external view returns (address);

  function assetVaultPosId() external view returns (uint256);

  function assetVaultWorker() external view returns (address);

  function balanceOf(address account) external view returns (uint256);

  function config() external view returns (address);

  function decimals() external view returns (uint8);

  function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool);

  function deposit(
    uint256 _stableTokenAmount,
    uint256 _assetTokenAmount,
    address _shareReceiver,
    uint256 _minShareReceive,
    bytes memory _data
  ) external payable returns (uint256);

  function execute(
    uint8 _action,
    uint256 _value,
    bytes memory _data
  ) external;

  function increaseAllowance(address spender, uint256 addedValue) external returns (bool);

  function initPositions(
    uint256 _stableTokenAmount,
    uint256 _assetTokenAmount,
    uint256 _minShareReceive,
    bytes memory _data
  ) external payable;

  function initialize(
    string memory _name,
    string memory _symbol,
    address _stableVault,
    address _assetVault,
    address _stableVaultWorker,
    address _assetVaultWorker,
    address _lpToken,
    address _alpacaToken,
    address _priceOracle,
    address _config
  ) external;

  function lastFeeCollected() external view returns (uint256);

  function name() external view returns (string memory);

  function owner() external view returns (address);

  function pendingManagementFee() external view returns (uint256);

  function positionInfo()
    external
    view
    returns (
      uint256,
      uint256,
      uint256,
      uint256,
      uint256,
      uint256
    );

  function priceOracle() external view returns (address);

  function rebalance(bytes memory _data) external;

  function reinvest(bytes memory _data, uint256 _minTokenReceive) external;

  function renounceOwnership() external;

  function setDeltaNeutralOracle(address _newPriceOracle) external;

  function setDeltaNeutralVaultConfig(address _newVaultConfig) external;

  function setDeltaNeutralVaultHealthChecker(address _checker) external;

  function shareToValue(uint256 _shareAmount) external view returns (uint256);

  function stableTo18ConversionFactor() external view returns (uint256);

  function stableToken() external view returns (address);

  function stableVault() external view returns (address);

  function stableVaultPosId() external view returns (uint256);

  function stableVaultWorker() external view returns (address);

  function symbol() external view returns (string memory);

  function totalEquityValue() external view returns (uint256);

  function totalSupply() external view returns (uint256);

  function transfer(address to, uint256 amount) external returns (bool);

  function transferFrom(
    address from,
    address to,
    uint256 amount
  ) external returns (bool);

  function transferOwnership(address newOwner) external;

  function valueToShare(uint256 _value) external view returns (uint256);

  function withdraw(
    uint256 _shareAmount,
    uint256 _minStableTokenAmount,
    uint256 _minAssetTokenAmount,
    bytes memory _data
  ) external returns (uint256);

  receive() external payable;
}

interface DeltaNeutralVault04 {
  struct PositionInfo {
    uint256 stablePositionEquity;
    uint256 stablePositionDebtValue;
    uint256 stableLpAmount;
    uint256 assetPositionEquity;
    uint256 assetPositionDebtValue;
    uint256 assetLpAmount;
  }
}
