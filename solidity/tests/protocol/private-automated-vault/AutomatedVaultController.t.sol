// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, AutomatedVaultControllerLike } from "../../base/BaseTest.sol";
import { mocking } from "../../utils/mocking.sol";
import { MockContract } from "../../utils/MockContract.sol";

import { ICreditor } from "../../../contracts/8.13/interfaces/ICreditor.sol";
import { IDeltaNeutralVault } from "../../../contracts/8.13/interfaces/IDeltaNeutralVault.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract AutomatedVaultController_Test is BaseTest {
  using mocking for *;

  ICreditor private _creditor;
  AutomatedVaultControllerLike private _controller;
  IDeltaNeutralVault private _deltaVault1;
  IDeltaNeutralVault private _deltaVault2;

  function setUp() external {
    _creditor = ICreditor(address(new MockContract()));
    _deltaVault1 = IDeltaNeutralVault(address(new MockContract()));
    _deltaVault2 = IDeltaNeutralVault(address(new MockContract()));

    // 1 share = 1 usd to prevent sanity check fail during initialize
    _deltaVault1.shareToValue.mockv(1 ether, 1 ether);
    _deltaVault2.shareToValue.mockv(1 ether, 1 ether);

    // 0 share = 0 usd
    _deltaVault1.shareToValue.mockv(0 ether, 0 ether);
    _deltaVault2.shareToValue.mockv(0 ether, 0 ether);

    // prevent sanity check fail during initialize
    _creditor.getUserCredit.mockv(address(0), 2 ether);

    // prepare init params
    address[] memory _creditors = new address[](1);
    _creditors[0] = address(_creditor);

    address[] memory _deltaVaults = new address[](1);
    _deltaVaults[0] = address(_deltaVault1);

    // deploy av controller
    _controller = _setupxAutomatedVaultController(_creditors, _deltaVaults);
  }

  function testCorrectness_setPrivateVault() external {
    address[] memory _deltaVaults = new address[](1);
    _deltaVaults[0] = address(_deltaVault1);

    _controller.setPrivateVaults(_deltaVaults);
  }

  function testRevert_setPrivateVaultFromNonOwner() external {
    address[] memory _deltaVaults = new address[](1);
    _deltaVaults[0] = address(_deltaVault1);

    vm.expectRevert("Ownable: caller is not the owner");
    vm.prank(ALICE);
    _controller.setPrivateVaults(_deltaVaults);
  }

  function testFail_setPrivateVaultWithNonDeltaVault() external {
    address[] memory _deltaVaults = new address[](2);
    _deltaVaults[0] = address(_deltaVault1);
    _deltaVaults[1] = address(0);

    _controller.setPrivateVaults(_deltaVaults);
  }

  function testCorrectness_getTotalCredit() external {
    _creditor.getUserCredit.mockv(ALICE, 2 ether);
    assertEq(_creditor.getUserCredit(ALICE), 2 ether);
    assertEq(_controller.totalCredit(ALICE), 2 ether);
  }

  function testCorrectness_onDeposit() external {
    vm.startPrank(address(_deltaVault1));
    _controller.onDeposit(ALICE, 1 ether);

    bytes32 _aliceVaultId = _controller.getId(ALICE, address(_deltaVault1));

    assertEq(_controller.userVaultShares(_aliceVaultId), 1 ether);
    _controller.onDeposit(ALICE, 1 ether);
    assertEq(_controller.userVaultShares(_aliceVaultId), 2 ether);
  }

  function testCorrectness_onWithdraw() external {
    // impersonate as delta vault #1
    vm.startPrank(address(_deltaVault1));
    // Deposit 1, withdraw 0.5 twice. Remaining share should be 0
    _controller.onDeposit(ALICE, 1 ether);

    bytes32 _aliceVaultId = _controller.getId(ALICE, address(_deltaVault1));

    assertEq(_controller.userVaultShares(_aliceVaultId), 1 ether);
    _controller.onWithdraw(ALICE, 0.5 ether);
    assertEq(_controller.userVaultShares(_aliceVaultId), 0.5 ether);
    _controller.onWithdraw(ALICE, 0.5 ether);
    assertEq(_controller.userVaultShares(_aliceVaultId), 0 ether);

    // Deposit 1, withdraw 2 twice. Remaining share should be 0
    _controller.onDeposit(ALICE, 1 ether);
    assertEq(_controller.userVaultShares(_aliceVaultId), 1 ether);
    _controller.onWithdraw(ALICE, 2 ether);
    assertEq(_controller.userVaultShares(_aliceVaultId), 0 ether);

    // cleanup impersonation
    vm.stopPrank();
  }

  function testCorrectness_getUsedCredit() external {
    // set up private vaults
    address[] memory _deltaVaults = new address[](2);
    _deltaVaults[0] = address(_deltaVault1);
    _deltaVaults[1] = address(_deltaVault2);

    _controller.setPrivateVaults(_deltaVaults);

    // Deposit 1 vault#1 share
    vm.prank(address(_deltaVault1));
    _controller.onDeposit(ALICE, 1 ether);
    // Deposit 2 vault#2 share
    vm.prank(address(_deltaVault2));
    _controller.onDeposit(ALICE, 2 ether);

    // mock deltavault1 share price, 1 share = 2 usd
    _deltaVault1.shareToValue.mockv(1 ether, 2 ether);
    // mock deltavault2 share price, 2 share = 5 usd
    _deltaVault2.shareToValue.mockv(2 ether, 5 ether);

    // usedCredit should be equal to 2(vault#1) + 5(vault#2) = 7 ether
    assertEq(_controller.usedCredit(ALICE), 7 ether);
  }

  function testCorrectness_getUsedCreditShouldTrackOnlyPrivateVault() external {
    // Deposit 1 share of some random vault
    vm.prank(address(1));
    _controller.onDeposit(ALICE, 1 ether);

    // mock share price, 1 share = 2 usd
    _deltaVault1.shareToValue.mockv(1 ether, 2 ether);

    // used credit should be 0 since user's currently has no share in private vault
    assertEq(_controller.usedCredit(ALICE), 0 ether);
  }

  function testCorrectness_getAvailableCredit() external {
    _creditor.getUserCredit.mockv(ALICE, 2 ether);
    assertEq(_controller.totalCredit(ALICE), 2 ether);
    assertEq(_controller.availableCredit(ALICE), 2 ether);

    // Used credit < total credit
    vm.prank(address(_deltaVault1));
    _controller.onDeposit(ALICE, 1 ether);
    // mock deltavault1 share price, 1 share = 2 usd
    _deltaVault1.shareToValue.mockv(1 ether, 1 ether);
    assertEq(_controller.availableCredit(ALICE), 1 ether);

    // Used credit > total credit
    // mock deltavault1 share price, 1 share = 3 usd
    _deltaVault1.shareToValue.mockv(1 ether, 3 ether);
    assertEq(_controller.availableCredit(ALICE), 0 ether);

    // Used credit == total credit
    // mock deltavault1 share price, 1 share = 3 usd
    _deltaVault1.shareToValue.mockv(1 ether, 2 ether);
    assertEq(_controller.availableCredit(ALICE), 0 ether);
  }
}
