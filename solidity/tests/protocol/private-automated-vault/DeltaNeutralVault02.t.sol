// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, DeltaNeutralVault02Like, MockErc20Like, console } from "../../base/BaseTest.sol";
import { mocking } from "../../utils/mocking.sol";
import { MockContract } from "../../utils/MockContract.sol";

import { IVault } from "../../../contracts/8.13/interfaces/IVault.sol";
import { IWorker02 } from "../../../contracts/8.13/interfaces/IWorker02.sol";
import { IDeltaNeutralOracle } from "../../../contracts/8.13/interfaces/IDeltaNeutralOracle.sol";
import { IDeltaNeutralVaultConfig } from "../../../contracts/8.13/interfaces/IDeltaNeutralVaultConfig.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract DeltaNeutralVault02_Test is BaseTest {
  using mocking for *;
  DeltaNeutralVault02Like private _deltaVault;

  IVault private _stableVault;
  IVault private _assetVault;
  IWorker02 private _stableVaultWorker;
  IWorker02 private _assetVaultWorker;
  IDeltaNeutralOracle private _priceOracle;
  IDeltaNeutralVaultConfig private _config;
  MockErc20Like private _lpToken;
  MockErc20Like private _alpacaToken;
  MockErc20Like private _stableToken;
  MockErc20Like private _assetToken;

  function setUp() external {
    _stableVault = IVault(address(new MockContract()));
    _assetVault = IVault(address(new MockContract()));
    _stableVaultWorker = IWorker02(address(new MockContract()));
    _assetVaultWorker = IWorker02(address(new MockContract()));
    _priceOracle = IDeltaNeutralOracle(address(new MockContract()));
    _config = IDeltaNeutralVaultConfig(address(new MockContract()));
    _lpToken = _setupToken("LP TOKEN", "LP", 18);
    _alpacaToken = _setupToken("ALPACA", "ALPACA", 18);
    _stableToken = _setupToken("USDT", "USDT", 18);
    _assetToken = _setupToken("WNATIVE", "WNATIVE", 18);

    // Vault: mock token
    _stableVault.token.mockv(address(_stableToken));
    _assetVault.token.mockv(address(_assetToken));

    // Worker: mock lp token
    _stableVaultWorker.lpToken.mockv(address(_lpToken));
    _assetVaultWorker.lpToken.mockv(address(_lpToken));

    _deltaVault = _setupDeltaNeutralVault02(
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
    assertEq(_deltaVault.stableToken(), address(_stableToken));
    assertEq(_deltaVault.assetToken(), address(_assetToken));

    _stableToken.mint(address(this), 10000 ether);
    _assetToken.mint(address(this), 10000 ether);

    // Delta Neutral Orcale: Set up token prices
    _priceOracle.getTokenPrice.mockv(address(_stableToken), 1 ether, block.timestamp);
    _priceOracle.getTokenPrice.mockv(address(_assetToken), 1 ether, block.timestamp);
    _priceOracle.lpToDollar.mockv(1 ether, address(_lpToken), 2 ether, block.timestamp);
    _priceOracle.lpToDollar.mockv(0 ether, address(_lpToken), 0 ether, block.timestamp);

    // Vault: mock position ID
    _stableVault.nextPositionID.mockv(1);
    _assetVault.nextPositionID.mockv(1);

    // Vault: mock debt share
    _stableVault.vaultDebtShare.mockv(0);
    _assetVault.vaultDebtShare.mockv(0);

    // Vault: mock debt value
    _stableVault.vaultDebtVal.mockv(0);
    _assetVault.vaultDebtVal.mockv(0);

    // Vault: pending interest
    _stableVault.pendingInterest.mockv(0, 0);
    _assetVault.pendingInterest.mockv(0, 0);

    // Worker: mock lp balance at workers
    _stableVaultWorker.totalLpBalance.mockv(0);
    _assetVaultWorker.totalLpBalance.mockv(0);

    // Config: mock position value tolerance
    _config.positionValueTolerance.mockv(100);
    _config.leverageLevel.mockv(3);
  }

  function testCorrectness_initPositions() external {
    console.log("Stable vault debt share", _stableVault.vaultDebtShare());
  }
}
