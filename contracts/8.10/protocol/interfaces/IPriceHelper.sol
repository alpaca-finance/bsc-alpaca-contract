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

interface IPriceHelper {
  /// @dev Return value in USD for the given lpAmount.
  function lpToDollar(uint256 lpAmount, address pancakeLPToken) external view returns (uint256);

  /// @dev Return amount of LP for the given USD.
  function dollarToLp(uint256 dollarAmount, address lpToken) external view returns (uint256);

  /// @dev Return value of given token in USD.
  function getTokenPrice(address token) external view returns (uint256);
}
