// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

interface IWFTM {
  function deposit() external payable returns (uint256);

  function transfer(address to, uint256 value) external returns (bool);

  function withdraw(uint256) external returns (uint256);
}
