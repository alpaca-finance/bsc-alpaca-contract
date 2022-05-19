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

interface IController {
  function totalCredit(address _user) external view returns (uint256);

  function usedCredit(address _user) external view returns (uint256);

  function availableCredit(address _user) external view returns (uint256);

  function onDeposit(address _user, uint256 _shareAmount) external;

  function onWithdraw(address _user, uint256 _shareAmount) external;
}
