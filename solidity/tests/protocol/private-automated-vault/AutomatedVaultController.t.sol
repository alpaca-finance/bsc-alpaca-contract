// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest } from "../../base/BaseTest.sol";

import { AutomatedVaultController } from "../../../contracts/8.13/AutomatedVaultController.sol";

import { mocking } from "../../utils/mocking.sol";
import { MockContract } from "../../utils/MockContract.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract AutomatedVaultController_Test is BaseTest {
  using mocking for *;

  function setUp() external {}

  function testCorrectness_onDeposit() external {
    assertEq(address(1), address(1));
  }
}
