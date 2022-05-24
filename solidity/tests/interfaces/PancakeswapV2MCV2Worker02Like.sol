// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.7.0 <0.9.0;

interface PancakeswapV2MCV2Worker02Like {
  function addStrat() external view returns (address);

  function balanceToShare(uint256 balance) external view returns (uint256);

  function baseToken() external view returns (address);

  function beneficialVault() external view returns (address);

  function beneficialVaultBountyBps() external view returns (uint256);

  function buybackAmount() external view returns (uint256);

  function cake() external view returns (address);

  function factory() external view returns (address);

  function farmingToken() external view returns (address);

  function fee() external view returns (uint256);

  function feeDenom() external view returns (uint256);

  function getMktSellAmount(
    uint256 aIn,
    uint256 rIn,
    uint256 rOut
  ) external view returns (uint256);

  function getPath() external view returns (address[] memory);

  function getReinvestPath() external view returns (address[] memory);

  function getReversedPath() external view returns (address[] memory);

  function getRewardPath() external view returns (address[] memory);

  function health(uint256 id) external view returns (uint256);

  function initialize(
    address _operator,
    address _baseToken,
    address _masterChef,
    address _router,
    uint256 _pid,
    address _addStrat,
    address _liqStrat,
    uint256 _reinvestBountyBps,
    address _treasuryAccount,
    address[] memory _reinvestPath,
    uint256 _reinvestThreshold
  ) external;

  function liqStrat() external view returns (address);

  function liquidate(uint256 id) external;

  function lpToken() external view returns (address);

  function masterChef() external view returns (address);

  function masterChefV2() external view returns (address);

  function maxReinvestBountyBps() external view returns (uint256);

  function okReinvestors(address) external view returns (bool);

  function okStrats(address) external view returns (bool);

  function operator() external view returns (address);

  function owner() external view returns (address);

  function pendingCake() external view returns (uint256);

  function pid() external view returns (uint256);

  function reinvest() external;

  function reinvestBountyBps() external view returns (uint256);

  function reinvestPath(uint256) external view returns (address);

  function reinvestThreshold() external view returns (uint256);

  function renounceOwnership() external;

  function rewardPath(uint256) external view returns (address);

  function router() external view returns (address);

  function setBeneficialVaultConfig(
    uint256 _beneficialVaultBountyBps,
    address _beneficialVault,
    address[] memory _rewardPath
  ) external;

  function setCriticalStrategies(address _addStrat, address _liqStrat) external;

  function setMaxReinvestBountyBps(uint256 _maxReinvestBountyBps) external;

  function setReinvestConfig(
    uint256 _reinvestBountyBps,
    uint256 _reinvestThreshold,
    address[] memory _reinvestPath
  ) external;

  function setReinvestorOk(address[] memory reinvestors, bool isOk) external;

  function setRewardPath(address[] memory _rewardPath) external;

  function setStrategyOk(address[] memory strats, bool isOk) external;

  function setTreasuryConfig(address _treasuryAccount, uint256 _treasuryBountyBps) external;

  function shareToBalance(uint256 share) external view returns (uint256);

  function shares(uint256) external view returns (uint256);

  function totalShare() external view returns (uint256);

  function transferOwnership(address newOwner) external;

  function treasuryAccount() external view returns (address);

  function treasuryBountyBps() external view returns (uint256);

  function wNative() external view returns (address);

  function work(
    uint256 id,
    address user,
    uint256 debt,
    bytes memory data
  ) external;
}
