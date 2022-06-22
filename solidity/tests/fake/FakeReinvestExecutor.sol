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

/// @title FakeRebalanceExecutor : A fake executor used for manipulating underlying LYF position
contract FakeReinvestExecutor {
  FakeDeltaWorker public worker;
  FakeVault public vault;

  uint256 public debtValue;
  uint256 public positionValue;

  uint256 public lpPrice;

  constructor(
    address _vault,
    address _worker,
    uint256 _lpPrice
  ) {
    worker = FakeDeltaWorker(_worker);
    vault = FakeVault(_vault);
    lpPrice = _lpPrice;
  }

  function setExecutionValue(uint256 _positionValue, uint256 _debtValue) external {
    positionValue = _positionValue;
    debtValue = _debtValue;
  }

  function exec(
    bytes memory /*_data*/
  ) external {
    worker.setTotalLpBalance((positionValue * 1e18) / lpPrice);
    vault.setDebt(debtValue, debtValue);
  }
}
