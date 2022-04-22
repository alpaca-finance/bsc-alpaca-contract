// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import { BaseTest } from "./base/BaseTest.sol";

contract DemoTest is BaseTest {
  uint256 private testNumber;

  function setUp() external {
    testNumber = 42;
  }

  function testNumberIs42() external {
    assertEq(testNumber, 42);
  }
}
