import { BigNumber, BigNumberish, Signer } from "ethers";
import { ethers } from "hardhat";
import {
  IERC20,
  MdexRouter,
  PancakeFactory,
  PancakeFactory__factory,
  PancakePair__factory,
  PancakeRouterV2,
  PancakeRouterV2__factory,
  MdexRouter__factory,
} from "../../typechain";
import { sqrt } from "./math";

export interface ILiquidity {
  token0: IERC20;
  token1: IERC20;
  amount0desired: BigNumberish;
  amount1desired: BigNumberish;
}

export interface IReserve {
  lp: string;
  totalSupply: BigNumber;
  t0: string;
  t1: string;
  r0: BigNumber;
  r1: BigNumber;
}

export class SwapHelper {
  private FOREVER = "2000000000";
  private factory: PancakeFactory;
  private router: PancakeRouterV2;
  private mdexRouter: MdexRouter;
  private signer: Signer;
  private fee: BigNumber;
  private feeDenom: BigNumber;

  public reserves: Array<IReserve>;

  constructor(
    _factoryAddress: string,
    _routerAddress: string,
    _fee: BigNumberish,
    _feeDenom: BigNumberish,
    _signer: Signer
  ) {
    this.router = PancakeRouterV2__factory.connect(_routerAddress, _signer);
    this.factory = PancakeFactory__factory.connect(_factoryAddress, _signer);
    this.signer = _signer;
    this.fee = ethers.BigNumber.from(_fee);
    this.feeDenom = ethers.BigNumber.from(_feeDenom);
    this.reserves = [];
    this.mdexRouter = MdexRouter__factory.connect(_routerAddress, _signer);
  }

  public async addLiquidities(liquidities: Array<ILiquidity>) {
    const wbnbAddress = await this.router.WETH();

    for (const liq of liquidities) {
      if (liq.token0.address === wbnbAddress)
        this.signer.sendTransaction({ to: wbnbAddress, value: liq.amount0desired });

      if (liq.token1.address === wbnbAddress)
        this.signer.sendTransaction({ to: wbnbAddress, value: liq.amount1desired });

      await liq.token0.approve(this.router.address, liq.amount0desired);
      await liq.token1.approve(this.router.address, liq.amount1desired);

      await this.router.addLiquidity(
        liq.token0.address,
        liq.token1.address,
        liq.amount0desired,
        liq.amount1desired,
        0,
        0,
        await this.signer.getAddress(),
        this.FOREVER
      );
    }
  }

  public async addMdexLiquidities(liquidities: Array<ILiquidity>) {
    const wbnbAddress = await this.mdexRouter.WBNB();

    for (const liq of liquidities) {
      if (liq.token0.address === wbnbAddress)
        this.signer.sendTransaction({ to: wbnbAddress, value: liq.amount0desired });

      if (liq.token1.address === wbnbAddress)
        this.signer.sendTransaction({ to: wbnbAddress, value: liq.amount1desired });

      await liq.token0.approve(this.router.address, liq.amount0desired);
      await liq.token1.approve(this.router.address, liq.amount1desired);

      await this.router.addLiquidity(
        liq.token0.address,
        liq.token1.address,
        liq.amount0desired,
        liq.amount1desired,
        0,
        0,
        await this.signer.getAddress(),
        this.FOREVER
      );
    }
  }

  public async loadReserves(path: string[]): Promise<Array<IReserve>> {
    const reserves: Array<IReserve> = [];
    for (let i = 1; i < path.length; i++) {
      const currLp = PancakePair__factory.connect(await this.factory.getPair(path[i - 1], path[i]), this.signer);
      const [r0, r1] = await currLp.getReserves();
      const foundReserveIdx = this.reserves.findIndex((r) => r.lp === currLp.address);
      if (foundReserveIdx !== -1) {
        this.reserves[foundReserveIdx].totalSupply = await currLp.totalSupply();
        this.reserves[foundReserveIdx].r0 = r0;
        this.reserves[foundReserveIdx].r1 = r1;
      } else {
        this.reserves.push({
          lp: currLp.address,
          totalSupply: await currLp.totalSupply(),
          t0: await currLp.token0(),
          t1: await currLp.token1(),
          r0,
          r1,
        });
      }
    }
    return reserves;
  }

  public getMktSell(aIn: BigNumber, rIn: BigNumber, rOut: BigNumber): BigNumber {
    const aInWithFee = aIn.mul(this.fee);
    const numerator = aInWithFee.mul(rOut);
    const denominator = rIn.mul(this.feeDenom).add(aInWithFee);
    return numerator.div(denominator);
  }

