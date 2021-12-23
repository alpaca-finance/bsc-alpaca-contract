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

pragma solidity 0.6.6;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";

import "../protocol/interfaces/INFTStaking.sol";

contract NFTStaking is INFTStaking, IERC721Receiver, OwnableUpgradeSafe, ReentrancyGuardUpgradeSafe {
  event LogStakeNFT(address indexed staker, bytes32 indexed poolId, address nftAddress, uint256 nftTokenId);
  event LogUnstakeNFT(address indexed staker, bytes32 indexed poolId, address nftAddress, uint256 nftTokenId);
  event LogAddPool(address indexed caller, bytes32 indexed poolId, address[] stakeNFTToken);
  event LogSetStakeNFTToken(
    address indexed caller,
    bytes32 indexed poolId,
    address[] stakeNFTToken,
    uint256[] allowance
  );

  // Info of each pool.
  struct PoolInfo {
    mapping(address => uint256) stakeNFTToken; // Mapping of NFT token addresses that are allowed to stake in this pool
    uint256 isInit; // Flag will be `1` if pool is already init
  }

  struct NFTStakingInfo {
    address nftAddress;
    uint256 nftTokenId;
  }

  mapping(bytes32 => PoolInfo) poolInfo;
  mapping(bytes32 => mapping(address => NFTStakingInfo)) public userStakingNFT;

  modifier onlyEOA() {
    require(msg.sender == tx.origin, "not eoa");
    _;
  }

  function initialize() external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
  }

  function addPool(bytes32 _poolId, address[] calldata _stakeNFTToken) external onlyOwner {
    require(poolInfo[_poolId].isInit == 0, "pool already init");

    poolInfo[_poolId].isInit = 1;

    for (uint256 _i; _i < _stakeNFTToken.length; _i++) {
      poolInfo[_poolId].stakeNFTToken[_stakeNFTToken[_i]] = 1;
    }

    emit LogAddPool(_msgSender(), _poolId, _stakeNFTToken);
  }

  function setStakeNFTToken(
    bytes32 _poolId,
    address[] calldata _stakeNFTToken,
    uint256[] calldata _allowance
  ) external onlyOwner {
    require(poolInfo[_poolId].isInit == 1, "pool not init");

    for (uint256 _i; _i < _stakeNFTToken.length; _i++) {
      poolInfo[_poolId].stakeNFTToken[_stakeNFTToken[_i]] = _allowance[_i];
    }

    emit LogSetStakeNFTToken(_msgSender(), _poolId, _stakeNFTToken, _allowance);
  }

  function stakeNFT(
    bytes32 _poolId,
    address _nftAddress,
    uint256 _nftTokenId
  ) external nonReentrant onlyEOA {
    require(poolInfo[_poolId].stakeNFTToken[_nftAddress] == 1, "nft address not allowed");

    NFTStakingInfo memory _stakedNFT = userStakingNFT[_poolId][_msgSender()];
    require(_stakedNFT.nftAddress != _nftAddress || _stakedNFT.nftTokenId != _nftTokenId, "nft already staked");

    userStakingNFT[_poolId][_msgSender()] = NFTStakingInfo({ nftAddress: _nftAddress, nftTokenId: _nftTokenId });

    IERC721(_nftAddress).safeTransferFrom(_msgSender(), address(this), _nftTokenId);

    if (_stakedNFT.nftAddress != address(0)) {
      IERC721(_stakedNFT.nftAddress).safeTransferFrom(address(this), _msgSender(), _stakedNFT.nftTokenId);
    }
    emit LogStakeNFT(_msgSender(), _poolId, _nftAddress, _nftTokenId);
  }

  function unstakeNFT(bytes32 _poolId) external nonReentrant onlyEOA {
    NFTStakingInfo memory toBeSentBackNft = userStakingNFT[_poolId][_msgSender()];
    require(toBeSentBackNft.nftAddress != address(0), "no nft staked");

    userStakingNFT[_poolId][_msgSender()] = NFTStakingInfo({ nftAddress: address(0), nftTokenId: 0 });

    IERC721(toBeSentBackNft.nftAddress).safeTransferFrom(address(this), _msgSender(), toBeSentBackNft.nftTokenId);

    emit LogUnstakeNFT(_msgSender(), _poolId, toBeSentBackNft.nftAddress, toBeSentBackNft.nftTokenId);
  }

  function isStaked(bytes32 _poolId, address _user) external view override returns (bool) {
    return userStakingNFT[_poolId][_user].nftAddress != address(0);
  }

  /// @dev when doing a safeTransferFrom, the caller needs to implement this, for safety reason
  function onERC721Received(
    address, /*operator*/
    address, /*from*/
    uint256, /*tokenId*/
    bytes calldata /*data*/
  ) external override returns (bytes4) {
    return IERC721Receiver.onERC721Received.selector;
  }
}
