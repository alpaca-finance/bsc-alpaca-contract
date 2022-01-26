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
    uint256 _stableTokenAmount,
    uint256 _assetTokenAmount
  );
  event LogWithdraw(address indexed _shareOwner, uint256 _minStableTokenAmount, uint256 _minAssetTokenAmount);
  // event LogRebalance(uint256 _equityBefore, uin256 _equityAfter);

  /// @dev Errors
  error Unauthorized(address _caller);
  error DuplicatedPositions();
  error PositionsNotInitialized();
  error InvalidPositions(address _vault, uint256 _positionId);
  error UnsafePositionValue();
  error UnsafeDebtValue();
  error UnsafeDebtRatio();
  error UnsafeOutstanding(address _token, uint256 _amountBefore, uint256 _amountAfter);
  error PositionsIsHealthy();
  error InsufficientTokenReceived(address _token, uint256 _requiredAmount, uint256 _receivedAmount);
  error InsufficientShareReceived(uint256 _requiredAmount, uint256 _receivedAmount);
  error InvalidFairLaunchAddress();

  struct Outstanding{
    uint256 stableAmount;
    uint256 assetAmount;
    uint256 nativeAmount;
  }

  /// @dev constants
  uint8 private constant ACTION_WORK = 1;
  uint8 private constant ACTION_WARP = 2;

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
    if (config.fairLaunchAddr() == address(0)) {
      revert InvalidFairLaunchAddress();
    }
  }

  function initPositions(
    uint256 _minimumShareReceive,
    uint256 _stableTokenAmount,
    uint256 _assetTokenAmount,
    bytes calldata _data
  ) external payable onlyOwner {
    if(stableVaultPosId != 0 || assetVaultPosId != 0){
      revert DuplicatedPositions();
    }
    uint256 _stableVaultPosId = IVault(stableVault).nextPositionID();
    uint256 _assetVaultPosId = IVault(assetVault).nextPositionID();

    deposit(msg.sender, _minimumShareReceive, _stableTokenAmount, _assetTokenAmount, _data);

    stableVaultPosId = _stableVaultPosId;
    assetVaultPosId = _assetVaultPosId;

    emit LogInitializePositions(msg.sender, _stableVaultPosId, _assetVaultPosId);
  }

  function _transferTokenToVault(address _token, uint256 _amount) internal {
    if (_token == config.getWrappedNativeAddr()) {
      IWETH(config.getWrappedNativeAddr()).deposit{ value: _amount }();
    } else {
      SafeToken.safeTransferFrom(_token, msg.sender, address(this), _amount);
    }
  }

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
  /// @param _stableTokenAmount Amount of stable token transfer to vault.
  /// @param _assetTokenAmount Amount of asset token transfer to vault.
  /// @param _data The calldata to pass along to the proxy action for more working context.
  function deposit(
    address _shareReceiver,
    uint256 _minimumShareReceive,
    uint256 _stableTokenAmount,
    uint256 _assetTokenAmount,
    bytes calldata _data
  ) public payable onlyEOAorWhitelisted nonReentrant returns (uint256 _shares) {
    console.log("=====================deposit=====================");

    Outstanding memory _outstandingBefore = _outstanding();
    _outstandingBefore.nativeAmount = _outstandingBefore.nativeAmount - msg.value;

    // 1. transfer tokens from user to vault
    _transferTokenToVault(stableToken, _stableTokenAmount);
    console.log("after stableToken");
    _transferTokenToVault(assetToken, _assetTokenAmount);
    console.log("after assetToken");

    // 2. mint share for shareReceiver
    uint256 _depositValue =
      ((_stableTokenAmount *
        priceHelper.getTokenPrice(stableToken)) +
        (_assetTokenAmount *
        priceHelper.getTokenPrice(assetToken)))/1e18;
    console.log("_depositValue", _depositValue);

    uint256 _shares = valueToShare(_depositValue);
    console.log("_shares", _shares);
    if(_shares < _minimumShareReceive){
      revert InsufficientShareReceived(_minimumShareReceive, _shares);
    }
    
    _mint(_shareReceiver, _shares);
    {

      (uint256 _stablePositionEquityBefore, uint256 _assetPositionEquityBefore) = (_stablePositionEquity(), _assetPositionEquity());
      (uint256 _stablePositionDebtValueBefore, uint256 _assetPositionDebtValueBefore) = (_stablePositionDebtValue(), _assetPositionDebtValue());
      
      // 3. call execute to do more work.
      // Perform the actual work, using a new scope to avoid stack-too-deep errors.

      (uint8[] memory actions, uint256[] memory values, bytes[] memory _datas) = abi.decode(
        _data,
        (uint8[], uint256[], bytes[])
      );
      _execute(actions, values, _datas);
      console.log("afrer execute");

      // 4. sanity check
      _healthCheck(
        _depositValue,
        _stablePositionEquityBefore,
        _assetPositionEquityBefore,
        _stablePositionDebtValueBefore,
        _assetPositionDebtValueBefore
      );
      _outstandingCheck(_outstandingBefore, _outstanding());
    }
    emit LogDeposit(msg.sender, _shareReceiver, _stableTokenAmount, _assetTokenAmount);
    return _shares;
  }

  function withdraw(
    uint256 _shareAmount,
    uint256 _minStableTokenAmount,
    uint256 _minAssetTokenAmount,
    bytes calldata _data
  ) public onlyEOAorWhitelisted nonReentrant returns (uint256 _withdrawValue){
    console.log("=====================withdraw=====================");
    address _shareOwner = msg.sender;
    Outstanding memory _outstandingBefore = _outstanding();

    // Outstanding
    uint256 _stablePositionEquityBefore = _stablePositionEquity();
    uint256 _assetPositionEquityBefore = _assetPositionEquity();
    {
      (uint8[] memory actions, uint256[] memory values, bytes[] memory _datas) = abi.decode(
        _data,
        (uint8[], uint256[], bytes[])
      );
      _execute(actions, values, _datas);
    }
    uint256 _stablePositionEquityAfter = _stablePositionEquity();
    uint256 _assetPositionEquityAfter = _assetPositionEquity();

    uint256 _shareValue = shareToValue(_shareAmount);
    _burn(_shareOwner, _shareAmount);

    Outstanding memory _outstandingAfter = _outstanding();
    
    // transfer funds back to shareOwner
    uint256 _stableTokenBack = stableToken == config.getWrappedNativeAddr() ? _outstandingAfter.nativeAmount - _outstandingBefore.nativeAmount : _outstandingAfter.stableAmount - _outstandingBefore.stableAmount;
    uint256 _assetTokenBack = assetToken == config.getWrappedNativeAddr() ? _outstandingAfter.nativeAmount  - _outstandingBefore.nativeAmount : _outstandingAfter.assetAmount - _outstandingBefore.assetAmount;

    if(_stableTokenBack < _minStableTokenAmount){
      revert InsufficientTokenReceived(stableToken,_minStableTokenAmount, _stableTokenBack);
    }
    if(_assetTokenBack < _minAssetTokenAmount){
      revert InsufficientTokenReceived(assetToken,_minAssetTokenAmount, _assetTokenBack);
    }
    
    _transferTokenToShareOwner(_shareOwner, stableToken,  _stableTokenBack);
    _transferTokenToShareOwner(_shareOwner, assetToken, _assetTokenBack);

    // sanity check
    uint256 _withdrawValue;
    {
    uint256 _stableWithdrawValue = _stableTokenBack * priceHelper.getTokenPrice(stableToken);
    uint256 _assetWithdrawValue = _assetTokenBack * priceHelper.getTokenPrice(assetToken);
    _withdrawValue = (_stableWithdrawValue + _assetWithdrawValue)/1e18;
    }

    if(_stablePositionEquityBefore - _stablePositionEquityAfter > _stablePositionEquityBefore/ ((_stablePositionEquityBefore+ _assetPositionEquityBefore) * _withdrawValue)){
      revert UnsafePositionValue();
    }
    if(_assetPositionEquityBefore - _assetPositionEquityAfter > _assetPositionEquityBefore/ ((_stablePositionEquityBefore+ _assetPositionEquityAfter) * _withdrawValue)){
      revert UnsafePositionValue();
    }

    uint256 _totalDebt = _stablePositionDebtValue() + _assetPositionDebtValue();
    uint256 _totalPositionValue = _stablePositionValue() + _assetPositionValue();
  
    if(_totalDebt * 10000 > _totalPositionValue * 6670){ // put constant to config
      revert UnsafeDebtRatio();
    }
    // uint256 _positionValue = 
    // (stableEquitybefore - stableEquityafter) <= stableEquitybefore / totalEquityBefore * Withdraw Amount
    // Delta Short <= Equity short / Total Eq * Withdraw Amount

    //debt ratio check totaldebt / positionValue
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

    uint256 _equityBefore = totalEquityValue();
    (uint256 _stablePositionValue, uint256 _assetPositionValue) = (_stablePositionValue(), _assetPositionValue());
    (uint256 _stablePositionDebtValue, uint256 _assetPositionDebtValue) = (_stablePositionDebtValue(), _assetPositionDebtValue());
    uint256 _rebalanceFactor = config.rebalanceFactor();

    if(_stablePositionValue * _rebalanceFactor >= _stablePositionDebtValue * 10000 &&  
      _assetPositionValue * _rebalanceFactor >= _assetPositionDebtValue * 10000){
      revert PositionsIsHealthy();
    }

    // execute rebalance
    {
      _execute(_actions, _values, _datas);
    }

    uint256 _equityAfter = totalEquityValue();
    // check if position in a healthy state after rebalancing
    if(!Math.almostEqual(_equityAfter, _equityBefore, config.positionValueTolerance())){
      revert UnsafePositionValue();
    }
  }

  function _healthCheck(
    uint256 depositValue,
    uint256 _stablePositionEquityBefore,
    uint256 _assetPositionEquityBefore,
    uint256 _stablePositionDebtValueBefore,
    uint256 _assetPositionDebtValueBefore
  ) internal {
    (uint256 _stablePositionEquity, uint256 _assetPositionEquity) = (_stablePositionEquity(), _assetPositionEquity());
    (uint256 _stablePositionDebtValue, uint256 _assetPositionDebtValue) = (_stablePositionDebtValue(), _assetPositionDebtValue());
    uint256 _tolerance = config.positionValueTolerance();
    console.log("_healthCheck");
    console.log("_healthCheck:depositValue",depositValue );
    console.log("_healthCheck:_stablePositionEquity",_stablePositionEquity );
    console.log("_healthCheck:_stablePositionEquityBefore",_stablePositionEquityBefore );
    console.log("_healthCheck:_assetPositionEquity",_assetPositionEquity );
    console.log("_healthCheck",!Math.almostEqual(_stablePositionEquity - _stablePositionEquityBefore, (depositValue * 3) / 4, _tolerance)  );
    console.log("_healthCheck",!Math.almostEqual(_assetPositionEquity - _assetPositionEquityBefore, (depositValue * 9) / 4, _tolerance));
    // 1. check position value
    if(
      !Math.almostEqual(_stablePositionEquity - _stablePositionEquityBefore, (depositValue * 3) / 4, _tolerance) ||
      !Math.almostEqual(_assetPositionEquity - _assetPositionEquityBefore, (depositValue * 9) / 4, _tolerance)
    ){
      revert UnsafePositionValue();
    }

    console.log("_healthCheck:_stablePositionDebtValueBefore",_stablePositionDebtValueBefore );
    console.log("_healthCheck:_stablePositionDebtValue",_stablePositionDebtValue );
    console.log("_healthCheck:_assetPositionDebtValueBefore",_assetPositionDebtValueBefore );
    console.log("_healthCheck:_assetPositionDebtValue",_assetPositionDebtValue );
    console.log("_healthCheck:_assetPositionDebtValue",_assetPositionDebtValue );
    console.log("_healthCheck",!Math.almostEqual(_stablePositionDebtValue - _stablePositionDebtValueBefore, (depositValue * 2) / 4, _tolerance));
    console.log("_healthCheck",!Math.almostEqual(_assetPositionDebtValue - _assetPositionDebtValueBefore, (depositValue * 6) / 4, _tolerance));
    // 2. check Debt value
    if (
      !Math.almostEqual(
        _stablePositionDebtValue - _stablePositionDebtValueBefore,
        (depositValue * 2) / 4,
        _tolerance
      ) ||
      !Math.almostEqual(_assetPositionDebtValue - _assetPositionDebtValueBefore, (depositValue * 6) / 4, _tolerance)
    ) {
      revert UnsafeDebtValue();
    }
  }

  function _outstandingCheck(Outstanding memory _outstandingBefore, Outstanding memory _outstandingAfter) internal {
    if(_outstandingAfter.stableAmount < _outstandingBefore.stableAmount){
      revert UnsafeOutstanding(stableToken, _outstandingBefore.stableAmount, _outstandingAfter.stableAmount);
    }
    if(_outstandingAfter.assetAmount < _outstandingBefore.assetAmount){
      revert UnsafeOutstanding(assetToken, _outstandingBefore.assetAmount, _outstandingAfter.assetAmount);
    }
    if(_outstandingAfter.nativeAmount < _outstandingBefore.nativeAmount){
      revert UnsafeOutstanding(address(0), _outstandingBefore.nativeAmount, _outstandingAfter.nativeAmount);
    }
  }

  function _outstanding() internal view returns(Outstanding memory){
    return Outstanding({
      stableAmount : stableToken.myBalance(),
      assetAmount : assetToken.myBalance(),
      nativeAmount : address(this).balance
    });
  }

  function shareToValue(uint256 _shareAmount) public view returns (uint256) {
    uint256 _shareSupply = totalSupply();
    if (_shareSupply == 0) return _shareAmount;
    return (_shareAmount * totalEquityValue()) / _shareSupply;
  }

  function valueToShare(uint256 _value) public view returns (uint256) {
    console.log("DeltaVault:valueToShare");
    uint256 _shareSupply = totalSupply();
    console.log("DeltaVault:valueToShare:shareSupply",_shareSupply);
    if (_shareSupply == 0) return _value;
    console.log("DeltaVault:valueToShare:value * shareSupply",_value * _shareSupply);
    console.log("DeltaVault:valueToShare:totalEquityValue()",totalEquityValue());
    return (_value * _shareSupply) / totalEquityValue();
  }

  function totalEquityValue() public view returns (uint256) {
    console.log("DeltaVault:totalEquityValue");
    console.log("DeltaVault:totalEquityValue:_stablePositionValue()", _stablePositionValue());
    console.log("DeltaVault:totalEquityValue:_assetPositionValue()", _assetPositionValue());
    console.log("DeltaVault:totalEquityValue:_stablePositionDebtValue()", _stablePositionDebtValue());
    console.log("DeltaVault:totalEquityValue:_assetPositionDebtValue()", _assetPositionDebtValue());

    uint256 _positionValue = _stablePositionValue() + _assetPositionValue();
    uint256 _debtValue = _stablePositionDebtValue() + _assetPositionDebtValue();
    if (_positionValue < _debtValue) {
      return 0;
    }
    return _positionValue - _debtValue;
  }

  function _stablePositionDebtValue() internal view returns (uint256) {
    (, , uint256 _stablePositionDebtShare) = IVault(stableVault).positions(stableVaultPosId);
    uint256 _stableVaultDebtShare = IVault(stableVault).vaultDebtShare();
    if (_stableVaultDebtShare == 0) {
      return _stablePositionDebtShare;
    }
    uint256 _stableVaultDebtValue = IVault(stableVault).vaultDebtVal() + IVault(stableVault).pendingInterest(0);
    uint256 _stablePositionDebtValue = (_stablePositionDebtShare * _stableVaultDebtValue) / _stableVaultDebtShare;
    return _stablePositionDebtValue;
  }

  function _assetPositionDebtValue() internal view returns (uint256) {
    (, , uint256 _assetPositionDebtShare) = IVault(assetVault).positions(assetVaultPosId);
    uint256 _assetVaultDebtShare = IVault(assetVault).vaultDebtShare();
    if (_assetVaultDebtShare == 0) {
      return _assetPositionDebtShare;
    }
    uint256 _assetVaultDebtValue = IVault(assetVault).vaultDebtVal() + IVault(assetVault).pendingInterest(0);
    uint256 _assetPositionDebtValue = (_assetPositionDebtShare * _assetVaultDebtValue) / _assetVaultDebtShare;
    return _assetPositionDebtValue;
  }

  function debtValues() public view returns (uint256, uint256) {
    return (_stablePositionDebtValue(), _assetPositionDebtValue());
  }

  function _stablePositionValue() internal view returns (uint256) {
    return priceHelper.lpToDollar(IWorker02(stableVaultWorker).totalLpBalance(), lpToken);
  }

  function _assetPositionValue() internal view returns (uint256) {
    return priceHelper.lpToDollar(IWorker02(assetVaultWorker).totalLpBalance(), lpToken);
  }

  function positionValues() public view returns (uint256, uint256) {
    return (_stablePositionValue(), _assetPositionValue());
  }

  function _stablePositionEquity() internal view returns (uint256){
    return _stablePositionValue() - _stablePositionDebtValue();
  }

  function _assetPositionEquity() internal view returns (uint256){
    return _assetPositionValue() - _assetPositionDebtValue();
  }

  function _execute(
    uint8[] memory _actions,
    uint256[] memory _values,
    bytes[] memory _datas
  ) internal {
    for (uint256 i = 0; i < _actions.length; i++) {
      uint8 _action = _actions[i];
      if (_action == ACTION_WORK) {
        _doWork(_datas[i], _values[i]);
      }
      if (_action == ACTION_WARP) {
        IWETH(config.getWrappedNativeAddr()).deposit{ value: _values[i]}();
      }
    }
  }

  function _doWork(bytes memory _data, uint256 _msgValue) internal {
    console.log("_doWork");
    if((stableVaultPosId == 0 || assetVaultPosId == 0) && msg.sender != owner()){
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
    if (
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

    // Reset approve to 0
    stableToken.safeApprove(_vault, 0);
    assetToken.safeApprove(_vault, 0);
  }

  function claim() external {
    _claim(IVault(stableVault).fairLaunchPoolId());
    _claim(IVault(assetVault).fairLaunchPoolId());
  }

  function _claim(uint256 _poolId) internal returns (uint256) {
    uint256 alpacaBefore = alpacaToken.myBalance();
    IFairLaunch(config.fairLaunchAddr()).harvest(_poolId);
    uint256 alpacaAfter = alpacaToken.myBalance();
    return alpacaAfter - alpacaBefore;
  }

  function withdrawAlpaca(address _to, uint256 amount) external onlyOwner {
    alpacaToken.safeTransfer(_to, amount);
  }

  /// @dev Fallback function to accept BNB.
  receive() external payable {}
}
