// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { AIP8AUSDStaking_BaseForkTest, AIP8AUSDStakingLike, console, UserInfo } from "@tests/forks/aip-8/AIP8AUSDStaking_BaseTest.fork.sol";
import { IFairLaunch } from "@alpaca-finance/8.15/interfaces/IFairLaunch.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract AIP8AUSDStaking_TestLock is AIP8AUSDStaking_BaseForkTest {
  function testRevert_WhenLock() external {
    vm.expectRevert(abi.encodeWithSignature("AIP8AUSDStaking_Terminated()"));
    aip8AUSDStaking.lock(0, 0);
  }
}
