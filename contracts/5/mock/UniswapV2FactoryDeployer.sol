pragma solidity 0.5.16;

import "@uniswap/v2-core/contracts/UniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/UniswapV2Pair.sol";

contract UniswapV2FactoryDeployer {
  UniswapV2Factory public factory;

  constructor(address _feeToSetter) public {
    factory = new UniswapV2Factory(_feeToSetter);
  }

  function getPairCodeHash() public pure returns (bytes32) {
    return keccak256(type(UniswapV2Pair).creationCode);
  }
}