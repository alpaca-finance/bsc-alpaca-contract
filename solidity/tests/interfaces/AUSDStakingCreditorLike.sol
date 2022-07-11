// SPDX-License-Identifier: MIT
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

pragma solidity >=0.8.4 <0.9.0;

interface AUSDStakingCreditorLike {
  function getUserCredit(address _user) external view returns (uint256);

  function setValuePerAUSDStaking(uint256 _newValuePerAUSD) external;

  function setValueSetter(address _newValueSetter) external;

  function valuePerAUSDStaking() external view returns (uint256);
}
