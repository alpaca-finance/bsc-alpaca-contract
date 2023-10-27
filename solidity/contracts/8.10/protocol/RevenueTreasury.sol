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

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "./interfaces/IERC20.sol";
import "./interfaces/IGrassHouse.sol";
import "./interfaces/IxALPACAv2RevenueDistributor.sol";
import "./interfaces/ISwapRouter.sol";
import "./interfaces/IVault.sol";

import "../utils/SafeToken.sol";

/// @title RevenueTreasury - Receives Revenue and Settles Redistribution
contract RevenueTreasury is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
  /// @notice Libraries
  using SafeToken for address;

  /// @notice Errors
  error RevenueTreasury_TokenMismatch();
  error RevenueTreasury_InvalidSwapPath();
  error RevenueTreasury_InvalidBps();
  error RevenueTreasury_InvalidRewardTime();

  /// @notice States
  /// @notice token - address of the receiving token. Must be stable.
  /// Required to have token() if this contract to be destination of Worker's benefitial vault
  address public token;

  /// @notice Depcreated
  /// @notice grasshouseToken - address of the reward token
  address public grasshouseToken;

  /// @notice router - Pancake Router like address
  ISwapRouter public router;

  /// @notice Depcreated
  /// @notice grassHouse - Implementation of GrassHouse
  IGrassHouse public grassHouse;

  /// @notice vault - Implementation of vault
  IVault public vault;

  /// @notice rewardPath - Path to swap recieving token to grasshouse's token
  address[] public rewardPath;

  /// @notice vaultSwapPath - Path to swap recieving token to vault's token
  address[] public vaultSwapPath;

  /// @notice remaining - Remaining bad debt amount to cover in USD
  uint256 public remaining;

  /// @notice splitBps - Bps to split the receiving token
  uint256 public splitBps;

  /// @notice new revenue distributor
  IxALPACAv2RevenueDistributor public revenueDistributor;

  /// @notice Period of reward distrubtion
  uint256 public rewardTime;

  /// @notice Events
  event LogSettleBadDebt(address indexed _caller, uint256 _transferAmount);
  event LogSetToken(address indexed _caller, address _prevToken, address _newToken);
  event LogSetVault(address indexed _caller, address _prevVault, address _newVault);
  event LogSetWhitelistedCallers(address indexed _caller, address indexed _address, bool _ok);
  event LogSetRewardPath(address indexed _caller, address[] _newRewardPath);
  event LogSetVaultSwapPath(address indexed _caller, address[] _newRewardPath);
  event LogSetRouter(address indexed _caller, address _prevRouter, address _newRouter);
  event LogSetRemaining(address indexed _caller, uint256 _prevRemaining, uint256 _newRemaining);
  event LogSetSplitBps(address indexed _caller, uint256 _prevSplitBps, uint256 _newSplitBps);
  event LogFeedRevenueDistributor(address indexed _caller, uint256 _feedAmount);
  event LogSetRevenueDistributor(address indexed _caller, address _revenueDistributor);
  event LogSetRewardTime(address indexed _caller, uint256 _rewardTime);

  /// @notice Initialize function
  /// @param _token Receiving token
  /// @param _grasshouse Grasshouse's contract address
  function initialize(
    address _token,
    IGrassHouse _grasshouse,
    address[] calldata _rewardPath,
    IVault _vault,
    address[] calldata _vaultSwapPath,
    ISwapRouter _router,
    uint256 _remaining,
    uint256 _splitBps
  ) external initializer {
    // Check
    _validateSwapPath(_token, _vault.token(), _vaultSwapPath);
    _validateSwapPath(_token, _grasshouse.rewardToken(), _rewardPath);
    if (_splitBps > 10000) {
      revert RevenueTreasury_InvalidBps();
    }
    _router.WETH();

    // Effect
    OwnableUpgradeable.__Ownable_init();

    token = _token;
    grassHouse = _grasshouse;
    rewardPath = _rewardPath;
    vault = _vault;
    vaultSwapPath = _vaultSwapPath;
    grasshouseToken = grassHouse.rewardToken();
    router = _router;
    remaining = _remaining;
    splitBps = _splitBps;
  }

  /// @notice Split fund and distribute
  /// @param minVaultOut Minimum amount of vault's token to receive
  /// @param minGrassHouseOut Minimum amount of grasshouse's token to receive
  function feedGrassHouse(uint256 minVaultOut, uint256 minGrassHouseOut) external nonReentrant {
    // Check
    address _alpaca = revenueDistributor.ALPACA();
    _validateSwapPath(token, vault.token(), vaultSwapPath);
    _validateSwapPath(token, _alpaca, rewardPath);

    // If remaining > 0, then we need to settle bad debt first
    if (remaining > 0) {
      // Assuming that "token" is stable.
      // Split the current receiving token balance per configured bps.
      uint256 _split = (token.myBalance() * splitBps) / 10000;
      // Find out how much we can sttle in USD.
      // This should be min(remianing, _split), because
      // remaining = 10, _split = 50
      // _canSettle = 10
      // remaining = 0
      uint256 _canSettle = remaining > _split ? _split : remaining;
      remaining -= _canSettle;

      if (vaultSwapPath.length >= 2) {
        // In case we need to swap to settle short fall
        // Need to swap to settle short fall
        token.safeApprove(address(router), _canSettle);
        uint256[] memory _amountsOut = router.swapExactTokensForTokens(
          _canSettle,
          minVaultOut,
          vaultSwapPath,
          address(this),
          block.timestamp
        );

        // update transfer amount by the amount received from swap
        _canSettle = _amountsOut[_amountsOut.length - 1];
      }

      // Settle bad debt
      vault.token().safeTransfer(address(vault), _canSettle);

      emit LogSettleBadDebt(msg.sender, _canSettle);
    }

    // Swap all the rest to reward token if needed
    if (rewardPath.length >= 2) {
      uint256 _swapAmount = token.myBalance();
      token.safeApprove(address(router), _swapAmount);
      router.swapExactTokensForTokens(_swapAmount, minGrassHouseOut, rewardPath, address(this), block.timestamp);
    }

    // Feed all reward token to revenueDistributor
    uint256 _feedAmount = _alpaca.myBalance();
    _alpaca.safeApprove(address(revenueDistributor), _feedAmount);
    revenueDistributor.feed(_feedAmount, block.timestamp + rewardTime);
    emit LogFeedRevenueDistributor(msg.sender, _feedAmount);
  }

  /// @notice Return reward path in array
  function getRewardPath() external view returns (address[] memory) {
    return rewardPath;
  }

  /// @notice Return vault swap path in array
  function getVaultSwapPath() external view returns (address[] memory) {
    return vaultSwapPath;
  }

  /// @notice Set new recieving token
  /// @dev "_newToken" must be stable only.
  /// @param _newToken - new recieving token address
  function setToken(
    address _newToken,
    address[] calldata _vaultSwapPath,
    address[] calldata _rewardPath
  ) external onlyOwner {
    _validateSwapPath(_newToken, vault.token(), _vaultSwapPath);
    _validateSwapPath(_newToken, revenueDistributor.ALPACA(), _rewardPath);

    // Effect
    address _prevToken = token;
    token = _newToken;
    vaultSwapPath = _vaultSwapPath;
    rewardPath = _rewardPath;

    emit LogSetToken(msg.sender, _prevToken, token);
  }

  /// @notice Set new destination vault
  /// @param _newVault - new destination vault address
  function setVault(IVault _newVault, address[] calldata _vaultSwapPath) external onlyOwner {
    // Check
    _newVault.token();
    _validateSwapPath(token, _newVault.token(), _vaultSwapPath);

    // Effect
    IVault _prevVault = vault;
    vault = _newVault;
    vaultSwapPath = _vaultSwapPath;

    emit LogSetVaultSwapPath(msg.sender, _vaultSwapPath);
    emit LogSetVault(msg.sender, address(_prevVault), address(vault));
  }

  /// @notice Set revenueDistributor
  /// @param _revenueDistributor - new revenueDistributor
  function setRevenueDistributor(address _revenueDistributor) external onlyOwner {
    // check
    _validateSwapPath(token, IxALPACAv2RevenueDistributor(_revenueDistributor).ALPACA(), rewardPath);

    revenueDistributor = IxALPACAv2RevenueDistributor(_revenueDistributor);

    emit LogSetRevenueDistributor(msg.sender, _revenueDistributor);
  }

  /// @notice Set period of reward distribution
  /// @param _newRewardTime - period of reward distribution in seconds
  function setRewardTime(uint256 _newRewardTime) external onlyOwner {
    if (_newRewardTime < 1 days || _newRewardTime > 30 days) {
      revert RevenueTreasury_InvalidRewardTime();
    }

    rewardTime = _newRewardTime;

    emit LogSetRewardTime(msg.sender, _newRewardTime);
  }

  /// @notice Set a new swap router
  /// @param _newRouter The new reward path.
  function setRouter(ISwapRouter _newRouter) external onlyOwner {
    address _prevRouter = address(router);
    router = _newRouter;

    emit LogSetRouter(msg.sender, _prevRouter, address(router));
  }

  /// @notice Set a new remaining
  /// @param _newRemaining new remaining amount
  function setRemaining(uint256 _newRemaining) external onlyOwner {
    uint256 _prevRemaining = remaining;
    remaining = _newRemaining;

    emit LogSetRemaining(msg.sender, _prevRemaining, remaining);
  }

  /// @notice Set a new swap router
  /// @param _newSplitBps The new reward path.
  function setSplitBps(uint256 _newSplitBps) external onlyOwner {
    if (_newSplitBps > 10000) {
      revert RevenueTreasury_InvalidBps();
    }
    uint256 _prevSplitBps = splitBps;
    splitBps = _newSplitBps;

    emit LogSetSplitBps(msg.sender, _prevSplitBps, _newSplitBps);
  }

  /// @notice Set a new swap router
  /// @param _source Source token
  /// @param _destination Destination token
  /// @param _path path to check validity
  function _validateSwapPath(address _source, address _destination, address[] memory _path) internal pure {
    if (_path.length < 2) {
      if (_source != _destination) revert RevenueTreasury_TokenMismatch();
    } else {
      if ((_path[0] != _source || _path[_path.length - 1] != _destination)) revert RevenueTreasury_InvalidSwapPath();
    }
  }
}
