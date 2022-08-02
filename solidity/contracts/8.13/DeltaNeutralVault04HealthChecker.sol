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

/// @title DeltaNeutralVault04HealthChecker is a spin-off contract from DeltaNeutralVault03
/// Health check functions were moved to the health checker while the rest of the logic
/// were kept the same
// solhint-disable max-states-count
contract DeltaNeutralVault04HealthChecker is IDeltaNeutralVault04HealthChecker {
  // --- Libraries ---
  using FixedPointMathLib for uint256;

  // --- Errors ---
  error DeltaNeutralVault04HealthChecker_PositionValueExceedLimit();
  error DeltaNeutralVault04HealthChecker_UnsafePositionEquity();
  error DeltaNeutralVault04HealthChecker_UnsafeDebtRatio();
  error DeltaNeutralVault04HealthChecker_UnsafeDebtValue();
  error DeltaNeutralVault04HealthChecker_UnsafePositionValue();
  error DeltaNeutralVault04HealthChecker_UnTrustedPrice();

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
  /// @param _oracle Delta Neutral oracle contract
  /// @param _config Delta Neutral config contract
  function depositHealthCheck(
    uint256 _depositValue,
    address _lpToken,
    PositionInfo memory _positionInfoBefore,
    PositionInfo memory _positionInfoAfter,
    IDeltaNeutralOracle _oracle,
    IDeltaNeutralVaultConfig02 _config
  ) external view {
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

  /// @notice Check if position equity and debt ratio are healthy after withdraw.
  /// @param _withdrawValue Withdraw value in usd
  /// @param _lpToken address of lp
  /// @param _positionInfoBefore Position equity and debt before deposit
  /// @param _positionInfoAfter Position equity and debt after deposit
  /// @param _oracle Delta Neutral oracle contract
  /// @param _config Delta Neutral config contract
  function withdrawHealthCheck(
    uint256 _withdrawValue,
    address _lpToken,
    PositionInfo memory _positionInfoBefore,
    PositionInfo memory _positionInfoAfter,
    IDeltaNeutralOracle _oracle,
    IDeltaNeutralVaultConfig02 _config
  ) external view {
    uint256 _positionValueTolerance = _config.positionValueTolerance();
    uint256 _debtRatioTolerance = _config.debtRatioTolerance();

    uint256 _totalEquityBefore = _positionInfoBefore.stablePositionEquity + _positionInfoBefore.assetPositionEquity;
    uint256 _stableLpWithdrawValue = _lpToValue(
      _oracle,
      _positionInfoBefore.stableLpAmount - _positionInfoAfter.stableLpAmount,
      _lpToken
    );

    // This will force the equity loss in stable vault stay within the expectation
    // Given that the expectation is equity loss in stable vault will not alter the stable equity to total equity ratio
    // _stableExpectedWithdrawValue = _withdrawValue * _positionInfoBefore.stablePositionEquity / _totalEquityBefore
    // _stableActualWithdrawValue should be almost equal to _stableExpectedWithdrawValue
    if (
      !Math.almostEqual(
        (_stableLpWithdrawValue -
          (_positionInfoBefore.stablePositionDebtValue - _positionInfoAfter.stablePositionDebtValue)) *
          _totalEquityBefore,
        _withdrawValue * _positionInfoBefore.stablePositionEquity,
        _positionValueTolerance
      )
    ) {
      revert DeltaNeutralVault04HealthChecker_UnsafePositionValue();
    }

    uint256 _assetLpWithdrawValue = _lpToValue(
      _oracle,
      _positionInfoBefore.assetLpAmount - _positionInfoAfter.assetLpAmount,
      _lpToken
    );

    // This will force the equity loss in asset vault stay within the expectation
    // Given that the expectation is equity loss in asset vault will not alter the asset equity to total equity ratio
    // _assetExpectedWithdrawValue = _withdrawValue * _positionInfoBefore.assetPositionEquity / _totalEquityBefore
    // _assetActualWithdrawValue should be almost equal to _assetExpectedWithdrawValue
    if (
      !Math.almostEqual(
        (_assetLpWithdrawValue -
          (_positionInfoBefore.assetPositionDebtValue - _positionInfoAfter.assetPositionDebtValue)) *
          _totalEquityBefore,
        _withdrawValue * _positionInfoBefore.assetPositionEquity,
        _positionValueTolerance
      )
    ) {
      revert DeltaNeutralVault04HealthChecker_UnsafePositionValue();
    }

    // // debt ratio check to prevent closing all out the debt but the equity stay healthy
    uint256 _totalStablePositionBefore = _positionInfoBefore.stablePositionEquity +
      _positionInfoBefore.stablePositionDebtValue;
    uint256 _totalStablePositionAfter = _positionInfoAfter.stablePositionEquity +
      _positionInfoAfter.stablePositionDebtValue;
    // debt ratio = debt / position
    // debt after / position after ~= debt b4 / position b4
    // position b4 * debt after = position after * debt b4
    if (
      !Math.almostEqual(
        _totalStablePositionBefore * _positionInfoAfter.stablePositionDebtValue,
        _totalStablePositionAfter * _positionInfoBefore.stablePositionDebtValue,
        _debtRatioTolerance
      )
    ) {
      revert DeltaNeutralVault04HealthChecker_UnsafeDebtRatio();
    }

    uint256 _totalassetPositionBefore = _positionInfoBefore.assetPositionEquity +
      _positionInfoBefore.assetPositionDebtValue;
    uint256 _totalassetPositionAfter = _positionInfoAfter.assetPositionEquity +
      _positionInfoAfter.assetPositionDebtValue;

    if (
      !Math.almostEqual(
        _totalassetPositionBefore * _positionInfoAfter.assetPositionDebtValue,
        _totalassetPositionAfter * _positionInfoBefore.assetPositionDebtValue,
        _debtRatioTolerance
      )
    ) {
      revert DeltaNeutralVault04HealthChecker_UnsafeDebtRatio();
    }
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
  ) internal pure returns (bool) {
    uint256 _actualStableDebtChange = _positionInfoAfter.stablePositionDebtValue -
      _positionInfoBefore.stablePositionDebtValue;
    uint256 _actualAssetDebtChange = _positionInfoAfter.assetPositionDebtValue -
      _positionInfoBefore.assetPositionDebtValue;

    return
      Math.almostEqual(_actualStableDebtChange, _expectedStableDebtChange, _toleranceBps) &&
      Math.almostEqual(_actualAssetDebtChange, _expectedAssetDebtChange, _toleranceBps);
  }
}
