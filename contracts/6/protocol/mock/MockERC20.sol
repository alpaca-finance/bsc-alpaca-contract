pragma solidity 0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

contract MockERC20 is ERC20UpgradeSafe, OwnableUpgradeSafe {
  receive() external payable {
    _mint(msg.sender, msg.value);
  }

  function initialize(string memory _name, string memory _symbol) public initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ERC20UpgradeSafe.__ERC20_init(_name, _symbol);
  }

  function mint(address to, uint256 amount) public onlyOwner {
    _mint(to, amount);
  }
}
