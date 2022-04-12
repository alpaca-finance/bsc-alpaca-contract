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
  error NFTStaking_Unauthorize();
  error NFTStaking_PoolAlreadyExist();
  error NFTStaking_PoolNotExist();
  error NFTStaking_BadParamsLength();
  error NFTStaking_InvalidNFTAddress();
  error NFTStaking_NFTAlreadyStaked();
  error NFTStaking_NoNFTStaked();

  // Info of each pool.
  struct PoolInfo {
    // Mapping of NFT token addresses that are allowed to stake in this pool
    mapping(address => uint256) eligibleToken;
    uint256 isInit; // Flag will be `1` if pool is already init
  }

  struct NFTStakingInfo {
    address nftAddress;
    uint256 nftTokenId;
  }

  mapping(bytes32 => PoolInfo) public poolInfo;
  mapping(bytes32 => mapping(address => NFTStakingInfo)) public userStakingNFT;
  bytes32[] poolId;

  event LogStakeNFT(address indexed _staker, bytes32 indexed _poolId, address _nftAddress, uint256 _nftTokenId);
  event LogUnstakeNFT(address indexed _staker, bytes32 indexed _poolId, address _nftAddress, uint256 _nftTokenId);
  event LogAddPool(address indexed _caller, bytes32 indexed _poolId, address[] _stakeNFTToken);
  event LogSetStakeNFTToken(
    address indexed _caller,
    bytes32 indexed _poolId,
    address[] _stakeNFTToken,
    uint256[] _allowance
  );

  modifier onlyEOA() {
    if (msg.sender != tx.origin) revert NFTStaking_Unauthorize();
    _;
  }

  function initialize() external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
  }

  function addPool(bytes32 _poolId, address[] calldata _stakeNFTToken) external onlyOwner {
    if (poolInfo[_poolId].isInit != 0) revert NFTStaking_PoolAlreadyExist();

    poolInfo[_poolId].isInit = 1;
    poolId.push(_poolId);

    for (uint256 _i; _i < _stakeNFTToken.length; _i++) {
      poolInfo[_poolId].eligibleToken[_stakeNFTToken[_i]] = 1;
    }

    emit LogAddPool(_msgSender(), _poolId, _stakeNFTToken);
  }

  function getPool() external view returns(bytes32[] memory) {
    return poolId;
  }

  
  function setStakeNFTToken(
    bytes32 _poolId,
    address[] calldata _stakeNFTToken,
    uint256[] calldata _allowance
  ) external onlyOwner {
    if (poolInfo[_poolId].isInit != 1) revert NFTStaking_PoolNotExist();
    if (_stakeNFTToken.length != _allowance.length) revert NFTStaking_BadParamsLength();

    for (uint256 _i; _i < _stakeNFTToken.length; _i++) {
      poolInfo[_poolId].eligibleToken[_stakeNFTToken[_i]] = _allowance[_i];
    }

    emit LogSetStakeNFTToken(_msgSender(), _poolId, _stakeNFTToken, _allowance);
  }

  function stakeNFT(
    bytes32 _poolId,
    address _nftAddress,
    uint256 _nftTokenId
  ) external nonReentrant onlyEOA {
    if (poolInfo[_poolId].eligibleToken[_nftAddress] != 1) revert NFTStaking_InvalidNFTAddress();

    NFTStakingInfo memory _stakedNFT = userStakingNFT[_poolId][_msgSender()];
    if (_stakedNFT.nftAddress == _nftAddress && _stakedNFT.nftTokenId == _nftTokenId)
      revert NFTStaking_NFTAlreadyStaked();

    userStakingNFT[_poolId][_msgSender()] = NFTStakingInfo({ nftAddress: _nftAddress, nftTokenId: _nftTokenId });

    IERC721Upgradeable(_nftAddress).safeTransferFrom(_msgSender(), address(this), _nftTokenId);

    if (_stakedNFT.nftAddress != address(0)) {
      IERC721Upgradeable(_stakedNFT.nftAddress).safeTransferFrom(address(this), _msgSender(), _stakedNFT.nftTokenId);
    }
    emit LogStakeNFT(_msgSender(), _poolId, _nftAddress, _nftTokenId);
  }

  function unstakeNFT(bytes32 _poolId) external nonReentrant onlyEOA {
    NFTStakingInfo memory _toBeSentBackNFT = userStakingNFT[_poolId][_msgSender()];
    if (_toBeSentBackNFT.nftAddress == address(0)) revert NFTStaking_NoNFTStaked();

    userStakingNFT[_poolId][_msgSender()] = NFTStakingInfo({ nftAddress: address(0), nftTokenId: 0 });

    IERC721Upgradeable(_toBeSentBackNFT.nftAddress).safeTransferFrom(
      address(this),
      _msgSender(),
      _toBeSentBackNFT.nftTokenId
    );

    emit LogUnstakeNFT(_msgSender(), _poolId, _toBeSentBackNFT.nftAddress, _toBeSentBackNFT.nftTokenId);
  }

  function isStaked(bytes32 _poolId, address _user) external view override returns (bool) {
    address _stakedNFTAddress = userStakingNFT[_poolId][_user].nftAddress;
    bool _isStaked = _stakedNFTAddress != address(0);
    bool _isElibileNFT = isEligibleNFT(_poolId, _stakedNFTAddress);

    return _isStaked && _isElibileNFT;
  }

  function isEligibleNFT(bytes32 _poolId, address _nftAddress) public view returns (bool) {
    return poolInfo[_poolId].eligibleToken[_nftAddress] == 1;
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
