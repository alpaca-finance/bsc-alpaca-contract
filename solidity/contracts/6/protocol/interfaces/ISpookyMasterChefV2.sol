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
import "./ISpookyRewarder.sol";

contract ISpookyMasterChefV2 {
  // Info of each user.
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

  address public MASTER_CHEF;
  IERC20 public BOO;

  // Info of each user that stakes LP tokens.
  mapping(uint256 => PoolInfo) public poolInfo;
  mapping(uint256 => mapping(address => UserInfo)) public userInfo;
  mapping(uint256 => IERC20) public lpToken;
  mapping(uint256 => ISpookyRewarder) public rewarder;

  // Deposit LP tokens to MasterChef for BOO allocation.
  function deposit(uint256 _pid, uint256 _amount) external {}

  // Withdraw LP tokens from MasterChef.
  function withdraw(uint256 _pid, uint256 _amount) external {}

  // Query pending BOO
  function pendingBOO(uint256 _pid, address _user) external returns (uint256) {}

  // Harvest from MCV1
  function harvestFromMasterChef() external {}
}
