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

/// @title FakeDeltaNeutralDepositExecutor : A fake executor used for manipulating underlying LYF position
contract FakeDeltaNeutralDepositExecutor {
  FakeDeltaWorker public stableWorker;
  FakeDeltaWorker public assetWorker;
  FakeVault public stableVault;
  FakeVault public assetVault;

  uint256 public depositValue;
  uint256 public borrowValue;
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

  function setExecutionValue(uint256 _depositValue, uint256 _borrowValue) external {
    depositValue = _depositValue;
    borrowValue = _borrowValue;
  }

  function exec(
    bytes memory /*_data*/
  ) external {
    uint256 _lpToAdd = ((depositValue + borrowValue) * 1e18) / lpPrice;

    stableWorker.setTotalLpBalance(stableWorker.totalLpBalance() + (_lpToAdd / 4));
    assetWorker.setTotalLpBalance(assetWorker.totalLpBalance() + ((_lpToAdd * 3) / 4));

    stableVault.setDebt(
      stableVault.vaultDebtShare() + (borrowValue / 4),
      stableVault.vaultDebtVal() + (borrowValue / 4)
    );
    assetVault.setDebt(
      assetVault.vaultDebtShare() + ((borrowValue * 3) / 4),
      assetVault.vaultDebtVal() + ((borrowValue * 3) / 4)
    );
  }
}
