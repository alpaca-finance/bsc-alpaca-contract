pragma solidity 0.8.11;

import "./Ownable.sol";
import "./IERC20.sol";

contract SolidexToken is IERC20, Ownable {
  string public constant name = "Solidex";
  string public constant symbol = "SEX";
  uint8 public constant decimals = 18;
  uint256 public override totalSupply;

  mapping(address => uint256) public override balanceOf;
  mapping(address => mapping(address => uint256)) public override allowance;
  mapping(address => bool) public minters;

  constructor() {
    emit Transfer(address(0), msg.sender, 0);
  }

  /**
        @notice Approve contracts to mint and renounce ownership
        @dev In production the only minters should be `LpDepositor` and `SexPartners`
             Addresses are given via dynamic array to allow extra minters during testing
     */
  function setMinters(address[] calldata _minters) external onlyOwner {
    for (uint256 i = 0; i < _minters.length; i++) {
      minters[_minters[i]] = true;
    }

    renounceOwnership();
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
    require(balanceOf[_from] >= _value, "Insufficient balance");
    balanceOf[_from] -= _value;
    balanceOf[_to] += _value;
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

  function mint(address _to, uint256 _value) external returns (bool) {
    require(minters[msg.sender], "Not a minter");
    balanceOf[_to] += _value;
    totalSupply += _value;
    emit Transfer(address(0), _to, _value);
    return true;
  }
}
