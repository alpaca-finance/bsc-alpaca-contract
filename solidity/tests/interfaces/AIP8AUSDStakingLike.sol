// SPDX-License-Identifier: BUSL
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

pragma solidity >=0.8.4 <0.9.0;

struct UserInfo {
  uint256 stakingAmount; // the amount of the staking token of this user
  uint256 lockUntil; // the timestamp that the lock period will end
  uint256 alpacaRewardDebt; // the reward debt
}

interface AIP8AUSDStakingLike {
  error AIP8AUSDStaking_ViolateMinimumLockPeriod(uint256 inputLockUntil);
  error AIP8AUSDStaking_ViolateMaximumLockPeriod(uint256 inputLockUntil);
  error AIP8AUSDStaking_ViolatePreviousLockPeriod(uint256 inputLockUntil);
  error AIP8AUSDStaking_NotEnoughAlpacaReward(uint256 wantAmount, uint256 actualAmount);
  error AIP8AUSDStaking_StillInLockPeriod();
  error AIP8AUSDStaking_NotStopped();
  error AIP8AUSDStaking_Stopped();

  function WEEK() external view returns (uint256);

  function MAX_LOCK() external view returns (uint256);

  function stakingToken() external view returns (address);

  function alpaca() external view returns (address);

  function fairlaunch() external view returns (address);

  function pid() external view returns (uint256);

  function accAlpacaPerShare() external view returns (uint256);

  function userInfo(address) external view returns (UserInfo memory);

  function initialize(address _fairlaunch, uint256 _pid) external;

  function refreshAllowance() external;

  function lock(uint256 _amount, uint256 _lockUntil) external;

  function unlock() external;

  function harvest() external;

  function balanceOf(address _user) external view returns (uint256);

  function pendingAlpaca(address _user) external view returns (uint256);

  function owner() external view returns (address);

  function enableEmergencyWithdraw() external;

  function emergencyWithdraw() external;
}
