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

/// @title DeltaNeutralVault04 is designed to take a long and short position in an asset at the same time
/// to cancel out the effect on the out-standing portfolio when the asset’s price moves.
/// Moreover, DeltaNeutralVault04 support credit-dependent limit access and executor
// solhint-disable max-states-count
contract DeltaNeutralVaultHealthCheck is ReentrancyGuardUpgradeable, OwnableUpgradeable {
  // --- Libraries ---
  using FixedPointMathLib for uint256;

  // --- Errors ---
  error DeltaNeutralVault_PositionValueExceedLimit();
  error DeltaNeutralVault_UnsafePositionEquity();
  error DeltaNeutralVault_UnsafeDebtValue();
  error DeltaNeutralVault_UnTrustedPrice();

  struct PositionInfo {
    uint256 stablePositionEquity;
    uint256 stablePositionDebtValue;
    uint256 stableLpAmount;
    uint256 assetPositionEquity;
    uint256 assetPositionDebtValue;
    uint256 assetLpAmount;
  }

  /// @notice Return value of given lp amount.
  /// @param _lpAmount Amount of lp.
  function _lpToValue(
    address _oracle,
    uint256 _lpAmount,
    address _lpToken
  ) internal view returns (uint256) {
    (uint256 _lpValue, uint256 _lastUpdated) = IDeltaNeutralOracle(_oracle).lpToDollar(_lpAmount, _lpToken);
    if (block.timestamp - _lastUpdated > 86400) revert DeltaNeutralVault_UnTrustedPrice();
    return _lpValue;
  }

  /// @notice check if position equity and debt are healthy after deposit. LEVERAGE_LEVEL must be >= 3
  /// @param _depositValue deposit value in usd.
  /// @param _positionInfoBefore position equity and debt before deposit.
  /// @param _positionInfoAfter position equity and debt after deposit.
  function _depositHealthCheck(
    uint256 _depositValue,
    PositionInfo memory _positionInfoBefore,
    PositionInfo memory _positionInfoAfter,
    address _oracle,
    address _config,
    address _lpToken
  ) external view {
    //FIXME validate oracle and config and lpToken
    uint256 _toleranceBps = IDeltaNeutralVaultConfig02(config).positionValueTolerance();
    uint8 _leverageLevel = IDeltaNeutralVaultConfig02(config).leverageLevel();

    uint256 _positionValueAfter = _positionInfoAfter.stablePositionEquity +
      _positionInfoAfter.stablePositionDebtValue +
      _positionInfoAfter.assetPositionEquity +
      _positionInfoAfter.assetPositionDebtValue;

    // 1. check if vault accept new total position value
    if (!IDeltaNeutralVaultConfig02(config).isVaultSizeAcceptable(_positionValueAfter)) {
      revert DeltaNeutralVault_PositionValueExceedLimit();
    }

    // 2. check position value
    // The equity allocation of long side should be equal to _depositValue * (_leverageLevel - 2) / ((2*_leverageLevel) - 2)
    uint256 _expectedStableEqChange = (_depositValue * (_leverageLevel - 2)) / ((2 * _leverageLevel) - 2);
    // The equity allocation of short side should be equal to _depositValue * _leverageLevel / ((2*_leverageLevel) - 2)
    uint256 _expectedAssetEqChange = (_depositValue * _leverageLevel) / ((2 * _leverageLevel) - 2);

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

    if (
      !Math.almostEqual(_actualStableEqChange, _expectedStableEqChange, _toleranceBps) ||
      !Math.almostEqual(_actualAssetEqChange, _expectedAssetEqChange, _toleranceBps)
    ) {
      revert DeltaNeutralVault_UnsafePositionEquity();
    }

    // 3. check Debt value
    // The debt allocation of long side should be equal to _expectedStableEqChange * (_leverageLevel - 1)
    uint256 _expectedStableDebtChange = (_expectedStableEqChange * (_leverageLevel - 1));
    // The debt allocation of short side should be equal to _expectedAssetEqChange * (_leverageLevel - 1)
    uint256 _expectedAssetDebtChange = (_expectedAssetEqChange * (_leverageLevel - 1));

    if (
      !Math.almostEqual(_actualStableDebtChange, _expectedStableDebtChange, _toleranceBps) ||
      !Math.almostEqual(_actualAssetDebtChange, _expectedAssetDebtChange, _toleranceBps)
    ) {
      revert DeltaNeutralVault_UnsafeDebtValue();
    }
  }
}
