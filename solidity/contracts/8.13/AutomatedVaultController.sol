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
  // list of creditors
  ICreditor[] public creditors;
  // list of private vault
  IDeltaNeutralVault[] public privateVaults;
  // User.deltavault.share
  mapping(bytes32 => uint256) public userVaultShares;

  /// @notice Initialize Automated Vault Controller
  /// @param _creditors list of credit sources
  /// @param _privateVaults list of private automated vaults
  function initialize(ICreditor[] memory _creditors, IDeltaNeutralVault[] memory _privateVaults) external initializer {
    // sanity check
    for (uint8 _i = 0; _i < _creditors.length; _i++) {
      _creditors[_i].getUserCredit(address(0));
    }
    for (uint8 _i = 0; _i < _privateVaults.length; _i++) {
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
    uint256 _total = 0;
    for (uint8 _i = 0; _i < creditors.length; _i++) {
      _total = _total + creditors[_i].getUserCredit(_user);
    }
    return _total;
  }

  /// @notice Get used credit for this user
  /// @param _user address of user.
  /// @return _total user's used credit in USD value from depositing into private automated vaults
  function usedCredit(address _user) public view returns (uint256) {
    uint256 _total = 0;
    for (uint8 _i = 0; _i < privateVaults.length; _i++) {
      uint256 _share = userVaultShares[getId(_user, address(privateVaults[_i]))];
      if (_share != 0) _total += privateVaults[_i].shareToValue(_share);
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
    for (uint8 _i = 0; _i < _newPrivateVaults.length; _i++) {
      _newPrivateVaults[_i].shareToValue(1e18);
    }

    // effect
    privateVaults = _newPrivateVaults;

    emit LogSetPrivateVaults(msg.sender, _newPrivateVaults);
  }

  /// @notice set private automated vaults
  /// @param _newCreditors list of credit sources
  function setCreditors(ICreditor[] memory _newCreditors) external onlyOwner {
    // sanity check
    for (uint8 _i = 0; _i < _newCreditors.length; _i++) {
      _newCreditors[_i].getUserCredit(address(0));
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
    userVaultShares[getId(_user, msg.sender)] += _shareAmount;
  }

  /// @notice update user's automated vault's share from withdrawal
  /// @param _user share owner
  /// @param _shareAmount amount of automated vault's share withdrawn
  function onWithdraw(address _user, uint256 _shareAmount) external {
    bytes32 _userVaultId = getId(_user, msg.sender);
    userVaultShares[_userVaultId] = userVaultShares[_userVaultId] <= _shareAmount
      ? 0
      : userVaultShares[_userVaultId] - _shareAmount;
  }

  function getId(address _user, address _vault) public pure returns (bytes32) {
    return keccak256(abi.encodePacked(_user, _vault));
  }
}
