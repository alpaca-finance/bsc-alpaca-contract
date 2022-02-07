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
  function whitelistedCallers(address _caller) external view returns (bool);

  /// @dev Return if the caller is whitelisted.
  function whitelistedRebalancers(address _caller) external view returns (bool);

  /// @dev Return if the caller is exempted from fee.
  function feeExemptedCallers(address _caller) external returns (bool);

  /// @dev Get fairlaunch address.
  function fairLaunchAddr() external view returns (address);

  /// @dev Get deposit fee.
  function depositFeeBps() external view returns (uint256);

  /// @dev Get withdrawal fee.
  function withdrawalFeeBps() external returns (uint256);

  /// @dev Get leverage level.
  function leverageLevel() external view returns (uint8);

  /// @dev Return the address of treasury account
  function getTreasuryAddr() external view returns (address);

  /// @dev Return if the caller is whitelisted.
  function whitelistedReinvestors(address _caller) external view returns (bool);

  /// @dev Return alpaca bounty bps.
  function alpacaBountyBps() external view returns (uint256);

  /// @dev Return if delta neutral vault position value acceptable.
  function isVaultSizeAcceptable(uint256 _totalPositionValue) external view returns (bool);

  /// @dev Return management fee bps per year.
  function mangementFeeBps() external view returns (uint256);

  /// @dev Return swap router
  function getSwapRouter() external view returns (address);

  /// @dev Return reinvest path
  function getReinvestPath() external view returns (address[] memory);
}
