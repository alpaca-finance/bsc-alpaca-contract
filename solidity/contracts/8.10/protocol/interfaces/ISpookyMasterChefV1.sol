// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./IERC20.sol";

interface ISpookyMasterChefV1 {
  struct UserInfo {
    uint256 amount; // How many LP tokens the user has provided.
    uint256 rewardDebt; // Reward debt. See explanation below.
  }

  struct PoolInfo {
    IERC20 lpToken; // Address of LP token contract.
    uint256 allocPoint; // How many allocation points assigned to this pool. BOO to distribute per second.
    uint256 lastRewardBlock; // Last block number that SUSHI distribution occurs.
    uint256 accBooPerShare; // Accumulated BOO per share, times 1e12. See below.
  }

  function poolInfo(uint256 pid) external view returns (ISpookyMasterChefV1.PoolInfo memory);

  function totalAllocPoint() external view returns (uint256);

  function booPerSecond() external view returns (uint256);

  function deposit(uint256 _pid, uint256 _amount) external;
}
