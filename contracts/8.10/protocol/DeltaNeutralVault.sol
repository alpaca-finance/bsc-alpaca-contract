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

import "./interfaces/IPriceHelper.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IWorker02.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/IWNativeRelayer.sol";
import "./interfaces/IDeltaNeutralVaultConfig.sol";
import "./interfaces/IFairLaunch.sol";
import "./interfaces/IRouter.sol";
import "../utils/SafeToken.sol";
import "../utils/Math.sol";

import "hardhat/console.sol";

contract DeltaNeutralVault is ERC20Upgradeable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
  /// @notice Libraries
  using SafeToken for address;

  /// @dev Events
  event LogInitializePositions(address indexed _from, uint256 _stableVaultPosId, uint256 _assetVaultPosId);
  event LogDeposit(
    address indexed _from,
    address indexed _shareReceiver,
    uint256 _shares,
    uint256 _stableTokenAmount,
    uint256 _assetTokenAmount
  );
  event LogWithdraw(address indexed _shareOwner, uint256 _minStableTokenAmount, uint256 _minAssetTokenAmount);
  event LogRebalance(uint256 _equityBefore, uint256 _equityAfter);

  /// @dev Errors
  error Unauthorized(address _caller);
  error PositionsAlreadyInitialized();
  error PositionsNotInitialized();
  error InvalidPositions(address _vault, uint256 _positionId);
  error UnsafePositionEquity();
  error UnsafePositionValue();
  error UnsafeDebtValue();
  error UnsafeDebtRatio();
  error UnsafeOutstanding(address _token, uint256 _amountBefore, uint256 _amountAfter);
  error PositionsIsHealthy();
  error InsufficientTokenReceived(address _token, uint256 _requiredAmount, uint256 _receivedAmount);
  error InsufficientShareReceived(uint256 _requiredAmount, uint256 _receivedAmount);
  error InvalidConvertData();

  struct Outstanding {
    uint256 stableAmount;
    uint256 assetAmount;
    uint256 nativeAmount;
  }

  struct PositionInfo {
    uint256 stablePositionEquity;
    uint256 stablePositionDebtValue;
    uint256 assetPositionEquity;
    uint256 assetPositionDebtValue;
  }

  /// @dev constants
  uint8 private constant ACTION_WORK = 1;
  uint8 private constant ACTION_WARP = 2;
  uint8 private constant ACTION_CONVERT_ASSET = 3;

  /// @dev constant subAction of CONVERT_ASSET
  uint8 private constant CONVERT_EXACT_TOKEN_TO_NATIVE = 1;
  uint8 private constant CONVERT_EXACT_TOKEN_TO_TOKEN = 2;
  uint8 private constant CONVERT_TOKEN_TO_EXACT_TOKEN = 3;

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

  IPriceHelper public priceHelper;

  IDeltaNeutralVaultConfig public config;

  /// @dev mutable
  bool private OPENING;

  /// @dev Require that the caller must be an EOA account if not whitelisted.
  modifier onlyEOAorWhitelisted() {
    if (msg.sender != tx.origin && !config.whitelistedCallers(msg.sender)) {
      revert Unauthorized(msg.sender);
    }
    _;
  }

  /// @dev Require that the caller must be a rebalancer account.
  modifier onlyRebalancers() {
    if (!config.whitelistedRebalancers(msg.sender)) revert Unauthorized(msg.sender);
    _;
  }

  /// @notice Initialize Delta Neutral vault.
  /// @param _name Name.
  /// @param _symbol Symbol.
  /// @param _stableVault Address of stable vault.
  /// @param _assetVault Address of asset vault.
  /// @param _stableVaultWorker Address of stable worker.
  /// @param _stableVaultWorker Address of asset worker.
  /// @param _lpToken Address stable and asset token pair.
  /// @param _alpacaToken Alpaca token address.
  /// @param _priceHelper Price helper address.
  /// @param _config The address of delta neutral vault config.
  function initialize(
    string calldata _name,
    string calldata _symbol,
    address _stableVault,
    address _assetVault,
    address _stableVaultWorker,
    address _assetVaultWorker,
    address _lpToken,
    address _alpacaToken,
    IPriceHelper _priceHelper,
    IDeltaNeutralVaultConfig _config
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
    ERC20Upgradeable.__ERC20_init(_name, _symbol);

    stableVault = _stableVault;
    assetVault = _assetVault;

    stableToken = IVault(_stableVault).token();
    assetToken = IVault(_assetVault).token();
    alpacaToken = _alpacaToken;

    stableVaultWorker = _stableVaultWorker;
    assetVaultWorker = _assetVaultWorker;

    lpToken = _lpToken;

    priceHelper = _priceHelper;
    config = _config;
  }

  /// @notice initialize delta neutral vault positions.
  /// @param _minShareReceive Minimum share that _shareReceiver must receive.
  /// @param _stableTokenAmount Amount of stable token transfer to vault.
  /// @param _assetTokenAmount Amount of asset token transfer to vault.
  /// @param _data The calldata to pass along to the proxy action for more working context.
  function initPositions(
    uint256 _minShareReceive,
    uint256 _stableTokenAmount,
    uint256 _assetTokenAmount,
    bytes calldata _data
  ) external payable onlyOwner {
    if (stableVaultPosId != 0 || assetVaultPosId != 0) {
      revert PositionsAlreadyInitialized();
    }

    OPENING = true;
    stableVaultPosId = IVault(stableVault).nextPositionID();
    assetVaultPosId = IVault(assetVault).nextPositionID();

    deposit(msg.sender, _minShareReceive, _stableTokenAmount, _assetTokenAmount, _data);

    OPENING = false;

    emit LogInitializePositions(msg.sender, stableVaultPosId, assetVaultPosId);
  }

  /// @notice Get token from msg.sender
  /// @param _token token to transfer.
  /// @param _amount amount to transfer.
  function _transferTokenToVault(address _token, uint256 _amount) internal {
    if (_token == config.getWrappedNativeAddr()) {
      IWETH(config.getWrappedNativeAddr()).deposit{ value: _amount }();
    } else {
      SafeToken.safeTransferFrom(_token, msg.sender, address(this), _amount);
    }
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
    if (_token == config.getWrappedNativeAddr()) {
      SafeToken.safeTransferETH(_to, _amount);
    } else {
      SafeToken.safeTransfer(_token, _to, _amount);
    }
  }

  /// @notice Deposit to delta neutral vault.
  /// @param _shareReceiver Addresses to be receive share.
  /// @param _minShareReceive Minimum share that _shareReceiver must receive.
  /// @param _stableTokenAmount Amount of stable token transfer to vault.
  /// @param _assetTokenAmount Amount of asset token transfer to vault.
  /// @param _data The calldata to pass along to the proxy action for more working context.
  function deposit(
    address _shareReceiver,
    uint256 _minShareReceive,
    uint256 _stableTokenAmount,
    uint256 _assetTokenAmount,
    bytes calldata _data
  ) public payable onlyEOAorWhitelisted nonReentrant returns (uint256 _shares) {
    console.log("=====================deposit=====================");

    PositionInfo memory _positionInfoBefore = positionInfo();
    Outstanding memory _outstandingBefore = _outstanding();
    _outstandingBefore.nativeAmount = _outstandingBefore.nativeAmount - msg.value;

    // 1. transfer tokens from user to vault
    _transferTokenToVault(stableToken, _stableTokenAmount);
    console.log("after stableToken");
    _transferTokenToVault(assetToken, _assetTokenAmount);
    console.log("after assetToken");

    // 2. mint share for shareReceiver
    uint256 _depositValue = ((_stableTokenAmount * priceHelper.getTokenPrice(stableToken)) +
      (_assetTokenAmount * priceHelper.getTokenPrice(assetToken))) / 1e18;
    console.log("_depositValue", _depositValue);

    uint256 _shares = valueToShare(_depositValue);
    console.log("_shares", _shares);
    if (_shares < _minShareReceive) {
      revert InsufficientShareReceived(_minShareReceive, _shares);
    }

    _mint(_shareReceiver, _shares);

    {
      // 3. call execute to do more work.
      // Perform the actual work, using a new scope to avoid stack-too-deep errors.
      (uint8[] memory actions, uint256[] memory values, bytes[] memory _datas) = abi.decode(
        _data,
        (uint8[], uint256[], bytes[])
      );
      _execute(actions, values, _datas);
    }

    // 4. sanity check
    _depositHealthCheck(_depositValue, _positionInfoBefore, positionInfo());
    _outstandingCheck(_outstandingBefore, _outstanding());

    emit LogDeposit(msg.sender, _shareReceiver, _shares, _stableTokenAmount, _assetTokenAmount);
    return _shares;
  }

  /// @notice Withdraw from delta neutral vault.
  /// @param _shareAmount Amount of share to withdraw from vault.
  /// @param _minStableTokenAmount Minimum stable token shareOwner expect to receive.
  /// @param _minAssetTokenAmount Minimum asset token shareOwner expect to receive.
  /// @param _data The calldata to pass along to the proxy action for more working context.
  function withdraw(
    uint256 _shareAmount,
    uint256 _minStableTokenAmount,
    uint256 _minAssetTokenAmount,
    bytes calldata _data
  ) public onlyEOAorWhitelisted nonReentrant returns (uint256 _withdrawValue) {
    console.log("=====================withdraw=====================");
    address _shareOwner = msg.sender;
    PositionInfo memory _positionInfoBefore = positionInfo();
    Outstanding memory _outstandingBefore = _outstanding();

    uint256 _shareValue = shareToValue(_shareAmount);
    _burn(_shareOwner, _shareAmount);
    console.log("withdraw:_shareAmount", _shareAmount);
    console.log("withdraw:_shareValue", _shareValue);

    {
      (uint8[] memory actions, uint256[] memory values, bytes[] memory _datas) = abi.decode(
        _data,
        (uint8[], uint256[], bytes[])
      );
      _execute(actions, values, _datas);
    }
    console.log("=====================withdraw:end execute=====================");
    PositionInfo memory _positionInfoAfter = positionInfo();
    Outstanding memory _outstandingAfter = _outstanding();

    console.log("withdraw:after get postiion and outstanding");

    // transfer funds back to shareOwner
    uint256 _stableTokenBack = stableToken == config.getWrappedNativeAddr()
      ? _outstandingAfter.nativeAmount - _outstandingBefore.nativeAmount
      : _outstandingAfter.stableAmount - _outstandingBefore.stableAmount;
    uint256 _assetTokenBack = assetToken == config.getWrappedNativeAddr()
      ? _outstandingAfter.nativeAmount - _outstandingBefore.nativeAmount
      : _outstandingAfter.assetAmount - _outstandingBefore.assetAmount;

    if (_stableTokenBack < _minStableTokenAmount) {
      revert InsufficientTokenReceived(stableToken, _minStableTokenAmount, _stableTokenBack);
    }
    if (_assetTokenBack < _minAssetTokenAmount) {
      revert InsufficientTokenReceived(assetToken, _minAssetTokenAmount, _assetTokenBack);
    }

    console.log("withdraw:_stableTokenBack", _stableTokenBack);
    console.log("withdraw:_assetTokenBack", _assetTokenBack);

    _transferTokenToShareOwner(_shareOwner, stableToken, _stableTokenBack);
    _transferTokenToShareOwner(_shareOwner, assetToken, _assetTokenBack);

    uint256 _withdrawValue;
    {
      uint256 _stableWithdrawValue = _stableTokenBack * priceHelper.getTokenPrice(stableToken);
      uint256 _assetWithdrawValue = _assetTokenBack * priceHelper.getTokenPrice(assetToken);
      _withdrawValue = (_stableWithdrawValue + _assetWithdrawValue) / 1e18;
    }

    // sanity check
    _withdrawHealthCheck(_withdrawValue, _positionInfoBefore, _positionInfoAfter);
    _outstandingCheck(_outstandingBefore, _outstandingAfter);

    emit LogWithdraw(_shareOwner, _stableTokenBack, _assetTokenBack);
    return _withdrawValue;
  }

  function rebalance(
    uint8[] memory _actions,
    uint256[] memory _values,
    bytes[] memory _datas
  ) external onlyRebalancers {
    console.log("===========rebalance===========");

    PositionInfo memory _positionInfoBefore = positionInfo();
    Outstanding memory _outstandingBefore = _outstanding();
    uint256 _stablePositionValue = _positionInfoBefore.stablePositionEquity +
      _positionInfoBefore.stablePositionDebtValue;
    uint256 _assetPositionValue = _positionInfoBefore.assetPositionEquity + _positionInfoBefore.assetPositionDebtValue;
    uint256 _equityBefore = _positionInfoBefore.stablePositionEquity + _positionInfoBefore.assetPositionEquity;
    uint256 _rebalanceFactor = config.rebalanceFactor();

    if (
      _stablePositionValue * _rebalanceFactor >= _positionInfoBefore.stablePositionDebtValue * 10000 &&
      _assetPositionValue * _rebalanceFactor >= _positionInfoBefore.assetPositionDebtValue * 10000
    ) {
      revert PositionsIsHealthy();
    }

    // execute rebalance
    {
      _execute(_actions, _values, _datas);
    }

    // sanity check
    // check if position in a healthy state after rebalancing
    uint256 _equityAfter = totalEquityValue();
    if (!Math.almostEqual(_equityAfter, _equityBefore, config.positionValueTolerance())) {
      revert UnsafePositionValue();
    }
    _outstandingCheck(_outstandingBefore, _outstanding());

    emit LogRebalance(_equityBefore, _equityAfter);
  }

  /// @notice check if position equity and debt are healthy after deposit.
  /// @param _depositValue deposit value in usd.
  /// @param _positionInfoBefore position equity and debt before deposit.
  /// @param _positionInfoAfter position equity and debt after deposit.
  function _depositHealthCheck(
    uint256 _depositValue,
    PositionInfo memory _positionInfoBefore,
    PositionInfo memory _positionInfoAfter
  ) internal {
    console.log("Deltavault:_depositHealthCheck");

    uint256 _toleranceBps = config.positionValueTolerance();
    console.log(
      "Deltavault:_depositHealthCheck:stable",
      !Math.almostEqual(
        _positionInfoAfter.stablePositionEquity - _positionInfoBefore.stablePositionEquity,
        (_depositValue) / 4,
        _toleranceBps
      )
    );
    console.log(
      "Deltavault:_depositHealthCheck:asset",
      !Math.almostEqual(
        _positionInfoAfter.assetPositionEquity - _positionInfoBefore.assetPositionEquity,
        (_depositValue * 3) / 4,
        _toleranceBps
      )
    );
    console.log("Deltavault:_depositHealthCheck:_positionInfoBefore._depositValue", _depositValue);

    console.log(
      "Deltavault:_depositHealthCheck:_positionInfoBefore.stablePositionEquity",
      _positionInfoBefore.stablePositionEquity
    );
    console.log(
      "Deltavault:_depositHealthCheck:_positionInfoAfter.stablePositionEquity",
      _positionInfoAfter.stablePositionEquity
    );
    console.log(
      "Deltavault:_depositHealthCheck:_positionInfoAfter.stablePositionDebtValue",
      _positionInfoAfter.stablePositionDebtValue
    );
    console.log(
      "Deltavault:_depositHealthCheck: left",
      _positionInfoAfter.stablePositionEquity - _positionInfoBefore.stablePositionEquity
    );
    console.log("Deltavault:_depositHealthCheck: right", (_depositValue) / 4);

    console.log(
      "Deltavault:_depositHealthCheck:_positionInfoBefore.assetPositionEquity",
      _positionInfoBefore.assetPositionEquity
    );
    console.log(
      "Deltavault:_depositHealthCheck:_positionInfoAfter.assetPositionEquity",
      _positionInfoAfter.assetPositionEquity
    );
    console.log(
      "Deltavault:_depositHealthCheck:_positionInfoAfter.assetPositionDebtValue",
      _positionInfoAfter.assetPositionDebtValue
    );
    console.log(
      "Deltavault:_depositHealthCheck: left",
      _positionInfoAfter.assetPositionEquity - _positionInfoBefore.assetPositionEquity
    );
    console.log("Deltavault:_depositHealthCheck: right", (_depositValue * 3) / 4);

    // 1. check position value
    if (
      !Math.almostEqual(
        _positionInfoAfter.stablePositionEquity - _positionInfoBefore.stablePositionEquity,
        (_depositValue) / 4,
        _toleranceBps
      ) ||
      !Math.almostEqual(
        _positionInfoAfter.assetPositionEquity - _positionInfoBefore.assetPositionEquity,
        (_depositValue * 3) / 4,
        _toleranceBps
      )
    ) {
      revert UnsafePositionEquity();
    }

    console.log("Deltavault:_depositHealthCheck:before check debt value");
    console.log("Deltavault:_depositHealthCheck:_depositValue", _depositValue);
    console.log(
      "Deltavault:_depositHealthCheck:stableDebt: left",
      _positionInfoAfter.stablePositionDebtValue - _positionInfoBefore.stablePositionDebtValue
    );
    console.log("Deltavault:_depositHealthCheck:stableDebt: right", (_depositValue * 2) / 4);
    console.log(
      "Deltavault:_depositHealthCheck:assetDebt: _positionInfoAfter.stablePositionDebtValue",
      _positionInfoAfter.stablePositionDebtValue
    );
    console.log(
      "Deltavault:_depositHealthCheck:assetDebt: _positionInfoBefore.stablePositionDebtValue",
      _positionInfoBefore.stablePositionDebtValue
    );

    console.log(
      "Deltavault:_depositHealthCheck:assetDebt: left",
      _positionInfoAfter.assetPositionDebtValue - _positionInfoBefore.assetPositionDebtValue
    );
    console.log("Deltavault:_depositHealthCheck:assetDebt: right", (_depositValue * 6) / 4);
    console.log(
      "Deltavault:_depositHealthCheck:assetDebt: _positionInfoAfter.assetPositionDebtValue",
      _positionInfoAfter.assetPositionDebtValue
    );
    console.log(
      "Deltavault:_depositHealthCheck:assetDebt: _positionInfoBefore.assetPositionDebtValue",
      _positionInfoBefore.assetPositionDebtValue
    );

    // 2. check Debt value
    if (
      !Math.almostEqual(
        _positionInfoAfter.stablePositionDebtValue - _positionInfoBefore.stablePositionDebtValue,
        (_depositValue * 2) / 4,
        _toleranceBps
      ) ||
      !Math.almostEqual(
        _positionInfoAfter.assetPositionDebtValue - _positionInfoBefore.assetPositionDebtValue,
        (_depositValue * 6) / 4,
        _tolerance
      )
    ) {
      revert UnsafeDebtValue();
    }
  }

  /// @notice Check if position equity and debt ratio are healthy after withdraw.
  /// @param _withdrawValue Withdraw value in usd.
  /// @param _positionInfoBefore Position equity and debt before deposit.
  /// @param _positionInfoAfter Position equity and debt after deposit.
  function _withdrawHealthCheck(
    uint256 _withdrawValue,
    PositionInfo memory _positionInfoBefore,
    PositionInfo memory _positionInfoAfter
  ) internal {
    console.log("_withdrawHealthCheck");

    // equity value check
    uint256 _totalEquityBefore = _positionInfoBefore.stablePositionEquity + _positionInfoBefore.assetPositionEquity;
    console.log("_withdrawHealthCheck:_withdrawValue", _withdrawValue);
    console.log("_withdrawHealthCheck:_totalEquityBefore", _totalEquityBefore);
    console.log(
      "_withdrawHealthCheck:_positionInfoBefore.stablePositionEquity ",
      _positionInfoBefore.stablePositionEquity
    );
    console.log(
      "_withdrawHealthCheck:_positionInfoAfter.stablePositionEquity ",
      _positionInfoAfter.stablePositionEquity
    );
    console.log(
      "_withdrawHealthCheck: left ",
      _positionInfoBefore.stablePositionEquity - _positionInfoAfter.stablePositionEquity
    );
    console.log(
      "_withdrawHealthCheck: right ",
      (_withdrawValue * _positionInfoBefore.stablePositionEquity) / _totalEquityBefore
    );

    if (
      _positionInfoBefore.stablePositionEquity - _positionInfoAfter.stablePositionEquity >
      (_withdrawValue * _positionInfoBefore.stablePositionEquity) / _totalEquityBefore
    ) {
      revert UnsafePositionValue();
    }
    console.log("_withdrawHealthCheck");
    console.log(
      "_withdrawHealthCheck:_positionInfoBefore.assetPositionEquity ",
      _positionInfoBefore.assetPositionEquity
    );
    console.log("_withdrawHealthCheck:_positionInfoAfter.assetPositionEquity ", _positionInfoAfter.assetPositionEquity);
    console.log(
      "_withdrawHealthCheck: left ",
      _positionInfoBefore.assetPositionEquity - _positionInfoAfter.assetPositionEquity
    );
    console.log(
      "_withdrawHealthCheck: right ",
      (_withdrawValue * _positionInfoBefore.assetPositionEquity) / _totalEquityBefore
    );
    if (
      _positionInfoBefore.assetPositionEquity - _positionInfoAfter.assetPositionEquity >
      (_withdrawValue * _positionInfoBefore.assetPositionEquity) / _totalEquityBefore
    ) {
      revert UnsafePositionValue();
    }

    // debt ratio check
    uint256 _totalDebtBefore = _positionInfoBefore.stablePositionDebtValue + _positionInfoBefore.assetPositionDebtValue;
    uint256 _totalPositionValueBefore = _positionInfoBefore.stablePositionEquity +
      _positionInfoBefore.assetPositionEquity +
      _totalDebtBefore;
    uint256 _totalDebtAfter = _positionInfoAfter.stablePositionDebtValue + _positionInfoAfter.assetPositionDebtValue;
    uint256 _totalPositionValueAfter = _positionInfoAfter.stablePositionEquity +
      _positionInfoAfter.assetPositionEquity +
      _totalDebtAfter;
    console.log("_withdrawHealthCheck:_totalDebtBefore", _totalDebtBefore);
    console.log("_withdrawHealthCheck:_totalPositionValueBefore", _totalPositionValueBefore);
    console.log("_withdrawHealthCheck:_totalDebtAfter", _totalDebtAfter);
    console.log("_withdrawHealthCheck:_totalPositionValueAfter", _totalPositionValueAfter);
    uint256 _toleranceBps = 100;
    if (
      !Math.almostEqual(
        _totalPositionValueBefore / _totalDebtBefore,
        _totalPositionValueAfter / _totalDebtAfter,
        _toleranceBps
      )
    ) {
      revert UnsafeDebtRatio();
    }
  }

  /// @notice Check tokens' balance.
  /// @param _outstandingBefore Tokens' balance before.
  /// @param _outstandingAfter Tokens' balance after.
  function _outstandingCheck(Outstanding memory _outstandingBefore, Outstanding memory _outstandingAfter) internal {
    if (_outstandingAfter.stableAmount < _outstandingBefore.stableAmount) {
      revert UnsafeOutstanding(stableToken, _outstandingBefore.stableAmount, _outstandingAfter.stableAmount);
    }
    if (_outstandingAfter.assetAmount < _outstandingBefore.assetAmount) {
      revert UnsafeOutstanding(assetToken, _outstandingBefore.assetAmount, _outstandingAfter.assetAmount);
    }
    if (_outstandingAfter.nativeAmount < _outstandingBefore.nativeAmount) {
      revert UnsafeOutstanding(address(0), _outstandingBefore.nativeAmount, _outstandingAfter.nativeAmount);
    }
  }

  /// @notice Return stable token, asset token and native token balance.
  function _outstanding() internal view returns (Outstanding memory) {
    return
      Outstanding({
        stableAmount: stableToken.myBalance(),
        assetAmount: assetToken.myBalance(),
        nativeAmount: address(this).balance
      });
  }

  /// @notice Return equity and debt value in usd of stable and asset positions.
  function positionInfo() public view returns (PositionInfo memory) {
    return
      PositionInfo({
        stablePositionEquity: _positionEquity(stableVault, stableVaultWorker, stableVaultPosId),
        stablePositionDebtValue: _positionDebtValue(stableVault, stableVaultPosId),
        assetPositionEquity: _positionEquity(assetVault, assetVaultWorker, assetVaultPosId),
        assetPositionDebtValue: _positionDebtValue(assetVault, assetVaultPosId)
      });
  }

  /// @notice Return the value of share from the given share amount.
  /// @param _shareAmount Amount of share.
  function shareToValue(uint256 _shareAmount) public view returns (uint256) {
    uint256 _shareSupply = totalSupply();
    if (_shareSupply == 0) return _shareAmount;
    return (_shareAmount * totalEquityValue()) / _shareSupply;
  }

  /// @notice Return the amount of share from the given value.
  /// @param _value value in usd.
  function valueToShare(uint256 _value) public view returns (uint256) {
    uint256 _shareSupply = totalSupply();
    if (_shareSupply == 0) return _value;
    return (_value * _shareSupply) / totalEquityValue();
  }

  // should
  /// @notice Return equity value of delta neutral position.
  function totalEquityValue() public view returns (uint256) {
    uint256 _positionValue = _positionValue(stableVaultWorker) + _positionValue(assetVaultWorker);
    uint256 _debtValue = _positionDebtValue(stableVault, stableVaultPosId) +
      _positionDebtValue(assetVault, assetVaultPosId);
    if (_positionValue < _debtValue) {
      return 0;
    }
    return _positionValue - _debtValue;
  }

  function _positionDebtValue(address _vault, uint256 _posId) internal view returns (uint256) {
    (, , uint256 _positionDebtShare) = IVault(_vault).positions(_posId);
    address _token = IVault(_vault).token();
    uint256 _vaultDebtShare = IVault(_vault).vaultDebtShare();
    if (_vaultDebtShare == 0) {
      return (_positionDebtShare * priceHelper.getTokenPrice(_token)) / 1e18;
    }
    uint256 _vaultDebtValue = IVault(_vault).vaultDebtVal() + IVault(_vault).pendingInterest(0);
    uint256 _debtAmount = (_positionDebtShare * _vaultDebtValue) / _vaultDebtShare;
    return (_debtAmount * priceHelper.getTokenPrice(_token)) / 1e18;
  }

  function _positionValue(address _worker) internal view returns (uint256) {
    return priceHelper.lpToDollar(IWorker02(_worker).totalLpBalance(), lpToken);
  }

  function _positionEquity(
    address _vault,
    address _worker,
    uint256 _posId
  ) internal view returns (uint256) {
    uint256 _positionValue = _positionValue(_worker);
    uint256 _positionDebtValue = _positionDebtValue(_vault, _posId);
    if (_positionValue < _positionDebtValue) {
      return 0;
    }
    return _positionValue - _positionDebtValue;
  }

  /// @notice Proxy function for calling internal action.
  function _execute(
    uint8[] memory _actions,
    uint256[] memory _values,
    bytes[] memory _datas
  ) internal {
    for (uint256 i = 0; i < _actions.length; i++) {
      uint8 _action = _actions[i];
      if (_action == ACTION_WORK) {
        _doWork(_datas[i]);
      }
      if (_action == ACTION_WRAP) {
        IWETH(config.getWrappedNativeAddr()).deposit{ value: _values[i] }();
      }
      if (_action == ACTION_CONVERT_ASSET) {
        _convertAsset(_datas[i], _values[i]);
      }
    }
  }

  /// @notice interact with delta neutral position.
  /// @param _data The calldata to pass along to the vault for more working context.
  function _doWork(bytes memory _data) internal {
    console.log("_doWork");
    if (stableVaultPosId == 0 || assetVaultPosId == 0) {
      revert PositionsNotInitialized();
    }

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

    console.log("_vault", _vault);
    console.log("_posId", _posId);
    console.log("_worker", _worker);
    console.log("_principalAmount", _principalAmount);
    console.log("_borrowAmount", _borrowAmount);
    console.log("_maxReturn", _maxReturn);
    console.log("stable token balance", stableToken.myBalance());
    console.log("assetToken token balance", assetToken.myBalance());
    console.log("BNB balance", address(this).balance);
    if (
      !OPENING &&
      !((_vault == stableVault && _posId == stableVaultPosId) || (_vault == assetVault && _posId == assetVaultPosId))
    ) {
      revert InvalidPositions({ _vault: _vault, _positionId: _posId });
    }

    // 2. approve vault
    stableToken.safeApprove(_vault, type(uint256).max);
    assetToken.safeApprove(_vault, type(uint256).max);

    // 3. Call work to altering Vault position
    console.log("call vault.work()");
    IVault(_vault).work(_posId, _worker, _principalAmount, _borrowAmount, _maxReturn, _workData);
    console.log("stable token balance after work", stableToken.myBalance());
    console.log("assetToken token balance afterwork", assetToken.myBalance());
    console.log("assetToken token balance afterwork", assetToken.myBalance());
    console.log("BNB balance afterwork", address(this).balance);
    // 4. Reset approve to 0
    stableToken.safeApprove(_vault, 0);
    assetToken.safeApprove(_vault, 0);
  }

  /// @notice Claim Alpaca reward of stable vault and asset vault
  function claim() external returns (uint256, uint256) {
    uint256 rewardStableVault = _claim(IVault(stableVault).fairLaunchPoolId());
    uint256 rewardAssetVault = _claim(IVault(assetVault).fairLaunchPoolId());
  }

  /// @dev Claim Alpaca reward for internal
  function _claim(uint256 _poolId) internal returns (uint256) {
    uint256 alpacaBefore = alpacaToken.myBalance();
    IFairLaunch(config.fairLaunchAddr()).harvest(_poolId);
    uint256 alpacaAfter = alpacaToken.myBalance();
    return alpacaAfter - alpacaBefore;
  }

  /// @notice withdraw alpaca to receiver address
  function withdrawAlpaca(address _to, uint256 amount) external onlyOwner {
    alpacaToken.safeTransfer(_to, amount);
  }

  /// @notice convert Asset to asset
  /// @dev convert asset by type
  function _convertAsset(bytes memory _data, uint256 _msgValue) internal {
    console.log("convertAsset");
    (
      uint256 _swapType,
      uint256 _amount,
      uint256 _amountOut,
      address[] calldata _path,
      address _to,
      uint256 _deadline,

    ) = abi.decode(_data, (address, uint256, uint256, address, address, uint256));
    console.log("_swapType", _swapType);
    console.log("_amount", _amount);
    console.log("_amountOut", _amountOut);
    console.log("_path", _path);
    console.log("_to", _to);
    console.log("_deadline", _deadline);
    address routerAddress = config.routerAddr();

    if (swapType == CONVERT_EXACT_TOKEN_TO_NATIVE) {
      _validatePath(path);
      IRouter(routerAddress).swapExactTokensForETH(amountIn, amountOut, path, to, deadline);
    } else if (swapType == CONVERT_EXACT_TOKEN_TO_TOKEN) {
      _validatePath(path);
      IRouter(routerAddress).swapExactTokensForTokens(amountIn, amountOut, path, to, deadline);
    } else if (swapType == CONVERT_TOKEN_TO_EXACT_TOKEN) {
      _validatePath(path);
      IRouter(routerAddress).swapTokensForExactTokens(amountIn, amountOut, path, to, deadline);
    } else {
      revert InvalidConvertData();
    }
  }

  function _validatePath(address[] tokenAddresses) internal returns (bool) {
    for (uint256 _idx = 0; _idx < tokenAddresses.length; _idx++) {
      if (
        tokenAddress != stableToken ||
        tokenAddress != assetToken ||
        tokenAddress != alpacaToken ||
        tokenAddress != config.getWrappedNativeAddr()
      ) {
        return false;
      }
    }
    return true;
  }

  /// @dev Fallback function to accept BNB.
  receive() external payable {}
}
