pragma solidity 0.5.16;

import "@pancakeswap-libs/pancake-swap-core/contracts/PancakeFactory.sol";

contract MockPancakeFactory is PancakeFactory {
  constructor(address _feeToSetter) public PancakeFactory(_feeToSetter) {}
}