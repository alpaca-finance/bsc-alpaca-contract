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

pragma solidity 0.8.10;

interface IGenericMasterChef {
  function pendingCake(uint256 _pid, address _user) external view returns (uint256);

  function pendingBSW(uint256 _pid, address _user) external view returns (uint256);

  function pending(uint256 _pid, address _user) external view returns (uint256, uint256);

  function pendingBOO(uint256 _pid, address _user) external view returns (uint256);
}
