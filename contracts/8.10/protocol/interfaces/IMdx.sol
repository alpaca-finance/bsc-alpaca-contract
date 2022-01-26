pragma solidity 0.8.10;

import "./IERC20.sol";

interface IMdx is IERC20 {
  function mint(address to, uint256 amount) external returns (bool);
}
