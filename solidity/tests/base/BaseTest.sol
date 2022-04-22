// SPDX-License-Identifier: MIT
pragma solidity 0.6.6;

import { DSTest } from "./DSTest.sol";

import { VM } from "../utils/VM.sol";
import { console } from "../utils/console.sol";

import { ProxyAdmin } from "../../contracts/6/upgradeable/ProxyAdmin.sol";
import { AdminUpgradeabilityProxy } from "../../contracts/6/upgradeable/AdminUpgradeabilityProxy.sol";

import { Vault } from "../../contracts/6/protocol/Vault.sol";

import { IMiniFL } from "../interfaces/IMiniFL.sol";

contract BaseTest is DSTest {
  address internal constant ALICE = address(0x88);
  address internal constant BOB = address(0x168);
  address internal constant CAT = address(0x99);
  address internal constant EVE = address(0x55);

  VM internal constant vm = VM(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

  ProxyAdmin internal proxyAdmin;

  constructor() public {
    proxyAdmin = _setupProxyAdmin();
  }

  function _setupProxyAdmin() internal returns (ProxyAdmin) {
    return new ProxyAdmin();
  }

  function _setupVault() internal returns (Vault) {
    Vault _impl = new Vault();
    AdminUpgradeabilityProxy _proxy = new AdminUpgradeabilityProxy(
      address(_impl),
      address(proxyAdmin),
      abi.encodeWithSelector(
        bytes4(keccak256("initialize(address,address,string,string,uint8,address)")),
        address(0),
        address(0),
        "ibToken",
        "ibToken",
        18,
        address(0)
      )
    );
    return Vault(address(_proxy));
  }

  function _setupMiniFL() internal returns (IMiniFL) {
    bytes memory _bytecode = abi.encodePacked(vm.getCode("../../../../out/MiniFL.sol/MiniFL.json"));
    address _impl;
    assembly {
      _impl := create(0, add(_bytecode, 0x20), mload(_bytecode))
    }
    return IMiniFL(_impl);
  }
}
