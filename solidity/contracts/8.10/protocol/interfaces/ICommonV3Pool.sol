// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface ICommonV3Pool {
  struct Slot0 {
    uint160 sqrtPriceX96;
    int24 tick;
    uint16 observationIndex;
    uint16 observationCardinality;
    uint16 observationCardinalityNext;
    uint32 feeProtocol;
    bool unlocked;
  }

  function slot0()
    external
    view
    returns (
      uint160 sqrtPriceX96,
      int24 tick,
      uint16 observationIndex,
      uint16 observationCardinality,
      uint16 observationCardinalityNext,
      uint32 feeProtocol,
      bool unlocked
    );

  function token0() external view returns (address);

  function token1() external view returns (address);

  function fee() external view returns (uint24);

  function liquidity() external view returns (uint128);

  function tickSpacing() external view returns (int24);

  function tickBitmap(int16 index) external view returns (uint256);

  function ticks(
    int24 index
  )
    external
    view
    returns (
      uint128 liquidityGross,
      int128 liquidityNet,
      uint256 feeGrowthOutside0X128,
      uint256 feeGrowthOutside1X128,
      int56 tickCumulativeOutside,
      uint160 secondsPerLiquidityOutsideX128,
      uint32 secondsOutside,
      bool initialized
    );

  function swap(
    address recipient,
    bool zeroForOne,
    int256 amountSpecified,
    uint160 sqrtPriceLimitX96,
    bytes calldata data
  ) external returns (int256 amount0, int256 amount1);

  function feeGrowthGlobal0X128() external view returns (uint256);

  function feeGrowthGlobal1X128() external view returns (uint256);
}
