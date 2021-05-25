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
import "../interfaces/IVault.sol";


contract CakeMaxiWorker is OwnableUpgradeSafe, ReentrancyGuardUpgradeSafe, IWorker {
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
  address public override baseToken;
  address public override farmingToken;
  address public operator;
  uint256 public pid;
  IVault public beneficialVault;

  /// @notice Mutable state variables
  mapping(uint256 => uint256) public shares;
  mapping(address => bool) public okStrats;
  uint256 public totalShare;
  IStrategy public addStrat;
  IStrategy public liqStrat;
  uint256 public beneficialVaultBountyBps;
  uint256 public reinvestBountyBps;
  uint256 public maxReinvestBountyBps;
  uint256 public rewardBalance;
  mapping(address => bool) public okReinvestors;

  /// @notice Configuration varaibles for V2
  uint256 public fee;
  uint256 public feeDenom;

  function initialize(
    address _operator,
    address _baseToken,
    IPancakeMasterChef _masterChef,
    IPancakeRouter02 _router,
    IVault _beneficialVault,
    uint256 _pid,
    IStrategy _addStrat,
    IStrategy _liqStrat,
    uint256 _reinvestBountyBps,
    uint256 _beneficialVaultBountyBps
  ) external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
    operator = _operator;
    baseToken = _baseToken;
    wNative = _router.WETH();
    masterChef = _masterChef;
    beneficialVault = _beneficialVault;
    router = _router;
    factory = IPancakeFactory(_router.factory());
    pid = _pid;
    (IERC20 _farmingToken, , , ) = masterChef.poolInfo(_pid);
    farmingToken = address(_farmingToken);
    addStrat = _addStrat;
    liqStrat = _liqStrat;
    okStrats[address(addStrat)] = true;
    okStrats[address(liqStrat)] = true;
    reinvestBountyBps = _reinvestBountyBps;
    beneficialVaultBountyBps = _beneficialVaultBountyBps;
    maxReinvestBountyBps = 2000;
    fee = 9975;
    feeDenom = 10000;

    require(reinvestBountyBps <= maxReinvestBountyBps, "CakeMaxiWorker::initialize:: reinvestBountyBps exceeded maxReinvestBountyBps");
  }

  /// @dev Require that the caller must be an EOA account to avoid flash loans.
  modifier onlyEOA() {
    require(msg.sender == tx.origin, "CakeMaxiWorker::onlyEOA:: not eoa");
    _;
  }

  /// @dev Require that the caller must be the operator.
  modifier onlyOperator() {
    require(msg.sender == operator, "CakeMaxiWorker::onlyOperator:: not operator");
    _;
  }

  //// @dev Require that the caller must be ok reinvestor.
  modifier onlyReinvestor() {
    require(okReinvestors[msg.sender], "CakeMaxiWorker::onlyReinvestor:: not reinvestor");
    _;
  }

  /// @dev Return the entitied farming token for the given shares.
  /// @param share The number of shares to be converted to farming tokens.
  function shareToBalance(uint256 share) public view returns (uint256) {
    if (totalShare == 0) return share; // When there's no share, 1 share = 1 balance.
    (uint256 totalBalance, ) = masterChef.userInfo(pid, address(this));
    return share.mul(totalBalance).div(totalShare);
  }

  /// @dev Return the number of shares to receive if staking the farming token.
  /// @param balance the balance of farming token to be converted to shares.
  function balanceToShare(uint256 balance) public view returns (uint256) {
    if (totalShare == 0) return balance; // When there's no share, 1 share = 1 balance.
    (uint256 totalBalance, ) = masterChef.userInfo(pid, address(this));
    return balance.mul(totalShare).div(totalBalance);
  }

  /// @dev Re-invest whatever this worker has earned to the staking pool.
  function reinvest() external override onlyEOA onlyReinvestor nonReentrant {
    // 1. Approve tokens
    farmingToken.safeApprove(address(masterChef), uint256(-1));
    // 2. reset all reward balance since all rewards will be reinvested
    rewardBalance = 0;
    // 3. Withdraw all the rewards.
    masterChef.leaveStaking(0);
    uint256 reward = farmingToken.myBalance();
    if (reward == 0) return;
    // 4. Send the reward bounty to the caller.
    uint256 bounty = reward.mul(reinvestBountyBps) / 10000;
    if (bounty > 0) {
      uint256 beneficialVaultBounty = bounty.mul(beneficialVaultBountyBps) / 10000;
      if (beneficialVaultBounty > 0) _rewardToBeneficialVault(beneficialVaultBounty, farmingToken);
      farmingToken.safeTransfer(msg.sender, bounty.sub(beneficialVaultBounty));
    }
    // 5. re stake the farming token to get more rewards
    masterChef.enterStaking(reward.sub(bounty));
    // 6. Reset approval
    farmingToken.safeApprove(address(masterChef), 0);
    emit Reinvest(msg.sender, reward, bounty);
  }

  // @notice some portion of a bounty from reinvest will be sent to beneficialVault to increase the size of totalToken
  function _rewardToBeneficialVault(uint256 _beneficialVaultBounty, address _rewardToken) internal {
    _rewardToken.safeApprove(address(router), uint256(-1));
    address beneficialVaultToken = beneficialVault.token();
    address[] memory path = _getPath(_rewardToken, beneficialVaultToken);
    router.swapExactTokensForTokens(_beneficialVaultBounty, 0, path, address(this), now);
    beneficialVaultToken.safeTransfer(address(beneficialVault), beneficialVaultToken.myBalance());
    _rewardToken.safeApprove(address(router), 0);
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
    // 1. Remove shares on this position back to farming tokens
    _removeShare(id);
    // 2. Perform the worker strategy; sending a basetoken amount to the strategy.
    (address strat, bytes memory ext) = abi.decode(data, (address, bytes));
    require(okStrats[strat], "CakeMaxiWorker::work:: unapproved work strategy");
    baseToken.safeTransfer(strat, baseToken.myBalance());
    farmingToken.safeTransfer(strat, actualFarmingTokenBalance());
    IStrategy(strat).execute(user, debt, ext);
    // 3. Add farming token back to the farming pool. Thus, increasing an LP size of the current position's shares
    _addShare(id);
    // 5. Return any remaining BaseToken back to the operator.
    baseToken.safeTransfer(msg.sender, baseToken.myBalance());
  }

  /// @dev Return maximum output given the input amount and the status of Pancakeswap reserves.
  /// @param aIn The amount of asset to market sell.
  /// @param rIn the amount of asset in reserve for input.
  /// @param rOut The amount of asset in reserve for output.
  function getMktSellAmount(uint256 aIn, uint256 rIn, uint256 rOut) public view returns (uint256) {
    if (aIn == 0) return 0;
    require(rIn > 0 && rOut > 0, "CakeMaxiWorker::getMktSellAmount:: bad reserve values");
    uint256 aInWithFee = aIn.mul(fee);
    uint256 numerator = aInWithFee.mul(rOut);
    uint256 denominator = rIn.mul(feeDenom).add(aInWithFee);
    return numerator / denominator;
  }

  /// @dev Return the amount of BaseToken to receive if we are to liquidate the given position.
  /// @param id The position ID to perform health check.
  function health(uint256 id) external override view returns (uint256) {
    address[] memory path = _getPath(farmingToken, baseToken);
    IPancakePair currentLP;
    uint256[] memory amount;
    amount = new uint256[](path.length);
    amount[0] = shareToBalance(shares[id]);
    for(uint256 i = 1; i < path.length; i++) {
        // 1. Get the current LP based on the specified paths.
        currentLP = IPancakePair(factory.getPair(path[i-1], path[i]));
        // 2. Get the pool's total supply of the token of path i-1 and the token of path i.
        (uint256 r0, uint256 r1,) = currentLP.getReserves();
        (uint256 rOut, uint256 rIn) = currentLP.token0() == path[i] ? (r0, r1) : (r1, r0);
        // 3. Convert all amount on the token of path i-1 to the token of path i.
        amount[i] = getMktSellAmount(
            amount[i-1], rIn, rOut
        );
    }
    // @notice return the last amount, since the last amount is the amount that we shall get in baseToken if we sell the farmingToken at the market price
    return amount[amount.length - 1];
  }

  /// @dev Liquidate the given position by converting it to BaseToken and return back to caller.
  /// @param id The position ID to perform liquidation
  function liquidate(uint256 id) external override onlyOperator nonReentrant {
    // 1. Remove shares on this position back to farming tokens
    _removeShare(id);
    farmingToken.safeTransfer(address(liqStrat), actualFarmingTokenBalance());
    liqStrat.execute(address(0), 0, abi.encode(0));
    // 2. Return all available base token back to the operator.
    uint256 wad = baseToken.myBalance();
    baseToken.safeTransfer(msg.sender, wad);
    emit Liquidate(id, wad);
  }

  // @notice since reward gaining from the masterchef is the same token with farmingToken,
  // thus the rewardBalance exists to differentiate an actual farming token balance without taking reward balance into account
  function actualFarmingTokenBalance() internal view returns (uint256) {
    return farmingToken.myBalance().sub(rewardBalance);
  }

  /// @dev Internal function to stake all outstanding LP tokens to the given position ID.
  function _addShare(uint256 id) internal  {
    uint256 shareBalance = actualFarmingTokenBalance();
    if (shareBalance > 0) {
      // 1. Approve token to be spend by masterChef
      address(farmingToken).safeApprove(address(masterChef), uint256(-1));
      // 2. Convert balance to share
      uint256 share = balanceToShare(shareBalance);
      // 3. Update shares
      shares[id] = shares[id].add(share);
      totalShare = totalShare.add(share);
      rewardBalance = rewardBalance.add(masterChef.pendingCake(pid, address(this)));
      // 4. Deposit balance to PancakeMasterChef
      masterChef.enterStaking(shareBalance);
      // 5. Reset approve token
      address(farmingToken).safeApprove(address(masterChef), 0);
      emit AddShare(id, share);
    }
  }

  /// @dev Internal function to remove shares of the ID and convert to outstanding LP tokens.
  // @notice since when removing shares, rewards token can be the same as farming token,
  // so it needs to return the current reward balance to be excluded fro the farming token balance
  function _removeShare(uint256 id) internal {
    uint256 share = shares[id];
    if (share > 0) {
      uint256 balance = shareToBalance(share);
      totalShare = totalShare.sub(share);
      shares[id] = 0;
      rewardBalance = rewardBalance.add(masterChef.pendingCake(pid, address(this)));
      masterChef.leaveStaking(balance);

      emit RemoveShare(id, share);
    }
  }

  // @notice get path from tokenIn to tokenOut
  function _getPath(address tokenIn, address tokenOut) internal view returns (address[] memory) {
    address[] memory path;
    if (tokenOut == wNative) {
      path = new address[](2);
      path[0] = tokenIn;
      path[1] = wNative;
    } else if (tokenIn == wNative) {
      path = new address[](2);
      path[0] = wNative;
      path[1] = tokenOut;
    } else {
      path = new address[](3);
      path[0] = tokenIn;
      path[1] = wNative;
      path[2] = tokenOut;
    }
    return path;
  }

  /// @dev Set the reward bounty for calling reinvest operations.
  /// @param _reinvestBountyBps The bounty value to update.
  function setReinvestBountyBps(uint256 _reinvestBountyBps) external onlyOwner {
    require(_reinvestBountyBps <= maxReinvestBountyBps, "CakeMaxiWorker::setReinvestBountyBps:: _reinvestBountyBps exceeded maxReinvestBountyBps");
    reinvestBountyBps = _reinvestBountyBps;
  }

  // @notice Set the reward bounty from reinvest operations sending to a beneficial vault.
  // this bps will be deducted from reinvest bounty bps
  /// @param _beneficialVaultBountyBps The bounty value to update.
  function setBeneficialVaultBountyBps(uint256 _beneficialVaultBountyBps) external onlyOwner {
    require(_beneficialVaultBountyBps <= 10000,  "CakeMaxiWorker::setBeneficialVaultBountyBps:: _beneficialVaultBountyBps exceeds 100%");
    beneficialVaultBountyBps = _beneficialVaultBountyBps;
  }

  /// @dev Set Max reinvest reward for set upper limit reinvest bounty.
  /// @param _maxReinvestBountyBps The max reinvest bounty value to update.
  function setMaxReinvestBountyBps(uint256 _maxReinvestBountyBps) external onlyOwner {
    require(_maxReinvestBountyBps >= reinvestBountyBps, "CakeMaxiWorker::setMaxReinvestBountyBps:: _maxReinvestBountyBps lower than reinvestBountyBps");
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

}