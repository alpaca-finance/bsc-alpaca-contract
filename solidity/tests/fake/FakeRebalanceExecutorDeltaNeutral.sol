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

import "../interfaces/MockErc20Like.sol";
import { FakeDeltaWorker } from "./FakeDeltaWorker.sol";
import { FakeVault } from "./FakeVault.sol";
import { console } from "../utils/console.sol";

/// @title FakeRebalanceExecutorDeltaNeutral : A fake executor used for manipulating underlying LYF position
contract FakeRebalanceExecutorDeltaNeutral {
  FakeDeltaWorker public stableWorker;
  FakeDeltaWorker public assetWorker;

  FakeVault public stableVault;
  FakeVault public assetVault;

  uint256 public debtValue;
  uint256 public positionValue;

  uint256 public lpPrice;

  constructor(
    address _stableVault,
    address _assetVault,
    address _stableWorker,
    address _assetWorker,
    uint256 _lpPrice
  ) {
    stableWorker = FakeDeltaWorker(_stableWorker);
    assetWorker = FakeDeltaWorker(_assetWorker);
    stableVault = FakeVault(_stableVault);
    assetVault = FakeVault(_assetVault);
    lpPrice = _lpPrice;
  }

  function setExecutionValue(uint256 _positionValue, uint256 _debtValue) external {
    positionValue = _positionValue;
    debtValue = _debtValue;
  }

  function exec(
    bytes memory /*_data*/
  ) external {
    uint256 _lpToAdd = ((positionValue + debtValue) * 1e18) / lpPrice;

    stableWorker.setTotalLpBalance((_lpToAdd / 4));
    assetWorker.setTotalLpBalance(((_lpToAdd * 3) / 4));

    stableVault.setDebt((debtValue / 4), (debtValue / 4));
    assetVault.setDebt(((debtValue * 3) / 4), ((debtValue * 3) / 4));
  }
}
