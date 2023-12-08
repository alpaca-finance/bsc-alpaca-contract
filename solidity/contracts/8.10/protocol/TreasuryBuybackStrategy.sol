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

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "./interfaces/ICommonV3Pool.sol";
import "./interfaces/ICommonV3PositionManager.sol";
import "./interfaces/IPancakeV3MasterChef.sol";
import "./interfaces/IV3SwapRouter.sol";
import "./interfaces/IChainLinkPriceOracle.sol";

import "../utils/SafeToken.sol";
import "../libraries/LibLiquidityAmounts.sol";
import "../libraries/LibTickMath.sol";

contract TreasuryBuybackStrategy is Initializable, Ownable2StepUpgradeable {
  /// @notice Libraries
  using SafeToken for address;

  error TreasuryBuybackStrategy_PositionAlreadyExist();
  error TreasuryBuybackStrategy_PositionNotExist();
  error TreasuryBuybackStrategy_Unauthorized();
  error TreasuryBuybackStrategy_InvalidToken();
  error TreasuryBuybackStrategy_InvalidParams();

  event LogSetCaller(address indexed _caller, bool _isOk);
  event LogOpenPosition(uint256 indexed _nftTokenId, uint256 _amount0, uint256 _amount1);
  event LogClosePosition(uint256 indexed _nftTokenId, uint256 _amount0, uint256 _amount1);
  event LogSetAccumToken(address indexed _caller, address _prevAccumToken, address _accumToken);

  IPancakeV3MasterChef public masterChef;
  ICommonV3PositionManager public nftPositionManager;
  uint256 public nftTokenId;
  address public treasury;
  address public accumToken;

  ICommonV3Pool public pool;
  address public token0;
  address public token1;
  int24 public tickSpacing;
  uint24 public fee;

  IV3SwapRouter public routerV3;
  IChainLinkPriceOracle public oracle;
  uint256 public slippageBps;

  mapping(address => bool) public callersOk;

  /// Modifier
  modifier onlyWhitelistedCallers() {
    if (!callersOk[msg.sender]) {
      revert TreasuryBuybackStrategy_Unauthorized();
    }
    _;
  }

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize(
    address _masterChef,
    address _nftPositionManager,
    address _pool,
    address _accumToken,
    address _treasury,
    address _routerV3,
    address _oracle,
    uint256 _slippageBps
  ) external initializer {
    // sanity call
    IPancakeV3MasterChef(_masterChef).CAKE();
    ICommonV3PositionManager(_nftPositionManager).positions(1);
    if (_treasury == address(0)) {
      revert TreasuryBuybackStrategy_InvalidParams();
    }

    __Ownable2Step_init();

    masterChef = IPancakeV3MasterChef(_masterChef);
    nftPositionManager = ICommonV3PositionManager(_nftPositionManager);
    treasury = _treasury;

    pool = ICommonV3Pool(_pool);
    token0 = ICommonV3Pool(_pool).token0();
    token1 = ICommonV3Pool(_pool).token1();
    tickSpacing = ICommonV3Pool(_pool).tickSpacing();
    fee = ICommonV3Pool(_pool).fee();

    routerV3 = IV3SwapRouter(_routerV3);

    // sanity call
    IChainLinkPriceOracle(_oracle).getPrice(token0, token1);
    oracle = IChainLinkPriceOracle(_oracle);

    if (_accumToken != token0 && _accumToken != token1) {
      revert TreasuryBuybackStrategy_InvalidToken();
    }
    accumToken = _accumToken;

    if (_slippageBps > 1000) {
      revert TreasuryBuybackStrategy_InvalidParams();
    }
    slippageBps = _slippageBps;
  }

  /// @notice Add liquidity into poolV3 and stake nftToken in masterChef
  /// @param _desiredAmount - Amount of another token that caller wish to place into liquidity
  function openPosition(uint256 _desiredAmount) external onlyWhitelistedCallers {
    if (nftTokenId != 0) {
      revert TreasuryBuybackStrategy_PositionAlreadyExist();
    }

    ICommonV3PositionManager _nftPositionManager = nftPositionManager;

    (, int24 _currenrTick, , , , , ) = pool.slot0();
    int24 _tickSpacing = tickSpacing;
    address _token0 = token0;
    address _token1 = token1;
    int24 _tickLower;
    int24 _tickUpper;
    uint256 _amount0Desired;
    uint256 _amount1Desired;

    if (accumToken == _token0) {
      _token1.safeTransferFrom(msg.sender, address(this), _desiredAmount);
      _amount1Desired = _token1.myBalance();
      _token1.safeApprove(address(_nftPositionManager), _amount1Desired);

      _tickUpper = (_currenrTick / _tickSpacing) * _tickSpacing - _tickSpacing;
      _tickLower = _tickUpper - _tickSpacing;
    } else {
      _token0.safeTransferFrom(msg.sender, address(this), _desiredAmount);
      _amount0Desired = _token0.myBalance();
      _token0.safeApprove(address(_nftPositionManager), _amount0Desired);

      // case1: current tick is possitive
      // assume current tick = 16619, tickSpacing = 200, and want to accumulate token1
      // tickLower and tickUpper must satisfy tickSpacing condition
      // tickLower = 16619 / 200 * 200 + 200 = 16800
      // tickUpper = 16800 + 200 = 17000

      // case2: current tick is negative
      //  assume current tick = -16619, tickSpacing = 200, and want to accumulate token1
      // tickLower = -16619 / 200 * 200 + 200 = -16400
      // tickUpper = -16400 + 200 = -16200

      // case3: current tick is 0
      //  assume current tick = 0, tickSpacing = 200, and want to accumulate token1
      // tickLower = 0 / 200 * 200 + 200 = 200
      // tickUpper = 200 + 200 = 400
      _tickLower = (_currenrTick / _tickSpacing) * _tickSpacing + _tickSpacing;
      _tickUpper = _tickLower + _tickSpacing;
    }

    // Mint new position and stake it with masterchef
    // placing limit order for token
    (uint256 _nftTokenId, , uint256 _amount0, uint256 _amount1) = _nftPositionManager.mint(
      ICommonV3PositionManager.MintParams({
        token0: _token0,
        token1: _token1,
        fee: fee,
        tickLower: _tickLower,
        tickUpper: _tickUpper,
        amount0Desired: _amount0Desired,
        amount1Desired: _amount1Desired,
        amount0Min: 0,
        amount1Min: 0,
        recipient: address(this),
        deadline: block.timestamp
      })
    );

    // Update token id
    nftTokenId = _nftTokenId;

    // Stake to PancakeMasterChefV3
    _nftPositionManager.safeTransferFrom(address(this), address(masterChef), _nftTokenId);

    emit LogOpenPosition(_nftTokenId, _amount0, _amount1);
  }

  /// @notice Remove liquidity from poolV3 and transfer funds back to caller, rewardToken goes to treasury
  function closePosition() external onlyWhitelistedCallers {
    uint256 _nftTokenId = nftTokenId;
    if (_nftTokenId == 0) {
      revert TreasuryBuybackStrategy_PositionNotExist();
    }

    IPancakeV3MasterChef _masterChef = masterChef;

    IPancakeV3MasterChef.UserPositionInfo memory _positionInfo = _masterChef.userPositionInfos(_nftTokenId);

    // handle cake, but should be every small
    _masterChef.harvest(_nftTokenId, treasury);

    if (_positionInfo.liquidity != 0) {
      _masterChef.decreaseLiquidity(
        IPancakeV3MasterChef.DecreaseLiquidityParams({
          tokenId: _nftTokenId,
          liquidity: _positionInfo.liquidity,
          amount0Min: 0,
          amount1Min: 0,
          deadline: block.timestamp
        })
      );
    }
    // collect all liquidity + trading fees
    (uint256 _amount0, uint256 _amount1) = _masterChef.collect(
      IPancakeV3MasterChef.CollectParams({
        tokenId: _nftTokenId,
        recipient: address(this),
        amount0Max: type(uint128).max,
        amount1Max: type(uint128).max
      })
    );

    _masterChef.burn(_nftTokenId);

    nftTokenId = 0;

    uint256 _token0Balance = token0.myBalance();
    uint256 _token1Balance = token1.myBalance();

    if (_token0Balance != 0) {
      token0.safeTransfer(msg.sender, _token0Balance);
    }

    if (_token1Balance != 0) {
      token1.safeTransfer(msg.sender, _token1Balance);
    }

    emit LogClosePosition(_nftTokenId, _amount0, _amount1);
  }

  function swap(address _tokenIn, uint256 _amountIn) external onlyWhitelistedCallers {
    address _token0 = token0;
    address _token1 = token1;

    if (_tokenIn != _token0 && _tokenIn != _token1) {
      revert TreasuryBuybackStrategy_InvalidToken();
    }

    address _tokenOut = _tokenIn == _token0 ? _token1 : token0;

    _tokenIn.safeTransferFrom(msg.sender, address(this), _amountIn);

    _tokenIn.safeApprove(address(routerV3), _amountIn);

    (uint256 _oracleExchangeRate, ) = oracle.getPrice(_tokenIn, _tokenOut);

    uint256 _minAmountOut = (_amountIn * _oracleExchangeRate) /
      (10 ** (18 + (ERC20Interface(_tokenIn).decimals() - ERC20Interface(_tokenOut).decimals())));

    _minAmountOut = (_minAmountOut * (10000 - slippageBps)) / 10000;

    routerV3.exactInput(
      IV3SwapRouter.ExactInputParams({
        path: abi.encodePacked(_tokenIn, fee, _tokenOut),
        recipient: msg.sender,
        amountIn: _amountIn,
        amountOutMinimum: _minAmountOut
      })
    );
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

  function setAccumToken(address _newAccumToken) public onlyOwner {
    emit LogSetAccumToken(msg.sender, accumToken, _newAccumToken);

    if (_newAccumToken != token0 && _newAccumToken != token1) {
      revert TreasuryBuybackStrategy_InvalidToken();
    }

    accumToken = _newAccumToken;
  }

  function setSlippageBps(uint256 _newSlippageBps) external onlyOwner {
    if (_newSlippageBps > 1000) {
      revert TreasuryBuybackStrategy_InvalidParams();
    }

    slippageBps = _newSlippageBps;
  }

  /// @notice Return current amount of token0,token1 from position liquidity
  function getAmountsFromPositionLiquidity() external view returns (uint256 _amount0, uint256 _amount1) {
    uint256 _nftTokenId = nftTokenId;
    if (_nftTokenId == 0) {
      return (_amount0, _amount1);
    }

    (uint160 _poolSqrtPriceX96, , , , , , ) = pool.slot0();
    IPancakeV3MasterChef.UserPositionInfo memory _positionInfo = masterChef.userPositionInfos(_nftTokenId);

    (_amount0, _amount1) = LibLiquidityAmounts.getAmountsForLiquidity(
      _poolSqrtPriceX96,
      LibTickMath.getSqrtRatioAtTick(_positionInfo.tickLower),
      LibTickMath.getSqrtRatioAtTick(_positionInfo.tickUpper),
      _positionInfo.liquidity
    );
  }
}
