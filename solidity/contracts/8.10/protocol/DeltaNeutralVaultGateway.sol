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
import "./interfaces/IERC20.sol";
import "../utils/SafeToken.sol";
import "../utils/FixedPointMathLib.sol";

contract DeltaNeutralVaultGateway is ReentrancyGuardUpgradeable, OwnableUpgradeable {
  /// @notice Libraries
  using FixedPointMathLib for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /// @dev Events
  event LogWithdraw(
    address indexed _shareOwner,
    uint256 _minWithdrawStableTokenAmount,
    uint256 _minWithdrawAssetTokenAmount
  );
  event LogTransfer(address _token, address _to, uint256 _amount);
  event LogSetRouter(address indexed _caller, address _router);

  /// @dev Errors
  error DeltaNeutralVaultGateway_ReturnBpsExceed(uint64 _stableReturnBps);
  error DeltaNeutralVaultGateway_UnTrustedPrice();
  error DeltaNeutralVaultGateway_InsufficientReceive(
    uint256 _stableAmount,
    uint256 _assetAmount,
    uint256 _minStableAmount,
    uint256 _minAssetAmount
  );

  /// @dev constants
  uint64 private constant MAX_BPS = 10000;

  IDeltaNeutralVault public deltaNeutralVault;
  ISwapRouter public router;

  function initialize(address _deltaNeutralVault, ISwapRouter _router) external initializer {
    // sanity check
    _router.factory();

    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();

    deltaNeutralVault = IDeltaNeutralVault(_deltaNeutralVault);
    router = _router;
  }

  /// @notice Withdraw from delta neutral vault.
  /// @param _shareAmount Amount of share to withdraw from vault.
  /// @param _minWithdrawStableTokenAmount Minimum stable token shareOwner expect to receive after withdraw.
  /// @param _minWithdrawAssetTokenAmount Minimum asset token shareOwner expect to receive after withdraw.
  /// @param _minSwapStableTokenAmount Minimum stable token shareOwner expect to receive after swap.
  /// @param _minSwapAssetTokenAmount Minimum asset token shareOwner expect to receive after swap.
  /// @param _data The calldata to pass along to the proxy action for more working context.
  /// @param _stableReturnBps Percentage stable token shareOwner expect to receive.
  function withdraw(
    uint256 _shareAmount,
    uint256 _minWithdrawStableTokenAmount,
    uint256 _minWithdrawAssetTokenAmount,
    uint256 _minSwapStableTokenAmount,
    uint256 _minSwapAssetTokenAmount,
    bytes calldata _data,
    uint64 _stableReturnBps
  ) external nonReentrant returns (uint256) {
    // _stableReturnBps should not be greater than 100%
    if (_stableReturnBps > MAX_BPS) {
      revert DeltaNeutralVaultGateway_ReturnBpsExceed(_stableReturnBps);
    }

    // transfer share from user
    _transferShareToVaultGateway(_shareAmount);

    address _stableToken = deltaNeutralVault.stableToken();
    address _assetToken = deltaNeutralVault.assetToken();

    // before
    uint256 _stableTokenBalanceBefore = _getBalance(_stableToken);
    uint256 _assetTokenBalanceBefore = _getBalance(_assetToken);

    // withdraw from delta neutral vault
    uint256 _withdrawValue = deltaNeutralVault.withdraw(
      _shareAmount,
      _minWithdrawStableTokenAmount,
      _minWithdrawAssetTokenAmount,
      _data
    );

    // adjust token amount depends on stable retuen bps
    _adjustTokenAmount(
      _stableReturnBps,
      _getBalance(_stableToken) - _stableTokenBalanceBefore,
      _getBalance(_assetToken) - _assetTokenBalanceBefore
    );

    // get all token amount
    uint256 _stableTokenBack = _getBalance(_stableToken) - _stableTokenBalanceBefore;
    uint256 _assetTokenBack = _getBalance(_assetToken) - _assetTokenBalanceBefore;
    if (_stableTokenBack < _minSwapStableTokenAmount || _assetTokenBack < _minSwapAssetTokenAmount) {
      revert DeltaNeutralVaultGateway_InsufficientReceive(
        _stableTokenBack,
        _assetTokenBack,
        _minSwapStableTokenAmount,
        _minSwapAssetTokenAmount
      );
    }

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
    // _lastUpdated > 1 day revert
    if (block.timestamp - _lastUpdated > 86400) revert DeltaNeutralVaultGateway_UnTrustedPrice();
    return _price;
  }

  /// @notice calculate swap amount.
  /// @param _stableReturnBps Percentage stable token shareOwner expect to receive.
  function _adjustTokenAmount(
    uint64 _stableReturnBps,
    uint256 _withdrawStableAmount,
    uint256 _withdrawAssetAmount
  ) internal {
    address _stableToken = deltaNeutralVault.stableToken();
    address _assetToken = deltaNeutralVault.assetToken();

    uint256 _stableTokenPrice = _getTokenPrice(_stableToken);
    uint256 _assetTokenPrice = _getTokenPrice(_assetToken);

    uint256 _stableTokenDecimals = IERC20(_stableToken).decimals();
    uint256 _assetTokenDecimals = IERC20(_assetToken).decimals();

    uint256 _withdrawStableAmountInUSD = ((_withdrawStableAmount * (1e18)) / (10**_stableTokenDecimals)).mulWadDown(
      _stableTokenPrice
    );
    uint256 _withdrawAssetAmountInUSD = ((_withdrawAssetAmount * (1e18)) / (10**_assetTokenDecimals)).mulWadDown(
      _assetTokenPrice
    );
    uint256 _total = _withdrawStableAmountInUSD + _withdrawAssetAmountInUSD;

    uint256 _expectedStableInUSD = (_stableReturnBps * _total) / MAX_BPS;
    if (_withdrawStableAmountInUSD > _expectedStableInUSD) {
      uint256 _swapStableAmount = (_withdrawStableAmountInUSD - _expectedStableInUSD).divWadDown(_stableTokenPrice);
      _swap(_stableToken, _swapStableAmount / 10**(18 - _stableTokenDecimals));
      return;
    }

    uint256 _expectedAssetInUSD = _total - _expectedStableInUSD;
    if (_withdrawAssetAmountInUSD > _expectedAssetInUSD) {
      uint256 _swapAssetAmount = (_withdrawAssetAmountInUSD - _expectedAssetInUSD).divWadDown(_assetTokenPrice);
      _swap(_assetToken, _swapAssetAmount / 10**(18 - _assetTokenDecimals));
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
        router.swapExactETHForTokens{ value: _swapAmount }(0, _path, address(this), block.timestamp);
      } else {
        IERC20Upgradeable(_token).approve(address(router), _swapAmount);

        router.swapExactTokensForETH(_swapAmount, 0, _path, address(this), block.timestamp);
      }
    } else {
      IERC20Upgradeable(_token).approve(address(router), _swapAmount);

      router.swapExactTokensForTokens(_swapAmount, 0, _path, address(this), block.timestamp);
    }
  }

  /// @notice transfer token.
  /// @param _token Token for transfer.
  /// @param _to Receiver.
  /// @param _amount Amount.
  function transfer(
    address _token,
    address _to,
    uint256 _amount
  ) external onlyOwner {
    if (_token == deltaNeutralVault.config().getWrappedNativeAddr()) {
      SafeToken.safeTransferETH(_to, _amount);
    } else {
      IERC20Upgradeable(_token).safeTransfer(_to, _amount);
    }

    emit LogTransfer(_token, _to, _amount);
  }

  /// @notice Set new router address.
  /// @param _newRouter router address.
  function setRouter(ISwapRouter _newRouter) external onlyOwner {
    // sanity check
    _newRouter.factory();

    router = _newRouter;

    emit LogSetRouter(msg.sender, address(_newRouter));
  }

  /// @dev Fallback function to accept BNB.
  receive() external payable {}
}
