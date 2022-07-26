// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, RepurchaseBorrowStrategyLike, MockErc20Like, MockLpErc20Like, console } from "../../base/BaseTest.sol";
import { mocking } from "../../utils/mocking.sol";
import { MockContract } from "../../utils/MockContract.sol";
import { FakeDeltaWorker } from "../../fake/FakeDeltaWorker.sol";

contract RepurchaseBorrowStrategy_Test is BaseTest {
  using mocking for *;
  RepurchaseBorrowStrategyLike private strat;
  MockContract private deltaNeutralVault;
  FakeDeltaWorker private worker;
  MockErc20Like private baseToken;
  MockLpErc20Like private lpToken;

  function setUp() external {
    strat = _setupRepurchaseBorrowStrategy();
    deltaNeutralVault = new MockContract();
    baseToken = _setupToken("ALPACA", "ALPACA", 18);
    lpToken = _setupLpToken("LP TOKEN", "LP", 18);
    worker = new FakeDeltaWorker(address(lpToken));
    worker.setBaseToken(address(baseToken));

    address[] memory workers = new address[](1);
    workers[0] = address(worker);
    strat.setWorkersOk(workers, true);

    address[] memory deltaNeutralVaults = new address[](1);
    deltaNeutralVaults[0] = address(deltaNeutralVault);
    strat.setDeltaNeutralVaultsOk(deltaNeutralVaults, true);
  }

  function test_execute_shouldBorrowCorrectly() external {
    baseToken.balanceOf.mockv(address(strat), 1 ether);
    baseToken.mint(address(strat), 1 ether);

    vm.expectCall(address(worker), abi.encodeCall(worker.baseToken, ()));
    vm.expectCall(address(baseToken), abi.encodeCall(baseToken.transfer, (address(deltaNeutralVault), 1 ether)));

    vm.prank(address(worker));
    strat.execute(address(this), 0, abi.encode(address(deltaNeutralVault)));
  }

  function test_execute_withBadWorker_shouldFail() external {
    vm.expectRevert("RepurchaseBorrowStrategy::onlyWhitelistedWorkers:: bad worker");
    strat.execute(address(this), 0, abi.encode(address(deltaNeutralVault)));
  }

  function test_execute_withBadTarget_shouldFail() external {
    vm.expectRevert("RepurchaseBorrowStrategy::execute:: bad target");

    vm.prank(address(worker));
    strat.execute(address(this), 0, abi.encode(address(this)));
  }
}
