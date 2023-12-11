// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import { RevenueTreasury02_BaseTest, RevenueTreasury02 } from "solidity/tests/forks/revenue-treasury-02/RevenueTreasury02_BaseTest.t.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

// solhint-disable contract-name-camelcase
contract RevenueTreasury02_SwapStrategyTest is RevenueTreasury02_BaseTest {
  function setUp() public override {
    super.setUp();
  }

  function testRevert_WhenRandomCallerTry_SwapStrategy_ShouldRevert() external {
    vm.prank(address(10));
    vm.expectRevert(RevenueTreasury02.RevenueTreasury_Unauthorized.selector);
    revenueTreasury02.swapStrategy(1);
  }

  function testCorrectness_WhenKeeper_CallSwapStrategy_ShouldWork() external {
    deal(usdt, address(revenueTreasury02), 100 ether);
    uint256 _usdtBalanceBefore = IERC20Upgradeable(usdt).balanceOf(address(revenueTreasury02));
    uint256 _alpacaBalanceBefore = IERC20Upgradeable(alpaca).balanceOf(address(revenueTreasury02));

    vm.startPrank(keeper);
    revenueTreasury02.swapStrategy(_usdtBalanceBefore);
    vm.stopPrank();

    assertEq(IERC20Upgradeable(usdt).balanceOf(address(revenueTreasury02)), 0);
    assertGt(IERC20Upgradeable(usdt).balanceOf(address(revenueTreasury02)) - _alpacaBalanceBefore, 0);
  }
}
