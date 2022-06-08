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

pragma solidity 0.8.13;

/// @title FakeDeltaWorker : A fake worker used for unit testing
contract FakeAutomateVaultController {
  error AutomatedVaultController_InsufficientCredit();

  bool revertOnDeposit;

  function setRevertOnDeposit(bool _shouldRevert) external {
    revertOnDeposit = _shouldRevert;
  }

  function onDeposit(
    address _user,
    uint256 _shareAmount,
    uint256 _shareValue
  ) external {
    if (revertOnDeposit) revert AutomatedVaultController_InsufficientCredit();
  }

  function onWithdraw(address _user, uint256 _shareAmount) external {}
}
