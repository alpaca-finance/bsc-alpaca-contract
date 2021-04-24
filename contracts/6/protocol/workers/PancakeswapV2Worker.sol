pragma solidity 0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakeFactory.sol";
import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakePair.sol";

import "../apis/pancake/IPancakeRouter02.sol";
import "../interfaces/IStrategy.sol";
import "../interfaces/IWorker.sol";
import "../interfaces/IPancakeMasterChef.sol";
import "../../utils/AlpacaMath.sol";
import "../../utils/SafeToken.sol";

contract PancakeswapV2Worker is OwnableUpgradeSafe, ReentrancyGuardUpgradeSafe, IWorker {
  /// @notice Libraries
  using SafeToken for address;
  using SafeMath for uint256;

  /// @notice Events
  event Reinvest(address indexed caller, uint256 reward, uint256 bounty);
  event AddShare(uint256 indexed id, uint256 share);
  event RemoveShare(uint256 indexed id, uint256 share);
  event Liquidate(uint256 indexed id, uint256 wad);

  /// @notice Configuration variables
  IPancakeMasterChef public masterChef;
  IPancakeFactory public factory;
  IPancakeRouter02 public router;
  IPancakePair public override lpToken;
  address public wNative;
  address public baseToken;
  address public farmingToken;
  address public cake;
  address public operator;
  uint256 public pid;

  /// @notice Mutable state variables
  mapping(uint256 => uint256) public shares;
  mapping(address => bool) public okStrats;
  uint256 public totalShare;
  IStrategy public addStrat;
  IStrategy public liqStrat;
  uint256 public reinvestBountyBps;
  uint256 public maxReinvestBountyBps;
  mapping(address => bool) public okReinvestors;

  /// @notice Configuration varaibles for V2
  uint256 public fee;
  uint256 public feeDenom;

  function initialize(
    address _operator,
    address _baseToken,
    IPancakeMasterChef _masterChef,
    IPancakeRouter02 _router,
    uint256 _pid,
    IStrategy _addStrat,
    IStrategy _liqStrat,
    uint256 _reinvestBountyBps
  ) external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();

    operator = _operator;
    baseToken = _baseToken;
    wNative = _router.WETH();
    masterChef = _masterChef;
    router = _router;
    factory = IPancakeFactory(_router.factory());
    // Get lpToken and farmingToken from MasterChef pool
    pid = _pid;
    (IERC20 _lpToken, , , ) = masterChef.poolInfo(_pid);
    lpToken = IPancakePair(address(_lpToken));
    address token0 = lpToken.token0();
    address token1 = lpToken.token1();
    farmingToken = token0 == baseToken ? token1 : token0;
    cake = address(masterChef.cake());
    addStrat = _addStrat;
    liqStrat = _liqStrat;
    okStrats[address(addStrat)] = true;
    okStrats[address(liqStrat)] = true;
    reinvestBountyBps = _reinvestBountyBps;
    maxReinvestBountyBps = 500;

    require(reinvestBountyBps <= maxReinvestBountyBps, "PancakeswapWorker::initialize:: reinvestBountyBps exceeded maxReinvestBountyBps");
  }

  /// @dev Require that the caller must be an EOA account to avoid flash loans.
  modifier onlyEOA() {
    require(msg.sender == tx.origin, "PancakeswapWorker::onlyEOA:: not eoa");
    _;
  }

  /// @dev Require that the caller must be the operator.
  modifier onlyOperator() {
    require(msg.sender == operator, "PancakeswapWorker::onlyOperator:: not operator");
    _;
  }

  //// @dev Require that the caller must be ok reinvestor.
  modifier onlyReinvestor() {
    require(okReinvestors[msg.sender], "PancakeswapWorker::onlyReinvestor:: not reinvestor");
    _;
  }

  /// @dev Return the entitied LP token balance for the given shares.
  /// @param share The number of shares to be converted to LP balance.
  function shareToBalance(uint256 share) public view returns (uint256) {
    if (totalShare == 0) return share; // When there's no share, 1 share = 1 balance.
    (uint256 totalBalance, ) = masterChef.userInfo(pid, address(this));
    return share.mul(totalBalance).div(totalShare);
  }

  /// @dev Return the number of shares to receive if staking the given LP tokens.
  /// @param balance the number of LP tokens to be converted to shares.
  function balanceToShare(uint256 balance) public view returns (uint256) {
    if (totalShare == 0) return balance; // When there's no share, 1 share = 1 balance.
    (uint256 totalBalance, ) = masterChef.userInfo(pid, address(this));
    return balance.mul(totalShare).div(totalBalance);
  }

  /// @dev Re-invest whatever this worker has earned back to staked LP tokens.
  function reinvest() external override onlyEOA onlyReinvestor nonReentrant {
    // 1. Approve tokens
    cake.safeApprove(address(router), uint256(-1));
    address(lpToken).safeApprove(address(masterChef), uint256(-1));
    // 2. Withdraw all the rewards.
    masterChef.withdraw(pid, 0);
    uint256 reward = cake.balanceOf(address(this));
    if (reward == 0) return;
    // 3. Send the reward bounty to the caller.
    uint256 bounty = reward.mul(reinvestBountyBps) / 10000;
    if (bounty > 0) cake.safeTransfer(msg.sender, bounty);
    // 4. Convert all the remaining rewards to BaseToken via Native for liquidity.
    address[] memory path;
    if (baseToken == wNative) {
      path = new address[](2);
      path[0] = address(cake);
      path[1] = address(wNative);
    } else {
      path = new address[](3);
      path[0] = address(cake);
      path[1] = address(wNative);
      path[2] = address(baseToken);
    }
    router.swapExactTokensForTokens(reward.sub(bounty), 0, path, address(this), now);
    // 5. Use add Token strategy to convert all BaseToken to LP tokens.
    baseToken.safeTransfer(address(addStrat), baseToken.myBalance());
    addStrat.execute(address(0), 0, abi.encode(baseToken, farmingToken, 0));
    // 6. Mint more LP tokens and stake them for more rewards.
    masterChef.deposit(pid, lpToken.balanceOf(address(this)));
    // 7. Reset approve
    cake.safeApprove(address(router), 0);
    address(lpToken).safeApprove(address(masterChef), 0);
    emit Reinvest(msg.sender, reward, bounty);
  }

  /// @dev Work on the given position. Must be called by the operator.
  /// @param id The position ID to work on.
  /// @param user The original user that is interacting with the operator.
  /// @param debt The amount of user debt to help the strategy make decisions.
  /// @param data The encoded data, consisting of strategy address and calldata.
  function work(uint256 id, address user, uint256 debt, bytes calldata data)
    override
    external
    onlyOperator nonReentrant
  {
    // 1. Convert this position back to LP tokens.
    _removeShare(id);
    // 2. Perform the worker strategy; sending LP tokens + BaseToken; expecting LP tokens + BaseToken.
    (address strat, bytes memory ext) = abi.decode(data, (address, bytes));
    require(okStrats[strat], "PancakeswapWorker::work:: unapproved work strategy");
    require(lpToken.transfer(strat, lpToken.balanceOf(address(this))), "PancakeswapWorker::work:: unable to transfer lp to strat");
    baseToken.safeTransfer(strat, baseToken.myBalance());
    IStrategy(strat).execute(user, debt, ext);
    // 3. Add LP tokens back to the farming pool.
    _addShare(id);
    // 4. Return any remaining BaseToken back to the operator.
    baseToken.safeTransfer(msg.sender, baseToken.myBalance());
  }

  /// @dev Return maximum output given the input amount and the status of Uniswap reserves.
  /// @param aIn The amount of asset to market sell.
  /// @param rIn the amount of asset in reserve for input.
  /// @param rOut The amount of asset in reserve for output.
  function getMktSellAmount(uint256 aIn, uint256 rIn, uint256 rOut) public view returns (uint256) {
    if (aIn == 0) return 0;
    require(rIn > 0 && rOut > 0, "PancakeswapWorker::getMktSellAmount:: bad reserve values");
    /// if fee is not set, 
    /// revert to V1 fee first as this can implied that migrationLp hasn't bee executed
    uint256 _fee = fee;
    uint256 _feeDenom = feeDenom;
    if (_fee == 0) _fee = 9975;
    if (_feeDenom == 0) _feeDenom = 10000;
    uint256 aInWithFee = aIn.mul(_fee);
    uint256 numerator = aInWithFee.mul(rOut);
    uint256 denominator = rIn.mul(_feeDenom).add(aInWithFee);
    return numerator / denominator;
  }

  /// @dev Return the amount of BaseToken to receive if we are to liquidate the given position.
  /// @param id The position ID to perform health check.
  function health(uint256 id) external override view returns (uint256) {
    // 1. Get the position's LP balance and LP total supply.
    uint256 lpBalance = shareToBalance(shares[id]);
    uint256 lpSupply = lpToken.totalSupply(); // Ignore pending mintFee as it is insignificant
    // 2. Get the pool's total supply of BaseToken and FarmingToken.
    (uint256 r0, uint256 r1,) = lpToken.getReserves();
    (uint256 totalBaseToken, uint256 totalFarmingToken) = lpToken.token0() == baseToken ? (r0, r1) : (r1, r0);
    // 3. Convert the position's LP tokens to the underlying assets.
    uint256 userBaseToken = lpBalance.mul(totalBaseToken).div(lpSupply);
    uint256 userFarmingToken = lpBalance.mul(totalFarmingToken).div(lpSupply);
    // 4. Convert all FarmingToken to BaseToken and return total BaseToken.
    return getMktSellAmount(
      userFarmingToken, totalFarmingToken.sub(userFarmingToken), totalBaseToken.sub(userBaseToken)
    ).add(userBaseToken);
  }

  /// @dev Liquidate the given position by converting it to BaseToken and return back to caller.
  /// @param id The position ID to perform liquidation
  function liquidate(uint256 id) external override onlyOperator nonReentrant {
    // 1. Convert the position back to LP tokens and use liquidate strategy.
    _removeShare(id);
    lpToken.transfer(address(liqStrat), lpToken.balanceOf(address(this)));
    liqStrat.execute(address(0), 0, abi.encode(baseToken, farmingToken, 0));
    // 2. Return all available BaseToken back to the operator.
    uint256 wad = baseToken.myBalance();
    baseToken.safeTransfer(msg.sender, wad);
    emit Liquidate(id, wad);
  }

  /// @dev Internal function to stake all outstanding LP tokens to the given position ID.
  function _addShare(uint256 id) internal {
    uint256 balance = lpToken.balanceOf(address(this));
    if (balance > 0) {
      // 1. Approve token to be spend by masterChef
      address(lpToken).safeApprove(address(masterChef), uint256(-1));
      // 2. Convert balance to share
      uint256 share = balanceToShare(balance);
      // 3. Deposit balance to PancakeMasterChef
      masterChef.deposit(pid, balance);
      // 4. Update shares
      shares[id] = shares[id].add(share);
      totalShare = totalShare.add(share);
      // 5. Reset approve token
      address(lpToken).safeApprove(address(masterChef), 0);
      emit AddShare(id, share);
    }
  }

  /// @dev Internal function to remove shares of the ID and convert to outstanding LP tokens.
  function _removeShare(uint256 id) internal {
    uint256 share = shares[id];
    if (share > 0) {
      uint256 balance = shareToBalance(share);
      masterChef.withdraw(pid, balance);
      totalShare = totalShare.sub(share);
      shares[id] = 0;
      emit RemoveShare(id, share);
    }
  }

  /// @dev Set the reward bounty for calling reinvest operations.
  /// @param _reinvestBountyBps The bounty value to update.
  function setReinvestBountyBps(uint256 _reinvestBountyBps) external onlyOwner {
    require(_reinvestBountyBps <= maxReinvestBountyBps, "PancakeswapWorker::setReinvestBountyBps:: _reinvestBountyBps exceeded maxReinvestBountyBps");
    reinvestBountyBps = _reinvestBountyBps;
  }

  /// @dev Set Max reinvest reward for set upper limit reinvest bounty.
  /// @param _maxReinvestBountyBps The max reinvest bounty value to update.
  function setMaxReinvestBountyBps(uint256 _maxReinvestBountyBps) external onlyOwner {
    require(_maxReinvestBountyBps >= reinvestBountyBps, "PancakeswapWorker::setMaxReinvestBountyBps:: _maxReinvestBountyBps lower than reinvestBountyBps");
    maxReinvestBountyBps = _maxReinvestBountyBps;
  }

  /// @dev Set the given strategies' approval status.
  /// @param strats The strategy addresses.
  /// @param isOk Whether to approve or unapprove the given strategies.
  function setStrategyOk(address[] calldata strats, bool isOk) external override onlyOwner {
    uint256 len = strats.length;
    for (uint256 idx = 0; idx < len; idx++) {
      okStrats[strats[idx]] = isOk;
    }
  }

  /// @dev Set the given address's to be reinvestor.
  /// @param reinvestors The reinvest bot addresses.
  /// @param isOk Whether to approve or unapprove the given strategies.
  function setReinvestorOk(address[] calldata reinvestors, bool isOk) external override onlyOwner {
    uint256 len = reinvestors.length;
    for (uint256 idx = 0; idx < len; idx++) {
      okReinvestors[reinvestors[idx]] = isOk;
    }
  }

  /// @dev Update critical strategy smart contracts. EMERGENCY ONLY. Bad strategies can steal funds.
  /// @param _addStrat The new add strategy contract.
  /// @param _liqStrat The new liquidate strategy contract.
  function setCriticalStrategies(IStrategy _addStrat, IStrategy _liqStrat) external onlyOwner {
    addStrat = _addStrat;
    liqStrat = _liqStrat;
  }

  /// @dev Migrate LP token from V1 to V2. FOR PCS MIGRATION ONLY.
  /// @param _routerV2 The new router 
  /// @param _newPId The new pool id
  /// @param _twoSideOptimalMigrateStrat The migration strategy
  /// @param _newAddStrat The new add strategy for PCSv2
  /// @param _newLiqStrat The new liq strategy for PCSv2
  /// @param _newOkStrats The new strategies for PCSv2
  /// @param _disableStrats The strategies to be disabled
  function migrateLP(
    IPancakeRouter02 _routerV2,
    uint256 _newPId,
    IStrategy _twoSideOptimalMigrateStrat,
    IStrategy _newAddStrat,
    IStrategy _newLiqStrat,
    address[] calldata _newOkStrats,
    address[] calldata _disableStrats
  ) external onlyOwner {
    /// 1. Approval contracts to deduct money from this worker
    address(lpToken).safeApprove(address(router), uint256(-1));

    /// 2. Remove LPv1 from masterChef
    masterChef.withdraw(pid, shareToBalance(totalShare));
    router.removeLiquidity(baseToken, farmingToken, lpToken.balanceOf(address(this)), 0, 0, address(this), block.timestamp);

    /// 3. Reset approval
    address(lpToken).safeApprove(address(router), 0);

    /// 4. Use twoSideOptimal for adding LP to a new router
    baseToken.safeTransfer(address(_twoSideOptimalMigrateStrat), baseToken.myBalance());
    farmingToken.safeTransfer(address(_twoSideOptimalMigrateStrat), farmingToken.myBalance());
    _twoSideOptimalMigrateStrat.execute(address(this), 0, abi.encode(baseToken, farmingToken));

    /// 5. Deposit LPv2 to the new pool
    (IERC20 _lpV2, , , ) = masterChef.poolInfo(_newPId);
    address(_lpV2).safeApprove(address(masterChef), uint256(-1));
    masterChef.deposit(_newPId, address(_lpV2).myBalance());
    address(_lpV2).safeApprove(address(masterChef), uint256(0));

    /// 6. Re-assign all main variables
    router = _routerV2;
    factory = IPancakeFactory(_routerV2.factory());
    pid = _newPId;
    lpToken = IPancakePair(address(_lpV2));
    fee = 9975;
    feeDenom = 10000;

    /// 6.1. Disabled PCSv1 strats
    okStrats[address(addStrat)] = false;
    okStrats[address(liqStrat)] = false;
    uint256 len = _disableStrats.length;
    for (uint256 idx = 0; idx < len; idx++) {
      okStrats[_disableStrats[idx]] = false;
    }

    /// 6.2. Re-assign new strats
    addStrat = _newAddStrat;
    liqStrat = _newLiqStrat;
    okStrats[address(_newAddStrat)] = true;
    okStrats[address(_newLiqStrat)] = true;
    len = _newOkStrats.length;
    for (uint256 idx = 0; idx < len; idx++) {
      okStrats[_newOkStrats[idx]] = true;
    }

    require(
      (farmingToken == lpToken.token0() || farmingToken == lpToken.token1()) && 
      (baseToken == lpToken.token0() || baseToken == lpToken.token1()), "PancakeswapWorker::migrateLP:: lpV2 is mis-configed");
  }
}