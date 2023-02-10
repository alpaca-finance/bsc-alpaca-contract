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

interface IWorkerReader {
  struct WorkerReinvestConfig {
    address worker;
    address masterChef;
    uint256 minReinvestValue;
  }

  struct WorkerReinvestResult {
    address worker;
    bool shouldReinvest;
  }

  function getWorkerReinvestReuslt(WorkerReinvestConfig[] memory _workers)
    external
    view
    returns (WorkerReinvestResult[] memory);

  function shouldReinvest(WorkerReinvestConfig memory _worker) external view returns (bool _yes);

  function getPendingReward(
    address _masterChef,
    address _worker,
    uint256 _pid
  ) external view returns (uint256 _pendingReward);
}
