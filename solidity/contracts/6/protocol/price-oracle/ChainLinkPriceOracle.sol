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

pragma solidity 0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";

import "../interfaces/IPriceOracle.sol";

contract ChainLinkPriceOracle is OwnableUpgradeSafe, PriceOracle {
  using SafeMath for uint256;

  // Mapping from token0, token1 to source
  mapping(address => mapping(address => AggregatorV3Interface)) public priceFeeds;

  event SetPriceFeed(address indexed token0, address indexed token1, AggregatorV3Interface source);

  function initialize() external initializer {
    OwnableUpgradeSafe.__Ownable_init();
  }

  /// @dev Set sources for multiple token pairs
  /// @param token0s Token0 address to set source
  /// @param token1s Token1 address to set source
  /// @param allSources source for the token pair
  function setPriceFeeds(
    address[] calldata token0s,
    address[] calldata token1s,
    AggregatorV3Interface[] calldata allSources
  ) external onlyOwner {
    require(
      token0s.length == token1s.length && token0s.length == allSources.length,
      "ChainLinkPriceOracle::setPriceFeeds:: inconsistent length"
    );
    for (uint256 idx = 0; idx < token0s.length; idx++) {
      _setPriceFeed(token0s[idx], token1s[idx], allSources[idx]);
    }
  }

  /// @dev Set source for the token pair
  /// @param token0 Token0 address to set source
  /// @param token1 Token1 address to set source
  /// @param source source for the token pair
  function _setPriceFeed(
    address token0,
    address token1,
    AggregatorV3Interface source
  ) internal {
    require(
      address(priceFeeds[token1][token0]) == address(0),
      "ChainLinkPriceOracle::setPriceFeed:: source on existed pair"
    );
    priceFeeds[token0][token1] = source;
    emit SetPriceFeed(token0, token1, source);
  }

  /// @dev Return the price of token0/token1, multiplied by 1e18
  /// @param token0 Token0 to set oracle sources
  /// @param token1 Token1 to set oracle sources
  function getPrice(address token0, address token1) external view override returns (uint256, uint256) {
    require(
      address(priceFeeds[token0][token1]) != address(0) || address(priceFeeds[token1][token0]) != address(0),
      "ChainLinkPriceOracle::getPrice:: no source"
    );
    if (address(priceFeeds[token0][token1]) != address(0)) {
      (, int256 price, , uint256 lastUpdate, ) = priceFeeds[token0][token1].latestRoundData();
      uint256 decimals = uint256(priceFeeds[token0][token1].decimals());
      return (uint256(price).mul(1e18) / (10**decimals), lastUpdate);
    }
    (, int256 price, , uint256 lastUpdate, ) = priceFeeds[token1][token0].latestRoundData();
    uint256 decimals = uint256(priceFeeds[token1][token0].decimals());
    return ((10**decimals).mul(1e18) / uint256(price), lastUpdate);
  }
}
