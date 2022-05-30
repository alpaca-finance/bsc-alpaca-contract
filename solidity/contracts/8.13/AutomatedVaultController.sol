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

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import { ICreditor } from "./interfaces/ICreditor.sol";
import { IDeltaNeutralVault } from "./interfaces/IDeltaNeutralVault.sol";

/// @title AutomatedVaultController - Controller how much investor can invest in the private automated vault
contract AutomatedVaultController is OwnableUpgradeable {
  // --- Events ---
  event LogSetPrivateVaults(address indexed _caller, IDeltaNeutralVault[] _vaults);
  event LogSetCreditors(address indexed _caller, ICreditor[] _creditors);

  // --- State Variables ---
  ICreditor[] public creditors;
  IDeltaNeutralVault[] public privateVaults;
  mapping(address => mapping(address => uint256)) public userVaultShares;

  constructor() initializer {}

  /// @notice Initialize Automated Vault Controller
  /// @param _creditors list of credit sources
  /// @param _privateVaults list of private automated vaults
  function initialize(ICreditor[] memory _creditors, IDeltaNeutralVault[] memory _privateVaults) external initializer {
    // sanity check
    uint256 _creditorLength = _creditors.length;
    for (uint8 _i = 0; _i < _creditorLength; _i++) {
      _creditors[_i].getUserCredit(address(0));
    }

    uint256 _privateVaultLength = _privateVaults.length;
    for (uint8 _i = 0; _i < _privateVaultLength; _i++) {
      _privateVaults[_i].shareToValue(1e18);
    }

    // effect
    OwnableUpgradeable.__Ownable_init();
    creditors = _creditors;
    privateVaults = _privateVaults;
  }

  /// @notice Get total credit for this user
  /// @param _user address of user.
  /// @return _total user's credit in USD value
  function totalCredit(address _user) public view returns (uint256) {
    uint256 _total;
    uint256 _creditorLength = creditors.length;
    for (uint8 _i = 0; _i < _creditorLength; ) {
      _total = _total + creditors[_i].getUserCredit(_user);
      // uncheck overflow to save gas
      unchecked {
        _i++;
      }
    }
    return _total;
  }

  /// @notice Get used credit for this user
  /// @param _user address of user.
  /// @return _total user's used credit in USD value from depositing into private automated vaults
  function usedCredit(address _user) public view returns (uint256) {
    uint256 _total;
    uint256 _privateVaultLength = privateVaults.length;
    for (uint8 _i = 0; _i < _privateVaultLength; ) {
      uint256 _share = userVaultShares[_user][address(privateVaults[_i])];
      if (_share != 0) _total += privateVaults[_i].shareToValue(_share);
      // uncheck overflow to save gas
      unchecked {
        _i++;
      }
    }

    return _total;
  }

  /// @notice Get availableCredit credit for this user
  /// @param _user address of user.
  /// @return _total remaining credit of this user
  function availableCredit(address _user) public view returns (uint256) {
    uint256 _total = totalCredit(_user);
    uint256 _used = usedCredit(_user);
    return _total > _used ? _total - _used : 0;
  }

  /// @notice set private automated vaults
  /// @param _newPrivateVaults list of private automated vaults
  function setPrivateVaults(IDeltaNeutralVault[] memory _newPrivateVaults) external onlyOwner {
    // sanity check
    uint256 _newPrivateVaultLength = _newPrivateVaults.length;
    for (uint8 _i = 0; _i < _newPrivateVaultLength; ) {
      _newPrivateVaults[_i].shareToValue(1e18);
      // uncheck overflow to save gas
      unchecked {
        _i++;
      }
    }

    // effect
    privateVaults = _newPrivateVaults;

    emit LogSetPrivateVaults(msg.sender, _newPrivateVaults);
  }

  /// @notice set private automated vaults
  /// @param _newCreditors list of credit sources
  function setCreditors(ICreditor[] memory _newCreditors) external onlyOwner {
    // sanity check
    uint256 _newCreditorLength = _newCreditors.length;
    for (uint8 _i = 0; _i < _newCreditorLength; ) {
      _newCreditors[_i].getUserCredit(address(0));
      // uncheck overflow to save gas
      unchecked {
        _i++;
      }
    }

    // effect
    creditors = _newCreditors;

    emit LogSetCreditors(msg.sender, _newCreditors);
  }

  /// @notice record user's automated vault's share from deposit
  /// @param _user share owner
  /// @param _shareAmount amount of automated vault's share
  function onDeposit(address _user, uint256 _shareAmount) external {
    // expected delta vault to be the caller
    userVaultShares[_user][msg.sender] += _shareAmount;
  }

  /// @notice update user's automated vault's share from withdrawal
  /// @param _user share owner
  /// @param _shareAmount amount of automated vault's share withdrawn
  function onWithdraw(address _user, uint256 _shareAmount) external {
    userVaultShares[_user][msg.sender] = userVaultShares[_user][msg.sender] <= _shareAmount
      ? 0
      : userVaultShares[_user][msg.sender] - _shareAmount;
  }

  /// @notice Return share of user of given vault
  /// @param _user share owner
  /// @param _vault delta vault
  function getUserVaultShares(address _user, address _vault) external view returns (uint256) {
    return userVaultShares[_user][_vault];
  }
}
