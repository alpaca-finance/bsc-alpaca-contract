// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ILiquidityMiningMaster {
  // Info of each user.
  struct UserInfo {
    uint256 amount; // How many LP tokens the user has provided.
    uint256 rewardDebt; // Reward debt. See explanation below.
    //
    // We do some fancy math here. Basically, any point in time, the amount of XMS
    // entitled to a user but is pending to be distributed is:
    //
    //   pending reward = (user.amount * pool.accXMSPerShare) - user.rewardDebt
    //
    // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
    //   1. The pool's `accXMSPerShare` (and `lastRewardBlock`) gets updated.
    //   2. User receives the pending reward sent to his/her address.
    //   3. User's `amount` gets updated.
    //   4. User's `rewardDebt` gets updated.
  }

  // Info of each pool.
  struct PoolInfo {
    IERC20 lpToken; // Address of LP token contract.
    uint256 allocPoint; // How many allocation points assigned to this pool. XMS to distribute per block.
    uint256 lastRewardBlock; // Last block number that XMS distribution occurs.
    uint256 accXMSPerShare; // Accumulated XMS per share, times 1e12. See below.
  }

  // ----------- Events -----------

  event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
  event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
  event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
  event UpdateEmissionRate(address indexed user, uint256 xmsPerBlock);
  event UpdateEndBlock(address indexed user, uint256 endBlock);
  event UpdateVestingMaster(address indexed user, address vestingMaster);

  // ----------- State changing api -----------

  function massUpdatePools() external;

  function updatePool(uint256 pid) external;

  function deposit(uint256 pid, uint256 amount) external;

  function withdraw(uint256 pid, uint256 amount) external;

  function emergencyWithdraw(uint256 pid) external;

  // ----------- Governor only state changing API -----------

  function addPool(
    uint256 allocPoint,
    IERC20 lpToken,
    bool withUpdate
  ) external;

  function setPool(
    uint256 pid,
    uint256 allocPoint,
    bool withUpdate
  ) external;

  function updateXmsPerBlock(uint256 _xmsPerBlock) external;

  function updateEndBlock(uint256 _endBlock) external;

  function updateVestingMaster(address _vestingMaster) external;

  // ----------- Getters -----------

  function pair2Pid(address pair) external view returns (uint256);

  function pendingXMS(uint256 pid, address user) external view returns (uint256);

  function poolInfo(uint256 pid)
    external
    view
    returns (
      IERC20 lpToken,
      uint256 allocPoint,
      uint256 lastRewardBlock,
      uint256 accXMSPerShare
    );

  function userInfo(uint256 pid, address user) external view returns (uint256 amount, uint256 rewardDebt);

  function poolExistence(IERC20 lp) external view returns (bool);

  function xmsPerBlock() external view returns (uint256);

  function BONUS_MULTIPLIER() external view returns (uint256);

  function totalAllocPoint() external view returns (uint256);

  function startBlock() external view returns (uint256);

  function endBlock() external view returns (uint256);

  function poolLength() external view returns (uint256);

  function getMultiplier(uint256 from, uint256 to) external pure returns (uint256);
}
