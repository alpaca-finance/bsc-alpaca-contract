pragma solidity 0.6.6;

interface IDebtToken {
  function setOkHolders(address[] calldata _okHolders, bool _isOk) external;
  function mint(address to, uint256 amount) external;
  function burn(address from, uint256 amount) external;
}
