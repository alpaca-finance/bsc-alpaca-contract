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
// import "./interfaces/IVault.sol";
// import "./interfaces/IWorker02.sol";
// import "./interfaces/IWETH.sol";
// import "./interfaces/IWNativeRelayer.sol";
// import "./interfaces/IFairLaunch.sol";
// import "./interfaces/ISwapRouter.sol";
// import "./interfaces/IController.sol";
// import "./interfaces/IExecutor.sol";
import "./interfaces/IDeltaNeutralVaultConfig02.sol";

import "./utils/SafeToken.sol";
import "./utils/FixedPointMathLib.sol";
import "./utils/Math.sol";
import "./utils/FullMath.sol";

/// @title DeltaNeutralVault04HealthChecker is a spin-off contract from DeltaNeutralVault03
/// Health check functions were moved to the health checker while the rest of the logic
/// were kept the same
// solhint-disable max-states-count
contract DeltaNeutralVault04HealthChecker {
  // --- Libraries ---
  using FixedPointMathLib for uint256;

  // --- Errors ---
  error DeltaNeutralVault04HealthChecker_PositionValueExceedLimit();
  error DeltaNeutralVault04HealthChecker_UnsafePositionEquity();
  error DeltaNeutralVault04HealthChecker_UnsafeDebtValue();
  error DeltaNeutralVault04HealthChecker_UnTrustedPrice();

  struct PositionInfo {
    uint256 stablePositionEquity;
    uint256 stablePositionDebtValue;
    uint256 stableLpAmount;
    uint256 assetPositionEquity;
    uint256 assetPositionDebtValue;
    uint256 assetLpAmount;
  }

  /// @notice Return value of given lp amount
  /// @param _oracle oracle contract
  /// @param _lpAmount Amount of lp token
  /// @param _lpToken address of the lp token
  function _lpToValue(
    IDeltaNeutralOracle _oracle,
    uint256 _lpAmount,
    address _lpToken
  ) internal view returns (uint256) {
    (uint256 _lpValue, uint256 _lastUpdated) = _oracle.lpToDollar(_lpAmount, _lpToken);
    if (block.timestamp - _lastUpdated > 86400) revert DeltaNeutralVault04HealthChecker_UnTrustedPrice();
    return _lpValue;
  }

  /// @notice check if position equity and debt are healthy after deposit. LEVERAGE_LEVEL must be >= 3
  /// @param _depositValue deposit value in usd.
  /// @param _lpToken address of lp
  /// @param _positionInfoBefore position equity and debt before deposit.
  /// @param _positionInfoAfter position equity and debt after deposit.
  /// @param _oracle Delta neutral oracle contract
  /// @param _config Delta Neutral config contract
  function depositHealthCheck(
    uint256 _depositValue,
    address _lpToken,
    PositionInfo memory _positionInfoBefore,
    PositionInfo memory _positionInfoAfter,
    IDeltaNeutralOracle _oracle,
    IDeltaNeutralVaultConfig02 _config
  ) external view {
    //FIXME validate oracle and config and lpToken
    uint256 _toleranceBps = _config.positionValueTolerance();
    uint8 _leverageLevel = _config.leverageLevel();

    // 1. check if vault accept new total position value
    if (!_isVaultSizeAcceptable(_positionInfoAfter, _config)) {
      revert DeltaNeutralVault04HealthChecker_PositionValueExceedLimit();
    }
    // 2. check equity allocation

    // The equity allocation of long side should be equal to _depositValue * (_leverageLevel - 2) / ((2*_leverageLevel) - 2)
    uint256 _expectedStableEqChange = (_depositValue * (_leverageLevel - 2)) / ((2 * _leverageLevel) - 2);
    // The equity allocation of short side should be equal to _depositValue * _leverageLevel / ((2*_leverageLevel) - 2)
    uint256 _expectedAssetEqChange = (_depositValue * _leverageLevel) / ((2 * _leverageLevel) - 2);

    if (
      !_isEquityHealthy(
        _positionInfoBefore,
        _positionInfoAfter,
        _expectedStableEqChange,
        _expectedAssetEqChange,
        _toleranceBps,
        _oracle,
        _lpToken
      )
    ) {
      revert DeltaNeutralVault04HealthChecker_UnsafePositionEquity();
    }

    // 3. check Debt value
    // The debt allocation of long side should be equal to _expectedStableEqChange * (_leverageLevel - 1)
    uint256 _expectedStableDebtChange = (_expectedStableEqChange * (_leverageLevel - 1));
    // The debt allocation of short side should be equal to _expectedAssetEqChange * (_leverageLevel - 1)
    uint256 _expectedAssetDebtChange = (_expectedAssetEqChange * (_leverageLevel - 1));

    if (
      !_isDebtHealthy(
        _positionInfoBefore,
        _positionInfoAfter,
        _expectedStableDebtChange,
        _expectedAssetDebtChange,
        _toleranceBps
      )
    ) {
      revert DeltaNeutralVault04HealthChecker_UnsafeDebtValue();
    }
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

  function _isEquityHealthy(
    PositionInfo memory _positionInfoBefore,
    PositionInfo memory _positionInfoAfter,
    uint256 _expectedStableEqChange,
    uint256 _expectedAssetEqChange,
    uint256 _toleranceBps,
    IDeltaNeutralOracle _oracle,
    address _lpToken
  ) internal view returns (bool) {
    uint256 _actualStableDebtChange = _positionInfoAfter.stablePositionDebtValue -
      _positionInfoBefore.stablePositionDebtValue;
    uint256 _actualAssetDebtChange = _positionInfoAfter.assetPositionDebtValue -
      _positionInfoBefore.assetPositionDebtValue;

    uint256 _actualStableEqChange = _lpToValue(
      _oracle,
      _positionInfoAfter.stableLpAmount - _positionInfoBefore.stableLpAmount,
      _lpToken
    ) - _actualStableDebtChange;
    uint256 _actualAssetEqChange = _lpToValue(
      _oracle,
      _positionInfoAfter.assetLpAmount - _positionInfoBefore.assetLpAmount,
      _lpToken
    ) - _actualAssetDebtChange;

    return
      Math.almostEqual(_actualStableEqChange, _expectedStableEqChange, _toleranceBps) &&
      Math.almostEqual(_actualAssetEqChange, _expectedAssetEqChange, _toleranceBps);
  }

  function _isDebtHealthy(
    PositionInfo memory _positionInfoBefore,
    PositionInfo memory _positionInfoAfter,
    uint256 _expectedStableDebtChange,
    uint256 _expectedAssetDebtChange,
    uint256 _toleranceBps
  ) internal view returns (bool) {
    uint256 _actualStableDebtChange = _positionInfoAfter.stablePositionDebtValue -
      _positionInfoBefore.stablePositionDebtValue;
    uint256 _actualAssetDebtChange = _positionInfoAfter.assetPositionDebtValue -
      _positionInfoBefore.assetPositionDebtValue;

    return
      Math.almostEqual(_actualStableDebtChange, _expectedStableDebtChange, _toleranceBps) &&
      Math.almostEqual(_actualAssetDebtChange, _expectedAssetDebtChange, _toleranceBps);
  }
}
