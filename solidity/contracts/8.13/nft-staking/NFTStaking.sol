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

import { IERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import { IERC721ReceiverUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import { INFTStaking } from "./interfaces/INFTStaking.sol";

contract NFTStaking is INFTStaking, OwnableUpgradeable, ReentrancyGuardUpgradeable, IERC721ReceiverUpgradeable {
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

  /// ------ Errors ------
  error NFTStaking_Unauthorize();
  error NFTStaking_PoolAlreadyExist();
  error NFTStaking_InvalidLockPeriod();
  error NFTStaking_PoolNotExist();
  error NFTStaking_IsNotExpired();
  error NFTStaking_BadParamsLength();
  error NFTStaking_NFTAlreadyStaked();
  error NFTStaking_NoNFTStaked();

  /// ------ States ------
  // Info of each pool.
  // Mapping of NFT token addresses that are allowed to stake in this pool
  struct PoolInfo {
    bool isInit;
    uint256 poolWeight;
    uint256 minLockPeriod;
    uint256 maxLockPeriod;
  }

  struct NFTStakingInfo {
    uint256 lockPeriod;
    bool isExist;
  }

  // NFT address (PoolId) => PoolInfo
  mapping(address => PoolInfo) public poolInfo;
  // Deposit Id (poolId + userAddress + nftTokenId) => LockPeriod
  mapping(bytes32 => NFTStakingInfo) public userStakingNFT;
  mapping(address => address) public userHighestWeightPoolId;
  mapping(address => EnumerableSetUpgradeable.AddressSet) private userStakingPool;

  /// ------ Events ------
  event LogStakeNFT(address indexed _staker, address indexed _poolId, uint256 _nftTokenId, uint256 _lockPeriod);
  event LogUnstakeNFT(address indexed _staker, address indexed _poolId, uint256 _nftTokenId);
  event LogAddPool(
    address indexed _caller,
    address indexed _poolId,
    uint256 _poolWeight,
    uint256 _minLockPeriod,
    uint256 _maxLockPeriod
  );
  event LogSetStakeNFTToken(address indexed _caller, address indexed _poolId);

  modifier onlyEOA() {
    if (msg.sender != tx.origin) revert NFTStaking_Unauthorize();
    _;
  }

  function initialize() external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
  }

  function addPool(
    address _poolId,
    uint256 _poolWeight,
    uint256 _minLockPeriod,
    uint256 _maxLockPeriod
  ) external onlyOwner {
    if (poolInfo[_poolId].isInit) revert NFTStaking_PoolAlreadyExist();
    if (_minLockPeriod > _maxLockPeriod) revert NFTStaking_InvalidLockPeriod();
    poolInfo[_poolId].isInit = true;
    poolInfo[_poolId].poolWeight = _poolWeight;
    poolInfo[_poolId].minLockPeriod = _minLockPeriod;
    poolInfo[_poolId].maxLockPeriod = _maxLockPeriod;

    emit LogAddPool(msg.sender, _poolId, _poolWeight, _minLockPeriod, _maxLockPeriod);
  }

  function stakeNFT(
    address _poolId,
    uint256 _nftTokenId,
    uint256 _lockPeriod
  ) external nonReentrant onlyEOA {
    bytes32 _depositId = keccak256(abi.encodePacked(_poolId, msg.sender, _nftTokenId));
    if (userStakingNFT[_depositId].lockPeriod > 0) revert NFTStaking_NFTAlreadyStaked();

    userStakingNFT[_depositId] = NFTStakingInfo({ lockPeriod: _lockPeriod, isExist: true });

    if (poolInfo[userHighestWeightPoolId[msg.sender]].poolWeight < poolInfo[_poolId].poolWeight) {
      userHighestWeightPoolId[msg.sender] = _poolId;
    }
    IERC721Upgradeable(_poolId).safeTransferFrom(msg.sender, address(this), _nftTokenId);
    userStakingPool[msg.sender].add(_poolId);
    if (_poolId == address(0)) {
      IERC721Upgradeable(_poolId).safeTransferFrom(address(this), msg.sender, _nftTokenId);
      userStakingPool[msg.sender].remove(_poolId);
    }

    emit LogStakeNFT(msg.sender, _poolId, _nftTokenId, _lockPeriod);
  }

  function unstakeNFT(address _poolId, uint256 _nftTokenId) external nonReentrant onlyEOA {
    bytes32 _depositId = keccak256(abi.encodePacked(_poolId, msg.sender, _nftTokenId));
    NFTStakingInfo memory _toBeSentBackNFT = userStakingNFT[_depositId];
    if (!_toBeSentBackNFT.isExist) revert NFTStaking_NoNFTStaked();
    userStakingNFT[_depositId] = NFTStakingInfo({ isExist: false, lockPeriod: 0 });

    IERC721Upgradeable(_poolId).safeTransferFrom(address(this), msg.sender, _nftTokenId);

    // Reset highest pool weight
    userHighestWeightPoolId[msg.sender] = address(0x00);
    // Remove pool from user
    userStakingPool[msg.sender].remove(_poolId);

    // Find new highest weight
    for (uint256 i = 0; i < userStakingPool[msg.sender].length(); i++) {
      if (
        poolInfo[userHighestWeightPoolId[msg.sender]].poolWeight <
        poolInfo[userStakingPool[msg.sender].at(i)].poolWeight
      ) {
        userHighestWeightPoolId[msg.sender] = userStakingPool[msg.sender].at(i);
      }
    }

    emit LogUnstakeNFT(msg.sender, _poolId, _nftTokenId);
  }

  function isStaked(
    address _poolId,
    address _user,
    uint256 _nftTokenId
  ) external view override returns (bool) {
    bytes32 _depositId = keccak256(abi.encodePacked(_poolId, _user, _nftTokenId));
    return isPoolExist(_poolId) && userStakingNFT[_depositId].isExist;
  }

  function isPoolExist(address _poolId) public view returns (bool) {
    return poolInfo[_poolId].isInit;
  }

  /// @dev when doing a safeTransferFrom, the caller needs to implement this, for safety reason
  function onERC721Received(
    address, /*operator*/
    address, /*from*/
    uint256, /*tokenId*/
    bytes calldata /*data*/
  ) external pure returns (bytes4) {
    return IERC721ReceiverUpgradeable.onERC721Received.selector;
  }
}
