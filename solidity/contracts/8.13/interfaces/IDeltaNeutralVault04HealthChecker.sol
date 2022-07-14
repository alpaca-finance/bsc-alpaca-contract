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

import "./IDeltaNeutralOracle.sol";
import "./IDeltaNeutralVaultConfig02.sol";
import "./IDeltaNeutralPositionInfo.sol";

interface IDeltaNeutralVault04HealthChecker is IDeltaNeutralPositionInfo {
  /// @dev Return value of given token in USD.
  function depositHealthCheck(
    uint256 _depositValue,
    address _lpToken,
    PositionInfo memory _positionInfoBefore,
    PositionInfo memory _positionInfoAfter,
    IDeltaNeutralOracle _oracle,
    IDeltaNeutralVaultConfig02 _config
  ) external view;
}
