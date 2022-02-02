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

interface IDeltaNeutralVaultConfig {
  function getWrappedNativeAddr() external view returns (address);

  function getWNativeRelayer() external view returns (address);

  function rebalanceFactor() external view returns (uint256);

  function positionValueTolerance() external view returns (uint256);

  /// @dev Return if the caller is whitelisted.
  function whitelistedCallers(address _caller) external returns (bool);

  /// @dev Return if the caller is whitelisted.
  function whitelistedRebalancers(address _caller) external returns (bool);

  /// @dev Get fairlaunch address.
  function fairLaunchAddr() external returns (address);

  /// @dev Get deposit fee.
  function depositFeeBps() external returns (uint256);

  /// @dev Get leverage level.
  function leverageLevel() external returns (uint8);

  /// @dev Return the address of treasury account
  function getTreasuryAddr() external view returns (address);
}
