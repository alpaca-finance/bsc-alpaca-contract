pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ERC20.sol";
import "./Mintable.sol";

contract WaultSwapToken is ERC20("WaultSwap", "WEX", 18, 0, 750000000), Ownable, Mintable {
  event WhitelistAdded(address _address);
  event WhitelistRemoved(address _address);

  function mint(address _to, uint256 _amount) public onlyMinter {
    _mint(_to, _amount);
  }

  function setBurnrate(uint8 burnrate_) public onlyOwner {
    require(0 <= burnrate_ && burnrate_ <= 20, "burnrate must be in valid range");
    _setupBurnrate(burnrate_);
  }

  function addWhitelistedAddress(address _address) public onlyOwner {
    _whitelistedAddresses[_address] = true;
    WhitelistAdded(_address);
  }

  function removeWhitelistedAddress(address _address) public onlyOwner {
    _whitelistedAddresses[_address] = false;
    WhitelistRemoved(_address);
  }
}
