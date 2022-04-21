// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IBEP20.sol";
import "./SafeBEP20.sol";
import "./IMasterChef.sol";

/// @notice The (older) MasterChef contract gives out a constant number of CAKE tokens per block.
/// It is the only address with minting rights for CAKE.
/// The idea for this MasterChef V2 (MCV2) contract is therefore to be the owner of a dummy token
/// that is deposited into the MasterChef V1 (MCV1) contract.
/// The allocation point for this pool on MCV1 is the total allocation point for all pools that receive incentives.
contract MasterChefV2 is Ownable, ReentrancyGuard {
  using SafeMath for uint256;
  using SafeBEP20 for IBEP20;

  /// @notice Info of each MCV2 user.
  /// `amount` LP token amount the user has provided.
  /// `rewardDebt` Used to calculate the correct amount of rewards. See explanation below.
  ///
  /// We do some fancy math here. Basically, any point in time, the amount of CAKEs
  /// entitled to a user but is pending to be distributed is:
  ///
  ///   pending reward = (user share * pool.accCakePerShare) - user.rewardDebt
  ///
  ///   Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
  ///   1. The pool's `accCakePerShare` (and `lastRewardBlock`) gets updated.
  ///   2. User receives the pending reward sent to his/her address.
  ///   3. User's `amount` gets updated. Pool's `totalBoostedShare` gets updated.
  ///   4. User's `rewardDebt` gets updated.
  struct UserInfo {
    uint256 amount;
    uint256 rewardDebt;
    uint256 boostMultiplier;
  }

  /// @notice Info of each MCV2 pool.
  /// `allocPoint` The amount of allocation points assigned to the pool.
  ///     Also known as the amount of "multipliers". Combined with `totalXAllocPoint`, it defines the % of
  ///     CAKE rewards each pool gets.
  /// `accCakePerShare` Accumulated CAKEs per share, times 1e12.
  /// `lastRewardBlock` Last block number that pool update action is executed.
  /// `isRegular` The flag to set pool is regular or special. See below:
  ///     In MasterChef V2 farms are "regular pools". "special pools", which use a different sets of
  ///     `allocPoint` and their own `totalSpecialAllocPoint` are designed to handle the distribution of
  ///     the CAKE rewards to all the PancakeSwap products.
  /// `totalBoostedShare` The total amount of user shares in each pool. After considering the share boosts.
  struct PoolInfo {
    uint256 accCakePerShare;
    uint256 lastRewardBlock;
    uint256 allocPoint;
    uint256 totalBoostedShare;
    bool isRegular;
  }

  /// @notice Address of MCV1 contract.
  IMasterChef public immutable MASTER_CHEF;
  /// @notice Address of CAKE contract.
  IBEP20 public immutable CAKE;

  /// @notice The only address can withdraw all the burn CAKE.
  address public burnAdmin;
  /// @notice The contract handles the share boosts.
  address public boostContract;

  /// @notice Info of each MCV2 pool.
  PoolInfo[] public poolInfo;
  /// @notice Address of the LP token for each MCV2 pool.
  IBEP20[] public lpToken;

  /// @notice Info of each pool user.
  mapping(uint256 => mapping(address => UserInfo)) public userInfo;
  /// @notice The whitelist of addresses allowed to deposit in special pools.
  mapping(address => bool) public whiteList;

  /// @notice The pool id of the MCV2 mock token pool in MCV1.
  uint256 public immutable MASTER_PID;
  /// @notice Total regular allocation points. Must be the sum of all regular pools' allocation points.
  uint256 public totalRegularAllocPoint;
  /// @notice Total special allocation points. Must be the sum of all special pools' allocation points.
  uint256 public totalSpecialAllocPoint;
  ///  @notice 40 cakes per block in MCV1
  uint256 public constant MASTERCHEF_CAKE_PER_BLOCK = 40 * 1e18;
  uint256 public constant ACC_CAKE_PRECISION = 1e18;

  /// @notice Basic boost factor, none boosted user's boost factor
  uint256 public constant BOOST_PRECISION = 100 * 1e10;
  /// @notice Hard limit for maxmium boost factor, it must greater than BOOST_PRECISION
  uint256 public constant MAX_BOOST_PRECISION = 200 * 1e10;
  /// @notice total cake rate = toBurn + toRegular + toSpecial
  uint256 public constant CAKE_RATE_TOTAL_PRECISION = 1e12;
  /// @notice The last block number of CAKE burn action being executed.
  /// @notice CAKE distribute % for burn
  uint256 public cakeRateToBurn = 643750000000;
  /// @notice CAKE distribute % for regular farm pool
  uint256 public cakeRateToRegularFarm = 62847222222;
  /// @notice CAKE distribute % for special pools
  uint256 public cakeRateToSpecialFarm = 293402777778;

  uint256 public lastBurnedBlock;

  event Init();
  event AddPool(uint256 indexed pid, uint256 allocPoint, IBEP20 indexed lpToken, bool isRegular);
  event SetPool(uint256 indexed pid, uint256 allocPoint);
  event UpdatePool(uint256 indexed pid, uint256 lastRewardBlock, uint256 lpSupply, uint256 accCakePerShare);
  event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
  event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
  event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

  event UpdateCakeRate(uint256 burnRate, uint256 regularFarmRate, uint256 specialFarmRate);
  event UpdateBurnAdmin(address indexed oldAdmin, address indexed newAdmin);
  event UpdateWhiteList(address indexed user, bool isValid);
  event UpdateBoostContract(address indexed boostContract);
  event UpdateBoostMultiplier(address indexed user, uint256 pid, uint256 oldMultiplier, uint256 newMultiplier);

  /// @param _MASTER_CHEF The PancakeSwap MCV1 contract address.
  /// @param _CAKE The CAKE token contract address.
  /// @param _MASTER_PID The pool id of the dummy pool on the MCV1.
  /// @param _burnAdmin The address of burn admin.
  constructor(
    IMasterChef _MASTER_CHEF,
    IBEP20 _CAKE,
    uint256 _MASTER_PID,
    address _burnAdmin
  ) public {
    MASTER_CHEF = _MASTER_CHEF;
    CAKE = _CAKE;
    MASTER_PID = _MASTER_PID;
    burnAdmin = _burnAdmin;
  }

  /**
   * @dev Throws if caller is not the boost contract.
   */
  modifier onlyBoostContract() {
    require(boostContract == msg.sender, "Ownable: caller is not the boost contract");
    _;
  }

  /// @notice Deposits a dummy token to `MASTER_CHEF` MCV1. This is required because MCV1 holds the minting permission of CAKE.
  /// It will transfer all the `dummyToken` in the tx sender address.
  /// The allocation point for the dummy pool on MCV1 should be equal to the total amount of allocPoint.
  /// @param dummyToken The address of the BEP-20 token to be deposited into MCV1.
  function init(IBEP20 dummyToken) external onlyOwner {
    uint256 balance = dummyToken.balanceOf(msg.sender);
    require(balance != 0, "MasterChefV2: Balance must exceed 0");
    dummyToken.safeTransferFrom(msg.sender, address(this), balance);
    dummyToken.approve(address(MASTER_CHEF), balance);
    MASTER_CHEF.deposit(MASTER_PID, balance);
    // MCV2 start to earn CAKE reward from current block in MCV1 pool
    lastBurnedBlock = block.number;
    emit Init();
  }

  /// @notice Returns the number of MCV2 pools.
  function poolLength() public view returns (uint256 pools) {
    pools = poolInfo.length;
  }

  /// @notice Add a new pool. Can only be called by the owner.
  /// DO NOT add the same LP token more than once. Rewards will be messed up if you do.
  /// @param _allocPoint Number of allocation points for the new pool.
  /// @param _lpToken Address of the LP BEP-20 token.
  /// @param _isRegular Whether the pool is regular or special. LP farms are always "regular". "Special" pools are
  /// @param _withUpdate Whether call "massUpdatePools" operation.
  /// only for CAKE distributions within PancakeSwap products.
  function add(
    uint256 _allocPoint,
    IBEP20 _lpToken,
    bool _isRegular,
    bool _withUpdate
  ) external onlyOwner {
    require(_lpToken.balanceOf(address(this)) >= 0, "None BEP20 tokens");
    // stake CAKE token will cause staked token and reward token mixed up,
    // may cause staked tokens withdraw as reward token,never do it.
    require(_lpToken != CAKE, "CAKE token can't be added to farm pools");

    if (_withUpdate) {
      massUpdatePools();
    }

    if (_isRegular) {
      totalRegularAllocPoint = totalRegularAllocPoint.add(_allocPoint);
    } else {
      totalSpecialAllocPoint = totalSpecialAllocPoint.add(_allocPoint);
    }
    lpToken.push(_lpToken);

    poolInfo.push(
      PoolInfo({
        allocPoint: _allocPoint,
        lastRewardBlock: block.number,
        accCakePerShare: 0,
        isRegular: _isRegular,
        totalBoostedShare: 0
      })
    );
    emit AddPool(lpToken.length.sub(1), _allocPoint, _lpToken, _isRegular);
  }

  /// @notice Update the given pool's CAKE allocation point. Can only be called by the owner.
  /// @param _pid The id of the pool. See `poolInfo`.
  /// @param _allocPoint New number of allocation points for the pool.
  /// @param _withUpdate Whether call "massUpdatePools" operation.
  function set(
    uint256 _pid,
    uint256 _allocPoint,
    bool _withUpdate
  ) external onlyOwner {
    // No matter _withUpdate is true or false, we need to execute updatePool once before set the pool parameters.
    updatePool(_pid);

    if (_withUpdate) {
      massUpdatePools();
    }

    if (poolInfo[_pid].isRegular) {
      totalRegularAllocPoint = totalRegularAllocPoint.sub(poolInfo[_pid].allocPoint).add(_allocPoint);
    } else {
      totalSpecialAllocPoint = totalSpecialAllocPoint.sub(poolInfo[_pid].allocPoint).add(_allocPoint);
    }
    poolInfo[_pid].allocPoint = _allocPoint;
    emit SetPool(_pid, _allocPoint);
  }

  /// @notice View function for checking pending CAKE rewards.
  /// @param _pid The id of the pool. See `poolInfo`.
  /// @param _user Address of the user.
  function pendingCake(uint256 _pid, address _user) external view returns (uint256) {
    PoolInfo memory pool = poolInfo[_pid];
    UserInfo memory user = userInfo[_pid][_user];
    uint256 accCakePerShare = pool.accCakePerShare;
    uint256 lpSupply = pool.totalBoostedShare;

    if (block.number > pool.lastRewardBlock && lpSupply != 0) {
      uint256 multiplier = block.number.sub(pool.lastRewardBlock);

      uint256 cakeReward = multiplier.mul(cakePerBlock(pool.isRegular)).mul(pool.allocPoint).div(
        (pool.isRegular ? totalRegularAllocPoint : totalSpecialAllocPoint)
      );
      accCakePerShare = accCakePerShare.add(cakeReward.mul(ACC_CAKE_PRECISION).div(lpSupply));
    }

    uint256 boostedAmount = user.amount.mul(getBoostMultiplier(_user, _pid)).div(BOOST_PRECISION);
    return boostedAmount.mul(accCakePerShare).div(ACC_CAKE_PRECISION).sub(user.rewardDebt);
  }

  /// @notice Update cake reward for all the active pools. Be careful of gas spending!
  function massUpdatePools() public {
    uint256 length = poolInfo.length;
    for (uint256 pid = 0; pid < length; ++pid) {
      PoolInfo memory pool = poolInfo[pid];
      if (pool.allocPoint != 0) {
        updatePool(pid);
      }
    }
  }

  /// @notice Calculates and returns the `amount` of CAKE per block.
  /// @param _isRegular If the pool belongs to regular or special.
  function cakePerBlock(bool _isRegular) public view returns (uint256 amount) {
    if (_isRegular) {
      amount = MASTERCHEF_CAKE_PER_BLOCK.mul(cakeRateToRegularFarm).div(CAKE_RATE_TOTAL_PRECISION);
    } else {
      amount = MASTERCHEF_CAKE_PER_BLOCK.mul(cakeRateToSpecialFarm).div(CAKE_RATE_TOTAL_PRECISION);
    }
  }

  /// @notice Calculates and returns the `amount` of CAKE per block to burn.
  function cakePerBlockToBurn() public view returns (uint256 amount) {
    amount = MASTERCHEF_CAKE_PER_BLOCK.mul(cakeRateToBurn).div(CAKE_RATE_TOTAL_PRECISION);
  }

  /// @notice Update reward variables for the given pool.
  /// @param _pid The id of the pool. See `poolInfo`.
  /// @return pool Returns the pool that was updated.
  function updatePool(uint256 _pid) public returns (PoolInfo memory pool) {
    pool = poolInfo[_pid];
    if (block.number > pool.lastRewardBlock) {
      uint256 lpSupply = pool.totalBoostedShare;
      uint256 totalAllocPoint = (pool.isRegular ? totalRegularAllocPoint : totalSpecialAllocPoint);

      if (lpSupply > 0 && totalAllocPoint > 0) {
        uint256 multiplier = block.number.sub(pool.lastRewardBlock);
        uint256 cakeReward = multiplier.mul(cakePerBlock(pool.isRegular)).mul(pool.allocPoint).div(totalAllocPoint);
        pool.accCakePerShare = pool.accCakePerShare.add((cakeReward.mul(ACC_CAKE_PRECISION).div(lpSupply)));
      }
      pool.lastRewardBlock = block.number;
      poolInfo[_pid] = pool;
      emit UpdatePool(_pid, pool.lastRewardBlock, lpSupply, pool.accCakePerShare);
    }
  }

  /// @notice Deposit LP tokens to pool.
  /// @param _pid The id of the pool. See `poolInfo`.
  /// @param _amount Amount of LP tokens to deposit.
  function deposit(uint256 _pid, uint256 _amount) external nonReentrant {
    PoolInfo memory pool = updatePool(_pid);
    UserInfo storage user = userInfo[_pid][msg.sender];

    require(
      pool.isRegular || whiteList[msg.sender],
      "MasterChefV2: The address is not available to deposit in this pool"
    );

    uint256 multiplier = getBoostMultiplier(msg.sender, _pid);

    if (user.amount > 0) {
      settlePendingCake(msg.sender, _pid, multiplier);
    }

    if (_amount > 0) {
      uint256 before = lpToken[_pid].balanceOf(address(this));
      lpToken[_pid].safeTransferFrom(msg.sender, address(this), _amount);
      _amount = lpToken[_pid].balanceOf(address(this)).sub(before);
      user.amount = user.amount.add(_amount);

      // Update total boosted share.
      pool.totalBoostedShare = pool.totalBoostedShare.add(_amount.mul(multiplier).div(BOOST_PRECISION));
    }

    user.rewardDebt = user.amount.mul(multiplier).div(BOOST_PRECISION).mul(pool.accCakePerShare).div(
      ACC_CAKE_PRECISION
    );
    poolInfo[_pid] = pool;

    emit Deposit(msg.sender, _pid, _amount);
  }

  /// @notice Withdraw LP tokens from pool.
  /// @param _pid The id of the pool. See `poolInfo`.
  /// @param _amount Amount of LP tokens to withdraw.
  function withdraw(uint256 _pid, uint256 _amount) external nonReentrant {
    PoolInfo memory pool = updatePool(_pid);
    UserInfo storage user = userInfo[_pid][msg.sender];

    require(user.amount >= _amount, "withdraw: Insufficient");

    uint256 multiplier = getBoostMultiplier(msg.sender, _pid);

    settlePendingCake(msg.sender, _pid, multiplier);

    if (_amount > 0) {
      user.amount = user.amount.sub(_amount);
      lpToken[_pid].safeTransfer(msg.sender, _amount);
    }

    user.rewardDebt = user.amount.mul(multiplier).div(BOOST_PRECISION).mul(pool.accCakePerShare).div(
      ACC_CAKE_PRECISION
    );
    poolInfo[_pid].totalBoostedShare = poolInfo[_pid].totalBoostedShare.sub(
      _amount.mul(multiplier).div(BOOST_PRECISION)
    );

    emit Withdraw(msg.sender, _pid, _amount);
  }

  /// @notice Harvests CAKE from `MASTER_CHEF` MCV1 and pool `MASTER_PID` to MCV2.
  function harvestFromMasterChef() public {
    MASTER_CHEF.deposit(MASTER_PID, 0);
  }

  /// @notice Withdraw without caring about the rewards. EMERGENCY ONLY.
  /// @param _pid The id of the pool. See `poolInfo`.
  function emergencyWithdraw(uint256 _pid) external nonReentrant {
    PoolInfo storage pool = poolInfo[_pid];
    UserInfo storage user = userInfo[_pid][msg.sender];

    uint256 amount = user.amount;
    user.amount = 0;
    user.rewardDebt = 0;
    uint256 boostedAmount = amount.mul(getBoostMultiplier(msg.sender, _pid)).div(BOOST_PRECISION);
    pool.totalBoostedShare = pool.totalBoostedShare > boostedAmount ? pool.totalBoostedShare.sub(boostedAmount) : 0;

    // Note: transfer can fail or succeed if `amount` is zero.
    lpToken[_pid].safeTransfer(msg.sender, amount);
    emit EmergencyWithdraw(msg.sender, _pid, amount);
  }

  /// @notice Send CAKE pending for burn to `burnAdmin`.
  /// @param _withUpdate Whether call "massUpdatePools" operation.
  function burnCake(bool _withUpdate) public onlyOwner {
    if (_withUpdate) {
      massUpdatePools();
    }

    uint256 multiplier = block.number.sub(lastBurnedBlock);
    uint256 pendingCakeToBurn = multiplier.mul(cakePerBlockToBurn());

    // SafeTransfer CAKE
    _safeTransfer(burnAdmin, pendingCakeToBurn);
    lastBurnedBlock = block.number;
  }

  /// @notice Update the % of CAKE distributions for burn, regular pools and special pools.
  /// @param _burnRate The % of CAKE to burn each block.
  /// @param _regularFarmRate The % of CAKE to regular pools each block.
  /// @param _specialFarmRate The % of CAKE to special pools each block.
  /// @param _withUpdate Whether call "massUpdatePools" operation.
  function updateCakeRate(
    uint256 _burnRate,
    uint256 _regularFarmRate,
    uint256 _specialFarmRate,
    bool _withUpdate
  ) external onlyOwner {
    require(
      _burnRate > 0 && _regularFarmRate > 0 && _specialFarmRate > 0,
      "MasterChefV2: Cake rate must be greater than 0"
    );
    require(
      _burnRate.add(_regularFarmRate).add(_specialFarmRate) == CAKE_RATE_TOTAL_PRECISION,
      "MasterChefV2: Total rate must be 1e12"
    );
    if (_withUpdate) {
      massUpdatePools();
    }
    // burn cake base on old burn cake rate
    burnCake(false);

    cakeRateToBurn = _burnRate;
    cakeRateToRegularFarm = _regularFarmRate;
    cakeRateToSpecialFarm = _specialFarmRate;

    emit UpdateCakeRate(_burnRate, _regularFarmRate, _specialFarmRate);
  }

  /// @notice Update burn admin address.
  /// @param _newAdmin The new burn admin address.
  function updateBurnAdmin(address _newAdmin) external onlyOwner {
    require(_newAdmin != address(0), "MasterChefV2: Burn admin address must be valid");
    require(_newAdmin != burnAdmin, "MasterChefV2: Burn admin address is the same with current address");
    address _oldAdmin = burnAdmin;
    burnAdmin = _newAdmin;
    emit UpdateBurnAdmin(_oldAdmin, _newAdmin);
  }

  /// @notice Update whitelisted addresses for special pools.
  /// @param _user The address to be updated.
  /// @param _isValid The flag for valid or invalid.
  function updateWhiteList(address _user, bool _isValid) external onlyOwner {
    require(_user != address(0), "MasterChefV2: The white list address must be valid");

    whiteList[_user] = _isValid;
    emit UpdateWhiteList(_user, _isValid);
  }

  /// @notice Update boost contract address and max boost factor.
  /// @param _newBoostContract The new address for handling all the share boosts.
  function updateBoostContract(address _newBoostContract) external onlyOwner {
    require(
      _newBoostContract != address(0) && _newBoostContract != boostContract,
      "MasterChefV2: New boost contract address must be valid"
    );

    boostContract = _newBoostContract;
    emit UpdateBoostContract(_newBoostContract);
  }

  /// @notice Update user boost factor.
  /// @param _user The user address for boost factor updates.
  /// @param _pid The pool id for the boost factor updates.
  /// @param _newMultiplier New boost multiplier.
  function updateBoostMultiplier(
    address _user,
    uint256 _pid,
    uint256 _newMultiplier
  ) external onlyBoostContract nonReentrant {
    require(_user != address(0), "MasterChefV2: The user address must be valid");
    require(poolInfo[_pid].isRegular, "MasterChefV2: Only regular farm could be boosted");
    require(
      _newMultiplier >= BOOST_PRECISION && _newMultiplier <= MAX_BOOST_PRECISION,
      "MasterChefV2: Invalid new boost multiplier"
    );

    PoolInfo memory pool = updatePool(_pid);
    UserInfo storage user = userInfo[_pid][_user];

    uint256 prevMultiplier = getBoostMultiplier(_user, _pid);
    settlePendingCake(_user, _pid, prevMultiplier);

    user.rewardDebt = user.amount.mul(_newMultiplier).div(BOOST_PRECISION).mul(pool.accCakePerShare).div(
      ACC_CAKE_PRECISION
    );
    pool.totalBoostedShare = pool.totalBoostedShare.sub(user.amount.mul(prevMultiplier).div(BOOST_PRECISION)).add(
      user.amount.mul(_newMultiplier).div(BOOST_PRECISION)
    );
    poolInfo[_pid] = pool;
    userInfo[_pid][_user].boostMultiplier = _newMultiplier;

    emit UpdateBoostMultiplier(_user, _pid, prevMultiplier, _newMultiplier);
  }

  /// @notice Get user boost multiplier for specific pool id.
  /// @param _user The user address.
  /// @param _pid The pool id.
  function getBoostMultiplier(address _user, uint256 _pid) public view returns (uint256) {
    uint256 multiplier = userInfo[_pid][_user].boostMultiplier;
    return multiplier > BOOST_PRECISION ? multiplier : BOOST_PRECISION;
  }

  /// @notice Settles, distribute the pending CAKE rewards for given user.
  /// @param _user The user address for settling rewards.
  /// @param _pid The pool id.
  /// @param _boostMultiplier The user boost multiplier in specific pool id.
  function settlePendingCake(
    address _user,
    uint256 _pid,
    uint256 _boostMultiplier
  ) internal {
    UserInfo memory user = userInfo[_pid][_user];

    uint256 boostedAmount = user.amount.mul(_boostMultiplier).div(BOOST_PRECISION);
    uint256 accCake = boostedAmount.mul(poolInfo[_pid].accCakePerShare).div(ACC_CAKE_PRECISION);
    uint256 pending = accCake.sub(user.rewardDebt);
    // SafeTransfer CAKE
    _safeTransfer(_user, pending);
  }

  /// @notice Safe Transfer CAKE.
  /// @param _to The CAKE receiver address.
  /// @param _amount transfer CAKE amounts.
  function _safeTransfer(address _to, uint256 _amount) internal {
    if (_amount > 0) {
      // Check whether MCV2 has enough CAKE. If not, harvest from MCV1.
      if (CAKE.balanceOf(address(this)) < _amount) {
        harvestFromMasterChef();
      }
      uint256 balance = CAKE.balanceOf(address(this));
      if (balance < _amount) {
        _amount = balance;
      }
      CAKE.safeTransfer(_to, _amount);
    }
  }
}
