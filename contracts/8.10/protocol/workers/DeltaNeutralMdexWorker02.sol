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

pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../interfaces/IMdexFactory.sol";
import "../interfaces/IMdexRouter.sol";
import "../interfaces/IBSCPool.sol";
import "../interfaces/IMdexSwapMining.sol";
import "../interfaces/IStrategy.sol";
import "../interfaces/IWorker02.sol";
import "../interfaces/IPriceHelper.sol";
import "../interfaces/IVault.sol";
import "../../utils/AlpacaMath.sol";
import "../../utils/SafeToken.sol";

contract DeltaNeutralMdexWorker02 is OwnableUpgradeable, ReentrancyGuardUpgradeable, IWorker02 {
  /// @notice Libraries
  using SafeToken for address;

  /// @notice Errors
  error InvalidRewardToken();
  error InvalidTokens();

  error NotEOA();
  error NotOperator();
  error NotReinvestor();
  error NotWhitelistedCaller();

  error UnApproveStrategy();
  error BadTreasuryAccount();
  error NotAllowToLiquidate();

  error InvalidReinvestPath();
  error InvalidReinvestPathLength();
  error ExceedReinvestBounty();
  error ExceedReinvestBps();

  /// @notice Events
  event Reinvest(address indexed caller, uint256 reward, uint256 bounty);
  event BscPoolDeposit(uint256 lpAmount);
  event BscPoolWithdraw(uint256 lpAmount);
  event SetTreasuryConfig(address indexed caller, address indexed account, uint256 bountyBps);
  event BeneficialVaultTokenBuyback(address indexed caller, IVault indexed beneficialVault, uint256 indexed buyback);
  event SetStrategyOK(address indexed caller, address indexed strategy, bool indexed isOk);
  event SetReinvestorOK(address indexed caller, address indexed reinvestor, bool indexed isOk);
  event SetWhitelistedCallers(address indexed caller, address indexed whitelistUser, bool indexed isOk);
  event SetCriticalStrategy(address indexed caller, IStrategy indexed addStrat);
  event SetMaxReinvestBountyBps(address indexed caller, uint256 indexed maxReinvestBountyBps);
  event SetRewardPath(address indexed caller, address[] newRewardPath);
  event SetBeneficialVaultConfig(
    address indexed caller,
    uint256 indexed beneficialVaultBountyBps,
    IVault indexed beneficialVault,
    address[] rewardPath
  );
  event SetReinvestConfig(
    address indexed caller,
    uint256 reinvestBountyBps,
    uint256 reinvestThreshold,
    address[] reinvestPath
  );
  event WithdrawTradingRewards(address indexed caller, address to, uint256 amount);

  /// @dev constants
  uint256 private constant BASIS_POINT = 10000;

  /// @notice Configuration variables
  IBSCPool public bscPool;
  IMdexFactory public factory;
  IMdexRouter public router;
  IPancakePair public override lpToken;
  IPriceHelper public priceHelper;
  address public wNative;
  address public override baseToken;
  address public override farmingToken;
  address public mdx;
  address public operator;
  uint256 public pid;

  /// @notice Mutable state variables
  mapping(address => bool) public okStrats;
  IStrategy public addStrat;
  uint256 public reinvestBountyBps;
  uint256 public maxReinvestBountyBps;
  mapping(address => bool) public okReinvestors;
  mapping(address => bool) public whitelistCallers;

  /// @notice Upgraded State Variables for DeltaNeutralMdexWorker02
  uint256 public reinvestThreshold;
  address[] public reinvestPath;
  address public treasuryAccount;
  uint256 public treasuryBountyBps;
  IVault public beneficialVault;
  uint256 public beneficialVaultBountyBps;
  address[] public rewardPath;
  uint256 public buybackAmount;
  uint256 public totalLpBalance;

  function initialize(
    address _operator,
    address _baseToken,
    IBSCPool _bscPool,
    IMdexRouter _router,
    uint256 _pid,
    IStrategy _addStrat,
    uint256 _reinvestBountyBps,
    address _treasuryAccount,
    address[] calldata _reinvestPath,
    uint256 _reinvestThreshold,
    IPriceHelper _priceHelper
  ) external initializer {
    // 1. Initialized imported library
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();

    // 2. Assign dependency contracts
    operator = _operator;
    wNative = _router.WBNB();
    bscPool = _bscPool;
    router = _router;
    factory = IMdexFactory(_router.factory());
    priceHelper = _priceHelper;

    // 3. Assign tokens state variables
    baseToken = _baseToken;
    pid = _pid;
    (IERC20 _lpToken, , , , , ) = bscPool.poolInfo(_pid);
    lpToken = IPancakePair(address(_lpToken));
    address token0 = lpToken.token0();
    address token1 = lpToken.token1();
    farmingToken = token0 == baseToken ? token1 : token0;
    mdx = address(bscPool.mdx());
    totalLpBalance = 0;

    // 4. Assign critical strategy contracts
    addStrat = _addStrat;
    okStrats[address(addStrat)] = true;

    // 5. Assign Re-invest parameters
    reinvestBountyBps = _reinvestBountyBps;
    reinvestThreshold = _reinvestThreshold;
    reinvestPath = _reinvestPath;
    treasuryAccount = _treasuryAccount;
    treasuryBountyBps = _reinvestBountyBps;
    maxReinvestBountyBps = 500;

    // 6. Check if critical parameters are config properly
    if (baseToken == mdx) revert InvalidRewardToken();

    if (reinvestBountyBps > maxReinvestBountyBps) revert ExceedReinvestBounty();

    if (
      !((farmingToken == lpToken.token0() || farmingToken == lpToken.token1()) &&
        (baseToken == lpToken.token0() || baseToken == lpToken.token1()))
    ) revert InvalidTokens();

    if (reinvestPath[0] != mdx || reinvestPath[reinvestPath.length - 1] != baseToken) revert InvalidReinvestPath();
  }

  /// @dev Require that the caller must be an EOA account to avoid flash loans.
  modifier onlyEOA() {
    if (msg.sender != tx.origin) revert NotEOA();
    _;
  }

  /// @dev Require that the caller must be the operator.
  modifier onlyOperator() {
    if (msg.sender != operator) revert NotOperator();
    _;
  }

  //// @dev Require that the caller must be ok reinvestor.
  modifier onlyReinvestor() {
    if (!okReinvestors[msg.sender]) revert NotReinvestor();
    _;
  }

  //// @dev Require that the caller must be whitelist callers.
  modifier onlyWhitelistedCaller(address user) {
    if (!whitelistCallers[user]) revert NotWhitelistedCaller();
    _;
  }

  /// @dev Re-invest whatever this worker has earned back to staked LP tokens.
  function reinvest() external override onlyEOA onlyReinvestor nonReentrant {
    _reinvest(msg.sender, reinvestBountyBps, 0, 0);
    // in case of beneficial vault equals to operator vault, call buyback to transfer some buyback amount back to the vault
    // This can't be called within the _reinvest statement since _reinvest is called within the `work` as well
    _buyback();
  }

  /// @dev internal method for reinvest.
  /// @param _treasuryAccount - The account to receive reinvest fees.
  /// @param _treasuryBountyBps - The fees in BPS that will be charged for reinvest.
  /// @param _callerBalance - The balance that is owned by the msg.sender within the execution scope.
  /// @param _reinvestThreshold - The threshold to be reinvested if reward pass over.
  function _reinvest(
    address _treasuryAccount,
    uint256 _treasuryBountyBps,
    uint256 _callerBalance,
    uint256 _reinvestThreshold
  ) internal {
    if (_treasuryAccount == address(0)) revert BadTreasuryAccount();

    // 1. Withdraw all the rewards. Return if reward <= _reinvestThreshold.
    _bscPoolWithdraw();
    uint256 reward = mdx.myBalance();
    if (reward <= _reinvestThreshold) return;

    // 2. Approve tokens
    mdx.safeApprove(address(router), type(uint256).max);
    address(lpToken).safeApprove(address(bscPool), type(uint256).max);

    // 3. Send the reward bounty to the _treasuryAccount
    uint256 bounty = (reward * _treasuryBountyBps) / BASIS_POINT;
    if (bounty > 0) {
      uint256 beneficialVaultBounty = (bounty * beneficialVaultBountyBps) / BASIS_POINT;
      if (beneficialVaultBounty > 0) _rewardToBeneficialVault(beneficialVaultBounty, _callerBalance);
      mdx.safeTransfer(_treasuryAccount, bounty - beneficialVaultBounty);
    }

    // 4. Convert all the remaining rewards to BaseToken according to config path.
    router.swapExactTokensForTokens(reward - bounty, 0, getReinvestPath(), address(this), block.timestamp);

    // 5. Use add Token strategy to convert all BaseToken without both caller balance and buyback amount to LP tokens.
    baseToken.safeTransfer(address(addStrat), actualBaseTokenBalance() - _callerBalance);
    addStrat.execute(address(0), 0, abi.encode(0));

    // 6. Stake LPs for more rewards
    _bscPoolDeposit();

    // 7. Reset approval
    mdx.safeApprove(address(router), 0);
    address(lpToken).safeApprove(address(bscPool), 0);

    emit Reinvest(_treasuryAccount, reward, bounty);
  }

  /// @dev Work on the given position. Must be called by the operator.
  /// @param id The position ID to work on. Note: This worker implementation ignore ID as the worker has only one position.
  /// @param user The original user that is interacting with the operator.
  /// @param debt The amount of user debt to help the strategy make decisions.
  /// @param data The encoded data, consisting of strategy address and calldata.
  function work(
    uint256 id,
    address user,
    uint256 debt,
    bytes calldata data
  ) external override onlyWhitelistedCaller(user) onlyOperator nonReentrant {
    // 1. reinvest
    _reinvest(treasuryAccount, treasuryBountyBps, actualBaseTokenBalance(), reinvestThreshold);

    // 2. Withdraw all LP tokens.
    _bscPoolWithdraw();

    // 3. Perform the worker strategy; sending LP tokens + BaseToken; expecting LP tokens + BaseToken.
    (address strat, bytes memory ext) = abi.decode(data, (address, bytes));

    if (!okStrats[strat]) revert UnApproveStrategy();

    address(lpToken).safeTransfer(strat, lpToken.balanceOf(address(this)));
    baseToken.safeTransfer(strat, actualBaseTokenBalance());
    IStrategy(strat).execute(user, debt, ext);

    // 4. Add LP tokens back to the farming pool.
    _bscPoolDeposit();

    // 5. Return any remaining BaseToken back to the operator.
    baseToken.safeTransfer(msg.sender, actualBaseTokenBalance());
  }

  /// @dev Return the amount of BaseToken to receive.
  /// @param id The position ID to perform health check. Note: This worker implementation ignore ID as the worker has only one position.
  function health(uint256 id) external view override returns (uint256) {
    uint256 _totalBalanceInUSD = priceHelper.lpToDollar(totalLpBalance, address(lpToken));
    uint256 _tokenPrice = priceHelper.getTokenPrice(address(baseToken));
    return (_totalBalanceInUSD * 1e18) / _tokenPrice;
  }

  /// @dev Liquidate the given position by converting it to BaseToken and return back to caller.
  /// @param id The position ID to perform liquidation
  function liquidate(uint256 id) external override onlyOperator nonReentrant {
    // NOTE: this worker does not allow liquidation
    revert NotAllowToLiquidate();
  }

  /// @dev Some portion of a bounty from reinvest will be sent to beneficialVault to increase the size of totalToken.
  /// @param _beneficialVaultBounty - The amount of MDX to be swapped to BTOKEN & send back to the Vault.
  /// @param _callerBalance - The balance that is owned by the msg.sender within the execution scope.
  function _rewardToBeneficialVault(uint256 _beneficialVaultBounty, uint256 _callerBalance) internal {
    /// 1. read base token from beneficialVault
    address beneficialVaultToken = beneficialVault.token();

    /// 2. swap reward token to beneficialVaultToken
    uint256[] memory amounts = router.swapExactTokensForTokens(
      _beneficialVaultBounty,
      0,
      rewardPath,
      address(this),
      block.number
    );

    /// 3. if beneficialvault token not equal to baseToken regardless of a caller balance, can directly transfer to beneficial vault
    /// otherwise, need to keep it as a buybackAmount,
    /// since beneficial vault is the same as the calling vault, it will think of this reward as a `back` amount to paydebt/ sending back to a position owner
    if (beneficialVaultToken != baseToken) {
      buybackAmount = 0;
      beneficialVaultToken.safeTransfer(address(beneficialVault), beneficialVaultToken.myBalance());
      emit BeneficialVaultTokenBuyback(msg.sender, beneficialVault, amounts[amounts.length - 1]);
    } else {
      buybackAmount = beneficialVaultToken.myBalance() - _callerBalance;
    }
  }

  /// @dev for transfering a buyback amount to the particular beneficial vault
  // this will be triggered when beneficialVaultToken equals to baseToken.
  function _buyback() internal {
    if (buybackAmount == 0) return;
    uint256 _buybackAmount = buybackAmount;
    buybackAmount = 0;
    beneficialVault.token().safeTransfer(address(beneficialVault), _buybackAmount);
    emit BeneficialVaultTokenBuyback(msg.sender, beneficialVault, _buybackAmount);
  }

  /// @dev since buybackAmount variable has been created to collect a buyback balance when during the reinvest within the work method,
  /// thus the actualBaseTokenBalance exists to differentiate an actual base token balance balance without taking buy back amount into account
  function actualBaseTokenBalance() internal view returns (uint256) {
    return baseToken.myBalance() - buybackAmount;
  }

  /// @dev Internal function to stake all outstanding LP tokens to the given position ID.
  function _bscPoolDeposit() internal {
    uint256 balance = lpToken.balanceOf(address(this));
    if (balance > 0) {
      address(lpToken).safeApprove(address(bscPool), type(uint256).max);
      bscPool.deposit(pid, balance);
      totalLpBalance = balance;
      emit BscPoolDeposit(balance);
    }
  }

  /// @dev Internal function to withdraw all outstanding LP tokens.
  function _bscPoolWithdraw() internal {
    uint256 _totalLpBalance = totalLpBalance;
    bscPool.withdraw(pid, _totalLpBalance);
    totalLpBalance = 0;
    emit BscPoolWithdraw(_totalLpBalance);
  }

  /// @dev Return the path that the worker is working on.
  function getPath() external view override returns (address[] memory) {
    address[] memory path = new address[](2);
    path[0] = baseToken;
    path[1] = farmingToken;
    return path;
  }

  /// @dev Return the inverse path.
  function getReversedPath() external view override returns (address[] memory) {
    address[] memory reversePath = new address[](2);
    reversePath[0] = farmingToken;
    reversePath[1] = baseToken;
    return reversePath;
  }

  /// @dev Return the path that the work is using for convert reward token to beneficial vault token.
  function getRewardPath() external view override returns (address[] memory) {
    return rewardPath;
  }

  /// @dev Internal function to get reinvest path. Return route through WBNB if reinvestPath not set.
  function getReinvestPath() public view returns (address[] memory) {
    if (reinvestPath.length != 0) return reinvestPath;
    address[] memory path;
    if (baseToken == wNative) {
      path = new address[](2);
      path[0] = address(mdx);
      path[1] = address(wNative);
    } else {
      path = new address[](3);
      path[0] = address(mdx);
      path[1] = address(wNative);
      path[2] = address(baseToken);
    }
    return path;
  }

  /// @dev Set the reinvest configuration.
  /// @param _reinvestBountyBps - The bounty value to update.
  /// @param _reinvestThreshold - The threshold to update.
  /// @param _reinvestPath - The reinvest path to update.
  function setReinvestConfig(
    uint256 _reinvestBountyBps,
    uint256 _reinvestThreshold,
    address[] calldata _reinvestPath
  ) external onlyOwner {
    if (_reinvestBountyBps > maxReinvestBountyBps) revert ExceedReinvestBounty();

    if (_reinvestPath.length < 2) revert InvalidReinvestPathLength();

    if (_reinvestPath[0] != mdx || _reinvestPath[_reinvestPath.length - 1] != baseToken) revert InvalidReinvestPath();

    reinvestBountyBps = _reinvestBountyBps;
    reinvestThreshold = _reinvestThreshold;
    reinvestPath = _reinvestPath;

    emit SetReinvestConfig(msg.sender, _reinvestBountyBps, _reinvestThreshold, _reinvestPath);
  }

  /// @dev Set PriceHelper contract.
  /// @param _priceHelper - PriceHelper contract to update.
  function setPriceHelper(IPriceHelper _priceHelper) external onlyOwner {
    priceHelper = _priceHelper;
  }

  /// @dev Set Max reinvest reward for set upper limit reinvest bounty.
  /// @param _maxReinvestBountyBps - The max reinvest bounty value to update.
  function setMaxReinvestBountyBps(uint256 _maxReinvestBountyBps) external onlyOwner {
    if (reinvestBountyBps > _maxReinvestBountyBps) revert ExceedReinvestBounty();

    if (_maxReinvestBountyBps > 3000) revert ExceedReinvestBps();

    maxReinvestBountyBps = _maxReinvestBountyBps;

    emit SetMaxReinvestBountyBps(msg.sender, maxReinvestBountyBps);
  }

  /// @dev Set the given strategies' approval status.
  /// @param strats - The strategy addresses.
  /// @param isOk - Whether to approve or unapprove the given strategies.
  function setStrategyOk(address[] calldata strats, bool isOk) external override onlyOwner {
    uint256 len = strats.length;
    for (uint256 idx = 0; idx < len; idx++) {
      okStrats[strats[idx]] = isOk;

      emit SetStrategyOK(msg.sender, strats[idx], isOk);
    }
  }

  /// @dev Set the given address's to be reinvestor.
  /// @param reinvestors - The reinvest bot addresses.
  /// @param isOk - Whether to approve or unapprove the given strategies.
  function setReinvestorOk(address[] calldata reinvestors, bool isOk) external override onlyOwner {
    uint256 len = reinvestors.length;
    for (uint256 idx = 0; idx < len; idx++) {
      okReinvestors[reinvestors[idx]] = isOk;

      emit SetReinvestorOK(msg.sender, reinvestors[idx], isOk);
    }
  }

  /// @dev Set the given address's to be reinvestor.
  /// @param callers - The whitelisted caller's addresses.
  /// @param isOk - Whether to approve or unapprove the given strategies.
  function setWhitelistedCallers(address[] calldata callers, bool isOk) external onlyOwner {
    uint256 len = callers.length;
    for (uint256 idx = 0; idx < len; idx++) {
      whitelistCallers[callers[idx]] = isOk;

      emit SetWhitelistedCallers(msg.sender, callers[idx], isOk);
    }
  }

  /// @dev Set a new reward path. In case that the liquidity of the reward path is changed.
  /// @param _rewardPath The new reward path.
  function setRewardPath(address[] calldata _rewardPath) external onlyOwner {
    if (_rewardPath.length < 2) revert InvalidReinvestPathLength();

    if (_rewardPath[0] != mdx || _rewardPath[_rewardPath.length - 1] != beneficialVault.token())
      revert InvalidReinvestPath();

    rewardPath = _rewardPath;

    emit SetRewardPath(msg.sender, _rewardPath);
  }

  /// @dev Update critical strategy smart contracts. EMERGENCY ONLY. Bad strategies can steal funds.
  /// @param _addStrat - The new add strategy contract.
  function setCriticalStrategies(IStrategy _addStrat) external onlyOwner {
    addStrat = _addStrat;

    emit SetCriticalStrategy(msg.sender, addStrat);
  }

  /// @dev Set treasury configurations.
  /// @param _treasuryAccount - The treasury address to update
  /// @param _treasuryBountyBps - The treasury bounty to update
  function setTreasuryConfig(address _treasuryAccount, uint256 _treasuryBountyBps) external onlyOwner {
    if (_treasuryBountyBps > maxReinvestBountyBps) revert ExceedReinvestBounty();

    treasuryAccount = _treasuryAccount;
    treasuryBountyBps = _treasuryBountyBps;

    emit SetTreasuryConfig(msg.sender, treasuryAccount, treasuryBountyBps);
  }

  /// @dev Set beneficial vault related data including beneficialVaultBountyBps, beneficialVaultAddress, and rewardPath
  /// @param _beneficialVaultBountyBps - The bounty value to update.
  /// @param _beneficialVault - beneficialVaultAddress
  /// @param _rewardPath - reward token path from rewardToken to beneficialVaultToken
  function setBeneficialVaultConfig(
    uint256 _beneficialVaultBountyBps,
    IVault _beneficialVault,
    address[] calldata _rewardPath
  ) external onlyOwner {
    // beneficialVaultBountyBps should not exceeds 100%"
    if (_beneficialVaultBountyBps > 10000) revert ExceedReinvestBps();

    if (_rewardPath.length < 2) revert InvalidReinvestPathLength();

    if (_rewardPath[0] != mdx || _rewardPath[_rewardPath.length - 1] != _beneficialVault.token())
      revert InvalidReinvestPath();

    _buyback();

    beneficialVaultBountyBps = _beneficialVaultBountyBps;
    beneficialVault = _beneficialVault;
    rewardPath = _rewardPath;

    emit SetBeneficialVaultConfig(msg.sender, _beneficialVaultBountyBps, _beneficialVault, _rewardPath);
  }

  /// @dev Withdraw trading all reward.
  /// @param to The address to transfer trading reward to.
  function withdrawTradingRewards(address to) external onlyOwner {
    uint256 mdxBalanceBefore = mdx.myBalance();
    IMdexSwapMining(router.swapMining()).takerWithdraw();
    uint256 mdxBalanceAfter = mdx.myBalance() - mdxBalanceBefore;
    mdx.safeTransfer(to, mdxBalanceAfter);
    emit WithdrawTradingRewards(msg.sender, to, mdxBalanceAfter);
  }

  /// @dev Get all trading rewards.
  /// @param pIds pool ids to retrieve reward amount.
  function getMiningRewards(uint256[] calldata pIds) external view returns (uint256) {
    address swapMiningAddress = router.swapMining();
    uint256 totalReward;
    for (uint256 index = 0; index < pIds.length; index++) {
      (uint256 reward, ) = IMdexSwapMining(swapMiningAddress).getUserReward(pIds[index]);
      totalReward = totalReward - reward;
    }
    return totalReward;
  }
}
