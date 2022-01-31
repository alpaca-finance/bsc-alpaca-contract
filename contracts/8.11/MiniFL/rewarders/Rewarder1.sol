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

contract Rewarder1 is IRewarder, OwnableUpgradeable, ReentrancyGuardUpgradeable {
  using SafeCastUpgradeable for uint256;
  using SafeCastUpgradeable for uint128;
  using SafeCastUpgradeable for int256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  error Rewarder1_BadArguments();
  error Rewarder1_NotFL();
  error Rewarder1_PoolExisted();
  error Rewarder1_PoolNotExisted();

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
  string public name;

  uint256 public maxRewardPerSecond;

  event LogOnDeposit(address indexed user, uint256 indexed pid, uint256 amount);
  event LogOnWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
  event LogHarvest(address indexed user, uint256 indexed pid, uint256 amount);
  event LogAddPool(uint256 indexed pid, uint256 allocPoint);
  event LogSetPool(uint256 indexed pid, uint256 allocPoint);
  event LogUpdatePool(uint256 indexed pid, uint64 lastRewardTime, uint256 stakedBalance, uint256 accRewardPerShare);
  event LogRewardPerSecond(uint256 rewardPerSecond);
  event LogSetName(string name);
  event LogSetMaxRewardPerSecond(uint256 maxRewardPerSecond);

  function initialize(
    string calldata _name,
    address _miniFL,
    IERC20Upgradeable _rewardToken,
    uint256 _maxRewardPerSecond
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();

    name = _name;
    miniFL = _miniFL;
    rewardToken = _rewardToken;
    maxRewardPerSecond = _maxRewardPerSecond;
  }

  function onDeposit(
    uint256 _pid,
    address _user,
    uint256, /* _alpacaAmount */
    uint256 _newAmount
  ) external override nonReentrant onlyFL {
    PoolInfo memory pool = _updatePool(_pid);
    UserInfo storage user = userInfo[_pid][_user];

    uint256 _amount = _newAmount - user.amount;

    user.amount = _newAmount;
    user.rewardDebt = user.rewardDebt + ((_amount * pool.accRewardPerShare) / ACC_REWARD_PRECISION).toInt256();

    emit LogOnDeposit(_user, _pid, _amount);
  }

  function onWithdraw(
    uint256 _pid,
    address _user,
    uint256, /* _alpacaAmount */
    uint256 _newAmount
  ) external override nonReentrant onlyFL {
    PoolInfo memory pool = _updatePool(_pid);
    UserInfo storage user = userInfo[_pid][_user];

    uint256 _amount = 0;
    if (user.amount >= _newAmount) {
      // Handling normal case; When onDeposit call before onWithdraw
      _amount = user.amount - _newAmount;

      user.rewardDebt = user.rewardDebt - (((_amount * pool.accRewardPerShare) / ACC_REWARD_PRECISION)).toInt256();
      user.amount = user.amount - _amount;

      emit LogOnWithdraw(_user, _pid, _amount);
    } else {
      // Handling when rewarder1 getting set after the pool is live
      // if user.amount < _newAmount, then it is first deposit.
      user.amount = _newAmount;
      user.rewardDebt = user.rewardDebt + ((_newAmount * pool.accRewardPerShare) / ACC_REWARD_PRECISION).toInt256();

      emit LogOnDeposit(_user, _pid, _newAmount);
    }
  }

  function onHarvest(
    uint256 _pid,
    address _user,
    uint256 /* _alpacaAmount */
  ) external override nonReentrant onlyFL {
    PoolInfo memory pool = _updatePool(_pid);
    UserInfo storage user = userInfo[_pid][_user];

    int256 _accumulatedRewards = ((user.amount * pool.accRewardPerShare) / ACC_REWARD_PRECISION).toInt256();
    uint256 _pendingRewards = (_accumulatedRewards - user.rewardDebt).toUint256();

    user.rewardDebt = _accumulatedRewards;

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
  /// @param _withUpdate If true, do mass update pools
  function setRewardPerSecond(uint256 _rewardPerSecond, bool _withUpdate) external onlyOwner {
    if (_rewardPerSecond > maxRewardPerSecond) revert Rewarder1_BadArguments();

    if (_withUpdate) _massUpdatePools();
    rewardPerSecond = _rewardPerSecond;
    emit LogRewardPerSecond(_rewardPerSecond);
  }

  modifier onlyFL() {
    if (msg.sender != miniFL) revert Rewarder1_NotFL();
    _;
  }

  /// @notice Returns the number of pools.
  function poolLength() public view returns (uint256 pools) {
    pools = poolIds.length;
  }

  /// @notice Add a new pool. Can only be called by the owner.
  /// @param _allocPoint The new allocation point
  /// @param _pid The Pool ID on MiniFL
  /// @param _withUpdate If true, do mass update pools
  function addPool(
    uint256 _allocPoint,
    uint256 _pid,
    bool _withUpdate
  ) external onlyOwner {
    if (poolInfo[_pid].lastRewardTime != 0) revert Rewarder1_PoolExisted();

    if (_withUpdate) _massUpdatePools();

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
  /// @param _withUpdate If true, do mass update pools
  function setPool(
    uint256 _pid,
    uint256 _allocPoint,
    bool _withUpdate
  ) external onlyOwner {
    if (_withUpdate) _massUpdatePools();
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
      _updatePool(poolIds[i]);
    }
  }

  /// @notice Perform the actual updatePool
  /// @param _pid The index of the pool. See `poolInfo`.
  function _updatePool(uint256 _pid) internal returns (PoolInfo memory) {
    PoolInfo memory _poolInfo = poolInfo[_pid];

    if (_poolInfo.lastRewardTime == 0) revert Rewarder1_PoolNotExisted();

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

  /// @notice Update reward variables for a given pools.
  function updatePools(uint256[] calldata _pids) external nonReentrant {
    uint256 len = _pids.length;
    for (uint256 i = 0; i < len; i++) {
      _updatePool(_pids[i]);
    }
  }

  /// @notice Update reward variables for all pools. Be careful of gas spending!
  function massUpdatePools() external nonReentrant {
    _massUpdatePools();
  }

  /// @notice Change the name of the rewarder.
  /// @param _newName The new name of the rewarder.
  function setName(string calldata _newName) external onlyOwner {
    name = _newName;
    emit LogSetName(_newName);
  }

  /// @notice Set max reward per second
  /// @param _maxRewardPerSecond The max reward per second
  function setMaxRewardPerSecond(uint256 _maxRewardPerSecond) external onlyOwner {
    if (_maxRewardPerSecond <= rewardPerSecond) revert Rewarder1_BadArguments();

    maxRewardPerSecond = _maxRewardPerSecond;
    emit LogSetMaxRewardPerSecond(_maxRewardPerSecond);
  }
}
