pragma solidity 0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

import "./apis/pancake/PancakeLibrary.sol";
import "./apis/pancake/PancakeRouter.sol";
import "./interfaces/IVault.sol";
import "../utils/AlpacaMath.sol";
import "../utils/SafeToken.sol";

contract IbTokenRouter is OwnableUpgradeSafe {
  using SafeMath for uint256;

  address payable public router;
  address public token;
  address public ibToken;
  address public alpaca;
  address public lpToken;

  function initialize(address payable _router, address _token, address _ibToken, address _alpaca) public initializer {
    OwnableUpgradeSafe.__Ownable_init();

    router = _router;
    token = _token;
    ibToken = _ibToken;
    alpaca = _alpaca;
    address factory = PancakeRouter(router).factory();
    lpToken = PancakeLibrary.pairFor(factory, ibToken, alpaca);
  }

  // **** Token-ibToken function ****
  // Get number of ibToken needed to withdraw to get exact amountToken from the Bank
  function ibTokenForExactToken(uint256 amountToken) public view returns (uint256) {
    uint256 totalToken = IVault(ibToken).totalToken();
    return totalToken == 0 ? amountToken : amountToken.mul(IERC20(ibToken).totalSupply()).add(totalToken).sub(1).div(totalToken);
  }

  // Provide liquidity for the Alpaca-ibToken Pool.
  // 1. Receive Token and Alpaca from caller.
  // 2. Mint ibToken based on the given token amount.
  // 3. Provide liquidity to the pool.
  function addLiquidityToken(
    uint256 amountTokenDesired,
    uint256 amountTokenMin,
    uint256 amountAlpacaDesired,
    uint256 amountAlpacaMin,
    address to,
    uint256 deadline
  )
  external
  returns (
    uint256 amountAlpaca,
    uint256 amountToken,
    uint256 liquidity
  ) {
    // set approval
    IERC20(ibToken).approve(router, uint256(-1));
    IERC20(alpaca).approve(router, uint256(-1));
    IERC20(token).approve(ibToken, uint256(-1));

    if (amountTokenDesired > 0) {
      SafeToken.safeTransferFrom(token, msg.sender, address(this), amountTokenDesired);
    }
    if (amountAlpacaDesired > 0) {
      SafeToken.safeTransferFrom(alpaca, msg.sender, address(this), amountAlpacaDesired);
    }
    IVault(ibToken).deposit(amountTokenDesired);
    uint256 amountIbTokenDesired = IERC20(ibToken).balanceOf(address(this));
    uint256 amountIbToken;
    (amountAlpaca, amountIbToken, liquidity) = IPancakeRouter02(router).addLiquidity(
      alpaca,
      ibToken,
      amountAlpacaDesired,
      amountIbTokenDesired,
      amountAlpacaMin,
      0,
      to,
      deadline
    );
    if (amountAlpacaDesired > amountAlpaca) {
      SafeToken.safeTransfer(alpaca, msg.sender, amountAlpacaDesired.sub(amountAlpaca));
    }
    IVault(ibToken).withdraw(amountIbTokenDesired.sub(amountIbToken));
    amountToken = amountTokenDesired.sub(IERC20(token).balanceOf(address(this)));
    if (amountToken > 0) {
      SafeToken.safeTransfer(token, msg.sender, IERC20(token).balanceOf(address(this)));
    }

    // reset approval
    IERC20(ibToken).approve(router, 0);
    IERC20(alpaca).approve(router, 0);
    IERC20(token).approve(ibToken, 0);

    require(amountToken >= amountTokenMin, "IbTokenRouter: require more token than amountTokenMin");
  }

  /// @dev Compute optimal deposit amount
  /// @param amtA amount of token A desired to deposit
  /// @param amtB amonut of token B desired to deposit
  /// @param resA amount of token A in reserve
  /// @param resB amount of token B in reserve
  /// (forked from ./StrategyAddTwoSidesOptimal.sol)
  function optimalDeposit(
    uint256 amtA,
    uint256 amtB,
    uint256 resA,
    uint256 resB
  ) internal pure returns (uint256 swapAmt, bool isReversed) {
    if (amtA.mul(resB) >= amtB.mul(resA)) {
      swapAmt = _optimalDepositA(amtA, amtB, resA, resB);
      isReversed = false;
    } else {
      swapAmt = _optimalDepositA(amtB, amtA, resB, resA);
      isReversed = true;
    }
  }

  /// @dev Compute optimal deposit amount helper
  /// @param amtA amount of token A desired to deposit
  /// @param amtB amonut of token B desired to deposit
  /// @param resA amount of token A in reserve
  /// @param resB amount of token B in reserve
  /// (forked from ./StrategyAddTwoSidesOptimal.sol)
  function _optimalDepositA(
    uint256 amtA,
    uint256 amtB,
    uint256 resA,
    uint256 resB
  ) internal pure returns (uint256) {
    require(amtA.mul(resB) >= amtB.mul(resA), "Reversed");

    uint256 a = 998;
    uint256 b = uint256(1998).mul(resA);
    uint256 _c = (amtA.mul(resB)).sub(amtB.mul(resA));
    uint256 c = _c.mul(1000).div(amtB.add(resB)).mul(resA);

    uint256 d = a.mul(c).mul(4);
    uint256 e = AlpacaMath.sqrt(b.mul(b).add(d));

    uint256 numerator = e.sub(b);
    uint256 denominator = a.mul(2);

    return numerator.div(denominator);
  }

  // Add ibToken and Alpaca to ibToken-Alpaca Pool.
  // All ibToken and Alpaca supplied are optimally swap and add to ibToken-Alpaca Pool.
  function addLiquidityTwoSidesOptimal(
    uint256 amountIbTokenDesired,
    uint256 amountAlpacaDesired,
    uint256 amountLPMin,
    address to,
    uint256 deadline
  )
  external
  returns (
    uint256 liquidity
  ) {
    // set approval
    IERC20(ibToken).approve(router, uint256(-1));
    IERC20(alpaca).approve(router, uint256(-1));

    if (amountIbTokenDesired > 0) {
      SafeToken.safeTransferFrom(ibToken, msg.sender, address(this), amountIbTokenDesired);
    }
    if (amountAlpacaDesired > 0) {
      SafeToken.safeTransferFrom(alpaca, msg.sender, address(this), amountAlpacaDesired);
    }
    uint256 swapAmt;
    bool isReversed;
    {
      (uint256 r0, uint256 r1, ) = IPancakePair(lpToken).getReserves();
      (uint256 ibTokenReserve, uint256 alpacaReserve) = IPancakePair(lpToken).token0() == ibToken ? (r0, r1) : (r1, r0);
      (swapAmt, isReversed) = optimalDeposit(amountIbTokenDesired, amountAlpacaDesired, ibTokenReserve, alpacaReserve);
    }
    address[] memory path = new address[](2);
    (path[0], path[1]) = isReversed ? (alpaca, ibToken) : (ibToken, alpaca);
    IPancakeRouter02(router).swapExactTokensForTokens(swapAmt, 0, path, address(this), now);
    (,, liquidity) = IPancakeRouter02(router).addLiquidity(
      alpaca,
      ibToken,
      IERC20(alpaca).balanceOf(address(this)),
      IERC20(ibToken).balanceOf(address(this)),
      0,
      0,
      to,
      deadline
    );
    uint256 dustAlpaca = IERC20(alpaca).balanceOf(address(this));
    uint256 dustIbToken = IERC20(ibToken).balanceOf(address(this));
    if (dustAlpaca > 0) {
      SafeToken.safeTransfer(alpaca, msg.sender, dustAlpaca);
    }
    if (dustIbToken > 0) {
      SafeToken.safeTransfer(ibToken, msg.sender, dustIbToken);
    }

    // reset approval
    IERC20(ibToken).approve(router, 0);
    IERC20(alpaca).approve(router, 0);

    require(liquidity >= amountLPMin, "IbTokenRouter: receive less lpToken than amountLPMin");
  }

  // Add Token and Alpaca to ibToken-Alpaca Pool.
  // All Token and Alpaca supplied are optimally swap and add to ibToken-Alpaca Pool.
  function addLiquidityTwoSidesOptimalToken(
    uint256 amountTokenDesired,
    uint256 amountAlpacaDesired,
    uint256 amountLPMin,
    address to,
    uint256 deadline
  )
  external
  returns (
    uint256 liquidity
  ) {
    // set approval
    IERC20(ibToken).approve(router, uint256(-1));
    IERC20(alpaca).approve(router, uint256(-1));
    IERC20(token).approve(ibToken, uint256(-1));

    if (amountTokenDesired > 0) {
      SafeToken.safeTransferFrom(token, msg.sender, address(this), amountTokenDesired);
    }
    if (amountAlpacaDesired > 0) {
      SafeToken.safeTransferFrom(alpaca, msg.sender, address(this), amountAlpacaDesired);
    }
    IVault(ibToken).deposit(amountTokenDesired);
    uint256 amountIbTokenDesired = IERC20(ibToken).balanceOf(address(this));
    uint256 swapAmt;
    bool isReversed;
    {
      (uint256 r0, uint256 r1, ) = IPancakePair(lpToken).getReserves();
      (uint256 ibTokenReserve, uint256 alpacaReserve) = IPancakePair(lpToken).token0() == ibToken ? (r0, r1) : (r1, r0);
      (swapAmt, isReversed) = optimalDeposit(amountIbTokenDesired, amountAlpacaDesired, ibTokenReserve, alpacaReserve);
    }
    address[] memory path = new address[](2);
    (path[0], path[1]) = isReversed ? (alpaca, ibToken) : (ibToken, alpaca);
    IPancakeRouter02(router).swapExactTokensForTokens(swapAmt, 0, path, address(this), now);
    (,, liquidity) = IPancakeRouter02(router).addLiquidity(
      alpaca,
      ibToken,
      IERC20(alpaca).balanceOf(address(this)),
      IERC20(ibToken).balanceOf(address(this)),
      0,
      0,
      to,
      deadline
    );
    uint256 dustAlpaca = IERC20(alpaca).balanceOf(address(this));
    uint256 dustIbToken = IERC20(ibToken).balanceOf(address(this));
    if (dustAlpaca > 0) {
      SafeToken.safeTransfer(alpaca, msg.sender, dustAlpaca);
    }
    if (dustIbToken > 0) {
      SafeToken.safeTransfer(ibToken, msg.sender, dustIbToken);
    }

    // reset approval
    IERC20(ibToken).approve(router, 0);
    IERC20(alpaca).approve(router, 0);
    IERC20(token).approve(ibToken, 0);

    require(liquidity >= amountLPMin, "IbTokenRouter: receive less lpToken than amountLPMin");
  }

  // Remove Token and Alpaca from ibToken-Alpha Pool.
  // 1. Remove ibToken and Alpaca from the pool.
  // 2. Redeem ibToken back to Token on Bank contract
  // 3. Return Token and Alpaca to caller.
  function removeLiquidityToken(
    uint256 liquidity,
    uint256 amountAlpacaMin,
    uint256 amountTokenMin,
    address to,
    uint256 deadline
  ) public returns (uint256 amountAlpaca, uint256 amountToken) {
    // set approval
    IERC20(ibToken).approve(router, uint256(-1));
    IERC20(alpaca).approve(router, uint256(-1));
    IERC20(token).approve(ibToken, uint256(-1));
    IERC20(lpToken).approve(router, uint256(-1));

    SafeToken.safeTransferFrom(lpToken, msg.sender, address(this), liquidity);
    uint256 amountIbToken;
    (amountAlpaca, amountIbToken) = IPancakeRouter02(router).removeLiquidity(
      alpaca,
      ibToken,
      liquidity,
      amountAlpacaMin,
      0,
      address(this),
      deadline
    );
    SafeToken.safeTransfer(alpaca, to, amountAlpaca);
    IVault(ibToken).withdraw(amountIbToken);
    amountToken = IERC20(token).balanceOf(address(this));
    if (amountToken > 0) {
      SafeToken.safeTransfer(token, msg.sender, IERC20(token).balanceOf(address(this)));
    }

    // reset approval
    IERC20(ibToken).approve(router, 0);
    IERC20(alpaca).approve(router, 0);
    IERC20(token).approve(ibToken, 0);
    IERC20(lpToken).approve(router, 0);

    require(amountToken >= amountTokenMin, "IbTokenRouter: receive less Token than amountTokenmin");
  }

  // Remove liquidity from ibToken-Alpaca Pool and convert all ibToken to Alpaca
  // 1. Remove ibToken and Alpaca from the pool.
  // 2. Swap ibToken for Alpaca.
  // 3. Return Alpaca to caller.
  // Note: transfer back amount bugfix apply re-check when write unit test
  function removeLiquidityAllAlpaca(
    uint256 liquidity,
    uint256 amountAlpacaMin,
    address to,
    uint256 deadline
  ) public returns (uint256 amountAlpaca) {
    // set approval
    IERC20(ibToken).approve(router, uint256(-1));
    IERC20(alpaca).approve(router, uint256(-1));
    IERC20(lpToken).approve(router, uint256(-1));

    SafeToken.safeTransferFrom(lpToken, msg.sender, address(this), liquidity);
    (, uint256 removeAmountIbToken) = IPancakeRouter02(router).removeLiquidity(
      alpaca,
      ibToken,
      liquidity,
      0,
      0,
      address(this),
      deadline
    );
    address[] memory path = new address[](2);
    path[0] = ibToken;
    path[1] = alpaca;
    IPancakeRouter02(router).swapExactTokensForTokens(removeAmountIbToken, 0, path, to, deadline);
    SafeToken.safeTransfer(alpaca, to, IERC20(alpaca).balanceOf(address(this)));

    // reset approval
    IERC20(ibToken).approve(router, 0);
    IERC20(alpaca).approve(router, 0);
    IERC20(lpToken).approve(router, 0);

    require(amountAlpaca >= amountAlpacaMin, "IbTokenRouter: receive less Alpaca than amountAlpacaMin");
  }

  // Swap exact amount of Token for Alpaca
  // 1. Receive Token from caller
  // 2. Deposit Token to Bank to mint ibToken
  // 3. Swap ibETH for Alpaca
  function swapExactTokenForAlpaca(
    uint256 amountExactTokenIn,
    uint256 amountAlpacaOutMin,
    address to,
    uint256 deadline
  ) external returns (uint256[] memory amounts) {
    // set approval
    IERC20(ibToken).approve(router, uint256(-1));
    IERC20(alpaca).approve(router, uint256(-1));
    IERC20(token).approve(ibToken, uint256(-1));
    IERC20(lpToken).approve(router, uint256(-1));

    // logic
    SafeToken.safeTransferFrom(token, msg.sender, address(this), amountExactTokenIn);
    IVault(ibToken).deposit(amountExactTokenIn);
    address[] memory path = new address[](2);
    path[0] = ibToken;
    path[1] = alpaca;
    uint256[] memory swapAmounts = IPancakeRouter02(router).swapExactTokensForTokens(IERC20(ibToken).balanceOf(address(this)), amountAlpacaOutMin, path, to, deadline);
    amounts = new uint256[](2);
    amounts[0] = amountExactTokenIn;
    amounts[1] = swapAmounts[1];

    // reset approval
    IERC20(ibToken).approve(router, 0);
    IERC20(alpaca).approve(router, 0);
    IERC20(token).approve(ibToken, 0);
    IERC20(lpToken).approve(router, 0);
  }

  // Swap Alpaca for exact amount of Token
  // 1. Receive Alpaca from caller
  // 2. Swap Alpaca for ibToken.
  // 3. Withdraw Token by claiming Token from the Bank.
  function swapAlpacaForExactToken(
    uint256 amountAlpacaIn,
    uint256 exactTokenOut,
    address to,
    uint256 deadline
  ) external returns (uint256[] memory amounts) {
    // set approval
    IERC20(ibToken).approve(router, uint256(-1));
    IERC20(alpaca).approve(router, uint256(-1));
    IERC20(token).approve(ibToken, uint256(-1));
    IERC20(lpToken).approve(router, uint256(-1));

    SafeToken.safeTransferFrom(alpaca, msg.sender, address(this), amountAlpacaIn);
    address[] memory path = new address[](2);
    path[0] = alpaca;
    path[1] = ibToken;
    IVault(ibToken).withdraw(0);
    uint256[] memory swapAmounts = IPancakeRouter02(router).swapTokensForExactTokens(ibTokenForExactToken(exactTokenOut), amountAlpacaIn, path, address(this), deadline);
    IVault(ibToken).withdraw(swapAmounts[1]);
    amounts = new uint256[](2);
    amounts[0] = swapAmounts[0];
    amounts[1] = address(this).balance;
    SafeToken.safeTransfer(token, to, IERC20(token).balanceOf(address(this)));
    if (amountAlpacaIn > amounts[0]) {
      SafeToken.safeTransfer(alpaca, msg.sender, amountAlpacaIn.sub(amounts[0]));
    }

    // reset approval
    IERC20(ibToken).approve(router, 0);
    IERC20(alpaca).approve(router, 0);
    IERC20(token).approve(ibToken, 0);
    IERC20(lpToken).approve(router, 0);
  }

  // Swap exact amount of Alpaca for Token
  // 1. Receive Token from caller
  // 2. Swap Token for ibToken.
  // 3. Redeem Token by ibToken from Bank
  function swapExactAlpacaForToken(
    uint256 exactAlpacaIn,
    uint256 amountTokenOutMin,
    address to,
    uint256 deadline
  ) external returns (uint256[] memory amounts) {
    // set approval
    IERC20(ibToken).approve(router, uint256(-1));
    IERC20(alpaca).approve(router, uint256(-1));
    IERC20(token).approve(ibToken, uint256(-1));
    IERC20(lpToken).approve(router, uint256(-1));

    SafeToken.safeTransferFrom(alpaca, msg.sender, address(this), exactAlpacaIn);
    address[] memory path = new address[](2);
    path[0] = alpaca;
    path[1] = ibToken;
    uint256[] memory swapAmounts = IPancakeRouter02(router).swapExactTokensForTokens(exactAlpacaIn, 0, path, address(this), deadline);
    IVault(ibToken).withdraw(swapAmounts[1]);
    amounts = new uint256[](2);
    amounts[0] = swapAmounts[0];
    amounts[1] = IERC20(token).balanceOf(address(this));
    SafeToken.safeTransfer(token, to, amounts[1]);

    // reset approval
    IERC20(ibToken).approve(router, 0);
    IERC20(alpaca).approve(router, 0);
    IERC20(token).approve(ibToken, 0);
    IERC20(lpToken).approve(router, 0);

    require(amounts[1] >= amountTokenOutMin, "IbTokenRouter: receive less Token than amountTokenmin");
  }

  // Swap Token for exact amount of Alpaca
  // 1. Receive Token from caller
  // 2. Mint ibToken by deposit to Bank
  // 3. Swap ibToken for Token
  function swapTokenForExactAlpaca(
    uint256 amountTokenIn,
    uint256 exactAlpacaOut,
    address to,
    uint256 deadline
  ) external returns (uint256[] memory amounts) {
    // set approval
    IERC20(ibToken).approve(router, uint256(-1));
    IERC20(alpaca).approve(router, uint256(-1));
    IERC20(token).approve(ibToken, uint256(-1));
    IERC20(lpToken).approve(router, uint256(-1));

    SafeToken.safeTransferFrom(token, msg.sender, address(this), amountTokenIn);
    IVault(ibToken).deposit(amountTokenIn);
    uint256 amountIbTokenInMax = IERC20(ibToken).balanceOf(address(this));
    address[] memory path = new address[](2);
    path[0] = ibToken;
    path[1] = alpaca;
    uint256[] memory swapAmounts = IPancakeRouter02(router).swapTokensForExactTokens(exactAlpacaOut, amountIbTokenInMax, path, to, deadline);
    amounts = new uint256[](2);
    amounts[0] = amountTokenIn;
    amounts[1] = swapAmounts[1];
    // Transfer left over base Token back
    if (amountIbTokenInMax > swapAmounts[0]) {
      IVault(ibToken).withdraw(amountIbTokenInMax.sub(swapAmounts[0]));
      amounts[0] = amountTokenIn - address(this).balance;
      SafeToken.safeTransfer(token, msg.sender, IERC20(token).balanceOf(address(this)));
    }

    // reset approval
    IERC20(ibToken).approve(router, 0);
    IERC20(alpaca).approve(router, 0);
    IERC20(token).approve(ibToken, 0);
    IERC20(lpToken).approve(router, 0);
  }

}
