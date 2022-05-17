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

/// @title FakeDeltaWorker : A fake worker used for unit testing
contract FakeDeltaNeutralOracle {
  // dev - all token is 1e18
  function getTokenPrice(
    address /*_token*/
  ) external view returns (uint256, uint256) {
    return (1e18, block.timestamp);
  }

  // dev - all lp token is 2e18 as presumably there will be 2 tokens in lp token
  function lpToDollar(
    uint256 _lpAmount,
    address /*_pancakeLPToken*/
  ) external view returns (uint256, uint256) {
    return ((2e18 * _lpAmount) / 1e18, block.timestamp);
  }
}
