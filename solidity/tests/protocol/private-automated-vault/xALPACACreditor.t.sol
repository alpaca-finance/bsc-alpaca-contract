// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { BaseTest, console, xALPACACreditorLike } from "../../base/BaseTest.sol";

import { xALPACACreditor } from "../../../contracts/8.13/xALPACACreditor.sol";
import { IxALPACA } from "../../../contracts/8.13/interfaces/IxALPACA.sol";

import { mocking } from "../../utils/mocking.sol";
import { MockContract } from "../../utils/MockContract.sol";

// solhint-disable func-name-mixedcase
// solhint-disable contract-name-camelcase
contract xAlpacaCreditor_Test is BaseTest {
  using mocking for *;
  uint64 private constant VALUE_PER_XALPACA = 2e18;

  xALPACACreditorLike private _creditor;
  IxALPACA private _xALPACA;

  address private _userAddress = address(1);

  function setUp() external {
    _xALPACA = IxALPACA(address(new MockContract()));
    _xALPACA.epoch.mockv(1);
    _xALPACA.balanceOf.mockv(_userAddress, 1e18);

    _creditor = _setupxALPACACreditor(address(_xALPACA), VALUE_PER_XALPACA);
  }

  function testCorrectness_getUserCredit() external {
    assertEq(_creditor.getUserCredit(_userAddress), 2e18);
  }
}
