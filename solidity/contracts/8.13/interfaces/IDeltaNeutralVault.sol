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

pragma solidity 0.8.13;

interface IDeltaNeutralVault {
  function stableToken() external returns (address);

  function shareToValue(uint256 _shareAmount) external view returns (uint256);

  function deposit(
    uint256 _stableTokenAmount,
    uint256, /*_assetTokenAmount*/
    address _shareReceiver,
    uint256 _minShareReceive,
    bytes calldata _data
  ) external payable returns (uint256);

  function withdraw(
    uint256 _shareAmount,
    uint256 _minStableTokenAmount,
    uint256, /*_minAssetTokenAmount*/
    bytes calldata _data
  ) external returns (uint256);
}
