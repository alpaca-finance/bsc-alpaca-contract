pragma solidity 0.8.11;

import "./IBaseV1Voter.sol";
import "./erc20.sol";

library Math {
  function max(uint256 a, uint256 b) internal pure returns (uint256) {
    return a >= b ? a : b;
  }

  function min(uint256 a, uint256 b) internal pure returns (uint256) {
    return a < b ? a : b;
  }
}

interface ve {
  function isApprovedOrOwner(address, uint256) external view returns (bool);

  function ownerOf(uint256) external view returns (address);
}

// Bribes pay out rewards for a given pool based on the votes that were received from the user (goes hand in hand with BaseV1Gauges.vote())
contract Bribe {
  address public immutable factory; // only factory can modify balances (since it only happens on vote())
  address public immutable _ve;

  uint256 public constant DURATION = 7 days; // rewards are released over 7 days
  uint256 public constant PRECISION = 10**18;

  // default snx staking contract implementation
  mapping(address => uint256) public rewardRate;
  mapping(address => uint256) public periodFinish;
  mapping(address => uint256) public lastUpdateTime;
  mapping(address => uint256) public rewardPerTokenStored;

  mapping(address => mapping(uint256 => uint256)) public lastEarn;
  mapping(address => mapping(uint256 => uint256)) public userRewardPerTokenStored;

  address[] public rewards;
  mapping(address => bool) public isReward;

  uint256 public totalSupply;
  mapping(uint256 => uint256) public balanceOf;

  /// @notice A checkpoint for marking balance
  struct Checkpoint {
    uint256 timestamp;
    uint256 balanceOf;
  }

  /// @notice A checkpoint for marking reward rate
  struct RewardPerTokenCheckpoint {
    uint256 timestamp;
    uint256 rewardPerToken;
  }

  /// @notice A checkpoint for marking supply
  struct SupplyCheckpoint {
    uint256 timestamp;
    uint256 supply;
  }

  /// @notice A record of balance checkpoints for each account, by index
  mapping(uint256 => mapping(uint256 => Checkpoint)) public checkpoints;
  /// @notice The number of checkpoints for each account
  mapping(uint256 => uint256) public numCheckpoints;
  /// @notice A record of balance checkpoints for each token, by index
  mapping(uint256 => SupplyCheckpoint) public supplyCheckpoints;
  /// @notice The number of checkpoints
  uint256 public supplyNumCheckpoints;
  /// @notice A record of balance checkpoints for each token, by index
  mapping(address => mapping(uint256 => RewardPerTokenCheckpoint)) public rewardPerTokenCheckpoints;
  /// @notice The number of checkpoints for each token
  mapping(address => uint256) public rewardPerTokenNumCheckpoints;

  event Deposit(address indexed from, uint256 tokenId, uint256 amount);
  event Withdraw(address indexed from, uint256 tokenId, uint256 amount);
  event NotifyReward(address indexed from, address indexed reward, uint256 amount);
  event ClaimRewards(address indexed from, address indexed reward, uint256 amount);

  constructor(address _factory) {
    factory = _factory;
    _ve = IBaseV1Voter(_factory)._ve();
  }

  // simple re-entrancy check
  uint256 internal _unlocked = 1;
  modifier lock() {
    require(_unlocked == 1);
    _unlocked = 2;
    _;
    _unlocked = 1;
  }

  /**
   * @notice Determine the prior balance for an account as of a block number
   * @dev Block number must be a finalized block or else this function will revert to prevent misinformation.
   * @param tokenId The token of the NFT to check
   * @param timestamp The timestamp to get the balance at
   * @return The balance the account had as of the given block
   */
  function getPriorBalanceIndex(uint256 tokenId, uint256 timestamp) public view returns (uint256) {
    uint256 nCheckpoints = numCheckpoints[tokenId];
    if (nCheckpoints == 0) {
      return 0;
    }

    // First check most recent balance
    if (checkpoints[tokenId][nCheckpoints - 1].timestamp <= timestamp) {
      return (nCheckpoints - 1);
    }

    // Next check implicit zero balance
    if (checkpoints[tokenId][0].timestamp > timestamp) {
      return 0;
    }

    uint256 lower = 0;
    uint256 upper = nCheckpoints - 1;
    while (upper > lower) {
      uint256 center = upper - (upper - lower) / 2; // ceil, avoiding overflow
      Checkpoint memory cp = checkpoints[tokenId][center];
      if (cp.timestamp == timestamp) {
        return center;
      } else if (cp.timestamp < timestamp) {
        lower = center;
      } else {
        upper = center - 1;
      }
    }
    return lower;
  }

  function getPriorSupplyIndex(uint256 timestamp) public view returns (uint256) {
    uint256 nCheckpoints = supplyNumCheckpoints;
    if (nCheckpoints == 0) {
      return 0;
    }

    // First check most recent balance
    if (supplyCheckpoints[nCheckpoints - 1].timestamp <= timestamp) {
      return (nCheckpoints - 1);
    }

    // Next check implicit zero balance
    if (supplyCheckpoints[0].timestamp > timestamp) {
      return 0;
    }

    uint256 lower = 0;
    uint256 upper = nCheckpoints - 1;
    while (upper > lower) {
      uint256 center = upper - (upper - lower) / 2; // ceil, avoiding overflow
      SupplyCheckpoint memory cp = supplyCheckpoints[center];
      if (cp.timestamp == timestamp) {
        return center;
      } else if (cp.timestamp < timestamp) {
        lower = center;
      } else {
        upper = center - 1;
      }
    }
    return lower;
  }

  function getPriorRewardPerToken(address token, uint256 timestamp) public view returns (uint256, uint256) {
    uint256 nCheckpoints = rewardPerTokenNumCheckpoints[token];
    if (nCheckpoints == 0) {
      return (0, 0);
    }

    // First check most recent balance
    if (rewardPerTokenCheckpoints[token][nCheckpoints - 1].timestamp <= timestamp) {
      return (
        rewardPerTokenCheckpoints[token][nCheckpoints - 1].rewardPerToken,
        rewardPerTokenCheckpoints[token][nCheckpoints - 1].timestamp
      );
    }

    // Next check implicit zero balance
    if (rewardPerTokenCheckpoints[token][0].timestamp > timestamp) {
      return (0, 0);
    }

    uint256 lower = 0;
    uint256 upper = nCheckpoints - 1;
    while (upper > lower) {
      uint256 center = upper - (upper - lower) / 2; // ceil, avoiding overflow
      RewardPerTokenCheckpoint memory cp = rewardPerTokenCheckpoints[token][center];
      if (cp.timestamp == timestamp) {
        return (cp.rewardPerToken, cp.timestamp);
      } else if (cp.timestamp < timestamp) {
        lower = center;
      } else {
        upper = center - 1;
      }
    }
    return (rewardPerTokenCheckpoints[token][lower].rewardPerToken, rewardPerTokenCheckpoints[token][lower].timestamp);
  }

  function _writeCheckpoint(uint256 tokenId, uint256 balance) internal {
    uint256 _timestamp = block.timestamp;
    uint256 _nCheckPoints = numCheckpoints[tokenId];

    if (_nCheckPoints > 0 && checkpoints[tokenId][_nCheckPoints - 1].timestamp == _timestamp) {
      checkpoints[tokenId][_nCheckPoints - 1].balanceOf = balance;
    } else {
      checkpoints[tokenId][_nCheckPoints] = Checkpoint(_timestamp, balance);
      numCheckpoints[tokenId] = _nCheckPoints + 1;
    }
  }

  function _writeRewardPerTokenCheckpoint(
    address token,
    uint256 reward,
    uint256 timestamp
  ) internal {
    uint256 _nCheckPoints = rewardPerTokenNumCheckpoints[token];

    if (_nCheckPoints > 0 && rewardPerTokenCheckpoints[token][_nCheckPoints - 1].timestamp == timestamp) {
      rewardPerTokenCheckpoints[token][_nCheckPoints - 1].rewardPerToken = reward;
    } else {
      rewardPerTokenCheckpoints[token][_nCheckPoints] = RewardPerTokenCheckpoint(timestamp, reward);
      rewardPerTokenNumCheckpoints[token] = _nCheckPoints + 1;
    }
  }

  function _writeSupplyCheckpoint() internal {
    uint256 _nCheckPoints = supplyNumCheckpoints;
    uint256 _timestamp = block.timestamp;

    if (_nCheckPoints > 0 && supplyCheckpoints[_nCheckPoints - 1].timestamp == _timestamp) {
      supplyCheckpoints[_nCheckPoints - 1].supply = totalSupply;
    } else {
      supplyCheckpoints[_nCheckPoints] = SupplyCheckpoint(_timestamp, totalSupply);
      supplyNumCheckpoints = _nCheckPoints + 1;
    }
  }

  function rewardsListLength() external view returns (uint256) {
    return rewards.length;
  }

  // returns the last time the reward was modified or periodFinish if the reward has ended
  function lastTimeRewardApplicable(address token) public view returns (uint256) {
    return Math.min(block.timestamp, periodFinish[token]);
  }

  // allows a user to claim rewards for a given token
  function getReward(uint256 tokenId, address[] memory tokens) external lock {
    require(ve(_ve).isApprovedOrOwner(msg.sender, tokenId));
    for (uint256 i = 0; i < tokens.length; i++) {
      (rewardPerTokenStored[tokens[i]], lastUpdateTime[tokens[i]]) = _updateRewardPerToken(tokens[i]);

      uint256 _reward = earned(tokens[i], tokenId);
      lastEarn[tokens[i]][tokenId] = block.timestamp;
      userRewardPerTokenStored[tokens[i]][tokenId] = rewardPerTokenStored[tokens[i]];
      if (_reward > 0) _safeTransfer(tokens[i], msg.sender, _reward);

      emit ClaimRewards(msg.sender, tokens[i], _reward);
    }
  }

  // used by BaseV1Voter to allow batched reward claims
  function getRewardForOwner(uint256 tokenId, address[] memory tokens) external lock {
    require(msg.sender == factory);
    address _owner = ve(_ve).ownerOf(tokenId);
    for (uint256 i = 0; i < tokens.length; i++) {
      (rewardPerTokenStored[tokens[i]], lastUpdateTime[tokens[i]]) = _updateRewardPerToken(tokens[i]);

      uint256 _reward = earned(tokens[i], tokenId);
      lastEarn[tokens[i]][tokenId] = block.timestamp;
      userRewardPerTokenStored[tokens[i]][tokenId] = rewardPerTokenStored[tokens[i]];
      if (_reward > 0) _safeTransfer(tokens[i], _owner, _reward);

      emit ClaimRewards(_owner, tokens[i], _reward);
    }
  }

  function rewardPerToken(address token) public view returns (uint256) {
    if (totalSupply == 0) {
      return rewardPerTokenStored[token];
    }
    return
      rewardPerTokenStored[token] +
      (((lastTimeRewardApplicable(token) - Math.min(lastUpdateTime[token], periodFinish[token])) *
        rewardRate[token] *
        PRECISION) / totalSupply);
  }

  function batchRewardPerToken(address token, uint256 maxRuns) external {
    (rewardPerTokenStored[token], lastUpdateTime[token]) = _batchRewardPerToken(token, maxRuns);
  }

  function _batchRewardPerToken(address token, uint256 maxRuns) internal returns (uint256, uint256) {
    uint256 _startTimestamp = lastUpdateTime[token];
    uint256 reward = rewardPerTokenStored[token];

    if (supplyNumCheckpoints == 0) {
      return (reward, _startTimestamp);
    }

    if (rewardRate[token] == 0) {
      return (reward, block.timestamp);
    }

    uint256 _startIndex = getPriorSupplyIndex(_startTimestamp);
    uint256 _endIndex = Math.min(supplyNumCheckpoints - 1, maxRuns);

    for (uint256 i = _startIndex; i < _endIndex; i++) {
      SupplyCheckpoint memory sp0 = supplyCheckpoints[i];
      if (sp0.supply > 0) {
        SupplyCheckpoint memory sp1 = supplyCheckpoints[i + 1];
        (uint256 _reward, uint256 endTime) = _calcRewardPerToken(
          token,
          sp1.timestamp,
          sp0.timestamp,
          sp0.supply,
          _startTimestamp
        );
        reward += _reward;
        _writeRewardPerTokenCheckpoint(token, reward, endTime);
        _startTimestamp = endTime;
      }
    }

    return (reward, _startTimestamp);
  }

  function _calcRewardPerToken(
    address token,
    uint256 timestamp1,
    uint256 timestamp0,
    uint256 supply,
    uint256 startTimestamp
  ) internal view returns (uint256, uint256) {
    uint256 endTime = Math.max(timestamp1, startTimestamp);
    return (
      (((Math.min(endTime, periodFinish[token]) - Math.min(Math.max(timestamp0, startTimestamp), periodFinish[token])) *
        rewardRate[token] *
        PRECISION) / supply),
      endTime
    );
  }

  function _updateRewardPerToken(address token) internal returns (uint256, uint256) {
    uint256 _startTimestamp = lastUpdateTime[token];
    uint256 reward = rewardPerTokenStored[token];

    if (supplyNumCheckpoints == 0) {
      return (reward, _startTimestamp);
    }

    if (rewardRate[token] == 0) {
      return (reward, block.timestamp);
    }

    uint256 _startIndex = getPriorSupplyIndex(_startTimestamp);
    uint256 _endIndex = supplyNumCheckpoints - 1;

    if (_endIndex - _startIndex > 1) {
      for (uint256 i = _startIndex; i < _endIndex - 1; i++) {
        SupplyCheckpoint memory sp0 = supplyCheckpoints[i];
        if (sp0.supply > 0) {
          SupplyCheckpoint memory sp1 = supplyCheckpoints[i + 1];
          (uint256 _reward, uint256 _endTime) = _calcRewardPerToken(
            token,
            sp1.timestamp,
            sp0.timestamp,
            sp0.supply,
            _startTimestamp
          );
          reward += _reward;
          _writeRewardPerTokenCheckpoint(token, reward, _endTime);
          _startTimestamp = _endTime;
        }
      }
    }

    SupplyCheckpoint memory sp = supplyCheckpoints[_endIndex];
    if (sp.supply > 0) {
      (uint256 _reward, ) = _calcRewardPerToken(
        token,
        lastTimeRewardApplicable(token),
        Math.max(sp.timestamp, _startTimestamp),
        sp.supply,
        _startTimestamp
      );
      reward += _reward;
      _writeRewardPerTokenCheckpoint(token, reward, block.timestamp);
      _startTimestamp = block.timestamp;
    }

    return (reward, _startTimestamp);
  }

  function earned(address token, uint256 tokenId) public view returns (uint256) {
    uint256 _startTimestamp = Math.max(lastEarn[token][tokenId], rewardPerTokenCheckpoints[token][0].timestamp);
    if (numCheckpoints[tokenId] == 0) {
      return 0;
    }

    uint256 _startIndex = getPriorBalanceIndex(tokenId, _startTimestamp);
    uint256 _endIndex = numCheckpoints[tokenId] - 1;

    uint256 reward = 0;

    if (_endIndex - _startIndex > 1) {
      for (uint256 i = _startIndex; i < _endIndex - 1; i++) {
        Checkpoint memory cp0 = checkpoints[tokenId][i];
        Checkpoint memory cp1 = checkpoints[tokenId][i + 1];
        (uint256 _rewardPerTokenStored0, ) = getPriorRewardPerToken(token, cp0.timestamp);
        (uint256 _rewardPerTokenStored1, ) = getPriorRewardPerToken(token, cp1.timestamp);
        reward += (cp0.balanceOf * (_rewardPerTokenStored1 - _rewardPerTokenStored0)) / PRECISION;
      }
    }

    Checkpoint memory cp = checkpoints[tokenId][_endIndex];
    (uint256 _rewardPerTokenStored, ) = getPriorRewardPerToken(token, cp.timestamp);
    reward +=
      (cp.balanceOf *
        (rewardPerToken(token) - Math.max(_rewardPerTokenStored, userRewardPerTokenStored[token][tokenId]))) /
      PRECISION;

    return reward;
  }

  // This is an external function, but internal notation is used since it can only be called "internally" from BaseV1Gauges
  function _deposit(uint256 amount, uint256 tokenId) external {
    require(msg.sender == factory);
    totalSupply += amount;
    balanceOf[tokenId] += amount;

    _writeCheckpoint(tokenId, balanceOf[tokenId]);
    _writeSupplyCheckpoint();

    emit Deposit(msg.sender, tokenId, amount);
  }

  function _withdraw(uint256 amount, uint256 tokenId) external {
    require(msg.sender == factory);
    totalSupply -= amount;
    balanceOf[tokenId] -= amount;

    _writeCheckpoint(tokenId, balanceOf[tokenId]);
    _writeSupplyCheckpoint();

    emit Withdraw(msg.sender, tokenId, amount);
  }

  function left(address token) external view returns (uint256) {
    if (block.timestamp >= periodFinish[token]) return 0;
    uint256 _remaining = periodFinish[token] - block.timestamp;
    return _remaining * rewardRate[token];
  }

  // used to notify a gauge/bribe of a given reward, this can create griefing attacks by extending rewards
  function notifyRewardAmount(address token, uint256 amount) external lock {
    require(amount > 0);
    if (rewardRate[token] == 0) _writeRewardPerTokenCheckpoint(token, 0, block.timestamp);
    (rewardPerTokenStored[token], lastUpdateTime[token]) = _updateRewardPerToken(token);

    if (block.timestamp >= periodFinish[token]) {
      _safeTransferFrom(token, msg.sender, address(this), amount);
      rewardRate[token] = amount / DURATION;
    } else {
      uint256 _remaining = periodFinish[token] - block.timestamp;
      uint256 _left = _remaining * rewardRate[token];
      require(amount > _left);
      _safeTransferFrom(token, msg.sender, address(this), amount);
      rewardRate[token] = (amount + _left) / DURATION;
    }
    require(rewardRate[token] > 0);
    uint256 balance = erc20(token).balanceOf(address(this));
    require(rewardRate[token] <= balance / DURATION, "Provided reward too high");
    periodFinish[token] = block.timestamp + DURATION;
    if (!isReward[token]) {
      isReward[token] = true;
      rewards.push(token);
    }

    emit NotifyReward(msg.sender, token, amount);
  }

  function _safeTransfer(
    address token,
    address to,
    uint256 value
  ) internal {
    require(token.code.length > 0);
    (bool success, bytes memory data) = token.call(abi.encodeWithSelector(erc20.transfer.selector, to, value));
    require(success && (data.length == 0 || abi.decode(data, (bool))));
  }

  function _safeTransferFrom(
    address token,
    address from,
    address to,
    uint256 value
  ) internal {
    require(token.code.length > 0);
    (bool success, bytes memory data) = token.call(
      abi.encodeWithSelector(erc20.transferFrom.selector, from, to, value)
    );
    require(success && (data.length == 0 || abi.decode(data, (bool))));
  }
}
