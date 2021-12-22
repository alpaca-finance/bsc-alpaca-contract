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

import "./interfaces/ISwapPairLike.sol";
import "./interfaces/ISwapFactoryLike.sol";
import "./interfaces/IWBNB.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "../utils/SafeToken.sol";

/// @title AlpacaRouter - Router for routing swap path over multiple dexes
contract AlpacaRouter is Ownable {
  using SafeMath for uint256;

  mapping(address => bool) public whitelistedFactories;
  address public immutable wbnb;

  modifier ensure(uint256 deadline) {
    require(deadline >= block.timestamp, "expired");
    _;
  }

  constructor(address _wbnb) public {
    wbnb = _wbnb;
  }

  receive() external payable {
    assert(msg.sender == wbnb);
    // only accept BNB via fallback from the WBNB contract
  }

  function setWhiltelistedFactories(address[] calldata _factories, bool[] calldata _allow) external onlyOwner {
    require(_factories.length == _allow.length, "bad length");
    for (uint256 i = 0; i < _factories.length; i++) {
      whitelistedFactories[_factories[i]] = _allow[i];
    }
  }

  function _getAmountsOut(
    address[] memory _factories,
    uint256 _amountIn,
    address[] memory _path
  ) internal view returns (uint256[] memory) {
    require(_path.length >= 2, "bad _path");
    require(_factories.length == _path.length.sub(1), "bad _factories length");

    uint256[] memory amounts = new uint256[](_path.length);
    amounts[0] = _amountIn;
    for (uint256 i = 0; i < _path.length.sub(1); i++) {
      require(whitelistedFactories[_factories[i]], "not whitelisted");
      (uint256 _reserveIn, uint256 _reserveOut) = ISwapFactoryLike(_factories[i]).getReserves(_path[i], _path[i + 1]);
      amounts[i + 1] = ISwapFactoryLike(_factories[i]).getAmountOut(
        amounts[i],
        _reserveIn,
        _reserveOut,
        _path[i],
        _path[i + 1]
      );
    }
    return amounts;
  }

  /// @notice Perform the actual swap
  /// @dev requires the initial amount to have already been sent to the first pair
  /// @param _factories the dex factories to use
  /// @param _amounts the amounts to swap
  /// @param _path the path to use
  /// @param _to the address to send the final amount to
  function _swap(
    address[] memory _factories,
    uint256[] memory _amounts,
    address[] memory _path,
    address _to
  ) internal virtual {
    for (uint256 i = 0; i < _path.length - 1; i++) {
      (address _input, address _output) = (_path[i], _path[i + 1]);
      (address _token0, ) = ISwapFactoryLike(_factories[i]).sortTokens(_input, _output);
      uint256 _amountOut = _amounts[i + 1];
      (uint256 _amount0Out, uint256 _amount1Out) =
        _input == _token0 ? (uint256(0), _amountOut) : (_amountOut, uint256(0));
      address _next = i < _path.length - 2 ? ISwapFactoryLike(_factories[i]).pairFor(_output, _path[i + 2]) : _to;
      ISwapPairLike(ISwapFactoryLike(_factories[i]).pairFor(_input, _output)).swap(
        _amount0Out,
        _amount1Out,
        _next,
        new bytes(0)
      );
    }
  }

  function swapExactTokensForTokens(
    address[] calldata _factories,
    uint256 _amountIn,
    uint256 _amountOutMin,
    address[] calldata _path,
    address _to,
    uint256 _deadline
  ) external ensure(_deadline) returns (uint256[] memory) {
    uint256[] memory _amounts = _getAmountsOut(_factories, _amountIn, _path);
    require(_amounts[_amounts.length - 1] >= _amountOutMin, "insufficient output amount");
    SafeToken.safeTransferFrom(
      _path[0],
      msg.sender,
      ISwapFactoryLike(_factories[0]).pairFor(_path[0], _path[1]),
      _amounts[0]
    );
    _swap(_factories, _amounts, _path, _to);
    return _amounts;
  }
}
