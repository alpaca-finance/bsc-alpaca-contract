pragma solidity 0.6.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "./PriceOracle.sol";

/**
    ∩~~~~∩ 
    ξ ･×･ ξ 
    ξ　~　ξ 
    ξ　　 ξ 
    ξ　　 “~～~～〇 
    ξ　　　　　　 ξ 
    ξ ξ ξ~～~ξ ξ ξ 
　  ξ_ξξ_ξ　ξ_ξξ_ξ
 */

contract OracleRouter is OwnableUpgradeSafe, PriceOracle {
    using SafeMath for uint256;

    // Mapping from token0, token1 to number of sources
    mapping(address => mapping(address => uint)) public primarySourceCount;
    // Mapping from token0, token1 to (mapping from index to oracle source)
    mapping(address => mapping(address => mapping(uint => PriceOracle))) public primarySources;
    // Mapping from token0, token1 to max price deviation (multiplied by 1e18)
    mapping(address => mapping(address => uint)) public maxPriceDeviations;
    // min price deviation
    uint public constant MIN_PRICE_DEVIATION = 1e18; 
    // max price deviation
    uint public constant MAX_PRICE_DEVIATION = 1.5e18; 

    event SetPrimarySources(address indexed token0, address indexed token1, uint maxPriceDeviation, PriceOracle[] oracles);

    function initialize() external initializer {
        OwnableUpgradeSafe.__Ownable_init();
    }

    /// @dev Set oracle primary sources for the token pair
    /// @param token0 Token0 address to set oracle sources
    /// @param token1 Token1 address to set oracle sources
    /// @param maxPriceDeviation Max price deviation (in 1e18) for token pair
    /// @param sources Oracle sources for the token pair
    function setPrimarySources(
        address token0,
        address token1,
        uint maxPriceDeviation,
        PriceOracle[] calldata sources
    ) external onlyOwner {
        _setPrimarySources(token0, token1, maxPriceDeviation, sources);
    }

    /// @dev Set oracle primary sources for multiple token pairs
    /// @param token0s List of token0 addresses to set oracle sources
    /// @param token1s List of token1 addresses to set oracle sources
    /// @param maxPriceDeviationList List of max price deviations (in 1e18) for token pairs
    /// @param allSources List of oracle sources for token pairs
    function setMultiPrimarySources(
        address[] calldata token0s,
        address[] calldata token1s,
        uint[] calldata maxPriceDeviationList,
        PriceOracle[][] calldata allSources
    ) external onlyOwner {
        require(token0s.length == token1s.length && token0s.length == allSources.length && token0s.length == maxPriceDeviationList.length, "inconsistent length");
        for (uint idx = 0; idx < token0s.length; idx++) {
            _setPrimarySources(token0s[idx], token1s[idx], maxPriceDeviationList[idx], allSources[idx]);
        }
    }

    /// @dev Set oracle primary sources for token pair
    /// @param token0 Token0 to set oracle sources
    /// @param token1 Token1 to set oracle sources
    /// @param maxPriceDeviation Max price deviation (in 1e18) for token pair
    /// @param sources Oracle sources for the token pair
    function _setPrimarySources(
        address token0,
        address token1,
        uint maxPriceDeviation,
        PriceOracle[] memory sources
    ) internal {
        require(
            maxPriceDeviation >= MIN_PRICE_DEVIATION && maxPriceDeviation <= MAX_PRICE_DEVIATION,
            "bad max deviation value"
        );
        require(sources.length <= 3, "sources length exceed 3");
        primarySourceCount[token0][token1] = sources.length;
        primarySourceCount[token1][token0] = sources.length;
        maxPriceDeviations[token0][token1] = maxPriceDeviation;
        maxPriceDeviations[token1][token0] = maxPriceDeviation;
        for (uint idx = 0; idx < sources.length; idx++) {
            primarySources[token0][token1][idx] = sources[idx];
            primarySources[token1][token0][idx] = sources[idx];
        }
        emit SetPrimarySources(token0, token1, maxPriceDeviation, sources);
    }

    /// @dev Return token0/token1 price
    /// @param token0 Token0 to get price of
    /// @param token1 Token1 to get price of
    /// NOTE: Support at most 3 oracle sources per token
    function _getPrice(address token0, address token1) public view returns (uint256) {
        uint candidateSourceCount = primarySourceCount[token0][token1];
        require(candidateSourceCount > 0, "no primary source");
        uint[] memory prices = new uint[](candidateSourceCount);
        // Get valid oracle sources
        uint validSourceCount = 0;
        for (uint idx = 0; idx < candidateSourceCount; idx++) {
            try primarySources[token0][token1][idx].getPrice(token0, token1) returns (uint256 price, uint lastUpdate) {
                prices[validSourceCount++] = price;
            } catch {}
        }
        require(validSourceCount > 0, "no valid source");
        for (uint i = 0; i < validSourceCount - 1; i++) {
            for (uint j = 0; j < validSourceCount - i - 1; j++) {
                if (prices[j] > prices[j + 1]) {
                (prices[j], prices[j + 1]) = (prices[j + 1], prices[j]);
                }
            }
        }
        uint maxPriceDeviation = maxPriceDeviations[token0][token1];
        // Algo:
        // - 1 valid source --> return price
        // - 2 valid sources
        //     --> if the prices within deviation threshold, return average
        //     --> else revert
        // - 3 valid sources --> check deviation threshold of each pair
        //     --> if all within threshold, return median
        //     --> if one pair within threshold, return average of the pair
        //     --> if none, revert
        // - revert otherwise
        if (validSourceCount == 1) {
            return prices[0]; // if 1 valid source, return
        } else if (validSourceCount == 2) {
            require(
                prices[1].mul(1e18) / prices[0] <= maxPriceDeviation,
                "too much deviation (2 valid sources)"
            );
            return prices[0].add(prices[1]) / 2; // if 2 valid sources, return average
        } else if (validSourceCount == 3) {
            bool midMinOk = prices[1].mul(1e18) / prices[0] <= maxPriceDeviation;
            bool maxMidOk = prices[2].mul(1e18) / prices[1] <= maxPriceDeviation;
            if (midMinOk && maxMidOk) {
                return prices[1]; // if 3 valid sources, and each pair is within thresh, return median
            } else if (midMinOk) {
                return prices[0].add(prices[1]) / 2; // return average of pair within thresh
            } else if (maxMidOk) {
                return prices[1].add(prices[2]) / 2; // return average of pair within thresh
            } else {
                revert("too much deviation (3 valid sources)");
            }
        } else {
            revert("more than 3 valid sources not supported");
        }
    }

    /// @dev Return the price of token0/token1, multiplied by 1e18
    function getPrice(address token0, address token1) external view override returns (uint256, uint) {
        return (_getPrice(token0, token1), block.timestamp);
    }
}