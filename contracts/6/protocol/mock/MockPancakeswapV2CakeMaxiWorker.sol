pragma solidity 0.6.6;

import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakePair.sol";
import "../apis/pancake/IPancakeRouter02.sol";
import "../interfaces/IStrategy.sol";
import "../interfaces/IWorker.sol";
import "../interfaces/IPancakeMasterChef.sol";
import "../../utils/AlpacaMath.sol";
import "../../utils/SafeToken.sol";

/// @notice Simplified version of worker for testing purpose.
contract MockPancakeswapV2CakeMaxiWorker is IWorker {
  using SafeToken for address;

  address public override baseToken;
  address public override farmingToken;

  constructor(address _baseToken, address _farmingToken) public {
    baseToken = _baseToken;
    farmingToken = _farmingToken;
  }

  /// @dev Work on the given position. Must be called by the operator.
  /// @param user The original user that is interacting with the operator.
  /// @param debt The amount of user debt to help the strategy make decisions.
  /// @param data The encoded data, consisting of strategy address and calldata.
  function work(uint256 /* id */, address user, uint256 debt, bytes calldata data)
    external override
  {
    (address strat, bytes memory ext) = abi.decode(data, (address, bytes));
    baseToken.safeTransfer(strat, baseToken.myBalance());
    farmingToken.safeTransfer(strat, farmingToken.myBalance());
    IStrategy(strat).execute(user, debt, ext);
    baseToken.safeTransfer(msg.sender, baseToken.myBalance());
  }

  /// @dev Re-invest whatever the worker is working on.
  function reinvest() external override {}

  /// @dev Return the amount of wei to get back if we are to liquidate the position.
  function health(uint256 /*id*/) external override view returns (uint256) { return 0; }

  /// @dev Liquidate the given position to token. Send all token back to its Vault.
  function liquidate(uint256 /*id*/) external override {}

  /// @dev SetStretegy that be able to executed by the worker.
  function setStrategyOk(address[] calldata /*strats*/, bool /*isOk*/) external override {}

  /// @dev Set address that can be reinvest
  function setReinvestorOk(address[] calldata /*reinvestor*/, bool /*isOk*/) external override {}

  /// @dev LP token holds by worker
  function lpToken() external override view returns (IPancakePair) { return IPancakePair(address(0)); }
}
