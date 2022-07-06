// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { AIP8AUSDStakingBase, AIP8AUSDStakingLike, console, UserInfo } from "./AIP8AUSDStakingBase.sol";
import { IFairLaunch } from "../../../contracts/8.15/interfaces/IFairLaunch.sol";
import { mocking } from "../../utils/mocking.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract AIP8AUSDStaking_TestHarvest is AIP8AUSDStakingBase {
  using mocking for *;

  function test_harvest_aliceAndBobLock_aliceHarvest_shouldSuccess() external {
    uint256 _expectedStakingAmountAlice = 1 ether;
    uint256 _expectedLockUntilAlice = block.timestamp + WEEK;
    uint256 _expectedStakingAmountBob = 2 ether;
    uint256 _expectedLockUntilBob = block.timestamp + (WEEK * 2);

    _lockFor(_ALICE, _expectedStakingAmountAlice, _expectedLockUntilAlice);
    vm.roll(block.number + 1000);
    _lockFor(_BOB, _expectedStakingAmountBob, _expectedLockUntilBob);

    uint256 _alpacaBalanceBefore = IERC20Upgradeable(ALPACA).balanceOf(_ALICE);
    vm.prank(_ALICE);
    aip8AUSDStaking.harvest();
    uint256 _alpacaRewardHarvested = IERC20Upgradeable(ALPACA).balanceOf(_ALICE) - _alpacaBalanceBefore;

    // pendingAlpaca (since Bob lock) = 42196193000000 (from console.log)
    // totalStakingTokenAmount (before Bob lock) = 1e18
    // previousAccAlpacaPerShare = 0
    // accAlpacaPerShare = previousAccAlpacaPerShare + ((pendingAlpaca * 1e12) / totalStakingTokenAmount)
    //                   = 0 + ((42196193000000 * 1e12) / 1e18)
    //                   = 42196193
    // alpacaRewardHarvested = (stakingTokenAmount * accAlpacaPerShare / 1e12) - rewardDebt
    //                       = (1e18 * 42196193 / 1e12) - 0
    //                       = 42196193000000
    assertEq(_alpacaRewardHarvested, 42196193000000, "Alice should harvest 42196193000000 wei ALPACA");
  }

  function test_harvest_aliceAndBobLock_aliceAndBobHarvest_shouldSuccess() external {
    uint256 _expectedStakingAmountAlice = 1 ether;
    uint256 _expectedLockUntilAlice = block.timestamp + WEEK;
    uint256 _expectedStakingAmountBob = 2 ether;
    uint256 _expectedLockUntilBob = block.timestamp + (WEEK * 2);

    _lockFor(_ALICE, _expectedStakingAmountAlice, _expectedLockUntilAlice);
    vm.roll(block.number + 1000);
    _lockFor(_BOB, _expectedStakingAmountBob, _expectedLockUntilBob);

    uint256 _alpacaBalanceBefore = IERC20Upgradeable(ALPACA).balanceOf(_ALICE);
    vm.prank(_ALICE);
    aip8AUSDStaking.harvest(); // BLOCK IS NOT MINED HERE
    uint256 _alpacaRewardHarvested = IERC20Upgradeable(ALPACA).balanceOf(_ALICE) - _alpacaBalanceBefore;

    // pendingAlpaca (since Bob lock) = 42196193000000 (from console.log)
    // totalStakingTokenAmount (before Bob lock) = 1e18
    // previousAccAlpacaPerShare = 0
    // accAlpacaPerShare = previousAccAlpacaPerShare + ((pendingAlpaca * 1e12) / totalStakingTokenAmount)
    //                   = 0 + ((42196193000000 * 1e12) / 1e18)
    //                   = 42196193
    // alpacaRewardHarvested = (stakingTokenAmount * accAlpacaPerShare / 1e12) - rewardDebt
    //                       = (1e18 * 42196193 / 1e12) - 0
    //                       = 42196193000000
    assertEq(_alpacaRewardHarvested, 42196193000000, "Alice should harvest 42196193000000 wei ALPACA");

    vm.roll(block.number + 1000);

    _alpacaBalanceBefore = IERC20Upgradeable(ALPACA).balanceOf(_BOB);
    vm.prank(_BOB);
    aip8AUSDStaking.harvest(); // BLOCK IS NOT MINED HERE
    _alpacaRewardHarvested = IERC20Upgradeable(ALPACA).balanceOf(_BOB) - _alpacaBalanceBefore;

    // pendingAlpaca (since Alice harvest) = 126588522000000 (from console.log)
    // previousAccAlpacaPerShare = 42196193
    // total
    // totalStakingTokenAmount (before Bob lock) = 1e18
    // previousAccAlpacaPerShare = 0
    // accAlpacaPerShare = previousAccAlpacaPerShare + ((pendingAlpaca * 1e12) / totalStakingTokenAmount)
    //                   = 42196193 + ((126588522000000 * 1e12) / 3e18)
    //                   = 84392367
    // alpacaRewardHarvested = (stakingTokenAmount * accAlpacaPerShare / 1e12) - rewardDebt
    //                       = (2e18 * 84392367 / 1e12) - 84392386000000
    //                       = 84392348000000
    assertEq(_alpacaRewardHarvested, 84392348000000, "Bob should harvest 84392348000000 wei ALPACA");
  }

  function test_harvest_multipleUsers_shouldNeverRunOutOfAlpaca() external {
    _lockFor(_ALICE, 1 ether, block.timestamp + WEEK);
    vm.roll(10);
    vm.warp(block.timestamp + 10);
    _lockFor(_BOB, 2 ether, block.timestamp + WEEK);
    vm.roll(10);
    vm.warp(block.timestamp + 10);
    _lockFor(_CHARLIE, 5 ether, block.timestamp + WEEK);
    vm.roll(10);
    vm.warp(block.timestamp + 10);
    _lockFor(_DAVID, 5 ether, block.timestamp + WEEK);
    vm.roll(1000);
    vm.warp(block.timestamp + 1000);
    _lockFor(_ALICE, 15 ether, block.timestamp + WEEK);
    vm.roll(10);
    vm.warp(block.timestamp + 10);
    _harvestFor(_ALICE);
    vm.roll(10);
    vm.warp(block.timestamp + 10);
    _harvestFor(_BOB);
    vm.roll(10);
    vm.warp(block.timestamp + 10);
    _harvestFor(_CHARLIE);
    vm.roll(10);
    vm.warp(block.timestamp + 10);
    _harvestFor(_DAVID);

    // Unlock all
    vm.warp(block.timestamp + WEEK);

    vm.roll(10);
    vm.warp(block.timestamp + 10);
    _unlockFor(_ALICE);
    vm.roll(10);
    vm.warp(block.timestamp + 10);
    _unlockFor(_BOB);
    vm.roll(10);
    vm.warp(block.timestamp + 10);
    _unlockFor(_CHARLIE);
    vm.roll(10);
    vm.warp(block.timestamp + 10);
    _unlockFor(_DAVID);
  }

  function test_harvest_aliceLock_aliceHarvestTwice_accAlpacaPerShare_shouldNotChangeOnSecondHarvest() external {
    uint256 _expectedStakingAmountAlice = 1 ether;
    uint256 _expectedLockUntilAlice = block.timestamp + WEEK;

    _lockFor(_ALICE, _expectedStakingAmountAlice, _expectedLockUntilAlice);
    vm.roll(block.number + 1000);

    uint256 _alpacaBalanceBefore = IERC20Upgradeable(ALPACA).balanceOf(_ALICE);
    vm.prank(_ALICE);
    aip8AUSDStaking.harvest();

    uint256 _alpacaRewardHarvested = IERC20Upgradeable(ALPACA).balanceOf(_ALICE) - _alpacaBalanceBefore;
    uint256 _accAlpacaPerShare = aip8AUSDStaking.accAlpacaPerShare();
    // pendingAlpaca = 42196193000000 (from console.log)
    // totalStakingTokenAmount (before Bob lock) = 1e18
    // previousAccAlpacaPerShare = 0
    // accAlpacaPerShare = previousAccAlpacaPerShare + ((pendingAlpaca * 1e12) / totalStakingTokenAmount)
    //                   = 0 + ((42196193000000 * 1e12) / 1e18)
    //                   = 42196193
    // alpacaRewardHarvested = (stakingTokenAmount * accAlpacaPerShare / 1e12) - rewardDebt
    //                       = (1e18 * 42196193 / 1e12) - 0
    //                       = 42196193000000
    assertEq(_alpacaRewardHarvested, 42196193000000, "Alice should harvest 42196193000000 wei ALPACA");
    assertEq(aip8AUSDStaking.accAlpacaPerShare(), 42196193, "accAlpacaPerShare should be 42196193");

    vm.prank(_ALICE);
    aip8AUSDStaking.harvest();

    assertEq(_accAlpacaPerShare - aip8AUSDStaking.accAlpacaPerShare(), 0, "accAlpacaPerShare should not change");
  }

  function test_harvest_aliceHavestWithoutLock_shouldSuccessWithNoReward() external {
    uint256 _alpacaBalanceBefore = IERC20Upgradeable(ALPACA).balanceOf(_ALICE);

    vm.prank(_ALICE);
    aip8AUSDStaking.harvest();

    uint256 _accAlpacaPerShare = aip8AUSDStaking.accAlpacaPerShare();
    uint256 _alpacaRewardHarvested = IERC20Upgradeable(ALPACA).balanceOf(_ALICE) - _alpacaBalanceBefore;

    assertEq(_alpacaRewardHarvested, 0, "Alice should harvest 0 ALPACA");
    assertEq(_accAlpacaPerShare, 0, "accAlpacaPerShare should not change");
  }

  function test_harvest_aliceHavest_WhenAIP8Stopped_shouldFail() external {
    // owner set EmergencyWithdraw
    vm.prank(aip8AUSDStaking.owner());
    aip8AUSDStaking.enableEmergencyWithdraw();

    vm.prank(_ALICE);
    vm.expectRevert(abi.encodeWithSelector(AIP8AUSDStakingLike.AIP8AUSDStaking_Stopped.selector));
    aip8AUSDStaking.harvest();
  }
}
