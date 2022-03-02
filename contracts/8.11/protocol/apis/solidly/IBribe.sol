// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.11;

interface IBribe {
  function getReward(uint256 tokenId, address[] memory tokens) external;
}
