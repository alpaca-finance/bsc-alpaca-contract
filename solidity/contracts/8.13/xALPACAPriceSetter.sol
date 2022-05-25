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

import { IxALPACACreditor } from "./interfaces/IxALPACACreditor.sol";
import { ITWAPOracle } from "./interfaces/ITWAPOracle.sol";

/// @title xALPACAPriceSetter - Being setter of xALPACACreditor
contract xALPACAPriceSetter is OwnableUpgradeable {
  // --- Events ---
  event LogSetValueFromTWAP(address indexed _caller, uint256 _xALPACAValue);

  // --- Errors ---

  // --- States ---
  IxALPACACreditor public xALPACACreditor;
  ITWAPOracle public TWAPOracle;
  address public alpaca;
  
  /// @notice Initialize xALPACAPriceSetter
  /// @param _xALPACACreditor xALPACreditor
  /// @param _TWAPOracle TWAPOracle
  /// @param _alpaca Contract's address of ALPACA Token
  function initialize(IxALPACACreditor _xALPACACreditor, ITWAPOracle _TWAPOracle, address _alpaca) external initializer {

    OwnableUpgradeable.__Ownable_init();
    xALPACACreditor = IxALPACACreditor(_xALPACACreditor);
    TWAPOracle = _TWAPOracle;
    alpaca = _alpaca;
  }

  /// @notice Set ALPACA Value (TWAP) as xALPACA Value
  function setValueFromTWAP() external onlyOwner {
    uint256 _xALPACAValue = TWAPOracle.getPrice(alpaca);
    xALPACACreditor.setValuePerxALPACA(_xALPACAValue);

    emit LogSetValueFromTWAP(msg.sender, _xALPACAValue);
  }

}