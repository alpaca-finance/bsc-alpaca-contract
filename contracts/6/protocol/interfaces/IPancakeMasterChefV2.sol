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

// Making the original MasterChefV2 as an interface leads to compilation fail.
// Use Contract instead of Interface here
contract IPancakeMasterChefV2 {
  // Info of each user.
  struct UserInfo {
    uint256 amount;
    uint256 rewardDebt;
    uint256 boostMultiplier;
  }

  /// @notice Info of each MCV2 pool.
  /// `allocPoint` The amount of allocation points assigned to the pool.
  ///     Also known as the amount of "multipliers". Combined with `totalXAllocPoint`, it defines the % of
  ///     CAKE rewards each pool gets.
  /// `accCakePerShare` Accumulated CAKEs per share, times 1e12.
  /// `lastRewardBlock` Last block number that pool update action is executed.
  /// `isRegular` The flag to set pool is regular or special. See below:
  ///     In MasterChef V2 farms are "regular pools". "special pools", which use a different sets of
  ///     `allocPoint` and their own `totalSpecialAllocPoint` are designed to handle the distribution of
  ///     the CAKE rewards to all the PancakeSwap products.
  /// `totalBoostedShare` The total amount of user shares in each pool. After considering the share boosts.
  struct PoolInfo {
    uint256 accCakePerShare;
    uint256 lastRewardBlock;
    uint256 allocPoint;
    uint256 totalBoostedShare;
    bool isRegular;
  }

  address public CAKE;
  address public MASTER_CHEF;

  // Info of each user that stakes LP tokens.
  mapping(uint256 => PoolInfo) public poolInfo;
  mapping(uint256 => mapping(address => UserInfo)) public userInfo;

  /// @notice Address of the LP token for each MCV2 pool.
  IERC20[] public lpToken;

  // Deposit LP tokens to MasterChef for SUSHI allocation.
  function deposit(uint256 _pid, uint256 _amount) external {}

  // Withdraw LP tokens from MasterChef.
  function withdraw(uint256 _pid, uint256 _amount) external {}

  function pendingCake(uint256 _pid, address _user) external view returns (uint256) {}
}
