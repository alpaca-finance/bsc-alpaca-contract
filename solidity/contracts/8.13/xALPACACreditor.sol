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

import { IxALPACA } from "./interfaces/IxALPACA.sol";
import { ICreditor } from "./interfaces/ICreditor.sol";

/// @title xALPACACreditor - Assess credit of user per xALPACA that user's holding
contract xALPACACreditor is OwnableUpgradeable, ICreditor {
  // --- Events ---
  event Log_SetValuePerxALPACA(address indexed _caller, uint256 _oldValuePerxALPACA, uint256 _newValuePerxALPACA);

  // --- Errors ---
  error xALPACACreditor_ValueTooHigh();

  // --- States ---
  IxALPACA public xALPACA;
  uint256 public valuePerxALPACA;

  /// @notice Initialize xALPACACreditor
  /// @param _xALPACA xALPACA.
  /// @param _valuePerxALPACA USD value per 1 xALPACA
  function initialize(IxALPACA _xALPACA, uint256 _valuePerxALPACA) external initializer {
    // sanity check
    _xALPACA.epoch();

    OwnableUpgradeable.__Ownable_init();
    xALPACA = IxALPACA(_xALPACA);
    valuePerxALPACA = _valuePerxALPACA;
  }

  /// @notice Get user's credit in USD value
  /// @param _user address of user.
  /// @return user's credit in USD value
  function getUserCredit(address _user) external view returns (uint256) {
    return (xALPACA.balanceOf(_user) * valuePerxALPACA) / 1e18;
  }

  /// @notice Set the value per xALPACA
  /// @param _newValuePerxALPACA new value to be set.
  function setValuePerxALPACA(uint256 _newValuePerxALPACA) external onlyOwner {
    if (_newValuePerxALPACA > 1000 * 1e18) {
      revert xALPACACreditor_ValueTooHigh();
    }

    uint256 _oldValuePerxALPACA = valuePerxALPACA;
    valuePerxALPACA = _newValuePerxALPACA;

    emit Log_SetValuePerxALPACA(msg.sender, _oldValuePerxALPACA, _newValuePerxALPACA);
  }
}
