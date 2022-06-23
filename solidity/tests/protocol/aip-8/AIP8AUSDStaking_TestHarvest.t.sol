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
}
