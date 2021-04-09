pragma solidity 0.6.6;

interface IWorkerConfig {
  /// @dev Return whether the given worker accepts more debt.
  function acceptDebt(address worker) external view returns (bool);
  /// @dev Return the work factor for the worker + ETH debt, using 1e4 as denom.
  function workFactor(address worker, uint256 debt) external view returns (uint256);
  /// @dev Return the kill factor for the worker + ETH debt, using 1e4 as denom.
  function killFactor(address worker, uint256 debt) external view returns (uint256);
}
