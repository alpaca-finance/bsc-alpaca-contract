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

  /// @notice rewardPath - Path to swap recieving token to grasshouse's token
  address[] public rewardPath;

  /// @notice Initialize function
  /// @param _token Receiving token
  /// @param _grasshouseAddress Grasshouse's contract address
  function initialize(
    address _token,
    address _grasshouseAddress,
    address _router
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();

    token = _token;
    grassHouse = IGrassHouse(_grasshouseAddress);

    grasshouseToken = grassHouse.rewardToken();

    // sanity check
    router = ISwapRouter(_router);
    router.WETH();
  }

  /// @notice Harvest reward from FairLaunch and Feed token to a GrassHouse
  function settle() external {
    // TODO: Settlement logic here
    // 1. Swap token
    uint256 _swapAmount = token.myBalance();

    token.safeApprove(address(router), _swapAmount);
    router.swapExactTokensForTokens(_swapAmount, 0, rewardPath, address(this), block.timestamp);
    token.safeApprove(address(router), 0);

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
