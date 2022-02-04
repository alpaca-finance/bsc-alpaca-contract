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

import "./interfaces/IPriceHelper.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IWorker02.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/IWNativeRelayer.sol";
import "./interfaces/IDeltaNeutralVaultConfig.sol";
import "./interfaces/IFairLaunch.sol";
import "./interfaces/ISwapRouter.sol";

import "../utils/SafeToken.sol";
import "../utils/FixedPointMathLib.sol";
import "../utils/Math.sol";

contract DeltaNeutralVault is ERC20Upgradeable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
  /// @notice Libraries
  using FixedPointMathLib for uint256;

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
  error InvalidConvertTokenSetting();
  error UnTrustedPrice();
  error PositionValueExceedLimit();

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
  uint8 private constant ACTION_WRAP = 2;
  uint8 private constant ACTION_CONVERT_ASSET = 3;

  /// @dev constant subAction of CONVERT_ASSET
  uint8 private constant CONVERT_EXACT_TOKEN_TO_NATIVE = 1;
  uint8 private constant CONVERT_EXACT_NATIVE_TO_TOKEN = 2;
  uint8 private constant CONVERT_EXACT_TOKEN_TO_TOKEN = 3;
  uint8 private constant CONVERT_TOKEN_TO_EXACT_TOKEN = 4;
  uint256 private constant MAX_BPS = 10000;

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

  /// @dev Collect management fee before interactions
  modifier collectFee() {
    _mintFee();
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

    lastFeeCollected = 0;
  }

  /// @notice initialize delta neutral vault positions.
  /// @param _stableTokenAmount Amount of stable token transfer to vault.
  /// @param _assetTokenAmount Amount of asset token transfer to vault.
  /// @param _minShareReceive Minimum share that _shareReceiver must receive.
  /// @param _data The calldata to pass along to the proxy action for more working context.
  function initPositions(
    uint256 _stableTokenAmount,
    uint256 _assetTokenAmount,
    uint256 _minShareReceive,
    bytes calldata _data
  ) external payable onlyOwner {
    if (stableVaultPosId != 0 || assetVaultPosId != 0) {
      revert PositionsAlreadyInitialized();
    }

    OPENING = true;
    stableVaultPosId = IVault(stableVault).nextPositionID();
    assetVaultPosId = IVault(assetVault).nextPositionID();

    deposit(_stableTokenAmount, _assetTokenAmount, msg.sender, _minShareReceive, _data);

    OPENING = false;

    emit LogInitializePositions(msg.sender, stableVaultPosId, assetVaultPosId);
  }

  /// @notice Get token from msg.sender.
  /// @param _token token to transfer.
  /// @param _amount amount to transfer.
  function _transferTokenToVault(address _token, uint256 _amount) internal {
    if (_token == config.getWrappedNativeAddr()) {
      IWETH(config.getWrappedNativeAddr()).deposit{ value: _amount }();
    } else {
      SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(_token), msg.sender, address(this), _amount);
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
      SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(_token), _to, _amount);
    }
  }

  /// @notice minting shares as a form of management fee to teasury account
  function _mintFee() internal {
    _mint(config.getTreasuryAddr(), pendingManagementFee());
    lastFeeCollected = block.timestamp;
  }

  /// @notice Return amount of share pending for minting as a form of management fee
  function pendingManagementFee() public view returns (uint256) {
    uint256 _secondsFromLastCollection = block.timestamp - lastFeeCollected;
    return (totalSupply() * config.mangementFeeBps() * _secondsFromLastCollection) / (MAX_BPS * 365 days);
  }

  /// @notice Deposit to delta neutral vault.
  /// @param _stableTokenAmount Amount of stable token transfer to vault.
  /// @param _assetTokenAmount Amount of asset token transfer to vault.
  /// @param _shareReceiver Addresses to be receive share.
  /// @param _minShareReceive Minimum share that _shareReceiver must receive.
  /// @param _data The calldata to pass along to the proxy action for more working context.
  function deposit(
    uint256 _stableTokenAmount,
    uint256 _assetTokenAmount,
    address _shareReceiver,
    uint256 _minShareReceive,
    bytes calldata _data
  ) public payable onlyEOAorWhitelisted collectFee nonReentrant returns (uint256) {
    PositionInfo memory _positionInfoBefore = positionInfo();
    Outstanding memory _outstandingBefore = _outstanding();
    _outstandingBefore.nativeAmount = _outstandingBefore.nativeAmount - msg.value;

    // 1. transfer tokens from user to vault
    _transferTokenToVault(stableToken, _stableTokenAmount);
    _transferTokenToVault(assetToken, _assetTokenAmount);

    // 2. mint share for shareReceiver
    // TODO: discuss round up or down
    uint256 _depositValue = _stableTokenAmount.mulWadDown(_getTokenPrice(stableToken)) +
      _assetTokenAmount.mulWadDown(_getTokenPrice(assetToken));

    uint256 _mintShares = valueToShare(_depositValue);
    uint256 _sharesToUser = ((MAX_BPS - config.depositFeeBps()) * _mintShares) / MAX_BPS;
    if (_sharesToUser < _minShareReceive) {
      revert InsufficientShareReceived(_minShareReceive, _sharesToUser);
    }
    _mint(_shareReceiver, _sharesToUser);
    _mint(config.getTreasuryAddr(), _mintShares - _sharesToUser);

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

    emit LogDeposit(msg.sender, _shareReceiver, _sharesToUser, _stableTokenAmount, _assetTokenAmount);
    return _sharesToUser;
  }

  /// @notice Withdraw from delta neutral vault.
  /// @param _minStableTokenAmount Minimum stable token shareOwner expect to receive.
  /// @param _minAssetTokenAmount Minimum asset token shareOwner expect to receive.
  /// @param _shareAmount Amount of share to withdraw from vault.
  /// @param _data The calldata to pass along to the proxy action for more working context.
  function withdraw(
    uint256 _minStableTokenAmount,
    uint256 _minAssetTokenAmount,
    uint256 _shareAmount,
    bytes calldata _data
  ) public onlyEOAorWhitelisted collectFee nonReentrant returns (uint256 _withdrawValue) {
    address _shareOwner = msg.sender;
    PositionInfo memory _positionInfoBefore = positionInfo();
    Outstanding memory _outstandingBefore = _outstanding();

    uint256 _withdrawalFeeBps = config.feeExemptedCallers(msg.sender) ? 0 : config.withdrawalFeeBps();
    uint256 _shareToWithdraw = ((MAX_BPS - _withdrawalFeeBps) * _shareAmount) / MAX_BPS;
    // burn shares from share owner
    _burn(msg.sender, _shareAmount);
    // mint shares equal to withdrawal fee to treasury.
    _mint(config.getTreasuryAddr(), _shareAmount - _shareToWithdraw);

    {
      (uint8[] memory actions, uint256[] memory values, bytes[] memory _datas) = abi.decode(
        _data,
        (uint8[], uint256[], bytes[])
      );
      _execute(actions, values, _datas);
    }

    PositionInfo memory _positionInfoAfter = positionInfo();
    Outstanding memory _outstandingAfter = _outstanding();

    // transfer funds back to shareOwner
    uint256 _stableTokenBack = _outstandingAfter.stableAmount - _outstandingBefore.stableAmount;
    uint256 _assetTokenBack = assetToken == config.getWrappedNativeAddr()
      ? _outstandingAfter.nativeAmount - _outstandingBefore.nativeAmount
      : _outstandingAfter.assetAmount - _outstandingBefore.assetAmount;

    if (_stableTokenBack < _minStableTokenAmount) {
      revert InsufficientTokenReceived(stableToken, _minStableTokenAmount, _stableTokenBack);
    }
    if (_assetTokenBack < _minAssetTokenAmount) {
      revert InsufficientTokenReceived(assetToken, _minAssetTokenAmount, _assetTokenBack);
    }

    _transferTokenToShareOwner(msg.sender, stableToken, _stableTokenBack);
    _transferTokenToShareOwner(msg.sender, assetToken, _assetTokenBack);

    uint256 _withdrawValue;
    {
      // TODO: round up or down
      uint256 _stableWithdrawValue = _stableTokenBack.mulWadDown(_getTokenPrice(stableToken));
      uint256 _assetWithdrawValue = _assetTokenBack.mulWadDown(_getTokenPrice(assetToken));
      _withdrawValue = _stableWithdrawValue + _assetWithdrawValue;
    }

    // sanity check
    _withdrawHealthCheck(_withdrawValue, _positionInfoBefore, _positionInfoAfter);
    _outstandingCheck(_outstandingBefore, _outstandingAfter);

    emit LogWithdraw(msg.sender, _stableTokenBack, _assetTokenBack);
    return _withdrawValue;
  }

  function rebalance(
    uint8[] memory _actions,
    uint256[] memory _values,
    bytes[] memory _datas
  ) external onlyRebalancers collectFee {
    PositionInfo memory _positionInfoBefore = positionInfo();
    Outstanding memory _outstandingBefore = _outstanding();
    uint256 _stablePositionValue = _positionInfoBefore.stablePositionEquity +
      _positionInfoBefore.stablePositionDebtValue;
    uint256 _assetPositionValue = _positionInfoBefore.assetPositionEquity + _positionInfoBefore.assetPositionDebtValue;
    uint256 _equityBefore = _positionInfoBefore.stablePositionEquity + _positionInfoBefore.assetPositionEquity;
    uint256 _rebalanceFactor = config.rebalanceFactor(); // bps

    if (
      _stablePositionValue * _rebalanceFactor >= _positionInfoBefore.stablePositionDebtValue * MAX_BPS &&
      _assetPositionValue * _rebalanceFactor >= _positionInfoBefore.assetPositionDebtValue * MAX_BPS
    ) {
      revert PositionsIsHealthy();
    }

    // 2. execute rebalance
    {
      _execute(_actions, _values, _datas);
    }

    // 3. sanity check
    // check if position in a healthy state after rebalancing
    uint256 _equityAfter = totalEquityValue();
    if (!Math.almostEqual(_equityAfter, _equityBefore, config.positionValueTolerance())) {
      revert UnsafePositionValue();
    }
    _outstandingCheck(_outstandingBefore, _outstanding());

    emit LogRebalance(_equityBefore, _equityAfter);
  }

  /// @notice check if position equity and debt are healthy after deposit. LEVERAGE_LEVEL must be >= 3
  /// @param _depositValue deposit value in usd.
  /// @param _positionInfoBefore position equity and debt before deposit.
  /// @param _positionInfoAfter position equity and debt after deposit.
  function _depositHealthCheck(
    uint256 _depositValue,
    PositionInfo memory _positionInfoBefore,
    PositionInfo memory _positionInfoAfter
  ) internal {
    uint256 _toleranceBps = config.positionValueTolerance();
    uint8 _leverageLevel = config.leverageLevel();

    uint256 _positionValueAfter = _positionInfoAfter.stablePositionEquity +
      _positionInfoAfter.stablePositionDebtValue +
      _positionInfoAfter.assetPositionEquity +
      _positionInfoAfter.assetPositionDebtValue;

    // 1. check if vault accept new total position value
    if (!config.isVaultSizeAcceptable(_positionValueAfter)) {
      revert PositionValueExceedLimit();
    }

    // 2. check position value
    // The equity allocation of long side should be equal to _depositValue * (_leverageLevel - 2) / ((2*_leverageLevel) - 2)
    uint256 _expectedStableEqChange = (_depositValue * (_leverageLevel - 2)) / ((2 * _leverageLevel) - 2);
    // The equity allocation of short side should be equal to _depositValue * _leverageLevel / ((2*_leverageLevel) - 2)
    uint256 _expectedAssetEqChange = (_depositValue * _leverageLevel) / ((2 * _leverageLevel) - 2);

    uint256 _actualStableEqChange = _positionInfoAfter.stablePositionEquity - _positionInfoBefore.stablePositionEquity;
    uint256 _actualAssetEqChange = _positionInfoAfter.assetPositionEquity - _positionInfoBefore.assetPositionEquity;
    if (
      !Math.almostEqual(_actualStableEqChange, _expectedStableEqChange, _toleranceBps) ||
      !Math.almostEqual(_actualAssetEqChange, _expectedAssetEqChange, _toleranceBps)
    ) {
      revert UnsafePositionEquity();
    }

    // 3. check Debt value
    // The debt allocation of long side should be equal to _expectedStableEqChange * (_leverageLevel - 1)
    uint256 _expectedStableDebtChange = (_expectedStableEqChange * (_leverageLevel - 1));
    // The debt allocation of short side should be equal to _expectedAssetEqChange * (_leverageLevel - 1)
    uint256 _expectedAssetDebtChange = (_expectedAssetEqChange * (_leverageLevel - 1));

    uint256 _actualStableDebtChange = _positionInfoAfter.stablePositionDebtValue -
      _positionInfoBefore.stablePositionDebtValue;
    uint256 _actualAssetDebtChange = _positionInfoAfter.assetPositionDebtValue -
      _positionInfoBefore.assetPositionDebtValue;

    if (
      !Math.almostEqual(_actualStableDebtChange, _expectedStableDebtChange, _toleranceBps) ||
      !Math.almostEqual(_actualAssetDebtChange, _expectedAssetDebtChange, _toleranceBps)
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
  ) internal view {
    uint256 _toleranceBps = config.positionValueTolerance();
    // 1. equity value check
    uint256 _totalEquityBefore = _positionInfoBefore.stablePositionEquity + _positionInfoBefore.assetPositionEquity;
    uint256 _stableExpectedWithdrawValue = (_withdrawValue * _positionInfoBefore.stablePositionEquity) /
      _totalEquityBefore;
    uint256 _stableActualWithdrawValue = _positionInfoBefore.stablePositionEquity -
      _positionInfoAfter.stablePositionEquity;

    if (!Math.almostEqual(_stableActualWithdrawValue, _stableExpectedWithdrawValue, _toleranceBps)) {
      revert UnsafePositionValue();
    }
    uint256 _assetExpectedWithdrawValue = (_withdrawValue * _positionInfoBefore.assetPositionEquity) /
      _totalEquityBefore;
    uint256 _assetActualWithdrawValue = _positionInfoBefore.assetPositionEquity -
      _positionInfoAfter.assetPositionEquity;
    if (!Math.almostEqual(_assetActualWithdrawValue, _assetExpectedWithdrawValue, _toleranceBps)) {
      revert UnsafePositionValue();
    }

    // 2. debt ratio check
    uint256 _totalDebtBefore = _positionInfoBefore.stablePositionDebtValue + _positionInfoBefore.assetPositionDebtValue;
    uint256 _totalPositionValueBefore = _positionInfoBefore.stablePositionEquity +
      _positionInfoBefore.assetPositionEquity +
      _totalDebtBefore;
    uint256 _totalDebtAfter = _positionInfoAfter.stablePositionDebtValue + _positionInfoAfter.assetPositionDebtValue;
    uint256 _totalPositionValueAfter = _positionInfoAfter.stablePositionEquity +
      _positionInfoAfter.assetPositionEquity +
      _totalDebtAfter;
    if (
      !Math.almostEqual(
        _totalPositionValueBefore * _totalDebtAfter,
        _totalPositionValueAfter * _totalDebtBefore,
        _toleranceBps
      )
    ) {
      revert UnsafeDebtRatio();
    }
  }

  /// @notice Check tokens' balance.
  /// @param _outstandingBefore Tokens' balance before.
  /// @param _outstandingAfter Tokens' balance after.
  function _outstandingCheck(Outstanding memory _outstandingBefore, Outstanding memory _outstandingAfter)
    internal
    view
  {
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
        stableAmount: IERC20Upgradeable(stableToken).balanceOf(address(this)),
        assetAmount: IERC20Upgradeable(assetToken).balanceOf(address(this)),
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
    // From internal call + pendingManagementFee should be 0 as it was collected
    // at the beginning of the external contract call
    // For external call, to calculate shareToValue, pending fee shall be accounted
    uint256 _shareSupply = totalSupply() + pendingManagementFee();
    if (_shareSupply == 0) return _shareAmount;
    return (_shareAmount * totalEquityValue()) / _shareSupply;
  }

  /// @notice Return the amount of share from the given value.
  /// @param _value value in usd.
  function valueToShare(uint256 _value) public view returns (uint256) {
    uint256 _shareSupply = totalSupply() + pendingManagementFee();
    if (_shareSupply == 0) return _value;
    return (_value * _shareSupply) / totalEquityValue();
  }

  /// @notice Return equity value of delta neutral position.
  function totalEquityValue() public view returns (uint256) {
    uint256 _totalPositionValue = _positionValue(stableVaultWorker) + _positionValue(assetVaultWorker);
    uint256 _totalDebtValue = _positionDebtValue(stableVault, stableVaultPosId) +
      _positionDebtValue(assetVault, assetVaultPosId);
    if (_totalPositionValue < _totalDebtValue) {
      return 0;
    }
    return _totalPositionValue - _totalDebtValue;
  }

  function _positionDebtValue(address _vault, uint256 _posId) internal view returns (uint256) {
    (, , uint256 _positionDebtShare) = IVault(_vault).positions(_posId);
    address _token = IVault(_vault).token();
    uint256 _vaultDebtShare = IVault(_vault).vaultDebtShare();
    if (_vaultDebtShare == 0) {
      // TODO: round up or down
      return _positionDebtShare.mulWadDown(_getTokenPrice(_token));
    }
    uint256 _vaultDebtValue = IVault(_vault).vaultDebtVal() + IVault(_vault).pendingInterest(0);
    uint256 _debtAmount = (_positionDebtShare * _vaultDebtValue) / _vaultDebtShare;
    // TODO: round up or down
    return _debtAmount.mulWadDown(_getTokenPrice(_token));
  }

  function _positionValue(address _worker) internal view returns (uint256) {
    (uint256 _lpValue, uint256 _lastUpdated) = priceHelper.lpToDollar(IWorker02(_worker).totalLpBalance(), lpToken);
    if (block.timestamp - _lastUpdated > 1800) revert UnTrustedPrice();
    return _lpValue;
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
        _convertAsset(_values[i], _datas[i]);
      }
    }
  }

  /// @notice interact with delta neutral position.
  /// @param _data The calldata to pass along to the vault for more working context.
  function _doWork(bytes memory _data) internal {
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

    if (
      !OPENING &&
      !((_vault == stableVault && _posId == stableVaultPosId) || (_vault == assetVault && _posId == assetVaultPosId))
    ) {
      revert InvalidPositions({ _vault: _vault, _positionId: _posId });
    }

    // 2. approve vault
    IERC20Upgradeable(stableToken).approve(_vault, type(uint256).max);
    IERC20Upgradeable(assetToken).approve(_vault, type(uint256).max);

    // 3. Call work to altering Vault position
    IVault(_vault).work(_posId, _worker, _principalAmount, _borrowAmount, _maxReturn, _workData);

    // 4. Reset approve to 0
    IERC20Upgradeable(stableToken).approve(_vault, 0);
    IERC20Upgradeable(assetToken).approve(_vault, 0);
  }

  /// @notice Claim Alpaca reward of stable vault and asset vault
  function claim() external returns (uint256, uint256) {
    uint256 rewardStableVault = _claim(IVault(stableVault).fairLaunchPoolId());
    uint256 rewardAssetVault = _claim(IVault(assetVault).fairLaunchPoolId());
  }

  /// @dev Claim Alpaca reward for internal
  function _claim(uint256 _poolId) internal returns (uint256) {
    uint256 alpacaBefore = IERC20Upgradeable(alpacaToken).balanceOf(address(this));
    IFairLaunch(config.fairLaunchAddr()).harvest(_poolId);
    uint256 alpacaAfter = IERC20Upgradeable(alpacaToken).balanceOf(address(this));
    return alpacaAfter - alpacaBefore;
  }

  /// @notice withdraw alpaca to receiver address
  function withdrawAlpaca(address _to, uint256 _amount) external onlyOwner {
    SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(alpacaToken), _to, _amount);
  }

  /// @notice convert Asset to asset
  /// @dev convert asset by type
  /// @param _value native value
  /// @param _data abi_code data
  function _convertAsset(uint256 _value, bytes memory _data) internal {
    (uint256 _swapType, uint256 _amountIn, uint256 _amountOut, address _sourceToken, address _destinationToken) = abi
      .decode(_data, (uint256, uint256, uint256, address, address));

    address routerAddr = config.getSwapRouteRouterAddr(_sourceToken, _destinationToken);

    address[] memory paths = config.getSwapRoutePathsAddr(_sourceToken, _destinationToken);

    if (routerAddr == address(0) || paths.length == 0) {
      revert InvalidConvertTokenSetting();
    }

    SafeERC20Upgradeable.safeApprove(IERC20Upgradeable(_sourceToken), routerAddr, type(uint256).max);
    if (_swapType == CONVERT_EXACT_TOKEN_TO_NATIVE) {
      ISwapRouter(routerAddr).swapExactTokensForETH(_amountIn, _amountOut, paths, address(this), block.timestamp);
    }
    if (_swapType == CONVERT_EXACT_NATIVE_TO_TOKEN) {
      ISwapRouter(routerAddr).swapExactETHForTokens{ value: _value }(_amountOut, paths, address(this), block.timestamp);
    }
    if (_swapType == CONVERT_EXACT_TOKEN_TO_TOKEN) {
      ISwapRouter(routerAddr).swapExactTokensForTokens(_amountIn, _amountOut, paths, address(this), block.timestamp);
    }
    if (_swapType == CONVERT_TOKEN_TO_EXACT_TOKEN) {
      ISwapRouter(routerAddr).swapTokensForExactTokens(_amountOut, _amountIn, paths, address(this), block.timestamp);
    }
    SafeERC20Upgradeable.safeApprove(IERC20Upgradeable(_sourceToken), routerAddr, 0);
  }

  /// @dev _getTokenPrice with validate last price updated
  function _getTokenPrice(address token) internal view returns (uint256) {
    (uint256 _price, uint256 _lastUpdated) = priceHelper.getTokenPrice(token);
    // _lastUpdated > 30 mins revert
    if (block.timestamp - _lastUpdated > 1800) revert UnTrustedPrice();
    return _price;
  }

  /// @dev Fallback function to accept BNB.
  receive() external payable {}
}
