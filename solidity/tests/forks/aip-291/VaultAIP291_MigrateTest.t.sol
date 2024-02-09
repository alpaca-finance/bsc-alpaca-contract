// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import { VaultAIP291_BaseTest, VaultAip291, IERC20, IMoneyMarket } from "@tests/forks/aip-291/VaultAIP291_BaseTest.t.sol";

contract VaultAIP291_MigrateTest is VaultAIP291_BaseTest {
  function testRevert_whenNotDeployerCallMigrate_ShouldRevert() external {
    vm.expectRevert();
    VAULT_BUSD.migrate();
  }

  function testRevert_whenMigrateOutstandingDebtNotZero_ShouldRevert() external {
    vm.prank(deployer);
    vm.expectRevert("outstanding debt");
    VAULT_BUSD.migrate();
  }

  function testRevert_whenMigrateReservePoolNotZero_ShouldRevert() external {
    setVaultDebtShare(address(VAULT_BUSD), 0);
    vm.startPrank(deployer);
    vm.expectRevert("outstanding reservePool");
    VAULT_BUSD.migrate();
    vm.stopPrank();
  }

  function testCorrectness_whenMigrate_ShouldWork() external {
    // verify that there's no debt
    assertEq(VAULT_BUSD.vaultDebtShare(), 0);
    // verify that there's no reserve left
    assertEq(VAULT_BUSD.reservePool(), 0);

    uint256 startingBUSD = IERC20(VAULT_BUSD.token()).balanceOf(address(VAULT_BUSD));

    // prank as binance hot wallet to transfer USDT to deployer
    assertGt((IERC20(VAULT_BUSD.USDT()).balanceOf(0x4B16c5dE96EB2117bBE5fd171E4d203624B014aa)), startingBUSD);
    vm.startPrank(0x4B16c5dE96EB2117bBE5fd171E4d203624B014aa);
    IERC20(VAULT_BUSD.USDT()).transfer(deployer, startingBUSD);
    vm.stopPrank();

    vm.startPrank(deployer);
    // pull BUSD from the vault
    VAULT_BUSD.pullToken();
    // assume that we can convert BUSD <> USDT 1:1
    // deployer to send USDT directly back to the vault
    IERC20(VAULT_BUSD.USDT()).transfer(address(VAULT_BUSD), startingBUSD);
    // then call migrate
    VAULT_BUSD.migrate();
    vm.stopPrank();

    address newIbUSDT = IMoneyMarket(VAULT_BUSD.moneyMarket()).getIbTokenFromToken(VAULT_BUSD.USDT());

    // no busd and usdt remaning in vault token
    assertEq(IERC20(VAULT_BUSD.token()).balanceOf(address(VAULT_BUSD)), 0);
    assertEq(IERC20(VAULT_BUSD.USDT()).balanceOf(address(VAULT_BUSD)), 0);

    // newIbUSDT should be transfer to VAULT_BUSD
    assertGt(IERC20(newIbUSDT).balanceOf(address(VAULT_BUSD)), 0);

    // assert migration flag
    assert(VAULT_BUSD.migrated());
  }
}
