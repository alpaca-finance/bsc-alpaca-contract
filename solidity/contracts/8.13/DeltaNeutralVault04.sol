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

import "./utils/SafeToken.sol";
import "./utils/FixedPointMathLib.sol";
import "./utils/Math.sol";
import "./utils/FullMath.sol";

/// @title DeltaNeutralVault04 is designed to take a long and short position in an asset at the same time
/// to cancel out the effect on the out-standing portfolio when the asset’s price moves.
/// Moreover, DeltaNeutralVault04 support credit-dependent limit access and executor
// solhint-disable max-states-count
contract DeltaNeutralVault04 is IDeltaNeutralStruct, ERC20Upgradeable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
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
  event LogSetDeltaNeutralVaultHealthChecker(address indexed _caller, address _checker);

  // --- Errors ---
  error DeltaNeutralVault04_BadReinvestPath();
  error DeltaNeutralVault04_Unauthorized(address _caller);
  error DeltaNeutralVault04_PositionsAlreadyInitialized();
  error DeltaNeutralVault04_PositionsNotInitialized();
  error DeltaNeutralVault04_InvalidPositions(address _vault, uint256 _positionId);
  error DeltaNeutralVault04_UnsafePositionEquity();
  error DeltaNeutralVault04_UnsafePositionValue();
  error DeltaNeutralVault04_PositionsIsHealthy();
  error DeltaNeutralVault04_InsufficientTokenReceived(address _token, uint256 _requiredAmount, uint256 _receivedAmount);
  error DeltaNeutralVault04_InsufficientShareReceived(uint256 _requiredAmount, uint256 _receivedAmount);
  error DeltaNeutralVault04_UnTrustedPrice();
  error DeltaNeutralVault04_WithdrawValueExceedShareValue(uint256 _withdrawValue, uint256 _shareValue);
  error DeltaNeutralVault04_IncorrectNativeAmountDeposit();
  error DeltaNeutralVault04_InvalidLpToken();
  error DeltaNeutralVault04_InvalidInitializedAddress();
  error DeltaNeutralVault04_UnsupportedDecimals(uint256 _decimals);
  error DeltaNeutralVault04_InvalidShareAmount();

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

  /// @dev Require that the caller must be an EOA account if not whitelisted.
  modifier onlyEOAorWhitelisted() {
    if (msg.sender != tx.origin && !config.whitelistedCallers(msg.sender)) {
      revert DeltaNeutralVault04_Unauthorized(msg.sender);
    }
    _;
  }

  /// @dev Require that the caller must be a rebalancer account.
  modifier onlyRebalancers() {
    if (!config.whitelistedRebalancers(msg.sender)) revert DeltaNeutralVault04_Unauthorized(msg.sender);
    _;
  }

  /// @dev Require that the caller must be a reinvestor account.
  modifier onlyReinvestors() {
    if (!config.whitelistedReinvestors(msg.sender)) revert DeltaNeutralVault04_Unauthorized(msg.sender);
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
      revert DeltaNeutralVault04_InvalidLpToken();
    }
    if (address(alpacaToken) == address(0)) revert DeltaNeutralVault04_InvalidInitializedAddress();
    if (address(priceOracle) == address(0)) revert DeltaNeutralVault04_InvalidInitializedAddress();
    if (address(config) == address(0)) revert DeltaNeutralVault04_InvalidInitializedAddress();
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
      revert DeltaNeutralVault04_PositionsAlreadyInitialized();
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
        revert DeltaNeutralVault04_IncorrectNativeAmountDeposit();
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

    // 1. transfer tokens from user to vault
    _transferTokenToVault(stableToken, _stableTokenAmount);
    _transferTokenToVault(assetToken, _assetTokenAmount);

    // 2. deposit executor exec
    IExecutor(config.depositExecutor()).exec(bytes.concat(abi.encode(_stableTokenAmount, _assetTokenAmount), _data));

    return _checkAndMint(_stableTokenAmount, _assetTokenAmount, _shareReceiver, _minShareReceive, _positionInfoBefore);
  }

  function _checkAndMint(
    uint256 _stableTokenAmount,
    uint256 _assetTokenAmount,
    address _shareReceiver,
    uint256 _minShareReceive,
    PositionInfo memory _positionInfoBefore
  ) internal returns (uint256) {
    // continued from deposit as we're getting stack too deep
    // 3. mint share for shareReceiver
    PositionInfo memory _positionInfoAfter = positionInfo();
    uint256 _depositValue = _calculateEquityChange(_positionInfoAfter, _positionInfoBefore);

    // Calculate share from the value gain against the total equity before execution of actions
    uint256 _sharesToUser = _valueToShare(
      _depositValue,
      _positionInfoBefore.stablePositionEquity + _positionInfoBefore.assetPositionEquity
    );

    if (_sharesToUser < _minShareReceive) {
      revert DeltaNeutralVault04_InsufficientShareReceived(_minShareReceive, _sharesToUser);
    }
    _mint(_shareReceiver, _sharesToUser);

    // 4. sanity check
    checker.depositHealthCheck(_depositValue, lpToken, _positionInfoBefore, _positionInfoAfter, priceOracle, config);

    // Deduct credit from msg.sender regardless of the _shareReceiver.
    IController _controller = IController(config.controller());
    if (address(_controller) != address(0)) {
      // in case after deduction and it violated the credit available,
      // the controller should revert the transaction
      _controller.onDeposit(msg.sender, _sharesToUser, _depositValue);
    }

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
    if (_shareAmount == 0) revert DeltaNeutralVault04_InvalidShareAmount();

    PositionInfo memory _positionInfoBefore = positionInfo();
    Outstanding memory _outstandingBefore = _outstanding();

    uint256 _withdrawalFeeBps = config.feeExemptedCallers(msg.sender) ? 0 : config.withdrawalFeeBps();
    uint256 _shareToWithdraw = ((MAX_BPS - _withdrawalFeeBps) * _shareAmount) / MAX_BPS;
    uint256 _withdrawShareValue = shareToValue(_shareToWithdraw);

    // burn shares from share owner
    _burn(msg.sender, _shareAmount);

    // mint shares equal to withdrawal fee to treasury.
    _mint(config.withdrawalFeeTreasury(), _shareAmount - _shareToWithdraw);

    // withdraw executor exec
    IExecutor(config.withdrawExecutor()).exec(bytes.concat(abi.encode(_withdrawShareValue), _data));

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
      revert DeltaNeutralVault04_InsufficientTokenReceived(stableToken, _minStableTokenAmount, _stableTokenBack);
    }
    if (_assetTokenBack < _minAssetTokenAmount) {
      revert DeltaNeutralVault04_InsufficientTokenReceived(assetToken, _minAssetTokenAmount, _assetTokenBack);
    }

    uint256 _withdrawValue = _calculateEquityChange(_positionInfoBefore, _positionInfoAfter);

    if (_withdrawShareValue < _withdrawValue) {
      revert DeltaNeutralVault04_WithdrawValueExceedShareValue(_withdrawValue, _withdrawShareValue);
    }

    // sanity check
    checker.withdrawHealthCheck(
      _withdrawShareValue,
      lpToken,
      _positionInfoBefore,
      _positionInfoAfter,
      priceOracle,
      config
    );

    _transferTokenToShareOwner(msg.sender, stableToken, _stableTokenBack);
    _transferTokenToShareOwner(msg.sender, assetToken, _assetTokenBack);

    // on withdraw increase credit to tx.origin since user can withdraw from DN Gateway -> DN Vault
    IController _controller = IController(config.controller());
    if (address(_controller) != address(0)) _controller.onWithdraw(tx.origin, _shareAmount);

    emit LogWithdraw(msg.sender, _stableTokenBack, _assetTokenBack);

    return _withdrawValue;
  }

  /// @notice Rebalance stable and asset positions.
  /// @param _data The calldata to pass along for more working context.
  function rebalance(bytes memory _data) external onlyRebalancers collectFee {
    PositionInfo memory _positionInfoBefore = positionInfo();
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
      revert DeltaNeutralVault04_PositionsIsHealthy();
    }

    // 2. rebalance executor exec
    IExecutor(config.rebalanceExecutor()).exec(_data);

    // 3. sanity check
    // check if position in a healthy state after rebalancing
    uint256 _equityAfter = totalEquityValue();
    if (!Math.almostEqual(_equityAfter, _equityBefore, config.positionValueTolerance())) {
      revert DeltaNeutralVault04_UnsafePositionValue();
    }

    emit LogRebalance(_equityBefore, _equityAfter);
  }

  /// @notice Reinvest fund to stable and asset positions.
  /// @param _data The calldata to pass along for more working context.
  /// @param _minTokenReceive Minimum token received when swap reward.
  function reinvest(bytes memory _data, uint256 _minTokenReceive) external onlyReinvestors {
    address[] memory reinvestPath = config.getReinvestPath();
    uint256 _alpacaBountyBps = config.alpacaBountyBps();
    uint256 _alpacaBeneficiaryBps = config.alpacaBeneficiaryBps();

    if (reinvestPath.length == 0) {
      revert DeltaNeutralVault04_BadReinvestPath();
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

    // 4. reinvest executor exec
    IExecutor(config.reinvestExecutor()).exec(_data);

    // 5. sanity check
    uint256 _equityAfter = totalEquityValue();
    if (_equityAfter <= _equityBefore) {
      revert DeltaNeutralVault04_UnsafePositionEquity();
    }

    emit LogReinvest(_equityBefore, _equityAfter);
  }

  function repurchase(
    address _tokenIn,
    uint256 _amountIn,
    uint256 _minAmountOut
  ) external nonReentrant returns (uint256 amountIn, uint256 amountOut) {
    return (1e20, 1e20);
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

  /// @notice Set new DeltaNeutralOracle.
  /// @param _checker New deltaNeutralOracle address.
  function setDeltaNeutralVaultHealthChecker(IDeltaNeutralVault04HealthChecker _checker) external onlyOwner {
    if (address(_checker) == address(0)) {
      revert DeltaNeutralVault04_InvalidInitializedAddress();
    }
    checker = _checker;

    emit LogSetDeltaNeutralVaultHealthChecker(msg.sender, address(_checker));
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
    if (block.timestamp - _lastUpdated > 86400) revert DeltaNeutralVault04_UnTrustedPrice();
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
  /// @param _action actions to execute.
  /// @param _value Native token amount.
  /// @param _data The calldata to pass along for more working context.
  function execute(
    uint8 _action,
    uint256 _value,
    bytes memory _data
  ) external {
    if (!config.isExecutor(msg.sender)) {
      revert DeltaNeutralVault04_Unauthorized(msg.sender);
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
    if (stableVaultPosId == 0 || assetVaultPosId == 0) {
      revert DeltaNeutralVault04_PositionsNotInitialized();
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
      revert DeltaNeutralVault04_InvalidPositions({ _vault: _vault, _positionId: _posId });
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
    if (block.timestamp - _lastUpdated > 86400) revert DeltaNeutralVault04_UnTrustedPrice();
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
    if (_decimals > 18) revert DeltaNeutralVault04_UnsupportedDecimals(_decimals);
    if (_decimals == 18) return 1;
    uint256 _conversionFactor = 10**(18 - _decimals);
    return _conversionFactor;
  }

  /// @dev Fallback function to accept BNB.
  receive() external payable {}
}
