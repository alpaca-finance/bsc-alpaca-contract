pragma solidity >=0.8.4 <0.9.0;

interface RepurchaseRepayStrategyLike {
  function execute(
    address, /* user */
    uint256,
    /* debt */
    bytes calldata data
  ) external;

  function setWorkersOk(address[] calldata workers, bool isOk) external;
}
