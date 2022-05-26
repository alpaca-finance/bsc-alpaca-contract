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

interface IxALPACACreditor {
  function getUserCredit(address _user) external view returns (uint256);

  function setValuePerxALPACA(uint256 _newValuePerxALPACA) external;

  function setValueSetter(address _newValueSetter) external;

  function valuePerxALPACA() external view returns (uint256);
}