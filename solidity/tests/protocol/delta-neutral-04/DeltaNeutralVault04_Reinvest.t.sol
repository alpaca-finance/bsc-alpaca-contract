// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { DeltaNeutralVault04Base_Test } from "./DeltaNeutralVault04Base.t.sol";

import { BaseTest, DeltaNeutralVault04Like, MockErc20Like, MockLpErc20Like, console } from "../../base/BaseTest.sol";
import { mocking } from "../../utils/mocking.sol";

import { DeltaNeutralVault04HealthChecker } from "../../../contracts/8.13/DeltaNeutralVault04HealthChecker.sol";
import { FakeDeltaWorker } from "../../fake/FakeDeltaWorker.sol";
import { FakeAutomateVaultController } from "../../fake/FakeAutomateVaultController.sol";
import { FakeDeltaNeutralOracle } from "../../fake/FakeDeltaNeutralOracle.sol";
import { FakeVault } from "../../fake/FakeVault.sol";
import { FakeDeltaNeutralVaultConfig02 } from "../../fake/FakeDeltaNeutralVaultConfig02.sol";
import { FakeDeltaNeutralDepositExecutor } from "../../fake/FakeDeltaNeutralDepositExecutor.sol";
import { FakeDeltaNeutralWithdrawExecutor } from "../../fake/FakeDeltaNeutralWithdrawExecutor.sol";
import { FakeDeltaNeutralRebalanceExecutor } from "../../fake/FakeDeltaNeutralRebalanceExecutor.sol";
import { FakeDeltaNeutralReinvestExecutor } from "../../fake/FakeDeltaNeutralReinvestExecutor.sol";
import { FakeRouter } from "../../fake/FakeRouter.sol";
import { FakeFairLaunch } from "../../fake/FakeFairLaunch.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract DeltaNeutralVault04_RebalanceTest is DeltaNeutralVault04Base_Test {
  function setUp() public override {
    super.setUp();
  }

  function testCorrectness_ReinvestShouldWorkIfEquityIsNotLost() external {
    _alpacaToken.mint(address(_deltaNeutralVault), 100 ether);
    _reinvestExecutor.setExecutionValue(200 ether, 400 ether);

    _deltaNeutralVault.reinvest(abi.encode(0), 0);
  }

  function testRevert_ReinvestShouldRevertIfEquityIsLost() external {
    _alpacaToken.mint(address(_deltaNeutralVault), 100 ether);
    _reinvestExecutor.setExecutionValue(100 ether, 200 ether);

    vm.expectRevert(abi.encodeWithSignature("DeltaNeutralVault04_UnsafePositionEquity()"));
    _deltaNeutralVault.reinvest(abi.encode(0), 0);
  }
}
