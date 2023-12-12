// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import { RevenueTreasury02_BaseTest, RevenueTreasury02 } from "solidity/tests/forks/revenue-treasury-02/RevenueTreasury02_BaseTest.t.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

// solhint-disable contract-name-camelcase
contract RevenueTreasury02_InitiateBuybackStrategyTest is RevenueTreasury02_BaseTest {
  function setUp() public override {
    super.setUp();
  }

  function testRevert_WhenRandomCallerTry_InitiateBuybackStrategy_ShouldRevert() external {
    vm.prank(address(10));
    vm.expectRevert(RevenueTreasury02.RevenueTreasury_Unauthorized.selector);
    revenueTreasury02.initiateBuybackStrategy();
  }

  function testCorrectness_WhenKeeper_InitiateBuybackStrategy_ShouldWork() external {
    deal(usdt, address(revenueTreasury02), 100 ether);

    vm.startPrank(keeper);
    revenueTreasury02.initiateBuybackStrategy();
    vm.stopPrank();

    assertEq(IERC20Upgradeable(usdt).balanceOf(address(revenueTreasury02)), 0);
  }
}
