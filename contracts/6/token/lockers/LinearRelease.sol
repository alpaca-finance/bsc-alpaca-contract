pragma solidity 0.6.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/ILocker.sol";
import "../interfaces/IFairLaunch.sol";

contract LinearRelease is Ownable, ReentrancyGuard {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  IFairLaunch public fairLaunch;
  IERC20 public token;
  uint256 public lockupBps;

  uint256 public startReleaseBlock;
  uint256 public endReleaseBlock;

  mapping(address => uint256) private _locks;
  mapping(address => uint256) private _lastUnlockBlock;

  modifier onlyFairLaunch() {
    require(msg.sender == address(fairLaunch), "linear release: only fair launch");
    _;
  }

  event Lock(address indexed to, uint256 value);
  event Claim(address indexed to, uint256 value);

  constructor(
    IERC20 _token,
    uint256 _lockupBps,
    IFairLaunch _fairLaunch,
    uint256 _startReleaseBlock,
    uint256 _endReleaseBlock
  ) public {
    require(_endReleaseBlock > _startReleaseBlock, "linear release: bad end/start release");
    token = _token;
    lockupBps = _lockupBps;
    fairLaunch = _fairLaunch;
    startReleaseBlock = _startReleaseBlock;
    endReleaseBlock = _endReleaseBlock;
  }

  function calLockAmount(uint256 _amount) public onlyFairLaunch view returns (uint256) {
    return _amount.mul(lockupBps).div(10000);
  }

  function lockOf(address _user) public view returns (uint256) {
    return _locks[_user];
  }

  function lock(address _user, uint256 _amount) public nonReentrant onlyFairLaunch {
    require(_user != address(0), "lock: no address(0)");
    token.safeTransferFrom(msg.sender, address(this), _amount);

    _locks[_user] = _locks[_user].add(_amount);

    if (_lastUnlockBlock[_user] < startReleaseBlock) {
      _lastUnlockBlock[_user] = startReleaseBlock;
    }

    emit Lock(_user, _amount);
  }

  function pendingTokens(address _user) public view returns (IERC20[] memory, uint256[] memory) {
    // When block number less than startReleaseBlock, no token can be unlocked
    uint256 amount = 0;
    if (block.number < startReleaseBlock) {
      amount = 0;
    }
    // When block number more than endReleaseBlock, all locked token can be unlocked
    else if (block.number >= endReleaseBlock) {
      amount = _locks[_user];
    }
    // When block number is more than startReleaseBlock but less than endReleaseBlock,
    // some ALPACAs can be released
    else
    {
      uint256 releasedBlock = block.number.sub(_lastUnlockBlock[_user]);
      uint256 blockLeft = endReleaseBlock.sub(_lastUnlockBlock[_user]);
      amount = _locks[_user].mul(releasedBlock).div(blockLeft);
    }

    IERC20[] memory _rewardTokens = new IERC20[](1);
    _rewardTokens[0] = (token);
    uint256[] memory _rewardAmounts = new uint256[](1);
    _rewardAmounts[0] = amount;
    return (_rewardTokens, _rewardAmounts);
  }

  function claim() public nonReentrant {
    require(_locks[msg.sender] > 0, "lieanr release: no locked");

    (IERC20[] memory tokens, uint256[] memory amounts) = pendingTokens(msg.sender);

    tokens[0].safeTransfer(msg.sender, amounts[0]);
    _locks[msg.sender] = _locks[msg.sender].sub(amounts[0]);
    _lastUnlockBlock[msg.sender] = block.number;

    emit Claim(msg.sender, amounts[0]);
  }
}