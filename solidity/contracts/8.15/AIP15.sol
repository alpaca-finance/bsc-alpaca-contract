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
    febEmissionPoolId = fairLaunch.getFairLaunchPoolId();
    alpaca = ERC20Upgradeable(fairLaunch.alpaca());
  }

  /// @notice Deposit FEB_EMISSION_DUMMY to FairLaunch.
  function depositFebEmissionDummy() external onlyOwner {
    require(febEmissionDummy.balanceOf(address(fairLaunch)) == 0, "deposited");
    IProxyToken(address(febEmissionDummy)).mint(address(this), 1e18);
    febEmissionDummy.safeApprove(address(fairLaunch), 1e18);
    fairLaunch.deposit(address(this), febEmissionPoolId, 1e18);
    emit DepositFebEmissionDummy();
  }

  /// @notice Withdraw FEB_EMISSION_DUMMY from FairLaunch.
  function withdrawFebEmissionDummy() external onlyOwner {
    fairLaunch.withdraw(address(this), febEmissionPoolId, 1e18);
    IProxyToken(address(febEmissionDummy)).burn(address(this), 1e18);
    emit WithdrawFebEmissionDummy();
  }

  /// @notice Harvest ALPACA from FairLaunch.
  function harvest() external {
    fairLaunch.harvest(febEmissionPoolId);
  }

  /// @notice Withdraw ALPACA to "to", which should be the account holding reserved incentives.
  function withdraw(address to) external onlyOwner {
    uint256 balance = alpaca.balanceOf(address(this));
    /// NOTE: 240_000 is the amount of ALPACA reserved for incentives from Feb's emission.
    require(balance >= 240_000 ether, "!reached");
    alpaca.safeTransfer(to, balance);
  }
}
