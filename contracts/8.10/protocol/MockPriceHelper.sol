pragma solidity 0.8.10;

import "./interfaces/IPriceHelper.sol";

contract PriceHelper is IPriceHelper {
  constructor() public {}

  /// @dev Return value in USD for the given lpAmount.
  function lpToDollar(uint256 lpAmount, address pancakeLPToken) external view returns (uint256) {
    return 0;
  }

  /// @dev Return amount of LP for the given USD.
  function DollarToLP(uint256 dollar, address pancakeLPToken) external view returns (uint256) {
    return 0;
  }

  function getTokenPrice(address pancakeLPToken) external view returns (uint256) {
    return 0;
  }
}
