// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 < 0.9.0;

/// DEPS
import { VM } from "./VM.sol";

// mocking library
library mocking {
  address private constant HEVM_ADDRESS =
    address(bytes20(uint160(uint256(keccak256("hevm cheat code")))));

  VM private constant vm = VM(HEVM_ADDRESS);

  // func() => address
  function mock(function() external returns (address) f, address  returned1)
    internal
  {
    vm.mockCall(
      f.address,
      abi.encodeWithSelector(f.selector),
      abi.encode(returned1)
    );
  }

  // func() payable => address
  function mockp(function () external payable returns (address) f, address  returned1)
    internal
  {
    vm.mockCall(
      f.address,
      abi.encodeWithSelector(f.selector),
      abi.encode(returned1)
    );
  }

  // func () view => address
  function mockv(function () external view returns (address) f, address  returned1)
    internal
  {
    vm.mockCall(
      f.address,
      abi.encodeWithSelector(f.selector),
      abi.encode(returned1)
    );
  }


  // func(address,address) view => uint256, uint256
  function mockv(function(address,address) external view returns (uint256, uint256) f, address addr1, address addr2, uint256 returned1, uint256 returned2)
    internal
  {
    vm.mockCall(
      f.address,
      abi.encodeWithSelector(f.selector, addr1, addr2),
      abi.encode(returned1, returned2)
    );
  }

    // func(address) view => uint256
  function mockv(function(address) external view returns (uint256) f, address addr1, uint256 returned1)
    internal
  {
    vm.mockCall(
      f.address,
      abi.encodeWithSelector(f.selector, addr1),
      abi.encode(returned1)
    );
  }

  // func(address) view => bool
  function mockv(function(address) external view returns (bool) f, address addr1, bool returned1)
    internal
  {
    vm.mockCall(
      f.address,
      abi.encodeWithSelector(f.selector, addr1),
      abi.encode(returned1)
    );
  }

  // func () view => uint256
  function mockv(function () external view returns (uint256) f, uint256  returned1)
    internal
  {
    vm.mockCall(
      f.address,
      abi.encodeWithSelector(f.selector),
      abi.encode(returned1)
    );
  }

  // func () view => uint8
  function mockv(function () external view returns (uint8) f, uint8  returned1)
    internal
  {
    vm.mockCall(
      f.address,
      abi.encodeWithSelector(f.selector),
      abi.encode(returned1)
    );
  }

  // func (uint256) view => uint256
  function mockv(function (uint256) external view returns (uint256) f, uint256 num1, uint256  returned1)
    internal
  {
    vm.mockCall(
      f.address,
      abi.encodeWithSelector(f.selector, num1),
      abi.encode(returned1)
    );
  }

    // func (address, uint256) view => (uint256, uint256)
  function mockv(function (uint256,address) external view returns (uint256, uint256) f, uint256 num1, address addr1, uint256  returned1, uint256 returned2)
    internal
  {
    vm.mockCall(
      f.address,
      abi.encodeWithSelector(f.selector, num1, addr1),
      abi.encode(returned1,returned2)
    );
  }


    // func (address) view => (uint256, uint256)
  function mockv(function (address) external view returns (uint256, uint256) f, address addr1, uint256  returned1, uint256 returned2)
    internal
  {
    vm.mockCall(
      f.address,
      abi.encodeWithSelector(f.selector, addr1),
      abi.encode(returned1,returned2)
    );
  }
}