pragma solidity 0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

import "./PriceOracle.sol";

contract SimplePriceOracle is OwnableUpgradeSafe, PriceOracle {
  event PriceUpdate(address indexed token0, address indexed token1, uint256 price);

  address feeder;

  struct PriceData {
    uint192 price;
    uint64 lastUpdate;
  }

  /// @notice Public price data mapping storage.
  mapping (address => mapping (address => PriceData)) public store;

  modifier onlyFeeder() {
    require(msg.sender == feeder, "SimplePriceOracle::onlyFeeder:: only feeder");
    _;
  }

  function initialize(address _feeder) public initializer {
    OwnableUpgradeSafe.__Ownable_init();

    feeder = _feeder;
  }

  function setFeeder(address _feeder) public onlyOwner {
    feeder = _feeder;
  }

  /// @dev Set the prices of the token token pairs. Must be called by the owner.
  function setPrices(
    address[] calldata token0s,
    address[] calldata token1s,
    uint256[] calldata prices
  )
    external
    onlyFeeder
  {
    uint256 len = token0s.length;
    require(token1s.length == len, "SimplePriceOracle::setPrices:: bad token1s length");
    require(prices.length == len, "SimplePriceOracle::setPrices:: bad prices length");
    for (uint256 idx = 0; idx < len; idx++) {
      address token0 = token0s[idx];
      address token1 = token1s[idx];
      uint256 price = prices[idx];
      store[token0][token1] = PriceData({
        price: uint192(price),
        lastUpdate: uint64(now)
      });
      emit PriceUpdate(token0, token1, price);
    }
  }

  /// @dev Return the wad price of token0/token1, multiplied by 1e18
  /// NOTE: (if you have 1 token0 how much you can sell it for token1)
  function getPrice(address token0, address token1)
    external view override
    returns (uint256 price, uint256 lastUpdate)
  {
    PriceData memory data = store[token0][token1];
    price = uint256(data.price);
    lastUpdate = uint256(data.lastUpdate);
    require(price != 0 && lastUpdate != 0, "SimplePriceOracle::getPrice:: bad price data");
    return (price, lastUpdate);
  }
}
