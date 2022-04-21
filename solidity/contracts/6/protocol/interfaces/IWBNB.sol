pragma solidity >=0.5.0;

interface IWBNB {
  function deposit() external payable;

  function transfer(address to, uint256 value) external returns (bool);

  function withdraw(uint256) external;
}
