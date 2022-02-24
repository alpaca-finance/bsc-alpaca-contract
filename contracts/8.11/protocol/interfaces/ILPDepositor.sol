pragma solidity 0.8.11;

interface ILPDepositor {
  function deposit(address pool, uint256 amount) external;

  function withdraw(address pool, uint256 amount) external;

  function getReward(address[] calldata pools) external;

  function userBalances(address, address) external view returns (uint256);

  function SEX() external view returns (address);

  function SOLID() external view returns (address);
}
