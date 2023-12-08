// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import { TreasuryBuybackStrategy_BaseTest, TreasuryBuybackStrategy, IPancakeV3MasterChef, ICommonV3Pool } from "solidity/tests/forks/treasury-buyback-strategy/TreasuryBuybackStrategy_BaseTest.t.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import { console } from "lib/forge-std/src/console.sol";

contract TreasuryBuybackStrategy_ClosePositionTest is TreasuryBuybackStrategy_BaseTest {
  function setUp() public override {
    super.setUp();
  }

  function testCorrectness_WhenPositionIsOpened_ThenClosePosition_ShouldWork() external {
    uint256 _desiredAmount = 1000 ether;
    deal(usdt, revenueTreasury, _desiredAmount);

    assertEq(treasurybuybackStrat.nftTokenId(), 0);

    // Placed limit order
    vm.startPrank(revenueTreasury);
    IERC20Upgradeable(usdt).approve(address(treasurybuybackStrat), _desiredAmount);
    treasurybuybackStrat.openPosition(_desiredAmount);
    vm.stopPrank();

    uint256 _previousTokenId = treasurybuybackStrat.nftTokenId();
    IPancakeV3MasterChef.UserPositionInfo memory _positionInfo = treasurybuybackStrat.masterChef().userPositionInfos(
      _previousTokenId
    );

    (, int24 _currenrTick, , , , , ) = ICommonV3Pool(usdt_alpaca_100_pool).slot0();

    assertNotEq(treasurybuybackStrat.nftTokenId(), 0);
    assertNotEq(_positionInfo.liquidity, 0);
    assertTrue(_positionInfo.tickLower > _currenrTick);
    assertTrue(_positionInfo.tickUpper > _currenrTick);

    // swap alpaca for usdt in the pool, token1 for token0
    // make current tick between position loweTick and upperTick
    uint256 _swapAmount = 25000 ether;
    _swapExactInput(alpaca, _swapAmount);

    // roll block time stamp for getting cake reward
    vm.warp(block.timestamp + 1000);

    uint256 usdtBalanceBefore = IERC20Upgradeable(usdt).balanceOf(revenueTreasury);
    uint256 alpacaBalanceBefore = IERC20Upgradeable(alpaca).balanceOf(revenueTreasury);
    uint256 cakeBalanceBefore = IERC20Upgradeable(cake).balanceOf(revenueTreasury);

    // remove liquidity
    vm.startPrank(revenueTreasury);
    treasurybuybackStrat.closePosition();
    vm.stopPrank();

    uint256 usdtBalanceAfter = IERC20Upgradeable(usdt).balanceOf(revenueTreasury);
    uint256 alpacaBalanceAfter = IERC20Upgradeable(alpaca).balanceOf(revenueTreasury);
    uint256 cakeBalanceAfter = IERC20Upgradeable(cake).balanceOf(revenueTreasury);

    _positionInfo = treasurybuybackStrat.masterChef().userPositionInfos(_previousTokenId);

    // nft is burnt and set nftTokenId
    assertEq(treasurybuybackStrat.nftTokenId(), 0);

    //should have no token left in buy back strategy
    assertEq(IERC20Upgradeable(usdt).balanceOf(address(treasurybuybackStrat)), 0);
    assertEq(IERC20Upgradeable(alpaca).balanceOf(address(treasurybuybackStrat)), 0);
    assertEq(IERC20Upgradeable(cake).balanceOf(address(treasurybuybackStrat)), 0);

    // tokens transfer to revenueTreasury
    assertTrue(usdtBalanceAfter > usdtBalanceBefore);
    assertTrue(alpacaBalanceAfter > alpacaBalanceBefore);
    assertTrue(cakeBalanceAfter > cakeBalanceBefore);

    // Placed another limit order
    vm.startPrank(revenueTreasury);
    _desiredAmount = IERC20Upgradeable(usdt).balanceOf(revenueTreasury);
    IERC20Upgradeable(usdt).approve(address(treasurybuybackStrat), _desiredAmount);
    treasurybuybackStrat.openPosition(_desiredAmount);
    vm.stopPrank();

    _positionInfo = treasurybuybackStrat.masterChef().userPositionInfos(treasurybuybackStrat.nftTokenId());

    // shoudl work
    assertNotEq(treasurybuybackStrat.nftTokenId(), 0);
    assertNotEq(_positionInfo.liquidity, 0);
  }

  function testRevert_WhenPositionNotOpen_ThenTryToClosePosition_ShouldRevert() public {
    vm.startPrank(revenueTreasury);
    vm.expectRevert(TreasuryBuybackStrategy.TreasuryBuybackStrategy_PositionNotExist.selector);
    treasurybuybackStrat.closePosition();
    vm.stopPrank();
  }

  function testRevert_WhenUnAuthorizedCallerTryToClosePosition_ShouldRevert() public {
    vm.prank(address(1));
    vm.expectRevert(TreasuryBuybackStrategy.TreasuryBuybackStrategy_Unauthorized.selector);
    treasurybuybackStrat.closePosition();
  }
}
