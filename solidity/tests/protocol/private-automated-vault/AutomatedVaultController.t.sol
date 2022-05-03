// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, AutomatedVaultControllerLike } from "../../base/BaseTest.sol";

import { ICreditor } from "../../../contracts/8.13/interfaces/ICreditor.sol";
import { mocking } from "../../utils/mocking.sol";
import { MockContract } from "../../utils/MockContract.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract AutomatedVaultController_Test is BaseTest {
  using mocking for *;

  ICreditor private _creditor;
  AutomatedVaultControllerLike private _controller;

  function setUp() external {
    _creditor = ICreditor(address(new MockContract()));
    // prevent sanity check during initialize
    _creditor.getUserCredit.mockv(address(0), 2 ether);

    // deploy av controller
    address[] memory _creditors = new address[](1);
    _creditors[0] = address(_creditor);
    _controller = _setupxAutomatedVaultController(_creditors);
  }

  function testCorrectness_onDeposit() external {
    _creditor.getUserCredit.mockv(ALICE, 2 ether);
    assertEq(_creditor.getUserCredit(ALICE), 2 ether);
    assertEq(_controller.totalCredit(ALICE), 2 ether);
  }
}
