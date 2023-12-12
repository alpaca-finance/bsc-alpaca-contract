// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import { RevenueTreasury02_BaseTest } from "solidity/tests/forks/revenue-treasury-02/RevenueTreasury02_BaseTest.t.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

// solhint-disable contract-name-camelcase
contract RevenueTreasury02_FeedRevenueDistributorTest is RevenueTreasury02_BaseTest {
  function setUp() public override {
    super.setUp();
  }

  function testCorrectness_WhenCallFeedRevenueDistributor_ShoudWork() external {
    uint256 _feedAmount = 100_000 ether;
    deal(alpaca, address(revenueTreasury02), _feedAmount);

    uint256 _balanceBefore = IERC20Upgradeable(alpaca).balanceOf(address(revenueDistributor));

    revenueTreasury02.feedRevenueDistributor();

    uint256 _balanceAfter = IERC20Upgradeable(alpaca).balanceOf(address(revenueDistributor));

    assertEq(_balanceAfter - _balanceBefore, _feedAmount);
  }
}
