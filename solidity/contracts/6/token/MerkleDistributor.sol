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

import "./interfaces/IMerkleDistributor.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/cryptography/MerkleProof.sol";

contract MerkleDistributor is IMerkleDistributor, Ownable {
  using SafeERC20 for IERC20;

  address public immutable override token;
  bytes32 public immutable override merkleRoot;

  // This is a packed array of booleans.
  mapping(uint256 => uint256) private claimedBitMap;

  event WithdrawTokens(address indexed withdrawer, address token, uint256 amount);
  event WithdrawRewardTokens(address indexed withdrawer, uint256 amount);
  event WithdrawAllRewardTokens(address indexed withdrawer, uint256 amount);
  event Deposit(address indexed depositor, uint256 amount);

  constructor(address token_, bytes32 merkleRoot_) public {
    token = token_;
    merkleRoot = merkleRoot_;
  }

  function isClaimed(uint256 index) public view override returns (bool) {
    uint256 claimedWordIndex = index / 256;
    uint256 claimedBitIndex = index % 256;
    uint256 claimedWord = claimedBitMap[claimedWordIndex];
    uint256 mask = (1 << claimedBitIndex);
    return claimedWord & mask == mask;
  }

  function _setClaimed(uint256 index) private {
    uint256 claimedWordIndex = index / 256;
    uint256 claimedBitIndex = index % 256;
    claimedBitMap[claimedWordIndex] = claimedBitMap[claimedWordIndex] | (1 << claimedBitIndex);
  }

  function claim(
    uint256 index,
    address account,
    uint256 amount,
    bytes32[] calldata merkleProof
  ) external override {
    require(!isClaimed(index), "MerkleDistributor::claim:: drop already claimed");

    // Verify the merkle proof.
    bytes32 node = keccak256(abi.encodePacked(index, account, amount));
    require(MerkleProof.verify(merkleProof, merkleRoot, node), "MerkleDistributor::claim:: invalid proof");

    // Mark it claimed and send the token.
    _setClaimed(index);
    require(IERC20(token).transfer(account, amount), "MerkleDistributor::claim:: transfer failed");

    emit Claimed(index, account, amount);
  }

  // Deposit token for merkle distribution
  function deposit(uint256 _amount) external onlyOwner {
    IERC20(token).safeTransferFrom(msg.sender, address(this), _amount);
    emit Deposit(msg.sender, _amount);
  }

  // Emergency withdraw tokens for admin
  function withdrawTokens(address _token, uint256 _amount) external onlyOwner {
    IERC20(_token).safeTransfer(msg.sender, _amount);
    emit WithdrawTokens(msg.sender, _token, _amount);
  }

  // Emergency withdraw reward tokens for admin
  function withdrawRewardTokens(uint256 _amount) external onlyOwner {
    IERC20(token).safeTransfer(msg.sender, _amount);
    emit WithdrawRewardTokens(msg.sender, _amount);
  }

  // Emergency withdraw ALL reward tokens for admin
  function withdrawAllRewardTokens() external onlyOwner {
    uint256 amount = IERC20(token).balanceOf(address(this));
    IERC20(token).safeTransfer(msg.sender, amount);
    emit WithdrawAllRewardTokens(msg.sender, amount);
  }
}
