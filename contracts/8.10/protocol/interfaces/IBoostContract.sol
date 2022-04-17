// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IBoostContract {
  function onCakePoolUpdate(
    address _user,
    uint256 _lockedAmount,
    uint256 _lockedDuration,
    uint256 _totalLockedAmount,
    uint256 _maxLockDuration
  ) external;
}
