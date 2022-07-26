// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, RepurchaseRepayStrategyLike, MockErc20Like, MockLpErc20Like, console } from "../../base/BaseTest.sol";
import { mocking } from "../../utils/mocking.sol";
import { MockContract } from "../../utils/MockContract.sol";
import { FakeDeltaWorker } from "../../fake/FakeDeltaWorker.sol";
import { FakeVault } from "../../fake/FakeVault.sol";

contract RepurchaseRepayStrategy_Test is BaseTest {
  using mocking for *;
  RepurchaseRepayStrategyLike private strat;
  MockContract private deltaNeutralVault;
  FakeDeltaWorker private worker;
  MockErc20Like private baseToken;
  MockLpErc20Like private lpToken;
  FakeVault private vault;

  function setUp() external {
    strat = _setupRepurchaseRepayStrategy();
    deltaNeutralVault = new MockContract();
    baseToken = _setupToken("ALPACA", "ALPACA", 18);
    lpToken = _setupLpToken("LP TOKEN", "LP", 18);
    worker = new FakeDeltaWorker(address(lpToken));
    vault = new FakeVault(address(baseToken), 1 ether);

    worker.setBaseToken(address(baseToken));
    vault.setPositionOwner(address(deltaNeutralVault));

    address[] memory workers = new address[](1);
    workers[0] = address(worker);
    strat.setWorkersOk(workers, true);
  }

  function test_execute_shouldRepayCorrectly() external {
    baseToken.balanceOf.mockv(address(deltaNeutralVault), 10 ether);
    baseToken.mint(address(deltaNeutralVault), 10 ether);

    vm.prank(address(deltaNeutralVault));
    baseToken.approve(address(vault), 10 ether);

    vm.expectCall(address(worker), abi.encodeCall(worker.baseToken, ()));
    vm.expectCall(
      address(baseToken),
      abi.encodeCall(baseToken.transferFrom, (address(deltaNeutralVault), address(strat), 10 ether))
    );

    vm.prank(address(worker));
    strat.execute(address(this), 0, abi.encode(address(vault), 10 ether));
  }

  function test_execute_withBadWorker_shouldFail() external {
    vm.expectRevert("RepurchaseRepayStrategy::onlyWhitelistedWorkers:: bad worker");
    strat.execute(address(this), 0, abi.encode(address(deltaNeutralVault)));
  }
}
