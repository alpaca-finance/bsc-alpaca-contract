// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.11;

import "./Bribe.sol";

contract BaseV1BribeFactory {
  address public last_gauge;

  function createBribe() external returns (address) {
    last_gauge = address(new Bribe(msg.sender));
    return last_gauge;
  }
}
