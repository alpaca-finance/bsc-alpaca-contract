// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, TripleSlopeModelLike } from "../../base/BaseTest.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract TripleSlope8_Test is BaseTest {
  TripleSlopeModelLike private _tripleSlopeModel8;

  function setUp() external {
    _tripleSlopeModel8 = _setupTripleSlope("8");
  }

  function _findInterestPerYear(uint256 _interestPerSec) internal pure returns (uint256) {
    return _interestPerSec * 365 days;
  }

  function testCorrectness_getInterestRate() external {
    // when utilization is 30%, interest should be 6%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel8.getInterestRate(30, 70)), 0.06 ether, 1);

    // when utilization is 50%, interest shuold be 10%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel8.getInterestRate(50, 50)), 0.1 ether, 1);

    // when utilization is 70%, interest should be 10%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel8.getInterestRate(70, 30)), 0.1 ether, 1);

    // when utilization is 87.5%, interest should be 10%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel8.getInterestRate(8750, 1250)), 0.1 ether, 1);

    // when utilization is 95%, interest should be 80%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel8.getInterestRate(95, 5)), 0.8 ether, 1);

    // when utilization is 99%, interest should be 136%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel8.getInterestRate(99, 1)), 1.36 ether, 1);

    // when utilization is 100%, interest should be 150%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel8.getInterestRate(100, 0)), 1.5 ether, 1);
  }
}
