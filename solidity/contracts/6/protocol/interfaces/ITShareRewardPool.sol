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

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";

abstract contract ITShareRewardPool {
  // Info of each user.
  struct UserInfo {
    uint256 amount; // How many LP tokens the user has provided.
    uint256 rewardDebt; // Reward debt. See explanation below.
  }

  // Info of each pool.
  struct PoolInfo {
    IERC20 token; // Address of LP token contract.
    uint256 allocPoint; // How many allocation points assigned to this pool. tSHAREs to distribute per block.
    uint256 lastRewardTime; // Last time that tSHAREs distribution occurs.
    uint256 accTSharePerShare; // Accumulated tSHAREs per share, times 1e18. See below.
    bool isStarted; // if lastRewardTime has passed
  }

  // the reward token like CAKE, in this case, it's called TSHARE
  IERC20 public tshare;

  // Info of each user that stakes LP tokens.
  mapping(uint256 => PoolInfo) public poolInfo;
  mapping(uint256 => mapping(address => UserInfo)) public userInfo;

  // Deposit LP tokens to RewardPool for TSHARE allocation.
  function deposit(uint256 _pid, uint256 _amount) external virtual;

  // Withdraw LP tokens from RewardPool.
  function withdraw(uint256 _pid, uint256 _amount) external virtual;

  // Query pending TSHARE
  function pendingShare(uint256 _pid, address _user) external virtual returns (uint256);
}
