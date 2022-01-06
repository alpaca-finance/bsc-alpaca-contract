// SPDX-License-Identifier: UNLICENSED
/**
  ∩~~~~∩ 
  ξ ･×･ ξ 
  ξ　~　ξ 
  ξ　　 ξ 
  ξ　　 “~～~～〇 
  ξ　　　　　　 ξ 
  ξ ξ ξ~～~ξ ξ ξ 
　 ξ_ξξ_ξ　ξ_ξξ_ξ
Alpaca Fin Corporation
*/

pragma solidity 0.6.6;
pragma experimental ABIEncoderV2;

import "../Vault.sol";

contract Actions {
  /// @dev The next position ID to be assigned.
  uint256 public nextPositionID;
  /// @dev Mapping of vault => vault's position ID => surrogate key
  mapping(address => mapping(uint256 => uint256)) public surrogateOf;
  /// @dev Mapping of vault => vault's positionId => owner
  mapping(address => mapping(uint256 => address)) public ownerOf;

  constructor() public {
    nextPositionID = 1;
  }

  uint8 private constant ACTION_NEW_SURROGATE = 1;
  uint8 private constant ACTION_WORK = 2;

  function _doNewSurrogate() internal returns (uint256) {
    return nextPositionID++;
  }

  function _doWork(
    bytes memory _data,
    uint256 _msgValue,
    uint256 _surrogateID
  ) internal {
    // 1. Decode data
    (
      address payable _vault,
      uint256 _posId,
      address _worker,
      uint256 _principalAmount,
      uint256 _borrowAmount,
      uint256 _maxReturn,
      bytes memory _workData
    ) = abi.decode(_data, (address, uint256, address, uint256, uint256, uint256, bytes));
    // 2. Sanity check
    // - If new position, then set ownerOf to be msg.sender
    // - else check that msg.sender is the one who altering the position
    if (_posId == 0) {
      require(_surrogateID != 0, "bad surrogate");
      uint256 _nextPositionID = Vault(_vault).nextPositionID();
      ownerOf[_vault][_nextPositionID] = msg.sender;
      surrogateOf[_vault][_nextPositionID] = _surrogateID;
    } else require(ownerOf[_vault][_posId] == msg.sender, "!owner");
    // 3. Call work to altering Vault position
    Vault(_vault).work{ value: _msgValue }(_posId, _worker, _principalAmount, _borrowAmount, _maxReturn, _workData);
  }

  function execute(
    uint8[] calldata _actions,
    uint256[] calldata _msgValues,
    bytes[] calldata _datas
  ) external payable {
    uint256 value;
    for (uint256 i = 0; i < _actions.length; i++) {
      uint8 _action = _actions[i];
      if (_action == ACTION_NEW_SURROGATE) {
        value = _doNewSurrogate();
      }
      if (_action == ACTION_WORK) {
        _doWork(_datas[i], _msgValues[i], value);
      }
    }
  }
}
