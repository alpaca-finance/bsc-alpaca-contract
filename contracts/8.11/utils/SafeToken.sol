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

pragma solidity 0.8.11;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

library SafeToken {
  function myBalance(address token) internal view returns (uint256) {
    return IERC20Upgradeable(token).balanceOf(address(this));
  }

  function balanceOf(address token, address user) internal view returns (uint256) {
    return IERC20Upgradeable(token).balanceOf(user);
  }

  function safeApprove(
    address token,
    address to,
    uint256 value
  ) internal {
    SafeERC20Upgradeable.safeApprove(IERC20Upgradeable(token), to, value);
  }

  function safeTransfer(
    address token,
    address to,
    uint256 value
  ) internal {
    SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(token), to, value);
  }

  function safeTransferFrom(
    address token,
    address from,
    address to,
    uint256 value
  ) internal {
    SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(token), from, to, value);
  }

  function safeTransferETH(address to, uint256 value) internal {
    // solhint-disable-next-line no-call-value
    (bool success, ) = to.call{ value: value }(new bytes(0));
    require(success, "!safeTransferETH");
  }
}
