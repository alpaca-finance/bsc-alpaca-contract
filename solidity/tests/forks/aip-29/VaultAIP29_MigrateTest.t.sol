// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import { VaultAIP29_BaseTest, VaultAip29, IERC20, IMoneyMarket } from "@tests/forks/aip-29/VaultAIP29_BaseTest.t.sol";

contract VaultAIP29_MigrateTest is VaultAIP29_BaseTest {
  function testRevert_whenNotDeployerCallMigrate_ShouldRevert() external {
    vm.expectRevert();
    VAULT_BUSD.migrate();
  }

  function testCorrectness_whenMigrate_ShouldWork() external {
    // verify that there's no debt
    assertEq(VAULT_BUSD.vaultDebtShare(), 0);
    // verify that there's no reserve left
    assertEq(VAULT_BUSD.reservePool(), 0);

    _migrate();

    address newIbUSDT = VAULT_BUSD.newIbToken();

    assertEq(newIbUSDT, 0x90476BFEF61F190b54a439E2E98f8E43Fb9b4a45);

    // no busd and usdt remaning in vault token
    assertEq(IERC20(VAULT_BUSD.token()).balanceOf(address(VAULT_BUSD)), 0);
    assertEq(IERC20(VAULT_BUSD.USDT()).balanceOf(address(VAULT_BUSD)), 0);

    // newIbUSDT should be transfer to VAULT_BUSD
    assertGt(IERC20(newIbUSDT).balanceOf(address(VAULT_BUSD)), 0);

    // assert migration flag
    assert(VAULT_BUSD.migrated());
  }
}
