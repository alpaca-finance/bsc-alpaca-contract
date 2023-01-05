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

import "./interfaces/IDeltaNeutralOracle.sol";
import "./interfaces/IDeltaNeutralVault.sol";
import "./interfaces/IWorker02.sol";

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
