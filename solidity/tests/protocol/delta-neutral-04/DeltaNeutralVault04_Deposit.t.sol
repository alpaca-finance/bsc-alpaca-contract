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
contract DeltaNeutralVault04_DepositTest is DeltaNeutralVault04Base_Test {
  function setUp() public override {
    super.setUp();
  }

  function testCorrectness_depositShouldWorkIfBorrowAmountIsCorrect() external {
    _depositForAlice();
  }

  function testRevert_depositShouldRevertIfBorrowValueIsOff() external {
    uint256 _depositValue = 100 ether;
    uint256 _borrowValue = _depositValue * 3; // 4x leverage

    _depositExecutor.setExecutionValue(_depositValue, _borrowValue);

    vm.expectRevert(abi.encodeWithSignature("DeltaNeutralVault04HealthChecker_UnsafeDebtValue()"));
    _deltaNeutralVault.deposit(100 ether, 0, ALICE, 100 ether, abi.encode(0));

    _borrowValue = _depositValue * 1; // 1x leverage
    _depositExecutor.setExecutionValue(_depositValue, _borrowValue);

    vm.expectRevert(abi.encodeWithSignature("DeltaNeutralVault04HealthChecker_UnsafeDebtValue()"));
    _deltaNeutralVault.deposit(100 ether, 0, ALICE, 100 ether, abi.encode(0));
  }

  function testRevert_depositWithAssetTokenShouldIgnoreTheAssetToken() external {
    uint256 _depositValue = 100 ether;
    uint256 _borrowValue = _depositValue * 2; // 4x leverage

    _depositExecutor.setExecutionValue(_depositValue, _borrowValue);

    uint256 _assetTokenAmountBefore = _assetToken.balanceOf(address(this));

    // Note that we put 200 asset token in but it shouldn't be used
    _deltaNeutralVault.deposit(100 ether, 200 ether, ALICE, 0 ether, abi.encode(0));

    uint256 _assetTokenAmountAfter = _assetToken.balanceOf(address(this));

    assertEq(_assetTokenAmountBefore, _assetTokenAmountAfter);
    assertEq(_deltaNeutralVault.balanceOf(ALICE), 100 ether);
  }
}
