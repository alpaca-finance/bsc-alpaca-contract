// SPDX-License-Identifier: MIT
/**
  ∩~~~~∩ 
  ξ ･×･ ξ 
  ξ　~　ξ 
  ξ　　 ξ 
  ξ　　 “~～~～〇 
  ξ　　　　　　 ξ 
  ξ ξ ξ~～~ξ ξ ξ 
　 ξ_ξξ_ξ　ξ_ξξ_ξ
Alpaca Fin Corporation
*/

pragma solidity 0.8.10;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import { IERC20 } from "./interfaces/IERC20.sol";
import { IWorker } from "./interfaces/IWorker.sol";
import { IGenericMasterChef } from "./interfaces/IGenericMasterChef.sol";
import { IWorkerReader } from "./interfaces/IWorkerReader.sol";

/// @title WorkerReader is a view-only contract.
/// declare masterChef address together with rewardToken address for simplicity
contract WorkerReader is IWorkerReader {
  /// @notice set of masterChefs on BSC
  address public constant pancakeMasterChef = 0xa5f8C5Dbd5F286960b9d90548680aE5ebFf07652;
  address public constant biswapMasterChef = 0xDbc1A13490deeF9c3C12b44FE77b503c1B061739;
  address public constant mdexMasterChef = 0xc48FE252Aa631017dF253578B1405ea399728A50;

  /// @notice set of masterChefs on FTM
  address public constant spookyMasterChef = 0x18b4f774fdC7BF685daeeF66c2990b1dDd9ea6aD;

  mapping(address => address) public masterChefRewards; // masterchef => rewardToken
  mapping(address => AggregatorV3Interface) public priceFeeds; // rewardToken => AggregatorV3Interface

  constructor(
    address[] memory _masterChefs,
    address[] memory _rewardTokens,
    AggregatorV3Interface[] memory _chainLinkAggregators
  ) {
    require(_masterChefs.length == _rewardTokens.length, "length mismatch");
    require(_rewardTokens.length == _chainLinkAggregators.length, "length mismatch");

    address _masterChef;
    address _rewardToken;
    AggregatorV3Interface _chainLinkAggregator;
    for (uint256 _i; _i < _masterChefs.length; ) {
      _masterChef = _masterChefs[_i];
      _rewardToken = _rewardTokens[_i];
      _chainLinkAggregator = _chainLinkAggregators[_i];

      masterChefRewards[_masterChef] = _rewardToken;
      priceFeeds[_rewardToken] = _chainLinkAggregator;

      // sanity check
      getPendingReward(_masterChef, address(0), 0);
      getTokenPrice(_rewardToken);

      unchecked {
        _i++;
      }
    }
  }

  /// @dev Return a set of workers with should reinvest flag.
  function getWorkerReinvestReuslt(WorkerReinvestConfig[] memory _workers)
    external
    view
    returns (WorkerReinvestResult[] memory)
  {
    uint256 _workersLength = _workers.length;
    WorkerReinvestResult[] memory _workerReinvestResult = new WorkerReinvestResult[](_workersLength);
    for (uint256 _i; _i < _workersLength; ) {
      _workerReinvestResult[_i] = WorkerReinvestResult({
        worker: _workers[_i].worker,
        shouldReinvest: shouldReinvest(_workers[_i])
      });

      unchecked {
        ++_i;
      }
    }

    return _workerReinvestResult;
  }

  /// @dev return true if _totalValue > minReinvestValue.
  function shouldReinvest(WorkerReinvestConfig memory _worker) public view returns (bool _yes) {
    address _rewardToken = masterChefRewards[_worker.masterChef];

    require(_rewardToken != address(0));
    // total reward left in worker + pending reward to be claim
    uint256 _totalReward = IERC20(_rewardToken).balanceOf(_worker.worker) +
      getPendingReward(_worker.masterChef, _worker.worker, IWorker(_worker.worker).pid());

    uint256 _totalValue = (_totalReward * getTokenPrice(_rewardToken)) / (10**IERC20(_rewardToken).decimals());

    if (_totalValue >= _worker.minReinvestValue) {
      return _yes = true;
    }
  }

  /// @dev get pending reward on dex. Need to modify this function when there is new dex.
  function getPendingReward(
    address _masterChef,
    address _worker,
    uint256 _pid
  ) public view returns (uint256 _pendingReward) {
    if (_masterChef == pancakeMasterChef) {
      _pendingReward = IGenericMasterChef(_masterChef).pendingCake(_pid, _worker);
    } else if (_masterChef == biswapMasterChef) {
      _pendingReward = IGenericMasterChef(_masterChef).pendingBSW(_pid, _worker);
    } else if (_masterChef == mdexMasterChef) {
      (_pendingReward, ) = IGenericMasterChef(_masterChef).pending(_pid, _worker);
    } else if (_masterChef == spookyMasterChef) {
      _pendingReward = IGenericMasterChef(_masterChef).pendingBOO(_pid, _worker);
    }
  }

  function getTokenPrice(address _token) public view returns (uint256) {
    (
      ,
      /* uint80 roundID */
      int256 price, /*uint startedAt*/ /*uint timeStamp*/ /*uint80 answeredInRound*/
      ,
      ,

    ) = priceFeeds[_token].latestRoundData();

    return ((uint256(price) * 1e18) / (10**priceFeeds[_token].decimals()));
  }
}
