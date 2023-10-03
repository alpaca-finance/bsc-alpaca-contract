// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import { VaultAIP25_BaseTest, VaultAip25, IERC20, IMoneyMarket } from "@tests/forks/aip-25/VaultAIP25_BaseTest.t.sol";

contract VaultAIP25_MigrateTest is VaultAIP25_BaseTest {
  function testRevert_whenNotDeployerCallMigrate_ShouldRevert() external {
    vm.expectRevert();
    VAULT_BTCB.migrate();
  }

  function testRevert_whenMigrateOutstandingDebtNotZero_ShouldRevert() external {
    vm.prank(deployer);
    vm.expectRevert("outstanding debt");
    VAULT_BTCB.migrate();
  }

  function testRevert_whenMigrateReservePoolNotZero_ShouldRevert() external {
    setVaultDebtShare(address(VAULT_BTCB), 0);
    vm.startPrank(deployer);
    vm.expectRevert("outstanding reservePool");
    VAULT_BTCB.migrate();
    vm.stopPrank();
  }

  function testCorrectness_whenMigrate_ShouldWork() external {
    // set vault debt to 0
    setVaultDebtShare(address(VAULT_BTCB), 0);

    // withdraw remaining reserve pool
    vm.startPrank(deployer);
    uint256 _reservePool = VAULT_BTCB.reservePool();
    VAULT_BTCB.withdrawReserve(deployer, _reservePool);
    vm.stopPrank();

    // migrate to moneymarket
    vm.prank(deployer);
    VAULT_BTCB.migrate();

    address newIbBTCB = IMoneyMarket(VAULT_BTCB.moneyMarket()).getIbTokenFromToken(VAULT_BTCB.token());

    // no btcb remaning in vault token
    assertEq(IERC20(VAULT_BTCB.token()).balanceOf(address(VAULT_BTCB)), 0);

    // newIbBTCB should be transfer to VAULT_BTCB
    assertGt(IERC20(newIbBTCB).balanceOf(address(VAULT_BTCB)), 0);

    // assert migration flag
    assert(VAULT_BTCB.migrated());
  }
}
