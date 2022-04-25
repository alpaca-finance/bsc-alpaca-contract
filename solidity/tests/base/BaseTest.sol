// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { DSTest } from "./DSTest.sol";

import { VM } from "../utils/VM.sol";
import { console } from "../utils/console.sol";

import { ProxyAdminLike } from "../interfaces/ProxyAdminLike.sol";

import { MockErc20Like } from "../interfaces/MockErc20Like.sol";

import { DebtTokenLike } from "../interfaces/DebtTokenLike.sol";
import { SimpleVaultConfigLike } from "../interfaces/SimpleVaultConfigLike.sol";
import { VaultLike } from "../interfaces/VaultLike.sol";

// solhint-disable const-name-snakecase
// solhint-disable no-inline-assembly
contract BaseTest is DSTest {
  address internal constant ALICE = address(0x88);
  address internal constant BOB = address(0x168);
  address internal constant CAT = address(0x99);
  address internal constant EVE = address(0x55);

  VM internal constant vm = VM(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

  ProxyAdminLike internal proxyAdmin;

  constructor() {
    proxyAdmin = _setupProxyAdmin();
  }

  function _setupUpgradeable(bytes memory _logicBytecode, bytes memory _initializer) internal returns (address) {
    bytes memory _proxyBytecode = abi.encodePacked(
      vm.getCode("./out/AdminUpgradeabilityProxy.sol/AdminUpgradeabilityProxy.json")
    );

    address _logic;
    assembly {
      _logic := create(0, add(_logicBytecode, 0x20), mload(_logicBytecode))
    }

    _proxyBytecode = abi.encodePacked(_proxyBytecode, abi.encode(_logic, address(proxyAdmin), _initializer));

    address _proxy;
    assembly {
      _proxy := create(0, add(_proxyBytecode, 0x20), mload(_proxyBytecode))
      if iszero(extcodesize(_proxy)) {
        revert(0, 0)
      }
    }

    return _proxy;
  }

  function _setupProxyAdmin() internal returns (ProxyAdminLike) {
    bytes memory _bytecode = abi.encodePacked(vm.getCode("./out/ProxyAdmin.sol/ProxyAdmin.json"));
    address _address;
    assembly {
      _address := create(0, add(_bytecode, 0x20), mload(_bytecode))
    }
    return ProxyAdminLike(address(_address));
  }

  function _setupToken(
    string memory _name,
    string memory _symbol,
    uint8 _decimals
  ) internal returns (MockErc20Like) {
    bytes memory _logicBytecode = abi.encodePacked(vm.getCode("./out/MockERC20.sol/MockERC20.json"));
    bytes memory _initializer = abi.encodeWithSelector(
      bytes4(keccak256("initialize(string,string,uint8)")),
      _name,
      _symbol,
      _decimals
    );
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return MockErc20Like(payable(_proxy));
  }

  function _setupDebtToken(
    string memory _name,
    string memory _symbol,
    uint8 _decimals,
    address _timelock
  ) internal returns (DebtTokenLike) {
    bytes memory _logicBytecode = abi.encodePacked(vm.getCode("./out/DebtToken.sol/DebtToken.json"));
    bytes memory _initializer = abi.encodeWithSelector(
      bytes4(keccak256("initialize(string,string,uint8,address)")),
      _name,
      _symbol,
      _decimals,
      _timelock
    );
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return DebtTokenLike(payable(_proxy));
  }

  function _setupSimpleVaultConfig(
    uint256 _minDebtSize,
    uint256 _interestRate,
    uint256 _reservePoolBps,
    uint256 _killBps,
    address _getWrappedNativeAddr,
    address _getWNativeRelayer,
    address _getFairLaunchAddr,
    uint256 _getKillTreasuryBps,
    address _treasury
  ) internal returns (SimpleVaultConfigLike) {
    bytes memory _logicBytecode = abi.encodePacked(vm.getCode("./out/SimpleVaultConfig.sol/SimpleVaultConfig.json"));
    bytes memory _initializer = abi.encodeWithSelector(
      bytes4(keccak256("initialize(uint256,uint256,uint256,uint256,address,address,address,uint256,address)")),
      _minDebtSize,
      _interestRate,
      _reservePoolBps,
      _killBps,
      _getWrappedNativeAddr,
      _getWNativeRelayer,
      _getFairLaunchAddr,
      _getKillTreasuryBps,
      _treasury
    );
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return SimpleVaultConfigLike(_proxy);
  }

  function _setupVault(
    address _vaultConfig,
    address _token,
    string memory _name,
    string memory _symbol,
    uint8 _decimals,
    address _debtToken
  ) internal returns (VaultLike) {
    bytes memory _logicBytecode = abi.encodePacked(vm.getCode("./out/Vault.sol/Vault.json"));
    bytes memory _initializer = abi.encodeWithSelector(
      bytes4(keccak256("initialize(address,address,string,string,uint8,address)")),
      _vaultConfig,
      _token,
      _name,
      _symbol,
      _decimals,
      _debtToken
    );
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return VaultLike(payable(_proxy));
  }
}
