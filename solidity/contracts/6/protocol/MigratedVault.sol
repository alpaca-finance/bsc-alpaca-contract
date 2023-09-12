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

contract MigratedVault is IVault, ERC20UpgradeSafe, ReentrancyGuardUpgradeSafe, OwnableUpgradeSafe {
  /// @notice Libraries
  using SafeToken for address;
  using SafeMath for uint256;

  event Migrate(uint256 amountMigrated, uint256 ibTokenReceived);

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

  function migrate() external onlyOwner {
    // 1. sanity check , no debt
    require(vaultDebtShare == 0, "outstanding debt");

    // 2. Set new ibToken
    newIbToken = IMoneyMarket(moneyMarket).getIbTokenFromToken(token);

    // 3. deposit to mm through AM, native token vault should hold wNative token
    // so, there's no need to handle native token
    uint256 depositAmount = token.balanceOf(address(this));
    IMoneyMarketAccountManager(mmAccountManager).deposit(token, depositAmount);

    // 4. set migrated flag
    migrated = true;

    emit Migrate(depositAmount, newIbToken.balanceOf(address(this)));
  }

  function claimFor(address user) external {
    uint256 share = SafeToken.balanceOf(address(this), user);
    _burn(msg.sender, share);
    uint256 newIbTokenAmount = (share * newIbToken.balanceOf(address(this))) / totalSupply();
    IMoneyMarketAccountManager(mmAccountManager).stakeFor(user, newIbToken, newIbTokenAmount);
  }

  /// @dev Withdraw BaseToken reserve for underwater positions to the given address.
  /// @param to The address to transfer BaseToken to.
  /// @param value The number of BaseToken tokens to withdraw. Must not exceed `reservePool`.
  function withdrawReserve(address to, uint256 value) external onlyOwner nonReentrant {
    reservePool = reservePool.sub(value);
    SafeToken.safeTransfer(token, to, value);
  }

  // ------ IVault Interface ------ //

  /// @notice Return the total ERC20 entitled to the token holders. Be careful of unaccrued interests.
  function totalToken() external view override returns (uint256) {}

  /// @notice Add more ERC20 to the bank. Hope to get some good returns.
  function deposit(uint256 amountToken) external payable override {}

  /// @notice Withdraw ERC20 from the bank by burning the share tokens.
  function withdraw(uint256 share) external override {}

  /// @notice Request funds from user through Vault
  function requestFunds(address targetedToken, uint256 amount) external override {}

  /// @dev Fallback function to accept BNB.
  receive() external payable {}
}
