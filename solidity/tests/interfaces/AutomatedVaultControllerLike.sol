// SPDX-License-Identifier: BUSL
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

pragma solidity >=0.8.4 <0.9.0;

interface AutomatedVaultControllerLike {
  function totalCredit(address _user) external view returns (uint256);

  function usedCredit(address _user) external view returns (uint256);

  function availableCredit(address _user) external view returns (uint256);

  function onDeposit(
    address _user,
    uint256 _shareAmount,
    uint256 _shareValue
  ) external;

  function onWithdraw(address _user, uint256 _shareAmount) external;

  function userVaultShares(bytes32) external view returns (uint256);

  function getUserVaultShares(address _user, address _vault) external view returns (uint256);

  function getId(address, address) external view returns (bytes32);

  function addPrivateVaults(address[] memory) external;

  function removePrivateVaults(address[] memory) external;

  function setCreditors(address[] memory) external;
}
