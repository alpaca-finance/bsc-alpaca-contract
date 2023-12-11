// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import { console } from "@forge-std/console.sol";
import { TestBase } from "@forge-std/Base.sol";
import { StdCheatsSafe, StdCheats } from "@forge-std/StdCheats.sol";
import { StdStorage, stdStorageSafe } from "@forge-std/StdStorage.sol";
import { ATest } from "@tests/base/ATest.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import { TreasuryBuybackStrategy, IPancakeV3MasterChef, ICommonV3Pool } from "solidity/contracts/8.10/protocol/TreasuryBuybackStrategy.sol";

interface ProxyAdminLike {
  function upgrade(address proxy, address implementation) external;
}

// solhint-disable contract-name-camelcase
contract TreasuryBuybackStrategy_BaseTest is TestBase, ATest, StdCheats {
  address internal constant deployer = 0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51;
  address internal constant proxyAdmin = 0x5379F32C8D5F663EACb61eeF63F722950294f452;
  address internal constant timeLock = 0x2D5408f2287BF9F9B05404794459a846651D0a59;
  address internal constant alpaca = 0x8F0528cE5eF7B51152A59745bEfDD91D97091d2F;
  address internal constant usdt = 0x55d398326f99059fF775485246999027B3197955;
  address internal constant cake = 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82;
  address internal constant masterChef = 0x556B9306565093C855AEA9AE92A594704c2Cd59e;
  address internal constant positionManager = 0x46A15B0b27311cedF172AB29E4f4766fbE7F4364;
  address internal constant usdt_alpaca_100_pool = 0xcfe783e16c9a8C74F2be9BCEb2339769439061Bf;
  address internal constant revenueTreasury = 0x08B5A95cb94f926a8B620E87eE92e675b35afc7E;
  address internal constant pcsV3Router = 0x13f4EA83D0bd40E75C8222255bc855a974568Dd4;
  address internal constant chainlinkOracle = 0x634902128543b25265da350e2d961C7ff540fC71;

  uint256 internal slippageBps = 500;
  TreasuryBuybackStrategy internal treasurybuybackStrat;

  function setUp() public virtual {
    // Fork test based on tendery
    vm.createSelectFork(vm.envString("BSC_MAINNET_RPC"), 34135168);

    vm.startPrank(deployer);
    treasurybuybackStrat = _setTreasuryBuybackStrategy(
      masterChef,
      positionManager,
      usdt_alpaca_100_pool,
      alpaca,
      revenueTreasury,
      pcsV3Router,
      chainlinkOracle,
      slippageBps
    );

    vm.stopPrank();
  }

  function _setTreasuryBuybackStrategy(
    address _masterChef,
    address _positionManager,
    address _pool,
    address _token,
    address _revenueTreasury,
    address _pcsV3Router,
    address _oracle,
    uint256 _slippageBps
  ) internal returns (TreasuryBuybackStrategy) {
    bytes memory _logicBytecode = abi.encodePacked(
      vm.getCode("./out/TreasuryBuybackStrategy.sol/TreasuryBuybackStrategy.json")
    );
    bytes memory _initializer = abi.encodeWithSelector(
      bytes4(keccak256("initialize(address,address,address,address,address,address,address,uint256)")),
      _masterChef,
      _positionManager,
      _pool,
      _token,
      _revenueTreasury,
      _pcsV3Router,
      _oracle,
      _slippageBps
    );
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return TreasuryBuybackStrategy(_proxy);
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

  // @dev a callback function for v3 pool swap
  function pancakeV3SwapCallback(int256 _amount0Delta, int256 _amount1Delta, bytes calldata /*_data*/) external {
    address _token0 = ICommonV3Pool(usdt_alpaca_100_pool).token0();
    address _token1 = ICommonV3Pool(usdt_alpaca_100_pool).token1();
    if (_amount0Delta > 0) {
      IERC20Upgradeable(_token0).transfer(msg.sender, uint256(_amount0Delta));
    } else {
      IERC20Upgradeable(_token1).transfer(msg.sender, uint256(_amount1Delta));
    }
  }

  // @dev a helper function for v3 pool swap
  function _swapExactInput(address _tokenIn, uint256 _swapAmount) internal {
    address _token0 = ICommonV3Pool(usdt_alpaca_100_pool).token0();

    deal(_tokenIn, address(this), uint256(_swapAmount));

    bool _zeroForOne = _tokenIn == _token0 ? true : false;

    ICommonV3Pool(usdt_alpaca_100_pool).swap(
      address(this),
      _zeroForOne,
      int256(_swapAmount),
      _zeroForOne ? uint160(4295128739 + 1) : uint160(1461446703485210103287273052203988822378723970342 - 1), // no price limit
      abi.encode("")
    );
  }
}
