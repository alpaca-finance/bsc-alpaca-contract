// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, TripleSlopeModelLike } from "../../base/BaseTest.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract TripleSlope10_Test is BaseTest {
  TripleSlopeModelLike private _tripleSlopeModel10;

  function setUp() external {
    _tripleSlopeModel10 = _setupTripleSlope("10");
  }

  function _findInterestPerYear(uint256 _interestPerSec) internal pure returns (uint256) {
    return _interestPerSec * 365 days;
  }

  function testCorrectness_getInterestRate() external {
    // when utilization is 5%, interest should be 1.33%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel10.getInterestRate(5, 95)), 0.01 ether, 1);

    // when utilization is 10%, interest should be 2.67%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel10.getInterestRate(10, 90)), 0.02 ether, 1);

    // when utilization is 15%, interest should be 4%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel10.getInterestRate(15, 85)), 0.03 ether, 1);

    // when utilization is 25%, interest should be 6.67%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel10.getInterestRate(25, 75)), 0.05 ether, 1);

    // when utilization is 30%, interest should be 8%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel10.getInterestRate(30, 70)), 0.06 ether, 1);

    // when utilization is 50%, interest shuold be 8%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel10.getInterestRate(50, 50)), 0.08 ether, 1);

    // when utilization is 70%, interest should be 8%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel10.getInterestRate(70, 30)), 0.08 ether, 1);

    // when utilization is 87.5%, interest should be 8%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel10.getInterestRate(8750, 1250)), 0.08 ether, 1);

    // when utilization is 95%, interest should be 79%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel10.getInterestRate(95, 5)), 0.79 ether, 1);

    // when utilization is 99%, interest should be 135.8%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel10.getInterestRate(99, 1)), 1.358 ether, 1);

    // when utilization is 100%, interest should be 150%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel10.getInterestRate(100, 0)), 1.5 ether, 1);
  }
}
