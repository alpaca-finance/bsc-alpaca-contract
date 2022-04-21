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
import "../interfaces/IVault.sol";
pragma solidity 0.8.10;

contract MockVault is IVault {
  address public override token;

  constructor(address _token) {
    token = _token;
  }

  //@dev Return next position id of vault
  function nextPositionID() external pure override returns (uint256) {
    return 0;
  }

  //@dev Return the pending interest that will be accrued in the next call.
  function pendingInterest(
    uint256 /*value*/
  ) external pure override returns (uint256) {
    return 0;
  }

  function fairLaunchPoolId() external pure override returns (uint256) {
    return 0;
  }

  /// @dev a function for interacting with position
  function work(
    uint256, /*id*/
    address, /*worker*/
    uint256, /*principalAmount*/
    uint256, /*borrowAmount*/
    uint256, /*maxReturn*/
    bytes calldata /*data*/
  ) external payable override {}
}
