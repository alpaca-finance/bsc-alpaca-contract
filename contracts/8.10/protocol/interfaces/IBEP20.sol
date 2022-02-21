// SPDX-License-Identifier: BUSL
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

import "./IERC20.sol";

interface IBEP20 is IERC20 {
  /// @dev Return token's name
  function name() external returns (string memory);

  /// @dev Return token's symbol
  function symbol() external returns (string memory);

  /// @dev Return token's decimals
  function decimals() external returns (uint8);
}
