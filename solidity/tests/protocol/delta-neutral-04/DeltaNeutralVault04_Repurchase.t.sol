// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { DeltaNeutralVault04Base_Test } from "./DeltaNeutralVault04Base.t.sol";

import { BaseTest, DeltaNeutralVault04Like, MockErc20Like, MockLpErc20Like, console } from "../../base/BaseTest.sol";
import { mocking } from "../../utils/mocking.sol";

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
import { FakeRouter } from "../../fake/FakeRouter.sol";
import { FakeFairLaunch } from "../../fake/FakeFairLaunch.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract DeltaNeutralVault04_RepurchaseTest is DeltaNeutralVault04Base_Test {
  using mocking for *;

  function setUp() public override {
    super.setUp();
  }

  function testCorrectness_GetPositiveExposureShouldWork() external {
    _assetVault.setDebt(20 ether, 20 ether);
    _lpToken.totalSupply.mockv(200 ether);
    _lpToken.getReserves.mockv(100 ether, 100 ether, uint32(block.timestamp));
    _lpToken.token0.mockv(address(_stableToken));
    int256 _exposure = _deltaNeutralVault.getExposure();
    assertEq(_exposure, 55 ether);
  }

  function testCorrectness_GetNegativeExposureShouldWork() external {
    _assetVault.setDebt(100 ether, 100 ether);
    _lpToken.totalSupply.mockv(200 ether);
    _lpToken.getReserves.mockv(100 ether, 100 ether, uint32(block.timestamp));
    _lpToken.token0.mockv(address(_stableToken));
    int256 _exposure = _deltaNeutralVault.getExposure();
    assertEq(_exposure, -25 ether);
  }

  function testCorrectness_GetZeroExposureShouldWork() external {
    _assetVault.setDebt(75 ether, 75 ether);
    _lpToken.totalSupply.mockv(200 ether);
    _lpToken.getReserves.mockv(100 ether, 100 ether, uint32(block.timestamp));
    _lpToken.token0.mockv(address(_stableToken));
    int256 _exposure = _deltaNeutralVault.getExposure();
    assertEq(_exposure, 0 ether);
  }

  function testRevert_RepurchaseWithStableTokenWhileExposureIsNegativeShouldRevert() external {
    _assetVault.setDebt(100 ether, 100 ether);
    _lpToken.totalSupply.mockv(200 ether);
    _lpToken.getReserves.mockv(100 ether, 100 ether, uint32(block.timestamp));
    _lpToken.token0.mockv(address(_stableToken));

    uint256 _amountToPurchase = 100 ether;
    uint256 _minReceiveAmount = 100 ether;
    // avoid EOA check
    vm.prank(address(this), address(this));
    vm.expectRevert(abi.encodeWithSignature("DeltaNeutralVault04_InvalidRepurchaseTokenIn()"));
    _deltaNeutralVault.repurchase(address(_stableToken), _amountToPurchase, _minReceiveAmount);
  }

  function testRevert_RepurchaseWithAssetTokenWhileExposureIsPositiveShouldRevert() external {
    _assetVault.setDebt(25 ether, 25 ether);
    _lpToken.totalSupply.mockv(200 ether);
    _lpToken.getReserves.mockv(100 ether, 100 ether, uint32(block.timestamp));
    _lpToken.token0.mockv(address(_stableToken));

    uint256 _amountToPurchase = 100 ether;
    uint256 _minReceiveAmount = 100 ether;
    // avoid EOA check
    vm.prank(address(this), address(this));
    vm.expectRevert(abi.encodeWithSignature("DeltaNeutralVault04_InvalidRepurchaseTokenIn()"));
    _deltaNeutralVault.repurchase(address(_assetToken), _amountToPurchase, _minReceiveAmount);
  }

  function testCorrectness_RepurchaseWithStableTokenWhileExposureIsPositiveShouldWork() external {
    _assetVault.setDebt(25 ether, 25 ether);
    _lpToken.totalSupply.mockv(200 ether);
    _lpToken.getReserves.mockv(100 ether, 100 ether, uint32(block.timestamp));
    _lpToken.token0.mockv(address(_stableToken));

    uint256 _amountToPurchase = 50 ether;
    uint256 _minReceiveAmount = 50 ether;

    uint256 _stableBalance = _stableToken.balanceOf(address(this));
    uint256 _assetBalance = _assetToken.balanceOf(address(this));

    // current debt stable : 50, asset : 25
    // target debt stable: 0, asset : 75
    _repurchaseExecutor.setExecutionValue(0, 75 ether);

    // avoid EOA check
    vm.prank(address(this), address(this));
    _deltaNeutralVault.repurchase(address(_stableToken), _amountToPurchase, _minReceiveAmount);

    uint256 _actualAmountIn = _stableBalance - _stableToken.balanceOf(address(this));
    uint256 _actualAmountOut = _assetToken.balanceOf(address(this)) - _assetBalance;

    assertEq(_actualAmountIn, _amountToPurchase);
    // amount should have bonus 15 bps hardcoded in contract
    assertEq(_actualAmountOut, (50 ether * 10015) / 10000);
  }

  function testCorrectness_RepurchaseWithAssetTokenWhileExposureIsNegativeShouldWork() external {
    _assetVault.setDebt(100 ether, 100 ether);
    _lpToken.totalSupply.mockv(200 ether);
    _lpToken.getReserves.mockv(100 ether, 100 ether, uint32(block.timestamp));
    _lpToken.token0.mockv(address(_stableToken));

    uint256 _amountToPurchase = 25 ether;
    uint256 _minReceiveAmount = 25 ether;

    uint256 _stableBalance = _stableToken.balanceOf(address(this));
    uint256 _assetBalance = _assetToken.balanceOf(address(this));

    // current debt stable : 50, asset : 100
    // target debt stable: 75, asset : 75

    _repurchaseExecutor.setExecutionValue(75 ether, 75 ether);
    // avoid EOA check
    vm.prank(address(this), address(this));
    _deltaNeutralVault.repurchase(address(_assetToken), _amountToPurchase, _minReceiveAmount);

    uint256 _actualAmountIn = _assetBalance - _assetToken.balanceOf(address(this));
    uint256 _actualAmountOut = _stableToken.balanceOf(address(this)) - _stableBalance;

    assertEq(_actualAmountIn, _amountToPurchase);
    // amount should have bonus 15 bps hardcoded in contract
    assertEq(_actualAmountOut, (25 ether * 10015) / 10000);
  }

  function testCorrectness_PartialRepurchaseShouldWork() external {
    _assetVault.setDebt(100 ether, 100 ether);
    _lpToken.totalSupply.mockv(200 ether);
    _lpToken.getReserves.mockv(100 ether, 100 ether, uint32(block.timestamp));
    _lpToken.token0.mockv(address(_stableToken));

    uint256 _stableBalance = _stableToken.balanceOf(address(this));
    uint256 _assetBalance = _assetToken.balanceOf(address(this));

    uint256 _amountToPurchase = 10 ether;
    uint256 _minReceiveAmount = 10 ether;

    // current debt stable : 50, asset : 100
    // target debt stable: 60, asset : 90

    _repurchaseExecutor.setExecutionValue(60 ether, 90 ether);
    // avoid EOA check
    vm.prank(address(this), address(this));
    _deltaNeutralVault.repurchase(address(_assetToken), _amountToPurchase, _minReceiveAmount);

    // current debt stable : 60, asset : 90
    // target debt stable: 70, asset : 80

    _repurchaseExecutor.setExecutionValue(70 ether, 80 ether);
    // avoid EOA check
    vm.prank(address(this), address(this));
    _deltaNeutralVault.repurchase(address(_assetToken), _amountToPurchase, _minReceiveAmount);

    uint256 _actualAmountIn = _assetBalance - _assetToken.balanceOf(address(this));
    uint256 _actualAmountOut = _stableToken.balanceOf(address(this)) - _stableBalance;

    // twice repurchase
    assertEq(_actualAmountIn, _amountToPurchase * 2);
    // amount should have bonus 15 bps hardcoded in contract
    assertEq(_actualAmountOut, (20 ether * 10015) / 10000);
  }

  function testCorrectness_SecondRepurchaseExceedExposureShouldRevert() external {
    _assetVault.setDebt(100 ether, 100 ether);
    _lpToken.totalSupply.mockv(200 ether);
    _lpToken.getReserves.mockv(100 ether, 100 ether, uint32(block.timestamp));
    _lpToken.token0.mockv(address(_stableToken));

    uint256 _amountToPurchase = 20 ether;
    uint256 _minReceiveAmount = 20 ether;

    // current debt stable : 50, asset : 100
    // target debt stable: 70, asset : 80

    _repurchaseExecutor.setExecutionValue(70 ether, 80 ether);
    // avoid EOA check
    vm.prank(address(this), address(this));
    _deltaNeutralVault.repurchase(address(_assetToken), _amountToPurchase, _minReceiveAmount);

    // current debt stable : 70, asset : 80
    // target debt stable: 90, asset : 60

    _repurchaseExecutor.setExecutionValue(90 ether, 60 ether);
    vm.expectRevert(abi.encodeWithSignature("DeltaNeutralVault04_NotEnoughExposure()"));
    // avoid EOA check
    vm.prank(address(this), address(this));
    _deltaNeutralVault.repurchase(address(_assetToken), _amountToPurchase, _minReceiveAmount);
  }

  function testRevert_RepurchaseResultInChangesInEquityShouldRevert() external {
    _assetVault.setDebt(25 ether, 25 ether);
    _lpToken.totalSupply.mockv(200 ether);
    _lpToken.getReserves.mockv(100 ether, 100 ether, uint32(block.timestamp));
    _lpToken.token0.mockv(address(_stableToken));

    uint256 _amountToPurchase = 50 ether;
    uint256 _minReceiveAmount = 50 ether;

    _repurchaseExecutor.setExecutionValue(50 ether, 75 ether);

    vm.expectRevert(abi.encodeWithSignature("DeltaNeutralVault04_UnsafePositionValue()"));

    // avoid EOA check
    vm.prank(address(this), address(this));
    _deltaNeutralVault.repurchase(address(_stableToken), _amountToPurchase, _minReceiveAmount);
  }

  function testRevert_RepurchaseMoreThanExposureWhileExposureIsPositiveShouldRevert() external {
    _assetVault.setDebt(100 ether, 100 ether);
    _lpToken.totalSupply.mockv(200 ether);
    _lpToken.getReserves.mockv(100 ether, 100 ether, uint32(block.timestamp));
    _lpToken.token0.mockv(address(_stableToken));

    uint256 _amountToPurchase = 30 ether;
    uint256 _minReceiveAmount = 30 ether;

    vm.expectRevert(abi.encodeWithSignature("DeltaNeutralVault04_NotEnoughExposure()"));

    // avoid EOA check
    vm.prank(address(this), address(this));
    _deltaNeutralVault.repurchase(address(_assetToken), _amountToPurchase, _minReceiveAmount);
  }

  function testRevert_RepurchaseMoreThanExposureWhileExposureIsNegativeShouldRevert() external {
    _assetVault.setDebt(50 ether, 50 ether);
    _lpToken.totalSupply.mockv(200 ether);
    _lpToken.getReserves.mockv(100 ether, 100 ether, uint32(block.timestamp));
    _lpToken.token0.mockv(address(_stableToken));

    uint256 _amountToPurchase = 30 ether;
    uint256 _minReceiveAmount = 30 ether;

    vm.expectRevert(abi.encodeWithSignature("DeltaNeutralVault04_NotEnoughExposure()"));

    // avoid EOA check
    vm.prank(address(this), address(this));
    _deltaNeutralVault.repurchase(address(_stableToken), _amountToPurchase, _minReceiveAmount);
  }

  function testRevert_RepurchaseWithZeroBonusShouldRevert() external {
    _assetVault.setDebt(25 ether, 25 ether);
    _lpToken.totalSupply.mockv(200 ether);
    _lpToken.getReserves.mockv(100 ether, 100 ether, uint32(block.timestamp));
    _lpToken.token0.mockv(address(_stableToken));

    uint256 _amountToPurchase = 50 ether;
    uint256 _minReceiveAmount = 50 ether;

    _config.setRepurchaseBonusBps(0);

    vm.expectRevert(abi.encodeWithSignature("DeltaNeutralVaultConfig_RepurchaseDisabled()"));

    // avoid EOA check
    vm.prank(address(this), address(this));
    _deltaNeutralVault.repurchase(address(_stableToken), _amountToPurchase, _minReceiveAmount);
  }
}
