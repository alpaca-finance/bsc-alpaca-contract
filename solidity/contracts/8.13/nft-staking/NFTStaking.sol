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
  error NFTStaking_WrongPoolWeight();

  /// ------ States ------
  // Info of each pool.
  // Mapping of NFT token addresses that are allowed to stake in this pool
  struct PoolInfo {
    uint32 poolWeight;
    uint32 minLockPeriod;
    uint32 maxLockPeriod;
  }

  // NFT address (nftAddress) => PoolInfo
  mapping(address => PoolInfo) public poolInfo;
  // Deposit Id (nftAddress + userAddress + nftTokenId) => lockUntil
  mapping(bytes32 => uint256) public userStakingNFTLockUntil;
  mapping(address => address) public userHighestWeightNftAddress;
  // User address => NFTaddress => count
  mapping(address => mapping(address => uint256)) public userNFTInStakingPool;
  // User address => NFTAddress[]
  mapping(address => EnumerableSetUpgradeable.AddressSet) private userStakingPool;

  /// ------ Events ------
  event LogStakeNFT(
    address indexed _staker,
    bytes32 indexed _depositId,
    address indexed _nftAddress,
    uint256 _nftTokenId,
    uint256 _lockUntil
  );
  event LogExtendLockPeriod(
    address indexed _staker,
    address indexed _nftAddress,
    uint256 _nftTokenId,
    uint256 _lockUntil
  );
  event LogUnstakeNFT(
    address indexed _staker,
    bytes32 indexed _depositId,
    address indexed _nftAddress,
    uint256 _nftTokenId
  );
  event LogAddPool(
    address indexed _caller,
    address indexed _nftAddress,
    uint256 _poolWeight,
    uint256 _minLockPeriod,
    uint256 _maxLockPeriod
  );
  event LogSetPool(
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

  constructor() initializer {}

  function initialize() external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
  }

  function addPool(
    address _nftAddress,
    uint32 _poolWeight,
    uint32 _minLockPeriod,
    uint32 _maxLockPeriod
  ) external onlyOwner {
    if (_nftAddress == address(0)) revert NFTStaking_InvalidPoolAddress();
    if (poolInfo[_nftAddress].poolWeight > 0) revert NFTStaking_PoolAlreadyExist();
    if (_minLockPeriod > _maxLockPeriod) revert NFTStaking_InvalidLockPeriod();
    if (_poolWeight == 0) revert NFTStaking_WrongPoolWeight();
    poolInfo[_nftAddress].poolWeight = _poolWeight;
    poolInfo[_nftAddress].minLockPeriod = _minLockPeriod;
    poolInfo[_nftAddress].maxLockPeriod = _maxLockPeriod;

    emit LogAddPool(msg.sender, _nftAddress, _poolWeight, _minLockPeriod, _maxLockPeriod);
  }

  function setPool(
    address _nftAddress,
    uint32 _poolWeight,
    uint32 _minLockPeriod,
    uint32 _maxLockPeriod
  ) external onlyOwner {
    if (_nftAddress == address(0)) revert NFTStaking_InvalidPoolAddress();
    if (poolInfo[_nftAddress].poolWeight == 0) revert NFTStaking_PoolNotExist();
    if (_minLockPeriod > _maxLockPeriod) revert NFTStaking_InvalidLockPeriod();
    if (_poolWeight == 0) revert NFTStaking_WrongPoolWeight();
    poolInfo[_nftAddress].poolWeight = _poolWeight;
    poolInfo[_nftAddress].minLockPeriod = _minLockPeriod;
    poolInfo[_nftAddress].maxLockPeriod = _maxLockPeriod;

    emit LogSetPool(msg.sender, _nftAddress, _poolWeight, _minLockPeriod, _maxLockPeriod);
  }

  function stakeNFT(
    address _nftAddress,
    uint256 _nftTokenId,
    uint256 _lockUntil
  ) external nonReentrant onlyEOA {
    // Check
    // reset _lockUntil to be current block timestamp
    // in case caller want to send current timestamp but less than timestamp with block timestamp.
    _lockUntil = _lockUntil < block.timestamp ? block.timestamp : _lockUntil;
    if (poolInfo[_nftAddress].poolWeight == 0) revert NFTStaking_PoolNotExist();
    bytes32 _depositId = keccak256(abi.encodePacked(_nftAddress, msg.sender, _nftTokenId));
    if (userStakingNFTLockUntil[_depositId] != 0) revert NFTStaking_NFTAlreadyStaked();
    uint256 _lockPeriod = _lockUntil - block.timestamp;
    if (_lockPeriod < poolInfo[_nftAddress].minLockPeriod || _lockPeriod > poolInfo[_nftAddress].maxLockPeriod)
      revert NFTStaking_InvalidLockPeriod();

    // Effect
    userStakingNFTLockUntil[_depositId] = _lockUntil;

    if (poolInfo[userHighestWeightNftAddress[msg.sender]].poolWeight < poolInfo[_nftAddress].poolWeight) {
      userHighestWeightNftAddress[msg.sender] = _nftAddress;
    }
    userStakingPool[msg.sender].add(_nftAddress);
    unchecked {
      userNFTInStakingPool[msg.sender][_nftAddress] += 1;
    }

    // Interaction
    IERC721Upgradeable(_nftAddress).transferFrom(msg.sender, address(this), _nftTokenId);

    emit LogStakeNFT(msg.sender, _depositId, _nftAddress, _nftTokenId, _lockUntil);
  }

  function extendLockPeriod(
    address _nftAddress,
    uint256 _nftTokenId,
    uint256 _newLockUntil
  ) external nonReentrant onlyEOA {
    // Check
    if (poolInfo[_nftAddress].poolWeight == 0) revert NFTStaking_PoolNotExist();
    bytes32 _depositId = keccak256(abi.encodePacked(_nftAddress, msg.sender, _nftTokenId));
    if (_newLockUntil < userStakingNFTLockUntil[_depositId]) revert NFTStaking_InvalidLockPeriod();
    if (userStakingNFTLockUntil[_depositId] == 0) revert NFTStaking_NFTNotStaked();
    uint256 _lockPeriod = _newLockUntil - block.timestamp;
    if (_lockPeriod < poolInfo[_nftAddress].minLockPeriod || _lockPeriod > poolInfo[_nftAddress].maxLockPeriod)
      revert NFTStaking_InvalidLockPeriod();

    // Effect
    userStakingNFTLockUntil[_depositId] = _newLockUntil;

    emit LogExtendLockPeriod(msg.sender, _nftAddress, _nftTokenId, _newLockUntil);
  }

  function unstakeNFT(address _nftAddress, uint256 _nftTokenId) external nonReentrant onlyEOA {
    // Check
    bytes32 _depositId = keccak256(abi.encodePacked(_nftAddress, msg.sender, _nftTokenId));
    uint256 _lockUntil = userStakingNFTLockUntil[_depositId];
    if (_lockUntil == 0) revert NFTStaking_NoNFTStaked();
    if (userStakingNFTLockUntil[_depositId] > block.timestamp) revert NFTStaking_IsNotExpired();
    userStakingNFTLockUntil[_depositId] = 0;

    // Effect
    // Reset highest pool weight
    userHighestWeightNftAddress[msg.sender] = address(0);

    unchecked {
      userNFTInStakingPool[msg.sender][_nftAddress] -= 1;
    }

    // Remove pool from user if no NFT stake
    if (userNFTInStakingPool[msg.sender][_nftAddress] == 0) {
      userStakingPool[msg.sender].remove(_nftAddress);
    }

    // Find new highest weight
    uint256 _length = userStakingPool[msg.sender].length();
    for (uint256 i = 0; i < _length; ) {
      if (
        poolInfo[userHighestWeightNftAddress[msg.sender]].poolWeight <
        poolInfo[userStakingPool[msg.sender].at(i)].poolWeight
      ) {
        userHighestWeightNftAddress[msg.sender] = userStakingPool[msg.sender].at(i);
      }
      unchecked {
        ++i;
      }
    }

    // Interaction
    IERC721Upgradeable(_nftAddress).transferFrom(address(this), msg.sender, _nftTokenId);

    emit LogUnstakeNFT(msg.sender, _depositId, _nftAddress, _nftTokenId);
  }

  function isStaked(
    address _nftAddress,
    address _user,
    uint256 _nftTokenId
  ) external view override returns (bool) {
    bytes32 _depositId = keccak256(abi.encodePacked(_nftAddress, _user, _nftTokenId));
    return isPoolExist(_nftAddress) && (userStakingNFTLockUntil[_depositId] != 0);
  }

  function isPoolExist(address _nftAddress) public view returns (bool) {
    return poolInfo[_nftAddress].poolWeight > 0;
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
