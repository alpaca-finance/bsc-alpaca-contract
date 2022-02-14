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
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "./interfaces/IDeltaNeutralVault.sol";
import "./interfaces/ISwapRouter.sol";
import "./interfaces/IWETH.sol";
import "../utils/SafeToken.sol";
import "../utils/FixedPointMathLib.sol";

import "hardhat/console.sol";

contract DeltaNeutralVaultGateway is ERC20Upgradeable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
  /// @notice Libraries
  using FixedPointMathLib for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /// @dev Events
  event LogWithdraw(address indexed _shareOwner, uint256 _minStableTokenAmount, uint256 _minAssetTokenAmount);

  /// @dev Errors
  error ReturnBspExceed(uint64 _stableReturnBps);
  error UnTrustedPrice();
  error SwapCalculationError();

  /// @dev constants
  uint64 private constant BASIS_POINT = 10000;

  IDeltaNeutralVault deltaNeutralVault;

  function initialize(
    string calldata _name,
    string calldata _symbol,
    address _deltaNeutralVault
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
    ERC20Upgradeable.__ERC20_init(_name, _symbol);

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
    // transfer share from user
    _transferShareToVaultGateway(_shareAmount);

    // withdraw from delta neutral vault
    uint256 _withdrawValue = deltaNeutralVault.withdraw(
      _shareAmount,
      _minStableTokenAmount,
      _minAssetTokenAmount,
      _data
    );

    // _stableReturnBps should not be greater than 100%
    if (_stableReturnBps > 10000) {
      revert ReturnBspExceed(_stableReturnBps);
    }

    address _stableToken = deltaNeutralVault.stableToken();
    address _assetToken = deltaNeutralVault.assetToken();

    uint256 _stableTokenBalance = _getBalance(_stableToken);
    uint256 _assetTokenBalance = _getBalance(_assetToken);
    console.log("_stableTokenBack before", _stableTokenBalance);
    console.log("_assetTokenBack before", _assetTokenBalance);

    _adjustTokenAmount(_stableToken, _assetToken, _stableTokenBalance, _assetTokenBalance, _stableReturnBps);

    // get balance again
    _stableTokenBalance = _getBalance(_stableToken);
    _assetTokenBalance = _getBalance(_assetToken);
    console.log("_stableTokenBack after", _stableTokenBalance);
    console.log("_assetTokenBack after", _assetTokenBalance);

    // transfer token back to user
    _transferTokenToShareOwner(msg.sender, _stableToken, _stableTokenBalance);
    _transferTokenToShareOwner(msg.sender, _assetToken, _assetTokenBalance);

    emit LogWithdraw(msg.sender, _stableTokenBalance, _assetTokenBalance);
    return _withdrawValue;
  }

  /// @notice Get token from msg.sender.
  /// @param _amount amount to transfer.
  function _transferShareToVaultGateway(uint256 _amount) internal {
    IERC20Upgradeable(address(deltaNeutralVault)).safeTransferFrom(msg.sender, address(this), _amount);
  }

  /// @notice return token to share owenr.
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
  function _getTokenPrice(address token) internal returns (uint256) {
    (uint256 _price, uint256 _lastUpdated) = deltaNeutralVault.priceOracle().getTokenPrice(token);
    // _lastUpdated > 30 mins revert
    if (block.timestamp - _lastUpdated > 1800) revert UnTrustedPrice();
    return _price;
  }

  /// @notice calculate swap amount.
  /// @param _stableToken stable token.
  /// @param _assetToken asset token.
  /// @param _stableTokenBalance stable token balance.
  /// @param _assetTokenBalance asset token balance.
  /// @param _stableReturnBps Percentage stable token shareOwner expect to receive.
  function _adjustTokenAmount(
    address _stableToken,
    address _assetToken,
    uint256 _stableTokenBalance,
    uint256 _assetTokenBalance,
    uint64 _stableReturnBps
  ) internal {
    uint256 _stableTokenPrice = _getTokenPrice(_stableToken);
    uint256 _assetTokenPrice = _getTokenPrice(_assetToken);
    console.log("_stableTokenPrice", _stableTokenPrice);
    console.log("_assetTokenPrice", _assetTokenPrice);

    uint256 _stableTokenBalanceInUSD = _stableTokenBalance.mulWadDown(_stableTokenPrice);
    uint256 _assetTokenBalanceInUSD = _assetTokenBalance.mulWadDown(_assetTokenPrice);
    uint256 _total = _stableTokenBalanceInUSD + _assetTokenBalanceInUSD;

    // stable
    uint256 _stableSwapBps = _calculateSwapBps(_stableTokenBalanceInUSD, _total, _stableReturnBps);
    console.log("_stableSwapBps", _stableSwapBps);
    if (_stableSwapBps > 0) {
      uint256 _swapStableAmount = _calculateSwapAmount(_stableTokenBalanceInUSD, _stableTokenPrice, _stableSwapBps);
      console.log("_swapStableAmount", _swapStableAmount);
      _swap(_stableToken, _swapStableAmount);
      return;
    }

    // asset
    uint64 _assetReturnBps = 10000 - _stableReturnBps;
    uint256 _assetSwapBps = _calculateSwapBps(_assetTokenBalanceInUSD, _total, _assetReturnBps);
    console.log("_assetSwapBps", _assetSwapBps);
    if (_assetSwapBps > 0) {
      uint256 _swapAssetAmount = _calculateSwapAmount(_assetTokenBalanceInUSD, _assetTokenPrice, _assetSwapBps);
      console.log("_assetableAmount", _swapAssetAmount);
      _swap(_assetToken, _swapAssetAmount);
      return;
    }
  }

  /// @notice calculate swap bps.
  /// @param _amountInUSD Value of token.
  /// @param _totalAmountInUSD Value of total supply.
  /// @param _returnBps Percentage token shareOwner expect to receive
  function _calculateSwapBps(
    uint256 _amountInUSD,
    uint256 _totalAmountInUSD,
    uint256 _returnBps
  ) internal returns (uint256) {
    uint256 _tokenBps = (_amountInUSD * BASIS_POINT) / _totalAmountInUSD;
    console.log("bps", _tokenBps, _returnBps);
    if (_tokenBps < _returnBps) return 0;
    uint256 _toSwapBps = ((_tokenBps - _returnBps) * BASIS_POINT) / _tokenBps;
    console.log("_toSwapBps", _toSwapBps);
    return _toSwapBps;
  }

  /// @notice calculate swap amount.
  /// @param _amountInUSD Value of token.
  /// @param _tokenPrice Token price.
  /// @param _swapBps Percentage to swap out.
  function _calculateSwapAmount(
    uint256 _amountInUSD,
    uint256 _tokenPrice,
    uint256 _swapBps
  ) internal returns (uint256) {
    uint256 _toSwapUSD = (_amountInUSD * _swapBps) / BASIS_POINT;
    return _toSwapUSD.divWadDown(_tokenPrice);
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
        console.log("swap swapExactETHForTokens amount", _swapAmount);
        _router.swapExactETHForTokens{ value: _swapAmount }(0, _path, address(this), block.timestamp);
      } else {
        IERC20Upgradeable(_token).approve(address(_router), _swapAmount);
        console.log("swap swapExactTokensForETH amount", _swapAmount);
        _router.swapExactTokensForETH(_swapAmount, 0, _path, address(this), block.timestamp);
      }
    } else {
      IERC20Upgradeable(_token).approve(address(_router), _swapAmount);
      console.log("swap swapExactTokensForTokens amount", _swapAmount);
      _router.swapExactTokensForTokens(_swapAmount, 0, _path, address(this), block.timestamp);
    }
  }

  /// @dev Fallback function to accept BNB.
  receive() external payable {}
}
