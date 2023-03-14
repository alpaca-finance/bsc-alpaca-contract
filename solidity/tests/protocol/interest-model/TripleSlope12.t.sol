// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, TripleSlopeModelLike } from "../../base/BaseTest.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract TripleSlope12_Test is BaseTest {
  TripleSlopeModelLike private _tripleSlopeModel12;

  function setUp() external {
    _tripleSlopeModel12 = _setupTripleSlope("12");
  }

  function _findInterestPerYear(uint256 _interestPerSec) internal pure returns (uint256) {
    return _interestPerSec * 365 days;
  }

  function testCorrectness_getInterestRate() external {
    // when utilization is 5%, interest should be 1.67%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel12.getInterestRate(5, 95)), 16666666664688000, 1);

    // when utilization is 10%, interest should be 3.33%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel12.getInterestRate(10, 90)), 33333333329376000, 1);

    // when utilization is 15%, interest should be 5%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel12.getInterestRate(15, 85)), 0.05 ether, 1);

    // when utilization is 25%, interest should be 8.33%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel12.getInterestRate(25, 75)), 83333333323440000, 1);

    // when utilization is 30%, interest should be 10%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel12.getInterestRate(30, 70)), 0.1 ether, 1);

    // when utilization is 50%, interest shuold be 16.67%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel12.getInterestRate(50, 50)), 166666666646880000, 1);

    // when utilization is 70%, interest should be 20%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel12.getInterestRate(70, 30)), 0.2 ether, 1);

    // when utilization is 87.5%, interest should be 20%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel12.getInterestRate(8750, 1250)), 0.2 ether, 1);

    // when utilization is 95%, interest should be 30%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel12.getInterestRate(95, 5)), 0.3 ether, 1);

    // when utilization is 99%, interest should be 38%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel12.getInterestRate(99, 1)), 0.38 ether, 1);

    // when utilization is 100%, interest should be 40%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel12.getInterestRate(100, 0)), 0.4 ether, 1);
  }
}
