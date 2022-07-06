// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { AIP8AUSDStakingBase, AIP8AUSDStakingLike, console, UserInfo } from "./AIP8AUSDStakingBase.sol";
import { IFairLaunch } from "../../../contracts/8.15/interfaces/IFairLaunch.sol";
import { mocking } from "../../utils/mocking.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract AIP8AUSDStaking_TestEmergencyWithdraw is AIP8AUSDStakingBase {
  using mocking for *;

  function test_emergencyWithdraw_aliceEmergencyWithdraw_WhenAIP8NotStopped_shouldFail() external {
    uint256 _expectedStakingAmount = 1 ether;
    uint256 _expectedLockUntil = block.timestamp + WEEK;

    _lockFor(_ALICE, _expectedStakingAmount, _expectedLockUntil);

    vm.expectRevert(abi.encodeWithSelector(AIP8AUSDStakingLike.AIP8AUSDStaking_NotStopped.selector));
    vm.prank(_ALICE);
    aip8AUSDStaking.emergencyWithdraw();
  }

  function test_emergencyWithdraw_aliceAndBobEmergencyWithdraw_WhenAIPStopped_shouldSuccess() external {
    uint256 _expectedStakingAmountAlice = 1 ether;
    uint256 _expectedLockUntilAlice = block.timestamp + WEEK;
    uint256 _expectedStakingAmountBob = 2 ether;
    uint256 _expectedLockUntilBob = block.timestamp + (WEEK * 2);

    _lockFor(_ALICE, _expectedStakingAmountAlice, _expectedLockUntilAlice);
    _lockFor(_BOB, _expectedStakingAmountBob, _expectedLockUntilBob);

    // owner set EmergencyWithdraw
    vm.prank(aip8AUSDStaking.owner());
    aip8AUSDStaking.enableEmergencyWithdraw();

    uint256 _stakingAmountInAIP8 = IERC20Upgradeable(AUSD3EPS).balanceOf(address(aip8AUSDStaking));
    assertEq(_stakingAmountInAIP8, 3 ether);

    uint256 _aliceBalanceBefore = IERC20Upgradeable(AUSD3EPS).balanceOf(address(_ALICE));
    uint256 _bobBalanceBefore = IERC20Upgradeable(AUSD3EPS).balanceOf(address(_BOB));
    // ALICE EmergencyWithdraw
    _emergencyWithdrawFor(_ALICE);
    _emergencyWithdrawFor(_BOB);

    uint256 _aliceBalanceAfter = IERC20Upgradeable(AUSD3EPS).balanceOf(address(_ALICE));
    uint256 _bobBalanceAfter = IERC20Upgradeable(AUSD3EPS).balanceOf(address(_BOB));

    assertEq(_aliceBalanceAfter - _aliceBalanceBefore, 1 ether);
    assertEq(_bobBalanceAfter - _bobBalanceBefore, 2 ether);
  }

  function test_enableEmergencyWithdraw_notOwnerCall_shouldFail() external {
    vm.prank(_ALICE);
    vm.expectRevert("Ownable: caller is not the owner");
    aip8AUSDStaking.enableEmergencyWithdraw();
  }
}
