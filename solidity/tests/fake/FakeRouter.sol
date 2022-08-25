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

pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/// @title FakeRouter - 1:1 swap for all token without fee and price impact
contract FakeRouter {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  address public factory;
  address public lpForRemoveLiquidity;
  uint256 public amountAout;
  uint256 public amountBout;

  constructor(address _factory) {
    factory = _factory;
  }

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
    amounts = getAmountsOut(amountIn, path);
    IERC20Upgradeable(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);
    IERC20Upgradeable(path[path.length - 1]).safeTransfer(to, amountIn);
  }

  function swapTokensForExactTokens(
    uint256 amountOut,
    uint256, /*amountInMax*/
    address[] calldata path,
    address to,
    uint256 /*deadline*/
  ) external returns (uint256[] memory amounts) {
    amounts = getAmountsIn(amountOut, path);
    IERC20Upgradeable(path[0]).safeTransferFrom(msg.sender, address(this), amountOut);
    IERC20Upgradeable(path[path.length - 1]).safeTransfer(to, amountOut);
  }

  function getAmountsIn(uint256 amountOut, address[] memory path) public pure returns (uint256[] memory amounts) {
    amounts = new uint256[](path.length);
    for (uint256 i = 0; i < path.length; i++) {
      amounts[i] = amountOut;
    }
    return amounts;
  }

  function getAmountsOut(uint256 amountIn, address[] memory path) public pure returns (uint256[] memory amounts) {
    amounts = new uint256[](path.length);
    for (uint256 i = 0; i < path.length; i++) {
      amounts[i] = amountIn;
    }
    return amounts;
  }

  function setRemoveLiquidityAmountsOut(uint256 _amountAOut, uint256 _amountBOut) external {
    amountAout = _amountAOut;
    amountBout = _amountBOut;
  }

  function setLpTokenForRemoveLiquidity(address _lp) external {
    lpForRemoveLiquidity = _lp;
  }

  function removeLiquidity(
    address tokenA,
    address tokenB,
    uint256 liquidity,
    uint256, /*amountAMin*/
    uint256, /*amountBMin*/
    address to,
    uint256 /*deadline*/
  ) public returns (uint256 amountA, uint256 amountB) {
    amountA = amountAout;
    amountB = amountBout;
    IERC20Upgradeable(lpForRemoveLiquidity).safeTransferFrom(msg.sender, address(this), liquidity);
    IERC20Upgradeable(tokenA).safeTransfer(to, amountAout);
    IERC20Upgradeable(tokenB).safeTransfer(to, amountBout);
  }
}
