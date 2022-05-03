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

contract xALPACACreditor is OwnableUpgradeable {
  /// @notice Events
  event Log_SetValuePerxALPACA(address indexed _caller, uint256 _oldValuePerxALPACA, uint256 _newValuePerxALPACA);

  /// @notice Errors
  error xALPACACreditor_ValueTooHigh();

  /// @notice States
  IxALPACA public xALPACA;
  uint256 public valuePerxALPACA;

  function initialize(IxALPACA _xALPACA, uint256 _valuePerxALPACA) external initializer {
    // sanity check
    _xALPACA.epoch();

    OwnableUpgradeable.__Ownable_init();
    xALPACA = IxALPACA(_xALPACA);
    valuePerxALPACA = _valuePerxALPACA;
  }

  function getUserCredit(address _user) external view returns (uint256) {
    return (xALPACA.balanceOf(_user) * valuePerxALPACA) / 1e18;
  }

  function setValuePerxALPACA(uint256 _newValuePerxALPACA) external onlyOwner {
    if (_newValuePerxALPACA > 1000 * 1e18) {
      revert xALPACACreditor_ValueTooHigh();
    }

    uint256 _oldValuePerxALPACA = valuePerxALPACA;
    valuePerxALPACA = _newValuePerxALPACA;

    emit Log_SetValuePerxALPACA(msg.sender, _oldValuePerxALPACA, _newValuePerxALPACA);
  }
}
