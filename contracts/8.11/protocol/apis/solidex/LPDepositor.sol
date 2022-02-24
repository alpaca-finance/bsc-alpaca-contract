pragma solidity 0.8.11;

import "./Ownable.sol";
import "./SafeERC20.sol";
import "./IERC20.sol";
import "./IBaseV1Voter.sol";
import "./IGauge.sol";
import "./IBribe.sol";
import "./IVotingEscrow.sol";
import "./IFeeDistributor.sol";
import "./ISolidexToken.sol";
import "./ILpDepositToken.sol";
import "./IVeDepositor.sol";

contract LpDepositor is Ownable {
  using SafeERC20 for IERC20;

  // solidly contracts
  IERC20 public immutable SOLID;
  IVotingEscrow public immutable votingEscrow;
  IBaseV1Voter public immutable solidlyVoter;

  // solidex contracts
  ISolidexToken public SEX;
  IVeDepositor public SOLIDsex;
  IFeeDistributor public feeDistributor;
  address public stakingRewards;
  address public tokenWhitelister;
  address public depositTokenImplementation;

  uint256 public tokenID;

  struct Amounts {
    uint256 solid;
    uint256 sex;
  }

  // pool -> gauge
  mapping(address => address) public gaugeForPool;
  // pool -> bribe
  mapping(address => address) public bribeForPool;
  // pool -> solidex deposit token
  mapping(address => address) public tokenForPool;
  // user -> pool -> deposit amount
  mapping(address => mapping(address => uint256)) public userBalances;
  // pool -> total deposit amount
  mapping(address => uint256) public totalBalances;
  // pool -> integrals
  mapping(address => Amounts) public rewardIntegral;
  // user -> pool -> integrals
  mapping(address => mapping(address => Amounts)) public rewardIntegralFor;
  // user -> pool -> claimable
  mapping(address => mapping(address => Amounts)) claimable;

  // internal accounting to track SOLID fees for SOLIDsex stakers and SEX lockers
  uint256 unclaimedSolidBonus;

  event RewardAdded(address indexed rewardsToken, uint256 reward);
  event Deposited(address indexed user, address indexed pool, uint256 amount);
  event Withdrawn(address indexed user, address indexed pool, uint256 amount);
  event RewardPaid(address indexed user, address indexed rewardsToken, uint256 reward);
  event TransferDeposit(address indexed pool, address indexed from, address indexed to, uint256 amount);

  constructor(
    IERC20 _solid,
    IVotingEscrow _votingEscrow,
    IBaseV1Voter _solidlyVoter
  ) {
    SOLID = _solid;
    votingEscrow = _votingEscrow;
    solidlyVoter = _solidlyVoter;
  }

  function setAddresses(
    ISolidexToken _sex,
    IVeDepositor _solidsex,
    address _solidexVoter,
    IFeeDistributor _feeDistributor,
    address _stakingRewards,
    address _tokenWhitelister,
    address _depositToken
  ) external onlyOwner {
    SEX = _sex;
    SOLIDsex = _solidsex;
    feeDistributor = _feeDistributor;
    stakingRewards = _stakingRewards;
    tokenWhitelister = _tokenWhitelister;
    depositTokenImplementation = _depositToken;

    SOLID.approve(address(_solidsex), type(uint256).max);
    _solidsex.approve(address(_feeDistributor), type(uint256).max);
    votingEscrow.setApprovalForAll(_solidexVoter, true);
    votingEscrow.setApprovalForAll(address(_solidsex), true);

    renounceOwnership();
  }

  /**
        @dev Ensure SOLID, SEX and SOLIDsex are whitelisted
     */
  function whitelistProtocolTokens() external {
    require(tokenID != 0, "No initial NFT deposit");
    if (!solidlyVoter.isWhitelisted(address(SOLID))) {
      solidlyVoter.whitelist(address(SOLID), tokenID);
    }
    if (!solidlyVoter.isWhitelisted(address(SOLIDsex))) {
      solidlyVoter.whitelist(address(SOLIDsex), tokenID);
    }
    if (!solidlyVoter.isWhitelisted(address(SEX))) {
      solidlyVoter.whitelist(address(SEX), tokenID);
    }
  }

  /**
        @notice Get pending SOLID and SEX rewards earned by `account`
        @param account Account to query pending rewards for
        @param pools List of pool addresses to query rewards for
        @return pending Array of tuples of (SOLID rewards, SEX rewards) for each item in `pool`
     */
  function pendingRewards(address account, address[] calldata pools) external view returns (Amounts[] memory pending) {
    pending = new Amounts[](pools.length);
    for (uint256 i = 0; i < pools.length; i++) {
      address pool = pools[i];
      pending[i] = claimable[account][pool];
      uint256 balance = userBalances[account][pool];
      if (balance == 0) continue;

      Amounts memory integral = rewardIntegral[pool];
      uint256 total = totalBalances[pool];
      if (total > 0) {
        uint256 delta = IGauge(gaugeForPool[pool]).earned(address(SOLID), address(this));
        delta -= (delta * 15) / 100;
        integral.solid += (1e18 * delta) / total;
        integral.sex += (1e18 * ((delta * 10000) / 42069)) / total;
      }

      Amounts storage integralFor = rewardIntegralFor[account][pool];
      if (integralFor.solid < integral.solid) {
        pending[i].solid += (balance * (integral.solid - integralFor.solid)) / 1e18;
        pending[i].sex += (balance * (integral.sex - integralFor.sex)) / 1e18;
      }
    }
    return pending;
  }

  /**
        @notice Deposit Solidly LP tokens into a gauge via this contract
        @dev Each deposit is also represented via a new ERC20, the address
             is available by querying `tokenForPool(pool)`
        @param pool Address of the pool token to deposit
        @param amount Quantity of tokens to deposit
     */
  function deposit(address pool, uint256 amount) external {
    require(tokenID != 0, "Must lock SOLID first");
    require(amount > 0, "Cannot deposit zero");

    address gauge = gaugeForPool[pool];
    uint256 total = totalBalances[pool];
    uint256 balance = userBalances[msg.sender][pool];

    if (gauge == address(0)) {
      gauge = solidlyVoter.gauges(pool);
      if (gauge == address(0)) {
        gauge = solidlyVoter.createGauge(pool);
      }
      gaugeForPool[pool] = gauge;
      bribeForPool[pool] = solidlyVoter.bribes(gauge);
      tokenForPool[pool] = _deployDepositToken(pool);
      IERC20(pool).approve(gauge, type(uint256).max);
    } else {
      _updateIntegrals(msg.sender, pool, gauge, balance, total);
    }

    IERC20(pool).transferFrom(msg.sender, address(this), amount);
    IGauge(gauge).deposit(amount, tokenID);

    userBalances[msg.sender][pool] = balance + amount;
    totalBalances[pool] = total + amount;
    IDepositToken(tokenForPool[pool]).mint(msg.sender, amount);
    emit Deposited(msg.sender, pool, amount);
  }

  /**
        @notice Withdraw Solidly LP tokens
        @param pool Address of the pool token to withdraw
        @param amount Quantity of tokens to withdraw
     */
  function withdraw(address pool, uint256 amount) external {
    address gauge = gaugeForPool[pool];
    uint256 total = totalBalances[pool];
    uint256 balance = userBalances[msg.sender][pool];

    require(gauge != address(0), "Unknown pool");
    require(amount > 0, "Cannot withdraw zero");
    require(balance >= amount, "Insufficient deposit");

    _updateIntegrals(msg.sender, pool, gauge, balance, total);

    userBalances[msg.sender][pool] = balance - amount;
    totalBalances[pool] = total - amount;

    IDepositToken(tokenForPool[pool]).burn(msg.sender, amount);
    IGauge(gauge).withdraw(amount);
    IERC20(pool).transfer(msg.sender, amount);
    emit Withdrawn(msg.sender, pool, amount);
  }

  /**
        @notice Claim SOLID and SEX rewards earned from depositing LP tokens
        @dev An additional 5% of SEX is also minted for `StakingRewards`
        @param pools List of pools to claim for
     */
  function getReward(address[] calldata pools) external {
    Amounts memory claims;
    for (uint256 i = 0; i < pools.length; i++) {
      address pool = pools[i];
      address gauge = gaugeForPool[pool];
      uint256 total = totalBalances[pool];
      uint256 balance = userBalances[msg.sender][pool];
      _updateIntegrals(msg.sender, pool, gauge, balance, total);
      claims.solid += claimable[msg.sender][pool].solid;
      claims.sex += claimable[msg.sender][pool].sex;
      delete claimable[msg.sender][pool];
    }
    if (claims.solid > 0) {
      SOLID.transfer(msg.sender, claims.solid);
      emit RewardPaid(msg.sender, address(SOLID), claims.solid);
    }
    if (claims.sex > 0) {
      SEX.mint(msg.sender, claims.sex);
      emit RewardPaid(msg.sender, address(SEX), claims.sex);
      // mint an extra 5% for SOLIDsex stakers
      SEX.mint(address(stakingRewards), (claims.sex * 100) / 95 - claims.sex);
      emit RewardPaid(address(stakingRewards), address(SEX), (claims.sex * 100) / 95 - claims.sex);
    }
  }

  /**
        @notice Claim incentive tokens from gauge and/or bribe contracts
                and transfer them to `FeeDistributor`
        @dev This method is unguarded, anyone can claim any reward at any time.
             Claimed tokens are streamed to SEX lockers starting at the beginning
             of the following epoch week.
        @param pool Address of the pool token to claim for
        @param gaugeRewards List of incentive tokens to claim for in the pool's gauge
        @param bribeRewards List of incentive tokens to claim for in the pool's bribe contract
     */
  function claimLockerRewards(
    address pool,
    address[] calldata gaugeRewards,
    address[] calldata bribeRewards
  ) external {
    // claim pending gauge rewards for this pool to update `unclaimedSolidBonus`
    address gauge = gaugeForPool[pool];
    require(gauge != address(0), "Unknown pool");
    _updateIntegrals(address(0), pool, gauge, 0, totalBalances[pool]);

    address distributor = address(feeDistributor);
    uint256 amount;

    // fetch gauge rewards and push to the fee distributor
    if (gaugeRewards.length > 0) {
      IGauge(gauge).getReward(address(this), gaugeRewards);
      for (uint256 i = 0; i < gaugeRewards.length; i++) {
        IERC20 reward = IERC20(gaugeRewards[i]);
        require(reward != SOLID, "!SOLID as gauge reward");
        amount = IERC20(reward).balanceOf(address(this));
        if (amount == 0) continue;
        if (reward.allowance(address(this), distributor) == 0) {
          reward.safeApprove(distributor, type(uint256).max);
        }
        IFeeDistributor(distributor).depositFee(address(reward), amount);
      }
    }

    // fetch bribe rewards and push to the fee distributor
    if (bribeRewards.length > 0) {
      uint256 solidBalance = SOLID.balanceOf(address(this));
      IBribe(bribeForPool[pool]).getReward(tokenID, bribeRewards);
      for (uint256 i = 0; i < bribeRewards.length; i++) {
        IERC20 reward = IERC20(bribeRewards[i]);
        if (reward == SOLID) {
          // when SOLID is received as a bribe, add it to the balance
          // that will be converted to SOLIDsex prior to distribution
          uint256 newBalance = SOLID.balanceOf(address(this));
          unclaimedSolidBonus += newBalance - solidBalance;
          solidBalance = newBalance;
          continue;
        }
        amount = reward.balanceOf(address(this));
        if (amount == 0) continue;
        if (reward.allowance(address(this), distributor) == 0) {
          reward.safeApprove(distributor, type(uint256).max);
        }
        IFeeDistributor(distributor).depositFee(address(reward), amount);
      }
    }

    amount = unclaimedSolidBonus;
    if (amount > 0) {
      // lock 5% of earned SOLID and distribute SOLIDsex to SEX lockers
      uint256 lockAmount = amount / 3;
      SOLIDsex.depositTokens(lockAmount);
      IFeeDistributor(distributor).depositFee(address(SOLIDsex), lockAmount);

      // distribute 10% of earned SOLID to SOLIDsex stakers
      amount -= lockAmount;
      SOLID.transfer(address(stakingRewards), amount);
      unclaimedSolidBonus = 0;
    }
  }

  // External guarded functions - only callable by other protocol contracts ** //

  function transferDeposit(
    address pool,
    address from,
    address to,
    uint256 amount
  ) external returns (bool) {
    require(msg.sender == tokenForPool[pool], "Unauthorized caller");
    require(amount > 0, "Cannot transfer zero");

    address gauge = gaugeForPool[pool];
    uint256 total = totalBalances[pool];

    uint256 balance = userBalances[from][pool];
    require(balance >= amount, "Insufficient balance");
    _updateIntegrals(from, pool, gauge, balance, total);
    userBalances[from][pool] = balance - amount;

    balance = userBalances[to][pool];
    _updateIntegrals(to, pool, gauge, balance, total - amount);
    userBalances[to][pool] = balance + amount;
    emit TransferDeposit(pool, from, to, amount);
    return true;
  }

  function whitelist(address token) external returns (bool) {
    require(msg.sender == tokenWhitelister, "Only whitelister");
    require(votingEscrow.balanceOfNFT(tokenID) > solidlyVoter.listing_fee(), "Not enough veSOLID");
    solidlyVoter.whitelist(token, tokenID);
    return true;
  }

  function onERC721Received(
    address _operator,
    address _from,
    uint256 _tokenID,
    bytes calldata
  ) external returns (bytes4) {
    // VeDepositor transfers the NFT to this contract so this callback is required
    require(_operator == address(SOLIDsex));

    if (tokenID == 0) {
      tokenID = _tokenID;
    }

    return bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
  }

  // ** Internal functions ** //

  function _deployDepositToken(address pool) internal returns (address token) {
    // taken from https://solidity-by-example.org/app/minimal-proxy/
    bytes20 targetBytes = bytes20(depositTokenImplementation);
    assembly {
      let clone := mload(0x40)
      mstore(clone, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
      mstore(add(clone, 0x14), targetBytes)
      mstore(add(clone, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
      token := create(0, clone, 0x37)
    }
    IDepositToken(token).initialize(pool);
    return token;
  }

  function _updateIntegrals(
    address user,
    address pool,
    address gauge,
    uint256 balance,
    uint256 total
  ) internal {
    Amounts memory integral = rewardIntegral[pool];
    if (total > 0) {
      uint256 delta = SOLID.balanceOf(address(this));
      address[] memory rewards = new address[](1);
      rewards[0] = address(SOLID);
      IGauge(gauge).getReward(address(this), rewards);
      delta = SOLID.balanceOf(address(this)) - delta;
      if (delta > 0) {
        uint256 fee = (delta * 15) / 100;
        delta -= fee;
        unclaimedSolidBonus += fee;

        integral.solid += (1e18 * delta) / total;
        integral.sex += (1e18 * ((delta * 10000) / 42069)) / total;
        rewardIntegral[pool] = integral;
      }
    }
    if (user != address(0)) {
      Amounts memory integralFor = rewardIntegralFor[user][pool];
      if (integralFor.solid < integral.solid) {
        Amounts storage claims = claimable[user][pool];
        claims.solid += (balance * (integral.solid - integralFor.solid)) / 1e18;
        claims.sex += (balance * (integral.sex - integralFor.sex)) / 1e18;
        rewardIntegralFor[user][pool] = integral;
      }
    }
  }
}
