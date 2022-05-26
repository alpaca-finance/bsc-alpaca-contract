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
  event LogSetPriceSetter(address indexed _caller, address indexed _priceSetter);

  // --- Errors ---
  error xALPACAPriceSetter_Unauthorize();

  // --- States ---
  IxALPACACreditor public xALPACACreditor;
  ITWAPOracle public TWAPOracle;
  address public alpaca;
  address public priceSetter;
  
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

  function setPriceSetter(address _priceSetter) external onlyOwner {
    priceSetter = _priceSetter;
    emit LogSetPriceSetter(msg.sender, _priceSetter);
  }

  /// @notice Set ALPACA Value (TWAP) as xALPACA Value
  function setValueFromTWAP() external {
    if (msg.sender != priceSetter) {
      revert xALPACAPriceSetter_Unauthorize();
    }

    uint256 _xALPACAValue = TWAPOracle.getPrice(alpaca);
    xALPACACreditor.setValuePerxALPACA(_xALPACAValue);

    emit LogSetValueFromTWAP(msg.sender, _xALPACAValue);
  }

}