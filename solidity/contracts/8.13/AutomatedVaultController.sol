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

  ICreditor public creditor;

  function initialize(ICreditor _creditor) external initializer {
    // sanity check
    _creditor.getUserCredit(address(0));

    OwnableUpgradeable.__Ownable_init();
    creditor = _creditor;
  }

  function outstandingCredit(address _user) external returns (uint256) {
    return creditor.getUserCredit(_user);
  }
}
