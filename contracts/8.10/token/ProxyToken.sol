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

import "./interfaces/IProxyToken.sol";

contract ProxyToken is IProxyToken, ERC20Upgradeable, OwnableUpgradeable {
  /// @notice Errors
  error ProxyToken_OnlyTimelock();
  error ProxyToken_UnapprovedHolder(address _holder);

  /// @notice just reserve for future use
  address public timelock;
  mapping(address => bool) public okHolders;

  /// @dev Events
  event LogSetOkHolder(address _holder, bool _isOk);

  modifier onlyTimelock() {
    if (timelock != msg.sender) revert ProxyToken_OnlyTimelock();
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
    if (!okHolders[to]) revert ProxyToken_UnapprovedHolder(to);
    _mint(to, amount);
  }

  function burn(address from, uint256 amount) external override onlyOwner {
    if (!okHolders[from]) revert ProxyToken_UnapprovedHolder(from);
    _burn(from, amount);
  }

  function transfer(address to, uint256 amount) public override returns (bool) {
    if (!okHolders[msg.sender]) revert ProxyToken_UnapprovedHolder(msg.sender);
    if (!okHolders[to]) revert ProxyToken_UnapprovedHolder(to);
    _transfer(msg.sender, to, amount);
    return true;
  }

  function transferFrom(
    address from,
    address to,
    uint256 amount
  ) public override returns (bool) {
    if (!okHolders[from]) revert ProxyToken_UnapprovedHolder(from);
    if (!okHolders[to]) revert ProxyToken_UnapprovedHolder(to);
    super.transferFrom(from, to, amount);
    return true;
  }
}
