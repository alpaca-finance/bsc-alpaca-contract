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

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./interfaces/INFTStaking.sol";

contract NFTStaking is INFTStaking, OwnableUpgradeable, ReentrancyGuardUpgradeable {
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

  mapping(bytes32 => PoolInfo) public poolInfo;
  mapping(bytes32 => mapping(address => NFTStakingInfo)) public userStakingNFT;

  modifier onlyEOA() {
    require(msg.sender == tx.origin, "NFTStaking::onlyEOA::not eoa");
    _;
  }

  function initialize() external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
  }

  function addPool(bytes32 _poolId, address[] calldata _stakeNFTToken) external onlyOwner {
    require(poolInfo[_poolId].isInit == 0, "NFTStaking::addPool::pool already init");

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
    require(poolInfo[_poolId].isInit == 1, "NFTStaking::setStakeNFTToken::pool not init");
    require(_stakeNFTToken.length == _allowance.length, "NFTStaking::setStakeNFTToken::bad params length");

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
    require(poolInfo[_poolId].stakeNFTToken[_nftAddress] == 1, "NFTStaking::stakeNFT::nft address not allowed");

    NFTStakingInfo memory _stakedNFT = userStakingNFT[_poolId][_msgSender()];
    require(
      _stakedNFT.nftAddress != _nftAddress || _stakedNFT.nftTokenId != _nftTokenId,
      "NFTStaking::stakeNFT::nft already staked"
    );

    userStakingNFT[_poolId][_msgSender()] = NFTStakingInfo({ nftAddress: _nftAddress, nftTokenId: _nftTokenId });

    IERC721Upgradeable(_nftAddress).safeTransferFrom(_msgSender(), address(this), _nftTokenId);

    if (_stakedNFT.nftAddress != address(0)) {
      IERC721Upgradeable(_stakedNFT.nftAddress).safeTransferFrom(address(this), _msgSender(), _stakedNFT.nftTokenId);
    }
    emit LogStakeNFT(_msgSender(), _poolId, _nftAddress, _nftTokenId);
  }

  function unstakeNFT(bytes32 _poolId) external nonReentrant onlyEOA {
    NFTStakingInfo memory toBeSentBackNft = userStakingNFT[_poolId][_msgSender()];
    require(toBeSentBackNft.nftAddress != address(0), "NFTStaking::unstakeNFT::no nft staked");

    userStakingNFT[_poolId][_msgSender()] = NFTStakingInfo({ nftAddress: address(0), nftTokenId: 0 });

    IERC721Upgradeable(toBeSentBackNft.nftAddress).safeTransferFrom(address(this), _msgSender(), toBeSentBackNft.nftTokenId);

    emit LogUnstakeNFT(_msgSender(), _poolId, toBeSentBackNft.nftAddress, toBeSentBackNft.nftTokenId);
  }

  function isStaked(bytes32 _poolId, address _user) external view override returns (bool) {
    address _stakedNFTAddress = userStakingNFT[_poolId][_user].nftAddress;
    bool _isStaked = _stakedNFTAddress != address(0);
    bool _isElibileNFT = isEligibleNFT(_poolId, _stakedNFTAddress);

    return _isStaked && _isElibileNFT;
  }

  function isEligibleNFT(bytes32 _poolId, address _nftAddress) public view returns (bool) {
    return poolInfo[_poolId].stakeNFTToken[_nftAddress] == 1;
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
