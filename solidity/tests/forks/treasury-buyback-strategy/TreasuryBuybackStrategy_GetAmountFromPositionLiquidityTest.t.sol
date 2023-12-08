// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import { TreasuryBuybackStrategy_BaseTest, TreasuryBuybackStrategy, IPancakeV3MasterChef, ICommonV3Pool } from "solidity/tests/forks/treasury-buyback-strategy/TreasuryBuybackStrategy_BaseTest.t.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import { console } from "lib/forge-std/src/console.sol";

contract TreasuryBuybackStrategy_GetAmountFomPositionLiquidityTest is TreasuryBuybackStrategy_BaseTest {
  function setUp() public override {
    super.setUp();

    address[] memory _callers = new address[](1);
    _callers[0] = revenueTreasury;

    vm.prank(deployer);
    treasurybuybackStrat.setCallersOk(_callers, true);
  }

  function testCorrectness_WhenNoPositionOpened_ThenCallGetAmountFromPosition_ShouldWork() public {
    (uint256 _amount0, uint256 _amount1) = treasurybuybackStrat.getAmountsFromPositionLiquidity();

    assertEq(_amount0, 0);
    assertEq(_amount1, 0);
  }

  function testCorrectness_WhenPositionOpened_ThenCallGetAmountFromPosition_ShouldReturnCorrectAmounts() public {
    uint256 _desiredAmount = 1000 ether;
    deal(usdt, revenueTreasury, _desiredAmount);

    assertEq(treasurybuybackStrat.nftTokenId(), 0);

    // Placed limit order
    vm.startPrank(revenueTreasury);
    IERC20Upgradeable(usdt).approve(address(treasurybuybackStrat), _desiredAmount);
    treasurybuybackStrat.openPosition(_desiredAmount);
    vm.stopPrank();

    // swap alpaca for usdt in the pool, token1 for token0
    // make current tick between position loweTick and upperTick
    uint256 _swapAmount = 35000 ether;
    _swapExactInput(alpaca, _swapAmount);

    IPancakeV3MasterChef.UserPositionInfo memory _positionInfo = treasurybuybackStrat.masterChef().userPositionInfos(
      treasurybuybackStrat.nftTokenId()
    );
    (, int24 _currenrTick, , , , , ) = ICommonV3Pool(usdt_alpaca_100_pool).slot0();

    assertNotEq(treasurybuybackStrat.nftTokenId(), 0);
    assertNotEq(_positionInfo.liquidity, 0);
    assertTrue(_positionInfo.tickLower < _currenrTick);
    assertTrue(_positionInfo.tickUpper > _currenrTick);

    // collect tradingFee first for asserting exact amounts
    vm.startPrank(address(treasurybuybackStrat));
    IPancakeV3MasterChef(masterChef).collect(
      IPancakeV3MasterChef.CollectParams({
        tokenId: treasurybuybackStrat.nftTokenId(),
        recipient: address(this),
        amount0Max: type(uint128).max,
        amount1Max: type(uint128).max
      })
    );
    vm.stopPrank();

    (uint256 _amount0, uint256 _amount1) = treasurybuybackStrat.getAmountsFromPositionLiquidity();

    uint256 _usdtBalanceBefore = IERC20Upgradeable(usdt).balanceOf(revenueTreasury);
    uint256 _alpacaBalanceBefore = IERC20Upgradeable(alpaca).balanceOf(revenueTreasury);

    vm.startPrank(revenueTreasury);
    treasurybuybackStrat.closePosition();
    vm.stopPrank();

    uint256 _usdtBalanceAfter = IERC20Upgradeable(usdt).balanceOf(revenueTreasury);
    uint256 _alpacaBalanceAfter = IERC20Upgradeable(alpaca).balanceOf(revenueTreasury);

    // assert amounts
    assertEq(_usdtBalanceAfter - _usdtBalanceBefore, _amount0);
    assertEq(_alpacaBalanceAfter - _alpacaBalanceBefore, _amount1);
  }
}
