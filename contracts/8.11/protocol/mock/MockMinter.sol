pragma solidity 0.8.11;

import "../apis/solidly/IMinter.sol";

contract MockMinter is IMinter {
  function update_period() external pure returns (uint256) {
    return 0;
  }
}
