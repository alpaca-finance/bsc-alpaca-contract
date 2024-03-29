// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

import { TestBase } from "@forge-std/Base.sol";
import { console } from "@forge-std/console.sol";
import { StdCheatsSafe } from "@forge-std/StdCheats.sol";

import { ATest } from "@tests/base/ATest.sol";
import { ProxyAdminLike } from "../interfaces/ProxyAdminLike.sol";

import { MockErc20Like } from "../interfaces/MockErc20Like.sol";
import { MockLpErc20Like } from "../interfaces/MockLpErc20Like.sol";

import { TripleSlopeModelLike } from "../interfaces/TripleSlopeModelLike.sol";

import { DebtTokenLike } from "../interfaces/DebtTokenLike.sol";
import { SimpleVaultConfigLike } from "../interfaces/SimpleVaultConfigLike.sol";
import { VaultLike } from "../interfaces/VaultLike.sol";
import { NFTBoostedLeverageControllerLike } from "../interfaces/NFTBoostedLeverageControllerLike.sol";
import { NFTStakingLike } from "../interfaces/NFTStakingLike.sol";
import { MockNFTLike } from "../interfaces/MockNFTLike.sol";
import { MockPancakeswapV2WorkerLike } from "../interfaces/MockPancakeswapV2WorkerLike.sol";
import { AUSDStakingCreditorLike } from "../interfaces/AUSDStakingCreditorLike.sol";
import { xALPACACreditorLike } from "../interfaces/xALPACACreditorLike.sol";
import { xALPACAPriceSetterLike } from "../interfaces/xALPACAPriceSetterLike.sol";
import { AutomatedVaultControllerLike } from "../interfaces/AutomatedVaultControllerLike.sol";
import { DeltaNeutralVault02Like } from "../interfaces/DeltaNeutralVault02Like.sol";
import { DirectionalVaultLike } from "../interfaces/DirectionalVaultLike.sol";
import { DeltaNeutralVault04Like } from "../interfaces/DeltaNeutralVault04Like.sol";
import { RepurchaseBorrowStrategyLike } from "../interfaces/RepurchaseBorrowStrategyLike.sol";
import { RepurchaseRepayStrategyLike } from "../interfaces/RepurchaseRepayStrategyLike.sol";
import { RepurchaseRepayStrategyLike } from "../interfaces/RepurchaseRepayStrategyLike.sol";
import { PancakeswapV2RestrictedDnxStrategyPartialCloseNoTradingLike } from "../interfaces/PancakeswapV2RestrictedDnxStrategyPartialCloseNoTradingLike.sol";
import { BiswapDnxStrategyPartialCloseNoTradingLike } from "../interfaces/BiswapDnxStrategyPartialCloseNoTradingLike.sol";

