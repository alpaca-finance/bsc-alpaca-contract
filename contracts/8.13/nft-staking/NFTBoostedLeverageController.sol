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

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./interfaces/INFTBoostedLeverageController.sol";
import "./interfaces/INFTStaking.sol";

contract NFTBoostedLeverageController is INFTBoostedLeverageController, OwnableUpgradeable {
  // @notice Errors
  error NFTBoostedLeverageController_NoPool();
  error NFTBoostedLeverageController_PoolAlreadyListed();
  error NFTBoostedLeverageController_BadParamsLength();

  // @notice States
  // poolIds => worker => boostNumber
  mapping(bytes32 => mapping(address => uint256)) public boostedWorkFactors;
  mapping(bytes32 => mapping(address => uint256)) public boostedKillFactors;
  mapping(bytes32 => bytes32) uniquePoolIds;

  bytes32[] public poolIds;
  address public nftStakingContractAddress;

  INFTStaking nftStaking;

  // @event Events
  event LogSetPools(bytes32[] _poolIds);
  event LogSetBoosted(address[] _workers, uint256[] _workFactors, uint256[] _killFactors);

  function initialize(address _nftStakingContractAddress) external initializer {
    OwnableUpgradeable.__Ownable_init();
    nftStakingContractAddress = _nftStakingContractAddress;
  }

  function getBoostedWorkFactor(address _owner, address _worker) external view override returns (uint256) {
    for (uint256 _i; _i < poolIds.length; _i++) {
      if (INFTStaking(nftStakingContractAddress).isStaked(poolIds[_i], _owner)) {
        if (boostedWorkFactors[poolIds[_i]][_worker] != 0) {
          return boostedWorkFactors[poolIds[_i]][_worker];
        }
      }
    }
    return 0;
  }

  function getBoostedKillFactor(address _owner, address _worker) external view override returns (uint256) {
    for (uint256 _i; _i < poolIds.length; _i++) {
      if (INFTStaking(nftStakingContractAddress).isStaked(poolIds[_i], _owner)) {
        if (boostedWorkFactors[poolIds[_i]][_worker] != 0) {
          return boostedKillFactors[poolIds[_i]][_worker];
        }
      }
    }
    return 0;
  }

  function setPools(bytes32[] calldata _poolIds) external onlyOwner {
    for (uint256 _i; _i < _poolIds.length; _i++) {
      if (uniquePoolIds[_poolIds[_i]] != 0) revert NFTBoostedLeverageController_PoolAlreadyListed();
      poolIds.push(_poolIds[_i]);
      uniquePoolIds[_poolIds[_i]] = _poolIds[_i];
    }
    emit LogSetPools(_poolIds);
  }

  function setBoosted(
    address[] calldata _workers,
    uint256[] calldata _workFactors,
    uint256[] calldata _killFactors
  ) external onlyOwner {
    if ((_workers.length != _workFactors.length) && (_workers.length != _killFactors.length))
      revert NFTBoostedLeverageController_BadParamsLength();
    if (poolIds.length == 0) revert NFTBoostedLeverageController_NoPool();
    for (uint256 _i; _i < poolIds.length; _i++) {
      boostedWorkFactors[poolIds[_i]][_workers[_i]] = _workFactors[_i];
      boostedKillFactors[poolIds[_i]][_workers[_i]] = _killFactors[_i];
    }
    emit LogSetBoosted(_workers, _workFactors, _killFactors);
  }
}
