pragma solidity >=0.5.0 <0.7.0;

interface IOracle {
  function consult(
    address tokenIn,
    uint256 amountIn,
    address tokenOut
  ) external view returns (uint256 amountOut);
}