// solhint-disable const-name-snakecase
// solhint-disable no-inline-assembly
contract BaseTest is TestBase, ATest, StdCheatsSafe {
  address internal constant ALICE = address(0x88);
  address internal constant BOB = address(0x168);
  address internal constant CAT = address(0x99);
  address internal constant EVE = address(0x55);

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

  function _setupToken(string memory _name, string memory _symbol, uint8 _decimals) internal returns (MockErc20Like) {
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

  function _setupLpToken(
    string memory _name,
    string memory _symbol,
    uint8 _decimals
  ) internal returns (MockLpErc20Like) {
    bytes memory _logicBytecode = abi.encodePacked(vm.getCode("./out/MockERC20.sol/MockERC20.json"));
    bytes memory _initializer = abi.encodeWithSelector(
      bytes4(keccak256("initialize(string,string,uint8)")),
      _name,
      _symbol,
      _decimals
    );
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return MockLpErc20Like(payable(_proxy));
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

  function _setupAUSDStakingCreditor(
    address _AUSDStaking,
    uint256 _valuePerAUSDStaking
  ) internal returns (AUSDStakingCreditorLike) {
    bytes memory _logicBytecode = abi.encodePacked(
      vm.getCode("./out/AUSDStakingCreditor.sol/AUSDStakingCreditor.json")
    );
    bytes memory _initializer = abi.encodeWithSelector(
      bytes4(keccak256("initialize(address,uint256)")),
      _AUSDStaking,
      _valuePerAUSDStaking
    );
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return AUSDStakingCreditorLike(_proxy);
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

  function _setupxALPACAPriceSetter(
    address _xALPACACreditor,
    address _TWAPOracle,
    address _alpacaAddress
  ) internal returns (xALPACAPriceSetterLike) {
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

  function _setupxAutomatedVaultController(
    address[] memory _creditors,
    address[] memory _deltaVaults
  ) internal returns (AutomatedVaultControllerLike) {
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

  function _setupDirectionalVault(
    string memory _name,
    string memory _symbol,
    address _stableVault,
    address _stableVaultWorker,
    address _lpToken,
    address _alpacaToken,
    address _assetToken,
    address _priceOracle,
    address _config
  ) internal returns (DirectionalVaultLike) {
    bytes memory _logicBytecode = abi.encodePacked(vm.getCode("./out/DirectionalVault.sol/DirectionalVault.json"));
    bytes memory _initializer = abi.encodeWithSelector(
      bytes4(keccak256("initialize(string,string,address,address,address,address,address,address,address)")),
      _name,
      _symbol,
      _stableVault,
      _stableVaultWorker,
      _lpToken,
      _alpacaToken,
      _assetToken,
      _priceOracle,
      _config
    );
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return DirectionalVaultLike(payable(_proxy));
  }

  function _setupDeltaNeutralVault04(
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
  ) internal returns (DeltaNeutralVault04Like) {
    bytes memory _logicBytecode = abi.encodePacked(
      vm.getCode("./out/DeltaNeutralVault04.sol/DeltaNeutralVault04.json")
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
    return DeltaNeutralVault04Like(payable(_proxy));
  }

  function _setupRepurchaseBorrowStrategy() internal returns (RepurchaseBorrowStrategyLike) {
    bytes memory _logicBytecode = abi.encodePacked(
      vm.getCode("./out/RepurchaseBorrowStrategy.sol/RepurchaseBorrowStrategy.json")
    );
    bytes memory _initializer = abi.encodeWithSelector(bytes4(keccak256("initialize()")));
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return RepurchaseBorrowStrategyLike(payable(_proxy));
  }

  function _setupRepurchaseRepayStrategy() internal returns (RepurchaseRepayStrategyLike) {
    bytes memory _logicBytecode = abi.encodePacked(
      vm.getCode("./out/RepurchaseRepayStrategy.sol/RepurchaseRepayStrategy.json")
    );
    bytes memory _initializer = abi.encodeWithSelector(bytes4(keccak256("initialize()")));
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return RepurchaseRepayStrategyLike(payable(_proxy));
  }

  function _setupPancakeswapDnxPartialCloseNoTradingStrategy(
    address _router
  ) internal returns (PancakeswapV2RestrictedDnxStrategyPartialCloseNoTradingLike) {
    bytes memory _logicBytecode = abi.encodePacked(
      vm.getCode(
        "./out/PancakeswapV2RestrictedDnxStrategyPartialCloseNoTrading.sol/PancakeswapV2RestrictedDnxStrategyPartialCloseNoTrading.json"
      )
    );
    bytes memory _initializer = abi.encodeWithSelector(bytes4(keccak256("initialize(address)")), _router);
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return PancakeswapV2RestrictedDnxStrategyPartialCloseNoTradingLike(_proxy);
  }

  function _setupBiswapDnxPartialCloseNoTradingStrategy(
    address _router
  ) internal returns (BiswapDnxStrategyPartialCloseNoTradingLike) {
    bytes memory _logicBytecode = abi.encodePacked(
      vm.getCode("./out/BiswapDnxStrategyPartialCloseNoTrading.sol/BiswapDnxStrategyPartialCloseNoTrading.json")
    );
    bytes memory _initializer = abi.encodeWithSelector(bytes4(keccak256("initialize(address)")), _router);
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return BiswapDnxStrategyPartialCloseNoTradingLike(_proxy);
  }
}