  public async computeLpHealth(liquidity: BigNumber, tokenA: string, tokenB: string): Promise<BigNumber> {
    const [tokenAamount, tokenBamount, rA, rB] = await this.computeUnderlaying(liquidity, tokenA, tokenB);
    return tokenAamount.add(this.getMktSell(tokenBamount, rB.sub(tokenBamount), rA.sub(tokenAamount)));
  }

  public async computeSwapExactTokensForTokens(
    amtIn: BigNumber,
    path: string[],
    updateReserve: boolean
  ): Promise<BigNumber[]> {
    const amts = [amtIn];
    for (let i = 1; i < path.length; i++) {
      const currLp = PancakePair__factory.connect(await this.factory.getPair(path[i - 1], path[i]), this.signer);
      const reserveIdx = this.reserves.findIndex((r) => r.lp === currLp.address);
      if (reserveIdx === -1) {
        throw new Error("computeSwapExactTokensForTokens: not found reserve");
      }

      const isReverse = (await currLp.token0()) != path[i];
      const [rOut, rIn] = isReverse
        ? [this.reserves[reserveIdx].r1, this.reserves[reserveIdx].r0]
        : [this.reserves[reserveIdx].r0, this.reserves[reserveIdx].r1];
      amts.push(this.getMktSell(amts[i - 1], rIn, rOut));

      if (updateReserve) {
        if (isReverse) {
          this.reserves[reserveIdx].r1 = this.reserves[reserveIdx].r1.sub(amts[i]);
          this.reserves[reserveIdx].r0 = this.reserves[reserveIdx].r0.add(amts[i - 1]);
        } else {
          this.reserves[reserveIdx].r0 = this.reserves[reserveIdx].r0.sub(amts[i]);
          this.reserves[reserveIdx].r1 = this.reserves[reserveIdx].r1.add(amts[i - 1]);
        }
      }
    }

    return amts;
  }

  public async computeSwapTokensForExactTokens(
    amtOut: BigNumber,
    path: string[],
    updateReserve: boolean
  ): Promise<BigNumber[]> {
    const amts = new Array(path.length);
    amts[amts.length - 1] = amtOut;
    for (let i = path.length - 1; i > 0; i--) {
      const currLp = PancakePair__factory.connect(await this.factory.getPair(path[i - 1], path[i]), this.signer);
      const reserveIdx = this.reserves.findIndex((r) => r.lp === currLp.address);
      if (reserveIdx === -1) {
        throw new Error("computeSwapExactTokensForTokens: not found reserve");
      }
      const isReverse = (await currLp.token0()) != path[i - 1];
      const [rOut, rIn] = isReverse
        ? [this.reserves[reserveIdx].r1, this.reserves[reserveIdx].r0]
        : [this.reserves[reserveIdx].r0, this.reserves[reserveIdx].r1];
      const numerator = rIn.mul(amts[i]).mul(this.feeDenom);
      const denominator = rOut.sub(amts[i]).mul(this.fee);
      amts[i - 1] = numerator.div(denominator).add(1);

      if (updateReserve) {
        if (isReverse) {
          this.reserves[reserveIdx].r1 = this.reserves[reserveIdx].r1.sub(amts[i - 1]);
          this.reserves[reserveIdx].r0 = this.reserves[reserveIdx].r0.add(amts[i]);
        } else {
          this.reserves[reserveIdx].r0 = this.reserves[reserveIdx].r0.sub(amts[i - 1]);
          this.reserves[reserveIdx].r1 = this.reserves[reserveIdx].r1.add(amts[i]);
        }
      }
    }

    return amts;
  }

  public async computeOneSidedOptimalSwap(amt: BigNumber, path: string[]): Promise<BigNumber> {
    const currLp = PancakePair__factory.connect(
      await this.factory.getPair(path[path.length - 1], path[0]),
      this.signer
    );
    const reserveIdx = this.reserves.findIndex((r) => r.lp === currLp.address);
    if (reserveIdx === -1) {
      throw new Error("computeOneSidedOptimalSwap: not found reserve");
    }
    const con1 = BigNumber.from(2).mul(this.feeDenom).sub(this.feeDenom.sub(this.fee));
    const con2 = BigNumber.from(4).mul(this.fee).mul(this.feeDenom);
    const con3 = this.feeDenom.add(this.fee).pow(2);
    const con4 = this.fee.mul(2);

    const rIn = (await currLp.token0()) == path[0] ? this.reserves[reserveIdx].r0 : this.reserves[reserveIdx].r1;
    const swapAmt = sqrt(rIn.mul(amt.mul(con2).add(rIn.mul(con3))))
      .sub(rIn.mul(con1))
      .div(con4);

    return swapAmt;
  }

