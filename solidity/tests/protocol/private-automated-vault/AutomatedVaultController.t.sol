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

  function testCorrectness_addPrivateVault() external {
    address[] memory _deltaVaults = new address[](1);
    _deltaVaults[0] = address(_deltaVault2);

    _controller.addPrivateVaults(_deltaVaults);
  }

  function testCorrectness_removePrivateVault() external {
    address[] memory _deltaVaults = new address[](1);
    _deltaVaults[0] = address(_deltaVault1);

    _controller.removePrivateVaults(_deltaVaults);
  }

  function testRevert_addPrivateVaultFromNonOwner() external {
    address[] memory _deltaVaults = new address[](1);
    _deltaVaults[0] = address(_deltaVault1);

    vm.expectRevert("Ownable: caller is not the owner");
    vm.prank(ALICE);
    _controller.addPrivateVaults(_deltaVaults);
  }

  function testRevert_addDuplicatePrivateVault() external {
    address[] memory _deltaVaults = new address[](1);
    _deltaVaults[0] = address(_deltaVault1);

    vm.expectRevert("existed");
    _controller.addPrivateVaults(_deltaVaults);
  }

  function testRevert_removePrivateVaultFromNonOwner() external {
    address[] memory _deltaVaults = new address[](1);
    _deltaVaults[0] = address(_deltaVault1);

    vm.expectRevert("Ownable: caller is not the owner");
    vm.prank(ALICE);
    _controller.removePrivateVaults(_deltaVaults);
  }

  function testRevert_removeNonExistPrivateVault() external {
    address[] memory _deltaVaults = new address[](1);
    _deltaVaults[0] = address(_deltaVault2);

    vm.expectRevert("!exist");
    _controller.removePrivateVaults(_deltaVaults);
  }

  function testCorrectness_setCreditors() external {
    address[] memory _creditors = new address[](1);
    _creditors[0] = address(_creditor);

    _controller.setCreditors(_creditors);
  }

  function testRevert_setCreditorsFromNonOwner() external {
    address[] memory _creditors = new address[](1);
    _creditors[0] = address(_creditor);

    vm.expectRevert("Ownable: caller is not the owner");
    vm.prank(ALICE);
    _controller.setCreditors(_creditors);
  }

  function testFail_addPrivateVaultWithNonDeltaVault() external {
    address[] memory _deltaVaults = new address[](2);
    _deltaVaults[0] = address(_deltaVault1);
    _deltaVaults[1] = address(0);

    _controller.addPrivateVaults(_deltaVaults);
  }

  function testFail_removePrivateVaultWithNonExistingDeltaVault() external {
    address[] memory _deltaVaults = new address[](1);
    _deltaVaults[0] = address(_deltaVault2);

    _controller.removePrivateVaults(_deltaVaults);
  }

  function testCorrectness_getTotalCredit() external {
    _creditor.getUserCredit.mockv(ALICE, 2 ether);
    assertEq(_creditor.getUserCredit(ALICE), 2 ether);
    assertEq(_controller.totalCredit(ALICE), 2 ether);
  }

  function testCorrectness_onDeposit() external {
    _creditor.getUserCredit.mockv(ALICE, 100 ether);
    vm.startPrank(address(_deltaVault1));
    _controller.onDeposit(ALICE, 1 ether, 1 ether);

    assertEq(_controller.getUserVaultShares(ALICE, address(_deltaVault1)), 1 ether);
    _deltaVault1.shareToValue.mockv(2 ether, 2 ether);
    _controller.onDeposit(ALICE, 1 ether, 1 ether);
    assertEq(_controller.getUserVaultShares(ALICE, address(_deltaVault1)), 2 ether);
  }

  function testRevert_onDepositWithNonAuthorizeVault() external {
    vm.expectRevert(abi.encodeWithSignature("AutomatedVaultController_Unauthorized()"));
    vm.startPrank(EVE);
    _controller.onDeposit(ALICE, 1 ether, 1 ether);
  }

  function testRevert_onDepositInsufficientCredit() external {
    _creditor.getUserCredit.mockv(ALICE, 1 ether);
    vm.startPrank(address(_deltaVault1));
    vm.expectRevert(abi.encodeWithSignature("AutomatedVaultController_InsufficientCredit()"));
    _controller.onDeposit(ALICE, 1 ether, 2 ether);
  }

  function testCorrectness_onWithdraw() external {
    _creditor.getUserCredit.mockv(ALICE, 100 ether);
    // impersonate as delta vault #1
    vm.startPrank(address(_deltaVault1));
    // Deposit 1, withdraw 0.5 twice. Remaining share should be 0
    _controller.onDeposit(ALICE, 1 ether, 1 ether);

    assertEq(_controller.getUserVaultShares(ALICE, address(_deltaVault1)), 1 ether);
    _controller.onWithdraw(ALICE, 0.5 ether);
    assertEq(_controller.getUserVaultShares(ALICE, address(_deltaVault1)), 0.5 ether);
    _controller.onWithdraw(ALICE, 0.5 ether);
    assertEq(_controller.getUserVaultShares(ALICE, address(_deltaVault1)), 0 ether);

    // Deposit 1, withdraw 2 twice. Remaining share should be 0
    _controller.onDeposit(ALICE, 1 ether, 1 ether);
    assertEq(_controller.getUserVaultShares(ALICE, address(_deltaVault1)), 1 ether);
    _controller.onWithdraw(ALICE, 2 ether);
    assertEq(_controller.getUserVaultShares(ALICE, address(_deltaVault1)), 0 ether);

    // cleanup impersonation
    vm.stopPrank();
  }

  function testCorrectness_getUsedCredit() external {
    _creditor.getUserCredit.mockv(ALICE, 100 ether);
    // set up private vaults
    address[] memory _deltaVaults = new address[](1);
    _deltaVaults[0] = address(_deltaVault2);

    _controller.addPrivateVaults(_deltaVaults);

    // mock deltavault1 share price, 1 share = 2 usd
    _deltaVault1.shareToValue.mockv(1 ether, 2 ether);
    // mock deltavault2 share price, 2 share = 5 usd
    _deltaVault2.shareToValue.mockv(2 ether, 5 ether);

    // Deposit 1 vault#1 share
    vm.prank(address(_deltaVault1));
    _controller.onDeposit(ALICE, 1 ether, 1 ether);
    // Deposit 2 vault#2 share
    vm.prank(address(_deltaVault2));
    _controller.onDeposit(ALICE, 2 ether, 2 ether);

    // usedCredit should be equal to 2(vault#1) + 5(vault#2) = 7 ether
    assertEq(_controller.usedCredit(ALICE), 7 ether);
  }

  function testCorrectness_getAvailableCredit() external {
    _creditor.getUserCredit.mockv(ALICE, 2 ether);
    assertEq(_controller.totalCredit(ALICE), 2 ether);
    assertEq(_controller.availableCredit(ALICE), 2 ether);

    // Used credit < total credit
    vm.prank(address(_deltaVault1));
    _controller.onDeposit(ALICE, 1 ether, 1 ether);
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
