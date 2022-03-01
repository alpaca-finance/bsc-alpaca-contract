pragma solidity 0.8.11;

import "./Ownable.sol";
import "./IERC20.sol";
import "../solidly/IVotingEscrow.sol";
import "./IVeDist.sol";
import "./ILpDepositor.sol";
import "./IFeeDistributor.sol";
import "./ISolidexVoter.sol";

contract VeDepositor is IERC20, Ownable {
  string public constant name = "SOLIDsex: Tokenized veSOLID";
  string public constant symbol = "SOLIDsex";
  uint8 public constant decimals = 18;
  uint256 public override totalSupply;

  mapping(address => uint256) public override balanceOf;
  mapping(address => mapping(address => uint256)) public override allowance;

  // Solidly contracts
  IERC20 public immutable token;
  IVotingEscrow public immutable votingEscrow;
  IVeDist public immutable veDistributor;

  // Solidex contracts
  ILpDepositor public lpDepositor;
  ISolidexVoter public solidexVoter;
  IFeeDistributor public feeDistributor;

  uint256 public tokenID;
  uint256 public unlockTime;

  uint256 constant MAX_LOCK_TIME = 86400 * 365 * 4;
  uint256 constant WEEK = 86400 * 7;

  event ClaimedFromVeDistributor(address indexed user, uint256 amount);
  event Merged(address indexed user, uint256 tokenID, uint256 amount);
  event UnlockTimeUpdated(uint256 unlockTime);

  constructor(
    IERC20 _token,
    IVotingEscrow _votingEscrow,
    IVeDist _veDist
  ) {
    token = _token;
    votingEscrow = _votingEscrow;
    veDistributor = _veDist;

    // approve vesting escrow to transfer SOLID (for adding to lock)
    _token.approve(address(_votingEscrow), type(uint256).max);
    emit Transfer(address(0), msg.sender, 0);
  }

  function setAddresses(
    ILpDepositor _lpDepositor,
    ISolidexVoter _solidexVoter,
    IFeeDistributor _feeDistributor
  ) external onlyOwner {
    lpDepositor = _lpDepositor;
    solidexVoter = _solidexVoter;
    feeDistributor = _feeDistributor;

    // approve fee distributor to transfer this token (for distributing SOLIDsex)
    allowance[address(this)][address(_feeDistributor)] = type(uint256).max;
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

  function onERC721Received(
    address _operator,
    address _from,
    uint256 _tokenID,
    bytes calldata
  ) external returns (bytes4) {
    require(msg.sender == address(votingEscrow), "Can only receive veSOLID NFTs");
    (uint256 amount, uint256 end) = votingEscrow.locked(_tokenID);

    if (tokenID == 0) {
      tokenID = _tokenID;
      unlockTime = end;
      solidexVoter.setTokenID(tokenID);
      votingEscrow.safeTransferFrom(address(this), address(lpDepositor), _tokenID);
    } else {
      votingEscrow.merge(_tokenID, tokenID);
      if (end > unlockTime) unlockTime = end;
      emit Merged(_operator, _tokenID, amount);
    }

    _mint(_operator, amount);
    extendLockTime();

    return bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
  }

  /**
        @notice Merge a veSOLID NFT previously sent to this contract
                with the main Solidex NFT
        @dev This is primarily meant to allow claiming balances from NFTs
             incorrectly sent using `transferFrom`. To deposit an NFT
             you should always use `safeTransferFrom`.
        @param _tokenID ID of the NFT to merge
        @return bool success
     */
  function merge(uint256 _tokenID) external returns (bool) {
    require(tokenID != _tokenID);
    (uint256 amount, uint256 end) = votingEscrow.locked(_tokenID);
    require(amount > 0);

    votingEscrow.merge(_tokenID, tokenID);
    if (end > unlockTime) unlockTime = end;
    emit Merged(msg.sender, _tokenID, amount);

    _mint(msg.sender, amount);
    extendLockTime();

    return true;
  }

  /**
        @notice Deposit SOLID tokens and mint SOLIDsex
        @param _amount Amount of SOLID to deposit
        @return bool success
     */
  function depositTokens(uint256 _amount) external returns (bool) {
    require(tokenID != 0, "First deposit must be NFT");

    token.transferFrom(msg.sender, address(this), _amount);
    votingEscrow.increase_amount(tokenID, _amount);
    _mint(msg.sender, _amount);
    extendLockTime();

    return true;
  }

  /**
        @notice Extend the lock time of the protocol's veSOLID NFT
        @dev Lock times are also extended each time new SOLIDsex is minted.
             If the lock time is already at the maximum duration, calling
             this function does nothing.
     */
  function extendLockTime() public {
    uint256 maxUnlock = ((block.timestamp + MAX_LOCK_TIME) / WEEK) * WEEK;
    if (maxUnlock > unlockTime) {
      votingEscrow.increase_unlock_time(tokenID, MAX_LOCK_TIME);
      unlockTime = maxUnlock;
      emit UnlockTimeUpdated(unlockTime);
    }
  }

  /**
        @notice Claim veSOLID received via ve(3,3)
        @dev This function is unguarded, anyone can call to claim at any time.
             The new veSOLID is represented by newly minted SOLIDsex, which is
             then sent to `FeeDistributor` and streamed to SEX lockers starting
             at the beginning of the following epoch week.
     */
  function claimFromVeDistributor() external returns (bool) {
    veDistributor.claim(tokenID);

    // calculate the amount by comparing the change in the locked balance
    // to the known total supply, this is necessary because anyone can call
    // `veDistributor.claim` for any NFT
    (uint256 amount, ) = votingEscrow.locked(tokenID);
    amount -= totalSupply;

    if (amount > 0) {
      _mint(address(this), amount);
      feeDistributor.depositFee(address(this), balanceOf[address(this)]);
      emit ClaimedFromVeDistributor(address(this), amount);
    }

    return true;
  }

  function _mint(address _user, uint256 _amount) internal {
    balanceOf[_user] += _amount;
    totalSupply += _amount;
    emit Transfer(address(0), _user, _amount);
  }
}
