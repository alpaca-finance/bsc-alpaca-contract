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

pragma solidity 0.8.10;

contract MockPriceHelper {
  constructor() public {}

  function getTokenPrice(address token) external view returns (uint256) {
    return 1e18;
  }

  function lpToDollar(uint256 amount, address lpToken) external view returns (uint256) {
    return (amount * 1e18) / 1e18;
  }
}
