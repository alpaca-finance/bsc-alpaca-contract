pragma solidity ^0.6.0;

import "./EnumerableSet.sol";
import "./IMdx.sol";
import "./IMasterChefBSC.sol";

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract BSCPool is Ownable {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  using EnumerableSet for EnumerableSet.AddressSet;
  EnumerableSet.AddressSet private _multLP;
  EnumerableSet.AddressSet private _blackList;

  // Info of each user.
  struct UserInfo {
    uint256 amount; // How many LP tokens the user has provided.
    uint256 rewardDebt; // Reward debt.
    uint256 multLpRewardDebt; //multLp Reward debt.
  }

  // Info of each pool.
  struct PoolInfo {
    IERC20 lpToken; // Address of LP token contract.
    uint256 allocPoint; // How many allocation points assigned to this pool. MDXs to distribute per block.
    uint256 lastRewardBlock; // Last block number that MDXs distribution occurs.
    uint256 accMdxPerShare; // Accumulated MDXs per share, times 1e12.
    uint256 accMultLpPerShare; //Accumulated multLp per share
    uint256 totalAmount; // Total amount of current pool deposit.
  }

  // The MDX Token!
  IMdx public mdx;
  // MDX tokens created per block.
  uint256 public mdxPerBlock;
  // Info of each pool.
  PoolInfo[] public poolInfo;
  // Info of each user that stakes LP tokens.
  mapping(uint256 => mapping(address => UserInfo)) public userInfo;
  // Corresponding to the pid of the multLP pool
  mapping(uint256 => uint256) public poolCorrespond;
  // pid corresponding address
  mapping(address => uint256) public LpOfPid;
  // Control mining
  bool public paused = false;
  // Total allocation points. Must be the sum of all allocation points in all pools.
  uint256 public totalAllocPoint = 0;
  // The block number when MDX mining starts.
  uint256 public startBlock;
  // multLP MasterChef
  address public multLpChef;
  // multLP Token
  address public multLpToken;
  // How many blocks are halved
  uint256 public halvingPeriod = 1670400;

  event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
  event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
  event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

  constructor(
    IMdx _mdx,
    uint256 _mdxPerBlock,
    uint256 _startBlock
  ) public {
    mdx = _mdx;
    mdxPerBlock = _mdxPerBlock;
    startBlock = _startBlock;
  }

  function setHalvingPeriod(uint256 _block) public onlyOwner {
    halvingPeriod = _block;
  }

  // Set the number of mdx produced by each block
  function setMdxPerBlock(uint256 newPerBlock) public onlyOwner {
    massUpdatePools();
    mdxPerBlock = newPerBlock;
  }

  function poolLength() public view returns (uint256) {
    return poolInfo.length;
  }

  function addBadAddress(address _bad) public onlyOwner returns (bool) {
    require(_bad != address(0), "_bad is the zero address");
    return EnumerableSet.add(_blackList, _bad);
  }

  function delBadAddress(address _bad) public onlyOwner returns (bool) {
    require(_bad != address(0), "_bad is the zero address");
    return EnumerableSet.remove(_blackList, _bad);
  }

  function getBlackListLength() public view returns (uint256) {
    return EnumerableSet.length(_blackList);
  }

  function isBadAddress(address account) public view returns (bool) {
    return EnumerableSet.contains(_blackList, account);
  }

  function getBadAddress(uint256 _index) public view onlyOwner returns (address) {
    require(_index <= getBlackListLength() - 1, "index out of bounds");
    return EnumerableSet.at(_blackList, _index);
  }

  function addMultLP(address _addLP) public onlyOwner returns (bool) {
    require(_addLP != address(0), "LP is the zero address");
    IERC20(_addLP).approve(multLpChef, uint256(-1));
    return EnumerableSet.add(_multLP, _addLP);
  }

  function isMultLP(address _LP) public view returns (bool) {
    return EnumerableSet.contains(_multLP, _LP);
  }

  function getMultLPLength() public view returns (uint256) {
    return EnumerableSet.length(_multLP);
  }

  function getMultLPAddress(uint256 _pid) public view returns (address) {
    require(_pid <= getMultLPLength() - 1, "not find this multLP");
    return EnumerableSet.at(_multLP, _pid);
  }

  function setPause() public onlyOwner {
    paused = !paused;
  }

  function setMultLP(address _multLpToken, address _multLpChef) public onlyOwner {
    require(_multLpToken != address(0) && _multLpChef != address(0), "is the zero address");
    multLpToken = _multLpToken;
    multLpChef = _multLpChef;
  }

  function replaceMultLP(address _multLpToken, address _multLpChef) public onlyOwner {
    require(_multLpToken != address(0) && _multLpChef != address(0), "is the zero address");
    require(paused == true, "No mining suspension");
    multLpToken = _multLpToken;
    multLpChef = _multLpChef;
    uint256 length = getMultLPLength();
    while (length > 0) {
      address dAddress = EnumerableSet.at(_multLP, 0);
      uint256 pid = LpOfPid[dAddress];
      IMasterChefBSC(multLpChef).emergencyWithdraw(poolCorrespond[pid]);
      EnumerableSet.remove(_multLP, dAddress);
      length--;
    }
  }

  // Add a new lp to the pool. Can only be called by the owner.
  // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
  function add(
    uint256 _allocPoint,
    IERC20 _lpToken,
    bool _withUpdate
  ) public onlyOwner {
    require(address(_lpToken) != address(0), "_lpToken is the zero address");
    if (_withUpdate) {
      massUpdatePools();
    }
    uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
    totalAllocPoint = totalAllocPoint.add(_allocPoint);
    poolInfo.push(
      PoolInfo({
        lpToken: _lpToken,
        allocPoint: _allocPoint,
        lastRewardBlock: lastRewardBlock,
        accMdxPerShare: 0,
        accMultLpPerShare: 0,
        totalAmount: 0
      })
    );
    LpOfPid[address(_lpToken)] = poolLength() - 1;
  }

  // Update the given pool's MDX allocation point. Can only be called by the owner.
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

  // The current pool corresponds to the pid of the multLP pool
  function setPoolCorr(uint256 _pid, uint256 _sid) public onlyOwner {
    require(_pid <= poolLength() - 1, "not find this pool");
    poolCorrespond[_pid] = _sid;
  }

  function phase(uint256 blockNumber) public view returns (uint256) {
    if (halvingPeriod == 0) {
      return 0;
    }
    if (blockNumber > startBlock) {
      return (blockNumber.sub(startBlock).sub(1)).div(halvingPeriod);
    }
    return 0;
  }

  function reward(uint256 blockNumber) public view returns (uint256) {
    uint256 _phase = phase(blockNumber);
    return mdxPerBlock.div(2**_phase);
  }

  function getMdxBlockReward(uint256 _lastRewardBlock) public view returns (uint256) {
    uint256 blockReward = 0;
    uint256 n = phase(_lastRewardBlock);
    uint256 m = phase(block.number);
    while (n < m) {
      n++;
      uint256 r = n.mul(halvingPeriod).add(startBlock);
      blockReward = blockReward.add((r.sub(_lastRewardBlock)).mul(reward(r)));
      _lastRewardBlock = r;
    }
    blockReward = blockReward.add((block.number.sub(_lastRewardBlock)).mul(reward(block.number)));
    return blockReward;
  }

  // Update reward variables for all pools. Be careful of gas spending!
  function massUpdatePools() public {
    uint256 length = poolInfo.length;
    for (uint256 pid = 0; pid < length; ++pid) {
      updatePool(pid);
    }
  }

  // Update reward variables of the given pool to be up-to-date.
  function updatePool(uint256 _pid) public {
    PoolInfo storage pool = poolInfo[_pid];
    if (block.number <= pool.lastRewardBlock) {
      return;
    }
    uint256 lpSupply;
    if (isMultLP(address(pool.lpToken))) {
      if (pool.totalAmount == 0) {
        pool.lastRewardBlock = block.number;
        return;
      }
      lpSupply = pool.totalAmount;
    } else {
      lpSupply = pool.lpToken.balanceOf(address(this));
      if (lpSupply == 0) {
        pool.lastRewardBlock = block.number;
        return;
      }
    }
    uint256 blockReward = getMdxBlockReward(pool.lastRewardBlock);
    if (blockReward <= 0) {
      return;
    }
    uint256 mdxReward = blockReward.mul(pool.allocPoint).div(totalAllocPoint);
    bool minRet = mdx.mint(address(this), mdxReward);
    if (minRet) {
      pool.accMdxPerShare = pool.accMdxPerShare.add(mdxReward.mul(1e12).div(lpSupply));
    }
    pool.lastRewardBlock = block.number;
  }

  // View function to see pending MDXs on frontend.
  function pending(uint256 _pid, address _user) external view returns (uint256, uint256) {
    PoolInfo storage pool = poolInfo[_pid];
    if (isMultLP(address(pool.lpToken))) {
      (uint256 mdxAmount, uint256 tokenAmount) = pendingMdxAndToken(_pid, _user);
      return (mdxAmount, tokenAmount);
    } else {
      uint256 mdxAmount = pendingMdx(_pid, _user);
      return (mdxAmount, 0);
    }
  }

  function pendingMdxAndToken(uint256 _pid, address _user) private view returns (uint256, uint256) {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][_user];
    uint256 accMdxPerShare = pool.accMdxPerShare;
    uint256 accMultLpPerShare = pool.accMultLpPerShare;
    if (user.amount > 0) {
      uint256 TokenPending = IMasterChefBSC(multLpChef).pendingCake(poolCorrespond[_pid], address(this));
      accMultLpPerShare = accMultLpPerShare.add(TokenPending.mul(1e12).div(pool.totalAmount));
      uint256 userPending = user.amount.mul(accMultLpPerShare).div(1e12).sub(user.multLpRewardDebt);
      if (block.number > pool.lastRewardBlock) {
        uint256 blockReward = getMdxBlockReward(pool.lastRewardBlock);
        uint256 mdxReward = blockReward.mul(pool.allocPoint).div(totalAllocPoint);
        accMdxPerShare = accMdxPerShare.add(mdxReward.mul(1e12).div(pool.totalAmount));
        return (user.amount.mul(accMdxPerShare).div(1e12).sub(user.rewardDebt), userPending);
      }
      if (block.number == pool.lastRewardBlock) {
        return (user.amount.mul(accMdxPerShare).div(1e12).sub(user.rewardDebt), userPending);
      }
    }
    return (0, 0);
  }

  function pendingMdx(uint256 _pid, address _user) private view returns (uint256) {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][_user];
    uint256 accMdxPerShare = pool.accMdxPerShare;
    uint256 lpSupply = pool.lpToken.balanceOf(address(this));
    if (user.amount > 0) {
      if (block.number > pool.lastRewardBlock) {
        uint256 blockReward = getMdxBlockReward(pool.lastRewardBlock);
        uint256 mdxReward = blockReward.mul(pool.allocPoint).div(totalAllocPoint);
        accMdxPerShare = accMdxPerShare.add(mdxReward.mul(1e12).div(lpSupply));
        return user.amount.mul(accMdxPerShare).div(1e12).sub(user.rewardDebt);
      }
      if (block.number == pool.lastRewardBlock) {
        return user.amount.mul(accMdxPerShare).div(1e12).sub(user.rewardDebt);
      }
    }
    return 0;
  }

  // Deposit LP tokens to BSCPool for MDX allocation.
  function deposit(uint256 _pid, uint256 _amount) public notPause {
    require(!isBadAddress(msg.sender), "Illegal, rejected ");
    PoolInfo storage pool = poolInfo[_pid];
    if (isMultLP(address(pool.lpToken))) {
      depositMdxAndToken(_pid, _amount, msg.sender);
    } else {
      depositMdx(_pid, _amount, msg.sender);
    }
  }

  function depositMdxAndToken(
    uint256 _pid,
    uint256 _amount,
    address _user
  ) private {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][_user];
    updatePool(_pid);
    if (user.amount > 0) {
      uint256 pendingAmount = user.amount.mul(pool.accMdxPerShare).div(1e12).sub(user.rewardDebt);
      if (pendingAmount > 0) {
        safeMdxTransfer(_user, pendingAmount);
      }
      uint256 beforeToken = IERC20(multLpToken).balanceOf(address(this));
      IMasterChefBSC(multLpChef).deposit(poolCorrespond[_pid], 0);
      uint256 afterToken = IERC20(multLpToken).balanceOf(address(this));
      pool.accMultLpPerShare = pool.accMultLpPerShare.add(afterToken.sub(beforeToken).mul(1e12).div(pool.totalAmount));
      uint256 tokenPending = user.amount.mul(pool.accMultLpPerShare).div(1e12).sub(user.multLpRewardDebt);
      if (tokenPending > 0) {
        IERC20(multLpToken).safeTransfer(_user, tokenPending);
      }
    }
    if (_amount > 0) {
      pool.lpToken.safeTransferFrom(_user, address(this), _amount);
      if (pool.totalAmount == 0) {
        IMasterChefBSC(multLpChef).deposit(poolCorrespond[_pid], _amount);
        user.amount = user.amount.add(_amount);
        pool.totalAmount = pool.totalAmount.add(_amount);
      } else {
        uint256 beforeToken = IERC20(multLpToken).balanceOf(address(this));
        IMasterChefBSC(multLpChef).deposit(poolCorrespond[_pid], _amount);
        uint256 afterToken = IERC20(multLpToken).balanceOf(address(this));
        pool.accMultLpPerShare = pool.accMultLpPerShare.add(
          afterToken.sub(beforeToken).mul(1e12).div(pool.totalAmount)
        );
        user.amount = user.amount.add(_amount);
        pool.totalAmount = pool.totalAmount.add(_amount);
      }
    }
    user.rewardDebt = user.amount.mul(pool.accMdxPerShare).div(1e12);
    user.multLpRewardDebt = user.amount.mul(pool.accMultLpPerShare).div(1e12);
    emit Deposit(_user, _pid, _amount);
  }

  function depositMdx(
    uint256 _pid,
    uint256 _amount,
    address _user
  ) private {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][_user];
    updatePool(_pid);
    if (user.amount > 0) {
      uint256 pendingAmount = user.amount.mul(pool.accMdxPerShare).div(1e12).sub(user.rewardDebt);
      if (pendingAmount > 0) {
        safeMdxTransfer(_user, pendingAmount);
      }
    }
    if (_amount > 0) {
      pool.lpToken.safeTransferFrom(_user, address(this), _amount);
      user.amount = user.amount.add(_amount);
      pool.totalAmount = pool.totalAmount.add(_amount);
    }
    user.rewardDebt = user.amount.mul(pool.accMdxPerShare).div(1e12);
    emit Deposit(_user, _pid, _amount);
  }

  // Withdraw LP tokens from BSCPool.
  function withdraw(uint256 _pid, uint256 _amount) public notPause {
    PoolInfo storage pool = poolInfo[_pid];
    if (isMultLP(address(pool.lpToken))) {
      withdrawMdxAndToken(_pid, _amount, msg.sender);
    } else {
      withdrawMdx(_pid, _amount, msg.sender);
    }
  }

  function withdrawMdxAndToken(
    uint256 _pid,
    uint256 _amount,
    address _user
  ) private {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][_user];
    require(user.amount >= _amount, "withdrawMdxAndToken: not good");
    updatePool(_pid);
    uint256 pendingAmount = user.amount.mul(pool.accMdxPerShare).div(1e12).sub(user.rewardDebt);
    if (pendingAmount > 0) {
      safeMdxTransfer(_user, pendingAmount);
    }
    if (_amount > 0) {
      uint256 beforeToken = IERC20(multLpToken).balanceOf(address(this));
      IMasterChefBSC(multLpChef).withdraw(poolCorrespond[_pid], _amount);
      uint256 afterToken = IERC20(multLpToken).balanceOf(address(this));
      pool.accMultLpPerShare = pool.accMultLpPerShare.add(afterToken.sub(beforeToken).mul(1e12).div(pool.totalAmount));
      uint256 tokenPending = user.amount.mul(pool.accMultLpPerShare).div(1e12).sub(user.multLpRewardDebt);
      if (tokenPending > 0) {
        IERC20(multLpToken).safeTransfer(_user, tokenPending);
      }
      user.amount = user.amount.sub(_amount);
      pool.totalAmount = pool.totalAmount.sub(_amount);
      pool.lpToken.safeTransfer(_user, _amount);
    }
    user.rewardDebt = user.amount.mul(pool.accMdxPerShare).div(1e12);
    user.multLpRewardDebt = user.amount.mul(pool.accMultLpPerShare).div(1e12);
    emit Withdraw(_user, _pid, _amount);
  }

  function withdrawMdx(
    uint256 _pid,
    uint256 _amount,
    address _user
  ) private {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][_user];
    require(user.amount >= _amount, "withdrawMdx: not good");
    updatePool(_pid);
    uint256 pendingAmount = user.amount.mul(pool.accMdxPerShare).div(1e12).sub(user.rewardDebt);
    if (pendingAmount > 0) {
      safeMdxTransfer(_user, pendingAmount);
    }
    if (_amount > 0) {
      user.amount = user.amount.sub(_amount);
      pool.totalAmount = pool.totalAmount.sub(_amount);
      pool.lpToken.safeTransfer(_user, _amount);
    }
    user.rewardDebt = user.amount.mul(pool.accMdxPerShare).div(1e12);
    emit Withdraw(_user, _pid, _amount);
  }

  // Withdraw without caring about rewards. EMERGENCY ONLY.
  function emergencyWithdraw(uint256 _pid) public notPause {
    PoolInfo storage pool = poolInfo[_pid];
    if (isMultLP(address(pool.lpToken))) {
      emergencyWithdrawMdxAndToken(_pid, msg.sender);
    } else {
      emergencyWithdrawMdx(_pid, msg.sender);
    }
  }

  function emergencyWithdrawMdxAndToken(uint256 _pid, address _user) private {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][_user];
    uint256 amount = user.amount;
    uint256 beforeToken = IERC20(multLpToken).balanceOf(address(this));
    IMasterChefBSC(multLpChef).withdraw(poolCorrespond[_pid], amount);
    uint256 afterToken = IERC20(multLpToken).balanceOf(address(this));
    pool.accMultLpPerShare = pool.accMultLpPerShare.add(afterToken.sub(beforeToken).mul(1e12).div(pool.totalAmount));
    user.amount = 0;
    user.rewardDebt = 0;
    pool.lpToken.safeTransfer(_user, amount);
    pool.totalAmount = pool.totalAmount.sub(amount);
    emit EmergencyWithdraw(_user, _pid, amount);
  }

  function emergencyWithdrawMdx(uint256 _pid, address _user) private {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][_user];
    uint256 amount = user.amount;
    user.amount = 0;
    user.rewardDebt = 0;
    pool.lpToken.safeTransfer(_user, amount);
    pool.totalAmount = pool.totalAmount.sub(amount);
    emit EmergencyWithdraw(_user, _pid, amount);
  }

  // Safe MDX transfer function, just in case if rounding error causes pool to not have enough MDXs.
  function safeMdxTransfer(address _to, uint256 _amount) internal {
    uint256 mdxBal = mdx.balanceOf(address(this));
    if (_amount > mdxBal) {
      mdx.transfer(_to, mdxBal);
    } else {
      mdx.transfer(_to, _amount);
    }
  }

  modifier notPause() {
    require(paused == false, "Mining has been suspended");
    _;
  }
}
