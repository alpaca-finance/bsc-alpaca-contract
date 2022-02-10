pragma solidity 0.6.6;

import "./IMdexRouter.sol";
import "./TransferHelper.sol";
import "./IMdexFactory.sol";
import "./IMdexPair.sol";
import "./IMdexRouter.sol";
import "./ISwapMining.sol";
import "../../interfaces/IWBNB.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract MdexRouter is IMdexRouter, Ownable {
  using SafeMath for uint256;

  address public immutable override factory;
  address public immutable override WBNB;
  address public override swapMining;

  modifier ensure(uint256 deadline) {
    require(deadline >= block.timestamp, "MdexRouter: EXPIRED");
    _;
  }

  constructor(address _factory, address _WBNB) public {
    factory = _factory;
    WBNB = _WBNB;
  }

  receive() external payable {
    assert(msg.sender == WBNB);
    // only accept BNB via fallback from the WBNB contract
  }

  function pairFor(address tokenA, address tokenB) public view returns (address pair) {
    pair = IMdexFactory(factory).pairFor(tokenA, tokenB);
  }

  function setSwapMining(address _swapMininng) public onlyOwner {
    swapMining = _swapMininng;
  }

  // **** ADD LIQUIDITY ****
  function _addLiquidity(
    address tokenA,
    address tokenB,
    uint256 amountADesired,
    uint256 amountBDesired,
    uint256 amountAMin,
    uint256 amountBMin
  ) internal virtual returns (uint256 amountA, uint256 amountB) {
    // create the pair if it doesn't exist yet
    if (IMdexFactory(factory).getPair(tokenA, tokenB) == address(0)) {
      IMdexFactory(factory).createPair(tokenA, tokenB);
    }
    (uint256 reserveA, uint256 reserveB) = IMdexFactory(factory).getReserves(tokenA, tokenB);
    if (reserveA == 0 && reserveB == 0) {
      (amountA, amountB) = (amountADesired, amountBDesired);
    } else {
      uint256 amountBOptimal = IMdexFactory(factory).quote(amountADesired, reserveA, reserveB);
      if (amountBOptimal <= amountBDesired) {
        require(amountBOptimal >= amountBMin, "MdexRouter: INSUFFICIENT_B_AMOUNT");
        (amountA, amountB) = (amountADesired, amountBOptimal);
      } else {
        uint256 amountAOptimal = IMdexFactory(factory).quote(amountBDesired, reserveB, reserveA);
        assert(amountAOptimal <= amountADesired);
        require(amountAOptimal >= amountAMin, "MdexRouter: INSUFFICIENT_A_AMOUNT");
        (amountA, amountB) = (amountAOptimal, amountBDesired);
      }
    }
  }

  function addLiquidity(
    address tokenA,
    address tokenB,
    uint256 amountADesired,
    uint256 amountBDesired,
    uint256 amountAMin,
    uint256 amountBMin,
    address to,
    uint256 deadline
  )
    external
    virtual
    override
    ensure(deadline)
    returns (
      uint256 amountA,
      uint256 amountB,
      uint256 liquidity
    )
  {
    (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
    address pair = pairFor(tokenA, tokenB);
    TransferHelper.safeTransferFrom(tokenA, msg.sender, pair, amountA);
    TransferHelper.safeTransferFrom(tokenB, msg.sender, pair, amountB);
    liquidity = IMdexPair(pair).mint(to);
  }

  function addLiquidityETH(
    address token,
    uint256 amountTokenDesired,
    uint256 amountTokenMin,
    uint256 amountETHMin,
    address to,
    uint256 deadline
  )
    external
    payable
    virtual
    override
    ensure(deadline)
    returns (
      uint256 amountToken,
      uint256 amountETH,
      uint256 liquidity
    )
  {
    (amountToken, amountETH) = _addLiquidity(token, WBNB, amountTokenDesired, msg.value, amountTokenMin, amountETHMin);
    address pair = pairFor(token, WBNB);
    TransferHelper.safeTransferFrom(token, msg.sender, pair, amountToken);
    IWBNB(WBNB).deposit{ value: amountETH }();
    assert(IWBNB(WBNB).transfer(pair, amountETH));
    liquidity = IMdexPair(pair).mint(to);
    // refund dust eth, if any
    if (msg.value > amountETH) TransferHelper.safeTransferETH(msg.sender, msg.value - amountETH);
  }

  // **** REMOVE LIQUIDITY ****
  function removeLiquidity(
    address tokenA,
    address tokenB,
    uint256 liquidity,
    uint256 amountAMin,
    uint256 amountBMin,
    address to,
    uint256 deadline
  ) public virtual override ensure(deadline) returns (uint256 amountA, uint256 amountB) {
    address pair = pairFor(tokenA, tokenB);
    IMdexPair(pair).transferFrom(msg.sender, pair, liquidity);
    // send liquidity to pair
    (uint256 amount0, uint256 amount1) = IMdexPair(pair).burn(to);
    (address token0, ) = IMdexFactory(factory).sortTokens(tokenA, tokenB);
    (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
    require(amountA >= amountAMin, "MdexRouter: INSUFFICIENT_A_AMOUNT");
    require(amountB >= amountBMin, "MdexRouter: INSUFFICIENT_B_AMOUNT");
  }

  function removeLiquidityETH(
    address token,
    uint256 liquidity,
    uint256 amountTokenMin,
    uint256 amountETHMin,
    address to,
    uint256 deadline
  ) public virtual override ensure(deadline) returns (uint256 amountToken, uint256 amountETH) {
    (amountToken, amountETH) = removeLiquidity(
      token,
      WBNB,
      liquidity,
      amountTokenMin,
      amountETHMin,
      address(this),
      deadline
    );
    TransferHelper.safeTransfer(token, to, amountToken);
    IWBNB(WBNB).withdraw(amountETH);
    TransferHelper.safeTransferETH(to, amountETH);
  }

  function removeLiquidityWithPermit(
    address tokenA,
    address tokenB,
    uint256 liquidity,
    uint256 amountAMin,
    uint256 amountBMin,
    address to,
    uint256 deadline,
    bool approveMax,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external virtual override returns (uint256 amountA, uint256 amountB) {
    address pair = pairFor(tokenA, tokenB);
    uint256 value = approveMax ? uint256(-1) : liquidity;
    IMdexPair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
    (amountA, amountB) = removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline);
  }

  function removeLiquidityETHWithPermit(
    address token,
    uint256 liquidity,
    uint256 amountTokenMin,
    uint256 amountETHMin,
    address to,
    uint256 deadline,
    bool approveMax,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external virtual override returns (uint256 amountToken, uint256 amountETH) {
    address pair = pairFor(token, WBNB);
    uint256 value = approveMax ? uint256(-1) : liquidity;
    IMdexPair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
    (amountToken, amountETH) = removeLiquidityETH(token, liquidity, amountTokenMin, amountETHMin, to, deadline);
  }

  // **** REMOVE LIQUIDITY (supporting fee-on-transfer tokens) ****
  function removeLiquidityETHSupportingFeeOnTransferTokens(
    address token,
    uint256 liquidity,
    uint256 amountTokenMin,
    uint256 amountETHMin,
    address to,
    uint256 deadline
  ) public virtual override ensure(deadline) returns (uint256 amountETH) {
    (, amountETH) = removeLiquidity(token, WBNB, liquidity, amountTokenMin, amountETHMin, address(this), deadline);
    TransferHelper.safeTransfer(token, to, IERC20(token).balanceOf(address(this)));
    IWBNB(WBNB).withdraw(amountETH);
    TransferHelper.safeTransferETH(to, amountETH);
  }

  function removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
    address token,
    uint256 liquidity,
    uint256 amountTokenMin,
    uint256 amountETHMin,
    address to,
    uint256 deadline,
    bool approveMax,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external virtual override returns (uint256 amountETH) {
    address pair = pairFor(token, WBNB);
    uint256 value = approveMax ? uint256(-1) : liquidity;
    IMdexPair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
    amountETH = removeLiquidityETHSupportingFeeOnTransferTokens(
      token,
      liquidity,
      amountTokenMin,
      amountETHMin,
      to,
      deadline
    );
  }

  // **** SWAP ****
  // requires the initial amount to have already been sent to the first pair
  function _swap(
    uint256[] memory amounts,
    address[] memory path,
    address _to
  ) internal virtual {
    for (uint256 i; i < path.length - 1; i++) {
      (address input, address output) = (path[i], path[i + 1]);
      (address token0, ) = IMdexFactory(factory).sortTokens(input, output);
      uint256 amountOut = amounts[i + 1];
      if (swapMining != address(0)) {
        ISwapMining(swapMining).swap(msg.sender, input, output, amountOut);
      }
      (uint256 amount0Out, uint256 amount1Out) = input == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
      address to = i < path.length - 2 ? pairFor(output, path[i + 2]) : _to;
      IMdexPair(pairFor(input, output)).swap(amount0Out, amount1Out, to, new bytes(0));
    }
  }

  function swapExactTokensForTokens(
    uint256 amountIn,
    uint256 amountOutMin,
    address[] calldata path,
    address to,
    uint256 deadline
  ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
    amounts = IMdexFactory(factory).getAmountsOut(amountIn, path);
    require(amounts[amounts.length - 1] >= amountOutMin, "MdexRouter: INSUFFICIENT_OUTPUT_AMOUNT");
    TransferHelper.safeTransferFrom(path[0], msg.sender, pairFor(path[0], path[1]), amounts[0]);
    _swap(amounts, path, to);
  }

  function swapTokensForExactTokens(
    uint256 amountOut,
    uint256 amountInMax,
    address[] calldata path,
    address to,
    uint256 deadline
  ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
    amounts = IMdexFactory(factory).getAmountsIn(amountOut, path);
    require(amounts[0] <= amountInMax, "MdexRouter: EXCESSIVE_INPUT_AMOUNT");
    TransferHelper.safeTransferFrom(path[0], msg.sender, pairFor(path[0], path[1]), amounts[0]);
    _swap(amounts, path, to);
  }

  function swapExactETHForTokens(
    uint256 amountOutMin,
    address[] calldata path,
    address to,
    uint256 deadline
  ) external payable virtual override ensure(deadline) returns (uint256[] memory amounts) {
    require(path[0] == WBNB, "MdexRouter: INVALID_PATH");
    amounts = IMdexFactory(factory).getAmountsOut(msg.value, path);
    require(amounts[amounts.length - 1] >= amountOutMin, "MdexRouter: INSUFFICIENT_OUTPUT_AMOUNT");
    IWBNB(WBNB).deposit{ value: amounts[0] }();
    assert(IWBNB(WBNB).transfer(pairFor(path[0], path[1]), amounts[0]));
    _swap(amounts, path, to);
  }

  function swapTokensForExactETH(
    uint256 amountOut,
    uint256 amountInMax,
    address[] calldata path,
    address to,
    uint256 deadline
  ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
    require(path[path.length - 1] == WBNB, "MdexRouter: INVALID_PATH");
    amounts = IMdexFactory(factory).getAmountsIn(amountOut, path);
    require(amounts[0] <= amountInMax, "MdexRouter: EXCESSIVE_INPUT_AMOUNT");
    TransferHelper.safeTransferFrom(path[0], msg.sender, pairFor(path[0], path[1]), amounts[0]);
    _swap(amounts, path, address(this));
    IWBNB(WBNB).withdraw(amounts[amounts.length - 1]);
    TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
  }

  function swapExactTokensForETH(
    uint256 amountIn,
    uint256 amountOutMin,
    address[] calldata path,
    address to,
    uint256 deadline
  ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
    require(path[path.length - 1] == WBNB, "MdexRouter: INVALID_PATH");
    amounts = IMdexFactory(factory).getAmountsOut(amountIn, path);
    require(amounts[amounts.length - 1] >= amountOutMin, "MdexRouter: INSUFFICIENT_OUTPUT_AMOUNT");
    TransferHelper.safeTransferFrom(path[0], msg.sender, pairFor(path[0], path[1]), amounts[0]);
    _swap(amounts, path, address(this));
    IWBNB(WBNB).withdraw(amounts[amounts.length - 1]);
    TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
  }

  function swapETHForExactTokens(
    uint256 amountOut,
    address[] calldata path,
    address to,
    uint256 deadline
  ) external payable virtual override ensure(deadline) returns (uint256[] memory amounts) {
    require(path[0] == WBNB, "MdexRouter: INVALID_PATH");
    amounts = IMdexFactory(factory).getAmountsIn(amountOut, path);
    require(amounts[0] <= msg.value, "MdexRouter: EXCESSIVE_INPUT_AMOUNT");
    IWBNB(WBNB).deposit{ value: amounts[0] }();
    assert(IWBNB(WBNB).transfer(pairFor(path[0], path[1]), amounts[0]));
    _swap(amounts, path, to);
    // refund dust eth, if any
    if (msg.value > amounts[0]) TransferHelper.safeTransferETH(msg.sender, msg.value - amounts[0]);
  }

  // **** SWAP (supporting fee-on-transfer tokens) ****
  // requires the initial amount to have already been sent to the first pair
  function _swapSupportingFeeOnTransferTokens(address[] memory path, address _to) internal virtual {
    for (uint256 i; i < path.length - 1; i++) {
      (address input, address output) = (path[i], path[i + 1]);
      (address token0, ) = IMdexFactory(factory).sortTokens(input, output);
      IMdexPair pair = IMdexPair(pairFor(input, output));
      uint256 amountInput;
      uint256 amountOutput;
      {
        // scope to avoid stack too deep errors
        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        (uint256 reserveInput, uint256 reserveOutput) = input == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
        amountInput = IERC20(input).balanceOf(address(pair)).sub(reserveInput);
        amountOutput = IMdexFactory(factory).getAmountOut(amountInput, reserveInput, reserveOutput, input, output);
      }
      if (swapMining != address(0)) {
        ISwapMining(swapMining).swap(msg.sender, input, output, amountOutput);
      }
      (uint256 amount0Out, uint256 amount1Out) = input == token0
        ? (uint256(0), amountOutput)
        : (amountOutput, uint256(0));
      address to = i < path.length - 2 ? pairFor(output, path[i + 2]) : _to;
      pair.swap(amount0Out, amount1Out, to, new bytes(0));
    }
  }

  function swapExactTokensForTokensSupportingFeeOnTransferTokens(
    uint256 amountIn,
    uint256 amountOutMin,
    address[] calldata path,
    address to,
    uint256 deadline
  ) external virtual override ensure(deadline) {
    TransferHelper.safeTransferFrom(path[0], msg.sender, pairFor(path[0], path[1]), amountIn);
    uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
    _swapSupportingFeeOnTransferTokens(path, to);
    require(
      IERC20(path[path.length - 1]).balanceOf(to).sub(balanceBefore) >= amountOutMin,
      "MdexRouter: INSUFFICIENT_OUTPUT_AMOUNT"
    );
  }

  function swapExactETHForTokensSupportingFeeOnTransferTokens(
    uint256 amountOutMin,
    address[] calldata path,
    address to,
    uint256 deadline
  ) external payable virtual override ensure(deadline) {
    require(path[0] == WBNB, "MdexRouter: INVALID_PATH");
    uint256 amountIn = msg.value;
    IWBNB(WBNB).deposit{ value: amountIn }();
    assert(IWBNB(WBNB).transfer(pairFor(path[0], path[1]), amountIn));
    uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
    _swapSupportingFeeOnTransferTokens(path, to);
    require(
      IERC20(path[path.length - 1]).balanceOf(to).sub(balanceBefore) >= amountOutMin,
      "MdexRouter: INSUFFICIENT_OUTPUT_AMOUNT"
    );
  }

  function swapExactTokensForETHSupportingFeeOnTransferTokens(
    uint256 amountIn,
    uint256 amountOutMin,
    address[] calldata path,
    address to,
    uint256 deadline
  ) external virtual override ensure(deadline) {
    require(path[path.length - 1] == WBNB, "MdexRouter: INVALID_PATH");
    TransferHelper.safeTransferFrom(path[0], msg.sender, pairFor(path[0], path[1]), amountIn);
    _swapSupportingFeeOnTransferTokens(path, address(this));
    uint256 amountOut = IERC20(WBNB).balanceOf(address(this));
    require(amountOut >= amountOutMin, "MdexRouter: INSUFFICIENT_OUTPUT_AMOUNT");
    IWBNB(WBNB).withdraw(amountOut);
    TransferHelper.safeTransferETH(to, amountOut);
  }

  // **** LIBRARY FUNCTIONS ****
  function quote(
    uint256 amountA,
    uint256 reserveA,
    uint256 reserveB
  ) public view override returns (uint256 amountB) {
    return IMdexFactory(factory).quote(amountA, reserveA, reserveB);
  }

  function getAmountOut(
    uint256 amountIn,
    uint256 reserveIn,
    uint256 reserveOut,
    address token0,
    address token1
  ) public view override returns (uint256 amountOut) {
    return IMdexFactory(factory).getAmountOut(amountIn, reserveIn, reserveOut, token0, token1);
  }

  function getAmountIn(
    uint256 amountOut,
    uint256 reserveIn,
    uint256 reserveOut,
    address token0,
    address token1
  ) public view override returns (uint256 amountIn) {
    return IMdexFactory(factory).getAmountIn(amountOut, reserveIn, reserveOut, token0, token1);
  }

  function getAmountsOut(uint256 amountIn, address[] memory path)
    public
    view
    override
    returns (uint256[] memory amounts)
  {
    return IMdexFactory(factory).getAmountsOut(amountIn, path);
  }

  function getAmountsIn(uint256 amountOut, address[] memory path)
    public
    view
    override
    returns (uint256[] memory amounts)
  {
    return IMdexFactory(factory).getAmountsIn(amountOut, path);
  }
}
