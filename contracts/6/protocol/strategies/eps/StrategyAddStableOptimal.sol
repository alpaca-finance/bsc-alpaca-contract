// SPDX-License-Identifier: BUSL-1.1
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
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";

import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakeFactory.sol";
import "../../apis/pancake/IPancakeRouter02.sol";
import "@pancakeswap-libs/pancake-swap-core/contracts/interfaces/IPancakePair.sol";

import "../../interfaces/ICurveBase.sol";

import "../../interfaces/IStrategy.sol";
import "../../interfaces/IWorker.sol";
import "../../interfaces/IVault.sol";

import "../../../utils/SafeToken.sol";
import "../../../utils/AlpacaMath.sol";
import "../../../utils/SafeToken.sol";

contract StrategyAddStableOptimal is IStrategy, OwnableUpgradeSafe, ReentrancyGuardUpgradeSafe {
  using SafeMath for uint256;
  using SafeToken for address;

  /* ========== STATE VARIABLES ========== */
  IPancakeRouter02 public router;
  IPancakeFactory public factory;

  ICurveBase public epsPool;
  mapping(address => bool) public espPoolTokens;
  uint256 public epsA;
  uint256 public epsFee;
  uint256 public epsFeeDenom;
  uint256 public PRECISION;

  IVault public vault;

  /* ========== CONSTRUCTOR ========== */

  function initialize(
    address _epsPool,
    address _router,
    IVault _vault,
    address[] calldata _epsPoolTokens
  ) external initializer {
    // 1. Initialized imported library and constants
    OwnableUpgradeSafe.__Ownable_init();
    ReentrancyGuardUpgradeSafe.__ReentrancyGuard_init();
    PRECISION = 10**18;

    // 2. Assign Pancakeswap dependency contracts
    router = IPancakeRouter02(_router);
    factory = IPancakeFactory(router.factory());

    // 3. Assign EPS depency contracts & variables
    epsPool = ICurveBase(_epsPool);
    epsA = epsPool.A();
    epsFee = epsPool.fee();
    epsFeeDenom = 10**10;
    uint256 len = _epsPoolTokens.length;
    require(len == 3, "only 3eps pool");
    for (uint256 idx = 0; idx < len; idx++) {
      espPoolTokens[_epsPoolTokens[idx]] = true;
    }

    // 4. Assign Vault contract
    vault = _vault;
  }

  struct PoolState {
    uint128 xIndex;
    uint128 yIndex;
    uint256[3] balances;
  }

  struct BalancePair {
    uint256 x;
    uint256 y;
  }

  struct VariablePack {
    uint256 Xinit;
    uint256 Yinit;
    uint256 X0;
    uint256 Y0;
    uint256 D;
    uint256 S;
    uint256 U;
    uint256 Xfp;
    uint256 Yfp;
    uint256 N_COINS;
    uint256 Ann;
  }

  /// @dev Execute EPS stable optimal strategy. (1) Take BaseToken + FarmingToken (2) Calculate the optimal swappable amount (3) Swap dx => dy on EPS (4) add LP on PCS, return LP token.
  /// @param data Extra calldata information passed along to this strategy, composing `farmingTokenAmount` and `minLPAmount`
  function execute(
    address, /* user */
    uint256, /* debt */
    bytes calldata data
  ) external override nonReentrant {
    (uint256 farmingTokenAmount, uint256 minLPAmount) = abi.decode(data, (uint256, uint256));

    // refresh EPS platform's constant A and fee
    epsA = epsPool.A();
    epsFee = epsPool.fee();

    IWorker worker = IWorker(msg.sender);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    require(espPoolTokens[baseToken] && espPoolTokens[farmingToken], "!worker not compatiable");

    vault.requestFunds(farmingToken, farmingTokenAmount);
    uint256 baseTokenAmount = baseToken.myBalance();
    BalancePair memory userBalances = BalancePair(baseTokenAmount, farmingTokenAmount);

    PoolState memory fixedProductState;
    IPancakePair lpToken = IPancakePair(factory.getPair(farmingToken, baseToken));
    {
      (uint256 _reserve0, uint256 _reserve1, ) = lpToken.getReserves();
      uint256[3] memory fpBalances = [_reserve0, _reserve1, 0];
      uint128 i_fp = 0;
      uint128 j_fp = 1;
      if (lpToken.token0() != baseToken) {
        i_fp = 1;
        j_fp = 0;
      }
      fixedProductState = PoolState(i_fp, j_fp, fpBalances);
    }

    PoolState memory stableSwapState;
    {
      uint256[3] memory sbBalances = [epsPool.balances(0), epsPool.balances(1), epsPool.balances(2)];
      uint128 i_sb;
      uint128 j_sb;
      if (epsPool.coins(0) == baseToken) {
        i_sb = 0;
        j_sb = 1;
        if (epsPool.coins(2) == farmingToken) {
          j_sb = 2;
        }
      } else if (epsPool.coins(1) == baseToken) {
        i_sb = 1;
        j_sb = 2;
        if (epsPool.coins(0) == farmingToken) {
          j_sb = 0;
        }
      } else {
        i_sb = 2;
        j_sb = 0;
        if (epsPool.coins(1) == farmingToken) {
          j_sb = 1;
        }
      }
      stableSwapState = PoolState(i_sb, j_sb, sbBalances);
    }

    // calc dx to swap on EPS
    uint256 dx;
    {
      if ((fixedProductState.balances[fixedProductState.xIndex]).mul(userBalances.y) >= (fixedProductState.balances[fixedProductState.yIndex]).mul(userBalances.x)) {
        (fixedProductState.xIndex, fixedProductState.yIndex) = (fixedProductState.yIndex, fixedProductState.xIndex);
        (stableSwapState.xIndex, stableSwapState.yIndex) = (stableSwapState.yIndex, stableSwapState.xIndex);
        (userBalances.x, userBalances.y) = (userBalances.y, userBalances.x);
      }
      userBalances.y = (userBalances.y.mul(epsFeeDenom)).div(epsFeeDenom.sub(epsFee));
      dx = get_dx(fixedProductState, stableSwapState, userBalances);
    }
    // approve EPS pool
    baseToken.safeApprove(address(epsPool), uint256(-1));
    farmingToken.safeApprove(address(epsPool), uint256(-1));
    // approve PCS router to do their stuffs
    baseToken.safeApprove(address(router), uint256(-1));
    farmingToken.safeApprove(address(router), uint256(-1));

    // swap on EPS
    if (dx > 0) epsPool.exchange(int128(stableSwapState.xIndex), int128(stableSwapState.yIndex), dx, 0);

    // add LP
    uint256 moreLPAmount;
    {
      (, , moreLPAmount) = router.addLiquidity(
        baseToken,
        farmingToken,
        baseToken.myBalance(),
        farmingToken.myBalance(),
        0,
        0,
        address(this),
        now
      );
    }

    require(moreLPAmount >= minLPAmount, "insufficient LP tokens received");
    address(lpToken).safeTransfer(msg.sender, lpToken.balanceOf(address(this)));

    // Reset PCS router and EPS pool approve to 0 for safety reason
    farmingToken.safeApprove(address(epsPool), 0);
    baseToken.safeApprove(address(epsPool), 0);
    farmingToken.safeApprove(address(router), 0);
    baseToken.safeApprove(address(router), 0);
  }

  /// @dev Simplify both sides of FP balances to the factor of `D` for easing future computationas, as only the ratio between two that matters
  /// @param fixedProductState the state of fixed-product pool
  /// @param D constant D (stable pool constant)
  function simplifyFpState(PoolState memory fixedProductState, uint256 D) private pure returns (PoolState memory) {
    // only ratio that matters (order of D but remain ratio)
    // must compute fixedProductState.yIndex then fixedProductState.xIndex, never swap line
    fixedProductState.balances[fixedProductState.yIndex] = D.mul(fixedProductState.balances[fixedProductState.yIndex]).div(fixedProductState.balances[fixedProductState.xIndex]);
    fixedProductState.balances[fixedProductState.xIndex] = D;
    return fixedProductState;
  }

  /// @dev Calculate dx (the amount of token x to be swapped to token y) that gives user the optimal LP position on PCS
  /// @param fixedProductState the state of fixed-product pool
  /// @param stableSwapState the state of stable pool
  /// @param userBalances user balances
  function get_dx(
    PoolState memory fixedProductState,
    PoolState memory stableSwapState,
    BalancePair memory userBalances
  ) private view returns (uint256) {
    uint256 N_COINS = stableSwapState.balances.length; 
    uint256 Ann = epsA.mul(N_COINS);
    uint256 D = getD(stableSwapState.balances, epsA);
    fixedProductState = simplifyFpState(fixedProductState, D);

    // avoid stack too deep
    uint256 S = 0;
    uint256 U = D;
    
    {
      for (uint128 _i = 0; _i < N_COINS; _i++) {
        if (_i != stableSwapState.xIndex && _i != stableSwapState.yIndex) {
          S = S.add(stableSwapState.balances[_i]);
          U = (U.mul(D)).div(stableSwapState.balances[_i].mul(N_COINS));
        }
      }
    }
    uint256 x = 0;
    uint256 y = 0;
    // avoid stack too deep
    {
      VariablePack memory varPack =
        VariablePack(
          userBalances.x,
          userBalances.y,
          stableSwapState.balances[stableSwapState.xIndex], 
          stableSwapState.balances[stableSwapState.yIndex],
          D,
          S,
          U,
          fixedProductState.balances[fixedProductState.xIndex],
          fixedProductState.balances[fixedProductState.yIndex],
          N_COINS,
          Ann
        );
      varPack.Xfp = (varPack.Xfp).sub((varPack.Xfp).mul(epsFee).div(epsFeeDenom));
      (x, y) = findLineIntersectionWithTangent(varPack, N_COINS);
      (x, y) = verHorNewtonStep(x, y, varPack);
    }
    if (x < stableSwapState.balances[stableSwapState.xIndex]) {
      return 0;
    } else {
      return x.sub(stableSwapState.balances[stableSwapState.xIndex]);
    }
  }

  /// @dev subfunction to compute fX0Y0Pos 
  /// @param Yfp fixed-product pool balance y
  /// @param yi_ adjusted user balance y
  /// @param Y0 stable pool balance y
  /// @param Xfp fixed-product pool balance x
  /// @param X0 stable pool balance x
  function fPos(
    uint256 Yfp,
    uint256 yi_,
    uint256 Y0,
    uint256 Xfp,
    uint256 X0
  ) private pure returns (uint256) {
    return Yfp.mul(X0).add((yi_.add(Y0)).mul(Xfp));
  }

  /// @dev subfunction to compute fX0Y0Neg
  /// @param Xfp fixed-product pool balance x
  /// @param xi adjusted user balance x
  /// @param X0 stable pool balance x
  /// @param Yfp fixed-product pool balance y
  /// @param Y0 stable pool balance y
  function fNeg(
    uint256 Xfp,
    uint256 xi,
    uint256 X0,
    uint256 Yfp,
    uint256 Y0
  ) private pure returns (uint256) {
    return Xfp.mul(Y0).add((xi.add(X0)).mul(Yfp));
  }

  /// @dev compute constant D (stable pool constant)
  /// @param xp stable pool balances
  /// @param amp amplification factor (stable pool constant)
  function getD(uint256[3] memory xp, uint256 amp) private pure returns (uint256) {
    uint256 S = 0;
    uint256 N_COINS = 3;
    for (uint256 _x = 0; _x < xp.length; _x++) {
      S = S.add(xp[_x]);
    }
    if (S == 0) return 0;

    uint256 Dprev = 0;
    uint256 D = S;
    uint256 Ann = amp.mul(N_COINS);
    for (uint8 _i = 0; _i < 255; _i++) {
      uint256 D_P = D;
      for (uint256 _x = 0; _x < xp.length; _x++) {
        D_P = D_P.mul(D).div(xp[_x].mul(N_COINS));
      }
      Dprev = D;
      D = ((Ann.mul(S)).add(D_P.mul(N_COINS))).mul(D).div(((Ann.sub(1)).mul(D).add((N_COINS.add(1)).mul(D_P))));
      if (D > Dprev)
        if (D.sub(Dprev) <= 1) break;
        else {
          if (Dprev.sub(D) <= 1) break;
        }
    }
    return D;
  }

  /// @dev initialize x, y before starting the newton method
  /// @param varPack pack of variables used for newton method computation
  /// @param N_COINS number of tokens in stable pool
  function findLineIntersectionWithTangent(VariablePack memory varPack, uint256 N_COINS)
    internal
    view
    returns (uint256 x, uint256 y)
  {
    // X0 = stableSwapState.balances[stableSwapState.xIndex];
    // Y0 = stableSwapState.balances[stableSwapState.yIndex];
    uint256 stepXPos = 0;
    uint256 stepXNeg = 0;
    uint256 stepYPos = 0;
    uint256 stepYNeg = 0;
    {
      uint256 omega = getOmega(varPack, N_COINS);
      uint256 fX0Y0Pos = fPos(varPack.Yfp, varPack.Yinit, varPack.Y0, varPack.Xfp, varPack.X0);
      uint256 fX0Y0Neg = fNeg(varPack.Xfp, varPack.Xinit, varPack.X0, varPack.Yfp, varPack.Y0);
      (stepXPos, stepXNeg) = getStepX(varPack, fX0Y0Pos, fX0Y0Neg, omega);
      (stepYPos, stepYNeg) = getStepY(varPack, fX0Y0Pos, fX0Y0Neg, omega);
    }
    require(varPack.Y0.add(stepYPos) > stepYNeg, "Cannot trade, not enough money in CURVE pool");
    return (varPack.X0.add(stepXPos).sub(stepXNeg), varPack.Y0.add(stepYPos).sub(stepYNeg));
  }

  /// @dev compute x step size for initilization of the newton method
  /// @param varPack pack of variables used for newton method computation
  /// @param fX0Y0Pos fX0Y0Pos
  /// @param fX0Y0Pos fX0Y0Pos
  /// @param omega omega
  function getStepX(
    VariablePack memory varPack,
    uint256 fX0Y0Pos,
    uint256 fX0Y0Neg,
    uint256 omega
  ) private pure returns (uint256, uint256) {
    uint256 step_x_den = varPack.Yfp.add((varPack.Xfp.mul(omega)).div(varPack.D));
    return (fX0Y0Neg.div(step_x_den), fX0Y0Pos.div(step_x_den));
  }

  /// @dev compute y step size for initilization of ver hor newton method
  /// @param varPack pack of variables used for newton method computation
  /// @param fX0Y0Pos fX0Y0Pos
  /// @param fX0Y0Pos fX0Y0Pos
  /// @param omega omega
  function getStepY(
    VariablePack memory varPack,
    uint256 fX0Y0Pos,
    uint256 fX0Y0Neg,
    uint256 omega
  ) private pure returns (uint256, uint256) {
    uint256 stepYDen = ((varPack.Yfp.mul(varPack.D)).div(omega)).add(varPack.Xfp);
    return (fX0Y0Pos.div(stepYDen), fX0Y0Neg.div(stepYDen));
  }

  /// @dev compute omega to find x and y step size
  /// @param varPack pack of variables used for newton method computation
  /// @param N_COINS number of tokens in stable pool
  function getOmega(VariablePack memory varPack, uint256 N_COINS) internal view returns (uint256 omega) {
    uint256 tmp1 = varPack.X0.mul(varPack.Y0);
    uint256 tmp2 = epsA.mul(N_COINS.mul(N_COINS).mul(N_COINS));
    uint256 omegaNum = tmp1.add((varPack.U.mul((varPack.D).mul(varPack.D).div(varPack.Y0))).div(tmp2));
    uint256 omegaDen = tmp1.div(varPack.D).add(varPack.U.mul(varPack.D).div(varPack.X0.mul(tmp2)));
    return omegaNum.div(omegaDen);
  }

  /// @dev update x, y for newton method iterative convergence process
  /// @param x iterative x
  /// @param y iterative y
  /// @param varPack pack of variables used for newton method computation
  function updateXY(
    uint256 x,
    uint256 y,
    VariablePack memory varPack
  ) internal pure returns (uint256 x_, uint256 y_) {
    uint256 temp1 = varPack.D.div(varPack.Ann.mul(varPack.N_COINS));
    uint256 temp2 = varPack.U.mul(varPack.D);
    uint256 temp3 = varPack.S.add(varPack.D.div(varPack.Ann)).add(x).add(y).sub(varPack.D);
    x_ = ((x.mul(x)).add((temp2.div(y.mul(varPack.N_COINS))).mul(temp1))).div(x.add(temp3));
    y_ = ((y.mul(y)).add((temp2.div(x.mul(varPack.N_COINS))).mul(temp1))).div(y.add(temp3));
  }

  /// @dev compute x, y for each iteration of newton method
  /// @param x initial x
  /// @param y initial y
  /// @param varPack pack of variables used for newton method computation
  function verHorNewtonStep(
    uint256 x,
    uint256 y,
    VariablePack memory varPack
  ) internal view returns (uint256, uint256) {
    uint256 x_ = 0;
    uint256 y_ = 0;
    uint256 vxdyPos = 0;
    uint256 vydxPos = 0;
    for (uint128 _i = 0; _i < 255; _i++) {
      (x_, y_) = updateXY(x, y, varPack);

      if (withinDistance(y, y_, 1) || ((x_.mul(y_)).add(x.mul(y)) <= ((x_.mul(y)).add(x.mul(y_)).add(1)))) {
        break;
      }

      if (y_ > y) {
        vxdyPos = varPack.Xfp.mul(y_.sub(y));
        vydxPos = varPack.Yfp.mul(x_.sub(x));
      } else {
        vxdyPos = varPack.Xfp.mul(y.sub(y_));
        vydxPos = varPack.Yfp.mul(x.sub(x_));
      }

      if (vxdyPos > PRECISION.mul(PRECISION)) {
        // To prevent overflow
        vxdyPos = vxdyPos.div(PRECISION);
        vydxPos = vydxPos.div(PRECISION);
      }

      {
        uint256 sum_of_weights = vxdyPos.add(vydxPos);
        x = ((x_.mul(vxdyPos)).add(x.mul(vydxPos))).div(sum_of_weights);
        y = ((y.mul(vxdyPos)).add(y_.mul(vydxPos))).div(sum_of_weights);
      }
    }

    return (x, y);
  }

  /// @dev decides whether variable pair is within the convergence threshold
  /// @param x1 x1
  /// @param x2 x2
  /// @param d distance threshold
  function withinDistance(
    uint256 x1,
    uint256 x2,
    uint256 d
  ) private pure returns (bool) {
    if (x1 > x2) {
      if (x1.sub(x2) <= d) {
        return true;
      }
    } else {
      if (x2.sub(x1) <= d) {
        return true;
      }
    }
  }
}
