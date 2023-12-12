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
import "./interfaces/ITreasuryBuybackStrategy.sol";

import "../utils/SafeToken.sol";

/// @title RevenueTreasury02 - Receives Revenue and Settles Redistribution
contract RevenueTreasury02 is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
  /// @notice Libraries
  using SafeToken for address;

  /// @notice Errors
  error RevenueTreasury_TokenMismatch();
  error RevenueTreasury_InvalidSwapPath();
  error RevenueTreasury_InvalidBps();
  error RevenueTreasury_InvalidRewardTime();
  error RevenueTreasury_Unauthorized();
  error ReveneuTreasury_BuybackStrategyDeployed();

  /// @notice States
  /// @notice token - address of the receiving token. Must be stable.
  /// Required to have token() if this contract to be destination of Worker's benefitial vault
  address public token;

  /// @notice Depcreated
  /// @notice grasshouseToken - address of the reward token
  address public grasshouseToken;

  /// @notice Depcreated
  /// @notice router - Pancake Router like address
  ISwapRouter public router;

  /// @notice Depcreated
  /// @notice grassHouse - Implementation of GrassHouse
  IGrassHouse public grassHouse;

  /// @notice Depcreated
  /// @notice vault - Implementation of vault
  IVault public vault;

  /// @notice Depcreated
  /// @notice rewardPath - Path to swap recieving token to grasshouse's token
  address[] public rewardPath;

  /// @notice Depcreated
  /// @notice vaultSwapPath - Path to swap recieving token to vault's token
  address[] public vaultSwapPath;

  /// @notice Depcreated
  /// @notice remaining - Remaining bad debt amount to cover in USD
  uint256 public remaining;

  /// @notice Depcreated
  /// @notice splitBps - Bps to split the receiving token
  uint256 public splitBps;

  /// @notice new revenue distributor
  IxALPACAv2RevenueDistributor public revenueDistributor;

  /// @notice Period of reward distrubtion
  uint256 public rewardTime;

  /// @notice treasuryBuybackStrategy - strategy for buyback alpaca
  ITreasuryBuybackStrategy public treasuryBuybackStrategy;

  /// @notice callersOk - whitelisted callers for executing buyback strategy
  mapping(address => bool) public callersOk;

  /// @notice Events
  event LogSetToken(address indexed _caller, address _prevToken, address _newToken);
  event LogSetWhitelistedCallers(address indexed _caller, address indexed _address, bool _ok);
  event LogFeedRevenueDistributor(address indexed _caller, uint256 _feedAmount);
  event LogSetRevenueDistributor(address indexed _caller, address _revenueDistributor);
  event LogSetRewardTime(address indexed _caller, uint256 _rewardTime);
  event LogSetTreasuryBuybackStrategy(address indexed _caller, address _treasuryBuybackStrategy);
  event LogSetCaller(address indexed _caller, bool _isOk);
  event LogInitiateBuybackStrategy(address indexed _caller, address _token, uint256 _amount);
  event LogStopBuybackStrategy(address indexed _caller);
  event LogSwapStrategy(address indexed _caller, address indexed tokenIn, uint256 amountIn);

  /// Modifier
  modifier onlyWhitelistedCallers() {
    if (!callersOk[msg.sender]) {
      revert RevenueTreasury_Unauthorized();
    }
    _;
  }

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

  function feedGrassHouse(uint256 /*minVaultOut*/, uint256 /*minGrassHouseOut*/) external pure {
    revert("!feedGrassHouse");
  }

  /// @notice feed alpaca to revenueDistributor
  function feedRevenueDistributor() external nonReentrant {
    address _alpaca = revenueDistributor.ALPACA();
    uint256 _feedAmount = _alpaca.myBalance();

    _alpaca.safeApprove(address(revenueDistributor), _feedAmount);
    revenueDistributor.feed(_feedAmount, block.timestamp + rewardTime);

    emit LogFeedRevenueDistributor(msg.sender, _feedAmount);
  }

  function initiateBuybackStrategy() external nonReentrant onlyWhitelistedCallers {
    uint256 _myTokenBalance = token.myBalance();
    address _token = token;
    ITreasuryBuybackStrategy _treasuryBuybackStrategy = treasuryBuybackStrategy;

    _token.safeApprove(address(_treasuryBuybackStrategy), _myTokenBalance);
    _treasuryBuybackStrategy.openPosition(_myTokenBalance);

    emit LogInitiateBuybackStrategy(msg.sender, _token, _myTokenBalance);
  }

  function stopBuybackStrategy() external nonReentrant onlyWhitelistedCallers {
    treasuryBuybackStrategy.closePosition();

    emit LogStopBuybackStrategy(msg.sender);
  }

  function swapStrategy(uint256 _amountIn) external nonReentrant onlyWhitelistedCallers {
    ITreasuryBuybackStrategy _treasuryBuybackStrategy = treasuryBuybackStrategy;
    address _tokenIn = token;

    _tokenIn.safeApprove(address(_treasuryBuybackStrategy), _amountIn);
    _treasuryBuybackStrategy.swap(_tokenIn, _amountIn);

    emit LogSwapStrategy(msg.sender, _tokenIn, _amountIn);
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
  function setToken(address _newToken) external onlyOwner {
    if (_newToken != treasuryBuybackStrategy.token0() && _newToken != treasuryBuybackStrategy.token1()) {
      revert RevenueTreasury_TokenMismatch();
    }

    address _prevToken = token;

    token = _newToken;

    emit LogSetToken(msg.sender, _prevToken, token);
  }

  /// @notice Set new destination vault
  function setVault(IVault /*_newVault*/, address[] calldata /*_vaultSwapPath*/) external view onlyOwner {
    revert("!setVault");
  }

  /// @notice Set revenueDistributor
  /// @param _revenueDistributor - new revenueDistributor
  function setRevenueDistributor(address _revenueDistributor) external onlyOwner {
    // check
    IxALPACAv2RevenueDistributor(_revenueDistributor).ALPACA();

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
  function setRouter(ISwapRouter /*_newRouter*/) external view onlyOwner {
    revert("!setRouter");
  }

  /// @notice Set a new remaining
  function setRemaining(uint256 /*_newRemaining*/) external view onlyOwner {
    revert("!setRemaining");
  }

  /// @notice Set a new swap router
  function setSplitBps(uint256 /*_newSplitBps*/) external view onlyOwner {
    revert("!setSplitBps");
  }

  /// @notice Set a buyback strategy for revenueTreasury
  /// @param _newTreasuryBuybackStrategy The strategy address
  function setTreasuryBuyBackStrategy(address _newTreasuryBuybackStrategy) external onlyOwner {
    // reuqired positions to closed before setting new strategy
    if (
      address(treasuryBuybackStrategy) != address(0) &&
      ITreasuryBuybackStrategy(treasuryBuybackStrategy).nftTokenId() != 0
    ) {
      revert ReveneuTreasury_BuybackStrategyDeployed();
    }

    treasuryBuybackStrategy = ITreasuryBuybackStrategy(_newTreasuryBuybackStrategy);

    emit LogSetTreasuryBuybackStrategy(msg.sender, _newTreasuryBuybackStrategy);
  }

  function setCallersOk(address[] calldata _callers, bool _isOk) external onlyOwner {
    uint256 _length = _callers.length;
    for (uint256 _i; _i < _length; ) {
      callersOk[_callers[_i]] = _isOk;
      emit LogSetCaller(_callers[_i], _isOk);
      unchecked {
        ++_i;
      }
    }
  }
}
