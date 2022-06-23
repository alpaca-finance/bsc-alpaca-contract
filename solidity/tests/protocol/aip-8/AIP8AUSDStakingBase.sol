// Test Command
// forge test --match-contract AIP8AUSDStaking -f $ARCHIVE_NODE_RPC --fork-block-number 18878744 -vv

pragma solidity >=0.8.4 <0.9.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { BaseTest } from "../../base/BaseTest.sol";
import { AIP8AUSDStakingLike, UserInfo } from "../../interfaces/AIP8AUSDStakingLike.sol";
import { console } from "../../utils/console.sol";

contract AIP8AUSDStakingBase is BaseTest {
  uint256 constant WEEK = 7 days;
  uint256 constant pid = 25;

  address constant fairlaunchAddress = 0xA625AB01B08ce023B2a342Dbb12a16f2C8489A8F;
  address constant _ALICE = 0x52Af1571D431842cc16073021bAF700aeAAa8146;
  address constant _BOB = 0x7a33e32547602e8bafc6392F4cb8f48918415522;
  address constant AUSD3EPS = 0xae70E3f6050d6AB05E03A50c655309C2148615bE;
  address constant ALPACA = 0x8F0528cE5eF7B51152A59745bEfDD91D97091d2F;

  AIP8AUSDStakingLike aip8AUSDStaking;

  function setUp() external {
    aip8AUSDStaking = _setUpAIP8AUSDStaking(fairlaunchAddress, pid);
  }

  function _setUpAIP8AUSDStaking(address _fairlaunch, uint256 _pid) internal returns (AIP8AUSDStakingLike) {
    bytes memory _logicBytecode = abi.encodePacked(vm.getCode("./out/AIP8AUSDStaking.sol/AIP8AUSDStaking.json"));
    bytes memory _initializer = abi.encodeWithSelector(
      bytes4(keccak256("initialize(address,uint256)")),
      _fairlaunch,
      _pid
    );
    address _proxy = _setupUpgradeable(_logicBytecode, _initializer);
    return AIP8AUSDStakingLike(payable(_proxy));
  }

  function _lockFor(
    address _actor,
    uint256 _expectedStakingAmount,
    uint256 _expectedLockUntil
  ) internal {
    vm.startPrank(_actor);
    IERC20Upgradeable(AUSD3EPS).approve(address(aip8AUSDStaking), type(uint256).max);
    aip8AUSDStaking.lock(_expectedStakingAmount, _expectedLockUntil);
    vm.stopPrank();
  }

  function _unlockFor(address _actor) internal {
    vm.startPrank(_actor);
    aip8AUSDStaking.unlock();
    vm.stopPrank();
  }
}
