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

interface ISwapFactoryLike {
  function feeTo() external view returns (address);

  function feeToSetter() external view returns (address);

  function feeToRate() external view returns (uint256);

  function initCodeHash() external view returns (bytes32);

  function pairFeeToRate(address) external view returns (uint256);

  function pairFees(address) external view returns (uint256);

  function getPair(address tokenA, address tokenB) external view returns (address pair);

  function allPairs(uint256) external view returns (address pair);

  function allPairsLength() external view returns (uint256);

  function createPair(address tokenA, address tokenB) external returns (address pair);

  function setFeeTo(address) external;

  function setFeeToSetter(address) external;

  function addPair(address) external returns (bool);

  function delPair(address) external returns (bool);

  function getSupportListLength() external view returns (uint256);

  function isSupportPair(address pair) external view returns (bool);

  function getSupportPair(uint256 index) external view returns (address);

  function setFeeRateNumerator(uint256) external;

  function setPairFees(address pair, uint256 fee) external;

  function setDefaultFeeToRate(uint256) external;

  function setPairFeeToRate(address pair, uint256 rate) external;

  function getPairFees(address) external view returns (uint256);

  function getPairRate(address) external view returns (uint256);

  function sortTokens(address tokenA, address tokenB) external pure returns (address token0, address token1);

  function pairFor(address tokenA, address tokenB) external view returns (address pair);

  function getReserves(address tokenA, address tokenB) external view returns (uint256 reserveA, uint256 reserveB);

  function quote(
    uint256 amountA,
    uint256 reserveA,
    uint256 reserveB
  ) external pure returns (uint256 amountB);

  function getAmountOut(
    uint256 amountIn,
    uint256 reserveIn,
    uint256 reserveOut,
    address token0,
    address token1
  ) external view returns (uint256 amountOut);

  function getAmountIn(
    uint256 amountOut,
    uint256 reserveIn,
    uint256 reserveOut,
    address token0,
    address token1
  ) external view returns (uint256 amountIn);

  function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);

  function getAmountsIn(uint256 amountOut, address[] calldata path) external view returns (uint256[] memory amounts);
}
