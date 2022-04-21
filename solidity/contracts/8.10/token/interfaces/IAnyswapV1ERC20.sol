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

pragma solidity 0.8.10;

interface IAnyswapV1ERC20 {
  function mint(address to, uint256 amount) external returns (bool);

  function burn(address from, uint256 amount) external returns (bool);

  function changeVault(address newVault) external returns (bool);

  function depositVault(uint256 amount, address to) external returns (uint256);

  function withdrawVault(
    address from,
    uint256 amount,
    address to
  ) external returns (uint256);

  function underlying() external view returns (address);
}