  public async computeTwoSidesOptimalSwap(
    amt0: BigNumber,
    amt1: BigNumber,
    path: string[]
  ): Promise<[BigNumber, boolean]> {
    const currLp = PancakePair__factory.connect(
      await this.factory.getPair(path[path.length - 1], path[0]),
      this.signer
    );
    const reserveIdx = this.reserves.findIndex((r) => r.lp === currLp.address);
    if (reserveIdx === -1) {
      throw new Error("computeTwoSidesOptimalSwap: not found reserve");
    }
    const [r0, r1] =
      (await currLp.token0()) === path[0]
        ? [this.reserves[reserveIdx].r0, this.reserves[reserveIdx].r1]
        : [this.reserves[reserveIdx].r1, this.reserves[reserveIdx].r0];
    let amtA = amt0;
    let amtB = amt1;
    let rA = r0;
    let rB = r1;
    let isReversed = false;
    if (amt0.mul(r1) < amt1.mul(r0)) {
      amtA = amt1;
      amtB = amt0;
      rA = r1;
      rB = r0;
      isReversed = true;
    }

    const a = this.fee;
    const b = this.feeDenom.add(this.fee).mul(rA);
    const _c = amtA.mul(rB).sub(amtB.mul(rA));
    const c = _c.mul(this.feeDenom).div(amtB.add(rB)).mul(rA);

    const d = a.mul(c).mul(4);
    const e = sqrt(b.mul(b).add(d));

    const numerator = e.sub(b);
    const denominator = a.mul(2);

    return [numerator.div(denominator), isReversed];
  }

  public async computeRemoveLiquidiy(
    tokenA: string,
    tokenB: string,
    liquidity: BigNumber
  ): Promise<[amountA: BigNumber, amountB: BigNumber]> {
    const currLp = PancakePair__factory.connect(await this.factory.getPair(tokenA, tokenB), this.signer);
    const reserveIdx = this.reserves.findIndex((r) => r.lp === currLp.address);
    if (reserveIdx === -1) {
      throw new Error("removeLiquidity: not found reserve");
    }

    const isReversed = (await currLp.token0()) !== tokenA;
    let [reserveA, reserveB] = !isReversed
      ? [this.reserves[reserveIdx].r0, this.reserves[reserveIdx].r1]
      : [this.reserves[reserveIdx].r1, this.reserves[reserveIdx].r0];

    const amountA = liquidity.mul(reserveA).div(this.reserves[reserveIdx].totalSupply);
    const amountB = liquidity.mul(reserveB).div(this.reserves[reserveIdx].totalSupply);

    this.reserves[reserveIdx].r0 = this.reserves[reserveIdx].r0.sub(!isReversed ? amountA : amountB);
    this.reserves[reserveIdx].r1 = this.reserves[reserveIdx].r1.sub(!isReversed ? amountB : amountA);
    this.reserves[reserveIdx].totalSupply = this.reserves[reserveIdx].totalSupply.sub(liquidity);

    return [amountA, amountB];
  }

  public async computeAddLiquidity(
    tokenA: string,
    tokenB: string,
    amountA: BigNumber,
    amountB: BigNumber
  ): Promise<[BigNumber, BigNumber, BigNumber]> {
    const currLp = PancakePair__factory.connect(await this.factory.getPair(tokenA, tokenB), this.signer);
    const reserveIdx = this.reserves.findIndex((r) => r.lp === currLp.address);
    if (reserveIdx === -1) {
      throw new Error("computeAddLiquidity: not found reserve");
    }

    const isReversed = (await currLp.token0()) !== tokenA;
    let [reserveA, reserveB] = !isReversed
      ? [this.reserves[reserveIdx].r0, this.reserves[reserveIdx].r1]
      : [this.reserves[reserveIdx].r1, this.reserves[reserveIdx].r0];
    let [debrisA, debrisB] = [BigNumber.from(0), BigNumber.from(0)];

    const amountBOptimal = this.quote(amountA, reserveA, reserveB);
    if (amountBOptimal <= amountB) {
      debrisB = amountB.sub(amountBOptimal);
      amountB = amountBOptimal;
    } else {
      const amountAOptimal = this.quote(amountB, reserveB, reserveA);
      if (amountAOptimal <= amountA) {
        debrisA = amountA.sub(amountAOptimal);
        amountA = amountAOptimal;
      }
    }

    const lpTokenA = amountA.mul(this.reserves[reserveIdx].totalSupply).div(reserveA);
    const lpTokenB = amountB.mul(this.reserves[reserveIdx].totalSupply).div(reserveB);
    const moreLp = lpTokenA < lpTokenB ? lpTokenA : lpTokenB;

    this.reserves[reserveIdx].r0 = this.reserves[reserveIdx].r0.add(!isReversed ? amountA : amountB);
    this.reserves[reserveIdx].r1 = this.reserves[reserveIdx].r1.add(!isReversed ? amountB : amountA);
    this.reserves[reserveIdx].totalSupply = this.reserves[reserveIdx].totalSupply.add(moreLp);

    return [moreLp, debrisA, debrisB];
  }

