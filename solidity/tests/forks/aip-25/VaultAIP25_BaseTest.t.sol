// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import { console } from "@forge-std/console.sol";
import { TestBase } from "@forge-std/Base.sol";
import { StdCheatsSafe, StdCheats } from "@forge-std/StdCheats.sol";
import { StdStorage, stdStorageSafe } from "@forge-std/StdStorage.sol";
import { ATest } from "@tests/base/ATest.sol";

import { IERC20 } from "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import { IMoneyMarket } from "solidity/contracts/6/protocol/interfaces/IMoneyMarket.sol";
import { VaultAip25 } from "solidity/contracts/6/protocol/VaultAip25.sol";

interface ProxyAdminLike {
  function upgrade(address proxy, address implementation) external;
}

contract VaultAIP25_BaseTest is TestBase, ATest, StdCheats {
  address internal ALICE = makeAddr("ALICE");
  address internal constant deployer = 0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51;
  address internal constant proxyAdmin = 0x5379F32C8D5F663EACb61eeF63F722950294f452;
  address internal constant timeLock = 0x2D5408f2287BF9F9B05404794459a846651D0a59;
  VaultAip25 public VAULT_BTCB = VaultAip25(0x08FC9Ba2cAc74742177e0afC3dC8Aed6961c24e7);

  function setUp() external {
    vm.createSelectFork(vm.envString("BSC_MAINNET_RPC"), 32249752);

    address vailtAIP25Imp = address(new VaultAip25());

    vm.prank(timeLock);
    ProxyAdminLike(proxyAdmin).upgrade(address(VAULT_BTCB), vailtAIP25Imp);
  }

  /// @dev function for set debtAmount to specify vault. Mockcall doesn't work with internal call.
  function setVaultDebtShare(address _vault, uint256 _debtAmount) internal {
    // find storage slot for vaultDebtShare
    uint256 vaultDebtShareSlot = stdstore.target(address(_vault)).sig("vaultDebtShare()").find();
    // assign value to the slot
    vm.store(address(_vault), bytes32(uint256(vaultDebtShareSlot)), bytes32(uint256(_debtAmount)));
  }
}
