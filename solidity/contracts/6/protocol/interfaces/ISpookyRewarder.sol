// SPDX-License-Identifier: MIT

pragma solidity 0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";

contract ISpookyRewarder {
  function onReward(
    uint256 pid,
    address user,
    address recipient,
    uint256 Booamount,
    uint256 newLpAmount
  ) external {}

  function pendingTokens(
    uint256 pid,
    address user,
    uint256 rewardAmount
  ) external view returns (IERC20[] memory, uint256[] memory) {}
}
