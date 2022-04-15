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
pragma experimental ABIEncoderV2;

interface ICakePool {
  struct UserInfo {
    uint256 shares; // number of shares for a user.
    uint256 lastDepositedTime; // keep track of deposited time for potential penalty.
    uint256 cakeAtLastUserAction; // keep track of cake deposited at the last user action.
    uint256 lastUserActionTime; // keep track of the last user action time.
    uint256 lockStartTime; // lock start time.
    uint256 lockEndTime; // lock end time.
    uint256 userBoostedShare; // boost share, in order to give the user higher reward. The user only enjoys the reward, so the principal needs to be recorded as a debt.
    bool locked; //lock status.
    uint256 lockedAmount; // amount deposited during lock period.
  }

  function deposit(uint256 _amount, uint256 _lockDuration) external;

  function withdraw(uint256 _shares) external;

  function userInfo(address user) external view returns (UserInfo memory info);

  function token() external view returns (address);
}
