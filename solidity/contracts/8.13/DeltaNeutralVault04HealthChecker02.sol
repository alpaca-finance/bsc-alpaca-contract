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
import "./interfaces/IDeltaNeutralVault04HealthChecker.sol";
import "./interfaces/IDeltaNeutralStruct.sol";
import "./interfaces/IDeltaNeutralVaultConfig02.sol";
import "./interfaces/IWorker02.sol";
import "./interfaces/ISwapPairLike.sol";

import "./utils/FixedPointMathLib.sol";
import "./utils/Math.sol";

/// @title DeltaNeutralVault04HealthChecker02 is an updated version that goes together
/// with the new deposit and withdraw executor
/// were kept the same
// solhint-disable max-states-count
contract DeltaNeutralVault04HealthChecker02 is IDeltaNeutralVault04HealthChecker {
  // --- Libraries ---
  using FixedPointMathLib for uint256;

  // --- Errors ---
  error DeltaNeutralVault04HealthChecker_PositionValueExceedLimit();
  error DeltaNeutralVault04HealthChecker_Obsoleted();

  /// @notice check if position equity and debt are healthy after deposit. LEVERAGE_LEVEL must be >= 3
  /// @param _positionInfoAfter position equity and debt after deposit.
  /// @param _config Delta Neutral config contract
  function depositHealthCheck(PositionInfo memory _positionInfoAfter, IDeltaNeutralVaultConfig02 _config)
    external
    view
  {
    // 1. check if vault accept new total position value
    if (!_isVaultSizeAcceptable(_positionInfoAfter, _config)) {
      revert DeltaNeutralVault04HealthChecker_PositionValueExceedLimit();
    }
  }

  function withdrawHealthCheck(
    uint256, /*_withdrawValue*/
    address, /*_lpToken*/
    PositionInfo memory, /*_positionInfoBefore*/
    PositionInfo memory, /*_positionInfoAfter*/
    IDeltaNeutralOracle, /*_oracle*/
    IDeltaNeutralVaultConfig02 /*_config*/
  ) external view {
    revert DeltaNeutralVault04HealthChecker_Obsoleted();
  }

  function depositHealthCheck(
    uint256, /*_depositValue*/
    address, /*_lpToken*/
    PositionInfo memory, /*_positionInfoBefore*/
    PositionInfo memory, /*_positionInfoAfter*/
    IDeltaNeutralOracle, /*_oracle*/
    IDeltaNeutralVaultConfig02 /*_config*/
  ) external view {
    revert DeltaNeutralVault04HealthChecker_Obsoleted();
  }

  function getExposure(
    address _stableVaultWorker,
    address _assetVaultWorker,
    address _assetToken,
    address _lpToken,
    uint256 _assetDebtAmount
  ) external view returns (int256 _exposure) {
    uint256 _totalLpAmount = IWorker02(_stableVaultWorker).totalLpBalance() +
      IWorker02(_assetVaultWorker).totalLpBalance();
    (uint256 _r0, uint256 _r1, ) = ISwapPairLike(_lpToken).getReserves();
    uint256 _assetReserve = _assetToken == ISwapPairLike(_lpToken).token0() ? _r0 : _r1;

    // exposure return in the original decimal and not normalized
    _exposure =
      int256((_totalLpAmount * _assetReserve) / ISwapPairLike(_lpToken).totalSupply()) -
      int256(_assetDebtAmount);
  }

  function _isVaultSizeAcceptable(PositionInfo memory _positionInfoAfter, IDeltaNeutralVaultConfig02 _config)
    internal
    view
    returns (bool)
  {
    uint256 _positionValueAfter = _positionInfoAfter.stablePositionEquity +
      _positionInfoAfter.stablePositionDebtValue +
      _positionInfoAfter.assetPositionEquity +
      _positionInfoAfter.assetPositionDebtValue;

    return _config.isVaultSizeAcceptable(_positionValueAfter);
  }
}
