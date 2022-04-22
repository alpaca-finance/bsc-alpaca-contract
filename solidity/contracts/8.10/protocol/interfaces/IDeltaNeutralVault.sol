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

pragma solidity 0.8.10;

import "./IDeltaNeutralVaultConfig.sol";
import "./IDeltaNeutralOracle.sol";

interface IDeltaNeutralVault {
  function stableToken() external returns (address);

  function assetToken() external returns (address);

  function config() external returns (IDeltaNeutralVaultConfig);

  function priceOracle() external returns (IDeltaNeutralOracle);

  function withdraw(
    uint256 _shareAmount,
    uint256 _minStableTokenAmount,
    uint256 _minAssetTokenAmount,
    bytes calldata _data
  ) external returns (uint256);
}
