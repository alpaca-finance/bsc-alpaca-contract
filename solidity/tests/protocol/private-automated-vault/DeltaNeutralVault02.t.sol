// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, DeltaNeutralVault02Like, MockErc20Like, console } from "../../base/BaseTest.sol";
import { mocking } from "../../utils/mocking.sol";
import { MockContract } from "../../utils/MockContract.sol";

import { IDeltaNeutralOracle } from "../../../contracts/8.13/interfaces/IDeltaNeutralOracle.sol";
import { IDeltaNeutralVaultConfig } from "../../../contracts/8.13/interfaces/IDeltaNeutralVaultConfig.sol";

import { FakeDeltaWorker } from "./FakeDeltaWorker.sol";
import { FakeDeltaNeutralOracle } from "./FakeDeltaNeutralOracle.sol";
import { FakeVault } from "./FakeVault.sol";
import { FakeDeltaNeutralVaultConfig } from "./FakeDeltaNeutralVaultConfig.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract DeltaNeutralVault02_Test is BaseTest {
  using mocking for *;
  DeltaNeutralVault02Like private _deltaVault;

  FakeVault private _stableVault;
  FakeVault private _assetVault;
  FakeDeltaWorker private _stableVaultWorker;
  FakeDeltaWorker private _assetVaultWorker;
  FakeDeltaNeutralOracle private _priceOracle;
  FakeDeltaNeutralVaultConfig private _config;
  MockErc20Like private _lpToken;
  MockErc20Like private _alpacaToken;
  MockErc20Like private _stableToken;
  MockErc20Like private _assetToken;

  function setUp() external {
    _priceOracle = new FakeDeltaNeutralOracle();
    _config = new FakeDeltaNeutralVaultConfig();
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

    _stableToken.approve(address(_deltaVault), 10000 ether);
    _assetToken.approve(address(_deltaVault), 10000 ether);

    // Config: set important config
    _config.setLeverageLevel(3);
    _config.setParams(address(1), address(2), address(3), 6800, 100, 100);
    _config.setFees(address(this), 0, address(this), 0, address(this), 0);
  }

  function testCorrectness_initPositions() external {
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
      abi.encode(1) // ignore strat bytes here
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
      abi.encode(1) // ignore strat bytes here
    );

    bytes memory _data = abi.encode(_actions, _values, _workDatas);

    console.log("begin init");
    _deltaVault.initPositions(25 ether, 75 ether, 0, _data);
    logPositionInfo();
    console.log("stableToken balance @ delta", _stableToken.balanceOf(address(_deltaVault)));
    console.log("stableToken balance @ vault", _stableToken.balanceOf(address(_stableVault)));
  }

  function logPositionInfo() internal {
    (
      uint256 _longEquity,
      uint256 _longDebt,
      uint256 _longLpAmount,
      uint256 _shortEquity,
      uint256 _shortDebt,
      uint256 _shortLpAmount
    ) = _deltaVault.positionInfo();
    console.log("Long Equity", _longEquity);
    console.log("Long Debt", _longDebt);
    console.log("Long LP Amount", _longLpAmount);

    console.log("short Equity", _shortEquity);
    console.log("short Debt", _shortDebt);
    console.log("short LP Amount", _shortLpAmount);
  }
}
