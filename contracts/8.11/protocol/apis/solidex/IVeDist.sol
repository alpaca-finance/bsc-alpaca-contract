pragma solidity 0.8.11;

interface IVeDist {
  function claim(uint256 _tokenId) external returns (uint256);
}
