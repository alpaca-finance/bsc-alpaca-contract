// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, TripleSlopeModelLike } from "../../base/BaseTest.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract TripleSlope15_Test is BaseTest {
  TripleSlopeModelLike private _tripleSlopeModel15;

  function setUp() external {
    _tripleSlopeModel15 = _setupTripleSlope("15");
  }

  function _findInterestPerYear(uint256 _interestPerSec) internal pure returns (uint256) {
    return _interestPerSec * 365 days;
  }

  function testCorrectness_getInterestRate() external {
    // when utilization is 5%, interest should be 1.43%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel15.getInterestRate(5, 95)), 14285714275008000, 1);

    // when utilization is 10%, interest should be 2.86%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel15.getInterestRate(10, 90)), 28571428550016000, 1);

    // when utilization is 15%, interest should be 4.29%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel15.getInterestRate(15, 85)), 42857142856560000, 1);

    // when utilization is 25%, interest should be 7.14%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel15.getInterestRate(25, 75)), 71428571406576000, 1);

    // when utilization is 30%, interest should be 8.57%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel15.getInterestRate(30, 70)), 85714285713120000, 1);

    // when utilization is 50%, interest shuold be 14.29%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel15.getInterestRate(50, 50)), 142857142844688000, 1);

    // when utilization is 70%, interest should be 20%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel15.getInterestRate(70, 30)), 0.2 ether, 1);

    // when utilization is 87.5%, interest should be 20%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel15.getInterestRate(8750, 1250)), 0.2 ether, 1);

    // when utilization is 95%, interest should be 30%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel15.getInterestRate(95, 5)), 0.3 ether, 1);

    // when utilization is 99%, interest should be 38%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel15.getInterestRate(99, 1)), 0.38 ether, 1);

    // when utilization is 100%, interest should be 40%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel15.getInterestRate(100, 0)), 0.4 ether, 1);
  }
}
