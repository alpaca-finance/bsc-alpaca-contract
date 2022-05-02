// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import "./base/DSTest.sol";
import { BaseTest, MockErc20Like, DebtTokenLike, SimpleVaultConfigLike, VaultLike, NFTStakingLike, MockNFTLike } from "./base/BaseTest.sol";

contract NFTStakingTest is BaseTest {
  NFTStakingLike private nftStaking;
  MockNFTLike private mockNFT1;
  MockNFTLike private mockNFT2;

  address private poolId1;
  address private poolId2;

  function setUp() external {
    nftStaking = _setupNFTStaking();
    mockNFT1 = _setupMockNFT();
    mockNFT2 = _setupMockNFT();

    poolId1 = address(mockNFT1);
    poolId2 = address(mockNFT2);
  }

  function testAddPool_correctParams() external {
    nftStaking.addPool(poolId1, 100, 0, 200);
    (bool isInit, uint256 poolWeight, uint256 minLockPeriod, uint256 maxLockPeriod) = nftStaking.poolInfo(poolId1);
    assertTrue(isInit);
    assertEq(poolWeight, 100);
    assertEq(minLockPeriod, 0);
    assertEq(maxLockPeriod, 200);
    assertTrue(nftStaking.isPoolExist(poolId1));
  }

  function testAddPool_alreadyExist() external {
    nftStaking.addPool(poolId1, 100, 0, 200);
    vm.expectRevert(NFTStakingLike.NFTStaking_PoolAlreadyExist.selector);
    nftStaking.addPool(poolId1, 100, 0, 200);
  }

  function testStakeNFT_eligibleNFT() external {
    nftStaking.addPool(poolId1, 100, 0, 200);

    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(2);
    mockNFT1.approve(address(nftStaking), 0);
    mockNFT1.approve(address(nftStaking), 1);
    assertEq(mockNFT1.balanceOf(ALICE), 2);
    nftStaking.stakeNFT(poolId1, 1, 20);
    vm.stopPrank();

    (bool isExist, uint256 nftTokenId, uint256 lockPeriod) = nftStaking.userStakingNFT(poolId1, ALICE, 1);
    assertEq(nftTokenId, 1);
    assertEq(lockPeriod, 20);
    assertTrue(isExist);
    assertEq(mockNFT1.balanceOf(ALICE), 1);
    assertEq(mockNFT1.balanceOf(address(nftStaking)), 1);
    assertTrue(nftStaking.isStaked(poolId1, ALICE, 1));
    assertTrue(!nftStaking.isStaked(poolId1, ALICE, 0));
  }

  function testStakeNFT_stakeNFTWithHigherWeight() external {
    nftStaking.addPool(poolId1, 100, 0, 200);
    nftStaking.addPool(poolId2, 140, 20, 220);

    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT2.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    mockNFT2.approve(address(nftStaking), 0);
    assertEq(mockNFT1.balanceOf(ALICE), 1);
    assertEq(mockNFT2.balanceOf(ALICE), 1);

    // Staking first NFT
    nftStaking.stakeNFT(poolId1, 0, 20);
    assertTrue(nftStaking.isStaked(poolId1, ALICE, 0));
    assertEq(mockNFT1.balanceOf(ALICE), 0);
    (bool isInit, uint256 poolWeight, uint256 minLockPeriod, uint256 maxLockPeriod) = nftStaking.poolInfo(
      nftStaking.userHighestWeightPoolId(ALICE)
    );
    assertTrue(isInit);
    assertEq(poolWeight, 100);
    assertEq(minLockPeriod, 0);
    assertEq(maxLockPeriod, 200);

    // Staking second NFT
    nftStaking.stakeNFT(poolId2, 0, 20);
    assertTrue(nftStaking.isStaked(poolId2, ALICE, 0));
    assertEq(mockNFT2.balanceOf(ALICE), 0);
    (isInit, poolWeight, minLockPeriod, maxLockPeriod) = nftStaking.poolInfo(nftStaking.userHighestWeightPoolId(ALICE));
    // Highest weight should now be the poolId2
    assertTrue(isInit);
    assertEq(poolWeight, 140);
    assertEq(minLockPeriod, 20);
    assertEq(maxLockPeriod, 220);
    vm.stopPrank();
  }

  function testStakeNFT_stakeNFTWithLowerWeight() external {
    nftStaking.addPool(poolId1, 100, 0, 200);
    nftStaking.addPool(poolId2, 140, 20, 220);

    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT2.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    mockNFT2.approve(address(nftStaking), 0);
    assertEq(mockNFT1.balanceOf(ALICE), 1);
    assertEq(mockNFT2.balanceOf(ALICE), 1);

    // Staking first NFT (Higher weight)
    nftStaking.stakeNFT(poolId2, 0, 20);
    assertTrue(nftStaking.isStaked(poolId2, ALICE, 0));
    assertEq(mockNFT2.balanceOf(ALICE), 0);
    (bool isInit, uint256 poolWeight, uint256 minLockPeriod, uint256 maxLockPeriod) = nftStaking.poolInfo(
      nftStaking.userHighestWeightPoolId(ALICE)
    );
    assertTrue(isInit);
    assertEq(poolWeight, 140);
    assertEq(minLockPeriod, 20);
    assertEq(maxLockPeriod, 220);

    // Staking second NFT
    nftStaking.stakeNFT(poolId1, 0, 20);
    assertTrue(nftStaking.isStaked(poolId1, ALICE, 0));
    assertEq(mockNFT1.balanceOf(ALICE), 0);
    (isInit, poolWeight, minLockPeriod, maxLockPeriod) = nftStaking.poolInfo(nftStaking.userHighestWeightPoolId(ALICE));
    // The weight should be the same
    assertTrue(isInit);
    assertEq(poolWeight, 140);
    assertEq(minLockPeriod, 20);
    assertEq(maxLockPeriod, 220);
    vm.stopPrank();
  }

  function testStakeNFT_stakeEligibleNFTAgain() external {
    nftStaking.addPool(poolId1, 100, 0, 200);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    assertEq(mockNFT1.balanceOf(ALICE), 1);
    nftStaking.stakeNFT(poolId1, 0, 20);
    assertTrue(nftStaking.isStaked(poolId1, ALICE, 0));
    vm.expectRevert(NFTStakingLike.NFTStaking_NFTAlreadyStaked.selector);
    nftStaking.stakeNFT(poolId1, 0, 30);
    vm.stopPrank();
  }

  function testStakeNFT_notApproveEligibleNFT() external {
    nftStaking.addPool(poolId1, 100, 0, 200);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    vm.expectRevert(bytes("ERC721: transfer caller is not owner nor approved"));
    nftStaking.stakeNFT(poolId1, 0, 20);
    vm.stopPrank();
  }

  function testStakeNFT_unAuthorized() external {
    nftStaking.addPool(poolId1, 100, 0, 200);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    vm.stopPrank();
    vm.expectRevert(NFTStakingLike.NFTStaking_Unauthorize.selector);
    nftStaking.stakeNFT(poolId1, 0, 20);
  }

  function testStakeNFT_nonExistNFT() external {
    nftStaking.addPool(poolId1, 100, 0, 200);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    vm.expectRevert(bytes("ERC721: operator query for nonexistent token"));
    nftStaking.stakeNFT(poolId1, 1, 20);
    vm.stopPrank();
  }

  function testUnstakeNFT_unstakeNFT() external {
    nftStaking.addPool(poolId1, 100, 0, 200);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    assertEq(mockNFT1.balanceOf(ALICE), 1);
    // Stake NFT
    nftStaking.stakeNFT(poolId1, 0, 20);
    assertTrue(nftStaking.isStaked(poolId1, ALICE, 0));
    // Unstake NFT
    nftStaking.unstakeNFT(poolId1, 0);
    assertTrue(!nftStaking.isStaked(poolId1, ALICE, 0));
    vm.stopPrank();
  }

  function testUnstakeNFT_updateHighestWeight() external {
    nftStaking.addPool(poolId1, 100, 0, 200);
    nftStaking.addPool(poolId2, 140, 20, 220);

    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT2.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    mockNFT2.approve(address(nftStaking), 0);
    assertEq(mockNFT1.balanceOf(ALICE), 1);
    assertEq(mockNFT2.balanceOf(ALICE), 1);

    // Staking first NFT
    nftStaking.stakeNFT(poolId1, 0, 20);
    assertTrue(nftStaking.isStaked(poolId1, ALICE, 0));
    assertEq(mockNFT1.balanceOf(ALICE), 0);
    (bool isInit, uint256 poolWeight, uint256 minLockPeriod, uint256 maxLockPeriod) = nftStaking.poolInfo(
      nftStaking.userHighestWeightPoolId(ALICE)
    );
    assertTrue(isInit);
    assertEq(poolWeight, 100);
    assertEq(minLockPeriod, 0);
    assertEq(maxLockPeriod, 200);

    // Staking second NFT
    nftStaking.stakeNFT(poolId2, 0, 20);
    assertTrue(nftStaking.isStaked(poolId2, ALICE, 0));
    assertEq(mockNFT2.balanceOf(ALICE), 0);
    (isInit, poolWeight, minLockPeriod, maxLockPeriod) = nftStaking.poolInfo(nftStaking.userHighestWeightPoolId(ALICE));
    // Highest weight should now be the poolId2
    assertTrue(isInit);
    assertEq(poolWeight, 140);
    assertEq(minLockPeriod, 20);
    assertEq(maxLockPeriod, 220);

    // Unstake second NFT which has higher weight
    nftStaking.unstakeNFT(poolId2, 0);
    // Should update highest weight to poolId1
    (isInit, poolWeight, minLockPeriod, maxLockPeriod) = nftStaking.poolInfo(nftStaking.userHighestWeightPoolId(ALICE));
    assertTrue(isInit);
    assertEq(poolWeight, 100);
    assertEq(minLockPeriod, 0);
    assertEq(maxLockPeriod, 200);
    vm.stopPrank();
  }

  function testUnstakeNFT_unstakeNotExistNFT() external {
    nftStaking.addPool(poolId1, 100, 0, 200);
    vm.startPrank(ALICE, ALICE);
    mockNFT1.mint(1);
    mockNFT1.approve(address(nftStaking), 0);
    vm.expectRevert(NFTStakingLike.NFTStaking_NoNFTStaked.selector);
    nftStaking.unstakeNFT(poolId1, 0);
    vm.stopPrank();
  }

  function testStakeNFT_invalidStakePeriod() external {
    
  }

}
