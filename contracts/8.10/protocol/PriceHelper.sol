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

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./interfaces/ILiquidityPair.sol";
import "./interfaces/IPriceHelper.sol";
import "./interfaces/IChainLinkPriceOracle.sol";
import "../utils/AlpacaMath.sol";

error InvalidLPAmount();
error InvalidLPAddress();
error InvalidLPTotalSupply();
error InvalidDollarAmount();

contract PriceHelper is IPriceHelper, Initializable, OwnableUpgradeable {
  using AlpacaMath for uint256;

  /// @notice An address of chainlink usd token
  address public usd;
  /// @notice a chainLink interface to perform get price
  IChainLinkPriceOracle public chainLinkPriceOracle;

  function initialize(address _chainLinkPriceOracle, address _usd) public initializer {
    OwnableUpgradeable.__Ownable_init();
    chainLinkPriceOracle = IChainLinkPriceOracle(_chainLinkPriceOracle);
    usd = _usd;
  }

  /// @notice Perform the conversion from LP to dollar
  /// @dev convert lpToDollar using chainlink oracle price
  /// @param lpAmount in ether format
  /// @param lpToken address of LP token
  function lpToDollar(uint256 lpAmount, address lpToken) external view returns (uint256) {
    if (lpAmount == 0) {
      revert InvalidLPAmount();
    }
    uint256 lpPrice = _getLPPrice(lpToken);
    return (lpAmount * lpPrice) / (10**18);
  }

  /// @notice Perform the conversion from dollar to LP
  /// @dev convert dollartoLp using chainlink oracle price
  /// @param dollarAmount in ether format
  /// @param lpToken address of LP token
  function dollarToLp(uint256 dollarAmount, address lpToken) external view returns (uint256) {
    if (dollarAmount == 0) {
      revert InvalidDollarAmount();
    }
    uint256 lpPrice = _getLPPrice(lpToken);
    return ((dollarAmount * (10**18)) / lpPrice);
  }

  /// @notice Get token price in dollar
  /// @dev getTokenPrice from address
  /// @param tokenAddress tokenAddress
  function getTokenPrice(address tokenAddress) public view returns (uint256) {
    (uint256 price, uint256 lastTimestamp) = chainLinkPriceOracle.getPrice(tokenAddress, usd);
    return price;
  }

  /// @notice get LP price using internal only, return value in 1e18 format
  /// @dev getTokenPrice from address
  /// @param lpToken lp token address
  function _getLPPrice(address lpToken) internal view returns (uint256) {
    if (lpToken == address(0)) {
      revert InvalidLPAddress();
    }

    uint256 _totalSupply = ILiquidityPair(lpToken).totalSupply();
    if (_totalSupply == 0) {
      revert InvalidLPTotalSupply();
    }

    (uint256 _r0, uint256 _r1, ) = ILiquidityPair(lpToken).getReserves();
    uint256 _sqrtK = AlpacaMath.sqrt(_r0 * _r1).fdiv(_totalSupply); //fdiv return in 2**112

    address token0Address = ILiquidityPair(lpToken).token0();
    address token1Address = ILiquidityPair(lpToken).token1();

    uint256 _px0 = (getTokenPrice(token0Address) * (2**112)); // in 2**112
    uint256 _px1 = (getTokenPrice(token1Address) * (2**112)); // in 2**112

    // fair token0 amt: _sqrtK * sqrt(_px1/_px0)
    // fair token1 amt: _sqrtK * sqrt(_px0/_px1)
    // fair lp price = 2 * sqrt(_px0 * _px1)
    // split into 2 sqrts multiplication to prevent uint overflow (note the 2**112)

    uint256 _totalValue = (((_sqrtK * 2 * (AlpacaMath.sqrt(_px0))) / (2**56)) * (AlpacaMath.sqrt(_px1))) / (2**56);
    return uint256(((_totalValue)) / (2**112)); // change from 2**112 to 2**18
  }
}
