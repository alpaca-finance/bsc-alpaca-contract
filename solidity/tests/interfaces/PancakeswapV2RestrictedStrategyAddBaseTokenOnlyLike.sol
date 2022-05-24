// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.7.0 <0.9.0;

interface PancakeswapV2RestrictedStrategyAddBaseTokenOnlyLike {
  function execute(
    address,
    uint256,
    bytes memory data
  ) external;

  function factory() external view returns (address);

  function initialize(address _router) external;

  function okWorkers(address) external view returns (bool);

  function owner() external view returns (address);

  function renounceOwnership() external;

  function router() external view returns (address);

  function setWorkersOk(address[] memory workers, bool isOk) external;

  function transferOwnership(address newOwner) external;
}
