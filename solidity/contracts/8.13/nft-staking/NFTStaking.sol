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
  error NFTStaking_InvalidPoolAddress();
  error NFTStaking_NFTNotStaked();

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
    // lockUntil == block.timestamp -> when users don't want to lock their NFT
    uint256 lockUntil;
  }

  // NFT address (nftAddress) => PoolInfo
  mapping(address => PoolInfo) public poolInfo;
  // Deposit Id (nftAddress + userAddress + nftTokenId) => LockPeriod
  mapping(bytes32 => NFTStakingInfo) public userStakingNFT;
  mapping(address => address) public userHighestWeightNftAddress;
  // User address => NFTaddress => count
  mapping(address => mapping(address => uint256)) public userNFTInStakingPool;
  // User address => NFTAddress[]
  mapping(address => EnumerableSetUpgradeable.AddressSet) private userStakingPool;

  /// ------ Events ------
  event LogStakeNFT(address indexed _staker, address indexed _nftAddress, uint256 _nftTokenId, uint256 _lockUntil);
  event LogExtendLockPeriod(
    address indexed _staker,
    address indexed _nftAddress,
    uint256 _nftTokenId,
    uint256 _lockUntil
  );
  event LogUnstakeNFT(address indexed _staker, address indexed _nftAddress, uint256 _nftTokenId);
  event LogAddPool(
    address indexed _caller,
    address indexed _nftAddress,
    uint256 _poolWeight,
    uint256 _minLockPeriod,
    uint256 _maxLockPeriod
  );
  event LogSetStakeNFTToken(address indexed _caller, address indexed _nftAddress);

  modifier onlyEOA() {
    if (msg.sender != tx.origin) revert NFTStaking_Unauthorize();
    _;
  }

  function initialize() external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
  }

  function addPool(
    address _nftAddress,
    uint256 _poolWeight,
    uint256 _minLockPeriod,
    uint256 _maxLockPeriod
  ) external onlyOwner {
    if (_nftAddress == address(0)) revert NFTStaking_InvalidPoolAddress();
    if (poolInfo[_nftAddress].isInit) revert NFTStaking_PoolAlreadyExist();
    if (_minLockPeriod > _maxLockPeriod) revert NFTStaking_InvalidLockPeriod();
    poolInfo[_nftAddress].isInit = true;
    poolInfo[_nftAddress].poolWeight = _poolWeight;
    poolInfo[_nftAddress].minLockPeriod = _minLockPeriod;
    poolInfo[_nftAddress].maxLockPeriod = _maxLockPeriod;

    emit LogAddPool(msg.sender, _nftAddress, _poolWeight, _minLockPeriod, _maxLockPeriod);
  }

  function stakeNFT(
    address _nftAddress,
    uint256 _nftTokenId,
    uint256 _lockUntil
  ) external nonReentrant onlyEOA {
    if (_nftAddress == address(0)) revert NFTStaking_InvalidPoolAddress();
    if (!poolInfo[_nftAddress].isInit) revert NFTStaking_PoolNotExist();
    bytes32 _depositId = keccak256(abi.encodePacked(_nftAddress, msg.sender, _nftTokenId));
    if (userStakingNFT[_depositId].lockUntil != 0) revert NFTStaking_NFTAlreadyStaked();
    if (_lockUntil < block.timestamp) revert NFTStaking_InvalidLockPeriod();
    uint256 _lockPeriod = _lockUntil - block.timestamp;
      if (_lockPeriod < poolInfo[_nftAddress].minLockPeriod || _lockPeriod > poolInfo[_nftAddress].maxLockPeriod) revert NFTStaking_InvalidLockPeriod();
    userStakingNFT[_depositId] = NFTStakingInfo({ lockUntil: _lockUntil });

    if (poolInfo[userHighestWeightNftAddress[msg.sender]].poolWeight < poolInfo[_nftAddress].poolWeight) {
      userHighestWeightNftAddress[msg.sender] = _nftAddress;
    }
    userStakingPool[msg.sender].add(_nftAddress);
    userNFTInStakingPool[msg.sender][_nftAddress] += 1;
    IERC721Upgradeable(_nftAddress).transferFrom(msg.sender, address(this), _nftTokenId);

    emit LogStakeNFT(msg.sender, _nftAddress, _nftTokenId, _lockUntil);
  }

  function extendLockPeriod(
    address _nftAddress,
    uint256 _nftTokenId,
    uint256 _newLockUntil
  ) external nonReentrant onlyEOA {
    if (_nftAddress == address(0)) revert NFTStaking_InvalidPoolAddress();
    if (!poolInfo[_nftAddress].isInit) revert NFTStaking_PoolNotExist();
    bytes32 _depositId = keccak256(abi.encodePacked(_nftAddress, msg.sender, _nftTokenId));
    if (_newLockUntil < userStakingNFT[_depositId].lockUntil) revert NFTStaking_InvalidLockPeriod();
    if (userStakingNFT[_depositId].lockUntil == 0) revert NFTStaking_NFTNotStaked();
    uint256 _lockPeriod = _newLockUntil - block.timestamp;
    if (_lockPeriod < poolInfo[_nftAddress].minLockPeriod) revert NFTStaking_InvalidLockPeriod();
    if (_lockPeriod > poolInfo[_nftAddress].maxLockPeriod) revert NFTStaking_InvalidLockPeriod();
    userStakingNFT[_depositId].lockUntil = _newLockUntil;
    emit LogExtendLockPeriod(msg.sender, _nftAddress, _nftTokenId, _newLockUntil);
  }

  function unstakeNFT(address _nftAddress, uint256 _nftTokenId) external nonReentrant onlyEOA {
    bytes32 _depositId = keccak256(abi.encodePacked(_nftAddress, msg.sender, _nftTokenId));
    NFTStakingInfo memory _toBeSentBackNFT = userStakingNFT[_depositId];
    if (_toBeSentBackNFT.lockUntil == 0) revert NFTStaking_NoNFTStaked();
    if (userStakingNFT[_depositId].lockUntil < block.timestamp) revert NFTStaking_IsNotExpired();
    userStakingNFT[_depositId] = NFTStakingInfo({ lockUntil: 0 });
    // Reset highest pool weight
    userHighestWeightNftAddress[msg.sender] = address(0x00);
   
   userNFTInStakingPool[msg.sender][_nftAddress] -= 1;
     // Remove pool from user if no NFT stake
    if (userNFTInStakingPool[msg.sender][_nftAddress] == 0) {
      userStakingPool[msg.sender].remove(_nftAddress);
    }

    // Find new highest weight
    uint256 _length = userStakingPool[msg.sender].length();
    for (uint256 i = 0; i < _length; i++) {
      if (
        poolInfo[userHighestWeightNftAddress[msg.sender]].poolWeight <
        poolInfo[userStakingPool[msg.sender].at(i)].poolWeight
      ) {
        userHighestWeightNftAddress[msg.sender] = userStakingPool[msg.sender].at(i);
      }
    }
 
    IERC721Upgradeable(_nftAddress).transferFrom(address(this), msg.sender, _nftTokenId);

    emit LogUnstakeNFT(msg.sender, _nftAddress, _nftTokenId);
  }

  function isStaked(
    address _nftAddress,
    address _user,
    uint256 _nftTokenId
  ) external view override returns (bool) {
    bytes32 _depositId = keccak256(abi.encodePacked(_nftAddress, _user, _nftTokenId));
    return isPoolExist(_nftAddress) && (userStakingNFT[_depositId].lockUntil != 0);
  }

  function isPoolExist(address _nftAddress) public view returns (bool) {
    return poolInfo[_nftAddress].isInit;
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
