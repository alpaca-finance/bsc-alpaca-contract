pragma solidity >=0.5.0 <0.7.0;

import "./IMdexFactory.sol";
import "./IMdx.sol";
import "./IMdexPair.sol";
import "./IOracle.sol";
import "./EnumerableSet.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract SwapMining is Ownable {
  using SafeMath for uint256;
  using EnumerableSet for EnumerableSet.AddressSet;
  EnumerableSet.AddressSet private _whitelist;

  // MDX tokens created per block
  uint256 public mdxPerBlock;
  // The block number when MDX mining starts.
  uint256 public startBlock;
  // How many blocks are halved
  uint256 public halvingPeriod = 1670400;
  // Total allocation points
  uint256 public totalAllocPoint = 0;
  IOracle public oracle;
  // router address
  address public router;
  // factory address
  IMdexFactory public factory;
  // mdx token address
  IMdx public mdx;
  // Calculate price based on BUSD-T
  address public targetToken;
  // pair corresponding pid
  mapping(address => uint256) public pairOfPid;

  constructor(
    IMdx _mdx,
    IMdexFactory _factory,
    IOracle _oracle,
    address _router,
    address _targetToken,
    uint256 _mdxPerBlock,
    uint256 _startBlock
  ) public {
    mdx = _mdx;
    factory = _factory;
    oracle = _oracle;
    router = _router;
    targetToken = _targetToken;
    mdxPerBlock = _mdxPerBlock;
    startBlock = _startBlock;
  }

  struct UserInfo {
    uint256 quantity; // How many LP tokens the user has provided
    uint256 blockNumber; // Last transaction block
  }

  struct PoolInfo {
    address pair; // Trading pairs that can be mined
    uint256 quantity; // Current amount of LPs
    uint256 totalQuantity; // All quantity
    uint256 allocPoint; // How many allocation points assigned to this pool
    uint256 allocMdxAmount; // How many MDXs
    uint256 lastRewardBlock; // Last transaction block
  }

  PoolInfo[] public poolInfo;
  mapping(uint256 => mapping(address => UserInfo)) public userInfo;

  function poolLength() public view returns (uint256) {
    return poolInfo.length;
  }

  function addPair(
    uint256 _allocPoint,
    address _pair,
    bool _withUpdate
  ) public onlyOwner {
    require(_pair != address(0), "_pair is the zero address");
    if (_withUpdate) {
      massMintPools();
    }
    uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
    totalAllocPoint = totalAllocPoint.add(_allocPoint);
    poolInfo.push(
      PoolInfo({
        pair: _pair,
        quantity: 0,
        totalQuantity: 0,
        allocPoint: _allocPoint,
        allocMdxAmount: 0,
        lastRewardBlock: lastRewardBlock
      })
    );
    pairOfPid[_pair] = poolLength() - 1;
  }

  // Update the allocPoint of the pool
  function setPair(
    uint256 _pid,
    uint256 _allocPoint,
    bool _withUpdate
  ) public onlyOwner {
    if (_withUpdate) {
      massMintPools();
    }
    totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(_allocPoint);
    poolInfo[_pid].allocPoint = _allocPoint;
  }

  // Set the number of mdx produced by each block
  function setMdxPerBlock(uint256 _newPerBlock) public onlyOwner {
    massMintPools();
    mdxPerBlock = _newPerBlock;
  }

  // Only tokens in the whitelist can be mined MDX
  function addWhitelist(address _addToken) public onlyOwner returns (bool) {
    require(_addToken != address(0), "SwapMining: token is the zero address");
    return EnumerableSet.add(_whitelist, _addToken);
  }

  function delWhitelist(address _delToken) public onlyOwner returns (bool) {
    require(_delToken != address(0), "SwapMining: token is the zero address");
    return EnumerableSet.remove(_whitelist, _delToken);
  }

  function getWhitelistLength() public view returns (uint256) {
    return EnumerableSet.length(_whitelist);
  }

  function isWhitelist(address _token) public view returns (bool) {
    return EnumerableSet.contains(_whitelist, _token);
  }

  function getWhitelist(uint256 _index) public view returns (address) {
    require(_index <= getWhitelistLength() - 1, "SwapMining: index out of bounds");
    return EnumerableSet.at(_whitelist, _index);
  }

  function setHalvingPeriod(uint256 _block) public onlyOwner {
    halvingPeriod = _block;
  }

  function setRouter(address newRouter) public onlyOwner {
    require(newRouter != address(0), "SwapMining: new router is the zero address");
    router = newRouter;
  }

  function setOracle(IOracle _oracle) public onlyOwner {
    require(address(_oracle) != address(0), "SwapMining: new oracle is the zero address");
    oracle = _oracle;
  }

  // At what phase
  function phase(uint256 blockNumber) public view returns (uint256) {
    if (halvingPeriod == 0) {
      return 0;
    }
    if (blockNumber > startBlock) {
      return (blockNumber.sub(startBlock).sub(1)).div(halvingPeriod);
    }
    return 0;
  }

  function phase() public view returns (uint256) {
    return phase(block.number);
  }

  function reward(uint256 blockNumber) public view returns (uint256) {
    uint256 _phase = phase(blockNumber);
    return mdxPerBlock.div(2**_phase);
  }

  function reward() public view returns (uint256) {
    return reward(block.number);
  }

  // Rewards for the current block
  function getMdxReward(uint256 _lastRewardBlock) public view returns (uint256) {
    require(_lastRewardBlock <= block.number, "SwapMining: must little than the current block number");
    uint256 blockReward = 0;
    uint256 n = phase(_lastRewardBlock);
    uint256 m = phase(block.number);
    // If it crosses the cycle
    while (n < m) {
      n++;
      // Get the last block of the previous cycle
      uint256 r = n.mul(halvingPeriod).add(startBlock);
      // Get rewards from previous periods
      blockReward = blockReward.add((r.sub(_lastRewardBlock)).mul(reward(r)));
      _lastRewardBlock = r;
    }
    blockReward = blockReward.add((block.number.sub(_lastRewardBlock)).mul(reward(block.number)));
    return blockReward;
  }

  // Update all pools Called when updating allocPoint and setting new blocks
  function massMintPools() public {
    uint256 length = poolInfo.length;
    for (uint256 pid = 0; pid < length; ++pid) {
      mint(pid);
    }
  }

  function mint(uint256 _pid) public returns (bool) {
    PoolInfo storage pool = poolInfo[_pid];
    if (block.number <= pool.lastRewardBlock) {
      return false;
    }
    uint256 blockReward = getMdxReward(pool.lastRewardBlock);
    if (blockReward <= 0) {
      return false;
    }
    // Calculate the rewards obtained by the pool based on the allocPoint
    uint256 mdxReward = blockReward.mul(pool.allocPoint).div(totalAllocPoint);
    mdx.mint(address(this), mdxReward);
    // Increase the number of tokens in the current pool
    pool.allocMdxAmount = pool.allocMdxAmount.add(mdxReward);
    pool.lastRewardBlock = block.number;
    return true;
  }

  // swapMining only router
  function swap(
    address account,
    address input,
    address output,
    uint256 amount
  ) public onlyRouter returns (bool) {
    require(account != address(0), "SwapMining: taker swap account is the zero address");
    require(input != address(0), "SwapMining: taker swap input is the zero address");
    require(output != address(0), "SwapMining: taker swap output is the zero address");

    if (poolLength() <= 0) {
      return false;
    }

    if (!isWhitelist(input) || !isWhitelist(output)) {
      return false;
    }

    address pair = IMdexFactory(factory).pairFor(input, output);

    PoolInfo storage pool = poolInfo[pairOfPid[pair]];
    // If it does not exist or the allocPoint is 0 then return
    if (pool.pair != pair || pool.allocPoint <= 0) {
      return false;
    }

    uint256 quantity = getQuantity(output, amount, targetToken);
    if (quantity <= 0) {
      return false;
    }

    mint(pairOfPid[pair]);

    pool.quantity = pool.quantity.add(quantity);
    pool.totalQuantity = pool.totalQuantity.add(quantity);
    UserInfo storage user = userInfo[pairOfPid[pair]][account];
    user.quantity = user.quantity.add(quantity);
    user.blockNumber = block.number;
    return true;
  }

  // The user withdraws all the transaction rewards of the pool
  function takerWithdraw() public {
    uint256 userSub;
    uint256 length = poolInfo.length;
    for (uint256 pid = 0; pid < length; ++pid) {
      PoolInfo storage pool = poolInfo[pid];
      UserInfo storage user = userInfo[pid][msg.sender];
      if (user.quantity > 0) {
        mint(pid);
        // The reward held by the user in this pool
        uint256 userReward = pool.allocMdxAmount.mul(user.quantity).div(pool.quantity);
        pool.quantity = pool.quantity.sub(user.quantity);
        pool.allocMdxAmount = pool.allocMdxAmount.sub(userReward);
        user.quantity = 0;
        user.blockNumber = block.number;
        userSub = userSub.add(userReward);
      }
    }
    if (userSub <= 0) {
      return;
    }
    mdx.transfer(msg.sender, userSub);
  }

  // Get rewards from users in the current pool
  function getUserReward(uint256 _pid) public view returns (uint256, uint256) {
    require(_pid <= poolInfo.length - 1, "SwapMining: Not find this pool");
    uint256 userSub;
    PoolInfo memory pool = poolInfo[_pid];
    UserInfo memory user = userInfo[_pid][msg.sender];
    if (user.quantity > 0) {
      uint256 blockReward = getMdxReward(pool.lastRewardBlock);
      uint256 mdxReward = blockReward.mul(pool.allocPoint).div(totalAllocPoint);
      userSub = userSub.add((pool.allocMdxAmount.add(mdxReward)).mul(user.quantity).div(pool.quantity));
    }
    //Mdx available to users, User transaction amount
    return (userSub, user.quantity);
  }

  // Get details of the pool
  function getPoolInfo(uint256 _pid)
    public
    view
    returns (
      address,
      address,
      uint256,
      uint256,
      uint256,
      uint256
    )
  {
    require(_pid <= poolInfo.length - 1, "SwapMining: Not find this pool");
    PoolInfo memory pool = poolInfo[_pid];
    address token0 = IMdexPair(pool.pair).token0();
    address token1 = IMdexPair(pool.pair).token1();
    uint256 mdxAmount = pool.allocMdxAmount;
    uint256 blockReward = getMdxReward(pool.lastRewardBlock);
    uint256 mdxReward = blockReward.mul(pool.allocPoint).div(totalAllocPoint);
    mdxAmount = mdxAmount.add(mdxReward);
    //token0,token1,Pool remaining reward,Total /Current transaction volume of the pool
    return (token0, token1, mdxAmount, pool.totalQuantity, pool.quantity, pool.allocPoint);
  }

  modifier onlyRouter() {
    require(msg.sender == router, "SwapMining: caller is not the router");
    _;
  }

  function getQuantity(
    address outputToken,
    uint256 outputAmount,
    address anchorToken
  ) public view returns (uint256) {
    uint256 quantity = 0;
    if (outputToken == anchorToken) {
      quantity = outputAmount;
    } else if (IMdexFactory(factory).getPair(outputToken, anchorToken) != address(0)) {
      quantity = IOracle(oracle).consult(outputToken, outputAmount, anchorToken);
    } else {
      uint256 length = getWhitelistLength();
      for (uint256 index = 0; index < length; index++) {
        address intermediate = getWhitelist(index);
        if (
          IMdexFactory(factory).getPair(outputToken, intermediate) != address(0) &&
          IMdexFactory(factory).getPair(intermediate, anchorToken) != address(0)
        ) {
          uint256 interQuantity = IOracle(oracle).consult(outputToken, outputAmount, intermediate);
          quantity = IOracle(oracle).consult(intermediate, interQuantity, anchorToken);
          break;
        }
      }
    }
    return quantity;
  }
}
