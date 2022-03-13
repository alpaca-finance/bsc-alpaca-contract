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
**/

pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "./interfaces/IERC20.sol";
import "./interfaces/IFairLaunch.sol";
import "./interfaces/IProxyToken.sol";
import "./interfaces/IAnyswapV1ERC20.sol";
import "./interfaces/IAnyswapV4Router.sol";

import "../utils/SafeToken.sol";

/// @title EmissionForwarder - Forward ALPACA emission from FairLaunch to other chains
contract EmissionForwarder is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
  /// @notice Libraries
  using SafeToken for address;

  /// @notice Errors
  error EmissionForwarder_AlreadyDeposited();
  error EmissionForwarder_AmoutTooSmall();
  error EmissionForwarder_MaxCrossChainAmountTooLow();
  error EmissionForwarder_StakeTokenMismatch();

  /// @notice State
  string public name;
  IFairLaunch public fairLaunch;
  IAnyswapV4Router public router;
  uint256 public fairLaunchPoolId;
  uint256 public maxCrossChainAmount;

  address public destination;
  uint64 public destChainId;

  /// @notice Attributes for AlcapaFeeder
  /// token - address of the token to be deposited in this contract
  /// anyToken - address of the multichain token that is being used to deposit
  /// proxyToken - just a simple ERC20 token for staking with FairLaunch
  address public token;
  address public anyToken;
  address public proxyToken;

  /// @notice Events
  event LogFairLaunchDeposit();
  event LogFairLaunchWithdraw();
  event LogFairLaunchHarvest(address _caller, uint256 _harvestAmount);
  event LogForwardToken(address _destination, uint256 _forwardAmount);
  event LogSetAnyswapConfig(address _router, address _anyToken);
  event LogSetDestinationConfig(address _destination, uint64 _destChainId);
  event LogSetMaxCrossChainAmount(uint256 _oldMaxCrossChainAmount, uint256 _newMaxCrossChainAmount);

  function initialize(
    string memory _name,
    address _token,
    address _anyToken,
    address _proxyToken,
    address _fairLaunchAddress,
    uint256 _fairLaunchPoolId,
    address _anyswapRouter,
    address _destination,
    uint64 _destChainId
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();

    // Call a view function to check contract's validity
    IERC20(_token).balanceOf(address(this));
    IERC20(_proxyToken).balanceOf(address(this));
    IAnyswapV1ERC20(_anyToken).underlying();
    IAnyswapV4Router(_anyswapRouter).mpc();
    IFairLaunch(_fairLaunchAddress).poolLength();

    name = _name;
    token = _token;
    anyToken = _anyToken;
    proxyToken = _proxyToken;
    fairLaunchPoolId = _fairLaunchPoolId;
    fairLaunch = IFairLaunch(_fairLaunchAddress);
    router = IAnyswapV4Router(_anyswapRouter);
    destination = _destination;
    destChainId = _destChainId;

    // Default value should at least be equal to minimum cross chain amount
    maxCrossChainAmount = 1000 * 1e18;

    (address _stakeToken, , , , ) = fairLaunch.poolInfo(fairLaunchPoolId);

    if (_stakeToken != _proxyToken) {
      revert EmissionForwarder_StakeTokenMismatch();
    }

    proxyToken.safeApprove(_fairLaunchAddress, type(uint256).max);
  }

  /// @notice Deposit token to FairLaunch
  function fairLaunchDeposit() external onlyOwner {
    if (IERC20(proxyToken).balanceOf(address(fairLaunch)) != 0) {
      revert EmissionForwarder_AlreadyDeposited();
    }
    IProxyToken(proxyToken).mint(address(this), 1e18);
    fairLaunch.deposit(address(this), fairLaunchPoolId, 1e18);
    emit LogFairLaunchDeposit();
  }

  /// @notice Withdraw all staked token from FairLaunch
  function fairLaunchWithdraw() external onlyOwner {
    fairLaunch.withdrawAll(address(this), fairLaunchPoolId);
    IProxyToken(proxyToken).burn(address(this), proxyToken.myBalance());
    emit LogFairLaunchWithdraw();
  }

  /// @notice Receive reward from FairLaunch
  function fairLaunchHarvest() external {
    _fairLaunchHarvest();
  }

  /// @notice Receive reward from FairLaunch
  function _fairLaunchHarvest() internal {
    uint256 _before = token.myBalance();
    // Low level call: this shouldn't block forward token even if failed to harvest
    // solhint-disable-next-line
    (bool _success, ) = address(fairLaunch).call(abi.encodeWithSelector(0xddc63262, fairLaunchPoolId));
    if (_success) emit LogFairLaunchHarvest(address(this), token.myBalance() - _before);
  }

  /// @notice Harvest reward from FairLaunch and send it to another chain destination address
  function forwardToken() external nonReentrant {
    _fairLaunchHarvest();
    uint256 _forwardAmount = token.myBalance() > maxCrossChainAmount ? maxCrossChainAmount : token.myBalance();
    // If the amount is too small, the cross chain fee won't be plausible
    if (_forwardAmount < (1000 * 1e18)) {
      revert EmissionForwarder_AmoutTooSmall();
    }

    token.safeApprove(address(router), _forwardAmount);
    router.anySwapOutUnderlying(anyToken, destination, _forwardAmount, destChainId);
    emit LogForwardToken(destination, _forwardAmount);
  }

  function setAnyswapConfig(IAnyswapV4Router _anyswapRouter, address _anyToken) external onlyOwner {
    router = _anyswapRouter;
    anyToken = _anyToken;

    emit LogSetAnyswapConfig(address(_anyswapRouter), _anyToken);
  }

  function setDestinationConfig(address _destination, uint64 _destChainId) external onlyOwner {
    destination = _destination;
    destChainId = _destChainId;

    emit LogSetDestinationConfig(_destination, _destChainId);
  }

  function setMaxCrossChainAmount(uint256 _newMaxCrossChainAmount) external onlyOwner {
    if (_newMaxCrossChainAmount < 1000 * 1e18) {
      revert EmissionForwarder_MaxCrossChainAmountTooLow();
    }

    uint256 _oldMaxCrossChainAmount = maxCrossChainAmount;
    maxCrossChainAmount = _newMaxCrossChainAmount;

    emit LogSetMaxCrossChainAmount(_oldMaxCrossChainAmount, maxCrossChainAmount);
  }
}
