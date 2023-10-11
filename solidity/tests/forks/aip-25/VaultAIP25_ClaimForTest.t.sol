// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import { VaultAIP25_BaseTest, VaultAip25, IERC20, IMoneyMarket, StdCheatsSafe } from "@tests/forks/aip-25/VaultAIP25_BaseTest.t.sol";
import { IERC20 } from "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";

contract VaultAIP25_ClaimForTest is VaultAIP25_BaseTest {
  function testRevert_whenClaimForBeforeMigrate_ShouldRevert() external {
    vm.expectRevert("!migrated");
    VAULT_BTCB.claimFor(address(this));
  }

  function testRevert_whenClaimForUserWhoDontOwnShare_ShouldRevert() external {
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

    vm.expectRevert("no shares");
    VAULT_BTCB.claimFor(address(this));
  }

  function testCorrectness_whenClaimForUser_ShouldWork() external {
    // set vault debt to 0
    setVaultDebtShare(address(VAULT_BTCB), 0);

    // withdraw remaining reserve pool
    vm.startPrank(deployer);
    uint256 _reservePool = VAULT_BTCB.reservePool();
    VAULT_BTCB.withdrawReserve(deployer, _reservePool);
    vm.stopPrank();

    uint256 _aliceShares = 2 ether;
    deal(address(VAULT_BTCB), ALICE, _aliceShares);

    // migrate to moneymarket
    vm.prank(deployer);
    VAULT_BTCB.migrate();

    address newIbBTCB = IMoneyMarket(VAULT_BTCB.moneyMarket()).getIbTokenFromToken(VAULT_BTCB.token());
    uint256 oldIbTotalSupplyBefore = VAULT_BTCB.totalSupply();
    uint256 newIbBalanceInVaultBefore = IERC20(newIbBTCB).balanceOf(address(VAULT_BTCB));

    VAULT_BTCB.claimFor(ALICE);

    uint256 oldIbTotalSupplyAfter = VAULT_BTCB.totalSupply();
    uint256 newIbBalanceInVaultAfter = IERC20(newIbBTCB).balanceOf(address(VAULT_BTCB));

    // assert alice' old ibToken burn
    assertEq(oldIbTotalSupplyBefore - oldIbTotalSupplyAfter, _aliceShares);

    // alice should be able to claim for _aliceShares * newIbBalnace / oldIbTotalSupply
    assertEq(
      newIbBalanceInVaultBefore - newIbBalanceInVaultAfter,
      (_aliceShares * newIbBalanceInVaultBefore) / oldIbTotalSupplyBefore
    );
  }
}
