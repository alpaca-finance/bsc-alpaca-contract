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

abstract contract IWexMaster {
  // Info of each user.
  struct UserInfo {
    uint256 amount; // How many LP tokens the user has provided.
    uint256 rewardDebt; // Reward debt. See explanation below.
    uint256 pendingRewards;
  }

  // Info of each pool.
  struct PoolInfo {
    IERC20 lpToken; // Address of LP token contract.
    uint256 allocPoint; // How many allocation points assigned to this pool. WEXes to distribute per block.
    uint256 lastRewardBlock; // Last block number that WEXes distribution occurs.
    uint256 accWexPerShare; // Accumulated WEXes per share, times 1e12. See below.
  }

  // the reward token like CAKE, in this case, it's called WEX
  address public wex;

  // Info of each user that stakes LP tokens.
  mapping(uint256 => PoolInfo) public poolInfo;
  mapping(uint256 => mapping(address => UserInfo)) public userInfo;

  // Deposit LP tokens to WexMaster for WEX allocation.
  function deposit(
    uint256 _pid,
    uint256 _amount,
    bool _withdrawRewards
  ) external virtual;

  // Withdraw LP tokens from WexMaster.
  function withdraw(
    uint256 _pid,
    uint256 _amount,
    bool _withdrawRewards
  ) external virtual;

  // Query pending WEX
  function pendingWex(uint256 _pid, address _user) external virtual returns (uint256);
}
