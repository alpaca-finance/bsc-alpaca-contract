// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { AIP8AUSDStakingBase, AIP8AUSDStakingLike, console, UserInfo } from "./AIP8AUSDStakingBase.sol";
import { IFairLaunch } from "../../../contracts/8.15/interfaces/IFairLaunch.sol";
import { mocking } from "../../utils/mocking.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract AIP8AUSDStaking_Test is AIP8AUSDStakingBase {
  using mocking for *;

  uint256 private constant WEEK = 7 days;
  uint256 private constant pid = 25;

  address private constant fairlaunchAddress = 0xA625AB01B08ce023B2a342Dbb12a16f2C8489A8F;
  address private constant _ALICE = 0x52Af1571D431842cc16073021bAF700aeAAa8146;
  address private constant _BOB = 0x7a33e32547602e8bafc6392F4cb8f48918415522;
  address private constant AUSD3EPS = 0xae70E3f6050d6AB05E03A50c655309C2148615bE;
  address private constant ALPACA = 0x8F0528cE5eF7B51152A59745bEfDD91D97091d2F;

  AIP8AUSDStakingLike private aip8AUSDStaking;

  function setUp() external {
    aip8AUSDStaking = _setUpAIP8AUSDStaking(fairlaunchAddress, pid);
  }

  function test_lock_aliceLockAlone_shouldSuccess() external {
    uint256 _expectedStakingAmount = 1 ether;
    uint256 _expectedLockUntil = block.timestamp + WEEK;

    _lockFor(_ALICE, _expectedStakingAmount, _expectedLockUntil);

    UserInfo memory _userInfo = aip8AUSDStaking.userInfo(_ALICE);
    assertEq(_userInfo.stakingAmount, _expectedStakingAmount);
    assertEq(_userInfo.lockUntil, _expectedLockUntil);
    assertEq(_userInfo.alpacaRewardDebt, 0);

    (uint256 _fairlaunchAmount, , , address _fundedBy) = IFairLaunch(fairlaunchAddress).userInfo(
      pid,
      address(aip8AUSDStaking)
    );
    assertEq(_expectedStakingAmount, _fairlaunchAmount);
    assertEq(address(aip8AUSDStaking), _fundedBy);
  }

  function test_lock_aliceAndBobLock_shouldSuccess() external {
    uint256 _expectedStakingAmountAlice = 1 ether;
    uint256 _expectedLockUntilAlice = block.timestamp + WEEK;
    uint256 _expectedStakingAmountBob = 2 ether;
    uint256 _expectedLockUntilBob = block.timestamp + (WEEK * 2);

    _lockFor(_ALICE, _expectedStakingAmountAlice, _expectedLockUntilAlice);
    _lockFor(_BOB, _expectedStakingAmountBob, _expectedLockUntilBob);

    UserInfo memory _userInfoAlice = aip8AUSDStaking.userInfo(_ALICE);
    assertEq(_userInfoAlice.stakingAmount, _expectedStakingAmountAlice, "Alice stakingAmount");
    assertEq(_userInfoAlice.lockUntil, _expectedLockUntilAlice, "Alice lockUntil");
    assertEq(_userInfoAlice.alpacaRewardDebt, 0, "Alice alpacaRewardDebt");

    UserInfo memory _userInfoBob = aip8AUSDStaking.userInfo(_BOB);
    assertEq(_userInfoBob.stakingAmount, _expectedStakingAmountBob, "Bob stakingAmount");
    assertEq(_userInfoBob.lockUntil, _expectedLockUntilBob, "Bob lockUntil");
    assertEq(_userInfoBob.alpacaRewardDebt, 0, "Bob alpacaRewardDebt");

    (uint256 _fairlaunchAmount, , , address _fundedBy) = IFairLaunch(fairlaunchAddress).userInfo(
      pid,
      address(aip8AUSDStaking)
    );
    assertEq(_expectedStakingAmountAlice + _expectedStakingAmountBob, _fairlaunchAmount);
    assertEq(address(aip8AUSDStaking), _fundedBy);
  }

  function test_lock_aliceAndBobLock_withGapTimeBetween_shouldSuccess() external {
    uint256 _expectedStakingAmountAlice = 1 ether;
    uint256 _expectedLockUntilAlice = block.timestamp + WEEK;
    uint256 _expectedStakingAmountBob = 2 ether;
    uint256 _expectedLockUntilBob = block.timestamp + (WEEK * 2);

    _lockFor(_ALICE, _expectedStakingAmountAlice, _expectedLockUntilAlice);
    vm.roll(block.number + 1000);
    _lockFor(_BOB, _expectedStakingAmountBob, _expectedLockUntilBob);

    UserInfo memory _userInfoAlice = aip8AUSDStaking.userInfo(_ALICE);
    assertEq(_userInfoAlice.stakingAmount, _expectedStakingAmountAlice, "Alice stakingAmount");
    assertEq(_userInfoAlice.lockUntil, _expectedLockUntilAlice, "Alice lockUntil");
    assertEq(_userInfoAlice.alpacaRewardDebt, 0, "Alice alpacaRewardDebt");

    UserInfo memory _userInfoBob = aip8AUSDStaking.userInfo(_BOB);
    assertEq(_userInfoBob.stakingAmount, _expectedStakingAmountBob, "Bob stakingAmount");
    assertEq(_userInfoBob.lockUntil, _expectedLockUntilBob, "Bob lockUntil");

    // pendingAlpaca (since Alice lock) = 42196193000000 (from console.log)
    // totalStakingTokenAmount (before Bob lock) = 1e18
    // previousAccAlpacaPerShare = 0
    // accAlpacaPerShare = previousAccAlpacaPerShare + ((pendingAlpaca * 1e12) / totalStakingTokenAmount)
    //                   = 0 + ((42196193000000 * 1e12) / 1e18)
    //                   = 42196193
    // rewardDebt = stakingAmount * accAlpacaPerShare / 1e12
    //            = 2e18 * 42196193 / 1e12
    //            = 84392386000000
    assertEq(_userInfoBob.alpacaRewardDebt, 84392386000000, "Bob alpacaRewardDebt");

    (uint256 _fairlaunchAmount, , , address _fundedBy) = IFairLaunch(fairlaunchAddress).userInfo(
      pid,
      address(aip8AUSDStaking)
    );
    assertEq(_expectedStakingAmountAlice + _expectedStakingAmountBob, _fairlaunchAmount);
    assertEq(address(aip8AUSDStaking), _fundedBy);
  }

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
    // alpacaRewardHarvested = stakingTokenAmount * accAlpacaPerShare / 1e12
    //                       = 1e18 * 42196193 / 1e12
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
    aip8AUSDStaking.harvest();
    uint256 _alpacaRewardHarvested = IERC20Upgradeable(ALPACA).balanceOf(_ALICE) - _alpacaBalanceBefore;

    // pendingAlpaca (since Bob lock) = 42196193000000 (from console.log)
    // totalStakingTokenAmount (before Bob lock) = 1e18
    // previousAccAlpacaPerShare = 0
    // accAlpacaPerShare = previousAccAlpacaPerShare + ((pendingAlpaca * 1e12) / totalStakingTokenAmount)
    //                   = 0 + ((42196193000000 * 1e12) / 1e18)
    //                   = 42196193
    // alpacaRewardHarvested = stakingTokenAmount * accAlpacaPerShare / 1e12
    //                       = 1e18 * 42196193 / 1e12
    //                       = 42196193000000
    assertEq(_alpacaRewardHarvested, 42196193000000, "Alice should harvest 42196193000000 wei ALPACA");

    vm.roll(block.number + 1000);

    _alpacaBalanceBefore = IERC20Upgradeable(ALPACA).balanceOf(_BOB);
    vm.prank(_BOB);
    aip8AUSDStaking.harvest();
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
    //                       = 2e18 * 84392367 / 1e12
    //                       = 168784734000000
    assertEq(_alpacaRewardHarvested, 168784734000000, "Bob should harvest 168784734000000 wei ALPACA");
  }

  function _lockFor(
    address _actor,
    uint256 _expectedStakingAmount,
    uint256 _expectedLockUntil
  ) internal {
    vm.startPrank(_actor);
    IERC20Upgradeable(AUSD3EPS).approve(address(aip8AUSDStaking), type(uint256).max);
    aip8AUSDStaking.lock(_expectedStakingAmount, _expectedLockUntil);
    vm.stopPrank();
  }
}
