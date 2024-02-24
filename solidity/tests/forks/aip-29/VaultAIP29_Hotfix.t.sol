// SPDX-License-Identifier: MIT
pragma solidity >=0.6.6;

import { console } from "@forge-std/console.sol";
import { TestBase } from "@forge-std/Base.sol";
import { StdCheatsSafe, StdCheats } from "@forge-std/StdCheats.sol";
import { StdStorage, stdStorageSafe } from "@forge-std/StdStorage.sol";
import { ATest } from "@tests/base/ATest.sol";

import { IERC20 } from "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import { IMoneyMarket } from "solidity/contracts/6/protocol/interfaces/IMoneyMarket.sol";
import { VaultAip29HotFix } from "solidity/contracts/6/protocol/VaultAip29HotFix.sol";

interface ProxyAdminLike {
  function upgrade(address proxy, address implementation) external;
}

contract VaultAIP29_BaseTest is TestBase, ATest, StdCheats {
  address internal constant SCIX_STRAT = 0x49A54908E1335f8702Af5e5BF787Ce83bd2BF3ED;
  address internal constant deployer = 0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51;
  address internal constant proxyAdmin = 0x5379F32C8D5F663EACb61eeF63F722950294f452;
  address internal constant timeLock = 0x2D5408f2287BF9F9B05404794459a846651D0a59;

  VaultAip29HotFix public VAULT_BUSD = VaultAip29HotFix(0x7C9e73d4C71dae564d41F78d56439bB4ba87592f);

  function setUp() external {
    vm.createSelectFork(vm.envString("BSC_MAINNET_RPC"), 36382980);

    address vaultAip29Imp = address(new VaultAip29HotFix());

    vm.prank(timeLock);
    ProxyAdminLike(proxyAdmin).upgrade(address(VAULT_BUSD), vaultAip29Imp);
  }

  function testCorrectness_whenHotfixAppliedAndWithdraw_ShouldWork() external {
    uint256 _share = 200000 ether;
    deal(address(VAULT_BUSD), SCIX_STRAT, _share);

    uint256 _dealAmount = 1_000_000 ether;
    deal(VAULT_BUSD.token(), address(VAULT_BUSD), _dealAmount);

    vm.startPrank(deployer);
    VAULT_BUSD.setVaultDebtVal(8967198780974642181632752 - _dealAmount);
    vm.stopPrank();

    uint256 totalToken = VAULT_BUSD.totalToken();
    uint256 totalSuply = VAULT_BUSD.totalSupply();
    uint256 scixBUSDBefore = IERC20(VAULT_BUSD.token()).balanceOf(SCIX_STRAT);

    vm.startPrank(SCIX_STRAT);
    VAULT_BUSD.withdraw(_share);
    vm.stopPrank();

    uint256 scixBUSDAfter = IERC20(VAULT_BUSD.token()).balanceOf(SCIX_STRAT);

    uint256 receivedBUSD = scixBUSDAfter - scixBUSDBefore;
    uint256 expectedBUSD = (_share * totalToken) / totalSuply;

    assertApproxEqAbs(receivedBUSD, expectedBUSD, 1);
    assertGt(receivedBUSD, _share);
  }
}
