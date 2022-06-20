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

/// @title FakeExecutor : A fake executor used for manipulating underlying LYF position
contract FakeDepositExecutor {
  FakeDeltaWorker public worker;
  FakeVault public vault;

  uint256 public depositValue;
  uint256 public borrowValue;
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

  function setExecutionValue(uint256 _depositValue, uint256 _borrowValue) external {
    depositValue = _depositValue;
    borrowValue = _borrowValue;
  }

  function exec(
    bytes memory /*_data*/
  ) external {
    uint256 _lpToAdd = ((depositValue + borrowValue) * 1e18) / lpPrice;
    worker.setTotalLpBalance(worker.totalLpBalance() + _lpToAdd);

    vault.setDebt(vault.vaultDebtShare() + borrowValue, vault.vaultDebtVal() + borrowValue);
  }
}
