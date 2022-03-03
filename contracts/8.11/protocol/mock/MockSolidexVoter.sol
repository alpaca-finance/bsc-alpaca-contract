pragma solidity 0.8.11;

import "../apis/solidex/ISolidexVoter.sol";

contract MockSolidexVoter is ISolidexVoter {
  function setTokenID(uint256 tokenID) external pure returns (bool) {
    return true;
  }
}
