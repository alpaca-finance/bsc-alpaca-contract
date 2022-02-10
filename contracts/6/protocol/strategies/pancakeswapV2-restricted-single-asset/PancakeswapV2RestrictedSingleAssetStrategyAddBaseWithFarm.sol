// SPDX-License-Identifier: BUSL-1.1
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

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";

import "../../interfaces/IPancakeFactory.sol";
import "../../interfaces/IPancakePair.sol";

import "../../apis/pancake/IPancakeRouter02.sol";
import "../../interfaces/IStrategy.sol";
import "../../interfaces/IVault.sol";
import "../../../utils/SafeToken.sol";
import "../../../utils/AlpacaMath.sol";
import "../../interfaces/IWorker02.sol";

contract PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm is
  OwnableUpgradeSafe,
  ReentrancyGuardUpgradeSafe,
  IStrategy
{
  using SafeToken for address;
  using SafeMath for uint256;

  IPancakeFactory public factory;
  IPancakeRouter02 public router;
  address public wNative;
  mapping(address => bool) public okWorkers;
  IVault public vault;

  /// @notice require that only allowed workers are able to do the rest of the method call
  modifier onlyWhitelistedWorkers() {
    require(
      okWorkers[msg.sender],
      "PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm::onlyWhitelistedWorkers:: bad worker"
    );
    _;
  }

  /// @dev Create a new add Token only strategy instance.
  /// @param _router The PancakeSwap router smart contract.
  function initialize(IPancakeRouter02 _router, IVault _vault) external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
    factory = IPancakeFactory(_router.factory());
    router = _router;
    wNative = _router.WETH();
    vault = _vault;
  }

  /// @dev Execute worker strategy. Take BaseToken along with input farmingTokenAmount. Return Farming token.
  /// @param data Extra calldata information passed along to this strategy.
  function execute(
    address, /* user */
    uint256, /* debt */
    bytes calldata data
  ) external override onlyWhitelistedWorkers nonReentrant {
    // 1. Find out how many farmingToken amount the strategy should deal with and min additional farmingTokens.
    (uint256 inputFarmingTokenAmount, uint256 minFarmingTokenAmount) = abi.decode(data, (uint256, uint256));
    IWorker02 worker = IWorker02(msg.sender);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    // 2. Approve router to do their stuffs
    baseToken.safeApprove(address(router), uint256(-1));
    // 3. Request additional fund in form of a farmingToken from the vault using inputFarmingTokenAmount
    vault.requestFunds(farmingToken, inputFarmingTokenAmount);
    uint256 balance = baseToken.myBalance();
    // 4. Convert that all baseTokens to a farmingTokens if and only if baseToken balance > 0.
    if (balance > 0) {
      router.swapExactTokensForTokens(balance, 0, worker.getPath(), address(this), now);
    }
    // 5. Transfer all farming token (as a result of conversion) back to the calling worker
    require(
      farmingToken.myBalance().sub(inputFarmingTokenAmount) >= minFarmingTokenAmount,
      "PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm::execute:: insufficient farmingToken amount received"
    );
    farmingToken.safeTransfer(msg.sender, farmingToken.myBalance());
    // 6. Reset approval for safety reason
    baseToken.safeApprove(address(router), 0);
  }

  function setWorkersOk(address[] calldata workers, bool isOk) external onlyOwner {
    for (uint256 idx = 0; idx < workers.length; idx++) {
      okWorkers[workers[idx]] = isOk;
    }
  }
}
