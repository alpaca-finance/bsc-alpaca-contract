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

interface IDeltaNeutralOracle {
  /// @dev Return value in USD for the given lpAmount.
  function lpToDollar(uint256 _lpAmount, address _pancakeLPToken) external view returns (uint256, uint256);

  /// @dev Return amount of LP for the given USD.
  function dollarToLp(uint256 _dollarAmount, address _lpToken) external view returns (uint256, uint256);

  /// @dev Return value of given token in USD.
  function getTokenPrice(address _token) external view returns (uint256, uint256);

  /// @dev Return value of given token in given denominator token
  function getTokenPrice(address _token, address _denominator) external view returns (uint256, uint256);

  /// @dev Return value in USD for the given lpAmount.
  function lpFairPrice(
    uint256 _lpAmount,
    address _pancakeLPToken,
    address _denominator
  ) external view returns (uint256, uint256);
}
