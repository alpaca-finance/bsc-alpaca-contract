// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, TripleSlopeModelLike } from "../../base/BaseTest.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract TripleSlope6_Test is BaseTest {
  TripleSlopeModelLike private _tripleSlopeModel6;

  function setUp() external {
    _tripleSlopeModel6 = _setupTripleSlope("6");
  }

  function _findInterestPerYear(uint256 _interestPerSec) internal pure returns (uint256) {
    return _interestPerSec * 365 days;
  }

  function testCorrectness_getInterestRate() external {
    // when utilization is 30%, interest should be 6.17647%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel6.getInterestRate(30, 70)), 0.0617647 ether, 1);

    // when utilization is 50%, interest shuold be 10.29412%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel6.getInterestRate(50, 50)), 0.1029412 ether, 1);

    // when utilization is 87.5%, interest should be 17.50000%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel6.getInterestRate(8750, 1250)), 0.175 ether, 1);

    // when utilization is 95%, interest should be 83.75000%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel6.getInterestRate(95, 5)), 0.8375 ether, 1);

    // when utilization is 99%, interest should be 136.75000%%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel6.getInterestRate(99, 1)), 1.3675 ether, 1);

    // when utilization is 100%, interest should be 150%
    assertCloseBps(_findInterestPerYear(_tripleSlopeModel6.getInterestRate(100, 0)), 1.5 ether, 1);
  }
}
