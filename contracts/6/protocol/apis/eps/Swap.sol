// SPDX-License-Identifier: MIT

pragma solidity 0.6.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./OwnerPausable.sol";
import "./SwapUtils.sol";
import "./MathUtils.sol";

/**
 * @title Swap - A StableSwap implementation in solidity.
 * @notice This contract is responsible for custody of closely pegged assets (eg. group of stablecoins)
 * and automatic market making system. Users become an LP (Liquidity Provider) by depositing their tokens
 * in desired ratios for an exchange of the pool token that represents their share of the pool.
 * Users can burn pool tokens and withdraw their share of token(s).
 *
 * Each time a swap between the pooled tokens happens, a set fee incurs which effectively gets
 * distributed to the LPs.
 *
 * In case of emergencies, admin can pause additional deposits, swaps, or single-asset withdraws - which
 * stops the ratio of the tokens in the pool from changing.
 * Users can always withdraw their tokens via multi-asset withdraws.
 *
 * @dev Most of the logic is stored as a library `SwapUtils` for the sake of reducing contract's
 * deployment size.
 */
contract Swap is OwnerPausable, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;
  using MathUtils for uint256;
  using SwapUtils for SwapUtils.Swap;

  // Struct storing data responsible for automatic market maker functionalities. In order to
  // access this data, this contract uses SwapUtils library. For more details, see SwapUtils.sol
  SwapUtils.Swap public swapStorage;

  // Maps token address to an index in the pool. Used to prevent duplicate tokens in the pool.
  // getTokenIndex function also relies on this mapping to retrieve token index.
  mapping(address => uint8) private tokenIndexes;

  /*** EVENTS ***/

  // events replicated from SwapUtils to make the ABI easier for dumb
  // clients
  event TokenSwap(address indexed buyer, uint256 tokensSold, uint256 tokensBought, uint128 soldId, uint128 boughtId);
  event AddLiquidity(
    address indexed provider,
    uint256[] tokenAmounts,
    uint256[] fees,
    uint256 invariant,
    uint256 lpTokenSupply
  );
  event RemoveLiquidity(address indexed provider, uint256[] tokenAmounts, uint256 lpTokenSupply);
  event RemoveLiquidityOne(
    address indexed provider,
    uint256 lpTokenAmount,
    uint256 lpTokenSupply,
    uint256 boughtId,
    uint256 tokensBought
  );
  event RemoveLiquidityImbalance(
    address indexed provider,
    uint256[] tokenAmounts,
    uint256[] fees,
    uint256 invariant,
    uint256 lpTokenSupply
  );
  event NewAdminFee(uint256 newAdminFee);
  event NewSwapFee(uint256 newSwapFee);
  event NewDepositFee(uint256 newDepositFee);
  event NewWithdrawFee(uint256 newWithdrawFee);
  event RampA(uint256 oldA, uint256 newA, uint256 initialTime, uint256 futureTime);
  event StopRampA(uint256 currentA, uint256 time);

  /**
   * @notice Deploys this Swap contract with given parameters as default
   * values. This will also deploy a LPToken that represents users
   * LP position. The owner of LPToken will be this contract - which means
   * only this contract is allowed to mint new tokens.
   *
   * @param _pooledTokens an array of ERC20s this pool will accept
   * @param decimals the decimals to use for each pooled token,
   * eg 8 for WBTC. Cannot be larger than POOL_PRECISION_DECIMALS
   * @param lpTokenName the long-form name of the token to be deployed
   * @param lpTokenSymbol the short symbol for the token to be deployed
   * @param _a the amplification coefficient * n * (n - 1). See the
   * StableSwap paper for details
   * @param _fee default swap fee to be initialized with
   * @param _adminFee default adminFee to be initialized with
   * @param _depositFee default depositFee to be initialized with
   * @param _withdrawFee default withdrawFee to be initialized with
   * @param _devaddr default _devaddr to be initialized with
   */
  constructor(
    IERC20[] memory _pooledTokens,
    uint8[] memory decimals,
    string memory lpTokenName,
    string memory lpTokenSymbol,
    uint256 _a,
    uint256 _fee,
    uint256 _adminFee,
    uint256 _depositFee,
    uint256 _withdrawFee,
    address _devaddr
  ) public OwnerPausable() ReentrancyGuard() {
    // Check _pooledTokens and precisions parameter
    require(_pooledTokens.length > 1, "_pooledTokens.length <= 1");
    require(_pooledTokens.length <= 32, "_pooledTokens.length > 32");
    require(_pooledTokens.length == decimals.length, "_pooledTokens decimals mismatch");

    uint256[] memory precisionMultipliers = new uint256[](decimals.length);

    for (uint8 i = 0; i < _pooledTokens.length; i++) {
      if (i > 0) {
        // Check if index is already used. Check if 0th element is a duplicate.
        require(
          tokenIndexes[address(_pooledTokens[i])] == 0 && _pooledTokens[0] != _pooledTokens[i],
          "Duplicate tokens"
        );
      }
      require(address(_pooledTokens[i]) != address(0), "The 0 address isn't an ERC-20");
      require(decimals[i] <= SwapUtils.POOL_PRECISION_DECIMALS, "Token decimals exceeds max");
      precisionMultipliers[i] = 10**uint256(SwapUtils.POOL_PRECISION_DECIMALS).sub(uint256(decimals[i]));
      tokenIndexes[address(_pooledTokens[i])] = i;
    }

    // Check _a, _fee, _adminFee, _depositFee, _withdrawFee
    require(_a < SwapUtils.MAX_A, "_a exceeds maximum");
    require(_fee < SwapUtils.MAX_SWAP_FEE, "_fee exceeds maximum");
    require(_adminFee < SwapUtils.MAX_ADMIN_FEE, "_adminFee exceeds maximum");
    require(_withdrawFee < SwapUtils.MAX_WITHDRAW_FEE, "_withdrawFee exceeds maximum");
    require(_depositFee < SwapUtils.MAX_DEPOSIT_FEE, "_depositFee exceeds maximum");

    // Initialize swapStorage struct
    swapStorage.lpToken = new LPToken(lpTokenName, lpTokenSymbol, SwapUtils.POOL_PRECISION_DECIMALS);
    swapStorage.pooledTokens = _pooledTokens;
    swapStorage.tokenPrecisionMultipliers = precisionMultipliers;
    swapStorage.balances = new uint256[](_pooledTokens.length);
    swapStorage.initialA = _a.mul(SwapUtils.A_PRECISION);
    swapStorage.futureA = _a.mul(SwapUtils.A_PRECISION);
    swapStorage.initialATime = 0;
    swapStorage.futureATime = 0;
    swapStorage.swapFee = _fee;
    swapStorage.adminFee = _adminFee;
    swapStorage.defaultDepositFee = _depositFee;
    swapStorage.defaultWithdrawFee = _withdrawFee;
    swapStorage.devaddr = _devaddr;
  }

  /*** MODIFIERS ***/

  /**
   * @notice Modifier to check deadline against current timestamp
   * @param deadline latest timestamp to accept this transaction
   */
  modifier deadlineCheck(uint256 deadline) {
    require(block.timestamp <= deadline, "Deadline not met");
    _;
  }

  /*** VIEW FUNCTIONS ***/

  /**
   * @notice Return A, the amplification coefficient * n * (n - 1)
   * @dev See the StableSwap paper for details
   * @return A parameter
   */
  function A() external view returns (uint256) {
    return swapStorage.getA();
  }

  function fees() external view returns (uint256) {
    return swapStorage.getFees();
  }

  /**
   * @notice Return A in its raw precision form
   * @dev See the StableSwap paper for details
   * @return A parameter in its raw precision form
   */
  function getAPrecise() external view returns (uint256) {
    return swapStorage.getAPrecise();
  }

  /**
  * @notice Return address of the pooled token at given index. Reverts if tokenIndex is out of range.
  * @param index the index of the token
  * @return address of the token at given index
  */
  function getToken(uint8 index) public view returns (IERC20) {
    require(index < swapStorage.pooledTokens.length, "Out of range");
    return swapStorage.pooledTokens[index];
  }

  /**
   * @notice Return address of the pooled token at given index. Reverts if tokenIndex is out of range.
   * @param i the index of the token
   * @return address of the token at given index
   */
  function coins(uint128 i) public view returns (address) {
    require(i < swapStorage.pooledTokens.length, "Out of range");
    return address(swapStorage.pooledTokens[i]);
  }

  /**
   * @notice Return the index of the given token address. Reverts if no matching
   * token is found.
   * @param tokenAddress address of the token
   * @return the index of the given token address
   */
  function getTokenIndex(address tokenAddress) external view returns (uint8) {
    uint8 index = tokenIndexes[tokenAddress];
    require(address(getToken(index)) == tokenAddress, "Token does not exist");
    return index;
  }

  /**
   * @notice Return timestamp of last deposit of given address
   * @return timestamp of the last deposit made by the given address
   */
  function getDepositTimestamp(address user) external view returns (uint256) {
    return swapStorage.getDepositTimestamp(user);
  }

  /**
   * @notice Return current balance of the pooled token at given index
   * @param arg0 the index of the token
   * @return current balance of the pooled token at given index with token's native precision
   */
  function balances(uint256 arg0) external view returns (uint256) {
    require(arg0 < swapStorage.pooledTokens.length, "Index out of range");
    return swapStorage.balances[arg0];
  }

  /**
   * @notice Get the virtual price, to help calculate profit
   * @return the virtual price, scaled to the POOL_PRECISION_DECIMALS
   */
  function getVirtualPrice() external view returns (uint256) {
    return swapStorage.getVirtualPrice();
  }

  /**
   * @notice Calculate amount of tokens you receive on swap
   * @param i the token the user wants to sell
   * @param j the token the user wants to buy
   * @param dx the amount of tokens the user wants to sell. If the token charges
   * a fee on transfers, use the amount that gets transferred after the fee.
   * @return amount of tokens the user will receive
   */
  function get_dy(
    uint8 i,
    uint8 j,
    uint256 dx
  ) external view returns (uint256) {
    return swapStorage.calculateSwap(i, j, dx);
  }

  /**
   * @notice A simple method to calculate prices from deposits or
   * withdrawals, excluding fees but including slippage. This is
   * helpful as an input into the various "min" parameters on calls
   * to fight front-running
   *
   * @dev This shouldn't be used outside frontends for user estimates.
   *
   * @param account address that is depositing or withdrawing tokens
   * @param amounts an array of token amounts to deposit or withdrawal,
   * corresponding to pooledTokens. The amount should be in each
   * pooled token's native precision. If a token charges a fee on transfers,
   * use the amount that gets transferred after the fee.
   * @param deposit whether this is a deposit or a withdrawal
   * @return token amount the user will receive
   */
  function calculateTokenAmount(
    address account,
    uint256[] calldata amounts,
    bool deposit
  ) external view returns (uint256) {
    return swapStorage.calculateTokenAmount(account, amounts, deposit);
  }

  /**
   * @notice A simple method to calculate amount of each underlying
   * tokens that is returned upon burning given amount of LP tokens
   * @param account the address that is withdrawing tokens
   * @param amount the amount of LP tokens that would be burned on withdrawal
   * @return array of token balances that the user will receive
   */
  function calculateRemoveLiquidity(address account, uint256 amount) external view returns (uint256[] memory) {
    return swapStorage.calculateRemoveLiquidity(account, amount);
  }

  /**
   * @notice Calculate the amount of underlying token available to withdraw
   * when withdrawing via only single token
   * @param account the address that is withdrawing tokens
   * @param tokenAmount the amount of LP token to burn
   * @param tokenIndex index of which token will be withdrawn
   * @return availableTokenAmount calculated amount of underlying token
   * available to withdraw
   */
  function calculateRemoveLiquidityOneToken(
    address account,
    uint256 tokenAmount,
    uint8 tokenIndex
  ) external view returns (uint256 availableTokenAmount) {
    (availableTokenAmount, ) = swapStorage.calculateWithdrawOneToken(account, tokenAmount, tokenIndex);
  }

  /**
   * @notice Calculate the fee that is applied when the given user withdraws. The withdraw fee
   * decays linearly over period of 4 weeks. For example, depositing and withdrawing right away
   * will charge you the full amount of withdraw fee. But withdrawing after 4 weeks will charge you
   * no additional fees.
   * @dev returned value should be divided by FEE_DENOMINATOR to convert to correct decimals
   * @param user address you want to calculate withdraw fee of
   * @return current withdraw fee of the user
   */
  function calculateCurrentWithdrawFee(address user) external view returns (uint256) {
    return swapStorage.calculateCurrentWithdrawFee(user);
  }

  /**
   * @notice This function reads the accumulated amount of admin fees of the token with given index
   * @param index Index of the pooled token
   * @return admin's token balance in the token's precision
   */
  function getAdminBalance(uint256 index) external view returns (uint256) {
    return swapStorage.getAdminBalance(index);
  }

  /*** STATE MODIFYING FUNCTIONS ***/

  /**
   * @notice Swap two tokens using this pool
   * @param i the token the user wants to swap from
   * @param j the token the user wants to swap to
   * @param dx the amount of tokens the user wants to swap from
   * @param min_dy the min amount the user would like to receive, or revert.
   */
  function swap(
    uint8 i,
    uint8 j,
    uint256 dx,
    uint256 min_dy
  ) external nonReentrant whenNotPaused deadlineCheck(now) {
    swapStorage.swap(i, j, dx, min_dy);
  }

  /**
   * @notice Add liquidity to the pool with given amounts
   * @param uamounts the amounts of each token to add, in their native precision
   * @param min_mint_amount the minimum LP tokens adding this amount of liquidity
   * should mint, otherwise revert. Handy for front-running mitigation
   */
  function addLiquidity(
    uint256[4] calldata uamounts,
    uint256 min_mint_amount
  ) external nonReentrant whenNotPaused deadlineCheck(now) {
    swapStorage.addLiquidity(uamounts, min_mint_amount);
  }

  /**
   * @notice Burn LP tokens to remove liquidity from the pool. Withdraw fee that decays linearly
   * over period of 4 weeks since last deposit will apply.
   * @dev Liquidity can always be removed, even when the pool is paused.
   * @param _amount the amount of LP tokens to burn
   * @param min_uamounts the minimum amounts of each token in the pool
   *        acceptable for this burn. Useful as a front-running mitigation
   * @return amounts of tokens user received
   */
  function removeLiquidity(
    uint256 _amount,
    uint256[4] calldata min_uamounts
  ) external nonReentrant deadlineCheck(now) returns (uint256[] memory) {
    return swapStorage.removeLiquidity(_amount, min_uamounts);
  }

  /**
   * @notice Remove liquidity from the pool all in one token. Withdraw fee that decays linearly
   * over period of 4 weeks since last deposit will apply.
   * @param _token_amount the amount of the token you want to receive
   * @param i the index of the token you want to receive
   * @param min_amount the minimum amount to withdraw, otherwise revert
   */
  function removeLiquidityOneToken(
    uint256 _token_amount,
    uint8 i,
    uint256 min_amount
  ) external nonReentrant whenNotPaused deadlineCheck(now) {
    swapStorage.removeLiquidityOneToken(_token_amount, i, min_amount);
  }

  /**
   * @notice Remove liquidity from the pool, weighted differently than the
   * pool's current balances. Withdraw fee that decays linearly
   * over period of 4 weeks since last deposit will apply.
   * @param uamounts how much of each token to withdraw
   * @param max_burn_amount the max LP token provider is willing to pay to
   * remove liquidity. Useful as a front-running mitigation.
   */
  function removeLiquidityImbalance(
    uint256[4] calldata uamounts,
    uint256 max_burn_amount
  ) external nonReentrant whenNotPaused deadlineCheck(now) {
    swapStorage.removeLiquidityImbalance(uamounts, max_burn_amount);
  }

  /*** ADMIN FUNCTIONS ***/

  /**
   * @notice Updates the user withdraw fee. This function can only be called by
   * the pool token. Should be used to update the withdraw fee on transfer of pool tokens.
   * Transferring your pool token will reset the 4 weeks period. If the recipient is already
   * holding some pool tokens, the withdraw fee will be discounted in respective amounts.
   * @param recipient address of the recipient of pool token
   * @param transferAmount amount of pool token to transfer
   */
  function updateUserWithdrawFee(address recipient, uint256 transferAmount) external {
    require(msg.sender == address(swapStorage.lpToken), "Only callable by pool token");
    swapStorage.updateUserWithdrawFee(recipient, transferAmount);
  }

  /**
   * @notice Withdraw all admin fees to the contract owner
   */
  function withdrawAdminFees() external onlyOwner {
    swapStorage.withdrawAdminFees(owner());
  }

  /**
   * @notice Update the admin fee. Admin fee takes portion of the swap fee.
   * @param newAdminFee new admin fee to be applied on future transactions
   */
  function setAdminFee(uint256 newAdminFee) external onlyOwner {
    swapStorage.setAdminFee(newAdminFee);
  }

  /**
   * @notice Update the swap fee to be applied on swaps
   * @param newSwapFee new swap fee to be applied on future transactions
   */
  function setSwapFee(uint256 newSwapFee) external onlyOwner {
    swapStorage.setSwapFee(newSwapFee);
  }

  /**
   * @notice Update the deposit fee.
   * @param newDepositFee new deposit fee to be applied on future deposits
   */
  function setDefaultDepositFee(uint256 newDepositFee) external onlyOwner {
    swapStorage.setDefaultDepositFee(newDepositFee);
  }

  /**
   * @notice Update the withdraw fee. This fee decays linearly over 4 weeks since
   * user's last deposit.
   * @param newWithdrawFee new withdraw fee to be applied on future deposits
   */
  function setDefaultWithdrawFee(uint256 newWithdrawFee) external onlyOwner {
    swapStorage.setDefaultWithdrawFee(newWithdrawFee);
  }

  /**
   * @notice Start ramping up or down A parameter towards given futureA and futureTime
   * Checks if the change is too rapid, and commits the new A value only when it falls under
   * the limit range.
   * @param futureA the new A to ramp towards
   * @param futureTime timestamp when the new A should be reached
   */
  function rampA(uint256 futureA, uint256 futureTime) external onlyOwner {
    swapStorage.rampA(futureA, futureTime);
  }

  /**
   * @notice Stop ramping A immediately. Reverts if ramp A is already stopped.
   */
  function stopRampA() external onlyOwner {
    swapStorage.stopRampA();
  }

  // Update dev address by the previous dev.
  function setDevAddress(address _devaddr) external onlyOwner {
    swapStorage.setDevAddress(_devaddr);
  }
}
