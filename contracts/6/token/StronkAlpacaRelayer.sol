pragma solidity 0.6.6;

import "./interfaces/IAlpacaToken.sol";
import "./interfaces/IStronkAlpacaRelayer.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";


contract StronkAlpacaRelayer is Ownable, IStronkAlpacaRelayer, ReentrancyGuard {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  // Alpaca address
  address public alpacaTokenAddress;

  // User address
  address public userAddress;

  constructor(
    address _alpacaAddress,
    address _userAddress
  ) public {
    alpacaTokenAddress = _alpacaAddress;
    userAddress = _userAddress;
  }

  function transferAllAlpaca() external override nonReentrant onlyOwner {
    SafeERC20.safeTransfer(IERC20(alpacaTokenAddress), userAddress, IERC20(alpacaTokenAddress).balanceOf(address(this)));
    IAlpacaToken(alpacaTokenAddress).transferAll(msg.sender);
  }
}
