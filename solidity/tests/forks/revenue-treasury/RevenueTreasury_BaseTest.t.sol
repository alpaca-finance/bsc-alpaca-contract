// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import { console } from "@forge-std/console.sol";
import { TestBase } from "@forge-std/Base.sol";
import { StdCheatsSafe, StdCheats } from "@forge-std/StdCheats.sol";
import { StdStorage, stdStorageSafe } from "@forge-std/StdStorage.sol";
import { ATest } from "@tests/base/ATest.sol";

import { RevenueTreasury } from "solidity/contracts/8.10/protocol/RevenueTreasury.sol";
import { IxALPACAv2RevenueDistributor } from "solidity/contracts/8.10/protocol/interfaces/IxALPACAv2RevenueDistributor.sol";

interface ProxyAdminLike {
  function upgrade(address proxy, address implementation) external;
}

// solhint-disable contract-name-camelcase
contract RevenueTreasury_BaseTest is TestBase, ATest, StdCheats {
  address internal constant deployer = 0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51;
  address internal constant proxyAdmin = 0x5379F32C8D5F663EACb61eeF63F722950294f452;
  address internal constant timeLock = 0x2D5408f2287BF9F9B05404794459a846651D0a59;
  address internal constant alpaca = 0x8F0528cE5eF7B51152A59745bEfDD91D97091d2F;

  RevenueTreasury internal revenueTreasury = RevenueTreasury(0x08B5A95cb94f926a8B620E87eE92e675b35afc7E);
  IxALPACAv2RevenueDistributor internal revenueDistributor =
    IxALPACAv2RevenueDistributor(0x1cf437B1907BF6a13707418eAAf5794636c78033);

  function setUp() external {
    // Fork test based on tendery
    vm.createSelectFork(vm.envString("BSC_MAINNET_RPC"), 32932419);

    address revenueTreasuryImp = address(new RevenueTreasury());

    vm.prank(timeLock);
    ProxyAdminLike(proxyAdmin).upgrade(address(revenueTreasury), revenueTreasuryImp);
  }
}
