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
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./IMdexPair.sol";
import "../utils/AlpacaMath.sol";
import "./interfaces/IPriceHelper.sol";
import "./interfaces/IChainLinkPriceOracle.sol";

error InvalidLPAmount();
error InvalidLPAddress();
error InvalidLPTotalSupply();
error InvalidDollarAmount();

// only quote in USD
contract PriceHelper is IPriceHelper, Initializable, OwnableUpgradeable {
  using AlpacaMath for uint256;

  IChainLinkPriceOracle public chainLinkPriceOracle;
  address public usd;

  function initialize(address _chainLinkPriceOracle, address _usd) public initializer {
    OwnableUpgradeable.__Ownable_init();
    chainLinkPriceOracle = IChainLinkPriceOracle(_chainLinkPriceOracle);
    usd = _usd;
  }

  // lpAmount in ether format
  function lpToDollar(uint256 lpAmount, address lpToken) external view returns (uint256) {
    if (lpAmount == 0) {
      revert InvalidLPAmount();
    }
    uint256 lpPrice = _getLPPrice(lpToken);
    return (lpAmount * lpPrice) / (10**18);
  }

  //dollar in ether format
  function dollarToLP(uint256 dollarAmount, address lpToken) external view returns (uint256) {
    if (dollarAmount == 0) {
      revert InvalidDollarAmount();
    }
    uint256 lpPrice = _getLPPrice(lpToken);
    return ((dollarAmount * (10**18)) / lpPrice);
  }

  function _getLPPrice(address lpToken) internal view returns (uint256) {
    if (lpToken == address(0)) {
      revert InvalidLPAddress();
    }

    uint256 _totalSupply = IMdexPair(lpToken).totalSupply();
    if (_totalSupply == 0) {
      revert InvalidLPTotalSupply();
    }

    (uint256 _r0, uint256 _r1, ) = IMdexPair(lpToken).getReserves();
    uint256 _sqrtK = AlpacaMath.sqrt(_r0 * _r1).fdiv(_totalSupply); // in 2**112

    address token0Address = IMdexPair(lpToken).token0();
    address token1Address = IMdexPair(lpToken).token1();

    uint256 _px0 = (getTokenPrice(token0Address) * (2**112)); // in 2**112
    uint256 _px1 = (getTokenPrice(token1Address) * (2**112)); // in 2**112

    // // fair token0 amt: _sqrtK * sqrt(_px1/_px0)
    // // fair token1 amt: _sqrtK * sqrt(_px0/_px1)
    // // fair lp price = 2 * sqrt(_px0 * _px1)
    // // split into 2 sqrts multiplication to prevent uint overflow (note the 2**112)

    uint256 _totalValue = (((_sqrtK * 2 * (AlpacaMath.sqrt(_px0))) / (2**56)) * (AlpacaMath.sqrt(_px1))) / (2**56);
    return uint256(((_totalValue)) / (2**112)); // change from 2**112 to 2**18
  }

  function getTokenPrice(address tokenAddress) public view returns (uint256) {
    (uint256 price, uint256 lastTimestamp) = chainLinkPriceOracle.getPrice(tokenAddress, usd);
    return price;
  }
}
