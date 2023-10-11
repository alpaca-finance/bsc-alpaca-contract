// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;

interface IMoneyMarketAccountManager {
  function deposit(address _token, uint256 _amount) external;

  function stakeFor(address _for, address _token, uint256 _amount) external;
}
