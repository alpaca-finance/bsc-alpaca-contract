pragma solidity >=0.8.4 <0.9.0;

interface RepurchaseBorrowStrategyLike {
  function execute(
    address, /* user */
    uint256,
    /* debt */
    bytes calldata data
  ) external;

  function setWorkersOk(address[] calldata workers, bool isOk) external;

  function setDeltaNeutralVaultsOk(address[] calldata deltaNeutralVaults, bool isOk) external;
}
