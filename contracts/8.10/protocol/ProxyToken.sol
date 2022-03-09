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

pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

import "./interfaces/IProxyToken.sol";

contract ProxyToken is IProxyToken, ERC20Upgradeable, OwnableUpgradeable {
  using SafeMathUpgradeable for uint256;

  /// @dev Events
  event LogSetOkHolder(address _holder, bool _isOk);

  /// @notice just reserve for future use
  address public timelock;

  mapping(address => bool) public okHolders;

  modifier onlyTimelock() {
    require(timelock == msg.sender, "proxyToken::onlyTimelock:: msg.sender not timelock");
    _;
  }

  function initialize(
    string calldata _name,
    string calldata _symbol,
    address _timelock
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ERC20Upgradeable.__ERC20_init(_name, _symbol);
    timelock = _timelock;
  }

  function setOkHolders(address[] memory _okHolders, bool _isOk) external override onlyOwner {
    for (uint256 idx = 0; idx < _okHolders.length; idx++) {
      okHolders[_okHolders[idx]] = _isOk;
      emit LogSetOkHolder(_okHolders[idx], _isOk);
    }
  }

  function mint(address to, uint256 amount) external override onlyOwner {
    require(okHolders[to], "proxyToken::mint:: unapproved holder");
    _mint(to, amount);
  }

  function burn(address from, uint256 amount) external override onlyOwner {
    require(okHolders[from], "proxyToken::burn:: unapproved holder");
    _burn(from, amount);
  }

  function transfer(address to, uint256 amount) public override returns (bool) {
    require(okHolders[msg.sender], "proxyToken::transfer:: unapproved holder on msg.sender");
    require(okHolders[to], "proxyToken::transfer:: unapproved holder on to");
    _transfer(msg.sender, to, amount);
    return true;
  }

  function transferFrom(
    address from,
    address to,
    uint256 amount
  ) public override returns (bool) {
    require(okHolders[from], "proxyToken::transferFrom:: unapproved holder in from");
    require(okHolders[to], "proxyToken::transferFrom:: unapproved holder in to");
    _transfer(from, to, amount);
    _approve(from, msg.sender, allowance(from, msg.sender).sub(amount, "BEP20: transfer amount exceeds allowance"));
    return true;
  }
}
