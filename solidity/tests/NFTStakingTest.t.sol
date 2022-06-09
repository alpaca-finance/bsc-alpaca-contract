// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { console } from "./utils/console.sol";
import "./base/DSTest.sol";
import { BaseTest, MockErc20Like, DebtTokenLike, SimpleVaultConfigLike, VaultLike, NFTStakingLike, MockNFTLike } from "./base/BaseTest.sol";

contract NFTStakingTest is BaseTest {
  NFTStakingLike private nftStaking;
  MockNFTLike private mockNFT1;
  MockNFTLike private mockNFT2;

  address private nftAddress1;
  address private nftAddress2;

  uint256 private mockLockUntil;

  function setUp() external {
    nftStaking = _setupNFTStaking();
    mockNFT1 = _setupMockNFT();
    mockNFT2 = _setupMockNFT();

    nftAddress1 = address(mockNFT1);
    nftAddress2 = address(mockNFT2);

    mockLockUntil = 1641071800;
  }

  function testAddPool_correctParams() external {
    nftStaking.addPool(nftAddress1, 100, 0, 200);
    (uint256 poolWeight, uint256 minLockPeriod, uint256 maxLockPeriod) = nftStaking.poolInfo(nftAddress1);
    assertEq(poolWeight, 100);
    assertEq(minLockPeriod, 0);
    assertEq(maxLockPeriod, 200);
    assertTrue(nftStaking.isPoolExist(nftAddress1));
  }

  function testAddPool_alreadyExist() external {
    nftStaking.addPool(nftAddress1, 100, 0, 200);
    vm.expectRevert(NFTStakingLike.NFTStaking_PoolAlreadyExist.selector);
    nftStaking.addPool(nftAddress1, 100, 0, 200);
  }

  function testSetPool_correctParams() external {
    // Add pool for nftAddress1
    nftStaking.addPool(nftAddress1, 100, 0, 200);
    (uint256 poolWeight, uint256 minLockPeriod, uint256 maxLockPeriod) = nftStaking.poolInfo(nftAddress1);
    assertEq(poolWeight, 100);
    assertEq(minLockPeriod, 0);
    assertEq(maxLockPeriod, 200);
    assertTrue(nftStaking.isPoolExist(nftAddress1));

    // Set new params for pool nftAddress1
    nftStaking.setPool(nftAddress1, 700, 1, 900);
    (poolWeight, minLockPeriod, maxLockPeriod) = nftStaking.poolInfo(nftAddress1);
    assertEq(poolWeight, 700);
    assertEq(minLockPeriod, 1);
    assertEq(maxLockPeriod, 900);
    assertTrue(nftStaking.isPoolExist(nftAddress1));
  }

  function testSetPool_poolNotExist() external {
    vm.expectRevert(NFTStakingLike.NFTStaking_PoolNotExist.selector);
    nftStaking.setPool(nftAddress1, 100, 0, 200);
  }

  function testStakeNFT_eligibleNFT() external {
    nftStaking.addPool(nftAddress1, 100, 0, 2000);
    vm.warp(1641070800);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(2);
    mockNFT1.approve(address(nftStaking), 0);
    mockNFT1.approve(address(nftStaking), 1);
    assertEq(mockNFT1.balanceOf(ALICE), 2);
    nftStaking.stakeNFT(nftAddress1, 1, mockLockUntil);
    vm.stopPrank();

    bytes32 depositId = keccak256(abi.encodePacked(nftAddress1, ALICE, uint256(1)));
    uint256 lockUntil = nftStaking.userStakingNFTLockUntil(depositId);
    assertEq(nftStaking.userNFTInStakingPool(ALICE, nftAddress1), 1);
    assertEq(lockUntil, mockLockUntil);

    assertEq(mockNFT1.balanceOf(ALICE), 1);
    assertEq(mockNFT1.balanceOf(address(nftStaking)), 1);
    assertTrue(nftStaking.isStaked(nftAddress1, ALICE, 1));
    assertTrue(!nftStaking.isStaked(nftAddress1, ALICE, 0));
  }

  // Don't want to lock, so lockUntil param should equal to current timestamp
  function testStakeNFT_noLockUntil() external {
    nftStaking.addPool(nftAddress1, 100, 0, 2000);
    vm.warp(1641070800);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(2);
    mockNFT1.approve(address(nftStaking), 0);
    mockNFT1.approve(address(nftStaking), 1);
    assertEq(mockNFT1.balanceOf(ALICE), 2);
    nftStaking.stakeNFT(nftAddress1, 1, 1641070800);
    vm.stopPrank();

    bytes32 depositId = keccak256(abi.encodePacked(nftAddress1, ALICE, uint256(1)));
    uint256 lockUntil = nftStaking.userStakingNFTLockUntil(depositId);
    assertEq(nftStaking.userNFTInStakingPool(ALICE, nftAddress1), 1);
    assertEq(lockUntil, 1641070800);

    assertEq(mockNFT1.balanceOf(ALICE), 1);
    assertEq(mockNFT1.balanceOf(address(nftStaking)), 1);
    assertTrue(nftStaking.isStaked(nftAddress1, ALICE, 1));
    assertTrue(!nftStaking.isStaked(nftAddress1, ALICE, 0));
  }

  function testStakeNFT_stakeNFTWithHigherWeight() external {
    nftStaking.addPool(nftAddress1, 100, 0, 2000);
    nftStaking.addPool(nftAddress2, 140, 20, 2200);
    vm.warp(1641070800);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT2.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    mockNFT2.approve(address(nftStaking), 0);
    assertEq(mockNFT1.balanceOf(ALICE), 1);
    assertEq(mockNFT2.balanceOf(ALICE), 1);

    // Staking first NFT
    nftStaking.stakeNFT(nftAddress1, 0, mockLockUntil);
    assertTrue(nftStaking.isStaked(nftAddress1, ALICE, 0));
    assertEq(mockNFT1.balanceOf(ALICE), 0);
    (uint256 poolWeight, uint256 minLockPeriod, uint256 maxLockPeriod) = nftStaking.poolInfo(
      nftStaking.userHighestWeightNftAddress(ALICE)
    );
    assertEq(nftStaking.userHighestWeightNftAddress(ALICE), nftAddress1);
    assertEq(poolWeight, 100);
    assertEq(minLockPeriod, 0);
    assertEq(maxLockPeriod, 2000);

    // Staking second NFT
    nftStaking.stakeNFT(nftAddress2, 0, mockLockUntil);
    assertTrue(nftStaking.isStaked(nftAddress2, ALICE, 0));
    assertEq(mockNFT2.balanceOf(ALICE), 0);
    assertEq(nftStaking.userHighestWeightNftAddress(ALICE), nftAddress2);
    (poolWeight, minLockPeriod, maxLockPeriod) = nftStaking.poolInfo(nftStaking.userHighestWeightNftAddress(ALICE));
    // Highest weight should now be the nftAddress2
    assertEq(poolWeight, 140);
    assertEq(minLockPeriod, 20);
    assertEq(maxLockPeriod, 2200);
    vm.stopPrank();
  }

  function testStakeNFT_stakeNFTWithLowerWeight() external {
    nftStaking.addPool(nftAddress1, 100, 0, 2000);
    nftStaking.addPool(nftAddress2, 140, 20, 2200);
    vm.warp(1641070800);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT2.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    mockNFT2.approve(address(nftStaking), 0);
    assertEq(mockNFT1.balanceOf(ALICE), 1);
    assertEq(mockNFT2.balanceOf(ALICE), 1);

    // Staking first NFT (Higher weight)
    nftStaking.stakeNFT(nftAddress2, 0, mockLockUntil);
    assertTrue(nftStaking.isStaked(nftAddress2, ALICE, 0));
    assertEq(mockNFT2.balanceOf(ALICE), 0);
    (uint256 poolWeight, uint256 minLockPeriod, uint256 maxLockPeriod) = nftStaking.poolInfo(
      nftStaking.userHighestWeightNftAddress(ALICE)
    );
    assertEq(nftStaking.userHighestWeightNftAddress(ALICE), nftAddress2);
    assertEq(poolWeight, 140);
    assertEq(minLockPeriod, 20);
    assertEq(maxLockPeriod, 2200);

    // Staking second NFT
    nftStaking.stakeNFT(nftAddress1, 0, mockLockUntil);
    assertTrue(nftStaking.isStaked(nftAddress1, ALICE, 0));
    assertEq(mockNFT1.balanceOf(ALICE), 0);
    assertEq(nftStaking.userHighestWeightNftAddress(ALICE), nftAddress2);
    (poolWeight, minLockPeriod, maxLockPeriod) = nftStaking.poolInfo(nftStaking.userHighestWeightNftAddress(ALICE));
    // The weight should be the same
    assertEq(poolWeight, 140);
    assertEq(minLockPeriod, 20);
    assertEq(maxLockPeriod, 2200);
    vm.stopPrank();
  }

  function testStakeNFT_invalidPool() external {
    vm.expectRevert(NFTStakingLike.NFTStaking_InvalidPoolAddress.selector);
    nftStaking.addPool(address(0), 100, 0, 2000);
  }

  function testStakeNFT_poolNotExsit() external {
    nftStaking.addPool(nftAddress1, 100, 0, 2000);
    vm.warp(1641070800);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    vm.expectRevert(NFTStakingLike.NFTStaking_PoolNotExist.selector);
    nftStaking.stakeNFT(nftAddress2, 0, mockLockUntil);
    vm.stopPrank();
  }

  function testStakeNFT_stakeEligibleNFTAgain() external {
    nftStaking.addPool(nftAddress1, 100, 0, 2000);
    vm.warp(1641070800);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    assertEq(mockNFT1.balanceOf(ALICE), 1);
    nftStaking.stakeNFT(nftAddress1, 0, mockLockUntil);
    assertTrue(nftStaking.isStaked(nftAddress1, ALICE, 0));
    vm.expectRevert(NFTStakingLike.NFTStaking_NFTAlreadyStaked.selector);
    nftStaking.stakeNFT(nftAddress1, 0, mockLockUntil);
    vm.stopPrank();
  }

  function testStakeNFT_lockUntilLessThanCur() external {
    nftStaking.addPool(nftAddress1, 100, 0, 2000);
    vm.warp(1641070800);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    assertEq(mockNFT1.balanceOf(ALICE), 1);
    vm.expectRevert(NFTStakingLike.NFTStaking_InvalidLockPeriod.selector);
    nftStaking.stakeNFT(nftAddress1, 0, 1641072801);
    vm.stopPrank();
  }

  function testStakeNFT_lockPeriodLessThanMinLockPeriod() external {
    nftStaking.addPool(nftAddress1, 100, 50, 200);
    vm.warp(1641070800);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    assertEq(mockNFT1.balanceOf(ALICE), 1);
    vm.expectRevert(NFTStakingLike.NFTStaking_InvalidLockPeriod.selector);
    nftStaking.stakeNFT(nftAddress1, 0, 20);
    vm.stopPrank();
  }

  function testStakeNFT_lockPeriodMoreThanMaxLockPeriod() external {
    nftStaking.addPool(nftAddress1, 100, 50, 200);
    vm.warp(1641070800);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    assertEq(mockNFT1.balanceOf(ALICE), 1);
    vm.expectRevert(NFTStakingLike.NFTStaking_InvalidLockPeriod.selector);
    nftStaking.stakeNFT(nftAddress1, 0, 250);
    vm.stopPrank();
  }

  function testStakeNFT_notApproveEligibleNFT() external {
    nftStaking.addPool(nftAddress1, 100, 0, 2000);
    vm.warp(1641070800);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    vm.expectRevert(bytes("ERC721: transfer caller is not owner nor approved"));
    nftStaking.stakeNFT(nftAddress1, 0, mockLockUntil);
    vm.stopPrank();
  }

  function testStakeNFT_unAuthorized() external {
    nftStaking.addPool(nftAddress1, 100, 0, 200);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    vm.stopPrank();
    vm.expectRevert(NFTStakingLike.NFTStaking_Unauthorize.selector);
    nftStaking.stakeNFT(nftAddress1, 0, 20);
  }

  function testStakeNFT_nonExistNFT() external {
    nftStaking.addPool(nftAddress1, 100, 0, 200);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    vm.expectRevert(bytes("ERC721: operator query for nonexistent token"));
    nftStaking.stakeNFT(nftAddress1, 1, 20);
    vm.stopPrank();
  }

  function testUnstakeNFT_unstakeNFT() external {
    nftStaking.addPool(nftAddress1, 100, 0, 200);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    assertEq(mockNFT1.balanceOf(ALICE), 1);
    // Stake NFT
    nftStaking.stakeNFT(nftAddress1, 0, 0);
    assertEq(nftStaking.userNFTInStakingPool(ALICE, nftAddress1), 1);
    assertTrue(nftStaking.isStaked(nftAddress1, ALICE, 0));
    // Unstake NFT
    nftStaking.unstakeNFT(nftAddress1, 0);
    assertEq(nftStaking.userNFTInStakingPool(ALICE, nftAddress1), 0);
    assertTrue(!nftStaking.isStaked(nftAddress1, ALICE, 0));
    vm.stopPrank();
  }

  function testUnstakeNFT_updateHighestWeight() external {
    nftStaking.addPool(nftAddress1, 100, 0, 2000);
    nftStaking.addPool(nftAddress2, 140, 0, 2200);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT2.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    mockNFT2.approve(address(nftStaking), 0);
    assertEq(mockNFT1.balanceOf(ALICE), 1);
    assertEq(mockNFT2.balanceOf(ALICE), 1);

    // Staking first NFT
    nftStaking.stakeNFT(nftAddress1, 0, 0);
    assertTrue(nftStaking.isStaked(nftAddress1, ALICE, 0));
    assertEq(mockNFT1.balanceOf(ALICE), 0);

    // Highest weight should now be the nftAddress1
    assertEq(nftStaking.userHighestWeightNftAddress(ALICE), nftAddress1);

    // Staking second NFT
    nftStaking.stakeNFT(nftAddress2, 0, 0);
    assertTrue(nftStaking.isStaked(nftAddress2, ALICE, 0));
    assertEq(mockNFT2.balanceOf(ALICE), 0);

    // Highest weight should now be the nftAddress2
    assertEq(nftStaking.userHighestWeightNftAddress(ALICE), nftAddress2);

    // Assert Staking NFT address amount
    assertEq(nftStaking.userNFTInStakingPool(ALICE, nftAddress1), 1);
    assertEq(nftStaking.userNFTInStakingPool(ALICE, nftAddress2), 1);

    // Unstake second NFT which has higher weight
    nftStaking.unstakeNFT(nftAddress2, 0);

    // Should update highest weight to nftAddress1
    assertEq(nftStaking.userHighestWeightNftAddress(ALICE), nftAddress1);

    // Assert Staking NFT address amount after unstake nftAddress2
    assertEq(nftStaking.userNFTInStakingPool(ALICE, nftAddress1), 1);
    assertEq(nftStaking.userNFTInStakingPool(ALICE, nftAddress2), 0);

    vm.stopPrank();
  }

  function testUnstakeNFT_unstakeNotExistNFT() external {
    nftStaking.addPool(nftAddress1, 100, 0, 200);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    vm.expectRevert(NFTStakingLike.NFTStaking_NoNFTStaked.selector);
    nftStaking.unstakeNFT(nftAddress1, 0);
    vm.stopPrank();
  }

  function testUnstakeNFT_unstakeNFTIsNotExpired() external {
    nftStaking.addPool(nftAddress1, 100, 0, 1000);
    vm.warp(1641070800);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    assertEq(mockNFT1.balanceOf(ALICE), 1);
    // Stake NFT
    nftStaking.stakeNFT(nftAddress1, 0, mockLockUntil);
    assertEq(nftStaking.userNFTInStakingPool(ALICE, nftAddress1), 1);
    assertTrue(nftStaking.isStaked(nftAddress1, ALICE, 0));
    // Unstake NFT
    vm.expectRevert(NFTStakingLike.NFTStaking_IsNotExpired.selector);
    nftStaking.unstakeNFT(nftAddress1, 0);
    vm.stopPrank();
  }
}
