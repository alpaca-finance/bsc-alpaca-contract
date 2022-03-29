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

  /// @notice Events
  event LogFeedGrassHouse(uint256 _feedAmount);
  event LogSetNewGrassHouse(address indexed _caller, address _prevGrassHouse, address _newGrassHouse);
  event LogSetWhitelistedCallers(address indexed _caller, address indexed _address, bool _ok);
  event LogSetRewardPath(address indexed _caller, address[] _newRewardPath);
  event LogSetRouter(address indexed _caller, address _prevRouter, address _newRouter);

  /// @notice Errors
  error RevenueTreasury_TokenMismatch();
  error RevenueTreasury_InvalidRewardPathLength();
  error RevenueTreasury_InvalidRewardPath();

  /// @notice token - address of the receiving token. Required to have token() if this contract to be destination of Worker's benefitial vault
  address public token;

  /// @notice grasshouseToken - address of the receiving token. Required to have token() if this contract to be destination of Worker's benefitial vault
  address public grasshouseToken;

  /// @notice router - Pancake Router like address
  ISwapRouter public router;

  /// @notice grassHouse - Implementation of GrassHouse
  IGrassHouse public grassHouse;

  /// @notice vault - Implementation of vault
  IVault public vault;

  /// @notice rewardPath - Path to swap recieving token to grasshouse's token
  address[] public rewardPath;

  /// @notice remaining - Remaining bad debt amount to cover
  uint256 public remaining;

  /// @notice Initialize function
  /// @param _token Receiving token
  /// @param _grasshouse Grasshouse's contract address
  function initialize(
    address _token,
    address _grasshouse,
    address _vault,
    address _router,
    uint256 _remaining
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();

    token = _token;
    grassHouse = IGrassHouse(_grasshouse);
    vault = IVault(_vault);

    if (token != vault.token()) {
      revert RevenueTreasury_TokenMismatch();
    }

    grasshouseToken = grassHouse.rewardToken();

    remaining = _remaining;

    // sanity check
    router = ISwapRouter(_router);
    router.WETH();
  }

  /// @notice Split fund and distribute
  function settle() external {
    if (remaining > 0) {
      // Partition receiving token balance into half.
      // The amount to trasnfer to vault for bad debt coverage = max(balance/2 , remaining)
      uint256 _coverPortion = token.myBalance() / 2;
      uint256 _transferAmount = _coverPortion < remaining ? _coverPortion : remaining;
      remaining = remaining - _transferAmount;

      token.safeTransfer(address(vault), _transferAmount);
    }

    // Swap all the rest to reward token
    uint256 _swapAmount = token.myBalance();
    token.safeApprove(address(router), _swapAmount);
    router.swapExactTokensForTokens(_swapAmount, 0, rewardPath, address(this), block.timestamp);
    token.safeApprove(address(router), 0);

    // Feed all reward token to grasshouse
    uint256 _feedAmount = grasshouseToken.myBalance();
    grasshouseToken.safeApprove(address(grassHouse), _feedAmount);
    grassHouse.feed(_feedAmount);
    emit LogFeedGrassHouse(_feedAmount);
  }

  /// @notice Set a new GrassHouse
  /// @param _newGrassHouse - new GrassHouse address
  function setGrassHouse(IGrassHouse _newGrassHouse) external onlyOwner {
    address _prevGrassHouse = address(grassHouse);
    grassHouse = _newGrassHouse;
    grasshouseToken = grassHouse.rewardToken();
    emit LogSetNewGrassHouse(msg.sender, _prevGrassHouse, address(_newGrassHouse));
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
    if (_rewardPath.length < 2) revert RevenueTreasury_InvalidRewardPathLength();

    if (_rewardPath[0] != token || _rewardPath[_rewardPath.length - 1] != grasshouseToken)
      revert RevenueTreasury_InvalidRewardPath();

    rewardPath = _rewardPath;

    emit LogSetRewardPath(msg.sender, _rewardPath);
  }
}
