// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, TripleSlopeModelLike } from "../../base/BaseTest.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract TripleSlope13_Test is BaseTest {
  TripleSlopeModelLike private _tripleSlopeModel13;

  function setUp() external {
    _tripleSlopeModel13 = _setupTripleSlope("13");
  }

  function _findInterestPerYear(uint256 _interestPerSec) internal pure returns (uint256) {
    return _interestPerSec * 365 days;
  }

  function testCorrectness_getInterestRate() external {
    // when utilization is 5%, interest should be 1.33%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel13.getInterestRate(5, 95)), 13333333319136000, 1);

    // when utilization is 10%, interest should be 2.67%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel13.getInterestRate(10, 90)), 26666666638272000, 1);

    // when utilization is 15%, interest should be 4%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel13.getInterestRate(15, 85)), 0.04 ether, 1);

    // when utilization is 25%, interest should be 6.67%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel13.getInterestRate(25, 75)), 66666666658752000, 1);

    // when utilization is 30%, interest should be 8%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel13.getInterestRate(30, 70)), 0.08 ether, 1);

    // when utilization is 50%, interest shuold be 8%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel13.getInterestRate(50, 50)), 0.08 ether, 1);

    // when utilization is 70%, interest should be 8%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel13.getInterestRate(70, 30)), 0.08 ether, 1);

    // when utilization is 87.5%, interest should be 8%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel13.getInterestRate(8750, 1250)), 0.08 ether, 1);

    // when utilization is 95%, interest should be 24%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel13.getInterestRate(95, 5)), 0.24 ether, 1);

    // when utilization is 99%, interest should be 36.8%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel13.getInterestRate(99, 1)), 0.368 ether, 1);

    // when utilization is 100%, interest should be 40%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel13.getInterestRate(100, 0)), 0.4 ether, 1);
  }
}
