// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import { TreasuryBuybackStrategy_BaseTest, TreasuryBuybackStrategy, IPancakeV3MasterChef, ICommonV3Pool } from "solidity/tests/forks/treasury-buyback-strategy/TreasuryBuybackStrategy_BaseTest.t.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import { console } from "lib/forge-std/src/console.sol";

contract TreasuryBuybackStrategy_SwapTest is TreasuryBuybackStrategy_BaseTest {
  function setUp() public override {
    super.setUp();

    address[] memory _callers = new address[](1);
    _callers[0] = revenueTreasury;

    vm.prank(deployer);
    treasurybuybackStrat.setCallersOk(_callers, true);
  }

  function testCorrectness_WhenCallSwapOnTreasuryBuybackStrategy_ShouldWork() external {
    uint256 _swapAmount = 100 ether;

    vm.startPrank(revenueTreasury);

    deal(usdt, revenueTreasury, _swapAmount);

    uint256 usdtBefore = IERC20Upgradeable(usdt).balanceOf(revenueTreasury);
    uint256 alpacaBefore = IERC20Upgradeable(alpaca).balanceOf(revenueTreasury);

    (uint256 oracleExchangeRate, ) = treasurybuybackStrat.oracle().getPrice(usdt, alpaca);

    IERC20Upgradeable(usdt).approve(address(treasurybuybackStrat), _swapAmount);

    treasurybuybackStrat.swap(usdt, _swapAmount);

    vm.stopPrank();

    uint256 usdtAfter = IERC20Upgradeable(usdt).balanceOf(revenueTreasury);
    uint256 alpacaAfter = IERC20Upgradeable(alpaca).balanceOf(revenueTreasury);

    uint256 _minAmountOut = (_swapAmount * oracleExchangeRate * (10000 - treasurybuybackStrat.slippageBps())) /
      (1e18 * 10000);

    assertEq(usdtBefore - usdtAfter, _swapAmount);
    assertGt(alpacaAfter - alpacaBefore, _minAmountOut);
  }

  function testRevert_WhenCallSwapOnTreasuryBuybackStrategy_ButTooMuchPriceImpact_ShouldRevert() external {
    uint256 _swapAmount = 500_000 ether;

    vm.startPrank(revenueTreasury);

    deal(usdt, revenueTreasury, _swapAmount);

    uint256 usdtBefore = IERC20Upgradeable(usdt).balanceOf(revenueTreasury);
    uint256 alpacaBefore = IERC20Upgradeable(alpaca).balanceOf(revenueTreasury);

    IERC20Upgradeable(usdt).approve(address(treasurybuybackStrat), _swapAmount);

    vm.expectRevert();
    treasurybuybackStrat.swap(usdt, _swapAmount);

    vm.stopPrank();

    uint256 usdtAfter = IERC20Upgradeable(usdt).balanceOf(revenueTreasury);
    uint256 alpacaAfter = IERC20Upgradeable(alpaca).balanceOf(revenueTreasury);

    assertEq(usdtBefore - usdtAfter, 0);
    assertEq(alpacaAfter - alpacaBefore, 0);
  }
}
