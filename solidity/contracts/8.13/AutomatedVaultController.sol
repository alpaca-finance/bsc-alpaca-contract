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
import { LinkList } from "./utils/LinkList.sol";

/// @title AutomatedVaultController - Controller how much investor can invest in the private automated vault
contract AutomatedVaultController is OwnableUpgradeable {
  using LinkList for LinkList.List;

  // --- Events ---
  event LogAddPrivateVaults(address indexed _caller, IDeltaNeutralVault[] _vaults);
  event LogRemovePrivateVaults(address indexed _caller, address[] _vaults);
  event LogSetCreditors(address indexed _caller, ICreditor[] _creditors);

  // --- Errors ---
  error AutomatedVaultController_Unauthorized();
  error AutomatedVaultController_OutstandingCredit();
  error AutomatedVaultController_InsufficientCredit();

  // --- State Variables ---
  ICreditor[] public creditors;
  LinkList.List public privateVaults;

  mapping(address => LinkList.List) public userVaults;
  mapping(address => mapping(address => uint256)) public userVaultShares;

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

    privateVaults.init();
    for (uint8 _i = 0; _i < _privateVaults.length; ) {
      privateVaults.add(address(_privateVaults[_i]));
      unchecked {
        _i++;
      }
    }
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
    LinkList.List storage _userVaults = userVaults[_user];
    uint256 _length = _userVaults.length();

    if (_length == 0) return 0;

    address _curVault = _userVaults.getNextOf(LinkList.start);
    for (uint8 _i = 0; _i < _length; ) {
      uint256 _share = userVaultShares[_user][_curVault];
      if (_share != 0) _total += IDeltaNeutralVault(_curVault).shareToValue(_share);
      _curVault = _userVaults.getNextOf(_curVault);
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

  /// @notice add private automated vaults
  /// @param _newPrivateVaults list of private automated vaults
  function addPrivateVaults(IDeltaNeutralVault[] memory _newPrivateVaults) external onlyOwner {
    // sanity check
    uint256 _newPrivateVaultLength = _newPrivateVaults.length;
    for (uint8 _i = 0; _i < _newPrivateVaultLength; ) {
      _newPrivateVaults[_i].shareToValue(1e18);

      privateVaults.add(address(_newPrivateVaults[_i]));
      // uncheck overflow to save gas
      unchecked {
        _i++;
      }
    }

    emit LogAddPrivateVaults(msg.sender, _newPrivateVaults);
  }

  /// @notice remove private automated vaults
  /// @param _privateVaultAddresses list of private automated vaults
  function removePrivateVaults(address[] memory _privateVaultAddresses) external onlyOwner {
    // sanity check
    uint256 _newPrivateVaultLength = _privateVaultAddresses.length;
    for (uint8 _i = 0; _i < _newPrivateVaultLength; ) {
      privateVaults.remove(_privateVaultAddresses[_i], privateVaults.getPreviousOf(_privateVaultAddresses[_i]));
      // uncheck overflow to save gas
      unchecked {
        _i++;
      }
    }

    emit LogRemovePrivateVaults(msg.sender, _privateVaultAddresses);
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
  /// @param _shareValue value of automated vault's share that will be deposited
  function onDeposit(
    address _user,
    uint256 _shareAmount,
    uint256 _shareValue
  ) external {
    // Check
    if (!privateVaults.has(msg.sender)) revert AutomatedVaultController_Unauthorized();

    if (totalCredit(_user) < (usedCredit(_user) + _shareValue)) revert AutomatedVaultController_InsufficientCredit();

    // expected delta vault to be the caller
    userVaultShares[_user][msg.sender] += _shareAmount;

    // set user's state
    _initOrInsertUserVaults(_user, msg.sender);
  }

  /// @notice update user's automated vault's share from withdrawal
  /// @param _user share owner
  /// @param _shareAmount amount of automated vault's share withdrawn
  function onWithdraw(address _user, uint256 _shareAmount) external {
    uint256 _updatedShare = userVaultShares[_user][msg.sender] <= _shareAmount
      ? 0
      : userVaultShares[_user][msg.sender] - _shareAmount;

    userVaultShares[_user][msg.sender] = _updatedShare;

    // automatically remove vault from the list
    if (_updatedShare == 0) {
      LinkList.List storage _userVaults = userVaults[_user];
      if (_userVaults.getNextOf(LinkList.start) != LinkList.empty) {
        if (_userVaults.has(msg.sender)) {
          _userVaults.remove(msg.sender, _userVaults.getPreviousOf(msg.sender));
        }
      }
    }
  }

  /// @notice Return share of user of given vault
  /// @param _user share owner
  /// @param _vault delta vault
  function getUserVaultShares(address _user, address _vault) external view returns (uint256) {
    return userVaultShares[_user][_vault];
  }

  function _initOrInsertUserVaults(address _user, address _vault) internal {
    // set user's state
    LinkList.List storage _userVaults = userVaults[_user];
    if (_userVaults.getNextOf(LinkList.start) == LinkList.empty) {
      _userVaults.init();
    }
    if (!_userVaults.has(_vault)) {
      _userVaults.add(_vault);
    }
  }
}
