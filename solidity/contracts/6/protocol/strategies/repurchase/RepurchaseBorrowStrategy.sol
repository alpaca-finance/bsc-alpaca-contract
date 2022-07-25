// SPDX-License-Identifier: MIT
/**
  ∩~~~~∩ 
  ξ ･×･ ξ 
  ξ　~　ξ 
  ξ　　 ξ 
  ξ　　 “~～~～〇 
  ξ　　　　　　 ξ 
  ξ ξ ξ~～~ξ ξ ξ 
　 ξ_ξξ_ξ　ξ_ξξ_ξ
Alpaca Fin Corporation
*/

pragma solidity 0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";

import "../../interfaces/IPancakePair.sol";
import "../../apis/pancake/IPancakeRouter02.sol";
import "../../interfaces/IStrategy.sol";
import "../../interfaces/IVault.sol";
import "../../../utils/SafeToken.sol";
import "../../interfaces/IWorker.sol";

contract RepurchaseBorrowStrategy is OwnableUpgradeSafe, ReentrancyGuardUpgradeSafe, IStrategy {
  using SafeToken for address;

  mapping(address => bool) public okWorkers;
  mapping(address => bool) public okDeltaNeutralVaults;

  /// @notice require that only allowed workers are able to do the rest of the method call
  modifier onlyWhitelistedWorkers() {
    require(okWorkers[msg.sender], "RepurchaseBorrowStrategy::onlyWhitelistedWorkers:: bad worker");
    _;
  }

  /// @dev Create a new add two-side optimal strategy instance.
  function initialize() external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
  }

  /// @dev Execute worker strategy. Take BaseToken + FarmingToken. Return LP tokens.
  /// @param data Extra calldata information passed along to this strategy.
  function execute(
    address, /* user */
    uint256,
    /* debt */
    bytes calldata data
  ) external override onlyWhitelistedWorkers nonReentrant {
    // 1. Retrieve the DeltaNeutralVault which perform this repurchasing
    address _deltaNeutralVault = abi.decode(data, (address));
    require(okDeltaNeutralVaults[_deltaNeutralVault], "RepurchaseBorrowStrategy::execute:: bad target");

    // 2. Get the lp token
    IWorker worker = IWorker(msg.sender);
    address baseToken = worker.baseToken();
    IPancakePair lpToken = worker.lpToken();
    uint256 baseTokenBalance = baseToken.myBalance();

    baseToken.safeTransfer(_deltaNeutralVault, baseTokenBalance);
    require(
      lpToken.transfer(msg.sender, lpToken.balanceOf(address(this))),
      "RepurchaseBorrowStrategy::execute:: failed to transfer LP token to msg.sender"
    );
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < workers.length; idx++) {
      okWorkers[workers[idx]] = isOk;
    }
  }

  function setDeltaNeutralVaultsOk(address[] calldata deltaNeutralVaults, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < deltaNeutralVaults.length; idx++) {
      okDeltaNeutralVaults[deltaNeutralVaults[idx]] = isOk;
    }
  }
}
