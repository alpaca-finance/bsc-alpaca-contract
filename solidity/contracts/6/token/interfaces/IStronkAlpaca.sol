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

pragma solidity 0.6.6;

interface IStronkAlpaca {
  function prepareHodl() external;
  function hodl() external;
  function unhodl() external;

  event PrepareHodl(address indexed user, address indexed relayer);
  event Hodl(address indexed user, address indexed relayer, uint256 receivingStronkAlpacaAmount);
  event Unhodl(address indexed user, uint256 receivingAlpacaAmount);
}
