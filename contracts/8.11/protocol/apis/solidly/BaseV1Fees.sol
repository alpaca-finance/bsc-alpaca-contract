// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.11;

import "./erc20.sol";

contract BaseV1Fees {
  address internal immutable pair; // The pair it is bonded to
  address internal immutable token0; // token0 of pair, saved localy and statically for gas optimization
  address internal immutable token1; // Token1 of pair, saved localy and statically for gas optimization

  constructor(address _token0, address _token1) {
    pair = msg.sender;
    token0 = _token0;
    token1 = _token1;
  }

  function _safeTransfer(
    address token,
    address to,
    uint256 value
  ) internal {
    require(token.code.length > 0);
    (bool success, bytes memory data) = token.call(abi.encodeWithSelector(erc20.transfer.selector, to, value));
    require(success && (data.length == 0 || abi.decode(data, (bool))));
  }

  // Allow the pair to transfer fees to users
  function claimFeesFor(
    address recipient,
    uint256 amount0,
    uint256 amount1
  ) external {
    require(msg.sender == pair);
    if (amount0 > 0) _safeTransfer(token0, recipient, amount0);
    if (amount1 > 0) _safeTransfer(token1, recipient, amount1);
  }
}
