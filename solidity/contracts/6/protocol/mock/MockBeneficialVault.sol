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
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/Math.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

import "../interfaces/IDebtToken.sol";
import "../interfaces/IVaultConfig.sol";
import "../interfaces/IWorker.sol";
import "../interfaces/IVault.sol";
import "../../token/interfaces/IFairLaunch.sol";
import "../../utils/SafeToken.sol";
import "../WNativeRelayer.sol";

contract MockBeneficialVault  is IVault, ERC20UpgradeSafe, ReentrancyGuardUpgradeSafe, OwnableUpgradeSafe {

    address public mockOwner;
  address public override token;
  
  function initialize(address _token) external initializer {
    token = _token;
  }


  function setMockOwner(address owner) external {
      mockOwner = owner;
  }

  /// @dev Return the total token entitled to the token holders. Be careful of unaccrued interests.
  function totalToken() public view override returns (uint256) {
    return 0;
  }

  /// @dev Add more token to the lending pool. Hope to get some good returns.
  function deposit(uint256 amountToken)
    external override payable {
  }

  /// @dev Withdraw token from the lending and burning ibToken.
  function withdraw(uint256 share) external override nonReentrant {
    
  }

  /// @dev Request Funds from user through Vault
  function requestFunds(address targetedToken, uint amount) external override {
    SafeToken.safeTransferFrom(targetedToken, mockOwner, msg.sender, amount);
  }
}
