pragma solidity 0.6.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

interface IStableSwap {
  function exchange(
    int128 i,
    int128 j,
    uint256 dx,
    uint256 min_dy
  ) external;

  function coins(uint256 i) external returns (IERC20);

  function base_pool() external returns (IStableSwap);

  function remove_liquidity_one_coin(
    uint256 amount,
    int128 i,
    uint256 min_amount
  ) external;
}

interface IMultiFeeDistribution {
  function notifyRewardAmount(IERC20 rewardsToken, uint256 reward) external;
}

interface IPancakeRouter {
  function swapExactTokensForTokens(
    uint256 amountIn,
    uint256 amountOutMin,
    IERC20[] calldata path,
    address to,
    uint256 deadline
  ) external returns (uint256[] memory amounts);
}

contract FeeConverter {
  using SafeERC20 for IERC20;

  address public feeDistributor;

  function setFeeDistributor(address distributor) external {
    require(feeDistributor == address(0));
    feeDistributor = distributor;
  }

  function convertFees(uint256 i, uint256 j) external {
    IERC20 inputCoin = IStableSwap(msg.sender).coins(i);
    IERC20 outputCoin = IStableSwap(msg.sender).coins(j);

    uint256 balance = inputCoin.balanceOf(address(this));
    inputCoin.safeApprove(msg.sender, balance);
    IStableSwap(msg.sender).exchange(int128(i), int128(j), balance, 0);
  }

  function notify(IERC20 coin) external {
    uint256 balance = coin.balanceOf(address(this));
    coin.safeApprove(feeDistributor, balance);
    IMultiFeeDistribution(feeDistributor).notifyRewardAmount(coin, balance);
  }
}

contract MetapoolFeeConverter {
  using SafeERC20 for IERC20;

  address public feeDistributor;

  function setFeeDistributor(address distributor) external {
    require(feeDistributor == address(0));
    feeDistributor = distributor;
  }

  function convertFees() external {
    IERC20 inputCoin = IStableSwap(msg.sender).coins(0);
    IERC20 outputCoin = IStableSwap(msg.sender).coins(1);

    uint256 balance = inputCoin.balanceOf(address(this));
    inputCoin.safeApprove(msg.sender, balance);
    IStableSwap(msg.sender).exchange(0, 1, balance, 0);
    balance = outputCoin.balanceOf(address(this));

    IStableSwap basePool = IStableSwap(msg.sender).base_pool();
    outputCoin = basePool.coins(0);

    basePool.remove_liquidity_one_coin(balance, 0, 0);
    balance = outputCoin.balanceOf(address(this));
    outputCoin.approve(feeDistributor, balance);
    IMultiFeeDistribution(feeDistributor).notifyRewardAmount(outputCoin, balance);
  }
}

contract PancakeFeeConverter {
  using SafeERC20 for IERC20;

  address public feeDistributor;
  address public constant router = 0x05fF2B0DB69458A0750badebc4f9e13aDd608C7F;

  IERC20[] routerPath = [
    IERC20(0),
    IERC20(0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c), // BNB
    IERC20(0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56) // BUSD
  ];

  function setFeeDistributor(address distributor) external {
    require(feeDistributor == address(0));
    feeDistributor = distributor;
  }

  function convertFees(uint256 i, uint256 j) external {
    IERC20 inputCoin = IStableSwap(msg.sender).coins(i);
    IERC20 outputCoin = IStableSwap(msg.sender).coins(j);

    uint256 balance = inputCoin.balanceOf(address(this));
    inputCoin.safeApprove(msg.sender, balance);
    IStableSwap(msg.sender).exchange(int128(i), int128(j), balance, 0);
  }

  function notify(IERC20 coin) public {
    uint256 balance = coin.balanceOf(address(this));
    IERC20[] memory path = routerPath;
    path[0] = coin;

    coin.safeApprove(router, balance);
    IPancakeRouter(router).swapExactTokensForTokens(balance, 0, path, address(this), block.timestamp);

    coin = path[2];
    balance = coin.balanceOf(address(this));
    coin.safeApprove(feeDistributor, balance);
    IMultiFeeDistribution(feeDistributor).notifyRewardAmount(coin, balance);
  }
}
