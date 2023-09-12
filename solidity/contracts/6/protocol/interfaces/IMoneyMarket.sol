pragma solidity >=0.6.0;

interface IMoneyMarket {
  function getIbTokenFromToken(address _token) external view returns (address);
}
