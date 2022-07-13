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
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "../../interfaces/ISwapFactoryLike.sol";
import "../../interfaces/ISwapPairLike.sol";
import "../../interfaces/IBaseV1Router01.sol";
import "../../interfaces/IStrategy.sol";
import "../../interfaces/IMultiRewardWorker03.sol";
import "../../interfaces/IVault.sol";
import "../../apis/solidex/ILpDepositor.sol";

import "../../../utils/SafeToken.sol";

/// @title SEXWorker03 is a worker with reinvest-optimized and beneficial vault buyback functionalities
contract SEXWorker03 is OwnableUpgradeable, ReentrancyGuardUpgradeable, IMultiRewardWorker03 {
  /// @notice Libraries
  using SafeToken for address;
  /// @notice Events
  event Reinvest(address indexed caller, uint256 reward, uint256 bounty);
  event AddShare(uint256 indexed id, uint256 share);
  event RemoveShare(uint256 indexed id, uint256 share);
  event Liquidate(uint256 indexed id, uint256 wad);
  event SetTreasuryConfig(address indexed caller, address indexed account, uint256 bountyBps);
  event BeneficialVaultTokenBuyback(address indexed caller, IVault indexed beneficialVault, uint256 indexed buyback);
  event SetStrategyOK(address indexed caller, address indexed strategy, bool indexed isOk);
  event SetReinvestorOK(address indexed caller, address indexed reinvestor, bool indexed isOk);
  event SetCriticalStrategy(address indexed caller, IStrategy indexed addStrat, IStrategy indexed liqStrat);
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
  /// @notice Immutable variables
  ILpDepositor public lpDepositor;
  ISwapFactoryLike public factory;
  IBaseV1Router01 public router;
  ISwapPairLike public override lpToken;
  address public wNative;
  address public override baseToken;
  address public override farmingToken;
  address[] public rewardTokens;
  address public operator;
  /// @notice Mutable state variables
  // mapping between positionId and its share
  mapping(uint256 => uint256) public shares;
  mapping(address => bool) public okStrats;
  uint256 public totalShare;
  IStrategy public addStrat;
  IStrategy public liqStrat;
  uint256 public reinvestBountyBps;
  uint256 public maxReinvestBountyBps;
  mapping(address => bool) public okReinvestors;
  uint256 public fee;
  uint256 public feeDenom;
  mapping(address => uint256) public reinvestThresholds;
  mapping(address => address[]) public reinvestPaths;
  address public treasuryAccount;
  uint256 public treasuryBountyBps;
  IVault public beneficialVault;
  uint256 public beneficialVaultBountyBps;
  mapping(address => address[]) public rewardPaths;
  uint256 public buybackAmount;

  function initialize(
    address _operator,
    address _baseToken,
    ILpDepositor _lpDepositor,
    ISwapPairLike _lpToken,
    IBaseV1Router01 _router,
    IStrategy _addStrat,
    IStrategy _liqStrat,
    uint256 _reinvestBountyBps,
    address _treasuryAccount
  ) external initializer {
    // 1. Initialized imported library
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
    // 2. Assign dependency contracts
    operator = _operator;
    wNative = _router.wftm();
    lpDepositor = _lpDepositor;
    router = _router;
    factory = ISwapFactoryLike(_router.factory());
    // 3. Assign tokens state variables
    baseToken = _baseToken;
    lpToken = _lpToken;
    address token0 = lpToken.token0();
    address token1 = lpToken.token1();
    farmingToken = token0 == baseToken ? token1 : token0;
    rewardTokens.push(_lpDepositor.SEX());
    rewardTokens.push(_lpDepositor.SOLID());
    // 4. Assign critical strategy contracts
    addStrat = _addStrat;
    liqStrat = _liqStrat;
    okStrats[address(addStrat)] = true;
    okStrats[address(liqStrat)] = true;
    // 5. Assign Re-invest parameters
    reinvestBountyBps = _reinvestBountyBps;
    treasuryAccount = _treasuryAccount;
    treasuryBountyBps = _reinvestBountyBps;
    maxReinvestBountyBps = 900;
    // 6. Set swap fees
    fee = 9999;
    feeDenom = 10000;
    require(reinvestBountyBps <= maxReinvestBountyBps, "exceeded maxReinvestBountyBps");
    require(
      (farmingToken == lpToken.token0() || farmingToken == lpToken.token1()) &&
        (baseToken == lpToken.token0() || baseToken == lpToken.token1()),
      "bad baseToken or farmingToken"
    );
  }

  /// @dev Require that the caller must be an EOA account to avoid flash loans.
  modifier onlyEOA() {
    require(msg.sender == tx.origin, "not eoa");
    _;
  }
  /// @dev Require that the caller must be the operator.
  modifier onlyOperator() {
    require(msg.sender == operator, "not operator");
    _;
  }
  //// @dev Require that the caller must be ok reinvestor.
  modifier onlyReinvestor() {
    require(okReinvestors[msg.sender], "not reinvestor");
    _;
  }

  /// @dev Return the entitied LP token balance for the given shares.
  /// @param share The number of shares to be converted to LP balance.
  function shareToBalance(uint256 share) public view returns (uint256) {
    if (totalShare == 0) return share; // When there's no share, 1 share = 1 balance.
    uint256 totalBalance = lpDepositor.userBalances(address(this), address(lpToken));
    return (share * totalBalance) / totalShare;
  }

  /// @dev Return the number of shares to receive if staking the given LP tokens.
  /// @param balance the number of LP tokens to be converted to shares.
  function balanceToShare(uint256 balance) public view returns (uint256) {
    if (totalShare == 0) return balance; // When there's no share, 1 share = 1 balance.
    uint256 totalBalance = lpDepositor.userBalances(address(this), address(lpToken));
    return (balance * totalShare) / (totalBalance);
  }

  /// @dev Re-invest whatever this worker has earned back to staked LP tokens.
  function reinvest() external override onlyEOA onlyReinvestor nonReentrant {
    _reinvest(msg.sender, reinvestBountyBps, 0);
    // in case of beneficial vault equals to operator vault, call buyback to transfer some buyback amount back to the vault
    // This can't be called within the _reinvest statement since _reinvest is called within the `work` as well
    _buyback();
  }

  /// @dev Internal method containing reinvest logic
  /// @param _treasuryAccount - The account that the reinvest bounty will be sent.
  /// @param _treasuryBountyBps - The bounty bps deducted from the reinvest reward.
  /// @param _callerBalance - The balance that is owned by the msg.sender within the execution scope.
  function _reinvest(
    address _treasuryAccount,
    uint256 _treasuryBountyBps,
    uint256 _callerBalance
  ) internal {
    // 1. Withdraw all the rewards. Return if reward <= _reinvestThershold.
    address[] memory pools = new address[](1);
    pools[0] = address(lpToken);
    lpDepositor.getReward(pools);
    for (uint256 i = 0; i < rewardTokens.length; i++) {
      address _rewardToken = rewardTokens[i];
      uint256 reward = _rewardToken.myBalance();
      if (reward <= reinvestThresholds[_rewardToken]) return;
      // 2. Approve tokens
      _rewardToken.safeApprove(address(router), type(uint256).max);
      // 3. Send the reward bounty to the _treasuryAccount.
      uint256 bounty = (reward * _treasuryBountyBps) / 10000;
      if (bounty > 0) {
        uint256 beneficialVaultBounty = (bounty * beneficialVaultBountyBps) / 10000;
        if (beneficialVaultBounty > 0)
          _rewardToBeneficialVault(beneficialVaultBounty, _callerBalance, convertToRoute(rewardPaths[_rewardToken]));
        _rewardToken.safeTransfer(_treasuryAccount, bounty - beneficialVaultBounty);
      }
      // 4. Convert all the remaining rewards to BTOKEN.
      router.swapExactTokensForTokens(
        reward - bounty,
        0,
        convertToRoute(getReinvestPath(_rewardToken)),
        address(this),
        block.timestamp
      );
      _rewardToken.safeApprove(address(router), 0);
      emit Reinvest(_treasuryAccount, reward, bounty);
    }
    // 5. Use add Token strategy to convert all BaseToken without both caller balance and buyback amount to LP tokens.
    baseToken.safeTransfer(address(addStrat), actualBaseTokenBalance() - _callerBalance);
    addStrat.execute(address(0), 0, abi.encode(0));
    // 6. Stake LPs for more rewards
    address(lpToken).safeApprove(address(lpDepositor), type(uint256).max);
    lpDepositor.deposit(address(lpToken), lpToken.balanceOf(address(this)));
    // 7. Reset approvals
    address(lpToken).safeApprove(address(lpDepositor), 0);
  }

  /// @dev Work on the given position. Must be called by the operator.
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
    _reinvest(treasuryAccount, treasuryBountyBps, actualBaseTokenBalance());
    // 2. Convert this position back to LP tokens.
    _removeShare(id);
    // 3. Perform the worker strategy; sending LP tokens + BaseToken; expecting LP tokens + BaseToken.
    (address strat, bytes memory ext) = abi.decode(data, (address, bytes));
    require(okStrats[strat], "!approved strategy");
    address(lpToken).safeTransfer(strat, lpToken.balanceOf(address(this)));
    baseToken.safeTransfer(strat, actualBaseTokenBalance());
    IStrategy(strat).execute(user, debt, ext);
    // 4. Add LP tokens back to the farming pool.
    _addShare(id);
    // 5. Return any remaining BaseToken back to the operator.
    baseToken.safeTransfer(msg.sender, actualBaseTokenBalance());
  }

  /// @dev Return maximum output given the input amount and the status of Uniswap reserves.
  /// @param aIn The amount of asset to market sell.
  /// @param rIn the amount of asset in reserve for input.
  /// @param rOut The amount of asset in reserve for output.
  function getMktSellAmount(
    uint256 aIn,
    uint256 rIn,
    uint256 rOut
  ) public view returns (uint256) {
    if (aIn == 0) return 0;
    require(rIn > 0 && rOut > 0, "bad reserve values");
    uint256 aInWithFee = aIn * fee;
    uint256 numerator = aInWithFee * rOut;
    uint256 denominator = (rIn * feeDenom) + aInWithFee;
    return numerator / denominator;
  }

  /// @dev Return the amount of BTOKEN to receive if we are to liquidate the given position.
  /// @param id The position ID to perform health check.
  function health(uint256 id) external view override returns (uint256) {
    // 1. Get the position's LP balance and LP total supply.
    uint256 lpBalance = shareToBalance(shares[id]);
    uint256 lpSupply = lpToken.totalSupply(); // Ignore pending mintFee as it is insignificant
    // 2. Get the pool's total supply of BaseToken and FarmingToken.
    (uint256 r0, uint256 r1, ) = lpToken.getReserves();
    (uint256 totalBaseToken, uint256 totalFarmingToken) = lpToken.token0() == baseToken ? (r0, r1) : (r1, r0);
    // 3. Convert the position's LP tokens to the underlying assets.
    uint256 userBaseToken = (lpBalance * totalBaseToken) / (lpSupply);
    uint256 userFarmingToken = (lpBalance * totalFarmingToken) / lpSupply;
    // 4. Convert all FarmingToken to BaseToken and return total BaseToken.
    return
      getMktSellAmount(userFarmingToken, totalFarmingToken - userFarmingToken, totalBaseToken - userBaseToken) +
      userBaseToken;
  }

  /// @dev Liquidate the given position by converting it to BaseToken and return back to caller.
  /// @param id The position ID to perform liquidation
  function liquidate(uint256 id) external override onlyOperator nonReentrant {
    // 1. Convert the position back to LP tokens and use liquidate strategy.
    _removeShare(id);
    lpToken.transfer(address(liqStrat), lpToken.balanceOf(address(this)));
    liqStrat.execute(address(0), 0, abi.encode(0));
    // 2. Return all available BaseToken back to the operator.
    uint256 liquidatedAmount = actualBaseTokenBalance();
    baseToken.safeTransfer(msg.sender, liquidatedAmount);
    emit Liquidate(id, liquidatedAmount);
  }

  /// @dev Some portion of a bounty from reinvest will be sent to beneficialVault to increase the size of totalToken.
  /// @param _beneficialVaultBounty - The amount of BOO to be swapped to BTOKEN & send back to the Vault.
  /// @param _callerBalance - The balance that is owned by the msg.sender within the execution scope.
  function _rewardToBeneficialVault(
    uint256 _beneficialVaultBounty,
    uint256 _callerBalance,
    IBaseV1Router01.route[] memory _rewardPath
  ) internal {
    /// 1. read base token from beneficialVault
    address beneficialVaultToken = beneficialVault.token();
    /// 2. swap reward token to beneficialVaultToken
    uint256[] memory amounts = router.swapExactTokensForTokens(
      _beneficialVaultBounty,
      0,
      _rewardPath,
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
  function _addShare(uint256 id) internal {
    uint256 balance = lpToken.balanceOf(address(this));
    if (balance > 0) {
      // 1. Approve token to be spend by Solidly's MasterChef
      address(lpToken).safeApprove(address(lpDepositor), type(uint256).max);
      // 2. Convert balance to share
      uint256 share = balanceToShare(balance);
      require(share > 0, "no zero share");
      // 3. Deposit balance to Solidly's MasterChef
      // and also force reward claim, to mimic the behaviour of Solidly's MasterChef
      lpDepositor.deposit(address(lpToken), balance);
      // 4. Update shares
      shares[id] = shares[id] + share;
      totalShare = totalShare + share;
      // 5. Reset approve token
      address(lpToken).safeApprove(address(lpDepositor), 0);
      emit AddShare(id, share);
    }
  }

  /// @dev Internal function to remove shares of the ID and convert to outstanding LP tokens.
  function _removeShare(uint256 id) internal {
    uint256 share = shares[id];
    if (share > 0) {
      uint256 balance = shareToBalance(share);
      lpDepositor.withdraw(address(lpToken), balance);
      totalShare = totalShare - share;
      shares[id] = 0;
      emit RemoveShare(id, share);
    }
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
  function getRewardPath(address _rewardToken) external view override returns (address[] memory) {
    return rewardPaths[_rewardToken];
  }

  /// @dev Internal function to get reinvest path.
  /// Return route through WFTM if reinvestPath not set.
  function getReinvestPath(address _rewardToken) public view returns (address[] memory) {
    if (reinvestPaths[_rewardToken].length != 0) return reinvestPaths[_rewardToken];
    address[] memory path;
    if (baseToken == wNative) {
      path = new address[](2);
      path[0] = address(_rewardToken);
      path[1] = address(wNative);
    } else {
      path = new address[](3);
      path[0] = address(_rewardToken);
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
    address _rewardToken,
    address[] calldata _reinvestPath
  ) external onlyOwner {
    require(_reinvestBountyBps <= maxReinvestBountyBps, "exceeded maxReinvestBountyBps");
    require(_reinvestPath.length >= 2, "_reinvestPath length must >= 2");
    require(
      _reinvestPath[0] == _rewardToken && _reinvestPath[_reinvestPath.length - 1] == baseToken,
      "bad _reinvestPath"
    );
    reinvestBountyBps = _reinvestBountyBps;
    reinvestThresholds[_rewardToken] = _reinvestThreshold;
    reinvestPaths[_rewardToken] = _reinvestPath;
    emit SetReinvestConfig(msg.sender, _reinvestBountyBps, _reinvestThreshold, _reinvestPath);
  }

  /// @dev Set Max reinvest reward for set upper limit reinvest bounty.
  /// @param _maxReinvestBountyBps The max reinvest bounty value to update.
  function setMaxReinvestBountyBps(uint256 _maxReinvestBountyBps) external onlyOwner {
    require(_maxReinvestBountyBps >= reinvestBountyBps, "lower than reinvestBountyBps");
    require(_maxReinvestBountyBps <= 3000, "exceeded 30%");
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

  /// @dev Set a new reward path. In case that the liquidity of the reward path is changed.
  /// @param _rewardPath The new reward path.
  function setRewardPath(address _rewardToken, address[] calldata _rewardPath) external onlyOwner {
    require(_rewardPath.length >= 2, "_rewardPath length must be >= 2");
    require(
      _rewardPath[0] == _rewardToken && _rewardPath[_rewardPath.length - 1] == beneficialVault.token(),
      "bad _rewardPath"
    );
    rewardPaths[_rewardToken] = _rewardPath;
    emit SetRewardPath(msg.sender, _rewardPath);
  }

  /// @dev Update critical strategy smart contracts. EMERGENCY ONLY. Bad strategies can steal funds.
  /// @param _addStrat The new add strategy contract.
  /// @param _liqStrat The new liquidate strategy contract.
  function setCriticalStrategies(IStrategy _addStrat, IStrategy _liqStrat) external onlyOwner {
    addStrat = _addStrat;
    liqStrat = _liqStrat;
    emit SetCriticalStrategy(msg.sender, addStrat, liqStrat);
  }

  /// @dev Set treasury configurations.
  /// @param _treasuryAccount - The treasury address to update
  /// @param _treasuryBountyBps - The treasury bounty to update
  function setTreasuryConfig(address _treasuryAccount, uint256 _treasuryBountyBps) external onlyOwner {
    require(_treasuryAccount != address(0), "bad _treasuryAccount");
    require(_treasuryBountyBps <= maxReinvestBountyBps, "exceeded maxReinvestBountyBps");
    treasuryAccount = _treasuryAccount;
    treasuryBountyBps = _treasuryBountyBps;
    emit SetTreasuryConfig(msg.sender, treasuryAccount, treasuryBountyBps);
  }

  /// @dev Set beneficial vault related data including beneficialVaultBountyBps, beneficialVaultAddress, and rewardPath
  /// @param _beneficialVaultBountyBps - The bounty value to update.
  /// @param _beneficialVault - beneficialVaultAddress
  /// @param _rewardTokens - list of reward token addresses to set
  /// @param _rewardPaths - reward token path from reward token to beneficialVaultToken
  function setBeneficialVaultConfig(
    uint256 _beneficialVaultBountyBps,
    IVault _beneficialVault,
    address[] calldata _rewardTokens,
    address[][] calldata _rewardPaths
  ) external onlyOwner {
    require(_beneficialVaultBountyBps <= 10000, "exceeds 100%");
    require(_rewardTokens.length == _rewardPaths.length, "length mismatch");
    _buyback();
    beneficialVaultBountyBps = _beneficialVaultBountyBps;
    beneficialVault = _beneficialVault;
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      address _rewardToken = _rewardTokens[i];
      address[] memory _rewardPath = _rewardPaths[i];
      require(_rewardPath.length >= 2, "_rewardPath length must >= 2");
      require(
        _rewardPath[0] == _rewardToken && _rewardPath[_rewardPath.length - 1] == _beneficialVault.token(),
        "bad _rewardPath"
      );
      rewardPaths[_rewardToken] = _rewardPath;
      emit SetBeneficialVaultConfig(msg.sender, _beneficialVaultBountyBps, _beneficialVault, _rewardPath);
    }
  }

  function convertToRoute(address[] memory _path) internal pure returns (IBaseV1Router01.route[] memory _routes) {
    _routes = new IBaseV1Router01.route[](_path.length - 1);
    for (uint256 i = 0; i < _path.length - 1; i++) {
      _routes[i].from = _path[i];
      _routes[i].to = _path[i + 1];
      _routes[i].stable = false;
    }
    return _routes;
  }
}
