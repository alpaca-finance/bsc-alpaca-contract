// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IERC20.sol";
import "./ISpookyRewarder.sol";

interface ISpookyMasterChefV2 {
  struct UserInfo {
    uint256 amount; // How many LP tokens the user has provided.
    uint256 rewardDebt; // Reward debt. See explanation below.
  }

  // Info of each pool.
  struct PoolInfo {
    uint128 accBooPerShare;
    uint64 lastRewardTime;
    uint64 allocPoint;
  }

  function MASTER_CHEF() external returns (address);

  function BOO() external returns (IERC20);

  function userInfo(uint256 pid, address user) external view returns (UserInfo memory);

  function poolInfo(uint256 pid) external view returns (PoolInfo memory);

  function rewarder(uint256 pid) external view returns (ISpookyRewarder);

  function lpToken(uint256 index) external view returns (IERC20);

  function totalAllocPoint() external view returns (uint256);

  function booPerSecond() external view returns (uint256);

  function deposit(uint256 _pid, uint256 _amount) external;

  function withdraw(uint256 _pid, uint256 _amount) external;

  function harvestFromMasterChef() external;
}
