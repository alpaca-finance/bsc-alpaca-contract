// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import { VaultAIP291_BaseTest, VaultAip291, IERC20, IMoneyMarket } from "@tests/forks/aip-291/VaultAIP291_BaseTest.t.sol";

contract VaultAIP291_PullTokenTest is VaultAIP291_BaseTest {
  function testRevert_whenNotDeployerCallPullToken_ShouldRevert() external {
    vm.expectRevert();
    VAULT_BUSD.migrate();
  }

  function testCorrectness_whenPullToken_ShouldWork() external {
    uint256 busdAmount = IERC20(VAULT_BUSD.token()).balanceOf(address(VAULT_BUSD));
    uint256 busdAmountOfDeployer = IERC20(VAULT_BUSD.token()).balanceOf(address(deployer));

    // pull token from vault
    vm.prank(deployer);
    VAULT_BUSD.pullToken();

    // all busd was transfered
    assertEq(IERC20(VAULT_BUSD.token()).balanceOf(address(VAULT_BUSD)), 0);
    assertEq(IERC20(VAULT_BUSD.token()).balanceOf(deployer), busdAmount + busdAmountOfDeployer);
  }
}
