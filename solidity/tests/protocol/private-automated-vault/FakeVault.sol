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

import "../../interfaces/MockErc20Like.sol";
import { FakeDeltaWorker } from "./FakeDeltaWorker.sol";
import "../../utils/console.sol";

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

  // need this for convienience
  uint256 public lpPrice;

  constructor(address _token, uint256 _lpPrice) {
    token = _token;
    lpPrice = _lpPrice;
  }

  function pendingInterest(
    uint256 /*value*/
  ) public pure returns (uint256) {
    return 0;
  }

  // only one position in the fake vault
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
    return (worker, owner, vaultDebtShare);
  }

  function work(
    uint256 id,
    address worker,
    uint256 principalAmount,
    uint256 borrowAmount,
    uint256 maxReturn,
    bytes calldata data
  ) external payable {
    // Move funds from caller
    MockErc20Like(token).transferFrom(msg.sender, address(this), principalAmount);

    // Set the LP amount of worker to simulate work
    // todo: distinquish addTwoSide or PartialClose
    uint256 _lpBalance = ((principalAmount + borrowAmount) * 1e18) / lpPrice;
    FakeDeltaWorker(worker).setTotalLpBalance(_lpBalance);

    // debt share always = debt value
    vaultDebtShare += borrowAmount;
    vaultDebtVal += borrowAmount;
  }
}
