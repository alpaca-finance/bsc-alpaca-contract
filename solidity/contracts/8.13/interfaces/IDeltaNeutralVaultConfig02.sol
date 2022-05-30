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

interface IDeltaNeutralVaultConfig02 {
  function getWrappedNativeAddr() external view returns (address);

  function getWNativeRelayer() external view returns (address);

  function rebalanceFactor() external view returns (uint256);

  function positionValueTolerance() external view returns (uint256);

  function debtRatioTolerance() external view returns (uint256);

  /// @dev Return if the caller is whitelisted.
  function whitelistedCallers(address _caller) external view returns (bool);

  /// @dev Return if the caller is whitelisted.
  function whitelistedRebalancers(address _caller) external view returns (bool);

  /// @dev Return if the caller is exempted from fee.
  function feeExemptedCallers(address _caller) external returns (bool);

  /// @dev Get fairlaunch address.
  function fairLaunchAddr() external view returns (address);

  /// @dev Return the deposit fee treasury.
  function depositFeeTreasury() external view returns (address);

  /// @dev Get deposit fee.
  function depositFeeBps() external view returns (uint256);

  /// @dev Return the withdrawl fee treasury.
  function withdrawalFeeTreasury() external view returns (address);

  /// @dev Get withdrawal fee.
  function withdrawalFeeBps() external returns (uint256);

  /// @dev Return management fee treasury
  function managementFeeTreasury() external view returns (address);

  /// @dev Return management fee per sec.
  function managementFeePerSec() external view returns (uint256);

  /// @dev Get leverage level.
  function leverageLevel() external view returns (uint8);

  /// @dev Return if the caller is whitelisted.
  function whitelistedReinvestors(address _caller) external view returns (bool);

  /// @dev Return ALPACA reinvest fee treasury.
  function alpacaReinvestFeeTreasury() external view returns (address);

  /// @dev Return alpaca bounty bps.
  function alpacaBountyBps() external view returns (uint256);

  /// @dev Return ALPACA beneficiary address.
  function alpacaBeneficiary() external view returns (address);

  /// @dev Return ALPACA beneficiary bps.
  function alpacaBeneficiaryBps() external view returns (uint256);

  /// @dev Return if delta neutral vault position value acceptable.
  function isVaultSizeAcceptable(uint256 _totalPositionValue) external view returns (bool);

  /// @dev Return swap router
  function getSwapRouter() external view returns (address);

  /// @dev Return reinvest path
  function getReinvestPath() external view returns (address[] memory);

  /// @dev Return controller address
  function controller() external view returns (address);

  /// @dev Set a new controller
  function setController(address _controller) external;

  /// @dev Return deposit executor
  function depositExecutor() external view returns (address);

  /// @dev Return withdraw executor
  function withdrawExecutor() external view returns (address);

  /// @dev Return rebalance executor
  function rebalanceExecutor() external view returns (address);

  /// @dev Return reinvest executor
  function reinvestExecutor() external view returns (address);

  /// @dev Return if caller is executor.
  function isExecutor(address _caller) external view returns (bool);

  /// @dev Return Partial close minimize strategy address
  function partialCloseMinimizeStrategy() external view returns (address);

  /// @dev Return Stable add two side strategy address
  function stableAddTwoSideStrategy() external view returns (address);

  /// @dev Return Asset add two side strategy address
  function assetAddTwoSideStrategy() external view returns (address);

  /// @dev Return swap fee
  function swapFee() external view returns (uint256);

  /// @dev Return swap fee denom
  function swapFeeDenom() external view returns (uint256);
}
