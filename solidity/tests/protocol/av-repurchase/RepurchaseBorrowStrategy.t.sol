// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, RepurchaseBorrowStrategyLike, MockErc20Like, MockLpErc20Like, console } from "../../base/BaseTest.sol";
import { mocking } from "../../utils/mocking.sol";
import { MockContract } from "../../utils/MockContract.sol";
import { FakeDeltaWorker } from "../../fake/FakeDeltaWorker.sol";

contract RepurchaseBorrowStrategy_Test is BaseTest {
  using mocking for *;
  RepurchaseBorrowStrategyLike private _strat;
  MockContract private _deltaNeutralVault;
  FakeDeltaWorker private _worker;
  MockErc20Like private _baseToken;
  MockLpErc20Like private _lpToken;

  function setUp() external {
    _strat = _setupRepurchaseBorrowStrategy();
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
  }

  function test_execute_shouldBorrowCorrectly() external {
    _baseToken.balanceOf.mockv(address(_strat), 1 ether);
    _baseToken.mint(address(_strat), 1 ether);

    vm.expectCall(address(_worker), abi.encodeCall(_worker.baseToken, ()));
    vm.expectCall(address(_baseToken), abi.encodeCall(_baseToken.transfer, (address(_deltaNeutralVault), 1 ether)));

    vm.prank(address(_worker));
    _strat.execute(address(this), 0, abi.encode(address(_deltaNeutralVault)));
  }

  function test_execute_withBadWorker_shouldFail() external {
    vm.expectRevert("RepurchaseBorrowStrategy::onlyWhitelistedWorkers:: bad worker");
    _strat.execute(address(this), 0, abi.encode(address(_deltaNeutralVault)));
  }

  function test_execute_withBadTarget_shouldFail() external {
    vm.expectRevert("RepurchaseBorrowStrategy::execute:: bad target");

    vm.prank(address(_worker));
    _strat.execute(address(this), 0, abi.encode(address(this)));
  }
}
