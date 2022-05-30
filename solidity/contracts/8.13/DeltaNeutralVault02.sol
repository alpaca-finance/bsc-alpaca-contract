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
import "./interfaces/IVault.sol";
import "./interfaces/IWorker02.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/IWNativeRelayer.sol";
import "./interfaces/IDeltaNeutralVaultConfig02.sol";
import "./interfaces/IFairLaunch.sol";
import "./interfaces/ISwapRouter.sol";
import "./interfaces/IController.sol";

import "./utils/SafeToken.sol";
import "./utils/FixedPointMathLib.sol";
import "./utils/Math.sol";
import "./utils/FullMath.sol";

/// @title DeltaNeutralVault02 is designed to take a long and short position in an asset at the same time
/// to cancel out the effect on the out-standing portfolio when the asset’s price moves.
/// Moreover, DeltaNeutralVault02 support credit-dependent limit access
// solhint-disable max-states-count
contract DeltaNeutralVault02 is ERC20Upgradeable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
  // --- Libraries ---
  using FixedPointMathLib for uint256;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  // --- Events ---
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
  event LogReinvest(uint256 _equityBefore, uint256 _equityAfter);
  event LogSetDeltaNeutralOracle(address indexed _caller, address _priceOracle);
  event LogSetDeltaNeutralVaultConfig(address indexed _caller, address _config);

  // --- Errors ---
  error DeltaNeutralVault_BadReinvestPath();
  error DeltaNeutralVault_BadActionSize();
  error DeltaNeutralVault_Unauthorized(address _caller);
  error DeltaNeutralVault_PositionsAlreadyInitialized();
  error DeltaNeutralVault_PositionsNotInitialized();
  error DeltaNeutralVault_InvalidPositions(address _vault, uint256 _positionId);
  error DeltaNeutralVault_UnsafePositionEquity();
  error DeltaNeutralVault_UnsafePositionValue();
  error DeltaNeutralVault_UnsafeDebtValue();
  error DeltaNeutralVault_UnsafeDebtRatio();
  error DeltaNeutralVault_UnsafeOutstanding(address _token, uint256 _amountBefore, uint256 _amountAfter);
  error DeltaNeutralVault_PositionsIsHealthy();
  error DeltaNeutralVault_InsufficientTokenReceived(address _token, uint256 _requiredAmount, uint256 _receivedAmount);
  error DeltaNeutralVault_InsufficientShareReceived(uint256 _requiredAmount, uint256 _receivedAmount);
  error DeltaNeutralVault_UnTrustedPrice();
  error DeltaNeutralVault_PositionValueExceedLimit();
  error DeltaNeutralVault_WithdrawValueExceedShareValue(uint256 _withdrawValue, uint256 _shareValue);
  error DeltaNeutralVault_IncorrectNativeAmountDeposit();
  error DeltaNeutralVault_InvalidLpToken();
  error DeltaNeutralVault_InvalidInitializedAddress();
  error DeltaNeutralVault_UnsupportedDecimals(uint256 _decimals);
  error DeltaNeutralVault_InvalidShareAmount();
  error DeltaNeutralVault_ExceedCredit();

  struct Outstanding {
    uint256 stableAmount;
    uint256 assetAmount;
    uint256 nativeAmount;
  }

  struct PositionInfo {
    uint256 stablePositionEquity;
    uint256 stablePositionDebtValue;
    uint256 stableLpAmount;
    uint256 assetPositionEquity;
    uint256 assetPositionDebtValue;
    uint256 assetLpAmount;
  }

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

  /// @dev Require that the caller must be an EOA account if not whitelisted.
  modifier onlyEOAorWhitelisted() {
    if (msg.sender != tx.origin && !config.whitelistedCallers(msg.sender)) {
      revert DeltaNeutralVault_Unauthorized(msg.sender);
    }
    _;
  }

  /// @dev Require that the caller must be a rebalancer account.
  modifier onlyRebalancers() {
    if (!config.whitelistedRebalancers(msg.sender)) revert DeltaNeutralVault_Unauthorized(msg.sender);
    _;
  }

  /// @dev Require that the caller must be a reinvestor account.
  modifier onlyReinvestors() {
    if (!config.whitelistedReinvestors(msg.sender)) revert DeltaNeutralVault_Unauthorized(msg.sender);
    _;
  }

  /// @dev Collect management fee before interactions
  modifier collectFee() {
    _mintFee();
    _;
  }

  constructor() initializer {}

  /// @notice Initialize Delta Neutral vault.
  /// @param _name Name.
  /// @param _symbol Symbol.
  /// @param _stableVault Address of stable vault.
  /// @param _assetVault Address of asset vault.
  /// @param _stableVaultWorker Address of stable worker.
  /// @param _stableVaultWorker Address of asset worker.
  /// @param _lpToken Address stable and asset token pair.
  /// @param _alpacaToken Alpaca token address.
  /// @param _priceOracle DeltaNeutralOracle address.
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
    IDeltaNeutralOracle _priceOracle,
    IDeltaNeutralVaultConfig02 _config
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

    priceOracle = _priceOracle;
    config = _config;

    stableTo18ConversionFactor = _to18ConversionFactor(stableToken);
    assetTo18ConversionFactor = _to18ConversionFactor(assetToken);

    // check if parameters config properly
    if (
      lpToken != address(IWorker(assetVaultWorker).lpToken()) ||
      lpToken != address(IWorker(stableVaultWorker).lpToken())
    ) {
      revert DeltaNeutralVault_InvalidLpToken();
    }
    if (address(alpacaToken) == address(0)) revert DeltaNeutralVault_InvalidInitializedAddress();
    if (address(priceOracle) == address(0)) revert DeltaNeutralVault_InvalidInitializedAddress();
    if (address(config) == address(0)) revert DeltaNeutralVault_InvalidInitializedAddress();
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
      revert DeltaNeutralVault_PositionsAlreadyInitialized();
    }

    OPENING = 1;
    stableVaultPosId = IVault(stableVault).nextPositionID();
    assetVaultPosId = IVault(assetVault).nextPositionID();
    deposit(_stableTokenAmount, _assetTokenAmount, msg.sender, _minShareReceive, _data);

    OPENING = 0;

    emit LogInitializePositions(msg.sender, stableVaultPosId, assetVaultPosId);
  }

  /// @notice Get token from msg.sender.
  /// @param _token token to transfer.
  /// @param _amount amount to transfer.
  function _transferTokenToVault(address _token, uint256 _amount) internal {
    if (_token == config.getWrappedNativeAddr()) {
      if (msg.value != _amount) {
        revert DeltaNeutralVault_IncorrectNativeAmountDeposit();
      }
      IWETH(_token).deposit{ value: _amount }();
    } else {
      IERC20Upgradeable(_token).safeTransferFrom(msg.sender, address(this), _amount);
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
    {
      // 2. call execute to do more work.
      // Perform the actual work, using a new scope to avoid stack-too-deep errors.
      (uint8[] memory _actions, uint256[] memory _values, bytes[] memory _datas) = abi.decode(
        _data,
        (uint8[], uint256[], bytes[])
      );
      _execute(_actions, _values, _datas);
    }
    return
      _checkAndMint(
        _stableTokenAmount,
        _assetTokenAmount,
        _shareReceiver,
        _minShareReceive,
        _positionInfoBefore,
        _outstandingBefore
      );
  }

  function _checkAndMint(
    uint256 _stableTokenAmount,
    uint256 _assetTokenAmount,
    address _shareReceiver,
    uint256 _minShareReceive,
    PositionInfo memory _positionInfoBefore,
    Outstanding memory _outstandingBefore
  ) internal returns (uint256) {
    // continued from deposit as we're getting stack too deep
    // 3. mint share for shareReceiver
    PositionInfo memory _positionInfoAfter = positionInfo();
    uint256 _depositValue = _calculateEquityChange(_positionInfoAfter, _positionInfoBefore);

    // For private vault, deposit value should not exeed credit
    // Check availableCredit from msg.sender since user interact with contract directly
    IController _controller = IController(config.controller());
    if (address(_controller) != address(0) && _depositValue > _controller.availableCredit(msg.sender)) {
      revert DeltaNeutralVault_ExceedCredit();
    }

    // Calculate share from the value gain against the total equity before execution of actions
    uint256 _sharesToUser = _valueToShare(
      _depositValue,
      _positionInfoBefore.stablePositionEquity + _positionInfoBefore.assetPositionEquity
    );

    if (_sharesToUser < _minShareReceive) {
      revert DeltaNeutralVault_InsufficientShareReceived(_minShareReceive, _sharesToUser);
    }
    _mint(_shareReceiver, _sharesToUser);

    // 4. sanity check
    _depositHealthCheck(_depositValue, _positionInfoBefore, _positionInfoAfter);
    _outstandingCheck(_outstandingBefore, _outstanding());

    // Deduct credit from msg.sender regardless of the _shareReceiver.
    if (address(_controller) != address(0)) _controller.onDeposit(msg.sender, _sharesToUser);

    emit LogDeposit(msg.sender, _shareReceiver, _sharesToUser, _stableTokenAmount, _assetTokenAmount);
    return _sharesToUser;
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
  ) external onlyEOAorWhitelisted collectFee nonReentrant returns (uint256) {
    if (_shareAmount == 0) revert DeltaNeutralVault_InvalidShareAmount();

    PositionInfo memory _positionInfoBefore = positionInfo();
    Outstanding memory _outstandingBefore = _outstanding();

    uint256 _withdrawalFeeBps = config.feeExemptedCallers(msg.sender) ? 0 : config.withdrawalFeeBps();
    uint256 _shareToWithdraw = ((MAX_BPS - _withdrawalFeeBps) * _shareAmount) / MAX_BPS;
    uint256 _withdrawShareValue = shareToValue(_shareToWithdraw);

    // burn shares from share owner
    _burn(msg.sender, _shareAmount);

    // mint shares equal to withdrawal fee to treasury.
    _mint(config.withdrawalFeeTreasury(), _shareAmount - _shareToWithdraw);

    {
      (uint8[] memory actions, uint256[] memory values, bytes[] memory _datas) = abi.decode(
        _data,
        (uint8[], uint256[], bytes[])
      );
      _execute(actions, values, _datas);
    }

    return
      _checkAndTransfer(
        _shareAmount,
        _minStableTokenAmount,
        _minAssetTokenAmount,
        _withdrawShareValue,
        _positionInfoBefore,
        _outstandingBefore
      );
  }

  function _checkAndTransfer(
    uint256 _shareAmount,
    uint256 _minStableTokenAmount,
    uint256 _minAssetTokenAmount,
    uint256 _withdrawShareValue,
    PositionInfo memory _positionInfoBefore,
    Outstanding memory _outstandingBefore
  ) internal returns (uint256) {
    PositionInfo memory _positionInfoAfter = positionInfo();
    Outstanding memory _outstandingAfter = _outstanding();

    // transfer funds back to shareOwner
    uint256 _stableTokenBack = stableToken == config.getWrappedNativeAddr()
      ? _outstandingAfter.nativeAmount - _outstandingBefore.nativeAmount
      : _outstandingAfter.stableAmount - _outstandingBefore.stableAmount;
    uint256 _assetTokenBack = assetToken == config.getWrappedNativeAddr()
      ? _outstandingAfter.nativeAmount - _outstandingBefore.nativeAmount
      : _outstandingAfter.assetAmount - _outstandingBefore.assetAmount;

    if (_stableTokenBack < _minStableTokenAmount) {
      revert DeltaNeutralVault_InsufficientTokenReceived(stableToken, _minStableTokenAmount, _stableTokenBack);
    }
    if (_assetTokenBack < _minAssetTokenAmount) {
      revert DeltaNeutralVault_InsufficientTokenReceived(assetToken, _minAssetTokenAmount, _assetTokenBack);
    }

    uint256 _withdrawValue = _calculateEquityChange(_positionInfoBefore, _positionInfoAfter);

    if (_withdrawShareValue < _withdrawValue) {
      revert DeltaNeutralVault_WithdrawValueExceedShareValue(_withdrawValue, _withdrawShareValue);
    }

    // sanity check
    _withdrawHealthCheck(_withdrawShareValue, _positionInfoBefore, _positionInfoAfter);
    _outstandingCheck(_outstandingBefore, _outstandingAfter);

    _transferTokenToShareOwner(msg.sender, stableToken, _stableTokenBack);
    _transferTokenToShareOwner(msg.sender, assetToken, _assetTokenBack);

    // on withdraw increase credit to tx.origin since user can withdraw from DN Gateway -> DN Vault
    IController _controller = IController(config.controller());
    if (address(_controller) != address(0)) _controller.onWithdraw(tx.origin, _shareAmount);

    emit LogWithdraw(msg.sender, _stableTokenBack, _assetTokenBack);

    return _withdrawValue;
  }

  /// @notice Rebalance stable and asset positions.
  /// @param _actions List of actions to execute.
  /// @param _values Native token amount.
  /// @param _datas The calldata to pass along for more working context.
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

    // 1. check if positions need rebalance
    if (
      _stablePositionValue * _rebalanceFactor >= _positionInfoBefore.stablePositionDebtValue * MAX_BPS &&
      _assetPositionValue * _rebalanceFactor >= _positionInfoBefore.assetPositionDebtValue * MAX_BPS
    ) {
      revert DeltaNeutralVault_PositionsIsHealthy();
    }

    // 2. execute rebalance
    {
      _execute(_actions, _values, _datas);
    }

    // 3. sanity check
    // check if position in a healthy state after rebalancing
    uint256 _equityAfter = totalEquityValue();
    if (!Math.almostEqual(_equityAfter, _equityBefore, config.positionValueTolerance())) {
      revert DeltaNeutralVault_UnsafePositionValue();
    }
    _outstandingCheck(_outstandingBefore, _outstanding());

    emit LogRebalance(_equityBefore, _equityAfter);
  }

  /// @notice Reinvest fund to stable and asset positions.
  /// @param _actions List of actions to execute.
  /// @param _values Native token amount.
  /// @param _datas The calldata to pass along for more working context.
  /// @param _minTokenReceive Minimum token received when swap reward.
  function reinvest(
    uint8[] memory _actions,
    uint256[] memory _values,
    bytes[] memory _datas,
    uint256 _minTokenReceive
  ) external onlyReinvestors {
    address[] memory reinvestPath = config.getReinvestPath();
    uint256 _alpacaBountyBps = config.alpacaBountyBps();
    uint256 _alpacaBeneficiaryBps = config.alpacaBeneficiaryBps();

    if (reinvestPath.length == 0) {
      revert DeltaNeutralVault_BadReinvestPath();
    }

    // 1.  claim reward from fairlaunch
    uint256 _equityBefore = totalEquityValue();

    address _fairLaunchAddress = config.fairLaunchAddr();
    IFairLaunch(_fairLaunchAddress).harvest(IVault(stableVault).fairLaunchPoolId());
    IFairLaunch(_fairLaunchAddress).harvest(IVault(assetVault).fairLaunchPoolId());
    uint256 _alpacaAmount = IERC20Upgradeable(alpacaToken).balanceOf(address(this));

    // 2. collect alpaca bounty & distribute to ALPACA beneficiary
    uint256 _bounty = (_alpacaBountyBps * _alpacaAmount) / MAX_BPS;
    uint256 _beneficiaryShare = (_bounty * _alpacaBeneficiaryBps) / MAX_BPS;
    if (_beneficiaryShare > 0)
      IERC20Upgradeable(alpacaToken).safeTransfer(config.alpacaBeneficiary(), _beneficiaryShare);
    IERC20Upgradeable(alpacaToken).safeTransfer(config.alpacaReinvestFeeTreasury(), _bounty - _beneficiaryShare);

    // 3. swap alpaca
    uint256 _rewardAmount = _alpacaAmount - _bounty;
    ISwapRouter _router = ISwapRouter(config.getSwapRouter());
    IERC20Upgradeable(alpacaToken).approve(address(_router), _rewardAmount);
    _router.swapExactTokensForTokens(_rewardAmount, _minTokenReceive, reinvestPath, address(this), block.timestamp);

    // 4. execute reinvest
    {
      _execute(_actions, _values, _datas);
    }

    // 5. sanity check
    uint256 _equityAfter = totalEquityValue();
    if (_equityAfter <= _equityBefore) {
      revert DeltaNeutralVault_UnsafePositionEquity();
    }

    emit LogReinvest(_equityBefore, _equityAfter);
  }

  /// @notice check if position equity and debt are healthy after deposit. LEVERAGE_LEVEL must be >= 3
  /// @param _depositValue deposit value in usd.
  /// @param _positionInfoBefore position equity and debt before deposit.
  /// @param _positionInfoAfter position equity and debt after deposit.
  function _depositHealthCheck(
    uint256 _depositValue,
    PositionInfo memory _positionInfoBefore,
    PositionInfo memory _positionInfoAfter
  ) internal view {
    uint256 _toleranceBps = config.positionValueTolerance();
    uint8 _leverageLevel = config.leverageLevel();

    uint256 _positionValueAfter = _positionInfoAfter.stablePositionEquity +
      _positionInfoAfter.stablePositionDebtValue +
      _positionInfoAfter.assetPositionEquity +
      _positionInfoAfter.assetPositionDebtValue;

    // 1. check if vault accept new total position value
    if (!config.isVaultSizeAcceptable(_positionValueAfter)) {
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

    uint256 _actualStableEqChange = _lpToValue(_positionInfoAfter.stableLpAmount - _positionInfoBefore.stableLpAmount) -
      _actualStableDebtChange;
    uint256 _actualAssetEqChange = _lpToValue(_positionInfoAfter.assetLpAmount - _positionInfoBefore.assetLpAmount) -
      _actualAssetDebtChange;

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

  /// @notice Check if position equity and debt ratio are healthy after withdraw.
  /// @param _withdrawValue Withdraw value in usd.
  /// @param _positionInfoBefore Position equity and debt before deposit.
  /// @param _positionInfoAfter Position equity and debt after deposit.
  function _withdrawHealthCheck(
    uint256 _withdrawValue,
    PositionInfo memory _positionInfoBefore,
    PositionInfo memory _positionInfoAfter
  ) internal view {
    uint256 _positionValueTolerance = config.positionValueTolerance();
    uint256 _debtRationTolerance = config.debtRatioTolerance();

    uint256 _totalEquityBefore = _positionInfoBefore.stablePositionEquity + _positionInfoBefore.assetPositionEquity;
    uint256 _stableLpWithdrawValue = _lpToValue(_positionInfoBefore.stableLpAmount - _positionInfoAfter.stableLpAmount);

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
      revert DeltaNeutralVault_UnsafePositionValue();
    }

    uint256 _assetLpWithdrawValue = _lpToValue(_positionInfoBefore.assetLpAmount - _positionInfoAfter.assetLpAmount);

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
      revert DeltaNeutralVault_UnsafePositionValue();
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
        _debtRationTolerance
      )
    ) {
      revert DeltaNeutralVault_UnsafeDebtRatio();
    }

    uint256 _totalassetPositionBefore = _positionInfoBefore.assetPositionEquity +
      _positionInfoBefore.assetPositionDebtValue;
    uint256 _totalassetPositionAfter = _positionInfoAfter.assetPositionEquity +
      _positionInfoAfter.assetPositionDebtValue;

    if (
      !Math.almostEqual(
        _totalassetPositionBefore * _positionInfoAfter.assetPositionDebtValue,
        _totalassetPositionAfter * _positionInfoBefore.assetPositionDebtValue,
        _debtRationTolerance
      )
    ) {
      revert DeltaNeutralVault_UnsafeDebtRatio();
    }
  }

  /// @notice Compare Delta neutral vault tokens' balance before and afrer.
  /// @param _outstandingBefore Tokens' balance before.
  /// @param _outstandingAfter Tokens' balance after.
  function _outstandingCheck(Outstanding memory _outstandingBefore, Outstanding memory _outstandingAfter)
    internal
    view
  {
    if (_outstandingAfter.stableAmount < _outstandingBefore.stableAmount) {
      revert DeltaNeutralVault_UnsafeOutstanding(
        stableToken,
        _outstandingBefore.stableAmount,
        _outstandingAfter.stableAmount
      );
    }
    if (_outstandingAfter.assetAmount < _outstandingBefore.assetAmount) {
      revert DeltaNeutralVault_UnsafeOutstanding(
        assetToken,
        _outstandingBefore.assetAmount,
        _outstandingAfter.assetAmount
      );
    }
    if (_outstandingAfter.nativeAmount < _outstandingBefore.nativeAmount) {
      revert DeltaNeutralVault_UnsafeOutstanding(
        address(0),
        _outstandingBefore.nativeAmount,
        _outstandingAfter.nativeAmount
      );
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
    uint256 _stableLpAmount = IWorker02(stableVaultWorker).totalLpBalance();
    uint256 _assetLpAmount = IWorker02(assetVaultWorker).totalLpBalance();
    uint256 _stablePositionValue = _lpToValue(_stableLpAmount);
    uint256 _assetPositionValue = _lpToValue(_assetLpAmount);
    uint256 _stableDebtValue = _positionDebtValue(stableVault, stableVaultPosId, stableTo18ConversionFactor);
    uint256 _assetDebtValue = _positionDebtValue(assetVault, assetVaultPosId, assetTo18ConversionFactor);

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
    uint256 _shareSupply = totalSupply() + pendingManagementFee();
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
    uint256 _totalPositionValue = _lpToValue(
      IWorker02(stableVaultWorker).totalLpBalance() + IWorker02(assetVaultWorker).totalLpBalance()
    );
    uint256 _totalDebtValue = _positionDebtValue(stableVault, stableVaultPosId, stableTo18ConversionFactor) +
      _positionDebtValue(assetVault, assetVaultPosId, assetTo18ConversionFactor);
    if (_totalPositionValue < _totalDebtValue) {
      return 0;
    }
    return _totalPositionValue - _totalDebtValue;
  }

  /// @notice Set new DeltaNeutralOracle.
  /// @param _newPriceOracle New deltaNeutralOracle address.
  function setDeltaNeutralOracle(IDeltaNeutralOracle _newPriceOracle) external onlyOwner {
    // sanity call
    _newPriceOracle.getTokenPrice(stableToken);
    _newPriceOracle.lpToDollar(1e18, lpToken);

    priceOracle = _newPriceOracle;
    emit LogSetDeltaNeutralOracle(msg.sender, address(_newPriceOracle));
  }

  /// @notice Set new DeltaNeutralVaultConfig.
  /// @param _newVaultConfig New deltaNeutralOracle address.
  function setDeltaNeutralVaultConfig(IDeltaNeutralVaultConfig02 _newVaultConfig) external onlyOwner {
    // sanity call
    _newVaultConfig.positionValueTolerance();

    config = _newVaultConfig;
    emit LogSetDeltaNeutralVaultConfig(msg.sender, address(_newVaultConfig));
  }

  /// @notice Return position debt + pending interest value.
  /// @param _vault Vault addrss.
  /// @param _posId Position id.
  function _positionDebtValue(
    address _vault,
    uint256 _posId,
    uint256 _18ConversionFactor
  ) internal view returns (uint256) {
    (, , uint256 _positionDebtShare) = IVault(_vault).positions(_posId);
    address _token = IVault(_vault).token();
    uint256 _vaultDebtShare = IVault(_vault).vaultDebtShare();
    if (_vaultDebtShare == 0) {
      return (_positionDebtShare * _18ConversionFactor).mulWadDown(_getTokenPrice(_token));
    }
    uint256 _vaultDebtValue = IVault(_vault).vaultDebtVal() + IVault(_vault).pendingInterest(0);
    uint256 _debtAmount = FullMath.mulDiv(_positionDebtShare, _vaultDebtValue, _vaultDebtShare);
    return (_debtAmount * _18ConversionFactor).mulWadDown(_getTokenPrice(_token));
  }

  /// @notice Return value of given lp amount.
  /// @param _lpAmount Amount of lp.
  function _lpToValue(uint256 _lpAmount) internal view returns (uint256) {
    (uint256 _lpValue, uint256 _lastUpdated) = priceOracle.lpToDollar(_lpAmount, lpToken);
    if (block.timestamp - _lastUpdated > 86400) revert DeltaNeutralVault_UnTrustedPrice();
    return _lpValue;
  }

  /// @notice Return equity change between two position
  /// @param _greaterPosition Position information that's expected to have higer value
  /// @param _lesserPosition Position information that's expected to have lower value
  function _calculateEquityChange(PositionInfo memory _greaterPosition, PositionInfo memory _lesserPosition)
    internal
    view
    returns (uint256)
  {
    uint256 _lpChange = (_greaterPosition.stableLpAmount + _greaterPosition.assetLpAmount) -
      (_lesserPosition.stableLpAmount + _lesserPosition.assetLpAmount);

    uint256 _debtChange = (_greaterPosition.stablePositionDebtValue + _greaterPosition.assetPositionDebtValue) -
      (_lesserPosition.stablePositionDebtValue + _lesserPosition.assetPositionDebtValue);

    return _lpToValue(_lpChange) - _debtChange;
  }

  /// @notice Proxy function for calling internal action.
  /// @param _actions List of actions to execute.
  /// @param _values Native token amount.
  /// @param _datas The calldata to pass along for more working context.
  function _execute(
    uint8[] memory _actions,
    uint256[] memory _values,
    bytes[] memory _datas
  ) internal {
    if (_actions.length != _values.length || _actions.length != _datas.length) revert DeltaNeutralVault_BadActionSize();

    for (uint256 i = 0; i < _actions.length; i++) {
      uint8 _action = _actions[i];
      if (_action == ACTION_WORK) {
        _doWork(_datas[i]);
      }
      if (_action == ACTION_WRAP) {
        IWETH(config.getWrappedNativeAddr()).deposit{ value: _values[i] }();
      }
    }
  }

  /// @notice interact with delta neutral position.
  /// @param _data The calldata to pass along to the vault for more working context.
  function _doWork(bytes memory _data) internal {
    if (stableVaultPosId == 0 || assetVaultPosId == 0) {
      revert DeltaNeutralVault_PositionsNotInitialized();
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

    // OPENING for initializing positions
    if (
      OPENING != 1 &&
      !((_vault == stableVault && _posId == stableVaultPosId) || (_vault == assetVault && _posId == assetVaultPosId))
    ) {
      revert DeltaNeutralVault_InvalidPositions({ _vault: _vault, _positionId: _posId });
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
    if (block.timestamp - _lastUpdated > 86400) revert DeltaNeutralVault_UnTrustedPrice();
    return _price;
  }

  /// @notice Calculate share from value and total equity
  /// @param _value Value to convert
  /// @param _totalEquity Total equity at the time of calculation
  function _valueToShare(uint256 _value, uint256 _totalEquity) internal view returns (uint256) {
    uint256 _shareSupply = totalSupply() + pendingManagementFee();
    if (_shareSupply == 0) return _value;
    return FullMath.mulDiv(_value, _shareSupply, _totalEquity);
  }

  /// @dev Return a conversion factor to 18 decimals.
  /// @param _token token to convert.
  function _to18ConversionFactor(address _token) internal view returns (uint256) {
    uint256 _decimals = ERC20Upgradeable(_token).decimals();
    if (_decimals > 18) revert DeltaNeutralVault_UnsupportedDecimals(_decimals);
    if (_decimals == 18) return 1;
    uint256 _conversionFactor = 10**(18 - _decimals);
    return _conversionFactor;
  }

  /// @dev Fallback function to accept BNB.
  receive() external payable {}
}
