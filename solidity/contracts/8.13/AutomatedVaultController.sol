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

contract AutomatedVaultController is OwnableUpgradeable {
  // --- Events ---

  // --- Errors ---

  // --- State Variables ---

  // list of creditors
  ICreditor[] public creditors;
  // list of private vault
  IDeltaNeutralVault[] public privateVaults;
  // User.deltavault.share
  mapping(address => mapping(address => uint256)) public userVaultShares;

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

  function totalCredit(address _user) public view returns (uint256) {
    uint256 _total = 0;
    for (uint8 _i = 0; _i < creditors.length; _i++) {
      _total = _total + creditors[_i].getUserCredit(_user);
    }
    return _total;
  }

  function usedCredit(address _user) public view returns (uint256) {
    uint256 _total = 0;
    for (uint8 _i = 0; _i < privateVaults.length; _i++) {
      uint256 _share = userVaultShares[_user][address(privateVaults[_i])];
      if (_share != 0) _total += privateVaults[_i].shareToValue(_share);
    }

    return _total;
  }

  function availableCredit(address _user) public view returns (uint256) {
    uint256 _total = totalCredit(_user);
    uint256 _used = usedCredit(_user);
    return _total > _used ? _total - _used : 0;
  }

  function setPrivateVaults(IDeltaNeutralVault[] memory _newPrivateVaults) external onlyOwner {
    // sanity check
    for (uint8 _i = 0; _i < _newPrivateVaults.length; _i++) {
      _newPrivateVaults[_i].shareToValue(1e18);
    }

    // effect
    privateVaults = _newPrivateVaults;
  }

  function onDeposit(address _user, uint256 _shareAmount) external {
    // expected delta vault to be the caller
    userVaultShares[_user][msg.sender] += _shareAmount;
  }

  function onWithdraw(address _user, uint256 _shareAmount) external {
    userVaultShares[_user][msg.sender] = userVaultShares[_user][msg.sender] <= _shareAmount
      ? 0
      : userVaultShares[_user][msg.sender] - _shareAmount;
  }
}
