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

import "../../interfaces/ISwapFactoryLike.sol";
import "../../interfaces/ISwapPairLike.sol";
import "../../interfaces/IBiswapMasterChef.sol";
import "../../interfaces/ISwapRouter02Like.sol";
import "../../interfaces/IStrategy.sol";
import "../../interfaces/IWorker03.sol";
import "../../interfaces/IDeltaNeutralOracle.sol";
import "../../interfaces/IVault.sol";

import "../../../utils/SafeToken.sol";
import "../../../utils/FixedPointMathLib.sol";

/// @title DeltaNeutralBiswapWorker03 is a BiswapWorker03 worker with reinvest-optimized and beneficial vault buyback functionalities
contract DeltaNeutralBiswapWorker03 is OwnableUpgradeable, ReentrancyGuardUpgradeable, IWorker03 {
  /// @notice Libraries
  using SafeToken for address;
  using FixedPointMathLib for uint256;

  /// @notice Errors
  error DeltaNeutralBiswapWorker03_InvalidRewardToken();
  error DeltaNeutralBiswapWorker03_InvalidTokens();
  error DeltaNeutralBiswapWorker03_UnTrustedPrice();

  error DeltaNeutralBiswapWorker03_NotEOA();
  error DeltaNeutralBiswapWorker03_NotOperator();
  error DeltaNeutralBiswapWorker03_NotReinvestor();
  error DeltaNeutralBiswapWorker03_NotWhitelistedCaller();

  error DeltaNeutralBiswapWorker03_UnApproveStrategy();
  error DeltaNeutralBiswapWorker03_BadTreasuryAccount();
  error DeltaNeutralBiswapWorker03_NotAllowToLiquidate();

  error DeltaNeutralBiswapWorker03_InvalidReinvestPath();
  error DeltaNeutralBiswapWorker03_InvalidReinvestPathLength();
  error DeltaNeutralBiswapWorker03_ExceedReinvestBounty();
  error DeltaNeutralBiswapWorker03_ExceedReinvestBps();

  /// @notice Events
  event Reinvest(address indexed caller, uint256 reward, uint256 bounty);
  event BiswapMasterChefDeposit(uint256 lpAmount);
  event BiswapMasterChefWithdraw(uint256 lpAmount);

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

  /// @dev constants
  uint256 private constant BASIS_POINT = 10000;

  /// @notice Immutable variables
  IBiswapMasterChef public biswapMasterChef;
  ISwapFactoryLike public factory;
  ISwapRouter02Like public router;
  ISwapPairLike public override lpToken;
  IDeltaNeutralOracle public priceOracle;
  address public wNative;
  address public override baseToken;
  address public override farmingToken;
  address public bsw;
  address public operator;
  uint256 public pid;

  /// @notice Mutable state variables
  // mapping between positionId and its share

  mapping(address => bool) public okStrats;
  IStrategy public addStrat;
  uint256 public reinvestBountyBps;
  uint256 public maxReinvestBountyBps;
  mapping(address => bool) public okReinvestors;
  mapping(address => bool) public whitelistCallers;

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
    IBiswapMasterChef _biswapMasterChef,
    ISwapRouter02Like _router,
    uint256 _pid,
    IStrategy _addStrat,
    uint256 _reinvestBountyBps,
    address _treasuryAccount,
    address[] calldata _reinvestPath,
    uint256 _reinvestThreshold,
    IDeltaNeutralOracle _priceOracle
  ) external initializer {
    // 1. Initialized imported library
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();

    // 2. Assign dependency contracts
    operator = _operator;
    wNative = _router.WETH();
    biswapMasterChef = _biswapMasterChef;
    router = _router;
    factory = ISwapFactoryLike(_router.factory());
    priceOracle = _priceOracle;

    // 3. Assign tokens state variables
    baseToken = _baseToken;
    pid = _pid;
    (ERC20Upgradeable _lpToken, , , ) = biswapMasterChef.poolInfo(_pid);
    lpToken = ISwapPairLike(address(_lpToken));
    address token0 = lpToken.token0();
    address token1 = lpToken.token1();
    farmingToken = token0 == baseToken ? token1 : token0;
    bsw = address(biswapMasterChef.BSW());
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
    maxReinvestBountyBps = 2000;

    // 6. Check if critical parameters are config properly
    if (baseToken == bsw) revert DeltaNeutralBiswapWorker03_InvalidRewardToken();

    if (reinvestBountyBps > maxReinvestBountyBps) revert DeltaNeutralBiswapWorker03_ExceedReinvestBounty();

    if (
      !((farmingToken == lpToken.token0() || farmingToken == lpToken.token1()) &&
        (baseToken == lpToken.token0() || baseToken == lpToken.token1()))
    ) revert DeltaNeutralBiswapWorker03_InvalidTokens();

    if (reinvestPath[0] != bsw || reinvestPath[reinvestPath.length - 1] != baseToken)
      revert DeltaNeutralBiswapWorker03_InvalidReinvestPath();
  }

  /// @dev Require that the caller must be an EOA account to avoid flash loans.
  modifier onlyEOA() {
    if (msg.sender != tx.origin) revert DeltaNeutralBiswapWorker03_NotEOA();
    _;
  }

  /// @dev Require that the caller must be the operator.
  modifier onlyOperator() {
    if (msg.sender != operator) revert DeltaNeutralBiswapWorker03_NotOperator();
    _;
  }

  //// @dev Require that the caller must be ok reinvestor.
  modifier onlyReinvestor() {
    if (!okReinvestors[msg.sender]) revert DeltaNeutralBiswapWorker03_NotReinvestor();
    _;
  }

  //// @dev Require that the caller must be whitelisted caller.
  modifier onlyWhitelistedCaller(address user) {
    if (!whitelistCallers[user]) revert DeltaNeutralBiswapWorker03_NotWhitelistedCaller();
    _;
  }

  /// @dev Re-invest whatever this worker has earned back to staked LP tokens.
  function reinvest() external override onlyEOA onlyReinvestor nonReentrant {
    _reinvest(msg.sender, reinvestBountyBps, 0, 0);
    // in case of beneficial vault equals to operator vault, call buyback to transfer some buyback amount back to the vault
    // This can't be called within the _reinvest statement since _reinvest is called within the `work` as well
    _buyback();
  }

  /// @dev Internal method containing reinvest logic
  /// @param _treasuryAccount - The account that the reinvest bounty will be sent.
  /// @param _treasuryBountyBps - The bounty bps deducted from the reinvest reward.
  /// @param _callerBalance - The balance that is owned by the msg.sender within the execution scope.
  /// @param _reinvestThreshold - The threshold to be reinvested if reward pass over.
  function _reinvest(
    address _treasuryAccount,
    uint256 _treasuryBountyBps,
    uint256 _callerBalance,
    uint256 _reinvestThreshold
  ) internal {
    // 1. Withdraw all the rewards. Return if reward <= _reinvestThershold.
    biswapMasterChef.withdraw(pid, 0);
    uint256 reward = bsw.myBalance();
    if (reward <= _reinvestThreshold) return;

    // 2. Approve tokens
    bsw.safeApprove(address(router), type(uint256).max);

    // 3. Send the reward bounty to the _treasuryAccount.
    uint256 bounty = (reward * _treasuryBountyBps) / BASIS_POINT;
    if (bounty > 0) {
      uint256 beneficialVaultBounty = (bounty * beneficialVaultBountyBps) / BASIS_POINT;
      if (beneficialVaultBounty > 0) _rewardToBeneficialVault(beneficialVaultBounty, _callerBalance);
      bsw.safeTransfer(_treasuryAccount, bounty - beneficialVaultBounty);
    }

    // 4. Convert all the remaining rewards to BTOKEN.
    router.swapExactTokensForTokens(reward - bounty, 0, getReinvestPath(), address(this), block.timestamp);

    // 5. Use add Token strategy to convert all BaseToken without both caller balance and buyback amount to LP tokens.
    baseToken.safeTransfer(address(addStrat), actualBaseTokenBalance() - _callerBalance);
    addStrat.execute(address(0), 0, abi.encode(0));

    // 6. Stake LPs for more rewards
    _biswapMasterChefDeposit();

    // 7. Reset approvals
    bsw.safeApprove(address(router), 0);

    emit Reinvest(_treasuryAccount, reward, bounty);
  }

  /// @dev Work on the given position. Must be called by the operator.

  /// @param user The original user that is interacting with the operator.
  /// @param debt The amount of user debt to help the strategy make decisions.
  /// @param data The encoded data, consisting of strategy address and calldata.
  function work(
    uint256, /* id */
    address user,
    uint256 debt,
    bytes calldata data
  ) external override onlyWhitelistedCaller(user) onlyOperator nonReentrant {
    // 1. Withdraw all LP tokens.
    _biswapMasterChefWithdraw();

    // 2. Perform the worker strategy; sending LP tokens + BaseToken; expecting LP tokens + BaseToken.
    (address strat, bytes memory ext) = abi.decode(data, (address, bytes));

    if (!okStrats[strat]) revert DeltaNeutralBiswapWorker03_UnApproveStrategy();
    address(lpToken).safeTransfer(strat, lpToken.balanceOf(address(this)));

    baseToken.safeTransfer(strat, actualBaseTokenBalance());
    IStrategy(strat).execute(user, debt, ext);

    // 3. Add LP tokens back to the farming pool.
    _biswapMasterChefDeposit();

    // 4. Return any remaining BaseToken back to the operator.
    baseToken.safeTransfer(msg.sender, actualBaseTokenBalance());
  }

  /// @dev Return meaningless number to bypass work factor check at vault level
  function health(
    uint256 /* id */
  ) external view override returns (uint256) {
    return 1e30;
  }

  /// @dev Liquidate the given position by converting it to BaseToken and return back to caller.
  function liquidate(
    uint256 /*id*/
  ) external override onlyOperator nonReentrant {
    // NOTE: this worker does not allow liquidation
    revert DeltaNeutralBiswapWorker03_NotAllowToLiquidate();
  }

  /// @dev Some portion of a bounty from reinvest will be sent to beneficialVault to increase the size of totalToken.
  /// @param _beneficialVaultBounty - The amount of BSW to be swapped to BTOKEN & send back to the Vault.
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
      block.timestamp
    );
    /// 3.if beneficialvault token not equal to baseToken regardless of a caller balance, can directly transfer to beneficial vault
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
  function _biswapMasterChefDeposit() internal {
    uint256 balance = lpToken.balanceOf(address(this));
    if (balance > 0) {
      address(lpToken).safeApprove(address(biswapMasterChef), type(uint256).max);

      biswapMasterChef.deposit(pid, balance);
      totalLpBalance = totalLpBalance + balance;

      address(lpToken).safeApprove(address(biswapMasterChef), 0);
      emit BiswapMasterChefDeposit(balance);
    }
  }

  /// @dev Internal function to withdraw all outstanding LP tokens.
  function _biswapMasterChefWithdraw() internal {
    uint256 _totalLpBalance = totalLpBalance;
    biswapMasterChef.withdraw(pid, _totalLpBalance);
    totalLpBalance = 0;
    emit BiswapMasterChefWithdraw(_totalLpBalance);
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

  /// @dev Internal function to get reinvest path.
  /// Return route through WBNB if reinvestPath not set.
  function getReinvestPath() public view returns (address[] memory) {
    if (reinvestPath.length != 0) return reinvestPath;
    address[] memory path;
    if (baseToken == wNative) {
      path = new address[](2);
      path[0] = address(bsw);
      path[1] = address(wNative);
    } else {
      path = new address[](3);
      path[0] = address(bsw);
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
    if (_reinvestBountyBps > maxReinvestBountyBps) revert DeltaNeutralBiswapWorker03_ExceedReinvestBounty();

    if (_reinvestPath.length < 2) revert DeltaNeutralBiswapWorker03_InvalidReinvestPathLength();

    if (_reinvestPath[0] != bsw || _reinvestPath[_reinvestPath.length - 1] != baseToken)
      revert DeltaNeutralBiswapWorker03_InvalidReinvestPath();

    reinvestBountyBps = _reinvestBountyBps;
    reinvestThreshold = _reinvestThreshold;
    reinvestPath = _reinvestPath;

    emit SetReinvestConfig(msg.sender, _reinvestBountyBps, _reinvestThreshold, _reinvestPath);
  }

  /// @dev Set DeltaNeutralOracle contract.
  /// @param _priceOracle - DeltaNeutralOracle contract to update.
  function setPriceOracle(IDeltaNeutralOracle _priceOracle) external onlyOwner {
    priceOracle = _priceOracle;
  }

  /// @dev Set Max reinvest reward for set upper limit reinvest bounty.
  /// @param _maxReinvestBountyBps The max reinvest bounty value to update.
  function setMaxReinvestBountyBps(uint256 _maxReinvestBountyBps) external onlyOwner {
    if (reinvestBountyBps > _maxReinvestBountyBps) revert DeltaNeutralBiswapWorker03_ExceedReinvestBounty();
    // _maxReinvestBountyBps should not exceeds 30%
    if (_maxReinvestBountyBps > 3000) revert DeltaNeutralBiswapWorker03_ExceedReinvestBps();

    maxReinvestBountyBps = _maxReinvestBountyBps;

    emit SetMaxReinvestBountyBps(msg.sender, maxReinvestBountyBps);
  }

  /// @dev Set the given strategies' approval status.
  /// @param strats The strategy addresses.
  /// @param isOk Whether to approve or unapprove the given strategies.
  function setStrategyOk(address[] calldata strats, bool isOk) external override onlyOwner {
    uint256 len = strats.length;
    for (uint256 idx = 0; idx < len; idx++) {
      okStrats[strats[idx]] = isOk;
      emit SetStrategyOK(msg.sender, strats[idx], isOk);
    }
  }

  /// @dev Set the given address's to be reinvestor.
  /// @param reinvestors The reinvest bot addresses.
  /// @param isOk Whether to approve or unapprove the given strategies.
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
    if (_rewardPath.length < 2) revert DeltaNeutralBiswapWorker03_InvalidReinvestPathLength();

    if (_rewardPath[0] != bsw || _rewardPath[_rewardPath.length - 1] != beneficialVault.token())
      revert DeltaNeutralBiswapWorker03_InvalidReinvestPath();

    rewardPath = _rewardPath;

    emit SetRewardPath(msg.sender, _rewardPath);
  }

  /// @dev Update critical strategy smart contracts. EMERGENCY ONLY. Bad strategies can steal funds.
  /// @param _addStrat The new add strategy contract.
  function setCriticalStrategies(IStrategy _addStrat) external onlyOwner {
    addStrat = _addStrat;

    emit SetCriticalStrategy(msg.sender, addStrat);
  }

  /// @dev Set treasury configurations.
  /// @param _treasuryAccount - The treasury address to update
  /// @param _treasuryBountyBps - The treasury bounty to update
  function setTreasuryConfig(address _treasuryAccount, uint256 _treasuryBountyBps) external onlyOwner {
    if (treasuryAccount == address(0)) revert DeltaNeutralBiswapWorker03_BadTreasuryAccount();
    if (_treasuryBountyBps > maxReinvestBountyBps) revert DeltaNeutralBiswapWorker03_ExceedReinvestBounty();

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
    if (_beneficialVaultBountyBps > 10000) revert DeltaNeutralBiswapWorker03_ExceedReinvestBps();

    if (_rewardPath.length < 2) revert DeltaNeutralBiswapWorker03_InvalidReinvestPathLength();

    if (_rewardPath[0] != bsw || _rewardPath[_rewardPath.length - 1] != _beneficialVault.token())
      revert DeltaNeutralBiswapWorker03_InvalidReinvestPath();

    _buyback();

    beneficialVaultBountyBps = _beneficialVaultBountyBps;
    beneficialVault = _beneficialVault;
    rewardPath = _rewardPath;

    emit SetBeneficialVaultConfig(msg.sender, _beneficialVaultBountyBps, _beneficialVault, _rewardPath);
  }
}
