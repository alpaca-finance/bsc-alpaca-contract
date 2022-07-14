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

/// @title FakeDeltaNeutralWithdrawExecutor : A fake executor used for manipulating underlying LYF position
contract FakeDeltaNeutralWithdrawExecutor {
  FakeDeltaWorker public stableWorker;
  FakeDeltaWorker public assetWorker;

  FakeVault public stableVault;
  FakeVault public assetVault;

  uint256 public withdrawValue;
  uint256 public repayDebtValue;
  uint256 public lpPrice;

  address public stableToken;
  address public assetToken;

  constructor(
    address _stableVault,
    address _assetVault,
    address _stableWorker,
    address _assetWorker,
    uint256 _lpPrice,
    address _stableToken,
    address _assetToken
  ) {
    stableWorker = FakeDeltaWorker(_stableWorker);
    assetWorker = FakeDeltaWorker(_assetWorker);
    stableVault = FakeVault(_stableVault);
    assetVault = FakeVault(_assetVault);
    lpPrice = _lpPrice;
    stableToken = _stableToken;
    assetToken = _assetToken;
  }

  function setExecutionValue(uint256 _withdrawValue, uint256 _repayDebtValue) external {
    withdrawValue = _withdrawValue;
    repayDebtValue = _repayDebtValue;
  }

  function exec(
    bytes memory /*_data*/
  ) external {
    uint256 _lpToRemove = ((withdrawValue + repayDebtValue) * 1e18) / lpPrice;
    stableWorker.setTotalLpBalance(stableWorker.totalLpBalance() - (_lpToRemove / 4));
    assetWorker.setTotalLpBalance(assetWorker.totalLpBalance() - ((_lpToRemove * 3) / 4));

    stableVault.setDebt(
      stableVault.vaultDebtShare() - (repayDebtValue / 4),
      stableVault.vaultDebtVal() - (repayDebtValue / 4)
    );

    assetVault.setDebt(
      assetVault.vaultDebtShare() - ((repayDebtValue * 3) / 4),
      assetVault.vaultDebtVal() - ((repayDebtValue * 3) / 4)
    );

    // assume that stable token is 1 USD
    MockErc20Like(stableToken).transfer(msg.sender, withdrawValue);
  }
}
