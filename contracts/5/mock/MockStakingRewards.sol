pragma solidity 0.5.16;

import "synthetix/contracts/StakingRewards.sol";

contract MockStakingRewards is StakingRewards {
  constructor(
    address _owner,
    address _rewardsDistribution,
    address _rewardsToken,
    address _stakingToken
  ) public StakingRewards(
    _owner,
    _rewardsDistribution,
    _rewardsToken,
    _stakingToken
  ) {}
}