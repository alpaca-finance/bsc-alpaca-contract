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

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "./interfaces/IDeltaNeutralVault.sol";
import "./interfaces/ISwapRouter.sol";
import "./interfaces/IWETH.sol";
import "../utils/SafeToken.sol";
import "../utils/FixedPointMathLib.sol";

contract DeltaNeutralVaultGateway is ReentrancyGuardUpgradeable, OwnableUpgradeable {
  /// @notice Libraries
  using FixedPointMathLib for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /// @dev Events
  event LogWithdraw(address indexed _shareOwner, uint256 _minStableTokenAmount, uint256 _minAssetTokenAmount);

  /// @dev Errors
  error ReturnBpsExceed(uint64 _stableReturnBps);
  error UnTrustedPrice();

  /// @dev constants
  uint64 private constant BASIS_POINT = 10000;

  IDeltaNeutralVault deltaNeutralVault;

  function initialize(address _deltaNeutralVault) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();

    deltaNeutralVault = IDeltaNeutralVault(_deltaNeutralVault);
  }

  /// @notice Withdraw from delta neutral vault.
  /// @param _shareAmount Amount of share to withdraw from vault.
  /// @param _minStableTokenAmount Minimum stable token shareOwner expect to receive.
  /// @param _minAssetTokenAmount Minimum asset token shareOwner expect to receive.
  /// @param _data The calldata to pass along to the proxy action for more working context.
  /// @param _stableReturnBps Percentage stable token shareOwner expect to receive.
  function withdraw(
    uint256 _shareAmount,
    uint256 _minStableTokenAmount,
    uint256 _minAssetTokenAmount,
    bytes calldata _data,
    uint64 _stableReturnBps
  ) public nonReentrant returns (uint256) {
    // _stableReturnBps should not be greater than 100%
    if (_stableReturnBps > 10000) {
      revert ReturnBpsExceed(_stableReturnBps);
    }

    // transfer share from user
    _transferShareToVaultGateway(_shareAmount);

    // withdraw from delta neutral vault
    uint256 _withdrawValue = deltaNeutralVault.withdraw(
      _shareAmount,
      _minStableTokenAmount,
      _minAssetTokenAmount,
      _data
    );

    // adjust token amount depends on stable retuen bps
    _adjustTokenAmount(_stableReturnBps);

    address _stableToken = deltaNeutralVault.stableToken();
    address _assetToken = deltaNeutralVault.assetToken();

    // get all token amount
    uint256 _stableTokenBack = _getBalance(_stableToken);
    uint256 _assetTokenBack = _getBalance(_assetToken);

    // transfer token back to user
    _transferTokenToShareOwner(msg.sender, _stableToken, _stableTokenBack);
    _transferTokenToShareOwner(msg.sender, _assetToken, _assetTokenBack);

    emit LogWithdraw(msg.sender, _stableTokenBack, _assetTokenBack);
    return _withdrawValue;
  }

  /// @notice Get token from msg.sender.
  /// @param _amount amount to transfer.
  function _transferShareToVaultGateway(uint256 _amount) internal {
    IERC20Upgradeable(address(deltaNeutralVault)).safeTransferFrom(msg.sender, address(this), _amount);
  }

  /// @notice return token to share owner.
  /// @param _to receiver address.
  /// @param _token token to transfer.
  /// @param _amount amount to transfer.
  function _transferTokenToShareOwner(
    address _to,
    address _token,
    uint256 _amount
  ) internal {
    if (_token == deltaNeutralVault.config().getWrappedNativeAddr()) {
      SafeToken.safeTransferETH(_to, _amount);
    } else {
      IERC20Upgradeable(_token).safeTransfer(_to, _amount);
    }
  }

  /// @dev _getTokenPrice with validate last price updated
  /// @param _token token address
  function _getTokenPrice(address _token) internal returns (uint256) {
    (uint256 _price, uint256 _lastUpdated) = deltaNeutralVault.priceOracle().getTokenPrice(_token);
    // _lastUpdated > 30 mins revert
    if (block.timestamp - _lastUpdated > 1800) revert UnTrustedPrice();
    return _price;
  }

  /// @notice calculate swap amount.
  /// @param _stableReturnBps Percentage stable token shareOwner expect to receive.
  function _adjustTokenAmount(uint64 _stableReturnBps) internal {
    address _stableToken = deltaNeutralVault.stableToken();
    address _assetToken = deltaNeutralVault.assetToken();

    uint256 _stableTokenBalance = _getBalance(_stableToken);
    uint256 _assetTokenBalance = _getBalance(_assetToken);

    uint256 _stableTokenPrice = _getTokenPrice(_stableToken);
    uint256 _assetTokenPrice = _getTokenPrice(_assetToken);

    uint256 _stableTokenBalanceInUSD = _stableTokenBalance.mulWadDown(_stableTokenPrice);
    uint256 _assetTokenBalanceInUSD = _assetTokenBalance.mulWadDown(_assetTokenPrice);
    uint256 _total = _stableTokenBalanceInUSD + _assetTokenBalanceInUSD;

    uint256 _expectedStableInUSD = (_stableReturnBps * _total) / BASIS_POINT;
    if (_stableTokenBalanceInUSD > _expectedStableInUSD) {
      uint256 _swapStableAmount = (_stableTokenBalanceInUSD - _expectedStableInUSD).divWadDown(_stableTokenPrice);
      _swap(_stableToken, _swapStableAmount);
      return;
    }

    uint64 _assetReturnBps = BASIS_POINT - _stableReturnBps;
    uint256 _expectedAssetInUSD = (_assetReturnBps * _total) / BASIS_POINT;
    if (_assetTokenBalanceInUSD > _expectedAssetInUSD) {
      uint256 _swapAssetAmount = (_assetTokenBalanceInUSD - _expectedAssetInUSD).divWadDown(_assetTokenPrice);
      _swap(_assetToken, _swapAssetAmount);
      return;
    }
  }

  /// @notice get token balance.
  /// @param _token Token address.
  function _getBalance(address _token) internal returns (uint256) {
    if (_token == deltaNeutralVault.config().getWrappedNativeAddr()) {
      return address(this).balance;
    } else {
      return IERC20Upgradeable(_token).balanceOf(address(this));
    }
  }

  /// @notice swap token.
  /// @param _token Token for swap.
  /// @param _swapAmount token amount to swap.
  function _swap(address _token, uint256 _swapAmount) internal {
    IDeltaNeutralVaultConfig config = IDeltaNeutralVaultConfig(deltaNeutralVault.config());
    ISwapRouter _router = ISwapRouter(config.getSwapRouter());

    address _stableToken = deltaNeutralVault.stableToken();
    address _assetToken = deltaNeutralVault.assetToken();
    address _nativeToken = config.getWrappedNativeAddr();

    address[] memory _path = new address[](2);
    address _token0 = _token;
    address _token1 = _token == _stableToken ? _assetToken : _stableToken;
    _path[0] = _token0;
    _path[1] = _token1;

    if (_token0 == _nativeToken || _token1 == _nativeToken) {
      if (_token0 == _nativeToken) {
        _router.swapExactETHForTokens{ value: _swapAmount }(0, _path, address(this), block.timestamp);
      } else {
        IERC20Upgradeable(_token).approve(address(_router), _swapAmount);

        _router.swapExactTokensForETH(_swapAmount, 0, _path, address(this), block.timestamp);
      }
    } else {
      IERC20Upgradeable(_token).approve(address(_router), _swapAmount);

      _router.swapExactTokensForTokens(_swapAmount, 0, _path, address(this), block.timestamp);
    }
  }

  /// @dev Fallback function to accept BNB.
  receive() external payable {}
}
