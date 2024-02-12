// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import { console } from "@forge-std/console.sol";
import { TestBase } from "@forge-std/Base.sol";
import { StdCheatsSafe, StdCheats } from "@forge-std/StdCheats.sol";
import { StdStorage, stdStorageSafe } from "@forge-std/StdStorage.sol";
import { ATest } from "@tests/base/ATest.sol";

import { IERC20 } from "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import { IMoneyMarket } from "solidity/contracts/6/protocol/interfaces/IMoneyMarket.sol";
import { VaultAip29 } from "solidity/contracts/6/protocol/VaultAip29.sol";

interface ProxyAdminLike {
  function upgrade(address proxy, address implementation) external;
}

contract VaultAIP29_BaseTest is TestBase, ATest, StdCheats {
  address internal ALICE = makeAddr("ALICE");
  address internal constant deployer = 0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51;
  address internal constant proxyAdmin = 0x5379F32C8D5F663EACb61eeF63F722950294f452;
  address internal constant timeLock = 0x2D5408f2287BF9F9B05404794459a846651D0a59;
  VaultAip29 public VAULT_BUSD = VaultAip29(0x7C9e73d4C71dae564d41F78d56439bB4ba87592f);

  function setUp() external {
    vm.createSelectFork(vm.envString("BSC_MAINNET_RPC"), 35978710);

    address vaultAip29Imp = address(new VaultAip29());

    vm.prank(timeLock);
    ProxyAdminLike(proxyAdmin).upgrade(address(VAULT_BUSD), vaultAip29Imp);
  }

  /// @dev function for set debtAmount to specify vault. Mockcall doesn't work with internal call.
  function setVaultDebtShare(address _vault, uint256 _debtAmount) internal {
    // find storage slot for vaultDebtShare
    uint256 vaultDebtShareSlot = stdstore.target(address(_vault)).sig("vaultDebtShare()").find();
    // assign value to the slot
    vm.store(address(_vault), bytes32(uint256(vaultDebtShareSlot)), bytes32(uint256(_debtAmount)));
  }

  function _migrate() internal {
    // migrate to moneymarket
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
  }
}
