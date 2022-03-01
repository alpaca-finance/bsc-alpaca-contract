// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.11;

/*

@title Curve Fee Distribution modified for ve(3,3) emissions
@author Curve Finance, andrecronje
@license MIT

*/

interface erc20 {
  function totalSupply() external view returns (uint256);

  function transfer(address recipient, uint256 amount) external returns (bool);

  function decimals() external view returns (uint8);

  function symbol() external view returns (string memory);

  function balanceOf(address) external view returns (uint256);

  function transferFrom(
    address sender,
    address recipient,
    uint256 amount
  ) external returns (bool);

  function approve(address spender, uint256 value) external returns (bool);
}

library Math {
  function min(uint256 a, uint256 b) internal pure returns (uint256) {
    return a < b ? a : b;
  }

  function max(uint256 a, uint256 b) internal pure returns (uint256) {
    return a >= b ? a : b;
  }
}

interface VotingEscrow {
  struct Point {
    int128 bias;
    int128 slope; // # -dweight / dt
    uint256 ts;
    uint256 blk; // block
  }

  function user_point_epoch(uint256 tokenId) external view returns (uint256);

  function epoch() external view returns (uint256);

  function user_point_history(uint256 tokenId, uint256 loc) external view returns (Point memory);

  function point_history(uint256 loc) external view returns (Point memory);

  function checkpoint() external;

  function deposit_for(uint256 tokenId, uint256 value) external;

  function token() external view returns (address);
}

