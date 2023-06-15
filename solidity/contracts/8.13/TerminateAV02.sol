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
import "./interfaces/IDeltaNeutralStruct.sol";
import "./interfaces/IDeltaNeutralVault04HealthChecker.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IWorker02.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/IWNativeRelayer.sol";
import "./interfaces/IDeltaNeutralVaultConfig02.sol";
import "./interfaces/IFairLaunch.sol";
import "./interfaces/ISwapRouter.sol";
import "./interfaces/IController.sol";
import "./interfaces/IExecutor.sol";
import "./interfaces/ISwapPairLike.sol";

import "./utils/SafeToken.sol";
import "./utils/FixedPointMathLib.sol";
import "./utils/Math.sol";
import "./utils/FullMath.sol";

/// @title TerminateAV02
// solhint-disable max-states-count
contract TerminateAV02 is IDeltaNeutralStruct, ERC20Upgradeable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
  // --- Libraries ---
  using FixedPointMathLib for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  // --- Events ---
  event LogWithdraw(address indexed _shareOwner, uint256 _minStableTokenAmount);
  event LogTerminated(address indexed _caller);

  // --- Errors ---
  error TerminateAV02_Unauthorized(address _caller);
  error TerminateAV02_WithdrawNotReady();
  error TerminateAV02_Terminated();
  error TerminateAV02_InvalidPositions(address _vault, uint256 _positionId);
  error TerminateAV02_InsufficientTokenReceived(address _token, uint256 _requiredAmount, uint256 _receivedAmount);
  error TerminateAV02_UnTrustedPrice();
  error TerminateAV02_InvalidShareAmount();
  error TerminateAV02_InvalidTerminateSwap();
  error TerminateAV02_TooMuchAssetTokenLeftOver();
  error TerminateAV02_DebtLeftOver();

  // --- Constants ---
  uint64 private constant MAX_BPS = 10000;

  uint8 private constant ACTION_WORK = 1;
  uint8 private constant ACTION_WRAP = 2;

  // --- States ---
  uint256 public stableTo18ConversionFactor;
  uint256 public assetTo18ConversionFactor;

  address private lpToken;
  address public stableVault;
  address public assetVault;

  address public stableVaultWorker;
  address public assetVaultWorker;

  address public stableToken;
  address public assetToken;
  address public alpacaToken;

  uint256 public stableVaultPosId;
  uint256 public assetVaultPosId;

  uint256 public lastFeeCollected;

  IDeltaNeutralOracle public priceOracle;

  IDeltaNeutralVaultConfig02 public config;

  // --- Mutable ---
  uint8 private OPENING;

  // --- Checker ---
  IDeltaNeutralVault04HealthChecker public checker;

  bool public isTerminated;
  address public terminateExecutor;

  /// @dev Require that the caller must be an EOA account if not whitelisted.
  modifier onlyEOAorWhitelisted() {
    if (msg.sender != tx.origin && !config.whitelistedCallers(msg.sender)) {
      revert TerminateAV02_Unauthorized(msg.sender);
    }
    _;
  }

  /// @dev Collect management fee before interactions
  modifier collectFee() {
    _mintFee();
    _;
  }

  /// @notice return token to share owenr.
  /// @param _to receiver address.
  /// @param _token token to transfer.
  /// @param _amount amount to transfer.
  function _transferTokenToShareOwner(address _to, address _token, uint256 _amount) internal {
    if (_token == config.getWrappedNativeAddr()) {
      address _relayer = config.getWNativeRelayer();
      SafeToken.safeTransfer(_token, _relayer, _amount);
      IWNativeRelayer(_relayer).withdraw(_amount);
      SafeToken.safeTransferETH(_to, _amount);
    } else {
      IERC20Upgradeable(_token).safeTransfer(_to, _amount);
    }
  }

  /// @notice minting shares as a form of management fee to teasury account
  function _mintFee() internal {
    _mint(config.managementFeeTreasury(), pendingManagementFee());
    lastFeeCollected = block.timestamp;
  }

  /// @notice Return amount of share pending for minting as a form of management fee
  function pendingManagementFee() public view returns (uint256) {
    uint256 _secondsFromLastCollection = block.timestamp - lastFeeCollected;
    return (totalSupply() * config.managementFeePerSec() * _secondsFromLastCollection) / 1e18;
  }

  /// @notice Withdraw from delta neutral vault.
  /// @param _shareAmount Amount of share to withdraw from vault.
  /// @param _minStableTokenAmount Minimum stable token shareOwner expect to receive.
  function withdraw(
    uint256 _shareAmount,
    uint256 _minStableTokenAmount,
    uint256 /*_minAssetTokenAmount*/,
    bytes calldata /*_data*/
  ) external onlyEOAorWhitelisted nonReentrant returns (uint256) {
    if (!isTerminated) revert TerminateAV02_WithdrawNotReady();
    if (_shareAmount == 0) revert TerminateAV02_InvalidShareAmount();

    uint256 _stableTokenBack = FullMath.mulDiv(
      _shareAmount,
      IERC20Upgradeable(stableToken).balanceOf(address(this)),
      totalSupply()
    );

    // burn shares from share owner
    _burn(msg.sender, _shareAmount);

    // check slipage
    if (_stableTokenBack < _minStableTokenAmount) {
      revert TerminateAV02_InsufficientTokenReceived(stableToken, _minStableTokenAmount, _stableTokenBack);
    }

    // the new executor won't return any asset back
    _transferTokenToShareOwner(msg.sender, stableToken, _stableTokenBack);

    // on withdraw increase credit to tx.origin since user can withdraw from DN Gateway -> DN Vault
    IController _controller = IController(config.controller());
    if (address(_controller) != address(0)) _controller.onWithdraw(tx.origin, _shareAmount);

    emit LogWithdraw(msg.sender, _stableTokenBack);

    return _stableTokenBack;
  }

  /* Termination
    1. call terminate()
    2. call swap to cover remaining debt
    3. call repay to repay the remaining debt
    4. once verify the healthiness, call setIsTerminated()
   */
  function terminate(address _terminator) external {
    if (msg.sender != 0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51) revert TerminateAV02_Unauthorized(msg.sender);
    if (isTerminated) revert TerminateAV02_Terminated();

    terminateExecutor = _terminator;

    // after execution, all token should sit in this contract
    IExecutor(_terminator).exec(abi.encode(0));

    // transfer alpacaOut
    uint256 _alpacaAmount = IERC20Upgradeable(alpacaToken).balanceOf(address(this));
    if (_alpacaAmount != 0) {
      IERC20Upgradeable(alpacaToken).transfer(msg.sender, _alpacaAmount);
    }

    terminateExecutor = address(0);

    emit LogTerminated(msg.sender);
  }

  // use 1inch calldata to do the swap
  function swapAndRepay(
    address _router,
    address _tokenIn,
    uint256 _amountIn,
    bytes calldata _swapCalldata,
    address _repayExecutor
  ) external {
    if (msg.sender != 0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51) revert TerminateAV02_Unauthorized(msg.sender);

    PositionInfo memory _positionInfo = positionInfo();
    address _tokenOut;
    uint256 _tokenOutDebtValue;

    if (_tokenIn == stableToken) {
      _tokenOut = assetToken;
      _tokenOutDebtValue = _positionInfo.assetPositionDebtValue;
    } else {
      _tokenOut = stableToken;
      _tokenOutDebtValue = _positionInfo.stablePositionDebtValue;
    }

    uint256 _tokenOutBalanceBefore = IERC20Upgradeable(_tokenOut).balanceOf(address(this));

    IERC20Upgradeable(_tokenIn).safeApprove(_router, _amountIn);

    _router.call(_swapCalldata);

    uint256 _tokenOutBalanceAfter = IERC20Upgradeable(_tokenOut).balanceOf(address(this));

    // prevent unexpected swap
    if (_tokenOutBalanceAfter <= _tokenOutBalanceBefore) {
      revert TerminateAV02_InvalidTerminateSwap();
    }

    // call repay when debt remain
    if (_tokenOutDebtValue != 0) {
      terminateExecutor = _repayExecutor;
      // repay the token with maximum amount
      // if the debt is less than available amount, should repay only debt value
      IExecutor(_repayExecutor).exec(abi.encode(_tokenOut, _tokenOutBalanceAfter));

      terminateExecutor = address(0);
    }
  }

  function setIsTerminated(bool _isTerminated) external {
    if (msg.sender != 0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51) revert TerminateAV02_Unauthorized(msg.sender);
    if (_isTerminated == true) {
      // Must repay all debt
      PositionInfo memory _positionInfo = positionInfo();
      if (_positionInfo.stablePositionDebtValue != 0 || _positionInfo.assetPositionDebtValue != 0) {
        revert TerminateAV02_DebtLeftOver();
      }
      // Must not have too much assetToken remain
      if (IERC20Upgradeable(assetToken).balanceOf(address(this)) > 1e6) {
        revert TerminateAV02_TooMuchAssetTokenLeftOver();
      }
    }

    isTerminated = _isTerminated;
  }

  // ---------------------- Remaining ----------------------------------//

  /// @notice Return equity and debt value in usd of stable and asset positions.
  function positionInfo() public view returns (PositionInfo memory) {
    uint256 _stableLpAmount = IWorker02(stableVaultWorker).totalLpBalance();
    uint256 _assetLpAmount = IWorker02(assetVaultWorker).totalLpBalance();
    uint256 _stablePositionValue = _lpToValue(_stableLpAmount);
    uint256 _assetPositionValue = _lpToValue(_assetLpAmount);
    (, uint256 _stableDebtValue) = _positionDebt(stableVault, stableVaultPosId, stableTo18ConversionFactor);
    (, uint256 _assetDebtValue) = _positionDebt(assetVault, assetVaultPosId, assetTo18ConversionFactor);

    return
      PositionInfo({
        stablePositionEquity: _stablePositionValue > _stableDebtValue ? _stablePositionValue - _stableDebtValue : 0,
        stablePositionDebtValue: _stableDebtValue,
        stableLpAmount: _stableLpAmount,
        assetPositionEquity: _assetPositionValue > _assetDebtValue ? _assetPositionValue - _assetDebtValue : 0,
        assetPositionDebtValue: _assetDebtValue,
        assetLpAmount: _assetLpAmount
      });
  }

  /// @notice Return the value of share from the given share amount.
  /// @param _shareAmount Amount of share.
  function shareToValue(uint256 _shareAmount) public view returns (uint256) {
    // From internal call + pendingManagementFee should be 0 as it was collected
    // at the beginning of the external contract call
    // For external call, to calculate shareToValue, pending fee shall be accounted
    uint256 _shareSupply = totalSupply();
    if (_shareSupply == 0) return _shareAmount;
    return FullMath.mulDiv(_shareAmount, totalEquityValue(), _shareSupply);
  }

  /// @notice Return the amount of share from the given value.
  /// @param _value value in usd.
  function valueToShare(uint256 _value) external view returns (uint256) {
    return _valueToShare(_value, totalEquityValue());
  }

  /// @notice Return equity value of delta neutral position.
  function totalEquityValue() public view returns (uint256) {
    uint256 _stableAmount = IERC20Upgradeable(stableToken).balanceOf(address(this));
    return (_stableAmount * stableTo18ConversionFactor).mulWadDown(_getTokenPrice(stableToken));
  }

  /// @notice Return position debt amount and debt + pending interest value.
  /// @param _vault Vault addrss.
  /// @param _posId Position id.
  function _positionDebt(
    address _vault,
    uint256 _posId,
    uint256 _18ConversionFactor
  ) internal view returns (uint256 _debtAmount, uint256 _debtValue) {
    (, , uint256 _positionDebtShare) = IVault(_vault).positions(_posId);
    address _token = IVault(_vault).token();
    uint256 _vaultDebtShare = IVault(_vault).vaultDebtShare();
    if (_vaultDebtShare == 0) {
      _debtAmount = _positionDebtShare;
      _debtValue = (_positionDebtShare * _18ConversionFactor).mulWadDown(_getTokenPrice(_token));
    } else {
      uint256 _vaultDebtValue = IVault(_vault).vaultDebtVal() + IVault(_vault).pendingInterest(0);

      _debtAmount = FullMath.mulDiv(_positionDebtShare, _vaultDebtValue, _vaultDebtShare);
      _debtValue = (_debtAmount * _18ConversionFactor).mulWadDown(_getTokenPrice(_token));
    }
  }

  /// @notice Return value of given lp amount.
  /// @param _lpAmount Amount of lp.
  function _lpToValue(uint256 _lpAmount) internal view returns (uint256) {
    (uint256 _lpValue, uint256 _lastUpdated) = priceOracle.lpToDollar(_lpAmount, lpToken);
    if (block.timestamp - _lastUpdated > 86400) revert TerminateAV02_UnTrustedPrice();
    return _lpValue;
  }

  /// @notice Proxy function for calling internal action.
  /// @param _action actions to execute.
  /// @param _value Native token amount.
  /// @param _data The calldata to pass along for more working context.
  function execute(uint8 _action, uint256 _value, bytes memory _data) external {
    if (msg.sender != terminateExecutor) {
      revert TerminateAV02_Unauthorized(msg.sender);
    }
    if (_action == ACTION_WORK) {
      _doWork(_data);
    }
    if (_action == ACTION_WRAP) {
      IWETH(config.getWrappedNativeAddr()).deposit{ value: _value }();
    }
  }

  /// @notice interact with delta neutral position.
  /// @param _data The calldata to pass along to the vault for more working context.
  function _doWork(bytes memory _data) internal {
    // 1. Decode data
    (
      address payable _vault,
      uint256 _posId,
      address _worker,
      uint256 _principalAmount,
      uint256 _borrowAmount,
      uint256 _maxReturn,
      bytes memory _workData
    ) = abi.decode(_data, (address, uint256, address, uint256, uint256, uint256, bytes));

    // OPENING for initializing positions
    if (
      OPENING != 1 &&
      !((_vault == stableVault && _posId == stableVaultPosId) || (_vault == assetVault && _posId == assetVaultPosId))
    ) {
      revert TerminateAV02_InvalidPositions({ _vault: _vault, _positionId: _posId });
    }

    // 2. approve vault
    IERC20Upgradeable(stableToken).safeApprove(_vault, type(uint256).max);
    IERC20Upgradeable(assetToken).safeApprove(_vault, type(uint256).max);

    // 3. Call work to altering Vault position
    IVault(_vault).work(_posId, _worker, _principalAmount, _borrowAmount, _maxReturn, _workData);

    // 4. Reset approve to 0
    IERC20Upgradeable(stableToken).safeApprove(_vault, 0);
    IERC20Upgradeable(assetToken).safeApprove(_vault, 0);
  }

  /// @dev _getTokenPrice with validate last price updated
  function _getTokenPrice(address _token) internal view returns (uint256) {
    (uint256 _price, uint256 _lastUpdated) = priceOracle.getTokenPrice(_token);
    // _lastUpdated > 1 day revert
    if (block.timestamp - _lastUpdated > 86400) revert TerminateAV02_UnTrustedPrice();
    return _price;
  }

  /// @notice Calculate share from value and total equity
  /// @param _value Value to convert
  /// @param _totalEquity Total equity at the time of calculation
  function _valueToShare(uint256 _value, uint256 _totalEquity) internal view returns (uint256) {
    uint256 _shareSupply = totalSupply();
    if (_shareSupply == 0) return _value;
    return FullMath.mulDiv(_value, _shareSupply, _totalEquity);
  }

  /// @dev Fallback function to accept BNB.
  receive() external payable {}
}
