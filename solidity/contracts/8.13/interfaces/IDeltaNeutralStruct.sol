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

interface IDeltaNeutralStruct {
  struct PositionInfo {
    uint256 stablePositionEquity;
    uint256 stablePositionDebtValue;
    uint256 stableLpAmount;
    uint256 assetPositionEquity;
    uint256 assetPositionDebtValue;
    uint256 assetLpAmount;
  }
}
