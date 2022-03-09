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

import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";

contract MockAggregatorV3LatestTimestamp is Ownable, AggregatorV3Interface {
  int256 public price;
  uint8 public override decimals;
  string public override description;
  uint256 public override version;

  mapping(address => uint256) public auth;

  modifier onlyAuth() {
    require(auth[msg.sender] == 1, "only auth");
    _;
  }

  constructor(
    int256 _price,
    uint8 _decimals,
    string memory _description
  ) public {
    price = _price;
    decimals = _decimals;
    description = _description;
  }

  function setAuth(address[] calldata _auth, uint256 _authFlag) external onlyOwner {
    for (uint256 i = 0; i < _auth.length; i++) {
      auth[_auth[i]] = _authFlag;
    }
  }

  function setPrice(int256 _price) external onlyAuth {
    price = _price;
  }

  function latestRoundData()
    external
    view
    override
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    )
  {
    return (uint80(0), price, uint256(0), block.timestamp, uint80(0));
  }

  function getRoundData(
    uint80 /* _roundId */
  )
    external
    view
    override
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    )
  {
    return (uint80(0), price, uint256(0), block.timestamp, uint80(0));
  }
}
