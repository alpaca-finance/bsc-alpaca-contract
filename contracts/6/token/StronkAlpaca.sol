pragma solidity 0.6.6;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IAlpacaToken.sol";
import "./interfaces/IStronkAlpaca.sol";
import "./StronkAlpacaRelayer.sol";
import "../utils/SafeToken.sol";

// StrongHodl is a smart contract for ALPACA time-locking by asking user to lock ALPACA for a period of time.
contract StronkAlpaca is IStronkAlpaca, ERC20("Stronk Alpaca", "sALPACA"), ReentrancyGuard {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  //Block number when locked ALPACA can be turned to sALPACA
  uint256 public hodlableStartBlock;

  // Block number when locked ALPACA can be turned to sALPACA
  uint256 public hodlableEndBlock;

  // Block number when ALPACA can be released.
  uint256 public lockEndBlock;

  // Alpaca address
  address public alpacaTokenAddress;

  // To track the portion of each user Alpaca
  mapping(address => address) private _userRelayerMap;

  // events
  event PrepareHodl(address indexed user, address indexed relayer);
  event Hodl(address indexed user, address indexed relayer, uint256 receivingStronkAlpacaAmount);
  event Unhodl(address indexed user, uint256 receivingAlpacaAmount);

  constructor(
    address _alpacaAddress,
    uint256 _hodlableStartBlock,
    uint256 _hodlableEndBlock,
    uint256 _lockEndBlock
  ) public {
    _setupDecimals(18);
    alpacaTokenAddress = _alpacaAddress;
    hodlableStartBlock = _hodlableStartBlock;
    hodlableEndBlock = _hodlableEndBlock;
    lockEndBlock = _lockEndBlock;
  }

  /// @dev Require that the caller must be an EOA account to avoid flash loans.
  modifier onlyEOA() {
    require(msg.sender == tx.origin, "StronkAlpaca::onlyEOA:: not eoa");
    _;
  }

  function prepareHodl() external override onlyEOA nonReentrant {
    require(_userRelayerMap[msg.sender] == address(0), "StronkAlpaca::prepareHodl: user has already prepared hodl");
    require(block.number >= hodlableStartBlock, "StronkAlpaca::prepareHodl: block.number not reach hodlableStartBlock");
    require(block.number < hodlableEndBlock, "StronkAlpaca::prepareHodl: block.number exceeds hodlableEndBlock");
    require(IAlpacaToken(alpacaTokenAddress).lockOf(msg.sender) > 0, "StronkAlpaca::preparehodl: user's lockAlpaca must be greater than zero");

    // create relayer contract
    StronkAlpacaRelayer relayer = new StronkAlpacaRelayer(alpacaTokenAddress, msg.sender);
    _userRelayerMap[msg.sender] = address(relayer);
    emit PrepareHodl(msg.sender, address(relayer));
  }

  function hodl() external override onlyEOA nonReentrant {
    address relayerAddress = _userRelayerMap[msg.sender];

    require(relayerAddress != address(0), "StronkAlpaca::hodl: user has not preapare hodl yet");

    uint256 relayerAlpacaLockedBalance = IAlpacaToken(alpacaTokenAddress).lockOf(relayerAddress);
    StronkAlpacaRelayer relayer = StronkAlpacaRelayer(relayerAddress);

    relayer.transferAllAlpaca();
    _mint(msg.sender, relayerAlpacaLockedBalance);
    emit Hodl(msg.sender, address(relayer), relayerAlpacaLockedBalance);
  }

  function unhodl() external override onlyEOA nonReentrant {
    require(
      block.number > IAlpacaToken(alpacaTokenAddress).endReleaseBlock(),
      "StronkAlpaca::unhodl: block.number have not reach alpacaToken.endReleaseBlock"
    );
    require(block.number > lockEndBlock, "StronkAlpaca::unhodl: block.number have not reach lockEndBlock");

    // unlock all the Alpaca token in case it never have been unlocked yet
    // Note: given that releasePeriodEnd has passed, so that locked token has been 100% released
    if (IAlpacaToken(alpacaTokenAddress).lockOf(address(this)) > 0) {
      IAlpacaToken(alpacaTokenAddress).unlock();
    }

    uint256 userStronkAlpacaBalance = balanceOf(msg.sender);
    // Transfer all userStronkAlpacaBalance to StronkContract and then burn
    SafeERC20.safeTransferFrom(IERC20(address(this)), msg.sender, address(this), userStronkAlpacaBalance);
    // StronkAlpaca burns all user's StronkAlpaca
    _burn(address(this), userStronkAlpacaBalance);

    // transfer Alpaca from Strong Alpaca to user
    SafeERC20.safeTransfer(IERC20(alpacaTokenAddress), msg.sender, userStronkAlpacaBalance);

    emit Unhodl(msg.sender, userStronkAlpacaBalance);
  }

  function getRelayerAddress(address _account) public view returns (address) {
    return _userRelayerMap[_account];
  }
}
