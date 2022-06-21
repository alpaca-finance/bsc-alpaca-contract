pragma solidity >=0.8.4 <0.9.0;

import { BaseTest } from "../../base/BaseTest.sol";
import { AIP8AUSDStakingLike, UserInfo } from "../../interfaces/AIP8AUSDStakingLike.sol";
import { console } from "../../utils/console.sol";

contract AIP8AUSDStakingBase is BaseTest {
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
}
