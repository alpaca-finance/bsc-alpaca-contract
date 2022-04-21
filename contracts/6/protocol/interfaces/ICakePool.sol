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

interface ICakePool {
  function deposit(uint256 _amount, uint256 _lockDuration) external;

  function withdraw(uint256 _shares) external;

  function withdrawByAmount(uint256 _amount) external;

  function userInfo(address user)
    external
    view
    returns (
      uint256 shares,
      uint256 lastDepositedTime,
      uint256 cakeAtLastUserAction,
      uint256 lastUserActionTime,
      uint256 lockStartTime,
      uint256 lockEndTime,
      uint256 userBoostedShare,
      bool locked,
      uint256 lockedAmount
    );

  function calculatePerformanceFee(address _user) external view returns (uint256);

  function token() external view returns (address);

  function getPricePerFullShare() external view returns (uint256);

  function freeWithdrawFeeUsers(address user) external view returns (bool);

  function withdrawFeeContract() external view returns (uint256);

  function MIN_WITHDRAW_AMOUNT() external view returns (uint256);

  function balanceOf() external view returns (uint256);

  function calculateTotalPendingCakeRewards() external view returns (uint256);

  function totalShares() external view returns (uint256);
}
