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

pragma solidity 0.8.10;

import "../../token/interfaces/IFairLaunch.sol";
import "../../utils/SafeToken.sol";

// FairLaunch is a smart contract for distributing ALPACA by asking user to stake the ERC20-based token.
contract MockFairLaunch is IFairLaunch {
  using SafeToken for address;

  error MockFairLaunch_NotImplemented();
  // Info of each pool.
  struct PoolInfo {
    address stakeToken; // Address of Staking token contract.
    uint256 allocPoint; // How many allocation points assigned to this pool. ALPACAs to distribute per block.
    uint256 lastRewardBlock; // Last block number that ALPACAs distribution occurs.
    uint256 accAlpacaPerShare; // Accumulated ALPACAs per share, times 1e12. See below.
    uint256 accAlpacaPerShareTilBonusEnd; // Accumated ALPACAs per share until Bonus End.
  }

  // The Alpaca TOKEN!
  address public alpaca;
  address public proxyToken;
  uint256 public constant DEFAULT_HARVEST_AMOUNT = 10 * 1e18;

  uint256 public override poolLength;
  PoolInfo[] public override poolInfo;

  uint256 private mockPendingAlpaca;

  constructor(address _alpaca, address _proxyToken) {
    alpaca = _alpaca;
    proxyToken = _proxyToken;
  }

  // Not used in test
  function setPool(
    uint256 _pid,
    uint256 _allocPoint,
    bool _withUpdate
  ) external pure {
    //avoid warning
    _pid = 0;
    _allocPoint = 0;
    _withUpdate = true;
    revert MockFairLaunch_NotImplemented();
  }

  function pendingAlpaca(uint256 _pid, address _user) external view returns (uint256) {
    //avoid waring
    _pid = 0;
    _user = address(0);
    return mockPendingAlpaca;
  }

  function setPendingAlpaca(uint256 _mockPendingAlpaca) external {
    mockPendingAlpaca = _mockPendingAlpaca;
  }

  // Not used in test
  function updatePool(uint256 _pid) external pure {
    //avoid warning
    _pid = 0;
    revert MockFairLaunch_NotImplemented();
  }

  // Not used in test
  function getFairLaunchPoolId() external pure returns (uint256) {
    revert MockFairLaunch_NotImplemented();
  }

  function addPool(
    uint256 _allocPoint,
    address _stakeToken,
    bool _withUpdate
  ) external {
    //avoid warning
    _allocPoint = 0;
    _withUpdate = true;
    poolInfo.push(
      PoolInfo({
        stakeToken: _stakeToken,
        allocPoint: 0,
        lastRewardBlock: 0,
        accAlpacaPerShare: 0,
        accAlpacaPerShareTilBonusEnd: 0
      })
    );
    poolLength = poolLength + 1;
  }

  // Deposit Staking tokens to FairLaunchToken for ALPACA allocation.
  function deposit(
    address _for,
    uint256 _pid,
    uint256 _amount
  ) external override {
    //avoid warning
    _pid = 0;
    SafeToken.safeApprove(proxyToken, _for, _amount);
    proxyToken.safeTransferFrom(_for, address(this), _amount);
    SafeToken.safeApprove(proxyToken, _for, 0);
  }

  function withdraw(
    address _for,
    uint256 _pid,
    uint256 _amount
  ) external pure {
    //avoid warning
    _for = address(0);
    _pid = 0;
    _amount = 0;
    revert MockFairLaunch_NotImplemented();
  }

  function withdrawAll(address _for, uint256 _pid) external override {
    //avoid warning
    _pid = 0;

    if (proxyToken.myBalance() > 0) {
      SafeToken.safeApprove(proxyToken, _for, proxyToken.myBalance());
      proxyToken.safeTransfer(_for, proxyToken.myBalance());
      SafeToken.safeApprove(proxyToken, _for, 0);
    }
  }

  // Harvest ALPACAs earn from the pool.
  function harvest(uint256 _pid) external override {
    //avoid warning
    _pid = 0;

    require(mockPendingAlpaca <= alpaca.myBalance(), "not enough alpaca");
    SafeToken.safeApprove(alpaca, msg.sender, mockPendingAlpaca);
    alpaca.safeTransfer(msg.sender, mockPendingAlpaca);
    SafeToken.safeApprove(alpaca, msg.sender, 0);
  }
}
