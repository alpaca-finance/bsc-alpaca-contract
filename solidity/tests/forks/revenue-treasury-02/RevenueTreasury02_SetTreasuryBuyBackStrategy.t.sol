// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import { RevenueTreasury02_BaseTest, RevenueTreasury02 } from "solidity/tests/forks/revenue-treasury-02/RevenueTreasury02_BaseTest.t.sol";

// solhint-disable contract-name-camelcase
contract RevenueTreasury02_SetTreasuryBuyBackStrategyTest is RevenueTreasury02_BaseTest {
  function setUp() public override {
    super.setUp();
  }

  function testRevert_WhenRandomCallerTry_SetTreasuryBuyBackStrategy_ShouldRevert() external {
    vm.prank(address(10));
    vm.expectRevert("Ownable: caller is not the owner");
    revenueTreasury02.setTreasuryBuyBackStrategy(address(1));
  }

  function testRevert_WhenNtfTokenIdNotZero_OwnerTrytoSetNewTreasuryBuyBackStrategy_ShouldRevert() external {
    deal(usdt, address(revenueTreasury02), 100 ether);

    vm.startPrank(keeper);
    revenueTreasury02.initiateBuybackStrategy();
    vm.stopPrank();

    vm.startPrank(deployer);
    vm.expectRevert(RevenueTreasury02.ReveneuTreasury_BuybackStrategyDeployed.selector);
    revenueTreasury02.setTreasuryBuyBackStrategy(address(treasurybuybackStrat));
    vm.stopPrank();
  }

  function testRevert_WhenNtfTokenIdIsZero_OwnerTrytoSetNewTreasuryBuyBackStrategy_ShouldWork() external {
    vm.startPrank(deployer);
    revenueTreasury02.setTreasuryBuyBackStrategy(address(treasurybuybackStrat));
    vm.stopPrank();
  }
}
