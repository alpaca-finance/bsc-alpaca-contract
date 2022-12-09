// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, DeltaNeutralVault04Like, MockErc20Like, MockLpErc20Like, console } from "../../base/BaseTest.sol";

import { DeltaNeutralVault04Base_Test } from "../delta-neutral-04/DeltaNeutralVault04Base.t.sol";
import { AVMigration } from "solidity/contracts/8.13/AVMigration.sol";
import { IAVMigrationStruct } from "solidity/contracts/8.13/interfaces/IAVMigrationStruct.sol";

contract AVMigration_Test is DeltaNeutralVault04Base_Test {
  AVMigration internal _avMigration;
  DeltaNeutralVault04Like internal _deltaNeutralVaultDst;

  function setUp() public override {
    super.setUp();

    _deltaNeutralVaultDst = _setupDeltaNeutralVault04(
      "TEST VAULT",
      "TV",
      address(_stableVault),
      address(_assetVault),
      address(_stableVaultWorker),
      address(_assetVaultWorker),
      address(_lpToken),
      address(_alpacaToken),
      address(_priceOracle),
      address(_config)
    );
    _deltaNeutralVaultDst.setDeltaNeutralVaultHealthChecker(address(_checker));

    _avMigration = new AVMigration();
    IAVMigrationStruct.VaultMigrationPath[] memory arr = new IAVMigrationStruct.VaultMigrationPath[](1);
    arr[0] = IAVMigrationStruct.VaultMigrationPath(address(_deltaNeutralVault), address(_deltaNeutralVaultDst));
    _avMigration.setMigrationPaths(arr);
  }

  function testCorrectness_MigrateShouldWork() external {
    _depositForAlice();
    vm.startPrank(ALICE, ALICE);
    _deltaNeutralVault.approve(address(_avMigration), 2**256 - 1);

    _avMigration.migrate(address(_deltaNeutralVault), 0, 0);
  }

  function testRevert_WhenCallerIsNotOwner_SetMigrationPathsShouldRevert() external {
    IAVMigrationStruct.VaultMigrationPath[] memory arr = new IAVMigrationStruct.VaultMigrationPath[](1);
    arr[0] = IAVMigrationStruct.VaultMigrationPath(address(_deltaNeutralVault), address(_deltaNeutralVaultDst));
    vm.prank(ALICE);
    vm.expectRevert("Ownable: caller is not the owner");
    _avMigration.setMigrationPaths(arr);
  }

  function testRevert_NoDestinationVaultInPaths_MigrateShouldRevert() external {
    _depositForAlice();
    vm.startPrank(ALICE, ALICE);
    _deltaNeutralVault.approve(address(_avMigration), 2**256 - 1);

    vm.expectRevert(AVMigration.AVMigration_DestinationVaultDoesNotExist.selector);
    _avMigration.migrate(address(ALICE), 0, 0);
  }

  function testRevert_WhenCallerIsNotWhitelistedEOA_MigrateShouldRevert() external {
    _deltaNeutralVault.approve(address(_avMigration), 2**256 - 1);
    vm.expectRevert(abi.encodeWithSelector(AVMigration.AVMigration_Unauthorized.selector, address(this)));
    _avMigration.migrate(address(_deltaNeutralVault), 0, 0);
  }
}
