// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { DeltaNeutralVault04Base_Test } from "./DeltaNeutralVault04Base.t.sol";

import { BaseTest, DeltaNeutralVault04Like, MockErc20Like, MockLpErc20Like, console } from "../../base/BaseTest.sol";
import { DeltaNeutralVaultReader } from "../../../contracts/8.13/DeltaNeutralVaultReader.sol";
import { IDeltaNeutralVault } from "../../../contracts/8.13/interfaces/IDeltaNeutralVault.sol";
import { mocking } from "../../utils/mocking.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract DeltaNeutralVault04_ReaderTest is DeltaNeutralVault04Base_Test {
  using mocking for *;
  DeltaNeutralVaultReader internal _reader;

  function setUp() public override {
    super.setUp();
    _reader = new DeltaNeutralVaultReader();
  }

  function testCorrectness_ReaderShouldUseStableTokenForRepurchase_IfExposureIsNegative() external {
    _deltaNeutralVault.getExposure.mockv(int256(100 ether * -1));
    DeltaNeutralVaultReader.VaultStatus memory _status = _reader.getCurrentState(
      IDeltaNeutralVault(address(_deltaNeutralVault))
    );

    assertEq(_status.exposureAmount, 100 ether);
    assertEq(_status.tokenToBeRepurchased, _deltaNeutralVault.stableToken());
    assertEq(_status.lpTokenPrice, 2 ether);
  }

  function testCorrectness_ReaderShouldUseAssetTokenForRepurchase_IfExposureIsNegative() external {
    _deltaNeutralVault.getExposure.mockv(int256(100 ether));
    DeltaNeutralVaultReader.VaultStatus memory _status = _reader.getCurrentState(
      IDeltaNeutralVault(address(_deltaNeutralVault))
    );

    assertEq(_status.exposureAmount, 100 ether);
    assertEq(_status.tokenToBeRepurchased, _deltaNeutralVault.assetToken());
    assertEq(_status.lpTokenPrice, 2 ether);
  }
}
