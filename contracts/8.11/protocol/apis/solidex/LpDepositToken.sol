pragma solidity 0.8.11;

import "./IERC20.sol";
import "./ILpDepositor.sol";

contract DepositToken is IERC20 {
  string public name;
  string public symbol;
  uint8 public constant decimals = 18;

  mapping(address => mapping(address => uint256)) public override allowance;

  ILpDepositor public depositor;
  address public pool;

  constructor() {
    // set to prevent the implementation contract from being initialized
    pool = address(0xdead);
  }

  /**
        @dev Initializes the contract after deployment via a minimal proxy
     */
  function initialize(address _pool) external returns (bool) {
    require(pool == address(0));
    pool = _pool;
    depositor = ILpDepositor(msg.sender);
    string memory _symbol = IERC20(pool).symbol();
    name = string(abi.encodePacked("Solidex ", _symbol, " Deposit"));
    symbol = string(abi.encodePacked("sex-", _symbol));
    emit Transfer(address(0), msg.sender, 0);
    return true;
  }

  function balanceOf(address account) external view returns (uint256) {
    return depositor.userBalances(account, pool);
  }

  function totalSupply() external view returns (uint256) {
    return depositor.totalBalances(pool);
  }

  function approve(address _spender, uint256 _value) external override returns (bool) {
    allowance[msg.sender][_spender] = _value;
    emit Approval(msg.sender, _spender, _value);
    return true;
  }

  /** shared logic for transfer and transferFrom */
  function _transfer(
    address _from,
    address _to,
    uint256 _value
  ) internal {
    if (_value > 0) {
      depositor.transferDeposit(pool, _from, _to, _value);
    }
    emit Transfer(_from, _to, _value);
  }

  /**
        @notice Transfer tokens to a specified address
        @param _to The address to transfer to
        @param _value The amount to be transferred
        @return Success boolean
     */
  function transfer(address _to, uint256 _value) public override returns (bool) {
    _transfer(msg.sender, _to, _value);
    return true;
  }

  /**
        @notice Transfer tokens from one address to another
        @param _from The address which you want to send tokens from
        @param _to The address which you want to transfer to
        @param _value The amount of tokens to be transferred
        @return Success boolean
     */
  function transferFrom(
    address _from,
    address _to,
    uint256 _value
  ) public override returns (bool) {
    require(allowance[_from][msg.sender] >= _value, "Insufficient allowance");
    if (allowance[_from][msg.sender] != type(uint256).max) {
      allowance[_from][msg.sender] -= _value;
    }
    _transfer(_from, _to, _value);
    return true;
  }

  /**
        @dev Only callable ty `LpDepositor`. Used to trigger a `Transfer` event
             upon deposit of LP tokens, to aid accounting in block explorers.
     */
  function mint(address _to, uint256 _value) external returns (bool) {
    require(msg.sender == address(depositor));
    emit Transfer(address(0), _to, _value);
    return true;
  }

  /**
        @dev Only callable ty `LpDepositor`. Used to trigger a `Transfer` event
             upon withdrawal of LP tokens, to aid accounting in block explorers.
     */
  function burn(address _from, uint256 _value) external returns (bool) {
    require(msg.sender == address(depositor));
    emit Transfer(_from, address(0), _value);
    return true;
  }
}
