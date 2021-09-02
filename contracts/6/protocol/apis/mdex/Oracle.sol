pragma solidity =0.6.6;

import "./IMdexPair.sol";
import "./IMdexFactory.sol";

library SafeMath {
  function add(uint256 x, uint256 y) internal pure returns (uint256 z) {
    require((z = x + y) >= x, "ds-math-add-overflow");
  }

  function sub(uint256 x, uint256 y) internal pure returns (uint256 z) {
    require((z = x - y) <= x, "ds-math-sub-underflow");
  }

  function mul(uint256 x, uint256 y) internal pure returns (uint256 z) {
    require(y == 0 || (z = x * y) / y == x, "ds-math-mul-overflow");
  }
}

library FixedPoint {
  // range: [0, 2**112 - 1]
  // resolution: 1 / 2**112
  struct uq112x112 {
    uint224 _x;
  }

  // range: [0, 2**144 - 1]
  // resolution: 1 / 2**112
  struct uq144x112 {
    uint256 _x;
  }

  uint8 private constant RESOLUTION = 112;

  // encode a uint112 as a UQ112x112
  function encode(uint112 x) internal pure returns (uq112x112 memory) {
    return uq112x112(uint224(x) << RESOLUTION);
  }

  // encodes a uint144 as a UQ144x112
  function encode144(uint144 x) internal pure returns (uq144x112 memory) {
    return uq144x112(uint256(x) << RESOLUTION);
  }

  // divide a UQ112x112 by a uint112, returning a UQ112x112
  function div(uq112x112 memory self, uint112 x) internal pure returns (uq112x112 memory) {
    require(x != 0, "FixedPoint: DIV_BY_ZERO");
    return uq112x112(self._x / uint224(x));
  }

  // multiply a UQ112x112 by a uint, returning a UQ144x112
  // reverts on overflow
  function mul(uq112x112 memory self, uint256 y) internal pure returns (uq144x112 memory) {
    uint256 z;
    require(y == 0 || (z = uint256(self._x) * y) / y == uint256(self._x), "FixedPoint: MULTIPLICATION_OVERFLOW");
    return uq144x112(z);
  }

  // returns a UQ112x112 which represents the ratio of the numerator to the denominator
  // equivalent to encode(numerator).div(denominator)
  function fraction(uint112 numerator, uint112 denominator) internal pure returns (uq112x112 memory) {
    require(denominator > 0, "FixedPoint: DIV_BY_ZERO");
    return uq112x112((uint224(numerator) << RESOLUTION) / denominator);
  }

  // decode a UQ112x112 into a uint112 by truncating after the radix point
  function decode(uq112x112 memory self) internal pure returns (uint112) {
    return uint112(self._x >> RESOLUTION);
  }

  // decode a UQ144x112 into a uint144 by truncating after the radix point
  function decode144(uq144x112 memory self) internal pure returns (uint144) {
    return uint144(self._x >> RESOLUTION);
  }
}

library MdexOracleLibrary {
  using FixedPoint for *;

  // helper function that returns the current block timestamp within the range of uint32, i.e. [0, 2**32 - 1]
  function currentBlockTimestamp() internal view returns (uint32) {
    return uint32(block.timestamp % 2**32);
  }

  // produces the cumulative price using counterfactuals to save gas and avoid a call to sync.
  function currentCumulativePrices(address pair)
    internal
    view
    returns (
      uint256 price0Cumulative,
      uint256 price1Cumulative,
      uint32 blockTimestamp
    )
  {
    blockTimestamp = currentBlockTimestamp();
    price0Cumulative = IMdexPair(pair).price0CumulativeLast();
    price1Cumulative = IMdexPair(pair).price1CumulativeLast();

    // if time has elapsed since the last update on the pair, mock the accumulated price values
    (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) = IMdexPair(pair).getReserves();
    if (blockTimestampLast != blockTimestamp) {
      // subtraction overflow is desired
      uint32 timeElapsed = blockTimestamp - blockTimestampLast;
      // addition overflow is desired
      // counterfactual
      price0Cumulative += uint256(FixedPoint.fraction(reserve1, reserve0)._x) * timeElapsed;
      // counterfactual
      price1Cumulative += uint256(FixedPoint.fraction(reserve0, reserve1)._x) * timeElapsed;
    }
  }
}

contract Oracle {
  using FixedPoint for *;
  using SafeMath for uint256;

  struct Observation {
    uint256 timestamp;
    uint256 price0Cumulative;
    uint256 price1Cumulative;
  }

  address public immutable factory;
  uint256 public constant CYCLE = 15 minutes;

  // mapping from pair address to a list of price observations of that pair
  mapping(address => Observation) public pairObservations;

  constructor(address factory_) public {
    factory = factory_;
  }

  function update(address tokenA, address tokenB) external {
    address pair = IMdexFactory(factory).pairFor(tokenA, tokenB);

    Observation storage observation = pairObservations[pair];
    uint256 timeElapsed = block.timestamp - observation.timestamp;
    require(timeElapsed >= CYCLE, "MDEXOracle: PERIOD_NOT_ELAPSED");
    (uint256 price0Cumulative, uint256 price1Cumulative, ) = MdexOracleLibrary.currentCumulativePrices(pair);
    observation.timestamp = block.timestamp;
    observation.price0Cumulative = price0Cumulative;
    observation.price1Cumulative = price1Cumulative;
  }

  function computeAmountOut(
    uint256 priceCumulativeStart,
    uint256 priceCumulativeEnd,
    uint256 timeElapsed,
    uint256 amountIn
  ) private pure returns (uint256 amountOut) {
    // overflow is desired.
    FixedPoint.uq112x112 memory priceAverage =
      FixedPoint.uq112x112(uint224((priceCumulativeEnd - priceCumulativeStart) / timeElapsed));
    amountOut = priceAverage.mul(amountIn).decode144();
  }

  function consult(
    address tokenIn,
    uint256 amountIn,
    address tokenOut
  ) external view returns (uint256 amountOut) {
    address pair = IMdexFactory(factory).pairFor(tokenIn, tokenOut);
    Observation storage observation = pairObservations[pair];
    uint256 timeElapsed = block.timestamp - observation.timestamp;
    (uint256 price0Cumulative, uint256 price1Cumulative, ) = MdexOracleLibrary.currentCumulativePrices(pair);
    (address token0, ) = IMdexFactory(factory).sortTokens(tokenIn, tokenOut);

    if (token0 == tokenIn) {
      return computeAmountOut(observation.price0Cumulative, price0Cumulative, timeElapsed, amountIn);
    } else {
      return computeAmountOut(observation.price1Cumulative, price1Cumulative, timeElapsed, amountIn);
    }
  }
}
