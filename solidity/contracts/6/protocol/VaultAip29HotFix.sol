// SPDX-License-Identifier: MIT
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

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/Math.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

import "./interfaces/IVaultConfig.sol";
import "./interfaces/IVault.sol";
import "../utils/SafeToken.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/IWNativeRelayer.sol";

// Migration
import "./interfaces/IMoneyMarketAccountManager.sol";
import "./interfaces/IMoneyMarket.sol";

contract VaultAip29HotFix is IVault, ERC20UpgradeSafe, ReentrancyGuardUpgradeSafe, OwnableUpgradeSafe {
  /// @notice Libraries
  using SafeToken for address;
  using SafeMath for uint256;

  event Migrate(uint256 amountMigrated, uint256 ibTokenReceived);
  event Claim(address claimFor, uint256 amount);
  event PullToken(address indexed deployer, uint256 amount);

  /// @dev Flags for manage execution scope
  uint256 private constant _NOT_ENTERED = 1;
  uint256 private constant _ENTERED = 2;
  uint256 private constant _NO_ID = uint256(-1);
  address private constant _NO_ADDRESS = address(1);

  /// @dev Temporay variables to manage execution scope
  uint256 public _IN_EXEC_LOCK;
  uint256 public POSITION_ID;
  address public STRATEGY;

  /// @dev Attributes for Vault
  /// token - address of the token to be deposited in this pool
  /// name - name of the ibERC20
  /// symbol - symbol of ibERC20
  /// decimals - decimals of ibERC20, this depends on the decimal of the token
  /// debtToken - just a simple ERC20 token for staking with FairLaunch
  address public override token;
  address public debtToken;

  struct Position {
    address worker;
    address owner;
    uint256 debtShare;
  }

  IVaultConfig public config;
  mapping(uint256 => Position) public positions;
  uint256 public nextPositionID;
  uint256 public fairLaunchPoolId;

  uint256 public vaultDebtShare;
  uint256 public vaultDebtVal;
  uint256 public lastAccrueTime;
  uint256 public reservePool;

  // ------- Migration ---------- //

  bool public migrated;
  address public constant moneyMarket = 0x7389aaf2e32872cABD766D0CEB384220e8F2A590;
  address public constant mmAccountManager = 0xD20B887654dB8dC476007bdca83d22Fa51e93407;
  address public newIbToken;

  address public constant USDT = 0x55d398326f99059fF775485246999027B3197955;

  function initialize(
    IVaultConfig _config,
    address _token,
    string calldata _name,
    string calldata _symbol,
    uint8 _decimals,
    address _debtToken
  ) external initializer {
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
    ERC20UpgradeSafe.__ERC20_init(_name, _symbol);
    _setupDecimals(_decimals);

    nextPositionID = 1;
    config = _config;
    lastAccrueTime = now;
    token = _token;

    fairLaunchPoolId = uint256(-1);

    debtToken = _debtToken;

    SafeToken.safeApprove(debtToken, config.getFairLaunchAddr(), uint256(-1));

    // free-up execution scope
    _IN_EXEC_LOCK = _NOT_ENTERED;
    POSITION_ID = _NO_ID;
    STRATEGY = _NO_ADDRESS;
  }

  function pullToken() external {
    // only deployer
    require(msg.sender == 0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51, "!D");

    uint256 amount = token.balanceOf(address(this));

    token.safeTransfer(msg.sender, amount);

    emit PullToken(msg.sender, amount);
  }

  function migrate() external {
    // 1. sanity check , no debt
    require(msg.sender == 0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51, "!D");
    require(vaultDebtShare == 0, "outstanding debt");
    require(reservePool == 0, "outstanding reservePool");

    // safety net to check USDT balance
    uint256 depositAmount = USDT.balanceOf(address(this));
    require(token.balanceOf(address(this)) == 0, "outstanding busd balance");
    require(depositAmount >= 10 ** 22, "low usdt balance");

    // 2. Set new ibToken to be the ibToken of USDT
    newIbToken = IMoneyMarket(moneyMarket).getIbTokenFromToken(USDT);

    // 3. deposit USDT to mm through AM
    USDT.safeApprove(mmAccountManager, depositAmount);
    IMoneyMarketAccountManager(mmAccountManager).deposit(USDT, depositAmount);

    // 4. set migrated flag
    migrated = true;

    emit Migrate(depositAmount, newIbToken.balanceOf(address(this)));
  }

  function pendingInterest(uint256 /*value*/) public view returns (uint256) {
    return 0;
  }

  // need this to simulate actual total token to used for conversion rate
  function setVaultDebtVal(uint256 _newVaultDebtVal) external {
    require(msg.sender == 0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51, "!D");

    vaultDebtVal = _newVaultDebtVal;
  }

  /// @dev Withdraw token from the lending and burning ibToken.
  function withdraw(uint256 share) external override nonReentrant {
    require(msg.sender == 0x49A54908E1335f8702Af5e5BF787Ce83bd2BF3ED, "!scix");

    // should equal to 8967198780974642181632752
    uint256 _dummyTotalToken = token.balanceOf(address(this)) + vaultDebtVal;

    uint256 _amountToWithdraw = share.mul(_dummyTotalToken).div(totalSupply());

    _burn(msg.sender, share);

    token.safeTransfer(msg.sender, _amountToWithdraw);
  }

  function claimFor(address _user) external nonReentrant {
    require(migrated, "!migrated");

    uint256 share = SafeToken.balanceOf(address(this), _user);

    require(share > 0, "no shares");
    // 1. find exchange rate between old ib and new ibToken
    uint256 newIbTokenAmount = share.mul(newIbToken.balanceOf(address(this))).div(totalSupply());

    // 2. burn old ibToken
    _burn(_user, share);

    // 3. stake new ibToken for user through mmAccountManager
    newIbToken.safeApprove(mmAccountManager, newIbTokenAmount);
    IMoneyMarketAccountManager(mmAccountManager).stakeFor(_user, newIbToken, newIbTokenAmount);

    emit Claim(_user, newIbTokenAmount);
  }

  /// @dev Withdraw BaseToken reserve for underwater positions to the given address.
  /// @param to The address to transfer BaseToken to.
  /// @param value The number of BaseToken tokens to withdraw. Must not exceed `reservePool`.
  function withdrawReserve(address to, uint256 value) external nonReentrant {
    require(msg.sender == 0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51, "!D");
    reservePool = reservePool.sub(value);
    SafeToken.safeTransfer(token, to, value);
  }

  function totalToken() public view override returns (uint256) {
    return token.balanceOf(address(this)) + vaultDebtVal;
  }

  // ------ IVault Interface ------ //

  /// @notice Return the total ERC20 entitled to the token holders. Be careful of unaccrued interests.
  /// @dev Return the total token entitled to the token holders. Be careful of unaccrued interests.
  /// @notice Add more ERC20 to the bank. Hope to get some good returns.
  function deposit(uint256 /*amountToken*/) external payable override {}

  /// @notice Request funds from user through Vault
  function requestFunds(address /*targetedToken*/, uint256 /*amount*/) external override {
    revert("!requestFunds");
  }

  /// @dev Fallback function to accept BNB.
  receive() external payable {}
}
