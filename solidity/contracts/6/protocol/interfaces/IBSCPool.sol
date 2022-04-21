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

import "../apis/mdex/IMdx.sol";

// Making the original MasterChef as an interface leads to compilation fail.
// Use Contract instead of Interface here
contract IBSCPool {
  // Info of each user.
  struct UserInfo {
    uint256 amount; // How many LP tokens the user has provided.
    uint256 rewardDebt; // Reward debt.
    uint256 multLpRewardDebt; //multLp Reward debt.
  }

  // Info of each pool.
  struct PoolInfo {
    IERC20 lpToken; // Address of LP token contract.
    uint256 allocPoint; // How many allocation points assigned to this pool. MDXs to distribute per block.
    uint256 lastRewardBlock; // Last block number that MDXs distribution occurs.
    uint256 accMdxPerShare; // Accumulated MDXs per share, times 1e12.
    uint256 accMultLpPerShare; //Accumulated multLp per share
    uint256 totalAmount; // Total amount of current pool deposit.
  }

  IMdx public mdx;

  // Info of each pool.
  PoolInfo[] public poolInfo;
  // Info of each user that stakes LP tokens.
  mapping(uint256 => mapping(address => UserInfo)) public userInfo;

  // Deposit LP tokens to BSCPool for MDX allocation.
  function deposit(uint256 _pid, uint256 _amount) external {}

  // Withdraw LP tokens from BSCPool.
  function withdraw(uint256 _pid, uint256 _amount) external {}
}
