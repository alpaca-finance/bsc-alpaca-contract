// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { AIP8AUSDStakingBase, AIP8AUSDStakingLike, console, UserInfo } from "./AIP8AUSDStakingBase.sol";
import { IFairLaunch } from "../../../contracts/8.15/interfaces/IFairLaunch.sol";
import { mocking } from "../../utils/mocking.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract AIP8AUSDStaking_TestUnlock is AIP8AUSDStakingBase {
  using mocking for *;

  function test_unlock_aliceUnlock_shouldSuccess() external {
    uint256 _expectedStakingAmount = 1 ether;
    uint256 _expectedLockUntil = block.timestamp + WEEK;

    _lockFor(_ALICE, _expectedStakingAmount, _expectedLockUntil); // BLOCK IS NOT MINED HERE
    uint256 _alpacaBalanceBefore = IERC20Upgradeable(ALPACA).balanceOf(_ALICE);
    vm.warp(_expectedLockUntil + 10);
    vm.roll(block.number + 1000);
    _unlockFor(_ALICE);

    uint256 _alpacaRewardHarvested = IERC20Upgradeable(ALPACA).balanceOf(_ALICE) - _alpacaBalanceBefore;

    UserInfo memory _userInfo = aip8AUSDStaking.userInfo(_ALICE);
    assertEq(_userInfo.stakingAmount, 0);
    assertEq(_userInfo.lockUntil, 0);
    assertEq(_userInfo.alpacaRewardDebt, 0);

    (uint256 _fairlaunchAmount, , , ) = IFairLaunch(fairlaunchAddress).userInfo(pid, address(aip8AUSDStaking));
    assertEq(0, _fairlaunchAmount);

    // pendingAlpaca (since Alice locked) = 42196193000000 (from console.log)
    // totalStakingTokenAmount = 1e18
    // previousAccAlpacaPerShare = 0
    // accAlpacaPerShare = previousAccAlpacaPerShare + ((pendingAlpaca * 1e12) / totalStakingTokenAmount)
    //                   = 0 + ((42196193000000 * 1e12) / 1e18)
    //                   = 42196193
    // alpacaRewardHarvested = (stakingTokenAmount * accAlpacaPerShare / 1e12) - rewardDebt
    //                       = (1e18 * 42196193 / 1e12) - 0
    //                       = 42196193000000
    assertEq(_alpacaRewardHarvested, 42196193000000);
  }

  function test_unlock_aliceUnlockBeforeLockUntil_shouldFail() external {
    uint256 _expectedStakingAmount = 1 ether;
    uint256 _expectedLockUntil = block.timestamp + WEEK;

    _lockFor(_ALICE, _expectedStakingAmount, _expectedLockUntil); // BLOCK IS NOT MINED HERE
    vm.warp(_expectedLockUntil - 10);

    vm.expectRevert(AIP8AUSDStakingLike.AIP8AUSDStaking_StillInLockPeriod.selector);
    _unlockFor(_ALICE);
  }

  function test_unlock_aliceAndBobUnlock_shouldHarvestCorrectly() external {
    uint256 _expectedStakingAmountAlice = 1 ether;
    uint256 _expectedLockUntilAlice = block.timestamp + WEEK;
    uint256 _expectedStakingAmountBob = 2 ether;
    uint256 _expectedLockUntilBob = block.timestamp + (WEEK * 2);

    _lockFor(_ALICE, _expectedStakingAmountAlice, _expectedLockUntilAlice); // BLOCK IS NOT MINED HERE
    _lockFor(_BOB, _expectedStakingAmountBob, _expectedLockUntilBob); // BLOCK IS NOT MINED HERE

    vm.roll(block.number + 1000);
    vm.warp(block.timestamp + (WEEK * 2) + 10);

    uint256 _alpacaBalanceBefore = IERC20Upgradeable(ALPACA).balanceOf(_ALICE);
    _unlockFor(_ALICE); // BLOCK IS NOT MINED HERE
    uint256 _alpacaRewardHarvested = IERC20Upgradeable(ALPACA).balanceOf(_ALICE) - _alpacaBalanceBefore;

    // pendingAlpaca (since Bob locked) = 126588522000000 (from console.log)
    // totalStakingTokenAmount (after Bob locked) = 3e18
    // previousAccAlpacaPerShare = 0
    // accAlpacaPerShare = previousAccAlpacaPerShare + ((pendingAlpaca * 1e12) / totalStakingTokenAmount)
    //                   = 0 + ((126588522000000 * 1e12) / 3e18)
    //                   = 42196174
    // alpacaRewardHarvested = (stakingTokenAmount * accAlpacaPerShare / 1e12) - rewardDebt
    //                       = (1e18 * 42196174 / 1e12) - 0
    //                       = 42196174000000
    assertEq(_alpacaRewardHarvested, 42196174000000, "Alice should harvest 42196174000000 wei ALPACA");

    _alpacaBalanceBefore = IERC20Upgradeable(ALPACA).balanceOf(_BOB);
    _unlockFor(_BOB); // BLOCK IS NOT MINED HERE
    _alpacaRewardHarvested = IERC20Upgradeable(ALPACA).balanceOf(_BOB) - _alpacaBalanceBefore;
    // pendingAlpaca (since Bob locked) = 126588522000000 (from console.log)
    // totalStakingTokenAmount (after Bob locked) = 3e18
    // previousAccAlpacaPerShare = 0
    // accAlpacaPerShare = previousAccAlpacaPerShare + ((pendingAlpaca * 1e12) / totalStakingTokenAmount)
    //                   = 0 + ((126588522000000 * 1e12) / 3e18)
    //                   = 42196174
    // alpacaRewardHarvested = (stakingTokenAmount * accAlpacaPerShare / 1e12) - rewardDebt
    //                       = (2e18 * 42196174 / 1e12) - 0
    //                       = 84392348000000
    assertEq(_alpacaRewardHarvested, 84392348000000, "Bob should harvest 84392348000000 wei ALPACA");
  }
}
