// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

interface IGauge {
  function deposit(uint256 amount, uint256 tokenId) external;

  function withdraw(uint256 amount) external;

  function getReward(address account, address[] memory tokens) external;

  function earned(address token, address account) external view returns (uint256);
}
