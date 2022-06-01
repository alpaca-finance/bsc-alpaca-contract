// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { DSTest } from "./DSTest.sol";

import { VM } from "../utils/VM.sol";
import { console } from "../utils/console.sol";

import { ProxyAdminLike } from "../interfaces/ProxyAdminLike.sol";

import { MockErc20Like } from "../interfaces/MockErc20Like.sol";

import { TripleSlopeModelLike } from "../interfaces/TripleSlopeModelLike.sol";

import { DebtTokenLike } from "../interfaces/DebtTokenLike.sol";
import { SimpleVaultConfigLike } from "../interfaces/SimpleVaultConfigLike.sol";
import { VaultLike } from "../interfaces/VaultLike.sol";
import { NFTBoostedLeverageControllerLike } from "../interfaces/NFTBoostedLeverageControllerLike.sol";
import { NFTStakingLike } from "../interfaces/NFTStakingLike.sol";
import { MockNFTLike } from "../interfaces/MockNFTLike.sol";
import { MockPancakeswapV2WorkerLike } from "../interfaces/MockPancakeswapV2WorkerLike.sol";
import { xALPACACreditorLike } from "../interfaces/xALPACACreditorLike.sol";
import { xALPACAPriceSetterLike } from "../interfaces/xALPACAPriceSetterLike.sol";
import { AutomatedVaultControllerLike } from "../interfaces/AutomatedVaultControllerLike.sol";
import { DeltaNeutralVault02Like } from "../interfaces/DeltaNeutralVault02Like.sol";

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

  function _setupMockNFT() internal returns (MockNFTLike) {
    bytes memory _logicBytecode = abi.encodePacked(vm.getCode("./out/MockNFT.sol/MockNFT.json"));
    bytes memory _initializer = abi.encodeWithSelector(bytes4(keccak256("initialize()")));
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return MockNFTLike(payable(_proxy));
  }

  function _setupNFTStaking() internal returns (NFTStakingLike) {
    bytes memory _logicBytecode = abi.encodePacked(vm.getCode("./out/NFTStaking.sol/NFTStaking.json"));
    bytes memory _initializer = abi.encodeWithSelector(bytes4(keccak256("initialize()")));
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return NFTStakingLike(payable(_proxy));
  }

  function _setupNFTBoostedLeverageController(address _nftStaking) internal returns (NFTBoostedLeverageControllerLike) {
    bytes memory _logicBytecode = abi.encodePacked(
      vm.getCode("./out/NFTBoostedLeverageController.sol/NFTBoostedLeverageController.json")
    );
    bytes memory _initializer = abi.encodeWithSelector(bytes4(keccak256("initialize(address)")), _nftStaking);
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return NFTBoostedLeverageControllerLike(_proxy);
  }

  function _setupPancakeswapV2Worker() internal returns (MockPancakeswapV2WorkerLike) {
    bytes memory _bytecode = abi.encodePacked(
      vm.getCode("./out/MockPancakeswapV2Worker.sol/MockPancakeswapV2Worker.json")
    );
    address _address;
    assembly {
      _address := create(0, add(_bytecode, 0x20), mload(_bytecode))
    }
    return MockPancakeswapV2WorkerLike(address(_address));
  }

  function _setupTripleSlope(string memory _version) internal returns (TripleSlopeModelLike) {
    bytes memory _bytecode = abi.encodePacked(
      vm.getCode(
        string(abi.encodePacked("./out/TripleSlopeModel", _version, ".sol", "/TripleSlopeModel", _version, ".json"))
      )
    );
    address _address;
    assembly {
      _address := create(0, add(_bytecode, 0x20), mload(_bytecode))
    }
    return TripleSlopeModelLike(_address);
  }

  function _setupxALPACACreditor(address _xALPACA, uint256 _valuePerxALPACA) internal returns (xALPACACreditorLike) {
    bytes memory _logicBytecode = abi.encodePacked(vm.getCode("./out/xALPACACreditor.sol/xALPACACreditor.json"));
    bytes memory _initializer = abi.encodeWithSelector(
      bytes4(keccak256("initialize(address,uint256)")),
      _xALPACA,
      _valuePerxALPACA
    );
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return xALPACACreditorLike(_proxy);
  }

  function _setupxALPACAPriceSetter(address _xALPACACreditor, address _TWAPOracle, address _alpacaAddress) internal returns (xALPACAPriceSetterLike) {
    bytes memory _logicBytecode = abi.encodePacked(vm.getCode("./out/xALPACAPriceSetter.sol/xALPACAPriceSetter.json"));
    bytes memory _initializer = abi.encodeWithSelector(
      bytes4(keccak256("initialize(address,address,address)")),
      _xALPACACreditor,
      _TWAPOracle,
      _alpacaAddress
    );
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return xALPACAPriceSetterLike(_proxy);
  }

  function _setupxAutomatedVaultController(address[] memory _creditors, address[] memory _deltaVaults)
    internal
    returns (AutomatedVaultControllerLike)
  {
    bytes memory _logicBytecode = abi.encodePacked(
      vm.getCode("./out/AutomatedVaultController.sol/AutomatedVaultController.json")
    );
    bytes memory _initializer = abi.encodeWithSelector(
      bytes4(keccak256("initialize(address[],address[])")),
      _creditors,
      _deltaVaults
    );
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return AutomatedVaultControllerLike(_proxy);
  }

  function _setupDeltaNeutralVault02(
    string memory _name,
    string memory _symbol,
    address _stableVault,
    address _assetVault,
    address _stableVaultWorker,
    address _assetVaultWorker,
    address _lpToken,
    address _alpacaToken,
    address _priceOracle,
    address _config
  ) internal returns (DeltaNeutralVault02Like) {
    bytes memory _logicBytecode = abi.encodePacked(
      vm.getCode("./out/DeltaNeutralVault02.sol/DeltaNeutralVault02.json")
    );
    bytes memory _initializer = abi.encodeWithSelector(
      bytes4(keccak256("initialize(string,string,address,address,address,address,address,address,address,address)")),
      _name,
      _symbol,
      _stableVault,
      _assetVault,
      _stableVaultWorker,
      _assetVaultWorker,
      _lpToken,
      _alpacaToken,
      _priceOracle,
      _config
    );
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return DeltaNeutralVault02Like(payable(_proxy));
  }
}
