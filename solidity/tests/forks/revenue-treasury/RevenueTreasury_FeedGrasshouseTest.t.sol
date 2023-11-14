// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import { RevenueTreasury_BaseTest, RevenueTreasury, console } from "@tests/forks/revenue-treasury/RevenueTreasury_BaseTest.t.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

// solhint-disable contract-name-camelcase
contract RevenueTreasury_FeedGrasshouseTest is RevenueTreasury_BaseTest {
  function testRevert_WhenFeedALPACAToRevenueDistributor_WithoutRewardTime_ShouldRevert() external {
    vm.startPrank(deployer);
    revenueTreasury.setRevenueDistributor(address(revenueDistributor));
    vm.stopPrank();

    vm.expectRevert();
    revenueTreasury.feedGrassHouse(0, 0);
  }

  function testRevert_SetInvalidRewardTime_ShouldRevert() external {
    vm.startPrank(deployer);

    // 1 hour
    vm.expectRevert(RevenueTreasury.RevenueTreasury_InvalidRewardTime.selector);
    revenueTreasury.setRewardTime(3600);

    vm.expectRevert(RevenueTreasury.RevenueTreasury_InvalidRewardTime.selector);
    revenueTreasury.setRewardTime(30 days + 1);

    vm.stopPrank();
  }

  function testCorrecness_WhenFeedALPACAToRevenueDistributor_ShouldWork() external {
    vm.startPrank(deployer);
    revenueTreasury.setRevenueDistributor(address(revenueDistributor));
    revenueTreasury.setRewardTime(1 weeks);
    vm.stopPrank();

    uint256 _distributorBalanceBefore = IERC20Upgradeable(alpaca).balanceOf(address(revenueDistributor));
    uint256 _trausryBalanceBefore = IERC20Upgradeable(alpaca).balanceOf(address(revenueTreasury));

    uint256 _feedAmount = 100000 ether;
    deal(address(alpaca), address(revenueTreasury), _feedAmount);
    revenueTreasury.feedGrassHouse(0, 0);

    uint256 _distributorBalanceAfter = IERC20Upgradeable(alpaca).balanceOf(address(revenueDistributor));

    // extra token from vault token swap to alpaca
    assertGe(_distributorBalanceAfter - _distributorBalanceBefore, _trausryBalanceBefore + _feedAmount);
  }
}
