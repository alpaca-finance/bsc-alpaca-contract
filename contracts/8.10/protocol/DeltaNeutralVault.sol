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

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import "../utils/SafeToken.sol";
import "./interfaces/IPriceHelper.sol";

contract DeltaNeutralVault is ERC20Upgradeable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
  /// @notice Libraries
  using SafeToken for address;

  /// @dev Events

  /// @dev constants
  uint8 private constant ACTION_WORK = 1;

  address public stableToken;
  address public assetToken;

  IPriceHelper public lpCalculator;

  function initialize(
    string calldata _name,
    string calldata _symbol,
    address _stableToken,
    address _assetToken,
    IPriceHelper _lpCalculator
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
    ERC20Upgradeable.__ERC20_init(_name, _symbol);

    stableToken = _stableToken;
    assetToken = _assetToken;
    priceHelper = _priceHelper;
  }

  function deposit(
    address _to,
    uint256 _stableTokenAmount,
    uint256 _assetTokenAmount,
    bytes[] calldata _data
  ) external returns (uint256 shares) {
    return 0;
  }

  function withdraw(
    address _to,
    uint256 _shareAmount,
    uint256 _minStableTokenAmount,
    uint256 _minAssetTokenAmount,
    bytes[] calldata _data
  ) external returns (uint256 shares) {
    return 0;
  }

  function _execute(
    uint8[] memory _actions,
    uint256[] memory _values,
    bytes[] memory _datas
  ) internal {
    for (uint256 i = 0; i < _actions.length; i++) {
      uint8 _action = _actions[i];
      if (_action == ACTION_WORK) {
        // do work
      }
    }
  }

  function totalEquityValue() public view returns (uint256) {
    return 0;
  }
}
