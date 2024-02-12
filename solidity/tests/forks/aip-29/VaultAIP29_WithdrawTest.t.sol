// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import { VaultAIP29_BaseTest, VaultAip29, IERC20 } from "@tests/forks/aip-29/VaultAIP29_BaseTest.t.sol";
import { IERC20 } from "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";

contract VaultAIP29_WithdrawTest is VaultAIP29_BaseTest {
  function testCorrectness_whenAlreadyMigratedAndWithdraw_ShouldWork() external {
    uint256 _aliceShares = 2 ether;
    deal(address(VAULT_BUSD), ALICE, _aliceShares);

    _migrate();

    uint256 totalSupplyBefore = VAULT_BUSD.totalSupply();
    uint256 totalTokenBefore = VAULT_BUSD.totalToken();
    assertEq(totalTokenBefore, 0);
    uint256 aliceUSDTBefore = IERC20(VAULT_BUSD.USDT()).balanceOf(ALICE);

    vm.startPrank(ALICE);
    VAULT_BUSD.withdraw(_aliceShares);
    vm.stopPrank();

    uint256 aliceUSDTAfter = IERC20(VAULT_BUSD.USDT()).balanceOf(ALICE);

    uint256 receivedUSDT = aliceUSDTAfter - aliceUSDTBefore;
    uint256 expectedUSDT = (_aliceShares * totalTokenBefore) / totalSupplyBefore;
    assertApproxEqAbs(receivedUSDT, expectedUSDT, 1);
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
