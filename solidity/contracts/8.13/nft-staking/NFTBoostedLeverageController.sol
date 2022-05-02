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

pragma solidity 0.8.13;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import { INFTBoostedLeverageController } from "./interfaces/INFTBoostedLeverageController.sol";
import { INFTStaking } from "./interfaces/INFTStaking.sol";

contract NFTBoostedLeverageController is INFTBoostedLeverageController, OwnableUpgradeable {
  /// ------ Errors ------
  error NFTBoostedLeverageController_NoPool();
  error NFTBoostedLeverageController_PoolAlreadyListed();
  error NFTBoostedLeverageController_BadParamsLength();

  /// ------ States ------
  // poolIds => worker => boostNumber
  mapping(address => mapping(address => uint256)) public boostedWorkFactors;
  mapping(address => mapping(address => uint256)) public boostedKillFactors;

  INFTStaking public nftStaking;

  /// ------ Events ------
  event LogSetBoosted(address[] _workers, uint256[] _workFactors, uint256[] _killFactors);

  function initialize(INFTStaking _nftStaking) external initializer {
    OwnableUpgradeable.__Ownable_init();
    nftStaking = _nftStaking;
  }

  function getBoostedWorkFactor(address _owner, address _worker, uint256 _nftTokenId) external view override returns (uint256) {
    address poolId = nftStaking.userHighestWeightPoolId(_owner);
    if (INFTStaking(nftStaking).isStaked(poolId, _owner, _nftTokenId)) {
      return boostedWorkFactors[poolId][_worker];
    }
    return 0;
  }

  function getBoostedKillFactor(address _owner, address _worker, uint256 _nftTokenId) external view override returns (uint256) {
    address poolId = nftStaking.userHighestWeightPoolId(_owner);
    if (INFTStaking(nftStaking).isStaked(poolId, _owner, _nftTokenId)) {
      return boostedKillFactors[poolId][_worker];
    }
    return 0;
  }

  function setBoosted(
    address[] calldata _poolIds,
    address[] calldata _workers,
    uint256[] calldata _workFactors,
    uint256[] calldata _killFactors
  ) external onlyOwner {
    if ((_poolIds.length != _workers.length) || (_poolIds.length != _workFactors.length) || (_workers.length != _killFactors.length)) 
      revert NFTBoostedLeverageController_BadParamsLength();
    for (uint256 _i; _i < _workers.length; _i++) {
      boostedWorkFactors[_poolIds[_i]][_workers[_i]] = _workFactors[_i];
      boostedKillFactors[_poolIds[_i]][_workers[_i]] = _killFactors[_i];
    }
    emit LogSetBoosted(_workers, _workFactors, _killFactors);
  }
}
