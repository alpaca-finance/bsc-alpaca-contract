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

/// @title FakeWithdrawExecutor : A fake executor used for manipulating underlying LYF position
contract FakeWithdrawExecutor {
  FakeDeltaWorker public worker;
  FakeVault public vault;

  uint256 public withdrawValue;
  uint256 public repayDebtValue;
  uint256 public lpPrice;

  address public stableToken;

  constructor(
    address _vault,
    address _worker,
    uint256 _lpPrice,
    address _stableToken
  ) {
    worker = FakeDeltaWorker(_worker);
    vault = FakeVault(_vault);
    lpPrice = _lpPrice;
    stableToken = _stableToken;
  }

  function setExecutionValue(uint256 _withdrawValue, uint256 _repayDebtValue) external {
    withdrawValue = _withdrawValue;
    repayDebtValue = _repayDebtValue;
  }

  function exec(
    bytes memory /*_data*/
  ) external {
    uint256 _lpToRemove = ((withdrawValue + repayDebtValue) * 1e18) / lpPrice;
    worker.setTotalLpBalance(worker.totalLpBalance() - _lpToRemove);

    vault.setDebt(vault.vaultDebtShare() - repayDebtValue, vault.vaultDebtVal() - repayDebtValue);

    // assume that stable token is 1 USD
    MockErc20Like(stableToken).transfer(msg.sender, withdrawValue);
  }
}
