// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import { BaseTest } from "../../base/BaseTest.sol";

import { TripleSlopeModel6 } from "../../../contracts/6/protocol/interest-models/TripleSlopeModel6.sol";

contract TripleSlope6_Test is BaseTest {
  TripleSlopeModel6 internal tripleSlope;

  function setUp() external {
    tripleSlope = new TripleSlopeModel6();
    _setupMiniFL();
  }

  function _findInterestPerYear(uint256 _interestPerSec) internal pure returns (uint256) {
    return _interestPerSec * 365 days;
  }

  function testCorrectness_getInterestRate() external {
    // when utilization is 30%, interest should be 0%
    assertEq(_findInterestPerYear(tripleSlope.getInterestRate(30, 70)), 0.0617 ether);
  }
}
