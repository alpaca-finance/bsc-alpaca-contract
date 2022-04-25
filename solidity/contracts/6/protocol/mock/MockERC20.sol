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

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

contract MockERC20 is ERC20UpgradeSafe, OwnableUpgradeSafe {
  function initialize(
    string memory _name,
    string memory _symbol,
    uint8 _decimals
  ) public initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ERC20UpgradeSafe.__ERC20_init(_name, _symbol);
    _setupDecimals(_decimals);
  }

  function mint(address to, uint256 amount) public onlyOwner {
    _mint(to, amount);
  }

  receive() external payable {
    _mint(msg.sender, msg.value);
  }
}
