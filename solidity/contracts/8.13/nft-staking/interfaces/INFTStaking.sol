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

interface INFTStaking {
  function userHighestWeightNftAddress(address _user) external view returns (address);

  function isStaked(
    address _nftAddress,
    address _user,
    uint256 _nftTokenId
  ) external view returns (bool);
}
