pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./WaultSwapToken.sol";

contract WexMaster is Ownable {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  struct UserInfo {
    uint256 amount;
    uint256 rewardDebt;
    uint256 pendingRewards;
  }

  struct PoolInfo {
    IERC20 lpToken;
    uint256 allocPoint;
    uint256 lastRewardBlock;
    uint256 accWexPerShare;
  }

  WaultSwapToken public wex;
  uint256 public wexPerBlock;

  PoolInfo[] public poolInfo;
  mapping(uint256 => mapping(address => UserInfo)) public userInfo;
  uint256 public totalAllocPoint = 0;
  uint256 public startBlock;

  event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
  event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
  event Claim(address indexed user, uint256 indexed pid, uint256 amount);
  event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

  constructor(
    WaultSwapToken _wex,
    uint256 _wexPerBlock,
    uint256 _startBlock
  ) public {
    wex = _wex;
    wexPerBlock = _wexPerBlock;
    startBlock = _startBlock;
  }

  function poolLength() external view returns (uint256) {
    return poolInfo.length;
  }

  function getMultiplier(uint256 _from, uint256 _to) public pure returns (uint256) {
    return _to.sub(_from);
  }

  function add(
    uint256 _allocPoint,
    IERC20 _lpToken,
    bool _withUpdate
  ) public onlyOwner {
    if (_withUpdate) {
      massUpdatePools();
    }
    uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
    totalAllocPoint = totalAllocPoint.add(_allocPoint);
    poolInfo.push(
      PoolInfo({ lpToken: _lpToken, allocPoint: _allocPoint, lastRewardBlock: lastRewardBlock, accWexPerShare: 0 })
    );
  }

  function set(
    uint256 _pid,
    uint256 _allocPoint,
    bool _withUpdate
  ) public onlyOwner {
    if (_withUpdate) {
      massUpdatePools();
    }
    totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(_allocPoint);
    poolInfo[_pid].allocPoint = _allocPoint;
  }

  function pendingWex(uint256 _pid, address _user) external view returns (uint256) {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][_user];
    uint256 accWexPerShare = pool.accWexPerShare;
    uint256 lpSupply = pool.lpToken.balanceOf(address(this));
    if (block.number > pool.lastRewardBlock && lpSupply != 0) {
      uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
      uint256 wexReward = multiplier.mul(wexPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
      accWexPerShare = accWexPerShare.add(wexReward.mul(1e12).div(lpSupply));
    }
    return user.amount.mul(accWexPerShare).div(1e12).sub(user.rewardDebt).add(user.pendingRewards);
  }

  function massUpdatePools() public {
    uint256 length = poolInfo.length;
    for (uint256 pid = 0; pid < length; ++pid) {
      updatePool(pid);
    }
  }

  function updatePool(uint256 _pid) public {
    PoolInfo storage pool = poolInfo[_pid];
    if (block.number <= pool.lastRewardBlock) {
      return;
    }
    uint256 lpSupply = pool.lpToken.balanceOf(address(this));
    if (lpSupply == 0) {
      pool.lastRewardBlock = block.number;
      return;
    }
    uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
    uint256 wexReward = multiplier.mul(wexPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
    wex.mint(address(this), wexReward);
    pool.accWexPerShare = pool.accWexPerShare.add(wexReward.mul(1e12).div(lpSupply));
    pool.lastRewardBlock = block.number;
  }

  function deposit(
    uint256 _pid,
    uint256 _amount,
    bool _withdrawRewards
  ) public {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][msg.sender];
    updatePool(_pid);
    if (user.amount > 0) {
      uint256 pending = user.amount.mul(pool.accWexPerShare).div(1e12).sub(user.rewardDebt);

      if (pending > 0) {
        user.pendingRewards = user.pendingRewards.add(pending);

        if (_withdrawRewards) {
          safeWexTransfer(msg.sender, user.pendingRewards);
          emit Claim(msg.sender, _pid, user.pendingRewards);
          user.pendingRewards = 0;
        }
      }
    }
    if (_amount > 0) {
      pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
      user.amount = user.amount.add(_amount);
    }
    user.rewardDebt = user.amount.mul(pool.accWexPerShare).div(1e12);
    emit Deposit(msg.sender, _pid, _amount);
  }

  function withdraw(
    uint256 _pid,
    uint256 _amount,
    bool _withdrawRewards
  ) public {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][msg.sender];
    require(user.amount >= _amount, "withdraw: not good");
    updatePool(_pid);
    uint256 pending = user.amount.mul(pool.accWexPerShare).div(1e12).sub(user.rewardDebt);
    if (pending > 0) {
      user.pendingRewards = user.pendingRewards.add(pending);

      if (_withdrawRewards) {
        safeWexTransfer(msg.sender, user.pendingRewards);
        emit Claim(msg.sender, _pid, user.pendingRewards);
        user.pendingRewards = 0;
      }
    }
    if (_amount > 0) {
      user.amount = user.amount.sub(_amount);
      pool.lpToken.safeTransfer(address(msg.sender), _amount);
    }
    user.rewardDebt = user.amount.mul(pool.accWexPerShare).div(1e12);
    emit Withdraw(msg.sender, _pid, _amount);
  }

  function emergencyWithdraw(uint256 _pid) public {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][msg.sender];
    pool.lpToken.safeTransfer(address(msg.sender), user.amount);
    emit EmergencyWithdraw(msg.sender, _pid, user.amount);
    user.amount = 0;
    user.rewardDebt = 0;
    user.pendingRewards = 0;
  }

  function claim(uint256 _pid) public {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][msg.sender];
    updatePool(_pid);
    uint256 pending = user.amount.mul(pool.accWexPerShare).div(1e12).sub(user.rewardDebt);
    if (pending > 0 || user.pendingRewards > 0) {
      user.pendingRewards = user.pendingRewards.add(pending);
      safeWexTransfer(msg.sender, user.pendingRewards);
      emit Claim(msg.sender, _pid, user.pendingRewards);
      user.pendingRewards = 0;
    }
    user.rewardDebt = user.amount.mul(pool.accWexPerShare).div(1e12);
  }

  function safeWexTransfer(address _to, uint256 _amount) internal {
    uint256 wexBal = wex.balanceOf(address(this));
    if (_amount > wexBal) {
      wex.transfer(_to, wexBal);
    } else {
      wex.transfer(_to, _amount);
    }
  }

  function setWexPerBlock(uint256 _wexPerBlock) public onlyOwner {
    require(_wexPerBlock > 0, "!wexPerBlock-0");
    wexPerBlock = _wexPerBlock;
  }
}