contract VeDist {
  event CheckpointToken(uint256 time, uint256 tokens);

  event Claimed(uint256 tokenId, uint256 amount, uint256 claim_epoch, uint256 max_epoch);

  uint256 constant WEEK = 7 * 86400;

  uint256 public start_time;
  uint256 public time_cursor;
  mapping(uint256 => uint256) public time_cursor_of;
  mapping(uint256 => uint256) public user_epoch_of;

  uint256 public last_token_time;
  uint256[1000000000000000] public tokens_per_week;

  address public voting_escrow;
  address public token;
  uint256 public token_last_balance;

  uint256[1000000000000000] public ve_supply;

  address public depositor;

  constructor(address _voting_escrow) {
    uint256 _t = (block.timestamp / WEEK) * WEEK;
    start_time = _t;
    last_token_time = _t;
    time_cursor = _t;
    address _token = VotingEscrow(_voting_escrow).token();
    token = _token;
    voting_escrow = _voting_escrow;
    depositor = msg.sender;
    erc20(_token).approve(_voting_escrow, type(uint256).max);
  }

  function timestamp() external view returns (uint256) {
    return (block.timestamp / WEEK) * WEEK;
  }

  function _checkpoint_token() internal {
    uint256 token_balance = erc20(token).balanceOf(address(this));
    uint256 to_distribute = token_balance - token_last_balance;
    token_last_balance = token_balance;

    uint256 t = last_token_time;
    uint256 since_last = block.timestamp - t;
    last_token_time = block.timestamp;
    uint256 this_week = (t / WEEK) * WEEK;
    uint256 next_week = 0;

    for (uint256 i = 0; i < 20; i++) {
      next_week = this_week + WEEK;
      if (block.timestamp < next_week) {
        if (since_last == 0 && block.timestamp == t) {
          tokens_per_week[this_week] += to_distribute;
        } else {
          tokens_per_week[this_week] += (to_distribute * (block.timestamp - t)) / since_last;
        }
        break;
      } else {
        if (since_last == 0 && next_week == t) {
          tokens_per_week[this_week] += to_distribute;
        } else {
          tokens_per_week[this_week] += (to_distribute * (next_week - t)) / since_last;
        }
      }
      t = next_week;
      this_week = next_week;
    }
    emit CheckpointToken(block.timestamp, to_distribute);
  }

  function checkpoint_token() external {
    assert(msg.sender == depositor);
    _checkpoint_token();
  }

  function _find_timestamp_epoch(address ve, uint256 _timestamp) internal view returns (uint256) {
    uint256 _min = 0;
    uint256 _max = VotingEscrow(ve).epoch();
    for (uint256 i = 0; i < 128; i++) {
      if (_min >= _max) break;
      uint256 _mid = (_min + _max + 2) / 2;
      VotingEscrow.Point memory pt = VotingEscrow(ve).point_history(_mid);
      if (pt.ts <= _timestamp) {
        _min = _mid;
      } else {
        _max = _mid - 1;
      }
    }
    return _min;
  }

  function _find_timestamp_user_epoch(
    address ve,
    uint256 tokenId,
    uint256 _timestamp,
    uint256 max_user_epoch
  ) internal view returns (uint256) {
    uint256 _min = 0;
    uint256 _max = max_user_epoch;
    for (uint256 i = 0; i < 128; i++) {
      if (_min >= _max) break;
      uint256 _mid = (_min + _max + 2) / 2;
      VotingEscrow.Point memory pt = VotingEscrow(ve).user_point_history(tokenId, _mid);
      if (pt.ts <= _timestamp) {
        _min = _mid;
      } else {
        _max = _mid - 1;
      }
    }
    return _min;
  }

  function ve_for_at(uint256 _tokenId, uint256 _timestamp) external view returns (uint256) {
    address ve = voting_escrow;
    uint256 max_user_epoch = VotingEscrow(ve).user_point_epoch(_tokenId);
    uint256 epoch = _find_timestamp_user_epoch(ve, _tokenId, _timestamp, max_user_epoch);
    VotingEscrow.Point memory pt = VotingEscrow(ve).user_point_history(_tokenId, epoch);
    return Math.max(uint256(int256(pt.bias - pt.slope * (int128(int256(_timestamp - pt.ts))))), 0);
  }

  function _checkpoint_total_supply() internal {
    address ve = voting_escrow;
    uint256 t = time_cursor;
    uint256 rounded_timestamp = (block.timestamp / WEEK) * WEEK;
    VotingEscrow(ve).checkpoint();

    for (uint256 i = 0; i < 20; i++) {
      if (t > rounded_timestamp) {
        break;
      } else {
        uint256 epoch = _find_timestamp_epoch(ve, t);
        VotingEscrow.Point memory pt = VotingEscrow(ve).point_history(epoch);
        int128 dt = 0;
        if (t > pt.ts) {
          dt = int128(int256(t - pt.ts));
        }
        ve_supply[t] = Math.max(uint256(int256(pt.bias - pt.slope * dt)), 0);
      }
      t += WEEK;
    }
    time_cursor = t;
  }

  function checkpoint_total_supply() external {
    _checkpoint_total_supply();
  }

  function _claim(
    uint256 _tokenId,
    address ve,
    uint256 _last_token_time
  ) internal returns (uint256) {
    uint256 user_epoch = 0;
    uint256 to_distribute = 0;

    uint256 max_user_epoch = VotingEscrow(ve).user_point_epoch(_tokenId);
    uint256 _start_time = start_time;

    if (max_user_epoch == 0) return 0;

    uint256 week_cursor = time_cursor_of[_tokenId];
    if (week_cursor == 0) {
      user_epoch = _find_timestamp_user_epoch(ve, _tokenId, _start_time, max_user_epoch);
    } else {
      user_epoch = user_epoch_of[_tokenId];
    }

    if (user_epoch == 0) user_epoch = 1;

    VotingEscrow.Point memory user_point = VotingEscrow(ve).user_point_history(_tokenId, user_epoch);

    if (week_cursor == 0) week_cursor = ((user_point.ts + WEEK - 1) / WEEK) * WEEK;
    if (week_cursor >= last_token_time) return 0;
    if (week_cursor < _start_time) week_cursor = _start_time;

    VotingEscrow.Point memory old_user_point;

    for (uint256 i = 0; i < 50; i++) {
      if (week_cursor >= _last_token_time) break;

      if (week_cursor >= user_point.ts && user_epoch <= max_user_epoch) {
        user_epoch += 1;
        old_user_point = user_point;
        if (user_epoch > max_user_epoch) {
          user_point = VotingEscrow.Point(0, 0, 0, 0);
        } else {
          user_point = VotingEscrow(ve).user_point_history(_tokenId, user_epoch);
        }
      } else {
        int128 dt = int128(int256(week_cursor - old_user_point.ts));
        uint256 balance_of = Math.max(uint256(int256(old_user_point.bias - dt * old_user_point.slope)), 0);
        if (balance_of == 0 && user_epoch > max_user_epoch) break;
        if (balance_of > 0) {
          to_distribute += (balance_of * tokens_per_week[week_cursor]) / ve_supply[week_cursor];
        }
        week_cursor += WEEK;
      }
    }

    user_epoch = Math.min(max_user_epoch, user_epoch - 1);
    user_epoch_of[_tokenId] = user_epoch;
    time_cursor_of[_tokenId] = week_cursor;

    emit Claimed(_tokenId, to_distribute, user_epoch, max_user_epoch);

    return to_distribute;
  }

  function _claimable(
    uint256 _tokenId,
    address ve,
    uint256 _last_token_time
  ) internal view returns (uint256) {
    uint256 user_epoch = 0;
    uint256 to_distribute = 0;

    uint256 max_user_epoch = VotingEscrow(ve).user_point_epoch(_tokenId);
    uint256 _start_time = start_time;

    if (max_user_epoch == 0) return 0;

    uint256 week_cursor = time_cursor_of[_tokenId];
    if (week_cursor == 0) {
      user_epoch = _find_timestamp_user_epoch(ve, _tokenId, _start_time, max_user_epoch);
    } else {
      user_epoch = user_epoch_of[_tokenId];
    }

    if (user_epoch == 0) user_epoch = 1;

    VotingEscrow.Point memory user_point = VotingEscrow(ve).user_point_history(_tokenId, user_epoch);

    if (week_cursor == 0) week_cursor = ((user_point.ts + WEEK - 1) / WEEK) * WEEK;
    if (week_cursor >= last_token_time) return 0;
    if (week_cursor < _start_time) week_cursor = _start_time;

    VotingEscrow.Point memory old_user_point;

    for (uint256 i = 0; i < 50; i++) {
      if (week_cursor >= _last_token_time) break;

      if (week_cursor >= user_point.ts && user_epoch <= max_user_epoch) {
        user_epoch += 1;
        old_user_point = user_point;
        if (user_epoch > max_user_epoch) {
          user_point = VotingEscrow.Point(0, 0, 0, 0);
        } else {
          user_point = VotingEscrow(ve).user_point_history(_tokenId, user_epoch);
        }
      } else {
        int128 dt = int128(int256(week_cursor - old_user_point.ts));
        uint256 balance_of = Math.max(uint256(int256(old_user_point.bias - dt * old_user_point.slope)), 0);
        if (balance_of == 0 && user_epoch > max_user_epoch) break;
        if (balance_of > 0) {
          to_distribute += (balance_of * tokens_per_week[week_cursor]) / ve_supply[week_cursor];
        }
        week_cursor += WEEK;
      }
    }

    return to_distribute;
  }

  function claimable(uint256 _tokenId) external view returns (uint256) {
    uint256 _last_token_time = (last_token_time / WEEK) * WEEK;
    return _claimable(_tokenId, voting_escrow, _last_token_time);
  }

  function claim(uint256 _tokenId) external returns (uint256) {
    if (block.timestamp >= time_cursor) _checkpoint_total_supply();
    uint256 _last_token_time = last_token_time;
    _last_token_time = (_last_token_time / WEEK) * WEEK;
    uint256 amount = _claim(_tokenId, voting_escrow, _last_token_time);
    if (amount != 0) {
      VotingEscrow(voting_escrow).deposit_for(_tokenId, amount);
      token_last_balance -= amount;
    }
    return amount;
  }

  function claim_many(uint256[] memory _tokenIds) external returns (bool) {
    if (block.timestamp >= time_cursor) _checkpoint_total_supply();
    uint256 _last_token_time = last_token_time;
    _last_token_time = (_last_token_time / WEEK) * WEEK;
    address _voting_escrow = voting_escrow;
    uint256 total = 0;

    for (uint256 i = 0; i < _tokenIds.length; i++) {
      uint256 _tokenId = _tokenIds[i];
      if (_tokenId == 0) break;
      uint256 amount = _claim(_tokenId, _voting_escrow, _last_token_time);
      if (amount != 0) {
        VotingEscrow(_voting_escrow).deposit_for(_tokenId, amount);
        total += amount;
      }
    }
    if (total != 0) {
      token_last_balance -= total;
    }

    return true;
  }

  // Once off event on contract initialize
  function setDepositor(address _depositor) external {
    require(msg.sender == depositor);
    depositor = _depositor;
  }
}
