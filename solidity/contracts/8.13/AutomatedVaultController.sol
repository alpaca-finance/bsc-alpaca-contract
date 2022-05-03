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

contract AutomatedVaultController is OwnableUpgradeable {
  // --- Events ---

  // --- Errors ---

  // --- State Variables ---

  ICreditor[] public creditors;

  function initialize(ICreditor[] memory _creditors) external initializer {
    // sanity check
    for (uint8 _i = 0; _i < _creditors.length; _i++) {
      _creditors[_i].getUserCredit(address(0));
    }

    OwnableUpgradeable.__Ownable_init();
    creditors = _creditors;
  }

  function totalCredit(address _user) external view returns (uint256) {
    uint256 _total = 0;
    for (uint8 _i = 0; _i < creditors.length; _i++) {
      _total = _total + creditors[_i].getUserCredit(_user);
    }
    return _total;
  }
}
