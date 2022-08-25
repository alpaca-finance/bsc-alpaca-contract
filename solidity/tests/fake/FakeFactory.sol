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

pragma solidity 0.8.13;

/// @title FakeFactory - Return fix LP address given any two token
contract FakeFactory {
  address public lpForRemoveLiquidity;

  function setLpTokenForRemoveLiquidity(address _lp) external {
    lpForRemoveLiquidity = _lp;
  }
}
