// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import { TreasuryBuybackStrategy_BaseTest, TreasuryBuybackStrategy, IPancakeV3MasterChef, ICommonV3Pool } from "solidity/tests/forks/treasury-buyback-strategy/TreasuryBuybackStrategy_BaseTest.t.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import { console } from "lib/forge-std/src/console.sol";

contract TreasuryBuybackStrategy_OpenPositionTest is TreasuryBuybackStrategy_BaseTest {
  function setUp() public override {
    super.setUp();
  }

  function testCorrectness_WhenAccumTokenIsToken1_ThenOpenPosition_ShouldPlacePositionAboveCurrentTick() external {
    uint256 _desiredAmount = 1000 ether;
    deal(usdt, revenueTreasury, _desiredAmount);

    assertEq(treasurybuybackStrat.nftTokenId(), 0);

    vm.startPrank(revenueTreasury);
    IERC20Upgradeable(usdt).approve(address(treasurybuybackStrat), _desiredAmount);
    treasurybuybackStrat.openPosition(_desiredAmount);
    vm.stopPrank();

    IPancakeV3MasterChef.UserPositionInfo memory _positionInfo = treasurybuybackStrat.masterChef().userPositionInfos(
      treasurybuybackStrat.nftTokenId()
    );

    (, int24 _currenrTick, , , , , ) = ICommonV3Pool(usdt_alpaca_100_pool).slot0();

    assertNotEq(treasurybuybackStrat.nftTokenId(), 0);
    assertNotEq(_positionInfo.liquidity, 0);
    assertTrue(_positionInfo.tickLower > _currenrTick);
    assertTrue(_positionInfo.tickUpper > _currenrTick);
    // all token0 is palced in position for buying token1
    assertEq(IERC20Upgradeable(usdt).balanceOf((address(treasurybuybackStrat))), 0);
  }

  function testCorrectness_WhenAccumTokenIsToken0_ThenOpenPosition_ShouldPlacePositionBelowCurrentTick() external {
    vm.prank(deployer);
    treasurybuybackStrat.setAccumToken(usdt);

    uint256 _desiredAmount = 1000 ether;
    deal(alpaca, revenueTreasury, _desiredAmount);

    assertEq(treasurybuybackStrat.nftTokenId(), 0);

    vm.startPrank(revenueTreasury);
    IERC20Upgradeable(alpaca).approve(address(treasurybuybackStrat), _desiredAmount);
    treasurybuybackStrat.openPosition(_desiredAmount);
    vm.stopPrank();

    IPancakeV3MasterChef.UserPositionInfo memory _positionInfo = treasurybuybackStrat.masterChef().userPositionInfos(
      treasurybuybackStrat.nftTokenId()
    );

    (, int24 _currenrTick, , , , , ) = ICommonV3Pool(usdt_alpaca_100_pool).slot0();

    assertNotEq(treasurybuybackStrat.nftTokenId(), 0);
    assertNotEq(_positionInfo.liquidity, 0);
    assertTrue(_positionInfo.tickLower < _currenrTick);
    assertTrue(_positionInfo.tickUpper < _currenrTick);
    // all token1 is palced in position for buying token0
    assertEq(IERC20Upgradeable(alpaca).balanceOf((address(treasurybuybackStrat))), 0);
  }

  function testRevert_WhenOrderIsPlaced_ThenTryPlaceOrderAgain_ShouldRevert() public {
    uint256 _desiredAmount = 1000 ether;
    deal(usdt, revenueTreasury, 2 * _desiredAmount);

    assertEq(treasurybuybackStrat.nftTokenId(), 0);

    vm.startPrank(revenueTreasury);
    IERC20Upgradeable(usdt).approve(address(treasurybuybackStrat), _desiredAmount);
    treasurybuybackStrat.openPosition(_desiredAmount);

    vm.expectRevert(TreasuryBuybackStrategy.TreasuryBuybackStrategy_PositionAlreadyExist.selector);
    treasurybuybackStrat.openPosition(_desiredAmount);
    vm.stopPrank();
  }

  function testRevert_WhenUnAuthorizedCallerTryToPlaceOrder_ShouldRevert() public {
    vm.prank(address(1));
    vm.expectRevert(TreasuryBuybackStrategy.TreasuryBuybackStrategy_Unauthorized.selector);
    treasurybuybackStrat.openPosition(0);
  }
}
