// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

import "./DSTest.sol";

contract DemoTest is DSTest {
  uint256 testNumber;

  function setUp() public {
    testNumber = 42;
  }

  function testNumberIs42() public {
    assertEq(testNumber, 42);
  }

  function testFailUnderflow() public {
    testNumber -= 43;
  }

  function testFailSubtract43() public {
    testNumber -= 43;
  }
}
