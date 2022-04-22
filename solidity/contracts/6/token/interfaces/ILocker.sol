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

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ILocker {
    function calLockAmount(uint256 alpacaAmount) external returns (uint256);
    function lockOf(address user) external returns (uint256);
    function lock(address user, uint256 alpacaAmount) external;
    function pendingTokens(address user) external returns (IERC20[] memory, uint256[] memory);
    function claim() external;

    event Lock(address indexed to, uint256 value);
}