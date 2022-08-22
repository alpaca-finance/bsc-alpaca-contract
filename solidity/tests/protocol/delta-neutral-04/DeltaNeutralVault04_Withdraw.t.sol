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
contract DeltaNeutralVault04_WithdrawTest is DeltaNeutralVault04Base_Test {
  function setUp() public override {
    super.setUp();
  }

  function testCorrectness_withdrawShouldWork() external {
    _depositForAlice();

    uint256 _withdrawValue = 100 ether;
    uint256 _repayDebtValue = _withdrawValue * 2; // 3x leverage

    _withdrawExecutor.setExecutionValue(_withdrawValue, _repayDebtValue);

    vm.prank(ALICE);
    // Withdraw executor will always return stable
    _deltaNeutralVault.withdraw(100 ether, 100, 0, abi.encode(0));

    assertEq(_deltaNeutralVault.balanceOf(ALICE), 0 ether);
    assertEq(_stableToken.balanceOf(ALICE), 100 ether);
  }

  function testRevert_withdrawShouldRevertIfDebtRatioIsOff() external {
    _depositForAlice();

    uint256 _withdrawValue = 100 ether;
    uint256 _repayDebtValue = _withdrawValue * 1; // 3x leverage

    _withdrawExecutor.setExecutionValue(_withdrawValue, _repayDebtValue);

    vm.prank(ALICE);
    // Withdraw executor will always return stable
    vm.expectRevert(abi.encodeWithSignature("DeltaNeutralVault04HealthChecker_UnsafeDebtRatio()"));
    _deltaNeutralVault.withdraw(100 ether, 100, 0, abi.encode(0));
  }
}
