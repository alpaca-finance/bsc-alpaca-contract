// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, PancakeswapV2RestrictedDnxStrategyPartialCloseNoTradingLike, MockErc20Like, MockLpErc20Like, console } from "../../base/BaseTest.sol";
import { mocking } from "../../utils/mocking.sol";
import { MockContract } from "../../utils/MockContract.sol";
import { FakeDeltaWorker } from "../../fake/FakeDeltaWorker.sol";
import { FakeRouter } from "../../fake/FakeRouter.sol";
import { FakeFactory } from "../../fake/FakeFactory.sol";

contract PancakeswapV2RestrictedDnxStrategyPartialCloseNoTrading_Test is BaseTest {
  using mocking for *;
  PancakeswapV2RestrictedDnxStrategyPartialCloseNoTradingLike private _strat;
  MockContract private _deltaNeutralVault;
  FakeDeltaWorker private _worker;
  FakeRouter private _router;
  FakeFactory private _factory;
  MockErc20Like private _baseToken;
  MockLpErc20Like private _lpToken;

  function setUp() external {
    _factory = new FakeFactory();
    _router = new FakeRouter(address(_factory));
    _strat = _setupPancakeswapDnxPartialCloseNoTradingStrategy(address(_router));
    _deltaNeutralVault = new MockContract();
    _baseToken = _setupToken("ALPACA", "ALPACA", 18);
    _lpToken = _setupLpToken("LP TOKEN", "LP", 18);
    _worker = new FakeDeltaWorker(address(_lpToken));
    _worker.setBaseToken(address(_baseToken));

    address[] memory _workers = new address[](1);
    _workers[0] = address(_worker);
    _strat.setWorkersOk(_workers, true);

    address[] memory _deltaNeutralVaults = new address[](1);
    _deltaNeutralVaults[0] = address(_deltaNeutralVault);
    _strat.setDeltaNeutralVaultsOk(_deltaNeutralVaults, true);

    _factory.setLpTokenForRemoveLiquidity(address(_lpToken));
    _router.setLpTokenForRemoveLiquidity(address(_lpToken));
  }

  function test_execute_shouldBorrowCorrectly() external {
    // _baseToken.balanceOf.mockv(address(_strat), 1 ether);
    // _baseToken.mint(address(_strat), 1 ether);
    // vm.expectCall(address(_worker), abi.encodeCall(_worker.baseToken, ()));
    // vm.expectCall(address(_baseToken), abi.encodeCall(_baseToken.transfer, (address(_deltaNeutralVault), 1 ether)));
    // vm.prank(address(_worker));
    // _strat.execute(address(this), 0, abi.encode(address(_deltaNeutralVault)));
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
