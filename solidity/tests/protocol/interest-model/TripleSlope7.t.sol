// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, TripleSlopeModelLike } from "../../base/BaseTest.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract TripleSlope7_Test is BaseTest {
  TripleSlopeModelLike private _tripleSlopeModel7;

  function setUp() external {
    _tripleSlopeModel7 = _setupTripleSlope("7");
  }

  function _findInterestPerYear(uint256 _interestPerSec) internal pure returns (uint256) {
    return _interestPerSec * 365 days;
  }

  function testCorrectness_getInterestRate() external {
    // when utilization is 30%, interest should be 8.5714%%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel7.getInterestRate(30, 70)), 0.085714 ether, 1);

    // when utilization is 50%, interest shuold be 14.2857%%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel7.getInterestRate(50, 50)), 0.142857 ether, 1);

    // when utilization is 70%, interest should be 20%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel7.getInterestRate(70, 30)), 0.2 ether, 1);

    // when utilization is 87.5%, interest should be 20%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel7.getInterestRate(8750, 1250)), 0.2 ether, 1);

    // when utilization is 95%, interest should be 85%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel7.getInterestRate(95, 5)), 0.85 ether, 1);

    // when utilization is 99%, interest should be 137%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel7.getInterestRate(99, 1)), 1.37 ether, 1);

    // when utilization is 100%, interest should be 150%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel7.getInterestRate(100, 0)), 1.5 ether, 1);
  }
}
