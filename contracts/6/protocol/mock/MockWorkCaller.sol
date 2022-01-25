pragma solidity 0.6.6;

import "../Vault.sol";
import "../../utils/SafeToken.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

contract MockWorkCaller is Initializable {
  using SafeToken for address;
  Vault public vault;

  function initialize(Vault _vault) external initializer {
    vault = _vault;
    vault.token().safeApprove(address(vault), uint256(-1));
  }

  function executeWork(
    address worker,
    uint256 principalAmount,
    uint256 borrowAmount,
    uint256 maxReturn,
    address strat,
    uint256 farmingTokenAmount,
    uint256 minLpAmount
  ) external returns (uint256 positionID) {
    positionID = vault.nextPositionID();

    bytes memory stratData = abi.encode(farmingTokenAmount, minLpAmount);
    bytes memory vaultData = abi.encode(strat, stratData);
    vault.work(0, worker, principalAmount, borrowAmount, maxReturn, vaultData);
  }
}
