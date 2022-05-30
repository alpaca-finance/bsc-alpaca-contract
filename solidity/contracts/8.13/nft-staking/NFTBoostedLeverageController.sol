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
  mapping(address => mapping(address => uint256)) public boostedWorkFactors;
  mapping(address => mapping(address => uint256)) public boostedKillFactors;

  INFTStaking public nftStaking;

  /// ------ Events ------
  event LogSetBoosted(address[] _workers, uint256[] _workFactors, uint256[] _killFactors);

  function initialize(INFTStaking _nftStaking) external initializer {
    OwnableUpgradeable.__Ownable_init();
    nftStaking = _nftStaking;
  }

  function getBoostedWorkFactor(address _owner, address _worker) external view override returns (uint256) {
    address nftAddress = nftStaking.userHighestWeightNftAddress(_owner);
    return nftAddress != address(0) ? boostedWorkFactors[nftAddress][_worker] : 0;
  }

  function getBoostedKillFactor(address _owner, address _worker) external view override returns (uint256) {
    address nftAddress = nftStaking.userHighestWeightNftAddress(_owner);
    if (nftAddress != address(0)) {
      return boostedKillFactors[nftAddress][_worker];
    }
    return 0;
  }

  function setBoosted(
    address[] calldata _nftAddresss,
    address[] calldata _workers,
    uint256[] calldata _workFactors,
    uint256[] calldata _killFactors
  ) external onlyOwner {
    if (
      (_nftAddresss.length != _workers.length) ||
      (_nftAddresss.length != _workFactors.length) ||
      (_workers.length != _killFactors.length)
    ) revert NFTBoostedLeverageController_BadParamsLength();
    for (uint256 _i; _i < _workers.length; _i++) {
      if (_workFactors[_i] > 10000 || _killFactors[_i] > 10000) revert NFTBoostedLeverageController_ExceedMaxBoosted();
      boostedWorkFactors[_nftAddresss[_i]][_workers[_i]] = _workFactors[_i];
      boostedKillFactors[_nftAddresss[_i]][_workers[_i]] = _killFactors[_i];
    }
    emit LogSetBoosted(_workers, _workFactors, _killFactors);
  }
}
