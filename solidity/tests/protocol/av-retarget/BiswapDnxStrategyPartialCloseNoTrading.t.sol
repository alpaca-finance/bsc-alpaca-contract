// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, BiswapDnxStrategyPartialCloseNoTradingLike, MockErc20Like, MockLpErc20Like, console } from "../../base/BaseTest.sol";
import { mocking } from "../../utils/mocking.sol";
import { MockContract } from "../../utils/MockContract.sol";
import { FakeDeltaWorker } from "../../fake/FakeDeltaWorker.sol";
import { FakeRouter } from "../../fake/FakeRouter.sol";
import { FakeFactory } from "../../fake/FakeFactory.sol";

contract BiswapDnxStrategyPartialCloseNoTrading_Test is BaseTest {
  using mocking for *;
  BiswapDnxStrategyPartialCloseNoTradingLike private _strat;
  MockContract private _deltaNeutralVault;
  FakeDeltaWorker private _worker;
  FakeRouter private _router;
  FakeFactory private _factory;
  MockErc20Like private _baseToken;
  MockErc20Like private _farmToken;
  MockLpErc20Like private _lpToken;

  function setUp() external {
    _factory = new FakeFactory();
    _router = new FakeRouter(address(_factory));
    _strat = _setupBiswapDnxPartialCloseNoTradingStrategy(address(_router));
    _deltaNeutralVault = new MockContract();
    _baseToken = _setupToken("WBNB", "WBNB", 18);
    _farmToken = _setupToken("USDT", "USDT", 18);
    _lpToken = _setupLpToken("LP TOKEN", "LP", 18);
    _worker = new FakeDeltaWorker(address(_lpToken));
    _worker.setBaseToken(address(_baseToken));
    _worker.setFarmingToken(address(_farmToken));

    address[] memory _workers = new address[](1);
    _workers[0] = address(_worker);
    _strat.setWorkersOk(_workers, true);

    address[] memory _deltaNeutralVaults = new address[](1);
    _deltaNeutralVaults[0] = address(_deltaNeutralVault);
    _strat.setDeltaNeutralVaultsOk(_deltaNeutralVaults, true);

    _factory.setLpTokenForRemoveLiquidity(address(_lpToken));
    _router.setLpTokenForRemoveLiquidity(address(_lpToken));

    _baseToken.mint(address(_router), 50 ether);
    _farmToken.mint(address(_router), 50 ether);
  }

  function test_execute_shouldBorrowCorrectly() external {
    _lpToken.mint(address(_strat), 100 ether);
    _router.setRemoveLiquidityAmountsOut(50 ether, 50 ether);

    vm.prank(address(_worker));
    _strat.execute(address(this), 0, abi.encode(100 ether, address(_deltaNeutralVault)));

    assertEq(_baseToken.balanceOf(address(_deltaNeutralVault)), 50 ether);
    assertEq(_farmToken.balanceOf(address(_deltaNeutralVault)), 50 ether);
  }

  function test_execute_withBadWorker_shouldFail() external {
    vm.expectRevert("bad worker");
    _strat.execute(address(this), 0, abi.encode(0, 0, address(_deltaNeutralVault)));
  }

  function test_execute_withBadTarget_shouldFail() external {
    vm.expectRevert("bad target");

    vm.prank(address(_worker));
    _strat.execute(address(this), 0, abi.encode(0, 0, address(this)));
  }
}
