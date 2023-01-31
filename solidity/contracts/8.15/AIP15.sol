// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IFairLaunch } from "./interfaces/IFairLaunch.sol";
import { IProxyToken } from "./interfaces/IProxyToken.sol";

contract Aip15 is Initializable, OwnableUpgradeable {
  // dependencies
  using SafeERC20Upgradeable for ERC20Upgradeable;

  // configurations
  IFairLaunch public fairLaunch;
  uint256 public febEmissionPoolId;
  ERC20Upgradeable public febEmissionDummy;
  ERC20Upgradeable public alpaca;

  // states
  bool public isStarted;
  bool public isReached;

  event DepositFebEmissionDummy();
  event WithdrawFebEmissionDummy();

  function initialize(
    IFairLaunch _fairLaunch,
    ERC20Upgradeable _febEmissionDummy,
    uint256 _febEmissionPoolId
  ) external initializer {
    // Check
    (address shouldBeFebEmissionDummy, , , , ) = _fairLaunch.poolInfo(_febEmissionPoolId);
    require(shouldBeFebEmissionDummy == address(_febEmissionDummy), "bad febEmissionPoolId");

    OwnableUpgradeable.__Ownable_init();
    fairLaunch = _fairLaunch;
    febEmissionDummy = _febEmissionDummy;
    febEmissionPoolId = _febEmissionPoolId;
    alpaca = ERC20Upgradeable(fairLaunch.alpaca());
    isStarted = false;
    isReached = false;
  }

  /// @notice Deposit FEB_EMISSION_DUMMY to FairLaunch.
  function depositFebEmissionDummy() external onlyOwner {
    // Check
    // Only allow to deposit FEB_EMISSION_DUMMY once.
    require(!isStarted, "started");

    // Effect
    isStarted = true;

    // Interaction
    IProxyToken(address(febEmissionDummy)).mint(address(this), 1e18);
    febEmissionDummy.safeApprove(address(fairLaunch), 1e18);
    fairLaunch.deposit(address(this), febEmissionPoolId, 1e18);

    // Log
    emit DepositFebEmissionDummy();
  }

  /// @notice Withdraw FEB_EMISSION_DUMMY from FairLaunch.
  function withdrawFebEmissionDummy() external {
    // Check
    require(!isReached, "reached");
    uint256 balance = alpaca.balanceOf(address(this));
    // Only allow to withdraw FEB_EMISSION_DUMMY once ALPACA balance reaches 240,000 ALPACA.
    require(balance >= 240_000 ether, "!reached");

    // Effect
    isReached = true;

    // Interaction
    // Withdraw FEB_EMISSION_DUMMY from FairLaunch.
    fairLaunch.withdraw(address(this), febEmissionPoolId, 1e18);
    // Burn FEB_EMISSION_DUMMY.
    IProxyToken(address(febEmissionDummy)).burn(address(this), 1e18);
    // Withdraw all ALPACA from Aip15 to owner.
    // Use balanceOf(address(this)) instead of balance to avoid leftover ALPACA
    // due to withdraw also harvest ALPACA.
    alpaca.safeTransfer(owner(), alpaca.balanceOf(address(this)));

    // Log
    emit WithdrawFebEmissionDummy();
  }

  /// @notice Harvest ALPACA from FairLaunch.
  function harvest() external {
    fairLaunch.harvest(febEmissionPoolId);
  }
}
