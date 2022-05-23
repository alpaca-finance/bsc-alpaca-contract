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

pragma solidity >=0.8.4 <0.9.0;

interface DeltaNeutralVault02Like {
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

  function rebalance(
    uint8[] memory _actions,
    uint256[] memory _values,
    bytes[] memory _datas
  ) external;

  function reinvest(
    uint8[] memory _actions,
    uint256[] memory _values,
    bytes[] memory _datas,
    uint256 _minTokenReceive
  ) external;

  function renounceOwnership() external;

  function setDeltaNeutralOracle(address _newPriceOracle) external;

  function setDeltaNeutralVaultConfig(address _newVaultConfig) external;

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
