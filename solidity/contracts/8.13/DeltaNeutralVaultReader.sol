// SPDX-License-Identifier: BUSL
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

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "./interfaces/IDeltaNeutralOracle.sol";
import "./interfaces/IDeltaNeutralVault.sol";
import "./interfaces/IDeltaNeutralStruct.sol";
import "./interfaces/IDeltaNeutralVault04HealthChecker.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IWorker02.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/IWNativeRelayer.sol";
import "./interfaces/IDeltaNeutralVaultConfig02.sol";
import "./interfaces/ISwapRouter.sol";

import "./utils/SafeToken.sol";
import "./utils/FixedPointMathLib.sol";
import "./utils/Math.sol";
import "./utils/FullMath.sol";

/// @title DeltaNeutralReader is a view-only contract that will aggregate important
/// data used in DeltaNeutralVault for various purpose
contract DeltaNeutralVaultReader {
  struct VaultStatus {
    address tokenToBeRepurchased;
    address stableToken;
    address assetToken;
    address lpToken;
    uint256 exposureAmount;
    uint256 stableTokenPrice;
    uint256 assetTokenPrice;
    uint256 lastPriceUpdate;
    uint256 lpTokenPrice;
  }

  function getCurrentState(IDeltaNeutralVault _deltaVault) external view returns (VaultStatus memory _stats) {
    IDeltaNeutralOracle _oracle = IDeltaNeutralOracle(_deltaVault.priceOracle());

    _stats.stableToken = _deltaVault.stableToken();
    _stats.assetToken = _deltaVault.assetToken();
    _stats.lpToken = IWorker02(_deltaVault.stableVaultWorker()).lpToken();

    (_stats.stableTokenPrice, ) = _oracle.getTokenPrice(_stats.stableToken);
    (_stats.assetTokenPrice, ) = _oracle.getTokenPrice(_stats.assetToken);
    (_stats.lpTokenPrice, _stats.lastPriceUpdate) = _oracle.lpToDollar(1e18, _stats.lpToken);

    int256 _exposure = _deltaVault.getExposure();

    if (_exposure > 0) {
      _stats.tokenToBeRepurchased = _stats.assetToken;
      _stats.exposureAmount = uint256(_exposure);
    } else {
      _stats.tokenToBeRepurchased = _stats.stableToken;
      _stats.exposureAmount = uint256(_exposure * -1);
    }
  }
}
