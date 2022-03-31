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

import "./interfaces/IERC20.sol";
import "./interfaces/IGrassHouse.sol";
import "./interfaces/ISwapRouter.sol";
import "./interfaces/IVault.sol";

import "../utils/SafeToken.sol";

/// @title RevenueTreasury - Receives Revenue and Settles Redistribution
contract RevenueTreasury is Initializable, OwnableUpgradeable {
  /// @notice Libraries
  using SafeToken for address;

  /// @notice Errors
  error RevenueTreasury_TokenMismatch();
  error RevenueTreasury_InvalidSwapPathLength();
  error RevenueTreasury_InvalidSwapPath();
  error RevenueTreasury_InvalidBps();

  /// @notice States
  /// @notice token - address of the receiving token
  /// Required to have token() if this contract to be destination of Worker's benefitial vault
  address public token;

  /// @notice grasshouseToken - address of the reward token
  address public grasshouseToken;

  /// @notice router - Pancake Router like address
  ISwapRouter public router;

  /// @notice grassHouse - Implementation of GrassHouse
  IGrassHouse public grassHouse;

  /// @notice vault - Implementation of vault
  IVault public vault;

  /// @notice rewardPath - Path to swap recieving token to grasshouse's token
  address[] public rewardPath;

  /// @notice vaultSwapPath - Path to swap recieving token to vault's token
  address[] public vaultSwapPath;

  /// @notice remaining - Remaining bad debt amount to cover
  uint256 public remaining;

  /// @notice splitBps - Bps to split the receiving token
  uint256 public splitBps;

  /// @notice Events
  event LogFeedGrassHouse(address indexed _caller, uint256 _transferAmount, uint256 _feedAmount);
  event LogSetToken(address indexed _caller, address _prevToken, address _newToken);
  event LogSetVault(address indexed _caller, address _prevVault, address _newVault);
  event LogSetGrassHouse(address indexed _caller, address _prevGrassHouse, address _newGrassHouse);
  event LogSetWhitelistedCallers(address indexed _caller, address indexed _address, bool _ok);
  event LogSetRewardPath(address indexed _caller, address[] _newRewardPath);
  event LogSetVaultSwapPath(address indexed _caller, address[] _newRewardPath);
  event LogSetRouter(address indexed _caller, address _prevRouter, address _newRouter);
  event LogSetRemaining(address indexed _caller, uint256 _prevRemaining, uint256 _newRemaining);
  event LogSetSplitBps(address indexed _caller, uint256 _prevSplitBps, uint256 _newSplitBps);

  /// @notice Initialize function
  /// @param _token Receiving token
  /// @param _grasshouse Grasshouse's contract address
  function initialize(
    address _token,
    IGrassHouse _grasshouse,
    IVault _vault,
    ISwapRouter _router,
    uint256 _remaining,
    uint256 _splitBps
  ) external initializer {
    // check
    if (_splitBps > 10000) {
      revert RevenueTreasury_InvalidBps();
    }

    _router.WETH();

    // effect
    OwnableUpgradeable.__Ownable_init();

    token = _token;
    grassHouse = _grasshouse;
    vault = _vault;
    grasshouseToken = grassHouse.rewardToken();
    router = _router;
    remaining = _remaining;
    splitBps = _splitBps;
  }

  /// @notice Split fund and distribute
  function feedGrassHouse() external {
    //check
    _validateSwapPath(token, vault.token(), vaultSwapPath);
    _validateSwapPath(token, grasshouseToken, rewardPath);

    uint256 _transferAmount = 0;
    if (remaining > 0) {
      // Split the current receiving token balance per configured bps.
      uint256 _split = (token.myBalance() * splitBps) / 10000;
      // The amount to transfer to vault should be equal to min(split , remaining)

      if (vaultSwapPath.length != 0) {
        uint256[] memory expectedAmountsIn = router.getAmountsIn(remaining, vaultSwapPath);
        // if the exepected amount in < _split, then swap with _split amount
        // otherwise, swap only neeeded
        uint256 _swapAmount = expectedAmountsIn[0] < _split ? expectedAmountsIn[0] : _split;
        token.safeApprove(address(router), _swapAmount);
        // Need amountsOut to update remaining
        uint256[] memory _amountsOut = router.swapExactTokensForTokens(
          _swapAmount,
          0,
          vaultSwapPath,
          address(this),
          block.timestamp
        );

        // update transfer amount by the amount received from swap
        _transferAmount = _amountsOut[_amountsOut.length - 1];
      } else {
        _transferAmount = _split < remaining ? _split : remaining;
      }

      remaining = remaining - _transferAmount;
      vault.token().safeTransfer(address(vault), _transferAmount);
    }

    // Swap all the rest to reward token if needed
    if (rewardPath.length != 0) {
      uint256 _swapAmount = token.myBalance();
      token.safeApprove(address(router), _swapAmount);
      router.swapExactTokensForTokens(_swapAmount, 0, rewardPath, address(this), block.timestamp);
    }

    // Feed all reward token to grasshouse
    uint256 _feedAmount = grasshouseToken.myBalance();
    grasshouseToken.safeApprove(address(grassHouse), _feedAmount);
    grassHouse.feed(_feedAmount);
    emit LogFeedGrassHouse(msg.sender, _transferAmount, _feedAmount);
  }

  /// @notice Set new recieving token
  /// @param _newToken - new recieving token address
  function setToken(address _newToken) external onlyOwner {
    address _prevToken = token;
    token = _newToken;
    emit LogSetToken(msg.sender, _prevToken, token);
  }

  /// @notice Set new destination vault
  /// @param _newVault - new destination vault address
  function setVault(IVault _newVault) external onlyOwner {
    //check
    _newVault.token();

    IVault _prevVault = vault;
    vault = _newVault;
    emit LogSetVault(msg.sender, address(_prevVault), address(vault));
  }

  /// @notice Set a new GrassHouse
  /// @param _newGrassHouse - new GrassHouse address
  function setGrassHouse(IGrassHouse _newGrassHouse) external onlyOwner {
    address _prevGrassHouse = address(grassHouse);
    grassHouse = _newGrassHouse;
    grasshouseToken = grassHouse.rewardToken();
    emit LogSetGrassHouse(msg.sender, _prevGrassHouse, address(_newGrassHouse));
  }

  /// @notice Set a new swap router
  /// @param _newRouter The new reward path.
  function setRouter(ISwapRouter _newRouter) external onlyOwner {
    address _prevRouter = address(router);
    router = _newRouter;

    emit LogSetRouter(msg.sender, _prevRouter, address(router));
  }

  /// @notice Set a new reward path. In case that the liquidity of the reward path has changed.
  /// @param _rewardPath The new reward path.
  function setRewardPath(address[] calldata _rewardPath) external onlyOwner {
    _validateSwapPath(token, grasshouseToken, _rewardPath);

    rewardPath = _rewardPath;

    emit LogSetRewardPath(msg.sender, _rewardPath);
  }

  /// @notice Set a new vault path. In case that the destination vault has changed.
  /// @param _vaultSwapPath The new reward path.
  function setVaultSwapPath(address[] calldata _vaultSwapPath) external onlyOwner {
    _validateSwapPath(token, vault.token(), _vaultSwapPath);

    vaultSwapPath = _vaultSwapPath;

    emit LogSetVaultSwapPath(msg.sender, _vaultSwapPath);
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
  function _validateSwapPath(
    address _source,
    address _destination,
    address[] memory _path
  ) internal pure {
    if (_path.length == 0) {
      if (_source != _destination) {
        revert RevenueTreasury_TokenMismatch();
      } else {
        return;
      }
    }
    if (_path.length == 1) revert RevenueTreasury_InvalidSwapPathLength();
    if (_path[0] != _source || _path[_path.length - 1] != _destination) revert RevenueTreasury_InvalidSwapPath();
  }
}
