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
    // PoolId => worker => boostNumber    
    mapping(bytes32 => mapping(address => uint256)) boostedWorkFactor;
    mapping(bytes32 => mapping(address => uint256)) boostedKillFactor;
    bytes32[] poolId;
    INFTStaking nftStaking;

    event LogAddPool(bytes32[] _poolId);


    function initialize() external initializer {
        OwnableUpgradeable.__Ownable_init();
    }


  
    function getBoostedWorkFactor(address owner, address _worker) external view override returns (uint256) {
        for (uint256 _i; _i < poolId.length; _i++) {
            if (boostedWorkFactor[poolId[_i]][_worker] != 0) {
                return boostedWorkFactor[poolId[_i]][_worker];
            }
        }
        return 0;
    }
    
    function getBoostedKillFactor(address owner, address _worker) external view override returns (uint256) {
        for (uint256 _i; _i < poolId.length; _i++) {
            if (boostedWorkFactor[poolId[_i]][_worker] != 0) {
                return boostedWorkFactor[poolId[_i]][_worker];
            }
        }
        return 0;
    }

    function setPoolFromContract() external onlyOwner() {
        // poolId = nftStaking.getPool();
        // return poolId[0];
        // return poolId;
    }

    function setBoosted(address[] calldata _workers, uint256[] calldata workFactors, uint256[] calldata killFactors) external onlyOwner{
        // ! This does not work
        poolId = nftStaking.getPool();
        
        // poolId = [bytes32('nft'), bytes32('nft2'), bytes32('nft3')];
        for (uint256 _i; _i < poolId.length; _i++) {
            boostedWorkFactor[poolId[_i]][_workers[_i]] = workFactors[_i];
            boostedKillFactor[poolId[_i]][_workers[_i]] = killFactors[_i];
        }
    }
}