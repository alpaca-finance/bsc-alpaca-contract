// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, RepurchaseRepayStrategyLike, MockErc20Like, MockLpErc20Like, console } from "../../base/BaseTest.sol";
import { mocking } from "../../utils/mocking.sol";
import { MockContract } from "../../utils/MockContract.sol";
import { FakeDeltaWorker } from "../../fake/FakeDeltaWorker.sol";
import { FakeVault } from "../../fake/FakeVault.sol";

contract RepurchaseRepayStrategy_Test is BaseTest {
  using mocking for *;
  RepurchaseRepayStrategyLike private _strat;
  MockContract private _deltaNeutralVault;
  FakeDeltaWorker private _worker;
  MockErc20Like private _baseToken;
  MockLpErc20Like private _lpToken;
  FakeVault private _vault;

  function setUp() external {
    _strat = _setupRepurchaseRepayStrategy();
    _deltaNeutralVault = new MockContract();
    _baseToken = _setupToken("ALPACA", "ALPACA", 18);
    _lpToken = _setupLpToken("LP TOKEN", "LP", 18);
    _worker = new FakeDeltaWorker(address(_lpToken));
    _vault = new FakeVault(address(_baseToken), 1 ether);

    _worker.setBaseToken(address(_baseToken));
    _vault.setPositionOwner(address(_deltaNeutralVault));

    address[] memory _workers = new address[](1);
    _workers[0] = address(_worker);
    _strat.setWorkersOk(_workers, true);
  }

  function test_execute_shouldRepayCorrectly() external {
    _baseToken.balanceOf.mockv(address(_deltaNeutralVault), 10 ether);
    _baseToken.mint(address(_deltaNeutralVault), 10 ether);

    vm.prank(address(_deltaNeutralVault));
    _baseToken.approve(address(_vault), 10 ether);

    vm.expectCall(address(_worker), abi.encodeCall(_worker.baseToken, ()));
    vm.expectCall(
      address(_baseToken),
      abi.encodeCall(_baseToken.transferFrom, (address(_deltaNeutralVault), address(_strat), 10 ether))
    );

    vm.prank(address(_worker));
    _strat.execute(address(this), 0, abi.encode(address(_vault), 10 ether));
  }

  function test_execute_withBadWorker_shouldFail() external {
    vm.expectRevert("RepurchaseRepayStrategy::onlyWhitelistedWorkers:: bad worker");
    _strat.execute(address(this), 0, abi.encode(address(_deltaNeutralVault)));
  }
}
