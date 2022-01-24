// SPDX-License-Identifier: MIT
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
  event LogSetWhitelistedCallers(address indexed _caller, address indexed _address, bool _ok);
  event LogSetWhitelistedRebalancers(address indexed _caller, address indexed _address, bool _ok);

  /// @dev Errors
  error Unauthorized(address _caller);
  error DuplicatedPosition();
  error InvalidPositions(address _vault, uint256 _positionId);
  error UnsafePositionValue();
  error UnsafeDebtValue();
  error UnsafeOutStanding();

  /// @dev constants
  uint256 private constant tolerance = 1e18; // TODO: find a reasonable value
  uint256 private constant rebalanceTolerance = 1e18; // TODO: find a reasonable value

  uint8 private constant ACTION_WORK = 1;
  uint8 private constant ACTION_WARP = 2;

  address private wbnb;
  address private lpToken;
  address public stableVault;
  address public assetVault;

  address public stableVaultWorker;
  address public assetVaultWorker;

  address public stableToken;
  address public assetToken;

  uint256 public stableVaultPosId;
  uint256 public assetVaultPosId;

  IPriceHelper public priceHelper;

  // @dev mutable variables
  /// list of whitelisted callers
  mapping(address => bool) public whitelistedCallers;
  mapping(address => bool) public whitelistedRebalancers;

  /// @dev Require that the caller must be an EOA account if not whitelisted.
  modifier onlyEOAorWhitelisted() {
    if (msg.sender != tx.origin && !whitelistedCallers[msg.sender] ) {
      revert Unauthorized(msg.sender);
    }
    _;
  }

  /// @dev Require that the caller must be a rebalancer account.
  modifier onlyRebalancers() {
    if(!whitelistedRebalancers[msg.sender])
      revert Unauthorized(msg.sender);
    _;
  }

  function initialize(
    string calldata _name,
    string calldata _symbol,
    address _wbnb,
    address _stableVault,
    address _assetVault,
    address _stableVaultWorker,
    address _assetVaultWorker,
    address _lpToken,
    IPriceHelper _priceHelper
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
    ERC20Upgradeable.__ERC20_init(_name, _symbol);

    wbnb = _wbnb;
    stableVault = _stableVault;
    assetVault = _assetVault;

    stableToken = IVault(_stableVault).token();
    assetToken = IVault(_assetVault).token();

    stableVaultWorker = _stableVaultWorker;
    assetVaultWorker = _assetVaultWorker;

    lpToken = _lpToken;

    priceHelper = _priceHelper;
  }

  function initPositions(
    uint256 _stableTokenAmount,
    uint256 _assetTokenAmount,
    bytes calldata _data
  ) external payable onlyOwner {
    if(stableVaultPosId != 0 || assetVaultPosId != 0){
      revert DuplicatedPosition();
    }
    uint256 _stableVaultPosId = IVault(stableVault).nextPositionID();
    uint256 _assetVaultPosId = IVault(assetVault).nextPositionID();

    deposit(msg.sender, _stableTokenAmount, _assetTokenAmount, _data);

    stableVaultPosId = _stableVaultPosId;
    assetVaultPosId = _assetVaultPosId;

    emit LogInitializePositions(msg.sender, _stableVaultPosId, _assetVaultPosId);
  }

  function _transferTokenToVault(address _token, uint256 _amount) internal {
    if (_token == wbnb) {
      IWETH(wbnb).deposit{ value: _amount }();
    } else {
      SafeToken.safeTransferFrom(_token, msg.sender, address(this), _amount);
    }
  }

  function _transferTokenToShareOwner(address _to, address _token, uint256 _amount) internal{
    if (_token == wbnb) {
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
    uint256 _stableTokenAmount,
    uint256 _assetTokenAmount,
    bytes calldata _data
  ) public payable onlyEOAorWhitelisted nonReentrant returns (uint256 _shares) {
    console.log("=====================deposit=====================");

    // 1. transfer tokens from user to vault
    _transferTokenToVault(stableToken, _stableTokenAmount);
    console.log("after stableToken");
    _transferTokenToVault(assetToken, _assetTokenAmount);
    console.log("after assetToken");

    // 2. mint share for shareReceiver
    uint256 _depositValue =
      (_stableTokenAmount *
        priceHelper.getTokenPrice(stableToken))/1e18 +
        (_assetTokenAmount *
        priceHelper.getTokenPrice(assetToken))/1e18;
    console.log("_depositValue", _depositValue);

    uint256 _shares = valueToShare(_depositValue);
    _mint(_shareReceiver, _shares);

    console.log("_shares", _shares);

    (uint256 _stablePositionValueBefore, uint256 _assetPositionValueBefore) = positionValues();
    (uint256 _stablePositionDebtValueBefore, uint256 _assetPositionDebtValueBefore) = debtValues();

    // 3. call execute to do more work.
    // Perform the actual work, using a new scope to avoid stack-too-deep errors.
    {
      (uint8[] memory actions, uint256[] memory values, bytes[] memory _datas) =
        abi.decode(_data, (uint8[], uint256[], bytes[]));
      _execute(actions, values, _datas);
      console.log("afrer execute");
    }

    // 4. sanity check
    _equityCheck(
      _depositValue,
      _stablePositionValueBefore,
      _assetPositionValueBefore,
      _stablePositionDebtValueBefore,
      _assetPositionDebtValueBefore
    );
    // _outstandingCheck()

    emit LogDeposit(msg.sender, _shareReceiver, _stableTokenAmount, _assetTokenAmount);
    return _shares;
  }

  function withdraw(
    uint256 _shareAmount,
    uint256 _minStableTokenAmount,
    uint256 _minAssetTokenAmount,
    bytes calldata _data
  ) public onlyEOAorWhitelisted nonReentrant returns (uint256 _shares) {
    console.log("=====================withdraw=====================");
    address _shareOwner = msg.sender;
    (uint256 _stableTokenBefore, uint256 _assetTokenBefore, uint256 _nativeBefore) = _outstanding();
    {
      (uint8[] memory actions, uint256[] memory values, bytes[] memory _datas) =
        abi.decode(_data, (uint8[], uint256[], bytes[]));
      _execute(actions, values, _datas);
      console.log("afrer execute");
    }

    uint256 _equityValue = shareToValue(_shareAmount);
    _burn(_shareOwner, _shareAmount);

    (uint256 _stableTokenAfter, uint256 _assetTokenAfter, uint256 _nativeAfter) = _outstanding();
    // transfer funds back to shareOwner
    // TODO: refactor here
    uint256 _stableTokenBack = stableToken == wbnb ? _nativeAfter - _nativeBefore : _stableTokenAfter - _stableTokenBefore;
    uint256 _assetTokenBack = assetToken == wbnb ? _nativeAfter - _nativeBefore : _assetTokenAfter - _assetTokenBefore;

    _transferTokenToShareOwner(_shareOwner, stableToken, _stableTokenBack);
    _transferTokenToShareOwner(_shareOwner, assetToken, _assetTokenBack);

    // sanity check
    emit LogWithdraw(_shareOwner, _stableTokenBack, _assetTokenBack);
    return _shares;
  }

  function rebalance(
    uint8[] memory _actions,
    uint256[] memory _values,
    bytes[] memory _datas
  ) external onlyRebalancers {
    console.log("===========rebalance===========");

    uint256 equityBefore = totalEquityValue();
    (uint256 _stablePositionValue, uint256 _assetPositionValue) = positionValues();
    (uint256 _stablePositionDebtValue, uint256 _assetPositionDebtValue) = debtValues();
    require(
      _stablePositionValue * 6500 < _stablePositionDebtValue * 10000 ||
        _assetPositionValue * 6500 < _assetPositionDebtValue * 10000,
      "position is healthy"
    );
    // execute rebalance
    {
      _execute(_actions, _values, _datas);
    }
    uint256 equityAfter = totalEquityValue();
    // check  position in a healthy state after rebalance
    if(!Math.almostEqual(equityAfter, equityBefore, 1000)){
      revert UnsafePositionValue();
    }
  }

  function _equityCheck(
    uint256 depositValue,
    uint256 _stablePositionValueBefore,
    uint256 _assetPositionValueBefore,
    uint256 _stablePositionDebtValueBefore,
    uint256 _assetPositionDebtValueBefore
  ) internal {
    (uint256 _stablePositionValue, uint256 _assetPositionValue) = positionValues();
    (uint256 _stablePositionDebtValue, uint256 _assetPositionDebtValue) = debtValues();

    console.log("_equityCheck");
    console.log("_equityCheck:depositValue",depositValue );
    console.log("_equityCheck:_stablePositionValue",_stablePositionValue );
    console.log("_equityCheck:_stablePositionValueBefore",_stablePositionValueBefore );
    console.log("_equityCheck:_assetPositionValue",_assetPositionValue );
    console.log("_equityCheck",!Math.almostEqual(_stablePositionValue - _stablePositionValueBefore, (depositValue * 3) / 4, tolerance) );
    console.log("_equityCheck",!Math.almostEqual(_assetPositionValue - _assetPositionValueBefore, (depositValue * 9) / 4, tolerance) );
    // 1. check position value
    if(
      !Math.almostEqual(_stablePositionValue - _stablePositionValueBefore, (depositValue * 3) / 4, tolerance) ||
      !Math.almostEqual(_assetPositionValue - _assetPositionValueBefore, (depositValue * 9) / 4, tolerance)
    ){
      revert UnsafePositionValue();
    }

    // 2. check debe value
    if(
      !Math.almostEqual(_stablePositionDebtValue - _stablePositionDebtValueBefore, (depositValue * 2) / 4, tolerance) ||
      !Math.almostEqual(_assetPositionDebtValue - _assetPositionDebtValueBefore, (depositValue * 6) / 4, tolerance)
    ){
      revert UnsafeDebtValue();
    }

  }

  function _outstanding() internal view returns(uint256,uint256,uint256){
    return (stableToken.myBalance(), assetToken.myBalance(), balanceOf(address(this)) );
  }

  function shareToValue(uint256 shareAmount) public view returns (uint256) {
    uint256 shareSupply = totalSupply();
    if (shareSupply == 0) return shareAmount;
    return (shareAmount * totalEquityValue()) / shareSupply;
  }

  function valueToShare(uint256 value) public view returns (uint256) {
    uint256 shareSupply = totalSupply();
    if (shareSupply == 0) return value;
    return (value * shareSupply) / totalEquityValue();
  }

  function totalEquityValue() public view returns (uint256) {
    console.log(
      "totalEquityValue",
      (_stablePositionValue() + _assetPositionValue()) - (_stablePositionDebtValue() + _assetPositionDebtValue())
    );
    return (_stablePositionValue() + _assetPositionValue()) - (_stablePositionDebtValue() + _assetPositionDebtValue());
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
      return _assetVaultDebtShare;
    }
    uint256 _assetVaultDebtValue = IVault(assetVault).vaultDebtVal() + IVault(assetVault).pendingInterest(0);
    uint256 _assetPositionDebtValue = (_assetPositionDebtShare * _assetVaultDebtValue) / _assetVaultDebtShare;
    return _assetPositionDebtValue;
  }

  function debtValues() public view returns (uint256, uint256) {
    return (_stablePositionDebtValue(), _assetPositionDebtValue());
  }

  function _stablePositionValue() internal view returns (uint256) {
    // console.log("_stablePositionValue",)
    return priceHelper.lpToDollar(IWorker02(stableVaultWorker).totalLpBalance(), lpToken);
  }

  function _assetPositionValue() internal view returns (uint256) {
    return priceHelper.lpToDollar(IWorker02(assetVaultWorker).totalLpBalance(), lpToken);
  }

  function positionValues() public view returns (uint256, uint256) {
    return (_stablePositionValue(), _assetPositionValue());
  }

  /// @notice Set whitelisted callers.
  /// @dev Must only be called by owner.
  /// @param _callers addresses to be whitelisted.
  /// @param _ok The new ok flag for callers.
  function setWhitelistedCallers(address[] calldata _callers, bool _ok) external onlyOwner {
    for (uint256 _idx = 0; _idx < _callers.length; _idx++) {
      whitelistedCallers[_callers[_idx]] = _ok;
      emit LogSetWhitelistedCallers(msg.sender, _callers[_idx], _ok);
    }
  }

  /// @notice Set whitelisted rebalancers.
  /// @dev Must only be called by owner.
  /// @param _callers addresses to be whitelisted.
  /// @param _ok The new ok flag for callers.
  function setWhitelistedRebalancer(address[] calldata _callers, bool _ok) external onlyOwner {
    for (uint256 _idx = 0; _idx < _callers.length; _idx++) {
      whitelistedRebalancers[_callers[_idx]] = _ok;
      emit LogSetWhitelistedRebalancers(msg.sender, _callers[_idx], _ok);
    }
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
        IWETH(wbnb).deposit{ value: _values[i] }();
      }
    }
  }

  function _doWork(bytes memory _data, uint256 _msgValue) internal {
    console.log("_doWork");
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
    if(! ((_vault == stableVault && _posId == stableVaultPosId) || (_vault == assetVault && _posId == assetVaultPosId)) ){
      revert InvalidPositions({
        _vault: _vault,
        _positionId : _posId
      });
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

}
