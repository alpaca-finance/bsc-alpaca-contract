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

  /// @notice get fairlaunch address
  function fairLaunchAddr() external returns (address);

  /// @dev Return get Router swap Router
  function getSwapRouteRouterAddr(address _source, address _destination) external view returns (address);

  /// @dev Return get RouterSwap Path
  function getSwapRoutePathsAddr(address _source, address _destination) external view returns (address[] memory);
}
