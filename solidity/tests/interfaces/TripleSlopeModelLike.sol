// SPDX-License-Identifier: UNLICENSED
// !! THIS FILE WAS AUTOGENERATED BY abi-to-sol v0.5.2. SEE SOURCE BELOW. !!
pragma solidity >=0.8.4 <0.9.0;

interface TripleSlopeModelLike {
  function CEIL_SLOPE_1() external view returns (uint256);

  function CEIL_SLOPE_2() external view returns (uint256);

  function CEIL_SLOPE_3() external view returns (uint256);

  function MAX_INTEREST_SLOPE_1() external view returns (uint256);

  function MAX_INTEREST_SLOPE_2() external view returns (uint256);

  function MAX_INTEREST_SLOPE_3() external view returns (uint256);

  function getInterestRate(uint256 debt, uint256 floating) external pure returns (uint256);
}
