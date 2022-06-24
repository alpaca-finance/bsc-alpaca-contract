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

pragma solidity 0.8.15;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IFairLaunch } from "./interfaces/IFairLaunch.sol";

/// @title AIP8AUSDStaking is a staking contract for users to stake AUSD-3EPS LP Token to obtain
/// the allocation for Private Automated Vaults of Alpaca Finance. This contract is implemented as part of the AIP-8.
/// AIP-8: https://forum.alpacafinance.org/t/aip-8-increase-ausd-utility-by-providing-access-to-high-leveraged-avs/464
contract AIP8AUSDStaking is ReentrancyGuardUpgradeable, OwnableUpgradeable {
  // --- Libraries ---
  using SafeERC20Upgradeable for IERC20Upgradeable;

  // --- Events ---
  event LogInitializePositions(address indexed _from, uint256 _stableVaultPosId);

  // --- Errors ---
  error AIP8AUSDStaking_ViolateMinimumLockPeriod(uint256 inputLockUntil);
  error AIP8AUSDStaking_ViolateMaximumLockPeriod(uint256 inputLockUntil);
  error AIP8AUSDStaking_ViolatePreviousLockPeriod(uint256 inputLockUntil);
  error AIP8AUSDStaking_NotEnoughAlpacaReward(uint256 wantAmount, uint256 actualAmount);
  error AIP8AUSDStaking_StillInLockPeriod();

  // --- Structs ---
  struct UserInfo {
    uint256 stakingAmount; // the amount of the staking token of this user
    uint256 lockUntil; // the timestamp that the lock period will end
    uint256 alpacaRewardDebt; // the reward debt
  }

  // --- Constants ---
  uint256 public constant WEEK = 7 days;
  uint256 public constant MAX_LOCK = (53 * WEEK) - 1; // MAX_LOCK 53 weeks - 1 seconds

  // --- States ---
  IERC20Upgradeable public stakingToken; // AUSD3EPS LP Token
  IERC20Upgradeable public alpaca; // Alpaca Token; which is the reward token
  IFairLaunch public fairlaunch; // Alpaca's Fairlaunch Staking Contract
  uint256 public pid; // Pool Id of AUSD3EPS at Alpaca's Fairlaunch Staking Contract
  uint256 public accAlpacaPerShare; // `accAlpacaPerShare` of AUSD3EPS pool for reward distribution
  mapping(address => UserInfo) public userInfo; // the mapping of user's address and its user staking info

  function initialize(IFairLaunch _fairlaunch, uint256 _pid) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();

    (address _stakingToken, , , , ) = _fairlaunch.poolInfo(_pid);
    alpaca = IERC20Upgradeable(_fairlaunch.alpaca());
    fairlaunch = _fairlaunch;
    stakingToken = IERC20Upgradeable(_stakingToken);
    pid = _pid;

    // Perform first deposit to AUSD3EPS pool at Alpaca's Fairlaunch
    fairlaunch.deposit(address(this), pid, 0);

    // Set initial `accAlpacaPerShare`
    accAlpacaPerShare = 0;

    // Approve max allowance to Fairlaunch
    stakingToken.approve(address(fairlaunch), type(uint256).max);
  }

  function refreshAllowance() external onlyOwner {
    stakingToken.approve(address(fairlaunch), type(uint256).max);
  }

  function lock(uint256 _amount, uint256 _lockUntil) external nonReentrant {
    UserInfo memory _userInfo = userInfo[msg.sender];

    // CHECK
    // 1. Validate `_lockUntil`
    if (_lockUntil < block.timestamp + WEEK) {
      revert AIP8AUSDStaking_ViolateMinimumLockPeriod(_lockUntil);
    }
    if (_lockUntil > block.timestamp + MAX_LOCK) {
      revert AIP8AUSDStaking_ViolateMaximumLockPeriod(_lockUntil);
    }
    if (_userInfo.stakingAmount > 0 && _lockUntil <= _userInfo.lockUntil) {
      revert AIP8AUSDStaking_ViolatePreviousLockPeriod(_lockUntil);
    }

    // EFFECT
    // 2. Harvest from Fairlaunch
    _harvest();
    // 3. Update UserInfo
    userInfo[msg.sender].stakingAmount += _amount;
    userInfo[msg.sender].lockUntil = _lockUntil;
    userInfo[msg.sender].alpacaRewardDebt = (userInfo[msg.sender].stakingAmount * accAlpacaPerShare) / 1e12;

    // INTERACTION
    if (_amount > 0) {
      // 4. Request AUSD3EPS from user
      stakingToken.safeTransferFrom(msg.sender, address(this), _amount);
      // 5. Deposit to Fairlaunch
      fairlaunch.deposit(address(this), pid, _amount);
    }
  }

  function unlock() external nonReentrant {
    UserInfo memory _userInfo = userInfo[msg.sender];
    uint256 _userStakingAmount = _userInfo.stakingAmount;

    // CHECK
    // 1. Check if the lock has expired
    if (_userInfo.lockUntil > block.timestamp) revert AIP8AUSDStaking_StillInLockPeriod();

    // EFFECT
    // 2. Harvest from Fairlaunch and distribute ALPACA reward to user
    _harvest();
    // 3. Clear state of UserInfo
    userInfo[msg.sender] = UserInfo({ stakingAmount: 0, lockUntil: 0, alpacaRewardDebt: 0 });

    // INTERACTION
    // 4. Withdraw AUSD3EPS from Fairlaunch
    fairlaunch.withdraw(address(this), pid, _userStakingAmount);
    // 5. Transfer AUSD3EPS back to user
    stakingToken.safeTransfer(msg.sender, _userStakingAmount);
  }

  function harvest() external nonReentrant {
    _harvest();

    userInfo[msg.sender].alpacaRewardDebt = (userInfo[msg.sender].stakingAmount * accAlpacaPerShare) / 1e12;
  }

  function _harvest() internal {
    // 1. Get harvested ALPACA balance from Fairlaunch
    uint256 _alpacaBalanceBefore = alpaca.balanceOf(address(this));
    fairlaunch.deposit(address(this), pid, 0);
    uint256 _alpacaBalanceAfter = alpaca.balanceOf(address(this)) - _alpacaBalanceBefore;

    // 2. Update `accAlpacaPerShare`
    (uint256 _totalAmountInFairlaunch, , , ) = fairlaunch.userInfo(pid, address(this));
    uint256 _newAlpacaRewardPerShare = _totalAmountInFairlaunch > 0
      ? (_alpacaBalanceAfter * 1e12) / _totalAmountInFairlaunch
      : 0;
    accAlpacaPerShare += _newAlpacaRewardPerShare;

    // 3. Calculate pending ALPACA to be received for user
    UserInfo memory _userInfo = userInfo[msg.sender];
    uint256 _pendingAlpaca = ((_userInfo.stakingAmount * accAlpacaPerShare) / 1e12) - _userInfo.alpacaRewardDebt;

    // 4. Send ALPACA to user
    if (alpaca.balanceOf(address(this)) < _pendingAlpaca)
      revert AIP8AUSDStaking_NotEnoughAlpacaReward(_pendingAlpaca, alpaca.balanceOf(address(this)));
    alpaca.safeTransfer(msg.sender, _pendingAlpaca);
  }

  function balanceOf(address _user) external view returns (uint256) {
    UserInfo memory _userInfo = userInfo[_user];
    uint256 _lockPeriod = _userInfo.lockUntil > block.timestamp ? _userInfo.lockUntil - block.timestamp : 0;
    return (_userInfo.stakingAmount * _lockPeriod) / MAX_LOCK;
  }

  function pendingAlpaca(address _user) external view returns (uint256) {
    uint256 _currentAccAlpacaPerShare = accAlpacaPerShare;
    uint256 _pendingAlpacaOfThisContract = fairlaunch.pendingAlpaca(pid, address(this));
    (uint256 _totalAmountInFairlaunch, , , ) = fairlaunch.userInfo(pid, address(this));
    uint256 _newAccAlpacaPerShare = _currentAccAlpacaPerShare +
      ((_pendingAlpacaOfThisContract * 1e12) / _totalAmountInFairlaunch);

    UserInfo memory _userInfo = userInfo[_user];
    return ((_userInfo.stakingAmount * _newAccAlpacaPerShare) / 1e12) - _userInfo.alpacaRewardDebt;
  }
}
