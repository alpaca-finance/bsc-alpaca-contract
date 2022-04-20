// SPDX-License-Identifier: MIT
/**
  ∩~~~~∩ 
  ξ ･×･ ξ 
  ξ　~　ξ 
  ξ　　 ξ 
  ξ　　 “~～~～〇 
  ξ　　　　　　 ξ 
  ξ ξ ξ~～~ξ ξ ξ 
　 ξ_ξξ_ξ　ξ_ξξ_ξ
Alpaca Fin Corporation
*/

pragma solidity 0.6.6;

import "@openzeppelin/contracts/math/SafeMath.sol";

contract TripleSlopeModel4 {
  using SafeMath for uint256;

  uint256 public constant CEIL_SLOPE_1 = 85e18;
  uint256 public constant CEIL_SLOPE_2 = 90e18;
  uint256 public constant CEIL_SLOPE_3 = 100e18;

  uint256 public constant MAX_INTEREST_SLOPE_1 = 20e16;
  uint256 public constant MAX_INTEREST_SLOPE_2 = 20e16;
  uint256 public constant MAX_INTEREST_SLOPE_3 = 150e16;

  /// @dev Return the interest rate per second, using 1e18 as denom.
  function getInterestRate(uint256 debt, uint256 floating) external pure returns (uint256) {
    if (debt == 0 && floating == 0) return 0;

    uint256 total = debt.add(floating);
    uint256 utilization = debt.mul(100e18).div(total);
    if (utilization < CEIL_SLOPE_1) {
      // Less than 60% utilization - 0%-20% APY
      return utilization.mul(MAX_INTEREST_SLOPE_1).div(CEIL_SLOPE_1) / 365 days;
    } else if (utilization < CEIL_SLOPE_2) {
      // Between 60% and 90% - 20% APY
      return uint256(MAX_INTEREST_SLOPE_2) / 365 days;
    } else if (utilization < CEIL_SLOPE_3) {
      // Between 90% and 100% - 20%-150% APY
      return
        (MAX_INTEREST_SLOPE_2 +
          utilization.sub(CEIL_SLOPE_2).mul(MAX_INTEREST_SLOPE_3.sub(MAX_INTEREST_SLOPE_2)).div(
            CEIL_SLOPE_3.sub(CEIL_SLOPE_2)
          )) / 365 days;
    } else {
      // Not possible, but just in case - 150% APY
      return MAX_INTEREST_SLOPE_3 / 365 days;
    }
  }
}
