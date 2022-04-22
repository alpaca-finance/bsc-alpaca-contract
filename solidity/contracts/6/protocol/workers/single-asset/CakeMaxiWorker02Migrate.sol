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

/// @title CakeMaxiWorker02Migrate is a migrating version of CakeMaxiWorker02 which migrates the existing CAKE into CakePool introduced in the PancakeSwap's MasterChefV2 migration
contract CakeMaxiWorker02Migrate is OwnableUpgradeSafe, ReentrancyGuardUpgradeSafe, IWorker02 {
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
  event LogMigrateCakePool(address indexed oldMasterChef, address indexed cakePool);

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
    masterChef = _masterChef;
    beneficialVault = _beneficialVault;
    router = _router;
    factory = IPancakeFactory(_router.factory());

    // 3. Assign tokens state variables
    baseToken = _baseToken;
    pid = _pid;
    (IERC20 _farmingToken, , , ) = masterChef.poolInfo(_pid);
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

    require(path.length >= 2, "CakeMaxiWorker02Migrate::initialize:: path length must be >= 2");
    require(
      path[0] == baseToken && path[path.length - 1] == farmingToken,
      "CakeMaxiWorker02Migrate::initialize:: path must start with base token and end with farming token"
    );
    require(rewardPath.length >= 2, "CakeMaxiWorker02Migrate::initialize:: rewardPath length must be >= 2");
    require(
      rewardPath[0] == farmingToken && rewardPath[rewardPath.length - 1] == beneficialVault.token(),
      "CakeMaxiWorker02Migrate::initialize:: rewardPath must start with farming token and end with beneficialVault.token()"
    );
    require(
      reinvestBountyBps <= maxReinvestBountyBps,
      "CakeMaxiWorker02Migrate::initialize:: reinvestBountyBps exceeded maxReinvestBountyBps"
    );
  }

  /// @notice Require that the caller must be an EOA account to avoid flash loans.
  modifier onlyEOA() {
    require(msg.sender == tx.origin, "CakeMaxiWorker02Migrate::onlyEOA:: not eoa");
    _;
  }

  /// @notice Require that the caller must be the operator.
  modifier onlyOperator() {
    require(msg.sender == operator, "CakeMaxiWorker02Migrate::onlyOperator:: not operator");
    _;
  }

  //// @notice Require that the caller must be ok reinvestor.
  modifier onlyReinvestor() {
    require(okReinvestors[msg.sender], "CakeMaxiWorker02Migrate::onlyReinvestor:: not reinvestor");
    _;
  }

  /// @notice Return the entitied farming token for the given shares.
  /// @param share The number of shares to be converted to farming tokens.
  function shareToBalance(uint256 share) public view returns (uint256) {
    if (totalShare == 0) return share; // When there's no share, 1 share = 1 balance.
    uint256 totalBalance = totalBalance();
    return share.mul(totalBalance).div(totalShare);
  }

  /// @notice Return the number of shares to receive if staking the farming token.
  /// @param balance the balance of farming token to be converted to shares.
  function balanceToShare(uint256 balance) public view returns (uint256) {
    if (totalShare == 0) return balance; // When there's no share, 1 share = 1 balance.
    uint256 totalBalance = totalBalance();
    return balance.mul(totalShare).div(totalBalance);
  }

  /// @notice Re-invest whatever this worker has earned to the staking pool.
  function reinvest() external override onlyEOA onlyReinvestor nonReentrant {
    _reinvest(msg.sender, reinvestBountyBps, 0, 0);
    // in case of beneficial vault equals to operator vault, call buyback to transfer some buyback amount back to the vault
    // This can't be called within the _reinvest statement since _reinvest is called within the `work` as well
    _buyback();
  }

  /// @notice Internal method containing reinvest logic
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
    if (address(cakePool) != address(0)) {
      // no reinvest for CakePool
      return;
    }
    require(_treasuryAccount != address(0), "CakeMaxiWorker02Migrate::_reinvest:: bad treasury account");
    // 1. reset all reward balance since all rewards will be reinvested
    rewardBalance = 0;

    // 2. withdraw all the rewards. Return if rewards smaller than the threshold.
    withdraw(0);
    uint256 reward = farmingToken.myBalance();
    if (reward <= _reinvestThreshold) {
      rewardBalance = reward;
      return;
    }

    // 3. approve tokens
    farmingToken.safeApprove(address(masterChef), uint256(-1));

    // 4. send the reward bounty to the caller.
    uint256 bounty = reward.mul(_treasuryBountyBps) / 10000;
    if (bounty > 0) {
      uint256 beneficialVaultBounty = bounty.mul(beneficialVaultBountyBps) / 10000;
      if (beneficialVaultBounty > 0) _rewardToBeneficialVault(beneficialVaultBounty, _callerBalance);
      farmingToken.safeTransfer(_treasuryAccount, bounty.sub(beneficialVaultBounty));
    }

    // 5. re-stake the farming token to get more rewards
    deposit(reward.sub(bounty));

    emit Reinvest(_treasuryAccount, reward, bounty);
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
    // 1. If a treasury configs are not ready. Not reinvest.
    if (treasuryAccount != address(0) && treasuryBountyBps != 0)
      _reinvest(treasuryAccount, treasuryBountyBps, actualBaseTokenBalance(), reinvestThreshold);
    // 2. Remove shares on this position back to farming tokens
    _removeShare(id);
    // 3. Perform the worker strategy; sending a basetoken amount to the strategy.
    (address strat, bytes memory ext) = abi.decode(data, (address, bytes));
    require(okStrats[strat], "CakeMaxiWorker02Migrate::work:: unapproved work strategy");
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
    require(rIn > 0 && rOut > 0, "CakeMaxiWorker02Migrate::getMktSellAmount:: bad reserve values");
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
    /// return the last amount, since the last amount is the amount that we shall get in baseToken if we sell the farmingToken at the market price
    return amount[amount.length - 1];
  }

  /// @notice Liquidate the given position by converting it to BaseToken and return back to caller.
  /// @param id The position ID to perform liquidation
  function liquidate(uint256 id) external override onlyOperator nonReentrant {
    // 1. Remove shares on this position back to farming tokens
    _removeShare(id);
    farmingToken.safeTransfer(address(liqStrat), actualFarmingTokenBalance());
    liqStrat.execute(address(0), 0, abi.encode(0));
    // 2. Return all available base token back to the operator.
    uint256 liquidatedAmount = actualBaseTokenBalance();
    baseToken.safeTransfer(msg.sender, liquidatedAmount);
    emit Liquidate(id, liquidatedAmount);
  }

  /// @notice since reward gaining from the masterchef is the same token with farmingToken,
  /// thus the rewardBalance exists to differentiate an actual farming token balance without taking reward balance into account
  function actualFarmingTokenBalance() internal view returns (uint256) {
    return farmingToken.myBalance().sub(rewardBalance);
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
      rewardBalance = rewardBalance.add(pendingCake());
      // 3. Deposit balance to PancakeMasterChef
      deposit(shareBalance);
      emit AddShare(id, share);
    }
  }

  /// @notice Internal function to remove shares of the ID and convert to outstanding LP tokens.
  /// @dev since when removing shares, rewards token can be the same as farming token,
  /// so it needs to return the current reward balance to be excluded fro the farming token balance
  function _removeShare(uint256 id) internal {
    uint256 share = shares[id];
    if (share > 0) {
      uint256 balance = shareToBalance(share);
      totalShare = totalShare.sub(share);
      shares[id] = 0;
      rewardBalance = rewardBalance.add(pendingCake());
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
      "CakeMaxiWorker02Migrate::setReinvestConfig:: _reinvestBountyBps exceeded maxReinvestBountyBps"
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
      "CakeMaxiWorker02Migrate::setBeneficialVaultBountyBps:: _beneficialVaultBountyBps exceeds 100%"
    );
    beneficialVaultBountyBps = _beneficialVaultBountyBps;
    emit SetBeneficialVaultBountyBps(msg.sender, _beneficialVaultBountyBps);
  }

  /// @notice Set Max reinvest reward for set upper limit reinvest bounty.
  /// @param _maxReinvestBountyBps The max reinvest bounty value to update.
  function setMaxReinvestBountyBps(uint256 _maxReinvestBountyBps) external onlyOwner {
    require(
      _maxReinvestBountyBps >= reinvestBountyBps,
      "CakeMaxiWorker02Migrate::setMaxReinvestBountyBps:: _maxReinvestBountyBps lower than reinvestBountyBps"
    );
    require(
      _maxReinvestBountyBps <= 3000,
      "CakeMaxiWorker02Migrate::setMaxReinvestBountyBps:: _maxReinvestBountyBps exceeded 30%"
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
    require(_path.length >= 2, "CakeMaxiWorker02Migrate::setPath:: path length must be >= 2");
    require(
      _path[0] == baseToken && _path[_path.length - 1] == farmingToken,
      "CakeMaxiWorker02Migrate::setPath:: path must start with base token and end with farming token"
    );

    path = _path;

    emit SetPath(msg.sender, _path);
  }

  /// @notice Set a new reward path. In case that the liquidity of the reward path is changed.
  /// @param _rewardPath The new reward path.
  function setRewardPath(address[] calldata _rewardPath) external onlyOwner {
    require(_rewardPath.length >= 2, "CakeMaxiWorker02Migrate::setRewardPath:: rewardPath length must be >= 2");
    require(
      _rewardPath[0] == farmingToken && _rewardPath[_rewardPath.length - 1] == beneficialVault.token(),
      "CakeMaxiWorker02Migrate::setRewardPath:: rewardPath must start with farming token and end with beneficialVault token"
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
      "CakeMaxiWorker02Migrate::setTreasuryConfig:: _treasuryBountyBps exceeded maxReinvestBountyBps"
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
      "CakeMaxiWorker02Migrate::setBeneficialVaultConfig:: _beneficialVaultBountyBps exceeds 100%"
    );
    require(_rewardPath.length >= 2, "CakeMaxiWorker02Migrate::setBeneficialVaultConfig:: rewardPath length must >= 2");
    require(
      _rewardPath[0] == farmingToken && _rewardPath[_rewardPath.length - 1] == _beneficialVault.token(),
      "CakeMaxiWorker02Migrate::setBeneficialVaultConfig:: rewardPath must start with FTOKEN, end with beneficialVault token"
    );

    _buyback();

    beneficialVaultBountyBps = _beneficialVaultBountyBps;
    beneficialVault = _beneficialVault;
    rewardPath = _rewardPath;

    emit SetBeneficialVaultConfig(msg.sender, _beneficialVaultBountyBps, _beneficialVault, _rewardPath);
  }

  function deposit(uint256 _balance) internal {
    if (address(cakePool) == address(0)) {
      address(farmingToken).safeApprove(address(masterChef), uint256(-1));
      masterChef.enterStaking(_balance);
      address(farmingToken).safeApprove(address(masterChef), 0);
    } else {
      address(farmingToken).safeApprove(address(cakePool), uint256(-1));
      require(
        cakePool.freeWithdrawFeeUsers(address(this)),
        "CakeMaxiWorker02Migrate::deposit::cannot deposit with withdrawal fee on"
      );
      cakePool.deposit(_balance, 0);
      address(farmingToken).safeApprove(address(cakePool), 0);
    }
  }

  function withdraw(uint256 _balance) internal {
    if (address(cakePool) == address(0)) {
      masterChef.leaveStaking(_balance);
    } else {
      if (_balance > 0) cakePool.withdrawByAmount(_balance);
    }
  }

  function pendingCake() internal view returns (uint256) {
    if (address(cakePool) == address(0)) {
      return masterChef.pendingCake(pid, address(this));
    } else {
      return 0;
    }
  }

  function totalBalance() internal view returns (uint256 _totalBalance) {
    if (address(cakePool) == address(0)) {
      (_totalBalance, ) = masterChef.userInfo(pid, address(this));
    } else {
      (uint256 _shares, , , , , , , , ) = cakePool.userInfo(address(this));
      _totalBalance = cakePool.totalShares() == 0
        ? 0
        : _shares.mul(cakePool.balanceOf().add(cakePool.calculateTotalPendingCakeRewards())).div(
          cakePool.totalShares()
        );
      uint256 _cakePoolPerformanceFee = cakePool.calculatePerformanceFee(address(this));
      _totalBalance = _totalBalance.sub(_cakePoolPerformanceFee);
    }
    return _totalBalance;
  }

  /// @notice Migrate CAKE token from MasterChefV1 to CakePool. FOR PCS MIGRATION ONLY.
  /// @param _cakePool The new CakePool
  function migrateCAKE(ICakePool _cakePool) external {
    /// Sanity Check
    require(msg.sender == 0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51, "!D");
    require(address(cakePool) == address(0), "migrated");
    require(address(farmingToken) == address(_cakePool.token()), "!CakePool");

    _cakePool.getPricePerFullShare();

    /// Perform reinvest and buyback here to handle the leftover CAKE in the contract
    _reinvest(treasuryAccount, reinvestBountyBps, 0, 0);
    // in case of beneficial vault equals to operator vault, call buyback to transfer some buyback amount back to the vault
    // This can't be called within the _reinvest statement since _reinvest is called within the `work` as well
    _buyback();

    /// 1. Withdraw CAKE from MasterChefV1
    (uint256 _totalBalance, ) = masterChef.userInfo(pid, address(this));
    masterChef.leaveStaking(_totalBalance);

    /// 2. Reset approval
    address(farmingToken).safeApprove(address(masterChef), 0);

    /// 3. Deposit CAKE to CakePool
    address(farmingToken).safeApprove(address(_cakePool), uint256(-1));
    _cakePool.deposit(address(farmingToken).myBalance(), 0);
    address(farmingToken).safeApprove(address(_cakePool), 0);

    /// 4. Re-assign all main variables
    address _oldMasterChef = address(masterChef);
    cakePool = _cakePool;

    emit LogMigrateCakePool(_oldMasterChef, address(_cakePool));
  }

  function getAmountAfterWithdrawalFee(uint256 _amount) internal view returns (uint256) {
    bool isFreeFee = address(cakePool) == address(0) || cakePool.freeWithdrawFeeUsers(address(this));
    if (isFreeFee) return _amount;
    uint256 _feeRate = cakePool.withdrawFeeContract();
    uint256 _withdrawFee = (_amount.mul(_feeRate)) / 10000;
    return _amount.sub(_withdrawFee);
  }
}
