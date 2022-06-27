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

import { IAUSDStaking } from "./interfaces/IAUSDStaking.sol";
import { ICreditor } from "./interfaces/ICreditor.sol";

/// @title AUSDStakingCreditor - Assess credit of user per AUSD-3EPS LP that user's locking
contract AUSDStakingCreditor is OwnableUpgradeable, ICreditor {
  // --- Events ---
  event LogSetValuePerAUSDStaking(
    address indexed _caller,
    uint256 _oldValuePerAUSDStaking,
    uint256 _newValuePerAUSDStaking
  );
  event LogSetValueSetter(address indexed _caller, address indexed _valueSetter);

  // --- Errors ---
  error AUSDStakingCreditor_ValueTooHigh();
  error AUSDStakingCreditor_Unauthorize();

  // --- States ---
  IAUSDStaking public AUSDStaking;
  uint256 public valuePerAUSDStaking;
  address public valueSetter;

  /// @notice Initialize AUSDStakingCreditor
  /// @param _AUSDStaking AUSD-3EPS.
  /// @param _valuePerAUSDStaking USD value per 1 AUSD-3EPS LP
  function initialize(IAUSDStaking _AUSDStaking, uint256 _valuePerAUSDStaking) external initializer {
    OwnableUpgradeable.__Ownable_init();
    AUSDStaking = IAUSDStaking(_AUSDStaking);
    valuePerAUSDStaking = _valuePerAUSDStaking;
  }

  /// @notice Get user's credit in USD value
  /// @param _user address of user.
  /// @return user's credit in USD value
  function getUserCredit(address _user) external view returns (uint256) {
    return (AUSDStaking.balanceOf(_user) * valuePerAUSDStaking) / 1e18;
  }

  /// @notice set the value setter
  function setValueSetter(address _newValueSetter) external onlyOwner {
    valueSetter = _newValueSetter;
    emit LogSetValueSetter(msg.sender, _newValueSetter);
  }

  /// @notice Set the value per AUSDStaking
  /// @param _newValuePerAUSDStaking new value to be set.
  function setValuePerAUSDStaking(uint256 _newValuePerAUSDStaking) external {
    if (msg.sender != valueSetter) {
      revert AUSDStakingCreditor_Unauthorize();
    }
    if (_newValuePerAUSDStaking > 1000 * 1e18) {
      revert AUSDStakingCreditor_ValueTooHigh();
    }

    uint256 _oldValuePerAUSDStaking = valuePerAUSDStaking;
    valuePerAUSDStaking = _newValuePerAUSDStaking;

    emit LogSetValuePerAUSDStaking(msg.sender, _oldValuePerAUSDStaking, _newValuePerAUSDStaking);
  }
}
