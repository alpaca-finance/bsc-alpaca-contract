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

pragma solidity 0.8.13;

import { ERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

contract MockNFT is ERC721Upgradeable {
  uint256 public totalSupply;

  function initialize() external initializer {
    ERC721Upgradeable.__ERC721_init("Mock NFT", "MOCK");
  }

  function mint(uint256 _amount) external {
    for (uint256 _i = 0; _i < _amount; _i++) {
      _safeMint(_msgSender(), totalSupply++);
    }
  }
}
