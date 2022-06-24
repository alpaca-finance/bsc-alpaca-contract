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

import { IAUSD } from "./interfaces/IAUSD.sol";
import { ICreditor } from "./interfaces/ICreditor.sol";

/// @title AUSDCreditor - Assess credit of user per AUSD-3EPS LP that user's locking
contract AUSDCreditor is OwnableUpgradeable, ICreditor {
  // --- Events ---
  event LogSetValuePerAUSD(address indexed _caller, uint256 _oldValuePerAUSD, uint256 _newValuePerAUSD);
  event LogSetValueSetter(address indexed _caller, address indexed _valueSetter);

  // --- Errors ---
  error AUSDCreditor_ValueTooHigh();
  error AUSDCreditor_Unauthorize();

  // --- States ---
  IAUSD public ausd;
  uint256 public valuePerAusd;
  address public valueSetter;

  /// @notice Initialize AusdCreditor
  /// @param _AUSD AUSD-3EPS.
  /// @param _valuePerAUSD USD value per 1 AUSD-3EPS LP
  function initialize(IAUSD _AUSD, uint256 _valuePerAUSD) external initializer {
    // sanity check
    // _xALPACA.epoch();

    OwnableUpgradeable.__Ownable_init();
    ausd = IAUSD(_AUSD);
    valuePerAusd = _valuePerAUSD;
  }

  /// @notice Get user's credit in USD value
  /// @param _user address of user.
  /// @return user's credit in USD value
  function getUserCredit(address _user) external view returns (uint256) {
    return (ausd.balanceOf(_user) * valuePerAusd) / 1e18;
  }

  /// @notice set the value setter
  function setValueSetter(address _newValueSetter) external onlyOwner {
    valueSetter = _newValueSetter;
    emit LogSetValueSetter(msg.sender, _newValueSetter);
  }

  /// @notice Set the value per AUSD
  /// @param _newValuePerAUSD new value to be set.
  function setValuePerAUSD(uint256 _newValuePerAUSD) external {
    if (msg.sender != valueSetter) {
      revert AUSDCreditor_Unauthorize();
    }
    if (_newValuePerAUSD > 1000 * 1e18) {
      revert AUSDCreditor_ValueTooHigh();
    }

    uint256 _oldValuePerAUSD = valuePerAusd;
    valuePerAusd = _newValuePerAUSD;

    emit LogSetValuePerAusd(msg.sender, _oldValuePerAusd, _newValuePerAusd);
  }
}
