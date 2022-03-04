pragma solidity 0.8.11;

import "../apis/solidex/ISolidexVoter.sol";
import "../apis/solidly/IBaseV1Voter.sol";

contract MockSolidexVoter is ISolidexVoter {
  uint256 public tokenID;
  IBaseV1Voter public solidVoter;

  function setSolidVoter(IBaseV1Voter _solidVoter) external {
    solidVoter = _solidVoter;
  }

  function setTokenID(uint256 _tokenID) external returns (bool) {
    tokenID = _tokenID;
    return true;
  }

  function vote(address[] calldata _poolVote, int256[] calldata _weights) external {
    solidVoter.vote(tokenID, _poolVote, _weights);
  }
}
