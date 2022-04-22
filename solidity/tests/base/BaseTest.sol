// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import { DSTest } from "./DSTest.sol";

import { VM } from "../utils/VM.sol";
import { console } from "../utils/console.sol";

import { ProxyAdmin } from "../../contracts/6/upgradeable/ProxyAdmin.sol";

contract BaseTest is DSTest {
  address internal constant ALICE = address(0x88);
  address internal constant BOB = address(0x168);
  address internal constant CAT = address(0x99);
  address internal constant EVE = address(0x55);

  VM internal constant vm = VM(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

  ProxyAdmin internal proxyAdmin;

  constructor() {
    proxyAdmin = _setupProxyAdmin();
  }

  function _setupProxyAdmin() internal returns (ProxyAdmin) {
    return new ProxyAdmin();
  }

  function _setupUpgradeableErc20(string memory _name, string memory _symbol) internal returns (UpgradeableErc20) {
    UpgradeableErc20 _impl = new UpgradeableErc20();
    TransparentUpgradeableProxy _proxy = new TransparentUpgradeableProxy(
      address(_impl),
      address(proxyAdmin),
      abi.encodeWithSelector(bytes4(keccak256("initialize(string,string)")), _name, _symbol)
    );

    return UpgradeableErc20(address(_proxy));
  }
}
