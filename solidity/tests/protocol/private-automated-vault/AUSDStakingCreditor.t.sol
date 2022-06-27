// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, AUSDStakingCreditorLike } from "../../base/BaseTest.sol";
import { mocking } from "../../utils/mocking.sol";
import { MockContract } from "../../utils/MockContract.sol";

import { IAUSDStaking } from "../../../contracts/8.13/interfaces/IAUSDStaking.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract AUSDStakingCreditor_Test is BaseTest {
  using mocking for *;
  uint64 private constant VALUE_PER_AUSD_STAKING = 2 ether;

  AUSDStakingCreditorLike private _creditor;
  IAUSDStaking private _AUSDStaking;

  address private _userAddress = address(1);

  function setUp() external {
    _AUSDStaking = IAUSDStaking(address(new MockContract()));
    _AUSDStaking.balanceOf.mockv(_userAddress, 1 ether);

    _creditor = _setupAUSDStakingCreditor(address(_AUSDStaking), VALUE_PER_AUSD_STAKING);
    _creditor.setValueSetter(ALICE);
  }

  function testCorrectness_getUserCredit() external {
    assertEq(_creditor.getUserCredit(_userAddress), 2 ether);
  }

  function testCorrectness_afterUpdateValuePerAUSDStaking() external {
    vm.prank(ALICE);
    _creditor.setValuePerAUSDStaking(4 ether);
    assertEq(_creditor.getUserCredit(_userAddress), 4 ether);
  }

  function testCannotSetValueSetterIfNotOwner() external {
    vm.expectRevert("Ownable: caller is not the owner");
    vm.prank(ALICE);
    _creditor.setValueSetter(BOB);
  }

  function testCannotSetValuePerAUSDStakingMoreThanThreshold() external {
    vm.expectRevert(abi.encodeWithSignature("AUSDStakingCreditor_ValueTooHigh()"));
    vm.prank(ALICE);
    _creditor.setValuePerAUSDStaking(10000 ether);
  }

  function testCanSetValuePerAUSDStakingLessThanThreshold(uint256 _value) external {
    vm.assume(_value < 1000 ether);
    vm.prank(ALICE);
    _creditor.setValuePerAUSDStaking(_value);
  }

  function testCannotSetValuePerAUSDStakingIfNotValueSetter() external {
    vm.expectRevert(abi.encodeWithSignature("AUSDStakingCreditor_Unauthorize()"));
    vm.prank(BOB);
    _creditor.setValuePerAUSDStaking(10 ether);
  }
}
