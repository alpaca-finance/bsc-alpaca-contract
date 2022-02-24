pragma solidity 0.8.11;

interface IDepositToken {
  function pool() external view returns (address);

  function initialize(address pool) external returns (bool);

  function mint(address to, uint256 value) external returns (bool);

  function burn(address from, uint256 value) external returns (bool);
}
