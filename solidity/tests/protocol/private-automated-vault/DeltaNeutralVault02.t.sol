// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, DeltaNeutralVault02Like, MockErc20Like, console } from "../../base/BaseTest.sol";
import { mocking } from "../../utils/mocking.sol";
import { MockContract } from "../../utils/MockContract.sol";

import { FakeDeltaWorker } from "./FakeDeltaWorker.sol";
import { FakeAutomateVaultController } from "./FakeAutomateVaultController.sol";
import { FakeDeltaNeutralOracle } from "./FakeDeltaNeutralOracle.sol";
import { FakeVault } from "./FakeVault.sol";
import { FakeDeltaNeutralVaultConfig02 } from "./FakeDeltaNeutralVaultConfig02.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract DeltaNeutralVault02_Test is BaseTest {
  using mocking for *;
  DeltaNeutralVault02Like private _deltaVault;

  FakeAutomateVaultController private _controller;
  FakeVault private _stableVault;
  FakeVault private _assetVault;
  FakeDeltaWorker private _stableVaultWorker;
  FakeDeltaWorker private _assetVaultWorker;
  FakeDeltaNeutralOracle private _priceOracle;
  FakeDeltaNeutralVaultConfig02 private _config;

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
    _stableVault = new FakeVault(address(_stableToken), _lpPrice);
    _assetVault = new FakeVault(address(_assetToken), _lpPrice);

    _stableVaultWorker = new FakeDeltaWorker(address(_lpToken));
    _assetVaultWorker = new FakeDeltaWorker(address(_lpToken));

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
    _stableToken.mint(address(_deltaVault), 10000 ether);
    _assetToken.mint(address(_deltaVault), 10000 ether);

    _stableToken.approve(address(_deltaVault), 10000 ether);
    _assetToken.approve(address(_deltaVault), 10000 ether);

    // Config: set important config
    _config.setLeverageLevel(3);
    _config.setParams(address(1), address(2), address(3), 6800, 100, 100);
    _config.setFees(address(this), 0, address(this), 0, address(this), 0);
    _config.setController(address(_controller));

    initPosition();
  }

  function testCorrectness_DepositShouldWorkIfCreditIsSuffice() external {
    uint8[] memory _actions = new uint8[](2);
    uint256[] memory _values = new uint256[](2);
    bytes[] memory _workDatas = new bytes[](2);

    _actions[0] = 1;
    _values[0] = 0;
    _workDatas[0] = abi.encode(
      //address payable _vault,uint256 _posId,address _worker,uint256 _principalAmount,uint256 _borrowAmount,uint256 _maxReturn, bytes stratData
      address(_stableVault),
      1,
      address(_stableVaultWorker),
      25 ether,
      50 ether,
      0,
      abi.encode(1) // Fake Vault Deposit Action
    );

    _actions[1] = 1;
    _values[1] = 0;
    _workDatas[1] = abi.encode(
      //address payable _vault,uint256 _posId,address _worker,uint256 _principalAmount,uint256 _borrowAmount,uint256 _maxReturn, bytes stratData
      address(_assetVault),
      1,
      address(_assetVaultWorker),
      75 ether,
      150 ether,
      0,
      abi.encode(1) // Fake Vault Deposit Action
    );

    bytes memory _data = abi.encode(_actions, _values, _workDatas);

    // 3x Position

    _deltaVault.deposit(25 ether, 75 ether, address(this), 0, _data);

    (uint256 _longEquity, uint256 _longDebt, , uint256 _shortEquity, uint256 _shortDebt, ) = _deltaVault.positionInfo();

    assertEq(_longEquity, 50 ether);
    assertEq(_longDebt, 100 ether);
    assertEq(_shortEquity, 150 ether);
    assertEq(_shortDebt, 300 ether);

    assertEq(_deltaVault.balanceOf(address(this)), 200 ether);
  }

  function testCorrectness_DepositShouldWorkIfPublicVault() external {
    _config.setController(address(0));

    uint8[] memory _actions = new uint8[](2);
    uint256[] memory _values = new uint256[](2);
    bytes[] memory _workDatas = new bytes[](2);

    _actions[0] = 1;
    _values[0] = 0;
    _workDatas[0] = abi.encode(
      //address payable _vault,uint256 _posId,address _worker,uint256 _principalAmount,uint256 _borrowAmount,uint256 _maxReturn, bytes stratData
      address(_stableVault),
      1,
      address(_stableVaultWorker),
      25 ether,
      50 ether,
      0,
      abi.encode(1) // Fake Vault Deposit Action
    );

    _actions[1] = 1;
    _values[1] = 0;
    _workDatas[1] = abi.encode(
      //address payable _vault,uint256 _posId,address _worker,uint256 _principalAmount,uint256 _borrowAmount,uint256 _maxReturn, bytes stratData
      address(_assetVault),
      1,
      address(_assetVaultWorker),
      75 ether,
      150 ether,
      0,
      abi.encode(1) // Fake Vault Deposit Action
    );

    bytes memory _data = abi.encode(_actions, _values, _workDatas);

    // 3x Position

    _deltaVault.deposit(25 ether, 75 ether, address(this), 0, _data);

    (uint256 _longEquity, uint256 _longDebt, , uint256 _shortEquity, uint256 _shortDebt, ) = _deltaVault.positionInfo();

    assertEq(_longEquity, 50 ether);
    assertEq(_longDebt, 100 ether);
    assertEq(_shortEquity, 150 ether);
    assertEq(_shortDebt, 300 ether);

    assertEq(_deltaVault.balanceOf(address(this)), 200 ether);
  }

  function testRevert_CantDepositIfNoCredit() external {
    _controller.setRevertOnDeposit(true);

    uint8[] memory _actions = new uint8[](2);
    uint256[] memory _values = new uint256[](2);
    bytes[] memory _workDatas = new bytes[](2);

    _actions[0] = 1;
    _values[0] = 0;
    _workDatas[0] = abi.encode(
      //address payable _vault,uint256 _posId,address _worker,uint256 _principalAmount,uint256 _borrowAmount,uint256 _maxReturn, bytes stratData
      address(_stableVault),
      1,
      address(_stableVaultWorker),
      25 ether,
      50 ether,
      0,
      abi.encode(1) // Fake Vault Deposit Action
    );

    _actions[1] = 1;
    _values[1] = 0;
    _workDatas[1] = abi.encode(
      //address payable _vault,uint256 _posId,address _worker,uint256 _principalAmount,uint256 _borrowAmount,uint256 _maxReturn, bytes stratData
      address(_assetVault),
      1,
      address(_assetVaultWorker),
      75 ether,
      150 ether,
      0,
      abi.encode(1) // Fake Vault Deposit Action
    );

    bytes memory _data = abi.encode(_actions, _values, _workDatas);

    // 3x Position
    vm.expectRevert(abi.encodeWithSignature("AutomatedVaultController_InsufficientCredit()"));
    _deltaVault.deposit(25 ether, 75 ether, address(this), 0, _data);
  }

  function testCorrectness_WithdrawShouldWork() external {
    uint8[] memory _actions = new uint8[](2);
    uint256[] memory _values = new uint256[](2);
    bytes[] memory _workDatas = new bytes[](2);

    _actions[0] = 1;
    _values[0] = 0;
    _workDatas[0] = abi.encode(
      //address payable _vault,uint256 _posId,address _worker,uint256 _principalAmount,uint256 _borrowAmount,uint256 _maxReturn, bytes stratData
      address(_stableVault),
      1,
      address(_stableVaultWorker),
      0,
      0,
      50 ether,
      abi.encode(2) // ignore strat bytes here
    );

    _actions[1] = 1;
    _values[1] = 0;
    _workDatas[1] = abi.encode(
      //address payable _vault,uint256 _posId,address _worker,uint256 _principalAmount,uint256 _borrowAmount,uint256 _maxReturn, bytes stratData
      address(_assetVault),
      1,
      address(_assetVaultWorker),
      0,
      0,
      150 ether,
      abi.encode(2) // ignore strat bytes here
    );

    bytes memory _data = abi.encode(_actions, _values, _workDatas);

    // withdraw 3x Position

    _deltaVault.withdraw(100 ether, 0, 0, _data);

    (uint256 _longEquity, uint256 _longDebt, , uint256 _shortEquity, uint256 _shortDebt, ) = _deltaVault.positionInfo();

    assertEq(_longEquity, 0 ether);
    assertEq(_longDebt, 0 ether);
    assertEq(_shortEquity, 0 ether);
    assertEq(_shortDebt, 0 ether);

    assertEq(_deltaVault.balanceOf(address(this)), 0 ether);
  }

  function initPosition() internal {
    uint8[] memory _actions = new uint8[](2);
    uint256[] memory _values = new uint256[](2);
    bytes[] memory _workDatas = new bytes[](2);

    _actions[0] = 1;
    _values[0] = 0;
    _workDatas[0] = abi.encode(
      //address payable _vault,uint256 _posId,address _worker,uint256 _principalAmount,uint256 _borrowAmount,uint256 _maxReturn, bytes stratData
      address(_stableVault),
      1,
      address(_stableVaultWorker),
      25 ether,
      50 ether,
      0,
      abi.encode(1) // Fake Vault Deposit Action
    );

    _actions[1] = 1;
    _values[1] = 0;
    _workDatas[1] = abi.encode(
      //address payable _vault,uint256 _posId,address _worker,uint256 _principalAmount,uint256 _borrowAmount,uint256 _maxReturn, bytes stratData
      address(_assetVault),
      1,
      address(_assetVaultWorker),
      75 ether,
      150 ether,
      0,
      abi.encode(1) // Fake Vault Deposit Action
    );

    bytes memory _data = abi.encode(_actions, _values, _workDatas);

    // 3x Position
    _deltaVault.initPositions(25 ether, 75 ether, 0, _data);

    (uint256 _longEquity, uint256 _longDebt, , uint256 _shortEquity, uint256 _shortDebt, ) = _deltaVault.positionInfo();

    assertEq(_longEquity, 25 ether);
    assertEq(_longDebt, 50 ether);
    assertEq(_shortEquity, 75 ether);
    assertEq(_shortDebt, 150 ether);

    assertEq(_deltaVault.balanceOf(address(this)), 100 ether);
  }
}
