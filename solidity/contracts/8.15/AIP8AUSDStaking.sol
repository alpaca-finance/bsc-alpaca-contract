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
  event LogEmergencyWithdraw(address indexed _owner, uint256 _amount);
  event LogEnableEmergencyWithdraw(address indexed _owner);

  // --- Errors ---
  error AIP8AUSDStaking_Terminated();
  error AIP8AUSDStaking_ViolateMinimumLockPeriod(uint256 inputLockUntil);
  error AIP8AUSDStaking_ViolateMaximumLockPeriod(uint256 inputLockUntil);
  error AIP8AUSDStaking_ViolatePreviousLockPeriod(uint256 inputLockUntil);
  error AIP8AUSDStaking_NotEnoughAlpacaReward(uint256 wantAmount, uint256 actualAmount);
  error AIP8AUSDStaking_StillInLockPeriod();
  error AIP8AUSDStaking_NotStopped();
  error AIP8AUSDStaking_Stopped();

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
  bool public stopped;

  modifier whenStopped() {
    if (!stopped) {
      revert AIP8AUSDStaking_NotStopped();
    }
    _;
  }

  modifier whenNotStopped() {
    if (stopped) {
      revert AIP8AUSDStaking_Stopped();
    }
    _;
  }

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

  function lock(
    uint256, /*_amount*/
    uint256 /*_lockUntil*/
  ) external {
    revert AIP8AUSDStaking_Terminated();
  }

  function unlock() external nonReentrant whenNotStopped {
    UserInfo storage _userInfo = userInfo[msg.sender];
    uint256 _userStakingAmount = _userInfo.stakingAmount;

    // CHECK
    // 1. No longer check lockUntil
    // if (_userInfo.lockUntil > block.timestamp) revert AIP8AUSDStaking_StillInLockPeriod();

    // EFFECT
    // 2. Harvest from Fairlaunch and distribute ALPACA reward to user
    _harvest();
    // 3. Clear state of UserInfo
    _userInfo.stakingAmount = 0;
    _userInfo.lockUntil = 0;
    _userInfo.alpacaRewardDebt = 0;

    // INTERACTION
    // 4. Withdraw AUSD3EPS from Fairlaunch
    fairlaunch.withdraw(address(this), pid, _userStakingAmount);
    // 5. Transfer AUSD3EPS back to user
    stakingToken.safeTransfer(msg.sender, _userStakingAmount);
  }

  function harvest() external nonReentrant whenNotStopped {
    _harvest();

    userInfo[msg.sender].alpacaRewardDebt = (userInfo[msg.sender].stakingAmount * accAlpacaPerShare) / 1e12;
  }

  function _harvest() internal {
    // 1. Get harvested ALPACA balance from Fairlaunch
    uint256 _alpacaBalanceBefore = alpaca.balanceOf(address(this));
    // We use `Fairlaunch.deposit()` here instead of `Fairlaunch.harvest()` to prevent revert
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
    (uint256 _totalAmountInFairlaunch, , , ) = fairlaunch.userInfo(pid, address(this));
    if (_totalAmountInFairlaunch == 0) return 0;
    uint256 _currentAccAlpacaPerShare = accAlpacaPerShare;
    uint256 _pendingAlpacaOfThisContract = fairlaunch.pendingAlpaca(pid, address(this));
    uint256 _newAccAlpacaPerShare = _currentAccAlpacaPerShare +
      ((_pendingAlpacaOfThisContract * 1e12) / _totalAmountInFairlaunch);

    UserInfo memory _userInfo = userInfo[_user];
    return ((_userInfo.stakingAmount * _newAccAlpacaPerShare) / 1e12) - _userInfo.alpacaRewardDebt;
  }

  function emergencyWithdraw() external whenStopped nonReentrant {
    UserInfo storage _userInfo = userInfo[msg.sender];
    uint256 _userStakingAmount = _userInfo.stakingAmount;

    // 1. Clear state of UserInfo
    _userInfo.stakingAmount = 0;
    _userInfo.lockUntil = 0;
    _userInfo.alpacaRewardDebt = 0;

    // 2. Transfer AUSD3EPS back to user
    stakingToken.safeTransfer(msg.sender, _userStakingAmount);

    emit LogEmergencyWithdraw(msg.sender, _userStakingAmount);
  }

  function enableEmergencyWithdraw() external onlyOwner {
    fairlaunch.emergencyWithdraw(pid);
    stopped = true;

    emit LogEnableEmergencyWithdraw(msg.sender);
  }
}