  public quote(amountA: BigNumber, reserveA: BigNumber, reserveB: BigNumber): BigNumber {
    return amountA.mul(reserveB).div(reserveA);
  }

  public async computeReinvestLp(
    lpBefore: BigNumber,
    debrisBtoken: BigNumber,
    rewardPerBlock: BigNumber,
    reinvestBounty: BigNumber,
    reinvestPath: string[],
    path: string[],
    blockDiff: BigNumber,
    precision: BigNumber = BigNumber.from(1e12)
  ): Promise<[reinvestFees: BigNumber, reinvestLp: BigNumber, debrisBtoken: BigNumber, debrisFtoken: BigNumber]> {
    const totalRewards = this.computeTotalRewards(lpBefore, rewardPerBlock, blockDiff, precision);
    const reinvestFees = totalRewards.mul(reinvestBounty).div(10000);
    const reinvestLeft = totalRewards.sub(reinvestFees);
    const reinvestAmts = await this.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
    return [
      reinvestFees,
      ...(await this.computeOneSidedOptimalLp(reinvestAmts[reinvestAmts.length - 1].add(debrisBtoken), path)),
    ];
  }

  public async computeOneSidedOptimalLp(
    btokenAmount: BigNumber,
    path: string[]
  ): Promise<[BigNumber, BigNumber, BigNumber]> {
    const optimalSwapAmt = await this.computeOneSidedOptimalSwap(btokenAmount, path);
    const amts = await this.computeSwapExactTokensForTokens(optimalSwapAmt, path, true);
    const [moreLp, debrisBtoken, debrisFtoken] = await this.computeAddLiquidity(
      path[0],
      path[1],
      btokenAmount.sub(optimalSwapAmt),
      amts[amts.length - 1]
    );

    return [moreLp, debrisBtoken, debrisFtoken];
  }

  public async computeTwoSidesOptimalLp(
    btokenAmount: BigNumber,
    ftokenAmount: BigNumber,
    path: string[]
  ): Promise<[BigNumber, BigNumber, BigNumber]> {
    const [swapAmt, isReversed] = await this.computeTwoSidesOptimalSwap(btokenAmount, ftokenAmount, path);
    const amts = isReversed
      ? await this.computeSwapExactTokensForTokens(swapAmt, [path[1], path[0]], true)
      : await this.computeSwapExactTokensForTokens(swapAmt, [path[0], path[1]], true);
    const [moreLp, debrisBtoken, debrisFtoken] = isReversed
      ? await this.computeAddLiquidity(
          path[0],
          path[1],
          btokenAmount.add(amts[amts.length - 1]),
          ftokenAmount.sub(swapAmt)
        )
      : await this.computeAddLiquidity(
          path[0],
          path[1],
          btokenAmount.sub(swapAmt),
          ftokenAmount.add(amts[amts.length - 1])
        );

    return [moreLp, debrisBtoken, debrisFtoken];
  }

  public async computeUnderlaying(
    amount: BigNumber,
    tokenA: string,
    tokenB: string
  ): Promise<[BigNumber, BigNumber, BigNumber, BigNumber]> {
    const currLp = PancakePair__factory.connect(await this.factory.getPair(tokenA, tokenB), this.signer);
    const reserveIdx = this.reserves.findIndex((r) => r.lp === currLp.address);
    if (reserveIdx === -1) {
      throw new Error("computeUnderlaying: not found reserve");
    }

    const [r0, r1] = await currLp.getReserves();
    const [rA, rB] = (await currLp.token0()) === tokenA ? [r0, r1] : [r1, r0];

    const amountA = amount.mul(rA).div(this.reserves[reserveIdx].totalSupply);
    const amountB = amount.mul(rB).div(this.reserves[reserveIdx].totalSupply);

    return [amountA, amountB, rA, rB];
  }

  public computeTotalRewards(
    lp: BigNumberish,
    rewardPerBlock: BigNumberish,
    blockDiff: BigNumberish,
    precision: BigNumberish = BigNumber.from(1e12)
  ): BigNumber {
    const rewardPerBlockBN = BigNumber.from(rewardPerBlock);
    const lpBN = BigNumber.from(lp);

    const amplifiedReward = rewardPerBlockBN.mul(blockDiff).mul(precision);

    return lpBN.mul(amplifiedReward.div(lp)).div(precision);
  }
}
