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
  mapping(bytes32 => uint256) public userVaultShares;

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
    uint256 _totalUsed = 0;
    for (uint8 _i = 0; _i < privateVaults.length; _i++) {
      uint256 _share = userVaultShares[getId(_user, address(privateVaults[_i]))];
      if (_share != 0) _totalUsed += privateVaults[_i].shareToValue(_share);
    }

    return _totalUsed;
  }

  function setPrivateVaults(IDeltaNeutralVault[] memory _newPrivateVaults) external {
    // sanity check
    for (uint8 _i = 0; _i < _newPrivateVaults.length; _i++) {
      _newPrivateVaults[_i].shareToValue(1e18);
    }

    // effect
    privateVaults = _newPrivateVaults;
  }

  function onDeposit(address _user, uint256 _shareAmount) external {
    // expected delta vault to be the caller
    userVaultShares[getId(_user, msg.sender)] += _shareAmount;
  }

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
