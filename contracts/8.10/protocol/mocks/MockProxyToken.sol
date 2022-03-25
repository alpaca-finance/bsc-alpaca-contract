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
**/

pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import "../../token/interfaces/IProxyToken.sol";

import "../../utils/SafeToken.sol";

/// @title MockProxyToken
contract MockProxyToken is IProxyToken, ERC20Upgradeable, OwnableUpgradeable {
  using SafeToken for address;
  address public rewardToken;
  mapping(address => bool) public okHolders;

  function initialize(string calldata _name, string calldata _symbol) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ERC20Upgradeable.__ERC20_init(_name, _symbol);
  }

  function setOkHolders(address[] memory _okHolders, bool _isOk) public override onlyOwner {
    for (uint256 _idx = 0; _idx < _okHolders.length; _idx++) {
      okHolders[_okHolders[_idx]] = _isOk;
    }
  }

  function mint(address _to, uint256 _amount) public override onlyOwner {
    require(okHolders[_to], "debtToken::mint:: unapproved holder");
    _mint(_to, _amount);
  }

  function burn(address _from, uint256 _amount) public override onlyOwner {
    require(okHolders[_from], "debtToken::burn:: unapproved holder");
    _burn(_from, _amount);
  }
}
