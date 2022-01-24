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

interface IPriceHelper {
  /// @dev Return value in USD for the given lpAmount.
  function lpToDollar(uint256 lpAmount, address lpToken) external view returns (uint256);

  /// @dev Return amount of LP for the given USD.
  function dollarToLP(uint256 dollarAmount, address lpToken) external view returns (uint256);

  /// @dev Return value in USD for the given tokenAddress.
  function getTokenPrice(address tokenAddress) external view returns (uint256);
}
