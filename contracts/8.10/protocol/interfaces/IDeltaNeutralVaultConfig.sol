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

  /// @dev Return if the caller is exempted from fee.
  function feeExemptedCallers(address _caller) external returns (bool);

  /// @dev Get fairlaunch address.
  function fairLaunchAddr() external returns (address);

  /// @dev Return get Router swap Router
  function getSwapRouteRouterAddr(address _source, address _destination) external view returns (address);

  /// @dev Return get RouterSwap Path
  function getSwapRoutePathsAddr(address _source, address _destination) external view returns (address[] memory);

  /// @dev Get deposit fee.
  function depositFeeBps() external returns (uint256);

  /// @dev Get withdrawal fee.
  function withdrawalFeeBps() external returns (uint256);

  /// @dev Get leverage level.
  function leverageLevel() external returns (uint8);

  /// @dev Return the address of treasury account
  function getTreasuryAddr() external view returns (address);

  /// @dev Return if the caller is whitelisted.
  function whitelistedReinvestors(address _caller) external returns (bool);

  /// @dev Return alpaca bounty bps.
  function alpacaBountyBps() external returns (uint256);
}
