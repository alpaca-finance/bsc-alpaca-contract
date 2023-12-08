// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IPancakeV3MasterChef {
  function CAKE() external view returns (address);

  struct IncreaseLiquidityParams {
    uint256 tokenId;
    uint256 amount0Desired;
    uint256 amount1Desired;
    uint256 amount0Min;
    uint256 amount1Min;
    uint256 deadline;
  }

  function increaseLiquidity(
    IncreaseLiquidityParams memory params
  ) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1);

  struct DecreaseLiquidityParams {
    uint256 tokenId;
    uint128 liquidity;
    uint256 amount0Min;
    uint256 amount1Min;
    uint256 deadline;
  }

  function decreaseLiquidity(DecreaseLiquidityParams memory params) external returns (uint256 amount0, uint256 amount1);

  struct CollectParams {
    uint256 tokenId;
    address recipient;
    uint128 amount0Max;
    uint128 amount1Max;
  }

  function collect(CollectParams calldata params) external returns (uint256 amount0, uint256 amount1);

  function harvest(uint256 tokenId, address to) external returns (uint256);

  function updateLiquidity(uint256 tokenId) external;

  function withdraw(uint256 tokenId, address to) external returns (uint256);

  function sweepToken(address token, uint256 amountMinimum, address to) external;

  function burn(uint256 tokenId) external;

  struct UserPositionInfo {
    uint128 liquidity;
    uint128 boostLiquidity;
    int24 tickLower;
    int24 tickUpper;
    uint256 rewardGrowthInside;
    uint256 reward;
    address user;
    uint256 pid;
    uint256 boostMultiplier;
  }

  function userPositionInfos(uint256 tokenId) external view returns (UserPositionInfo memory);

  function pendingCake(uint256 _tokenId) external view returns (uint256 reward);
}
