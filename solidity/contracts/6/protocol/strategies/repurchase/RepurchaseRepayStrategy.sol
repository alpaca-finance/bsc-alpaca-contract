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
import "../../interfaces/IStrategy.sol";
import "../../interfaces/IVault.sol";
import "../../../utils/SafeToken.sol";
import "../../interfaces/IWorker.sol";

contract RepurchaseRepayStrategy is OwnableUpgradeSafe, ReentrancyGuardUpgradeSafe, IStrategy {
  using SafeToken for address;
  IVault public vault;

  mapping(address => bool) public okWorkers;

  /// @notice require that only allowed workers are able to do the rest of the method call
  modifier onlyWhitelistedWorkers() {
    require(okWorkers[msg.sender], "RepurchaseRepayStrategy::onlyWhitelistedWorkers:: bad worker");
    _;
  }

  /// @dev Create a new add two-side optimal strategy instance.
  function initialize(IVault _vault) external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
    vault = _vault;
  }

  /// @dev Execute worker strategy. Receive BaseToken transferred from DeltaNeutralVault then return LP tokens and base tokens to repay debt.
  /// @param data Extra calldata information passed along to this strategy.
  function execute(
    address, /* user */
    uint256,
    /* debt */
    bytes calldata data
  ) external override onlyWhitelistedWorkers nonReentrant {
    // 1. Retrieve the debt repayment amount
    uint256 _repayAmount = abi.decode(data, (uint256));
    IWorker worker = IWorker(msg.sender);
    address baseToken = worker.baseToken();
    IPancakePair lpToken = worker.lpToken();

    // 2. Request the base token from DeltaNeutralVault contract to repay debt
    vault.requestFunds(baseToken, _repayAmount);

    // 3. Simply transfer the base token and LP back to worker to repay debt
    uint256 baseTokenBalance = baseToken.myBalance();
    baseToken.safeTransfer(msg.sender, baseTokenBalance);
    require(
      lpToken.transfer(msg.sender, lpToken.balanceOf(address(this))),
      "RepurchaseRepayStrategy::execute:: failed to transfer LP token to msg.sender"
    );
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < workers.length; idx++) {
      okWorkers[workers[idx]] = isOk;
    }
  }
}
