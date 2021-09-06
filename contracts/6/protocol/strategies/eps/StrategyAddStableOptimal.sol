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
    uint128 i;
    uint128 j;
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

    IWorker worker = IWorker(msg.sender);
    address baseToken = worker.baseToken();
    address farmingToken = worker.farmingToken();
    require(espPoolTokens[baseToken] && espPoolTokens[farmingToken], "!worker not compatiable");

    vault.requestFunds(farmingToken, farmingTokenAmount);
    uint256 baseTokenAmount = baseToken.myBalance();
    BalancePair memory user_balances = BalancePair(baseTokenAmount, farmingTokenAmount);

    PoolState memory fp_state;
    IPancakePair lpToken = IPancakePair(factory.getPair(farmingToken, baseToken));
    {
      (uint256 _reserve0, uint256 _reserve1, ) = lpToken.getReserves();
      uint256[3] memory fp_balances = [_reserve0, _reserve1, 0];
      uint128 i_fp = 0;
      uint128 j_fp = 1;
      if (lpToken.token0() != baseToken) {
        i_fp = 1;
        j_fp = 0;
      }
      fp_state = PoolState(i_fp, j_fp, fp_balances);
    }

    PoolState memory sb_state;
    {
      uint256[3] memory sb_balances = [epsPool.balances(0), epsPool.balances(1), epsPool.balances(2)];
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
      sb_state = PoolState(i_sb, j_sb, sb_balances);
    }

    // calc dx to swap on EPS
    uint256 dx;
    {
      if ((fp_state.balances[fp_state.i]).mul(user_balances.y) >= (fp_state.balances[fp_state.j]).mul(user_balances.x)) {
        (fp_state.i, fp_state.j) = (fp_state.j, fp_state.i);
        (sb_state.i, sb_state.j) = (sb_state.j, sb_state.i);
        (user_balances.x, user_balances.y) = (user_balances.y, user_balances.x);
      }
      user_balances.y = (user_balances.y.mul(epsFeeDenom)).div(epsFeeDenom.sub(epsFee));
      dx = get_dx(fp_state, sb_state, user_balances);
    }
    // approve EPS pool
    baseToken.safeApprove(address(epsPool), uint256(-1));
    farmingToken.safeApprove(address(epsPool), uint256(-1));
    // approve PCS router to do their stuffs
    baseToken.safeApprove(address(router), uint256(-1));
    farmingToken.safeApprove(address(router), uint256(-1));

    // swap on EPS
    if (dx > 0) epsPool.exchange(int128(sb_state.i), int128(sb_state.j), dx, 0);

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
  /// @param fp_state the state of fixed-product pool
  /// @param D constant D
  function simplify_fp_state(PoolState memory fp_state, uint256 D) private pure returns (PoolState memory) {
    // only ratio that matters (order of D but remain ratio)
    // must compute fp_state.j then fp_state.i, never swap line
    fp_state.balances[fp_state.j] = D.mul(fp_state.balances[fp_state.j]).div(fp_state.balances[fp_state.i]);
    fp_state.balances[fp_state.i] = D;
    return fp_state;
  }

  /// @dev Calculate the amount of token x (dx) to be swapped to amount token y (dy) which will give user the largest LP position on PCS
  /// @param fp_state the state of fixed-product pool
  /// @param fp_state the state of fixed-product pool
  /// @param user_balances user balances
  function get_dx(
    PoolState memory fp_state,
    PoolState memory sb_state,
    BalancePair memory user_balances
  ) private view returns (uint256) {
    uint256 N_COINS = sb_state.balances.length; 
    uint256 Ann = epsA.mul(N_COINS);
    uint256 D = get_D(sb_state.balances, epsA);
    fp_state = simplify_fp_state(fp_state, D);

    // avoid stack too deep
    uint256 S = 0;
    uint256 U = D;
    
    {
      for (uint128 _i = 0; _i < N_COINS; _i++) {
        if (_i != sb_state.i && _i != sb_state.j) {
          S = S.add(sb_state.balances[_i]);
          U = (U.mul(D)).div(sb_state.balances[_i].mul(N_COINS));
        }
      }
    }
    uint256 x = 0;
    uint256 y = 0;
    // avoid stack too deep
    {
      VariablePack memory var_pack =
        VariablePack(
          user_balances.x,
          user_balances.y,
          sb_state.balances[sb_state.i], 
          sb_state.balances[sb_state.j],
          D,
          S,
          U,
          fp_state.balances[fp_state.i],
          fp_state.balances[fp_state.j],
          N_COINS,
          Ann
        );
      var_pack.Xfp = (var_pack.Xfp).sub((var_pack.Xfp).mul(epsFee).div(epsFeeDenom));
      (x, y) = find_intersection_of_l_with_tangent(var_pack, N_COINS);
      (x, y) = ver_hor_newton_step(x, y, var_pack);
    }
    if (x < sb_state.balances[sb_state.i]) {
      return 0;
    } else {
      return x.sub(sb_state.balances[sb_state.i]);
    }
  }

  /// @dev Calculate the amount of token x (dx) to be swapped to amount token y (dy) which will give user the largest LP position on PCS
  /// @param fp_state the state of fixed-product pool
  /// @param fp_state the state of fixed-product pool
  /// @param user_balances user balances
  function f_pos(
    uint256 Yfp,
    uint256 yi_,
    uint256 Y0,
    uint256 Xfp,
    uint256 x
  ) private pure returns (uint256) {
    return Yfp.mul(x).add((yi_.add(Y0)).mul(Xfp));
  }

  function f_neg(
    uint256 Xfp,
    uint256 xi,
    uint256 X0,
    uint256 Yfp,
    uint256 y
  ) private pure returns (uint256) {
    return Xfp.mul(y).add((xi.add(X0)).mul(Yfp));
  }

  /// @dev ___
  /// @param xp ___
  /// @param amp ___
  function get_D(uint256[3] memory xp, uint256 amp) private pure returns (uint256) {
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

  /// @dev Find the initialization corrdinate x, y before starting the newton method
  /// @param var_pack pack of variables used for newton method computation
  /// @param N_COINS number of tokens in stable pool
  function find_intersection_of_l_with_tangent(VariablePack memory var_pack, uint256 N_COINS)
    internal
    view
    returns (uint256 x, uint256 y)
  {
    // X0 = sb_state.balances[sb_state.i];
    // Y0 = sb_state.balances[sb_state.j];
    uint256 step_x_pos = 0;
    uint256 step_x_neg = 0;
    uint256 step_y_pos = 0;
    uint256 step_y_neg = 0;
    {
      uint256 omega = get_omega(var_pack, N_COINS);
      uint256 fX0Y0_pos = f_pos(var_pack.Yfp, var_pack.Yinit, var_pack.Y0, var_pack.Xfp, var_pack.X0);
      uint256 fX0Y0_neg = f_neg(var_pack.Xfp, var_pack.Xinit, var_pack.X0, var_pack.Yfp, var_pack.Y0);
      (step_x_pos, step_x_neg) = get_step_x(var_pack, fX0Y0_pos, fX0Y0_neg, omega);
      (step_y_pos, step_y_neg) = get_step_y(var_pack, fX0Y0_pos, fX0Y0_neg, omega);
    }
    require(var_pack.Y0.add(step_y_pos) > step_y_neg, "Cannot trade, not enough money in CURVE pool");
    return (var_pack.X0.add(step_x_pos).sub(step_x_neg), var_pack.Y0.add(step_y_pos).sub(step_y_neg));
  }

  function get_step_x(
    VariablePack memory var_pack,
    uint256 fX0Y0_pos,
    uint256 fX0Y0_neg,
    uint256 omega
  ) private pure returns (uint256, uint256) {
    uint256 step_x_den = var_pack.Yfp.add((var_pack.Xfp.mul(omega)).div(var_pack.D));
    return (fX0Y0_neg.div(step_x_den), fX0Y0_pos.div(step_x_den));
  }

  /// @dev ___
  /// @param xp ___
  /// @param amp ___
  function get_step_y(
    VariablePack memory var_pack,
    uint256 fX0Y0_pos,
    uint256 fX0Y0_neg,
    uint256 omega
  ) private pure returns (uint256, uint256) {
    uint256 step_y_den = ((var_pack.Yfp.mul(var_pack.D)).div(omega)).add(var_pack.Xfp);
    return (fX0Y0_pos.div(step_y_den), fX0Y0_neg.div(step_y_den));
  }

  function get_omega(VariablePack memory var_pack, uint256 N_COINS) internal view returns (uint256 omega) {
    uint256 tmp1 = var_pack.X0.mul(var_pack.Y0);
    uint256 tmp2 = epsA.mul(N_COINS.mul(N_COINS).mul(N_COINS));
    uint256 omega_num = tmp1.add((var_pack.U.mul((var_pack.D).mul(var_pack.D).div(var_pack.Y0))).div(tmp2));
    uint256 omega_den = tmp1.div(var_pack.D).add(var_pack.U.mul(var_pack.D).div(var_pack.X0.mul(tmp2)));
    return omega_num.div(omega_den);
  }

  function update_x_y_(
    uint256 x,
    uint256 y,
    VariablePack memory var_pack
  ) internal pure returns (uint256 x_, uint256 y_) {
    uint256 temp_1 = var_pack.D.div(var_pack.Ann.mul(var_pack.N_COINS));
    uint256 temp_2 = var_pack.U.mul(var_pack.D);
    uint256 temp_3 = var_pack.S.add(var_pack.D.div(var_pack.Ann)).add(x).add(y).sub(var_pack.D);
    x_ = ((x.mul(x)).add((temp_2.div(y.mul(var_pack.N_COINS))).mul(temp_1))).div(x.add(temp_3));
    y_ = ((y.mul(y)).add((temp_2.div(x.mul(var_pack.N_COINS))).mul(temp_1))).div(y.add(temp_3));
  }

  function ver_hor_newton_step(
    uint256 x,
    uint256 y,
    VariablePack memory var_pack
  ) internal view returns (uint256, uint256) {
    uint256 x_ = 0;
    uint256 y_ = 0;
    uint256 vxdy_pos = 0;
    uint256 vydx_pos = 0;
    for (uint128 _i = 0; _i < 255; _i++) {
      (x_, y_) = update_x_y_(x, y, var_pack);

      if (within_distance(y, y_, 1) || ((x_.mul(y_)).add(x.mul(y)) <= ((x_.mul(y)).add(x.mul(y_)).add(1)))) {
        break;
      }

      if (y_ > y) {
        vxdy_pos = var_pack.Xfp.mul(y_.sub(y));
        vydx_pos = var_pack.Yfp.mul(x_.sub(x));
      } else {
        vxdy_pos = var_pack.Xfp.mul(y.sub(y_));
        vydx_pos = var_pack.Yfp.mul(x.sub(x_));
      }

      if (vxdy_pos > PRECISION.mul(PRECISION)) {
        // To prevent overflow
        vxdy_pos = vxdy_pos.div(PRECISION);
        vydx_pos = vydx_pos.div(PRECISION);
      }

      {
        uint256 sum_of_weights = vxdy_pos.add(vydx_pos);
        x = ((x_.mul(vxdy_pos)).add(x.mul(vydx_pos))).div(sum_of_weights);
        y = ((y.mul(vxdy_pos)).add(y_.mul(vydx_pos))).div(sum_of_weights);
      }
    }

    return (x, y);
  }

  function within_distance(
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
