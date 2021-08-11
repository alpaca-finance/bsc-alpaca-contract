// SPDX-License-Identifier: MIT
/**
Optimal Stable Swap Strategy
Ellipsis -> Pancake
https://docs.ellipsis.finance/deployment-links
https://bscscan.com/address/0x160CAed03795365F3A589f10C379FfA7d75d4E76
*/

pragma solidity 0.6.6;

interface ICurveBase {
  /*
    https://github.com/ellipsis-finance/ellipsis/blob/master/contracts/DepositZap3EPS.vy
  */

  function add_liquidity(uint256[4] calldata uamounts, uint256 min_mint_amount) external;

  function remove_liquidity(uint256 _amount, uint256[4] calldata min_uamounts) external;

  function remove_liquidity_one_coin(
    uint256 _token_amount,
    uint128 i,
    uint256 min_amount
  ) external;

  function remove_liquidity_imbalance(uint256[4] calldata uamounts, uint256 max_burn_amount) external;

  function exchange(
    uint128 i,
    uint128 j,
    uint256 dx,
    uint256 min_dy
  ) external;

  function calc_withdraw_one_coin(
    uint256 _token_amount,
    uint128 i,
    uint256 min_amount
  ) external view returns (uint256);

  function calc_token_amount() external view returns (uint256);

  function coins(int128 i) external view returns (address);

  function fee() external view returns (uint256);

  function A() external view returns (uint256);

  function get_dy(
    uint128 i,
    uint128 j,
    uint256 dx
  ) external view returns (uint256);

  function balances(uint256 arg0) external view returns (uint256);
}
