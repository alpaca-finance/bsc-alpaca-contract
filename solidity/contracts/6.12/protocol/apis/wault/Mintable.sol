pragma solidity 0.6.12;

import "@openzeppelin/contracts/GSN/Context.sol";

contract Mintable is Context {
  /**
   * @dev So here we seperate the rights of the classic ownership into "owner" and "minter"
   * this way the developer/owner stays the "owner" and can make changes like adding a pool
   * at any time but cannot mint anymore as soon as the "minter" gets changes (to the chef contract)
   */
  address private _minter;

  event MintershipTransferred(address indexed previousMinter, address indexed newMinter);

  /**
   * @dev Initializes the contract setting the deployer as the initial minter.
   */
  constructor() internal {
    address msgSender = _msgSender();
    _minter = msgSender;
    emit MintershipTransferred(address(0), msgSender);
  }

  /**
   * @dev Returns the address of the current minter.
   */
  function minter() public view returns (address) {
    return _minter;
  }

  /**
   * @dev Throws if called by any account other than the minter.
   */
  modifier onlyMinter() {
    require(_minter == _msgSender(), "Mintable: caller is not the minter");
    _;
  }

  /**
   * @dev Transfers mintership of the contract to a new account (`newMinter`).
   * Can only be called by the current minter.
   */
  function transferMintership(address newMinter) public virtual onlyMinter {
    require(newMinter != address(0), "Mintable: new minter is the zero address");
    emit MintershipTransferred(_minter, newMinter);
    _minter = newMinter;
  }
}
