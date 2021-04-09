pragma solidity 0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

import "./interfaces/IDebtToken.sol";

contract DebtToken is IDebtToken, ERC20UpgradeSafe, OwnableUpgradeSafe {
  /// @notice just reserve for future use
  address timelock;

  mapping(address => bool) public okHolders;

  modifier onlyTimelock() {
    require(timelock == msg.sender, "debtToken::onlyTimelock:: msg.sender not timelock");
    _;
  }

  function initialize(
    string memory _name,
    string memory _symbol,
    address _timelock
  ) public initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ERC20UpgradeSafe.__ERC20_init(_name, _symbol);
    timelock = _timelock;
  }

  function setOkHolders(address[] memory _okHolders, bool _isOk) public override onlyOwner {
    for (uint256 idx = 0; idx < _okHolders.length; idx++) {
      okHolders[_okHolders[idx]] = _isOk;
    }
  }

  function mint(address to, uint256 amount) public override onlyOwner {
    require(okHolders[to], "debtToken::mint:: unapproved holder");
    _mint(to, amount);
  }

  function burn(address from, uint256 amount) public override onlyOwner {
    require(okHolders[from], "debtToken::burn:: unapproved holder");
    _burn(from, amount);
  }

  function transfer(address to, uint256 amount) public override returns (bool) {
    // allow to transfer to Vault
    require(okHolders[msg.sender], "debtToken::transfer:: unapproved holder on msg.sender");
    require(okHolders[to], "debtToken::transfer:: unapproved holder on to");
    _transfer(msg.sender, to, amount);
    return true;
  }

  function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
    require(okHolders[from], "debtToken::transferFrom:: unapproved holder in from");
    require(okHolders[to], "debtToken::transferFrom:: unapproved holder in to");
    _transfer(from, to, amount);
    return true;
  }
}