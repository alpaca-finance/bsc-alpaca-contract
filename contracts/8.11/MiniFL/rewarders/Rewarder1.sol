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

pragma solidity 0.8.11;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

import "../interfaces/IMiniFL.sol";
import "../interfaces/IRewarder.sol";

import "hardhat/console.sol";

contract Rewarder1 is IRewarder, OwnableUpgradeable, ReentrancyGuardUpgradeable {
  using SafeCastUpgradeable for uint256;
  using SafeCastUpgradeable for uint128;
  using SafeCastUpgradeable for int256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  error Reward1_NotFL();
  error Reward1_PoolExisted();

  IERC20Upgradeable public rewardToken;

  struct UserInfo {
    uint256 amount;
    int256 rewardDebt;
  }

  struct PoolInfo {
    uint128 accRewardPerShare;
    uint64 lastRewardTime;
    uint64 allocPoint;
  }

  mapping(uint256 => PoolInfo) public poolInfo;
  uint256[] public poolIds;

  mapping(uint256 => mapping(address => UserInfo)) public userInfo;
  uint256 public totalAllocPoint;
  uint256 public rewardPerSecond;
  uint256 private constant ACC_REWARD_PRECISION = 1e12;

  address public miniFL;

  event LogOnDeposit(address indexed user, uint256 indexed pid, uint256 amount);
  event LogOnWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
  event LogHarvest(address indexed user, uint256 indexed pid, uint256 amount);
  event LogAddPool(uint256 indexed pid, uint256 allocPoint);
  event LogSetPool(uint256 indexed pid, uint256 allocPoint);
  event LogUpdatePool(uint256 indexed pid, uint64 lastRewardTime, uint256 lpSupply, uint256 accRewardPerShare);
  event LogRewardPerSecond(uint256 rewardPerSecond);

  function initialize(IERC20Upgradeable _rewardToken, address _miniFL) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();

    rewardToken = _rewardToken;
    miniFL = _miniFL;
  }

  function onDeposit(
    uint256 _pid,
    address _user,
    uint256 _newAmount
  ) external override nonReentrant onlyFL {
    PoolInfo memory pool = _updatePool(_pid);
    UserInfo storage user = userInfo[_pid][_user];

    user.amount = _newAmount;
    user.rewardDebt = user.rewardDebt + ((_newAmount * pool.accRewardPerShare) / ACC_REWARD_PRECISION).toInt256();

    emit LogOnDeposit(_user, _pid, _newAmount);
  }

  function onWithdraw(
    uint256 _pid,
    address _user,
    uint256 _newAmount
  ) external override nonReentrant onlyFL {
    PoolInfo memory pool = _updatePool(_pid);
    UserInfo storage user = userInfo[_pid][_user];

    uint256 _amount = user.amount - _newAmount;

    user.rewardDebt = user.rewardDebt - (int256((_amount * pool.accRewardPerShare) / ACC_REWARD_PRECISION));
    user.amount = user.amount - _amount;

    emit LogOnWithdraw(_user, _pid, _amount);
  }

  function onHarvest(uint256 _pid, address _user) external override nonReentrant onlyFL {
    PoolInfo memory pool = _updatePool(_pid);
    UserInfo storage user = userInfo[_pid][_user];

    int256 _accumulatedAlpaca = ((user.amount * pool.accRewardPerShare) / ACC_REWARD_PRECISION).toInt256();
    uint256 _pendingRewards = (_accumulatedAlpaca - user.rewardDebt).toUint256();

    user.rewardDebt = _accumulatedAlpaca;

    if (_pendingRewards != 0) {
      rewardToken.safeTransfer(_user, _pendingRewards);
    }

    emit LogHarvest(_user, _pid, _pendingRewards);
  }

  function pendingTokens(
    uint256 _pid,
    address _user,
    uint256
  ) external view override returns (IERC20Upgradeable[] memory rewardTokens, uint256[] memory rewardAmounts) {
    IERC20Upgradeable[] memory _rewardTokens = new IERC20Upgradeable[](1);
    _rewardTokens[0] = (rewardToken);
    uint256[] memory _rewardAmounts = new uint256[](1);
    _rewardAmounts[0] = pendingToken(_pid, _user);
    return (_rewardTokens, _rewardAmounts);
  }

  /// @notice Sets the reward per second to be distributed.
  /// @dev Can only be called by the owner.
  /// @param _rewardPerSecond The amount of reward token to be distributed per second.
  function setRewardPerSecond(uint256 _rewardPerSecond) public onlyOwner {
    _massUpdatePools();
    rewardPerSecond = _rewardPerSecond;
    emit LogRewardPerSecond(_rewardPerSecond);
  }

  modifier onlyFL() {
    if (msg.sender != miniFL) revert Reward1_NotFL();
    _;
  }

  /// @notice Returns the number of MCV2 pools.
  function poolLength() public view returns (uint256 pools) {
    pools = poolIds.length;
  }

  /// @notice Add a new LP to the pool. Can only be called by the owner.
  /// @param _allocPoint The new allocation point
  /// @param _pid The Pool ID on MiniFL
  function addPool(uint256 _allocPoint, uint256 _pid) public onlyOwner {
    if (poolInfo[_pid].lastRewardTime != 0) revert Reward1_PoolExisted();

    _massUpdatePools();

    uint256 _lastRewardTime = block.timestamp;
    totalAllocPoint = totalAllocPoint + _allocPoint;

    poolInfo[_pid] = PoolInfo({
      allocPoint: _allocPoint.toUint64(),
      lastRewardTime: _lastRewardTime.toUint64(),
      accRewardPerShare: 0
    });
    poolIds.push(_pid);
    emit LogAddPool(_pid, _allocPoint);
  }

  /// @notice Update the given pool's allocation point.
  /// @dev Can only be called by the owner.
  /// @param _pid The index of the pool. See `poolInfo`.
  /// @param _allocPoint The allocation point of the pool.
  function setPool(uint256 _pid, uint256 _allocPoint) public onlyOwner {
    _massUpdatePools();
    totalAllocPoint = totalAllocPoint - poolInfo[_pid].allocPoint + _allocPoint;
    poolInfo[_pid].allocPoint = _allocPoint.toUint64();
    emit LogSetPool(_pid, _allocPoint);
  }

  /// @notice View function to see pending rewards for a given pool.
  /// @param _pid The index of the pool. See `poolInfo`.
  /// @param _user Address of user.
  /// @return pending reward for a given user.
  function pendingToken(uint256 _pid, address _user) public view returns (uint256) {
    PoolInfo memory _poolInfo = poolInfo[_pid];
    UserInfo storage _userInfo = userInfo[_pid][_user];
    uint256 _accRewardPerShare = _poolInfo.accRewardPerShare;
    uint256 _stakedBalance = IMiniFL(miniFL).stakingToken(_pid).balanceOf(miniFL);
    if (block.timestamp > _poolInfo.lastRewardTime && _stakedBalance != 0) {
      uint256 _timePast = block.timestamp - _poolInfo.lastRewardTime;
      uint256 _rewards = (_timePast * rewardPerSecond * _poolInfo.allocPoint) / totalAllocPoint;
      _accRewardPerShare = _accRewardPerShare + ((_rewards * ACC_REWARD_PRECISION) / _stakedBalance);
    }
    return
      (((_userInfo.amount * _accRewardPerShare) / ACC_REWARD_PRECISION).toInt256() - _userInfo.rewardDebt).toUint256();
  }

  function _massUpdatePools() internal {
    uint256 _len = poolLength();
    for (uint256 i = 0; i < _len; ++i) {
      _updatePool(i);
    }
  }

  /// @notice Update reward variables for all pools. Be careful of gas spending!
  function massUpdatePools() external nonReentrant {
    _massUpdatePools();
  }

  /// @notice Perform the actual updatePool
  /// @param _pid The index of the pool. See `poolInfo`.
  function _updatePool(uint256 _pid) internal returns (PoolInfo memory) {
    PoolInfo memory _poolInfo = poolInfo[_pid];
    if (block.timestamp > _poolInfo.lastRewardTime) {
      uint256 _stakedBalance = IMiniFL(miniFL).stakingToken(_pid).balanceOf(miniFL);

      if (_stakedBalance > 0) {
        uint256 _timePast = block.timestamp - _poolInfo.lastRewardTime;
        uint256 _rewards = (_timePast * rewardPerSecond * _poolInfo.allocPoint) / totalAllocPoint;
        _poolInfo.accRewardPerShare =
          _poolInfo.accRewardPerShare +
          ((_rewards * ACC_REWARD_PRECISION) / _stakedBalance).toUint128();
      }
      _poolInfo.lastRewardTime = block.timestamp.toUint64();
      poolInfo[_pid] = _poolInfo;
      emit LogUpdatePool(_pid, _poolInfo.lastRewardTime, _stakedBalance, _poolInfo.accRewardPerShare);
    }
    return _poolInfo;
  }

  /// @notice Update reward variables of the given pool.
  /// @param _pid The index of the pool. See `poolInfo`.
  /// @return pool Returns the pool that was updated.
  function updatePool(uint256 _pid) external nonReentrant returns (PoolInfo memory) {
    return _updatePool(_pid);
  }
}
