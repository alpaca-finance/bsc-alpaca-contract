// SPDX-License-Identifier: BUSL-1.1
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

pragma solidity 0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

import "../../interfaces/IPancakeFactory.sol";
import "../../interfaces/IPancakePair.sol";

import "../../apis/pancake/IPancakeRouter02.sol";
import "../../interfaces/IStrategy.sol";
import "../../interfaces/IWorker02.sol";
import "../../interfaces/IPancakeMasterChef.sol";
import "../../../utils/AlpacaMath.sol";
import "../../../utils/SafeToken.sol";
import "../../interfaces/IVault.sol";
import "../../interfaces/ICakePool.sol";

/// @title CakeMaxiWorker02MCV2 is a reinvest-optimized CakeMaxiWorker which deposit into CakePool introduced in the PancakeSwap's MasterChefV2 migration
contract CakeMaxiWorker02MCV2 is OwnableUpgradeSafe, ReentrancyGuardUpgradeSafe, IWorker02 {
  /// ---- Libraries ----
  using SafeToken for address;
  using SafeMath for uint256;

  /// ---- Events ----
  event Reinvest(address indexed caller, uint256 reward, uint256 bounty);
  event AddShare(uint256 indexed id, uint256 share);
  event RemoveShare(uint256 indexed id, uint256 share);
  event Liquidate(uint256 indexed id, uint256 wad);
  event SetPath(address indexed caller, address[] newPath);
  event SetRewardPath(address indexed caller, address[] newRewardPath);
  event SetBeneficialVaultBountyBps(address indexed caller, uint256 indexed beneficialVaultBountyBps);
  event SetMaxReinvestBountyBps(address indexed caller, uint256 indexed maxReinvestBountyBps);
  event SetStrategyOK(address indexed caller, address indexed strategy, bool indexed isOk);
  event SetReinvestorOK(address indexed caller, address indexed reinvestor, bool indexed isOk);
  event SetCriticalStrategy(address indexed caller, IStrategy indexed addStrat, IStrategy indexed liqStrat);
  event BeneficialVaultTokenBuyback(address indexed caller, IVault indexed beneficialVault, uint256 indexed buyback);
  event SetTreasuryConfig(address indexed caller, address indexed account, uint256 bountyBps);
  event SetBeneficialVaultConfig(
    address indexed caller,
    uint256 indexed beneficialVaultBountyBps,
    IVault indexed beneficialVault,
    address[] rewardPath
  );
  event SetReinvestConfig(address indexed caller, uint256 reinvestBountyBps, uint256 reinvestThreshold);

  /// ---- Configuration variables ----
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

  /// ---- Mutable state variables ----
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
  address[] public path;
  address[] public rewardPath;

  /// ---- Configuration varaibles for V2 ----
  uint256 public fee;
  uint256 public feeDenom;

  /// ---- Upgraded state variables for CakeMaxiWorker02 ----
  uint256 public reinvestThreshold;
  address public treasuryAccount;
  uint256 public treasuryBountyBps;
  uint256 public buybackAmount;

  /// ---- Upgraded state variables for CakeMaxiWorker02MCV2 ----
  ICakePool public cakePool;
  /// --- This variable will keep track of the amount of accumulated CAKE bounty that has not been reinvested ---
  uint256 public accumulatedBounty;
  uint256 public lastCakePoolActionTime;
  uint256 public lastReinvestTime;

  function initialize(
    address _operator,
    address _baseToken,
    ICakePool _cakePool,
    IPancakeRouter02 _router,
    IVault _beneficialVault,
    uint256 _pid,
    IStrategy _addStrat,
    IStrategy _liqStrat,
    uint256 _reinvestBountyBps,
    uint256 _beneficialVaultBountyBps,
    address[] calldata _path,
    address[] calldata _rewardPath,
    uint256 _reinvestThreshold
  ) external initializer {
    // 1. Initialized imported library
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();

    // 2. Assign dependency contracts
    operator = _operator;
    wNative = _router.WETH();
    cakePool = _cakePool;
    beneficialVault = _beneficialVault;
    router = _router;
    factory = IPancakeFactory(_router.factory());

    // 3. Assign tokens state variables
    baseToken = _baseToken;
    pid = _pid;
    IERC20 _farmingToken = IERC20(cakePool.token());
    farmingToken = address(_farmingToken);

    // 4. Assign critical strategy contracts
    addStrat = _addStrat;
    liqStrat = _liqStrat;
    okStrats[address(addStrat)] = true;
    okStrats[address(liqStrat)] = true;

    // 5. Assign re-invest parameters
    reinvestThreshold = _reinvestThreshold;
    reinvestBountyBps = _reinvestBountyBps;
    beneficialVaultBountyBps = _beneficialVaultBountyBps;
    maxReinvestBountyBps = 2000;

    // 6. Assign Path parameters
    path = _path;
    rewardPath = _rewardPath;

    // 7. Setup PCSv2 swap fee
    fee = 9975;
    feeDenom = 10000;

    require(path.length >= 2, "CakeMaxiWorker02MCV2::initialize:: path length must be >= 2");
    require(
      path[0] == baseToken && path[path.length - 1] == farmingToken,
      "CakeMaxiWorker02MCV2::initialize:: path must start with base token and end with farming token"
    );
    require(rewardPath.length >= 2, "CakeMaxiWorker02MCV2::initialize:: rewardPath length must be >= 2");
    require(
      rewardPath[0] == farmingToken && rewardPath[rewardPath.length - 1] == beneficialVault.token(),
      "CakeMaxiWorker02MCV2::initialize:: rewardPath must start with farming token and end with beneficialVault.token()"
    );
    require(
      reinvestBountyBps <= maxReinvestBountyBps,
      "CakeMaxiWorker02MCV2::initialize:: reinvestBountyBps exceeded maxReinvestBountyBps"
    );
  }

  /// @notice Require that the caller must be an EOA account to avoid flash loans.
  modifier onlyEOA() {
    require(msg.sender == tx.origin, "CakeMaxiWorker02MCV2::onlyEOA:: not eoa");
    _;
  }

  /// @notice Require that the caller must be the operator.
  modifier onlyOperator() {
    require(msg.sender == operator, "CakeMaxiWorker02MCV2::onlyOperator:: not operator");
    _;
  }

  //// @notice Require that the caller must be ok reinvestor.
  modifier onlyReinvestor() {
    require(okReinvestors[msg.sender], "CakeMaxiWorker02MCV2::onlyReinvestor:: not reinvestor");
    _;
  }

  /// @notice Return the entitied farming token for the given shares.
  /// @param share The number of shares to be converted to farming tokens.
  function shareToBalance(uint256 share) public view returns (uint256) {
    if (totalShare == 0) return share; // When there's no share, 1 share = 1 balance.
    uint256 totalBalance = totalBalance(true);
    return share.mul(totalBalance).div(totalShare);
  }

  /// @notice Return the number of shares to receive if staking the farming token.
  /// @param balance the balance of farming token to be converted to shares.
  function balanceToShare(uint256 balance) public view returns (uint256) {
    if (totalShare == 0) return balance; // When there's no share, 1 share = 1 balance.
    uint256 totalBalance = totalBalance(true);
    return balance.mul(totalShare).div(totalBalance);
  }

  /// @notice Keep it as reinvest even though CakePool will be auto-compounded it for compatibility.
  function reinvest() external override onlyEOA onlyReinvestor nonReentrant {
    _reinvest(msg.sender, reinvestBountyBps, 0, 0);
    // in case of beneficial vault equals to operator vault, call buyback to transfer some buyback amount back to the vault
    // This can't be called within the _reinvest statement since _reinvest is called within the `work` as well
    _buyback();
  }

  /// @notice Internal method containing performance collecting logic
  /// @param _treasuryAccount - The account that the reinvest bounty will be sent.
  /// @param _treasuryBountyBps - The bounty bps deducted from the reinvest reward.
  /// @param _callerBalance - The balance that is owned by the msg.sender within the execution scope.
  /// @param _reinvestThreshold - The threshold to be reinvested if pendingCake pass over.
  function _reinvest(
    address _treasuryAccount,
    uint256 _treasuryBountyBps,
    uint256 _callerBalance,
    uint256 _reinvestThreshold
  ) internal {
    // 1. reset all reward balance since all rewards will be reinvested and update lastReinvestAt
    rewardBalance = 0;
    lastReinvestTime = block.timestamp;
    uint256 _currentTotalBalance = totalBalance(false);

    // 2. Calculate the profit since cakeAtLastUserAction with the current CAKE balance
    (, , uint256 _cakeAtLastUserAction, uint256 _lastUserActionTime, , , , , ) = cakePool.userInfo(address(this));
    // Deduct `accumulatedBounty` which has not been collected from here for profit calculation to be correct
    _cakeAtLastUserAction = _cakeAtLastUserAction.sub(accumulatedBounty);
    uint256 _currentProfit = _currentTotalBalance.sub(_cakeAtLastUserAction);
    uint256 _bounty = _currentProfit.mul(_treasuryBountyBps) / 10000;

    // If the CakePool has been interacted since last time (_lastUserActionTime > lastCakePoolActionTime), the `accumulatedBounty` must be added.
    // This is to prevent double counting `accumulatedBounty` in case there is no interaction at all between two `_reinvest()` calls.
    // The `_bounty` must correctly represent the Performance Fee calculated from profit.
    // `accumulatedBounty` is the state that will remember any uncollected Performance Fee due to `_reinvestThreshold` and `MIN_WITHDRAW_AMOUNT`.
    //
    // Case 1: CakePool interaction between two reinvest
    // #1 Reinvest                                                     #2 Reinvest
    // lastUserActionTime: 1                                           lastUserActionTime: 2
    // profit: 1 CAKE                     Position                     profit: 1 CAKE
    // bounty: 0.1 CAKE                   Interaction                  bounty: 0.1 CAKE
    // +--------------------------------------+--------------------------------------+
    // [No reinvest]                                                   [Reinvest occur]
    // accumulatedBounty: 0.1 CAKE                                     accumulatedBounty: 0.1 CAKE
    // lastCakePoolActionTime: 1                                       lastCakePoolActionTime: 1
    //                                                                 bountyToCollect = bounty + accumulatedBounty = 0.2 CAKE
    // Case 2: No CakePool interaction between two reinvest
    // #1 Reinvest                                                     #2 Reinvest
    // lastUserActionTime: 1                                           lastUserActionTime: 1
    // profit: 1 CAKE                                                  profit: 2 CAKE
    // bounty: 0.1 CAKE                                                bounty: 0.2 CAKE
    // +-----------------------------------------------------------------------------+
    // [No reinvest]                                                   [Reinvest occur]
    // accumulatedBounty: 0.1 CAKE                                     accumulatedBounty: 0.1 CAKE
    // lastCakePoolActionTime: 1                                       lastCakePoolActionTime: 1
    //                                                                 bountyToCollect = bounty = 0.2 CAKE
    //                                                                 (accumulatedBounty is ignored here, because it is already included when calculating bounty)
    //
    if (_lastUserActionTime > lastCakePoolActionTime) _bounty = _bounty.add(accumulatedBounty);

    // Check for `_reinvestThreshold` to save gas and `MIN_WITHDRAW_AMOUNT` to prevent failed bounty withdrawal
    if (_bounty < _reinvestThreshold || _bounty < cakePool.MIN_WITHDRAW_AMOUNT()) {
      // If the worker decided to not collect performance fee here,
      // Update `accumulatedBounty` with `_bounty` which will already include any previously accumulated bounty.
      accumulatedBounty = _bounty;
      // Update `lastCakePoolActionTime` for double counting prevention
      lastCakePoolActionTime = _lastUserActionTime;
      return;
    }

    // 3. Withdraw only the bounty from the profit, taking into account withdrawal fee
    uint256 _rewardBalanceBefore = farmingToken.myBalance();
    cakePool.withdrawByAmount(_bounty);
    uint256 _actualBountyReceived = farmingToken.myBalance().sub(_rewardBalanceBefore);

    // 4. send the reward bounty to the caller.
    if (_actualBountyReceived > 0) {
      uint256 beneficialVaultBounty = _actualBountyReceived.mul(beneficialVaultBountyBps) / 10000;
      if (beneficialVaultBounty > 0) _rewardToBeneficialVault(beneficialVaultBounty, _callerBalance);
      farmingToken.safeTransfer(_treasuryAccount, _actualBountyReceived.sub(beneficialVaultBounty));
    }

    // 5. Reset `accumulatedBounty` when the bounty has been collected
    accumulatedBounty = 0;
    // Update `lastCakePoolActionTime` for double counting prevention
    lastCakePoolActionTime = block.timestamp;

    emit Reinvest(_treasuryAccount, _currentProfit, _actualBountyReceived);
  }

  /// @notice Some portion of a bounty from reinvest will be sent to beneficialVault to increase the size of totalToken.
  /// @param _beneficialVaultBounty - The amount of CAKE to be swapped to BTOKEN & send back to the Vault.
  /// @param _callerBalance - The balance that is owned by the msg.sender within the execution scope.
  function _rewardToBeneficialVault(uint256 _beneficialVaultBounty, uint256 _callerBalance) internal {
    /// 1. approve router to do the trading
    farmingToken.safeApprove(address(router), uint256(-1));
    /// 2. read base token from beneficialVault
    address beneficialVaultToken = beneficialVault.token();
    /// 3. swap reward token to beneficialVaultToken
    uint256[] memory amounts = router.swapExactTokensForTokens(
      _beneficialVaultBounty,
      0,
      rewardPath,
      address(this),
      now
    );
    // if beneficialvault token not equal to baseToken regardless of a caller balance, can directly transfer to beneficial vault
    // otherwise, need to keep it as a buybackAmount,
    // since beneficial vault is the same as the calling vault, it will think of this reward as a `back` amount to paydebt/ sending back to a position owner
    if (beneficialVaultToken != baseToken) {
      buybackAmount = 0;
      beneficialVaultToken.safeTransfer(address(beneficialVault), beneficialVaultToken.myBalance());
      emit BeneficialVaultTokenBuyback(msg.sender, beneficialVault, amounts[amounts.length - 1]);
    } else {
      buybackAmount = beneficialVaultToken.myBalance().sub(_callerBalance);
    }
    farmingToken.safeApprove(address(router), 0);
  }

  /// @notice for transfering a buyback amount to the particular beneficial vault
  // this will be triggered when beneficialVaultToken equals to baseToken.
  function _buyback() internal {
    if (buybackAmount == 0) return;
    uint256 _buybackAmount = buybackAmount;
    buybackAmount = 0;
    beneficialVault.token().safeTransfer(address(beneficialVault), _buybackAmount);
    emit BeneficialVaultTokenBuyback(msg.sender, beneficialVault, _buybackAmount);
  }

  /// @notice Work on the given position. Must be called by the operator.
  /// @param id The position ID to work on.
  /// @param user The original user that is interacting with the operator.
  /// @param debt The amount of user debt to help the strategy make decisions.
  /// @param data The encoded data, consisting of strategy address and calldata.
  function work(
    uint256 id,
    address user,
    uint256 debt,
    bytes calldata data
  ) external override onlyOperator nonReentrant {
    // 1. Reinvest
    _reinvest(treasuryAccount, treasuryBountyBps, actualBaseTokenBalance(), reinvestThreshold);
    // 2. Remove shares on this position back to farming tokens
    _removeShare(id);
    // 3. Perform the worker strategy; sending a basetoken amount to the strategy.
    (address strat, bytes memory ext) = abi.decode(data, (address, bytes));
    require(okStrats[strat], "CakeMaxiWorker02MCV2::work:: unapproved work strategy");
    baseToken.safeTransfer(strat, actualBaseTokenBalance());
    farmingToken.safeTransfer(strat, actualFarmingTokenBalance());
    IStrategy(strat).execute(user, debt, ext);
    // 4. Add farming token back to the farming pool. Thus, increasing an LP size of the current position's shares
    _addShare(id);
    // 5. Return any remaining BaseToken back to the operator.
    baseToken.safeTransfer(msg.sender, actualBaseTokenBalance());
  }

  /// @notice Return maximum output given the input amount and the status of Pancakeswap reserves.
  /// @param aIn The amount of asset to market sell.
  /// @param rIn the amount of asset in reserve for input.
  /// @param rOut The amount of asset in reserve for output.
  function getMktSellAmount(
    uint256 aIn,
    uint256 rIn,
    uint256 rOut
  ) public view returns (uint256) {
    if (aIn == 0) return 0;
    require(rIn > 0 && rOut > 0, "CakeMaxiWorker02MCV2::getMktSellAmount:: bad reserve values");
    uint256 aInWithFee = aIn.mul(fee);
    uint256 numerator = aInWithFee.mul(rOut);
    uint256 denominator = rIn.mul(feeDenom).add(aInWithFee);
    return numerator / denominator;
  }

  /// @notice Return the amount of BaseToken to receive if we are to liquidate the given position.
  /// @param id The position ID to perform health check.
  function health(uint256 id) external view override returns (uint256) {
    IPancakePair currentLP;
    uint256[] memory amount;
    address[] memory reversedPath = getReversedPath();
    amount = new uint256[](reversedPath.length);
    amount[0] = getAmountAfterWithdrawalFee(shareToBalance(shares[id]));
    for (uint256 i = 1; i < reversedPath.length; i++) {
      /// 1. Get the current LP based on the specified paths.
      currentLP = IPancakePair(factory.getPair(reversedPath[i - 1], reversedPath[i]));
      /// 2. Get the pool's total supply of the token of path i-1 and the token of path i.
      (uint256 r0, uint256 r1, ) = currentLP.getReserves();
      (uint256 rOut, uint256 rIn) = currentLP.token0() == reversedPath[i] ? (r0, r1) : (r1, r0);
      /// 3. Convert all amount on the token of path i-1 to the token of path i.
      amount[i] = getMktSellAmount(amount[i - 1], rIn, rOut);
    }
    /// @notice return the last amount, since the last amount is the amount that we shall get in baseToken if we sell the farmingToken at the market price
    return amount[amount.length - 1];
  }

  /// @notice Liquidate the given position by converting it to BaseToken and return back to caller.
  /// @param id The position ID to perform liquidation
  function liquidate(uint256 id) external override onlyOperator nonReentrant {
    // 1. Pull out performance fee to prevent leftover performance fee
    _reinvest(treasuryAccount, treasuryBountyBps, actualBaseTokenBalance(), 0);
    // 2. Remove shares on this position back to farming tokens
    _removeShare(id);
    farmingToken.safeTransfer(address(liqStrat), actualFarmingTokenBalance());
    liqStrat.execute(address(0), 0, abi.encode(0));
    // 3. Return all available base token back to the operator.
    uint256 liquidatedAmount = actualBaseTokenBalance();
    baseToken.safeTransfer(msg.sender, liquidatedAmount);
    emit Liquidate(id, liquidatedAmount);
  }

  /// @notice since reward gaining from the masterchef is the same token with farmingToken,
  /// thus the rewardBalance exists to differentiate an actual farming token balance without taking reward balance into account
  function actualFarmingTokenBalance() internal view returns (uint256) {
    return farmingToken.myBalance();
  }

  /// @notice since buybackAmount variable has been created to collect a buyback balance when during the reinvest within the work method,
  /// thus the actualBaseTokenBalance exists to differentiate an actual base token balance balance without taking buy back amount into account
  function actualBaseTokenBalance() internal view returns (uint256) {
    return baseToken.myBalance().sub(buybackAmount);
  }

  /// @notice Internal function to stake all outstanding LP tokens to the given position ID.
  function _addShare(uint256 id) internal {
    uint256 shareBalance = actualFarmingTokenBalance();
    if (shareBalance > 0) {
      // 1. Convert balance to share
      uint256 share = balanceToShare(shareBalance);
      // 2. Update shares
      shares[id] = shares[id].add(share);
      totalShare = totalShare.add(share);
      // 3. Deposit balance to PancakeMasterChef
      deposit(shareBalance);
      emit AddShare(id, share);
    }
  }

  /// @notice Internal function to remove shares of the ID and convert to outstanding LP tokens.
  /// @dev Since when removing shares, rewards token can be the same as farming token,
  /// so it needs to return the current reward balance to be excluded fro the farming token balance.
  function _removeShare(uint256 id) internal {
    uint256 share = shares[id];
    if (share > 0) {
      uint256 balance = shareToBalance(share);
      totalShare = totalShare.sub(share);
      shares[id] = 0;
      withdraw(balance);

      emit RemoveShare(id, share);
    }
  }

  /// @notice Return the path that the worker is working on.
  function getPath() external view override returns (address[] memory) {
    return path;
  }

  /// @notice Return the inverse path.
  function getReversedPath() public view override returns (address[] memory) {
    address tmp;
    address[] memory reversedPath = path;
    for (uint256 i = 0; i < reversedPath.length / 2; i++) {
      tmp = reversedPath[i];
      reversedPath[i] = reversedPath[reversedPath.length - i - 1];
      reversedPath[reversedPath.length - i - 1] = tmp;
    }
    return reversedPath;
  }

  /// @notice Return the path that the work is using for convert reward token to beneficial vault token.
  function getRewardPath() external view override returns (address[] memory) {
    return rewardPath;
  }

  /// @notice Set the reinvest configuration.
  /// @param _reinvestBountyBps - The bounty value to update.
  /// @param _reinvestThreshold - The threshold to update.
  function setReinvestConfig(uint256 _reinvestBountyBps, uint256 _reinvestThreshold) external onlyOwner {
    require(
      _reinvestBountyBps <= maxReinvestBountyBps,
      "CakeMaxiWorker02MCV2::setReinvestConfig:: _reinvestBountyBps exceeded maxReinvestBountyBps"
    );

    reinvestBountyBps = _reinvestBountyBps;
    reinvestThreshold = _reinvestThreshold;

    emit SetReinvestConfig(msg.sender, _reinvestBountyBps, _reinvestThreshold);
  }

  /// @notice Set the reward bounty from reinvest operations sending to a beneficial vault.
  /// this bps will be deducted from reinvest bounty bps
  /// @param _beneficialVaultBountyBps The bounty value to update.
  function setBeneficialVaultBountyBps(uint256 _beneficialVaultBountyBps) external onlyOwner {
    require(
      _beneficialVaultBountyBps <= 10000,
      "CakeMaxiWorker02MCV2::setBeneficialVaultBountyBps:: _beneficialVaultBountyBps exceeds 100%"
    );
    beneficialVaultBountyBps = _beneficialVaultBountyBps;
    emit SetBeneficialVaultBountyBps(msg.sender, _beneficialVaultBountyBps);
  }

  /// @notice Set Max reinvest reward for set upper limit reinvest bounty.
  /// @param _maxReinvestBountyBps The max reinvest bounty value to update.
  function setMaxReinvestBountyBps(uint256 _maxReinvestBountyBps) external onlyOwner {
    require(
      _maxReinvestBountyBps >= reinvestBountyBps,
      "CakeMaxiWorker02MCV2::setMaxReinvestBountyBps:: _maxReinvestBountyBps lower than reinvestBountyBps"
    );
    require(
      _maxReinvestBountyBps <= 3000,
      "CakeMaxiWorker02MCV2::setMaxReinvestBountyBps:: _maxReinvestBountyBps exceeded 30%"
    );

    maxReinvestBountyBps = _maxReinvestBountyBps;

    emit SetMaxReinvestBountyBps(msg.sender, _maxReinvestBountyBps);
  }

  /// @notice Set the given strategies' approval status.
  /// @param strats The strategy addresses.
  /// @param isOk Whether to approve or unapprove the given strategies.
  function setStrategyOk(address[] calldata strats, bool isOk) external override onlyOwner {
    uint256 len = strats.length;
    for (uint256 idx = 0; idx < len; idx++) {
      okStrats[strats[idx]] = isOk;
      emit SetStrategyOK(msg.sender, strats[idx], isOk);
    }
  }

  /// @notice Set the given address's to be reinvestor.
  /// @param reinvestors The reinvest bot addresses.
  /// @param isOk Whether to approve or unapprove the given strategies.
  function setReinvestorOk(address[] calldata reinvestors, bool isOk) external override onlyOwner {
    uint256 len = reinvestors.length;
    for (uint256 idx = 0; idx < len; idx++) {
      okReinvestors[reinvestors[idx]] = isOk;
      emit SetReinvestorOK(msg.sender, reinvestors[idx], isOk);
    }
  }

  /// @notice Set a new path. In case that the liquidity of the given path is changed.
  /// @param _path The new path.
  function setPath(address[] calldata _path) external onlyOwner {
    require(_path.length >= 2, "CakeMaxiWorker02MCV2::setPath:: path length must be >= 2");
    require(
      _path[0] == baseToken && _path[_path.length - 1] == farmingToken,
      "CakeMaxiWorker02MCV2::setPath:: path must start with base token and end with farming token"
    );

    path = _path;

    emit SetPath(msg.sender, _path);
  }

  /// @notice Set a new reward path. In case that the liquidity of the reward path is changed.
  /// @param _rewardPath The new reward path.
  function setRewardPath(address[] calldata _rewardPath) external onlyOwner {
    require(_rewardPath.length >= 2, "CakeMaxiWorker02MCV2::setRewardPath:: rewardPath length must be >= 2");
    require(
      _rewardPath[0] == farmingToken && _rewardPath[_rewardPath.length - 1] == beneficialVault.token(),
      "CakeMaxiWorker02MCV2::setRewardPath:: rewardPath must start with farming token and end with beneficialVault token"
    );

    rewardPath = _rewardPath;

    emit SetRewardPath(msg.sender, _rewardPath);
  }

  /// @notice Update critical strategy smart contracts. EMERGENCY ONLY. Bad strategies can steal funds.
  /// @param _addStrat The new add strategy contract.
  /// @param _liqStrat The new liquidate strategy contract.
  function setCriticalStrategies(IStrategy _addStrat, IStrategy _liqStrat) external onlyOwner {
    addStrat = _addStrat;
    liqStrat = _liqStrat;
    emit SetCriticalStrategy(msg.sender, _addStrat, _liqStrat);
  }

  /// @notice Set treasury configurations.
  /// @param _treasuryAccount - The treasury address to update
  /// @param _treasuryBountyBps - The treasury bounty to update
  function setTreasuryConfig(address _treasuryAccount, uint256 _treasuryBountyBps) external onlyOwner {
    require(
      _treasuryBountyBps <= maxReinvestBountyBps,
      "CakeMaxiWorker02MCV2::setTreasuryConfig:: _treasuryBountyBps exceeded maxReinvestBountyBps"
    );

    treasuryAccount = _treasuryAccount;
    treasuryBountyBps = _treasuryBountyBps;

    emit SetTreasuryConfig(msg.sender, treasuryAccount, treasuryBountyBps);
  }

  /// @notice Set beneficial vault related configuration including beneficialVaultBountyBps, beneficialVaultAddress, and rewardPath
  /// @param _beneficialVaultBountyBps - The bounty value to update.
  /// @param _beneficialVault - beneficialVaultAddress
  /// @param _rewardPath - reward token path from rewardToken to beneficialVaultToken
  function setBeneficialVaultConfig(
    uint256 _beneficialVaultBountyBps,
    IVault _beneficialVault,
    address[] calldata _rewardPath
  ) external onlyOwner {
    require(
      _beneficialVaultBountyBps <= 10000,
      "CakeMaxiWorker02MCV2::setBeneficialVaultConfig:: _beneficialVaultBountyBps exceeds 100%"
    );
    require(_rewardPath.length >= 2, "CakeMaxiWorker02MCV2::setBeneficialVaultConfig:: rewardPath length must >= 2");
    require(
      _rewardPath[0] == farmingToken && _rewardPath[_rewardPath.length - 1] == _beneficialVault.token(),
      "CakeMaxiWorker02MCV2::setBeneficialVaultConfig:: rewardPath must start with FTOKEN, end with beneficialVault token"
    );

    _buyback();

    beneficialVaultBountyBps = _beneficialVaultBountyBps;
    beneficialVault = _beneficialVault;
    rewardPath = _rewardPath;

    emit SetBeneficialVaultConfig(msg.sender, _beneficialVaultBountyBps, _beneficialVault, _rewardPath);
  }

  /// @notice Deposit to the CakePool.
  /// @dev Revert if waive fee assumption is not met.
  /// @param _amount The amount to deposit.
  function deposit(uint256 _amount) internal {
    require(
      cakePool.freeWithdrawFeeUsers(address(this)),
      "CakeMaxiWorker02MCV2::deposit::cannot deposit with withdrawal fee on"
    );
    address(farmingToken).safeApprove(address(cakePool), uint256(-1));
    cakePool.deposit(_amount, 0);
    address(farmingToken).safeApprove(address(cakePool), 0);
  }

  /// @notice Withdraw from the CakePool.
  /// @param _amount The amount to withdraw.
  function withdraw(uint256 _amount) internal {
    if (_amount > 0) cakePool.withdrawByAmount(_amount);
  }

  /// @notice Return the current balance that is owned by users.
  /// @dev Balance should deduct the fee.
  function totalBalance(bool _withAlpacaPerformanceFee) public view returns (uint256 _totalBalance) {
    (uint256 _shares, , uint256 _cakeAtLastUserAction, , , , , , ) = cakePool.userInfo(address(this));
    _totalBalance = cakePool.totalShares() == 0
      ? 0
      : _shares.mul(cakePool.balanceOf().add(cakePool.calculateTotalPendingCakeRewards())).div(cakePool.totalShares());
    _totalBalance = _totalBalance.sub(accumulatedBounty);
    uint256 _cakePoolPerformanceFee = cakePool.calculatePerformanceFee(address(this));
    _totalBalance = _totalBalance.sub(_cakePoolPerformanceFee);

    if (_withAlpacaPerformanceFee && block.timestamp > lastReinvestTime) {
      // Deduct pending Alpaca's performance fee
      _cakeAtLastUserAction = _cakeAtLastUserAction.sub(accumulatedBounty);
      uint256 _currentProfit = _totalBalance.sub(_cakeAtLastUserAction);
      _totalBalance = _totalBalance.sub(_currentProfit.mul(treasuryBountyBps) / 10000);
    }
  }

  /// @notice Return the expected withdrawal amount if fee is applied.
  /// @dev Meant to be used when free fee assumption not met and liquidation needs to be done.
  /// @param _amount The amount to be withdrawn.
  function getAmountAfterWithdrawalFee(uint256 _amount) internal view returns (uint256) {
    bool isFreeFee = cakePool.freeWithdrawFeeUsers(address(this));
    if (isFreeFee) return _amount;
    uint256 _feeRate = cakePool.withdrawFeeContract();
    uint256 _withdrawFee = (_amount.mul(_feeRate)).div(10000);
    return _amount.sub(_withdrawFee);
  }
}
