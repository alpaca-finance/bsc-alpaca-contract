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
  error NFTBoostedLeverageController_ExceedMaxBoosted();

  /// ------ States ------
  // nftAddresss => worker => boostNumber
  struct BoostedConfig {
    uint64 workFactor;
    uint64 killFactor;
  }
  mapping(address => mapping(address => BoostedConfig)) public boostedConfig;

  INFTStaking public nftStaking;

  /// ------ Events ------
  event LogSetBoosted(address[] _workers, uint64[] _workFactors, uint64[] _killFactors);

  constructor() initializer {}

  function initialize(INFTStaking _nftStaking) external initializer {
    OwnableUpgradeable.__Ownable_init();
    nftStaking = _nftStaking;
  }

  /// @dev Get the Boosted Work Factor from the specified Worker by checking if the position owner is eligible
  /// @param _owner position owner address
  /// @param _worker worker address
  function getBoostedWorkFactor(address _owner, address _worker) external view override returns (uint64) {
    address nftAddress = nftStaking.userHighestWeightNftAddress(_owner);
    return nftAddress != address(0) ? boostedConfig[nftAddress][_worker].workFactor : 0;
  }

  /// @dev Get the Boosted Kill Factor from the specified Worker by checking if the position owner is eligible
  /// @param _owner position owner address
  /// @param _worker worker address
  function getBoostedKillFactor(address _owner, address _worker) external view override returns (uint64) {
    address nftAddress = nftStaking.userHighestWeightNftAddress(_owner);
    return nftAddress != address(0) ? boostedConfig[nftAddress][_worker].killFactor : 0;
  }

  function setBoosted(
    address[] calldata _nftAddresss,
    address[] calldata _workers,
    uint64[] calldata _workFactors,
    uint64[] calldata _killFactors
  ) external onlyOwner {
    if (
      (_nftAddresss.length != _workers.length) ||
      (_nftAddresss.length != _workFactors.length) ||
      (_workers.length != _killFactors.length)
    ) revert NFTBoostedLeverageController_BadParamsLength();
    for (uint256 _i; _i < _workers.length; _i++) {
      if (_workFactors[_i] > 10000 || _killFactors[_i] > 10000) revert NFTBoostedLeverageController_ExceedMaxBoosted();
      boostedConfig[_nftAddresss[_i]][_workers[_i]].workFactor = _workFactors[_i];
      boostedConfig[_nftAddresss[_i]][_workers[_i]].killFactor = _killFactors[_i];
    }
    emit LogSetBoosted(_workers, _workFactors, _killFactors);
  }
}
