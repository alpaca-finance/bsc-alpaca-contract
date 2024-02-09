// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import { VaultAIP291_BaseTest, VaultAip291, IERC20 } from "@tests/forks/aip-291/VaultAIP291_BaseTest.t.sol";
import { IERC20 } from "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";

contract VaultAIP291_WithdrawTest is VaultAIP291_BaseTest {
  function testCorrectness_whenAlreadyMigratedAndWithdraw_ShouldWork() external {
    uint256 _aliceShares = 2 ether;
    deal(address(VAULT_BUSD), ALICE, _aliceShares);

    _migrate();

    uint256 totalSupplyBefore = VAULT_BUSD.totalSupply();
    uint256 totalTokenBefore = VAULT_BUSD.totalToken();
    uint256 aliceUSDTBefore = IERC20(VAULT_BUSD.USDT()).balanceOf(ALICE);

    vm.prank(ALICE);
    VAULT_BUSD.withdraw(_aliceShares);

    uint256 aliceUSDTAfter = IERC20(VAULT_BUSD.USDT()).balanceOf(ALICE);

    uint256 receivedBTC = aliceUSDTAfter - aliceUSDTBefore;
    uint256 expectedBTC = (_aliceShares * totalTokenBefore) / totalSupplyBefore;
    assertApproxEqAbs(receivedBTC, expectedBTC, 1);
  }

  function testRevert_whenWithdrawBeforeMigrate_ShouldRevert() external {
    // set vault debt to 0
    setVaultDebtShare(address(VAULT_BUSD), 0);

    uint256 _aliceShares = 2 ether;
    deal(address(VAULT_BUSD), ALICE, _aliceShares);

    vm.prank(ALICE);
    vm.expectRevert("!allow");
    VAULT_BUSD.withdraw(_aliceShares);
  }
}
