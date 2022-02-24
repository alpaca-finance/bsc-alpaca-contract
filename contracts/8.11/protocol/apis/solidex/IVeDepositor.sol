pragma solidity 0.8.11;

import "./IERC20.sol";

interface IVeDepositor is IERC20 {
  function depositTokens(uint256 amount) external returns (bool);
}
