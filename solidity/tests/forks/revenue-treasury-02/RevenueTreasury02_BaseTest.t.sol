// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import { console } from "@forge-std/console.sol";
import { TestBase } from "@forge-std/Base.sol";
import { StdCheatsSafe, StdCheats } from "@forge-std/StdCheats.sol";
import { StdStorage, stdStorageSafe } from "@forge-std/StdStorage.sol";
import { ATest } from "@tests/base/ATest.sol";

import { RevenueTreasury02 } from "solidity/contracts/8.10/protocol/RevenueTreasury02.sol";
import { IxALPACAv2RevenueDistributor } from "solidity/contracts/8.10/protocol/interfaces/IxALPACAv2RevenueDistributor.sol";
import { TreasuryBuybackStrategy_BaseTest, TreasuryBuybackStrategy, IPancakeV3MasterChef, ICommonV3Pool } from "solidity/tests/forks/treasury-buyback-strategy/TreasuryBuybackStrategy_BaseTest.t.sol";

interface ProxyAdminLike {
  function upgrade(address proxy, address implementation) external;
}

// solhint-disable contract-name-camelcase
contract RevenueTreasury02_BaseTest is TreasuryBuybackStrategy_BaseTest {
  address internal keeper = makeAddr("keeper");

  RevenueTreasury02 internal revenueTreasury02 = RevenueTreasury02(0x08B5A95cb94f926a8B620E87eE92e675b35afc7E);
  IxALPACAv2RevenueDistributor internal revenueDistributor =
    IxALPACAv2RevenueDistributor(0xABBEE41c790556b1c1994AbBCeE898933Dd8C609);

  function setUp() public virtual override {
    super.setUp();

    address revenueTreasury02Imp = address(new RevenueTreasury02());

    vm.prank(timeLock);
    ProxyAdminLike(proxyAdmin).upgrade(address(revenueTreasury02), revenueTreasury02Imp);

    // whitelised
    vm.startPrank(deployer);

    address[] memory _callers = new address[](1);
    _callers[0] = keeper;
    revenueTreasury02.setCallersOk(_callers, true);

    revenueTreasury02.setTreasuryBuyBackStrategy(address(treasurybuybackStrat));
    assertNotEq(address(revenueTreasury02.treasuryBuybackStrategy()), address(0));

    revenueTreasury02.setToken(usdt);

    vm.stopPrank();
  }
}
