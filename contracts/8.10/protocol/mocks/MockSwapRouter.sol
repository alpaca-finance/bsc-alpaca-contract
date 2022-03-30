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

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "../interfaces/ISwapRouter.sol";

contract MockSwapRouter is ISwapRouter {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  function WETH() external pure returns (address) {
    return address(0);
  }

  function swapExactTokensForETH(
    uint256, /*amountIn*/
    uint256, /*amountOutMin*/
    address[] calldata, /*path*/
    address, /*to*/
    uint256 /*deadline*/
  ) external pure returns (uint256[] memory amounts) {
    return amounts;
  }

  function swapExactETHForTokens(
    uint256, /*amountOutMin*/
    address[] calldata, /*path*/
    address, /*to*/
    uint256 /*deadline*/
  ) external payable returns (uint256[] memory amounts) {
    return amounts;
  }

  function swapExactTokensForTokens(
    uint256 amountIn,
    uint256, /*amountOutMin*/
    address[] calldata path,
    address to,
    uint256 /*deadline*/
  ) external returns (uint256[] memory amounts) {
    IERC20Upgradeable(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);
    IERC20Upgradeable(path[path.length - 1]).safeTransfer(to, amountIn);

    amounts = new uint256[](2);
    amounts[0] = amountIn;
    amounts[1] = amountIn;
    return amounts;
  }

  function swapTokensForExactTokens(
    uint256, /*amountOut*/
    uint256, /*amountInMax*/
    address[] calldata, /*path*/
    address, /*to*/
    uint256 /*deadline*/
  ) external pure returns (uint256[] memory amounts) {
    return amounts;
  }
}
