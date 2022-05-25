// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, xALPACAPriceSetterLike, xALPACACreditorLike } from "../../base/BaseTest.sol";
import { mocking } from "../../utils/mocking.sol";
import { MockContract } from "../../utils/MockContract.sol";

import { ITWAPOracle } from "../../../contracts/8.13/interfaces/ITWAPOracle.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract xAlpacaPriceSetter_Test is BaseTest {
  using mocking for *;

  xALPACAPriceSetterLike private _setter;
  xALPACACreditorLike private _creditor;
  ITWAPOracle private _twapOracle;

  address private _alpacaAddress = address(1);
  address private _xAlpacaAddress = address(2);

  function setUp() external {
    _creditor = _setupxALPACACreditor(_xAlpacaAddress, 0);

    _twapOracle = ITWAPOracle(address(new MockContract()));
    _twapOracle.getPrice.mockv(_alpacaAddress, 2 ether);

    _setter = _setupxALPACAPriceSetter(address(_creditor), address(_twapOracle), _alpacaAddress);

    _creditor.setValueSetter(address(_setter));
    _setter.setPriceSetter(ALICE);
  }

  function testCorrectness_afterSetValueFromTWAP() external {
    vm.prank(ALICE);
    _setter.setValueFromTWAP();
    assertEq(_creditor.valuePerxALPACA(), 2 ether);
  }

  function testCannotSetPriceSetter() external {
    vm.expectRevert("Ownable: caller is not the owner");
    vm.prank(ALICE);
    _setter.setPriceSetter(ALICE);
  }

  function testCannotSetValueFromTWAP() external {
    vm.expectRevert(abi.encodeWithSignature("xALPACAPriceSetter_Unauthorize()"));
    vm.prank(BOB);
    _setter.setValueFromTWAP();
  }
}