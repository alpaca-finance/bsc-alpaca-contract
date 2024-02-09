// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import { VaultAIP291_BaseTest, VaultAip291, IERC20, IMoneyMarket, StdCheatsSafe } from "@tests/forks/aip-291/VaultAIP291_BaseTest.t.sol";
import { IERC20 } from "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";

contract VaultAIP291_ClaimForTest is VaultAIP291_BaseTest {
  function testRevert_whenClaimForBeforeMigrate_ShouldRevert() external {
    vm.expectRevert("!migrated");
    VAULT_BUSD.claimFor(address(this));
  }

  function testRevert_whenClaimForUserWhoDontOwnShare_ShouldRevert() external {
    _migrate();

    vm.expectRevert("no shares");
    VAULT_BUSD.claimFor(address(this));
  }

  function testCorrectness_whenClaimIbUSDTForUser_ShouldWork() external {
    uint256 _aliceShares = 2 ether;
    deal(address(VAULT_BUSD), ALICE, _aliceShares);

    _migrate();
    address newIbUSDT = VAULT_BUSD.newIbToken();
    assertEq(newIbUSDT, 0x90476BFEF61F190b54a439E2E98f8E43Fb9b4a45);

    // newIbUSDT should be transfer to VAULT_BUSD
    assertGt(IERC20(newIbUSDT).balanceOf(address(VAULT_BUSD)), 0);

    uint256 oldIbTotalSupplyBefore = VAULT_BUSD.totalSupply();
    uint256 newIbBalanceInVaultBefore = IERC20(newIbUSDT).balanceOf(address(VAULT_BUSD));

    VAULT_BUSD.claimFor(ALICE);

    uint256 oldIbTotalSupplyAfter = VAULT_BUSD.totalSupply();
    uint256 newIbBalanceInVaultAfter = IERC20(newIbUSDT).balanceOf(address(VAULT_BUSD));

    // assert alice' old ibToken burn
    assertEq(oldIbTotalSupplyBefore - oldIbTotalSupplyAfter, _aliceShares);

    // alice should be able to claim for _aliceShares * newIbBalnace / oldIbTotalSupply
    assertEq(
      newIbBalanceInVaultBefore - newIbBalanceInVaultAfter,
      (_aliceShares * newIbBalanceInVaultBefore) / oldIbTotalSupplyBefore
    );
  }
}
