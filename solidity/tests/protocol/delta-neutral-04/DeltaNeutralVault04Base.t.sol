// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, DeltaNeutralVault04Like, MockErc20Like, MockLpErc20Like, console } from "../../base/BaseTest.sol";

import { DeltaNeutralVault04HealthChecker } from "../../../contracts/8.13/DeltaNeutralVault04HealthChecker.sol";
import { FakeDeltaWorker } from "../../fake/FakeDeltaWorker.sol";
import { FakeAutomateVaultController } from "../../fake/FakeAutomateVaultController.sol";
import { FakeDeltaNeutralOracle } from "../../fake/FakeDeltaNeutralOracle.sol";
import { FakeVault } from "../../fake/FakeVault.sol";
import { FakeDeltaNeutralVaultConfig02 } from "../../fake/FakeDeltaNeutralVaultConfig02.sol";
import { FakeDeltaNeutralDepositExecutor } from "../../fake/FakeDeltaNeutralDepositExecutor.sol";
import { FakeDeltaNeutralWithdrawExecutor } from "../../fake/FakeDeltaNeutralWithdrawExecutor.sol";
import { FakeDeltaNeutralRebalanceExecutor } from "../../fake/FakeDeltaNeutralRebalanceExecutor.sol";
import { FakeDeltaNeutralReinvestExecutor } from "../../fake/FakeDeltaNeutralReinvestExecutor.sol";
import { FakeDeltaNeutralRepurchaseExecutor } from "../../fake/FakeDeltaNeutralRepurchaseExecutor.sol";
import { FakeRouter } from "../../fake/FakeRouter.sol";
import { FakeFairLaunch } from "../../fake/FakeFairLaunch.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
// solhint-disable max-states-count
abstract contract DeltaNeutralVault04Base_Test is BaseTest {
  DeltaNeutralVault04Like internal _deltaNeutralVault;
  DeltaNeutralVault04HealthChecker internal _checker;

  FakeAutomateVaultController internal _controller;
  FakeVault internal _stableVault;
  FakeVault internal _assetVault;
  FakeDeltaWorker internal _stableVaultWorker;
  FakeDeltaWorker internal _assetVaultWorker;
  FakeDeltaNeutralOracle internal _priceOracle;
  FakeDeltaNeutralVaultConfig02 internal _config;
  FakeDeltaNeutralDepositExecutor internal _depositExecutor;
  FakeDeltaNeutralWithdrawExecutor internal _withdrawExecutor;
  FakeDeltaNeutralRebalanceExecutor internal _rebalanceExecutor;
  FakeDeltaNeutralReinvestExecutor internal _reinvestExecutor;
  FakeDeltaNeutralRepurchaseExecutor internal _repurchaseExecutor;
  FakeRouter internal _router;
  FakeFairLaunch internal _fairLaunch;

  MockLpErc20Like internal _lpToken;
  MockErc20Like internal _alpacaToken;
  MockErc20Like internal _stableToken;
  MockErc20Like internal _assetToken;

  function setUp() public virtual {
    _priceOracle = new FakeDeltaNeutralOracle();
    _config = new FakeDeltaNeutralVaultConfig02();
    _controller = new FakeAutomateVaultController();
    _checker = new DeltaNeutralVault04HealthChecker();

    _lpToken = _setupLpToken("LP TOKEN", "LP", 18);
    _alpacaToken = _setupToken("ALPACA", "ALPACA", 18);
    _stableToken = _setupToken("USDT", "USDT", 18);
    _assetToken = _setupToken("WNATIVE", "WNATIVE", 18);

    (uint256 _lpPrice, ) = _priceOracle.lpToDollar(1e18, address(_lpToken));

    // Setup Fake
    _stableVault = new FakeVault(address(_stableToken), _lpPrice);
    _assetVault = new FakeVault(address(_assetToken), _lpPrice);

    _stableVaultWorker = new FakeDeltaWorker(address(_lpToken));
    _assetVaultWorker = new FakeDeltaWorker(address(_lpToken));

    _depositExecutor = new FakeDeltaNeutralDepositExecutor(
      address(_stableVault),
      address(_assetVault),
      address(_stableVaultWorker),
      address(_assetVaultWorker),
      _lpPrice
    );

    _withdrawExecutor = new FakeDeltaNeutralWithdrawExecutor(
      address(_stableVault),
      address(_assetVault),
      address(_stableVaultWorker),
      address(_assetVaultWorker),
      _lpPrice,
      address(_stableToken),
      address(_assetToken)
    );

    _rebalanceExecutor = new FakeDeltaNeutralRebalanceExecutor(
      address(_stableVault),
      address(_assetVault),
      address(_stableVaultWorker),
      address(_assetVaultWorker),
      _lpPrice
    );
    _reinvestExecutor = new FakeDeltaNeutralReinvestExecutor(
      address(_stableVault),
      address(_assetVault),
      address(_stableVaultWorker),
      address(_assetVaultWorker),
      _lpPrice
    );

    _repurchaseExecutor = new FakeDeltaNeutralRepurchaseExecutor(
      address(_stableVault),
      address(_assetVault),
      address(_stableVaultWorker),
      address(_assetVaultWorker),
      _lpPrice
    );

    _router = new FakeRouter();

    _fairLaunch = new FakeFairLaunch();
    // Setup DeltaNeutralVault04 Vault
    _deltaNeutralVault = _setupDeltaNeutralVault04(
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

    _deltaNeutralVault.setDeltaNeutralVaultHealthChecker(address(_checker));

    assertEq(_deltaNeutralVault.stableToken(), address(_stableToken));
    assertEq(_deltaNeutralVault.assetToken(), address(_assetToken));

    // Mint tokens
    _stableToken.mint(address(this), 10000 ether);
    _assetToken.mint(address(this), 10000 ether);
    _stableToken.mint(address(_deltaNeutralVault), 10000 ether);
    _assetToken.mint(address(_deltaNeutralVault), 10000 ether);

    _stableToken.mint(address(_router), 10000 ether);
    _assetToken.mint(address(_router), 10000 ether);
    _alpacaToken.mint(address(_router), 10000 ether);

    _stableToken.mint(address(_withdrawExecutor), 10000 ether);

    _stableToken.approve(address(_deltaNeutralVault), 10000 ether);
    _assetToken.approve(address(_deltaNeutralVault), 10000 ether);

    // Config: set important config
    _config.setLeverageLevel(3);
    _config.setParams(address(1), address(2), address(_fairLaunch), 6800, 100, 100);
    _config.setFees(address(this), 0, address(this), 0, address(this), 0);
    _config.setSwapRouter(address(_router));
    _config.setAlpacaBountyConfig(address(this), 0);
    _config.setRepurchaseBonusBps(15);

    address[] memory _reinvestPath = new address[](2);
    _reinvestPath[0] = address(_alpacaToken);
    _reinvestPath[1] = address(_stableToken);

    _config.setReinvestPath(_reinvestPath);
    // _config.setController(address(_controller));
    _config.setExecutor(
      address(_depositExecutor),
      address(_withdrawExecutor),
      address(_rebalanceExecutor),
      address(_reinvestExecutor),
      address(_repurchaseExecutor),
      address(_rebalanceExecutor)
    );

    _initPosition();
  }

  function _initPosition() internal {
    _depositExecutor.setExecutionValue(100 ether, 200 ether);
    // 3x Position
    _deltaNeutralVault.initPositions(25 ether, 75 ether, 0, abi.encode(0));

    (
      uint256 stablePositionEquity,
      uint256 stablePositionDebtValue,
      uint256 stableLpAmount,
      uint256 assetPositionEquity,
      uint256 assetPositionDebtValue,
      uint256 assetLpAmount
    ) = _deltaNeutralVault.positionInfo();

    assertEq(stablePositionEquity, 25 ether);
    assertEq(assetPositionEquity, 75 ether);
    assertEq(stablePositionDebtValue, 50 ether);
    assertEq(assetPositionDebtValue, 150 ether);
    assertEq(stableLpAmount, 37.5 ether);
    assertEq(assetLpAmount, 112.5 ether);
    assertEq(_deltaNeutralVault.balanceOf(address(this)), 100 ether);
  }

  function _depositForAlice() internal {
    uint256 _depositValue = 100 ether;
    uint256 _borrowValue = _depositValue * 2; // 3x leverage

    _depositExecutor.setExecutionValue(_depositValue, _borrowValue);
    _deltaNeutralVault.deposit(100 ether, 0, ALICE, 100 ether, abi.encode(0));

    assertEq(_deltaNeutralVault.balanceOf(ALICE), 100 ether);
  }
}
