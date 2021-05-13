pragma solidity 0.6.6;

import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakePair.sol";
import "../apis/pancake/IPancakeRouter02.sol";
import "../interfaces/IStrategy.sol";
import "../interfaces/IWorker.sol";
import "../interfaces/IPancakeMasterChef.sol";
import "../../utils/AlpacaMath.sol";
import "../../utils/SafeToken.sol";

/// @notice Simplified version of worker for testing purpose.
contract MockPancakeswapV2CakeMaxiWorker {
  using SafeToken for address;

  address public baseToken;
  address public farmingToken;

  constructor(address _baseToken, address _farmingToken) public {
    baseToken = _baseToken;
    farmingToken = _farmingToken;
  }

  /// @dev Work on the given position. Must be called by the operator.
  /// @param user The original user that is interacting with the operator.
  /// @param debt The amount of user debt to help the strategy make decisions.
  /// @param data The encoded data, consisting of strategy address and calldata.
  function work(uint256 /* id */, address user, uint256 debt, bytes calldata data)
    external
  {
    (address strat, bytes memory ext) = abi.decode(data, (address, bytes));
    baseToken.safeTransfer(strat, baseToken.myBalance());
    farmingToken.safeTransfer(strat, farmingToken.myBalance());
    IStrategy(strat).execute(user, debt, ext);
    baseToken.safeTransfer(msg.sender, baseToken.myBalance());
  }
}
