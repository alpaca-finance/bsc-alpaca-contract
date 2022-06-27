// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, AUSDCreditorLike } from "../../base/BaseTest.sol";
import { mocking } from "../../utils/mocking.sol";
import { MockContract } from "../../utils/MockContract.sol";

import { IAUSDStaking } from "../../../contracts/8.13/interfaces/IAUSDStaking.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract AUSDCreditor_Test is BaseTest {
  using mocking for *;
  uint64 private constant VALUE_PER_AUSD_STAKING = 2 ether;

  AUSDCreditorLike private _creditor;
  IAUSDStaking private _AUSDStaking;

  address private _userAddress = address(1);

  function setUp() external {
    _AUSDStaking = IAUSDStaking(address(new MockContract()));
    _AUSDStaking.balanceOf.mockv(_userAddress, 1 ether);

    _creditor = _setupAUSDCreditor(address(_AUSDStaking), VALUE_PER_AUSD_STAKING);
    _creditor.setValueSetter(ALICE);
  }

  function testCorrectness_getUserCredit() external {
    assertEq(_creditor.getUserCredit(_userAddress), 2 ether);
  }

  function testCorrectness_afterUpdateValuePerxALPACA() external {
    vm.prank(ALICE);
    _creditor.setValuePerxALPACA(4 ether);
    assertEq(_creditor.getUserCredit(_userAddress), 4 ether);
  }

  function testCannotSetValueSetterIfNotOwner() external {
    vm.expectRevert("Ownable: caller is not the owner");
    vm.prank(ALICE);
    _creditor.setValueSetter(BOB);
  }

  function testCannotSetValuePerXalpacaMoreThanThreshold() external {
    vm.expectRevert(abi.encodeWithSignature("xALPACACreditor_ValueTooHigh()"));
    vm.prank(ALICE);
    _creditor.setValuePerxALPACA(10000 ether);
  }

  function testCanSetValuePerXalpacaLessThanThreshold(uint256 _value) external {
    vm.assume(_value < 1000 ether);
    vm.prank(ALICE);
    _creditor.setValuePerxALPACA(_value);
  }

  function testCannotSetValuePerXalpacaIfNotValueSetter() external {
    vm.expectRevert(abi.encodeWithSignature("xALPACACreditor_Unauthorize()"));
    vm.prank(BOB);
    _creditor.setValuePerxALPACA(10 ether);
  }
}
