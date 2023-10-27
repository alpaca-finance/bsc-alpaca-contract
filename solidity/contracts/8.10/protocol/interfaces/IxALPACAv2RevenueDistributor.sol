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

interface IxALPACAv2RevenueDistributor {
  function ALPACA() external view returns (address);

  function feed(uint256 _rewardAmount, uint256 _newRewardEndTimestamp) external;

  function rewardEndTimestamp() external view returns (uint256);
}
