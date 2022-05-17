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

pragma solidity 0.8.13;

/// @title FakeDeltaWorker : A fake worker used for unit testing
contract FakeVault {
  // token()
  address public token;

  // nextPositionID()
  uint256 public nextPositionID = 1;

  // vaultDebtShare()
  uint256 public vaultDebtShare;

  // vaultDebtVal()
  uint256 public vaultDebtVal;

  constructor(address _token) {
    token = _token;
  }

  function pendingInterest(
    uint256 /*value*/
  ) public pure returns (uint256) {
    return 0;
  }

  function positions(
    uint256 /*posID*/
  )
    external
    view
    returns (
      address worker,
      address owner,
      uint256 debtShare
    )
  {
    return (worker, owner, 0);
  }
}
