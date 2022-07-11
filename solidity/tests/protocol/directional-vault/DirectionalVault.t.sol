// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, DirectionalVaultLike, MockErc20Like, console } from "../../base/BaseTest.sol";
import { mocking } from "../../utils/mocking.sol";
import { MockContract } from "../../utils/MockContract.sol";

import { FakeDeltaWorker } from "../../fake/FakeDeltaWorker.sol";
import { FakeAutomateVaultController } from "../../fake/FakeAutomateVaultController.sol";
import { FakeDeltaNeutralOracle } from "../../fake/FakeDeltaNeutralOracle.sol";
import { FakeVault } from "../../fake/FakeVault.sol";
import { FakeDeltaNeutralVaultConfig02 } from "../../fake/FakeDeltaNeutralVaultConfig02.sol";
import { FakeDepositExecutor } from "../../fake/FakeDepositExecutor.sol";
import { FakeWithdrawExecutor } from "../../fake/FakeWithdrawExecutor.sol";
import { FakeRebalanceExecutor } from "../../fake/FakeRebalanceExecutor.sol";
import { FakeReinvestExecutor } from "../../fake/FakeReinvestExecutor.sol";
import { FakeRouter } from "../../fake/FakeRouter.sol";
import { FakeFairLaunch } from "../../fake/FakeFairLaunch.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract DirectionalVault_Test is BaseTest {
  using mocking for *;
  DirectionalVaultLike private _directionalVault;

  FakeAutomateVaultController private _controller;
  FakeVault private _stableVault;
  FakeVault private _assetVault;
  FakeDeltaWorker private _stableVaultWorker;
  FakeDeltaWorker private _assetVaultWorker;
  FakeDeltaNeutralOracle private _priceOracle;
  FakeDeltaNeutralVaultConfig02 private _config;
  FakeDepositExecutor private _depositExecutor;
  FakeWithdrawExecutor private _withdrawExecutor;
  FakeRebalanceExecutor private _rebalanceExecutor;
  FakeReinvestExecutor private _reinvestExecutor;
  FakeRouter private _router;
  FakeFairLaunch private _fairLaunch;

  MockErc20Like private _lpToken;
  MockErc20Like private _alpacaToken;
  MockErc20Like private _stableToken;
  MockErc20Like private _assetToken;

  function setUp() external {
    _priceOracle = new FakeDeltaNeutralOracle();
    _config = new FakeDeltaNeutralVaultConfig02();
    _controller = new FakeAutomateVaultController();

    _lpToken = _setupToken("LP TOKEN", "LP", 18);
    _alpacaToken = _setupToken("ALPACA", "ALPACA", 18);
    _stableToken = _setupToken("USDT", "USDT", 18);
    _assetToken = _setupToken("WNATIVE", "WNATIVE", 18);

    (uint256 _lpPrice, ) = _priceOracle.lpToDollar(1e18, address(_lpToken));

    // Setup Fake
    _stableVault = new FakeVault(address(_stableToken), _lpPrice);
    _assetVault = new FakeVault(address(_assetToken), _lpPrice);

    _stableVaultWorker = new FakeDeltaWorker(address(_lpToken));

    _depositExecutor = new FakeDepositExecutor(address(_stableVault), address(_stableVaultWorker), _lpPrice);
    _withdrawExecutor = new FakeWithdrawExecutor(
      address(_stableVault),
      address(_stableVaultWorker),
      _lpPrice,
      address(_stableToken)
    );

    _rebalanceExecutor = new FakeRebalanceExecutor(address(_stableVault), address(_stableVaultWorker), _lpPrice);
    _reinvestExecutor = new FakeReinvestExecutor(address(_stableVault), address(_stableVaultWorker), _lpPrice);

    _router = new FakeRouter();

    _fairLaunch = new FakeFairLaunch();
    // Setup Directional Vault

    _directionalVault = _setupDirectionalVault(
      "TEST VAULT",
      "TV",
      address(_stableVault),
      address(_stableVaultWorker),
      address(_lpToken),
      address(_alpacaToken),
      address(_assetToken),
      address(_priceOracle),
      address(_config)
    );

    assertEq(_directionalVault.stableToken(), address(_stableToken));
    assertEq(_directionalVault.assetToken(), address(_assetToken));

    // Mint tokens
    _stableToken.mint(address(this), 10000 ether);
    _assetToken.mint(address(this), 10000 ether);
    _stableToken.mint(address(_directionalVault), 10000 ether);
    _assetToken.mint(address(_directionalVault), 10000 ether);

    _stableToken.mint(address(_router), 10000 ether);
    _assetToken.mint(address(_router), 10000 ether);
    _alpacaToken.mint(address(_router), 10000 ether);

    _stableToken.mint(address(_withdrawExecutor), 10000 ether);

    _stableToken.approve(address(_directionalVault), 10000 ether);
    _assetToken.approve(address(_directionalVault), 10000 ether);

    // Config: set important config
    _config.setLeverageLevel(3);
    _config.setParams(address(1), address(2), address(_fairLaunch), 6800, 100, 100);
    _config.setFees(address(this), 0, address(this), 0, address(this), 0);
    _config.setSwapRouter(address(_router));
    _config.setAlpacaBountyConfig(address(this), 0);

    address[] memory _reinvestPath = new address[](2);
    _reinvestPath[0] = address(_alpacaToken);
    _reinvestPath[1] = address(_stableToken);

    _config.setReinvestPath(_reinvestPath);
    // _config.setController(address(_controller));
    _config.setExecutor(
      address(_depositExecutor),
      address(_withdrawExecutor),
      address(_rebalanceExecutor),
      address(_reinvestExecutor)
    );

    _initPosition();
  }

  // function testCorrectness_depositShouldWorkIfBorrowAmountIsCorrect() external {
  //   _depositForAlice();
  // }

  // function testRevert_depositShouldRevertIfBorrowValueIsOff() external {
  //   uint256 _depositValue = 100 ether;
  //   uint256 _borrowValue = _depositValue * 3; // 4x leverage

  //   _depositExecutor.setExecutionValue(_depositValue, _borrowValue);

  //   vm.expectRevert(abi.encodeWithSignature("DirectionalVault_UnsafeDebtValue()"));
  //   _directionalVault.deposit(100 ether, 0, ALICE, 100 ether, abi.encode(0));

  //   _borrowValue = _depositValue * 1; // 1x leverage
  //   _depositExecutor.setExecutionValue(_depositValue, _borrowValue);

  //   vm.expectRevert(abi.encodeWithSignature("DirectionalVault_UnsafeDebtValue()"));
  //   _directionalVault.deposit(100 ether, 0, ALICE, 100 ether, abi.encode(0));
  // }

  // function testCorrectness_withdrawShouldWork() external {
  //   _depositForAlice();

  //   uint256 _withdrawValue = 100 ether;
  //   uint256 _repayDebtValue = _withdrawValue * 2; // 3x leverage

  //   _withdrawExecutor.setExecutionValue(_withdrawValue, _repayDebtValue);

  //   vm.prank(ALICE);
  //   // Withdraw executor will always return stable
  //   _directionalVault.withdraw(100 ether, 100, 0, abi.encode(0));

  //   assertEq(_directionalVault.balanceOf(ALICE), 0 ether);
  //   assertEq(_stableToken.balanceOf(ALICE), 100 ether);
  // }

  // function testRevert_withdrawShouldRevertIfDebtRatioIsOff() external {
  //   _depositForAlice();

  //   uint256 _withdrawValue = 100 ether;
  //   uint256 _repayDebtValue = _withdrawValue * 1; // 3x leverage

  //   _withdrawExecutor.setExecutionValue(_withdrawValue, _repayDebtValue);

  //   vm.prank(ALICE);
  //   // Withdraw executor will always return stable
  //   vm.expectRevert(abi.encodeWithSignature("DirectionalVault_UnsafeDebtRatio()"));
  //   _directionalVault.withdraw(100 ether, 100, 0, abi.encode(0));
  // }

  function testCorrectness_RebalanceShouldWorkIfEquityIsNotLost() external {
    (uint256 stablePositionEquity, uint256 stablePositionDebtValue, uint256 stableLpAmount) = _directionalVault
      .positionInfo();
    console.log("stablePositionEquity", stablePositionEquity);
    console.log("stablePositionDebtValue", stablePositionDebtValue);
    console.log("stableLpAmount", stableLpAmount);
    _stableVault.setDebt(100 ether, 100 ether);

    (uint256 stablePositionEquity2, uint256 stablePositionDebtValue2, uint256 stableLpAmount2) = _directionalVault
      .positionInfo();
    console.log("stablePositionEquity2", stablePositionEquity2);
    console.log("stablePositionDebtValue2", stablePositionDebtValue2);
    console.log("stableLpAmount2", stableLpAmount2);
    _rebalanceExecutor.setExecutionValue(600 ether, 400 ether);

    _directionalVault.rebalance(abi.encode(0));

    (uint256 stablePositionEquity3, uint256 stablePositionDebtValue3, uint256 stableLpAmount3) = _directionalVault
      .positionInfo();
    console.log("stablePositionEquity3", stablePositionEquity3);
    console.log("stablePositionDebtValue3", stablePositionDebtValue3);
    console.log("stableLpAmount3", stableLpAmount3);
  }

  function testRevert_RebalanceShouldRevertIfEquityIsLost() external {
    _stableVault.setDebt(100 ether, 100 ether);

    _rebalanceExecutor.setExecutionValue(500 ether, 400 ether);
    vm.expectRevert(abi.encodeWithSignature("DirectionalVault_UnsafePositionValue()"));
    _directionalVault.rebalance(abi.encode(0));
  }

  // function testCorrectness_ReinvestShouldWorkIfEquityIsNotLost() external {
  //   _alpacaToken.mint(address(_directionalVault), 100 ether);
  //   _reinvestExecutor.setExecutionValue(600 ether, 400 ether);

  //   _directionalVault.reinvest(abi.encode(0), 0);
  // }

  // function testRevert_ReinvestShouldRevertIfEquityIsLost() external {
  //   _alpacaToken.mint(address(_directionalVault), 100 ether);
  //   _reinvestExecutor.setExecutionValue(300 ether, 250 ether);

  //   vm.expectRevert(abi.encodeWithSignature("DirectionalVault_UnsafePositionEquity()"));
  //   _directionalVault.reinvest(abi.encode(0), 0);
  // }

  function _initPosition() internal {
    _depositExecutor.setExecutionValue(100 ether, 200 ether);
    // 3x Position
    _directionalVault.initPositions(25 ether, 75 ether, 0, abi.encode(0));

    (uint256 _positionEquity, uint256 _positionDebt, ) = _directionalVault.positionInfo();

    assertEq(_positionEquity, 100 ether);
    assertEq(_positionDebt, 200 ether);
    assertEq(_directionalVault.balanceOf(address(this)), 100 ether);
  }

  function _depositForAlice() internal {
    uint256 _depositValue = 100 ether;
    uint256 _borrowValue = _depositValue * 2; // 3x leverage

    _depositExecutor.setExecutionValue(_depositValue, _borrowValue);
    _directionalVault.deposit(100 ether, 0, ALICE, 100 ether, abi.encode(0));

    assertEq(_directionalVault.balanceOf(ALICE), 100 ether);
  }
}
