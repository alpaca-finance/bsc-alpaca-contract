import { BigNumberish, Signer } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
  AlpacaToken,
  AlpacaToken__factory,
  CakeToken,
  CakeToken__factory,
  DebtToken,
  DebtToken__factory,
  FairLaunch,
  FairLaunch__factory,
  MockERC20,
  MockERC20__factory,
  MockWBNB,
  MockWBNB__factory,
  PancakeFactory,
  PancakeFactory__factory,
  PancakeMasterChef,
  PancakeMasterChef__factory,
  PancakeRouterV2,
  PancakeRouterV2__factory,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory,
  PancakeswapV2RestrictedStrategyLiquidate,
  PancakeswapV2RestrictedStrategyLiquidate__factory,
  PancakeswapV2RestrictedStrategyPartialCloseLiquidate,
  PancakeswapV2RestrictedStrategyPartialCloseLiquidate__factory,
  PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading,
  PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading__factory,
  PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading,
  PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading__factory,
  PancakeswapV2Worker,
  PancakeswapV2Worker02,
  PancakeswapV2Worker02__factory,
  PancakeswapV2Worker__factory,
  SimpleVaultConfig,
  SimpleVaultConfig__factory,
  SyrupBar,
  SyrupBar__factory,
  Vault,
  Vault__factory,
  WaultSwapFactory,
  WaultSwapFactory__factory,
  WaultSwapRestrictedStrategyAddBaseTokenOnly,
  WaultSwapRestrictedStrategyAddBaseTokenOnly__factory,
  WaultSwapRestrictedStrategyAddTwoSidesOptimal,
  WaultSwapRestrictedStrategyAddTwoSidesOptimal__factory,
  WaultSwapRestrictedStrategyLiquidate,
  WaultSwapRestrictedStrategyLiquidate__factory,
  WaultSwapRestrictedStrategyPartialCloseLiquidate,
  WaultSwapRestrictedStrategyPartialCloseLiquidate__factory,
  WaultSwapRestrictedStrategyPartialCloseMinimizeTrading,
  WaultSwapRestrictedStrategyPartialCloseMinimizeTrading__factory,
  WaultSwapRestrictedStrategyWithdrawMinimizeTrading,
  WaultSwapRestrictedStrategyWithdrawMinimizeTrading__factory,
  WaultSwapRouter,
  WaultSwapRouter__factory,
  WaultSwapToken,
  WaultSwapToken__factory,
  WexMaster,
  WexMaster__factory,
  WNativeRelayer,
  WNativeRelayer__factory,
  MdexFactory__factory,
  MdexRouter__factory,
  BSCPool__factory,
  BSCPool,
  MdexRouter,
  MdexFactory,
  MdexWorker02,
  MdexWorker02__factory,
  MdxToken,
  MdxToken__factory,
  MdexRestrictedStrategyAddBaseTokenOnly,
  MdexRestrictedStrategyAddTwoSidesOptimal,
  MdexRestrictedStrategyLiquidate,
  MdexRestrictedStrategyPartialCloseLiquidate,
  MdexRestrictedStrategyPartialCloseMinimizeTrading,
  MdexRestrictedStrategyWithdrawMinimizeTrading,
  MdexRestrictedStrategyAddBaseTokenOnly__factory,
  MdexRestrictedStrategyLiquidate__factory,
  MdexRestrictedStrategyPartialCloseLiquidate__factory,
  MdexRestrictedStrategyPartialCloseMinimizeTrading__factory,
  MdexRestrictedStrategyWithdrawMinimizeTrading__factory,
  MdexRestrictedStrategyAddTwoSidesOptimal__factory,
  Oracle__factory,
  SwapMining,
  SwapMining__factory,
  SpookyToken,
  SpookyMasterChef,
  SpookyToken__factory,
  SpookyMasterChef__factory,
  SpookySwapStrategyAddBaseTokenOnly,
  SpookySwapStrategyAddBaseTokenOnly__factory,
  SpookySwapStrategyLiquidate,
  SpookySwapStrategyAddTwoSidesOptimal,
  SpookySwapStrategyWithdrawMinimizeTrading,
  SpookySwapStrategyPartialCloseLiquidate,
  SpookySwapStrategyPartialCloseMinimizeTrading,
  SpookySwapStrategyLiquidate__factory,
  SpookySwapStrategyAddTwoSidesOptimal__factory,
  SpookySwapStrategyWithdrawMinimizeTrading__factory,
  SpookySwapStrategyPartialCloseLiquidate__factory,
  SpookySwapStrategyPartialCloseMinimizeTrading__factory,
  Vault2__factory,
  Vault2,
  MiniFL,
  MiniFL__factory,
  Rewarder1,
  Rewarder1__factory,
  IVault,
  BaseV1Factory,
  BaseV1Router01,
  LpDepositor,
  BaseV1Factory__factory,
  BaseV1Router01__factory,
  LpDepositor__factory,
  BaseV1Voter__factory,
  BaseV1GaugeFactory,
  BaseV1GaugeFactory__factory,
  BaseV1BribeFactory,
  BaseV1BribeFactory__factory,
  BaseV1__factory,
  BaseV1,
  BaseV1Voter,
  SolidlyStrategyAddBaseTokenOnly,
  SolidlyStrategyLiquidate,
  SolidlyStrategyAddTwoSidesOptimal,
  SolidlyStrategyWithdrawMinimizeTrading,
  SolidlyStrategyPartialCloseLiquidate,
  SolidlyStrategyPartialCloseMinimizeTrading,
  SolidlyStrategyAddBaseTokenOnly__factory,
  SolidlyStrategyLiquidate__factory,
  SolidlyStrategyAddTwoSidesOptimal__factory,
  SolidlyStrategyWithdrawMinimizeTrading__factory,
  SolidlyStrategyPartialCloseLiquidate__factory,
  SolidlyStrategyPartialCloseMinimizeTrading__factory,
  SolidexToken__factory,
  VeDepositor__factory,
  VeDist__factory,
  VeSOLID__factory,
  VeSOLID,
  SolidexToken,
  WrappedFtm,
  MockWFTM,
  MockSolidexVoter__factory,
  MockSolidexVoter,
} from "../../typechain";
import { DepositToken__factory } from "../../typechain/factories/DepositToken__factory";
import { MockSolidexFeeDistributor__factory } from "../../typechain/factories/MockSolidexFeeDistributor__factory";

import * as TimeHelpers from "../helpers/time";

export interface IBEP20 {
  name: string;
  symbol: string;
  decimals: BigNumberish;
  holders?: Array<IHolder>;
}

export interface IHolder {
  address: string;
  amount: BigNumberish;
}

export interface IVaultConfig {
  minDebtSize: BigNumberish;
  interestRate: BigNumberish;
  reservePoolBps: BigNumberish;
  killPrizeBps: BigNumberish;
  killTreasuryBps: BigNumberish;
  killTreasuryAddress: string;
}

export class DeployHelper {
  private deployer: Signer;

  constructor(_deployer: Signer) {
    this.deployer = _deployer;
  }

  public async deployWBNB(): Promise<MockWBNB> {
    const WBNB = (await ethers.getContractFactory("MockWBNB", this.deployer)) as MockWBNB__factory;
    const wbnb = await WBNB.deploy();
    await wbnb.deployed();
    return wbnb;
  }

  public async deployPancakeV2(
    wbnb: MockWBNB,
    cakePerBlock: BigNumberish,
    cakeHolders: Array<IHolder>
  ): Promise<[PancakeFactory, PancakeRouterV2, CakeToken, SyrupBar, PancakeMasterChef]> {
    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory(
      "PancakeFactory",
      this.deployer
    )) as PancakeFactory__factory;
    const factoryV2 = await PancakeFactory.deploy(await this.deployer.getAddress());
    await factoryV2.deployed();

    const PancakeRouterV2 = (await ethers.getContractFactory(
      "PancakeRouterV2",
      this.deployer
    )) as PancakeRouterV2__factory;
    const routerV2 = await PancakeRouterV2.deploy(factoryV2.address, wbnb.address);
    await routerV2.deployed();

    // Deploy CAKE
    const CakeToken = (await ethers.getContractFactory("CakeToken", this.deployer)) as CakeToken__factory;
    const cake = await CakeToken.deploy();
    await cake.deployed();
    if (cakeHolders !== undefined) {
      cakeHolders.forEach(
        async (cakeHolder) => await cake["mint(address,uint256)"](cakeHolder.address, cakeHolder.amount)
      );
    }

    const SyrupBar = (await ethers.getContractFactory("SyrupBar", this.deployer)) as SyrupBar__factory;
    const syrup = await SyrupBar.deploy(cake.address);
    await syrup.deployed();

    /// Setup MasterChef
    const PancakeMasterChef = (await ethers.getContractFactory(
      "PancakeMasterChef",
      this.deployer
    )) as PancakeMasterChef__factory;
    const masterChef = await PancakeMasterChef.deploy(
      cake.address,
      syrup.address,
      await this.deployer.getAddress(),
      cakePerBlock,
      0
    );
    await masterChef.deployed();

    // Transfer ownership so masterChef can mint CAKE
    await Promise.all([
      await cake.transferOwnership(masterChef.address),
      await syrup.transferOwnership(masterChef.address),
    ]);

    return [factoryV2, routerV2, cake, syrup, masterChef];
  }

  public async deployPancakeV2Strategies(
    router: PancakeRouterV2,
    vault: Vault,
    wbnb: MockWBNB,
    wNativeRelayer: WNativeRelayer
  ): Promise<
    [
      PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
      PancakeswapV2RestrictedStrategyLiquidate,
      PancakeswapV2RestrictedStrategyAddTwoSidesOptimal,
      PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading,
      PancakeswapV2RestrictedStrategyPartialCloseLiquidate,
      PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading
    ]
  > {
    /// Setup strategy
    const PancakeswapV2RestrictedStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyAddBaseTokenOnly",
      this.deployer
    )) as PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory;
    const addStrat = (await upgrades.deployProxy(PancakeswapV2RestrictedStrategyAddBaseTokenOnly, [
      router.address,
    ])) as PancakeswapV2RestrictedStrategyAddBaseTokenOnly;
    await addStrat.deployed();

    const PancakeswapV2RestrictedStrategyLiquidate = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyLiquidate",
      this.deployer
    )) as PancakeswapV2RestrictedStrategyLiquidate__factory;
    const liqStrat = (await upgrades.deployProxy(PancakeswapV2RestrictedStrategyLiquidate, [
      router.address,
    ])) as PancakeswapV2RestrictedStrategyLiquidate;
    await liqStrat.deployed();

    const PancakeswapV2RestrictedStrategyAddTwoSidesOptimal = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyAddTwoSidesOptimal",
      this.deployer
    )) as PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory;
    const twoSidesStrat = (await upgrades.deployProxy(PancakeswapV2RestrictedStrategyAddTwoSidesOptimal, [
      router.address,
      vault.address,
    ])) as PancakeswapV2RestrictedStrategyAddTwoSidesOptimal;

    const PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading",
      this.deployer
    )) as PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading__factory;
    const minimizeTradeStrat = (await upgrades.deployProxy(PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading, [
      router.address,
      wbnb.address,
      wNativeRelayer.address,
    ])) as PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading;

    const PancakeswapV2RestrictedStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyPartialCloseLiquidate",
      this.deployer
    )) as PancakeswapV2RestrictedStrategyPartialCloseLiquidate__factory;
    const partialCloseStrat = (await upgrades.deployProxy(PancakeswapV2RestrictedStrategyPartialCloseLiquidate, [
      router.address,
    ])) as PancakeswapV2RestrictedStrategyPartialCloseLiquidate;
    await partialCloseStrat.deployed();
    await wNativeRelayer.setCallerOk([partialCloseStrat.address], true);

    const PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading",
      this.deployer
    )) as PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading__factory;
    const partialCloseMinimizeStrat = (await upgrades.deployProxy(
      PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading,
      [router.address, wbnb.address, wNativeRelayer.address]
    )) as PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading;
    await partialCloseMinimizeStrat.deployed();
    await wNativeRelayer.setCallerOk([partialCloseMinimizeStrat.address], true);

    return [addStrat, liqStrat, twoSidesStrat, minimizeTradeStrat, partialCloseStrat, partialCloseMinimizeStrat];
  }

  public async deployMdex(
    wbnb: MockWBNB,
    mdxPerBlock: BigNumberish,
    mdxHolders: Array<IHolder>,
    farmTokenAddress: string
  ): Promise<[MdexFactory, MdexRouter, MdxToken, BSCPool, SwapMining]> {
    // Setup Pancakeswap
    const MdexFactory = (await ethers.getContractFactory("MdexFactory", this.deployer)) as MdexFactory__factory;
    const factory = await MdexFactory.deploy(await this.deployer.getAddress());
    await factory.deployed();
    await factory.setFeeRateNumerator(25);

    const MdexRouter = (await ethers.getContractFactory("MdexRouter", this.deployer)) as MdexRouter__factory;
    const routerV2 = await MdexRouter.deploy(factory.address, wbnb.address);
    await routerV2.deployed();

    // Deploy MdxToken
    const MdxToken = (await ethers.getContractFactory("MdxToken", this.deployer)) as MdxToken__factory;
    const mdx = await MdxToken.deploy();
    await mdx.deployed();
    if (mdxHolders !== undefined) {
      mdxHolders.forEach(async (mdxHolder) => {
        await mdx.addMinter(mdxHolder.address);
        await mdx.mint(mdxHolder.address, mdxHolder.amount);
      });
    }

    /// Setup BSCPool
    const BSCPool = (await ethers.getContractFactory("BSCPool", this.deployer)) as BSCPool__factory;
    const masterChef = await BSCPool.deploy(mdx.address, mdxPerBlock, 0);
    await masterChef.deployed();

    const Oracle = (await ethers.getContractFactory("Oracle", this.deployer)) as Oracle__factory;
    const oracle = await Oracle.deploy(factory.address);
    await oracle.deployed();

    // Mdex SwapMinig
    const blockNumber = await TimeHelpers.latestBlockNumber();
    const SwapMining = (await ethers.getContractFactory("SwapMining", this.deployer)) as SwapMining__factory;
    const swapMining = await SwapMining.deploy(
      mdx.address,
      factory.address,
      oracle.address,
      routerV2.address,
      farmTokenAddress,
      mdxPerBlock,
      blockNumber
    );
    await swapMining.deployed();

    // set swapMining to router
    await routerV2.setSwapMining(swapMining.address);

    /// Setup BTOKEN-FTOKEN pair on Mdex
    await mdx.addMinter(swapMining.address);

    // Transfer ownership so masterChef can mint Mdx
    await mdx.addMinter(masterChef.address);
    await mdx.transferOwnership(masterChef.address);

    return [factory, routerV2, mdx, masterChef, swapMining];
  }

  public async deployMdexStrategies(
    router: MdexRouter,
    vault: Vault,
    wbnb: MockWBNB,
    wNativeRelayer: WNativeRelayer,
    mdx: MdxToken
  ): Promise<
    [
      MdexRestrictedStrategyAddBaseTokenOnly,
      MdexRestrictedStrategyLiquidate,
      MdexRestrictedStrategyAddTwoSidesOptimal,
      MdexRestrictedStrategyWithdrawMinimizeTrading,
      MdexRestrictedStrategyPartialCloseLiquidate,
      MdexRestrictedStrategyPartialCloseMinimizeTrading
    ]
  > {
    /// Setup strategy
    const MdexRestrictedStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "MdexRestrictedStrategyAddBaseTokenOnly",
      this.deployer
    )) as MdexRestrictedStrategyAddBaseTokenOnly__factory;

    const addStrat = (await upgrades.deployProxy(MdexRestrictedStrategyAddBaseTokenOnly, [
      router.address,
      mdx.address,
    ])) as MdexRestrictedStrategyAddBaseTokenOnly;
    await addStrat.deployed();

    const MdexRestrictedStrategyLiquidate = (await ethers.getContractFactory(
      "MdexRestrictedStrategyLiquidate",
      this.deployer
    )) as MdexRestrictedStrategyLiquidate__factory;
    const liqStrat = (await upgrades.deployProxy(MdexRestrictedStrategyLiquidate, [
      router.address,
      mdx.address,
    ])) as MdexRestrictedStrategyLiquidate;
    await liqStrat.deployed();

    const MdexRestrictedStrategyAddTwoSidesOptimal = (await ethers.getContractFactory(
      "MdexRestrictedStrategyAddTwoSidesOptimal",
      this.deployer
    )) as MdexRestrictedStrategyAddTwoSidesOptimal__factory;
    const twoSidesStrat = (await upgrades.deployProxy(MdexRestrictedStrategyAddTwoSidesOptimal, [
      router.address,
      vault.address,
      mdx.address,
    ])) as MdexRestrictedStrategyAddTwoSidesOptimal;

    const MdexRestrictedStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "MdexRestrictedStrategyWithdrawMinimizeTrading",
      this.deployer
    )) as MdexRestrictedStrategyWithdrawMinimizeTrading__factory;
    const minimizeTradeStrat = (await upgrades.deployProxy(MdexRestrictedStrategyWithdrawMinimizeTrading, [
      router.address,
      wbnb.address,
      wNativeRelayer.address,
      mdx.address,
    ])) as MdexRestrictedStrategyWithdrawMinimizeTrading;

    const MdexRestrictedStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "MdexRestrictedStrategyPartialCloseLiquidate",
      this.deployer
    )) as MdexRestrictedStrategyPartialCloseLiquidate__factory;
    const partialCloseStrat = (await upgrades.deployProxy(MdexRestrictedStrategyPartialCloseLiquidate, [
      router.address,
      mdx.address,
    ])) as MdexRestrictedStrategyPartialCloseLiquidate;
    await partialCloseStrat.deployed();
    await wNativeRelayer.setCallerOk([partialCloseStrat.address], true);

    const MdexRestrictedStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "MdexRestrictedStrategyPartialCloseMinimizeTrading",
      this.deployer
    )) as MdexRestrictedStrategyPartialCloseMinimizeTrading__factory;
    const partialCloseMinimizeStrat = (await upgrades.deployProxy(MdexRestrictedStrategyPartialCloseMinimizeTrading, [
      router.address,
      wbnb.address,
      wNativeRelayer.address,
      mdx.address,
    ])) as MdexRestrictedStrategyPartialCloseMinimizeTrading;
    await partialCloseMinimizeStrat.deployed();
    await wNativeRelayer.setCallerOk([partialCloseMinimizeStrat.address], true);

    return [addStrat, liqStrat, twoSidesStrat, minimizeTradeStrat, partialCloseStrat, partialCloseMinimizeStrat];
  }

  public async deployMdexWorker02(
    vault: Vault,
    btoken: MockERC20,
    masterChef: BSCPool,
    routerV2: MdexRouter,
    poolIndex: number,
    workFactor: BigNumberish,
    killFactor: BigNumberish,
    addStrat: MdexRestrictedStrategyAddBaseTokenOnly,
    liqStrat: MdexRestrictedStrategyLiquidate,
    reinvestBountyBps: BigNumberish,
    okReinvestor: string[],
    treasuryAddress: string,
    reinvestPath: Array<string>,
    extraStrategies: string[],
    simpleVaultConfig: SimpleVaultConfig
  ): Promise<MdexWorker02> {
    const MdexWorker02 = (await ethers.getContractFactory("MdexWorker02", this.deployer)) as MdexWorker02__factory;
    const worker = (await upgrades.deployProxy(MdexWorker02, [
      vault.address,
      btoken.address,
      masterChef.address,
      routerV2.address,
      poolIndex,
      addStrat.address,
      liqStrat.address,
      reinvestBountyBps,
      treasuryAddress,
      reinvestPath,
      0,
    ])) as MdexWorker02;
    await worker.deployed();

    await simpleVaultConfig.setWorker(worker.address, true, true, workFactor, killFactor, true, true);
    await worker.setStrategyOk(extraStrategies, true);
    await worker.setReinvestorOk(okReinvestor, true);
    await worker.setTreasuryConfig(treasuryAddress, reinvestBountyBps);

    extraStrategies.push(...[addStrat.address, liqStrat.address]);
    extraStrategies.forEach(async (stratAddress) => {
      const strat = MdexRestrictedStrategyLiquidate__factory.connect(stratAddress, this.deployer);
      await strat.setWorkersOk([worker.address], true);
    });

    return worker;
  }

  public async deployBEP20(bep20s: Array<IBEP20>): Promise<Array<MockERC20>> {
    const promises = [];
    for (const bep20 of bep20s) promises.push(this._deployBEP20(bep20));
    return await Promise.all(promises);
  }

  private async _deployBEP20(bep20: IBEP20): Promise<MockERC20> {
    const MockERC20 = (await ethers.getContractFactory("MockERC20", this.deployer)) as MockERC20__factory;
    const mockBep20 = (await upgrades.deployProxy(MockERC20, [bep20.name, bep20.symbol, bep20.decimals])) as MockERC20;
    await mockBep20.deployed();

    if (bep20.holders !== undefined) {
      bep20.holders.forEach(async (holder) => await mockBep20.mint(holder.address, holder.amount));
    }

    return mockBep20;
  }

  public async deployMiniFL(rewardTokenAddress: string): Promise<MiniFL> {
    const MiniFL = (await ethers.getContractFactory("MiniFL", this.deployer)) as MiniFL__factory;
    const miniFL = (await upgrades.deployProxy(MiniFL, [rewardTokenAddress, ethers.constants.MaxUint256])) as MiniFL;
    return miniFL;
  }

  public async deployRewarder1(miniFLaddress: string, extraRewardTokenAddress: string): Promise<Rewarder1> {
    const Rewarder1 = (await ethers.getContractFactory("Rewarder1", this.deployer)) as Rewarder1__factory;
    const rewarder1 = (await upgrades.deployProxy(Rewarder1, [
      "MockRewarder1",
      miniFLaddress,
      extraRewardTokenAddress,
      ethers.constants.MaxUint256,
    ])) as Rewarder1;
    return rewarder1;
  }

  public async deployAlpacaFairLaunch(
    alpacaPerBlock: BigNumberish,
    alpacaBonusLockUpBps: BigNumberish,
    startReleaseBlock: number,
    endReleaseBlock: number
  ): Promise<[AlpacaToken, FairLaunch]> {
    const AlpacaToken = (await ethers.getContractFactory("AlpacaToken", this.deployer)) as AlpacaToken__factory;
    const alpacaToken = await AlpacaToken.deploy(startReleaseBlock, endReleaseBlock);
    await alpacaToken.deployed();

    const FairLaunch = (await ethers.getContractFactory("FairLaunch", this.deployer)) as FairLaunch__factory;
    const fairLaunch = await FairLaunch.deploy(
      alpacaToken.address,
      await this.deployer.getAddress(),
      alpacaPerBlock,
      0,
      alpacaBonusLockUpBps,
      0
    );
    await fairLaunch.deployed();

    await alpacaToken.transferOwnership(fairLaunch.address);

    return [alpacaToken, fairLaunch];
  }

  private async _deployVault(
    wbnb: MockWBNB | MockWFTM,
    vaultConfig: IVaultConfig,
    fairlaunchAddress: string,
    btoken: MockERC20
  ): Promise<[Vault, SimpleVaultConfig, WNativeRelayer]> {
    const WNativeRelayer = (await ethers.getContractFactory(
      "WNativeRelayer",
      this.deployer
    )) as WNativeRelayer__factory;
    const wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
    await wNativeRelayer.deployed();

    const SimpleVaultConfig = (await ethers.getContractFactory(
      "SimpleVaultConfig",
      this.deployer
    )) as SimpleVaultConfig__factory;
    const simpleVaultConfig = (await upgrades.deployProxy(SimpleVaultConfig, [
      vaultConfig.minDebtSize,
      vaultConfig.interestRate,
      vaultConfig.reservePoolBps,
      vaultConfig.killPrizeBps,
      wbnb.address,
      wNativeRelayer.address,
      fairlaunchAddress,
      vaultConfig.killTreasuryBps,
      vaultConfig.killTreasuryAddress,
    ])) as SimpleVaultConfig;
    await simpleVaultConfig.deployed();

    const DebtToken = (await ethers.getContractFactory("DebtToken", this.deployer)) as DebtToken__factory;
    const debtToken = (await upgrades.deployProxy(DebtToken, [
      "debtibBTOKEN_V2",
      "debtibBTOKEN_V2",
      18,
      await this.deployer.getAddress(),
    ])) as DebtToken;
    await debtToken.deployed();

    const Vault = (await ethers.getContractFactory("Vault", this.deployer)) as Vault__factory;
    const btokenSymbol = await btoken.symbol();
    const vault = (await upgrades.deployProxy(Vault, [
      simpleVaultConfig.address,
      btoken.address,
      `Interest Bearing ${btokenSymbol}}`,
      `ib${btokenSymbol}`,
      await btoken.decimals(),
      debtToken.address,
    ])) as Vault;
    await vault.deployed();

    await wNativeRelayer.setCallerOk([vault.address], true);

    // Set holders of debtToken
    await debtToken.setOkHolders([fairlaunchAddress, vault.address], true);

    // Transfer ownership to vault
    await debtToken.transferOwnership(vault.address);

    return [vault, simpleVaultConfig, wNativeRelayer];
  }

  public async deployVault(
    wbnb: MockWBNB,
    vaultConfig: IVaultConfig,
    fairlaunch: FairLaunch,
    btoken: MockERC20
  ): Promise<[Vault, SimpleVaultConfig, WNativeRelayer]> {
    const [vault, simpleVaultConfig, wNativeRelayer] = await this._deployVault(
      wbnb,
      vaultConfig,
      fairlaunch.address,
      btoken
    );

    // Set add FairLaunch poool and set fairLaunchPoolId for Vault
    await fairlaunch.addPool(1, await vault.debtToken(), false);
    await vault.setFairLaunchPoolId(0);

    return [vault, simpleVaultConfig, wNativeRelayer];
  }

  public async deployMiniFLVault(
    wbnb: MockWBNB | MockWFTM,
    vaultConfig: IVaultConfig,
    miniFL: MiniFL,
    rewarderAddress: string,
    btoken: MockERC20
  ): Promise<[Vault, SimpleVaultConfig, WNativeRelayer]> {
    const [vault, simpleVaultConfig, wNativeRelayer] = await this._deployVault(
      wbnb,
      vaultConfig,
      miniFL.address,
      btoken
    );

    // Set add FairLaunch poool and set fairLaunchPoolId for Vault
    await miniFL.addPool(1, await vault.debtToken(), rewarderAddress, true, true);
    await miniFL.approveStakeDebtToken([0], [vault.address], true);
    await vault.setFairLaunchPoolId(0);

    return [vault, simpleVaultConfig, wNativeRelayer];
  }

  public async deployVault2(
    wbnb: MockWBNB,
    vaultConfig: IVaultConfig,
    btoken: MockERC20
  ): Promise<[Vault2, SimpleVaultConfig, WNativeRelayer]> {
    const WNativeRelayer = (await ethers.getContractFactory(
      "WNativeRelayer",
      this.deployer
    )) as WNativeRelayer__factory;
    const wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
    await wNativeRelayer.deployed();

    const SimpleVaultConfig = (await ethers.getContractFactory(
      "SimpleVaultConfig",
      this.deployer
    )) as SimpleVaultConfig__factory;
    const simpleVaultConfig = (await upgrades.deployProxy(SimpleVaultConfig, [
      vaultConfig.minDebtSize,
      vaultConfig.interestRate,
      vaultConfig.reservePoolBps,
      vaultConfig.killPrizeBps,
      wbnb.address,
      wNativeRelayer.address,
      ethers.constants.AddressZero,
      vaultConfig.killTreasuryBps,
      vaultConfig.killTreasuryAddress,
    ])) as SimpleVaultConfig;
    await simpleVaultConfig.deployed();

    const Vault = (await ethers.getContractFactory("Vault2", this.deployer)) as Vault2__factory;
    const btokenSymbol = await btoken.symbol();
    const vault = (await upgrades.deployProxy(Vault, [
      simpleVaultConfig.address,
      btoken.address,
      `Interest Bearing ${btokenSymbol}}`,
      `ib${btokenSymbol}`,
      18,
    ])) as Vault2;
    await vault.deployed();

    await wNativeRelayer.setCallerOk([vault.address], true);

    return [vault, simpleVaultConfig, wNativeRelayer];
  }

  public async deployPancakeV2Worker02(
    vault: Vault,
    btoken: MockERC20,
    masterChef: PancakeMasterChef,
    routerV2: PancakeRouterV2,
    poolId: number,
    workFactor: BigNumberish,
    killFactor: BigNumberish,
    addStrat: PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
    liqStrat: PancakeswapV2RestrictedStrategyLiquidate,
    reinvestBountyBps: BigNumberish,
    okReinvestor: string[],
    treasuryAddress: string,
    reinvestPath: Array<string>,
    extraStrategies: string[],
    simpleVaultConfig: SimpleVaultConfig
  ): Promise<PancakeswapV2Worker02> {
    const PancakeswapV2Worker02 = (await ethers.getContractFactory(
      "PancakeswapV2Worker02",
      this.deployer
    )) as PancakeswapV2Worker02__factory;
    const pancakeswapV2Worker02 = (await upgrades.deployProxy(PancakeswapV2Worker02, [
      vault.address,
      btoken.address,
      masterChef.address,
      routerV2.address,
      poolId,
      addStrat.address,
      liqStrat.address,
      reinvestBountyBps,
      treasuryAddress,
      reinvestPath,
      0,
    ])) as PancakeswapV2Worker02;
    await pancakeswapV2Worker02.deployed();

    await simpleVaultConfig.setWorker(pancakeswapV2Worker02.address, true, true, workFactor, killFactor, true, true);
    await pancakeswapV2Worker02.setStrategyOk(extraStrategies, true);
    await pancakeswapV2Worker02.setReinvestorOk(okReinvestor, true);
    await pancakeswapV2Worker02.setTreasuryConfig(treasuryAddress, reinvestBountyBps);

    extraStrategies.push(...[addStrat.address, liqStrat.address]);
    extraStrategies.forEach(async (stratAddress) => {
      const strat = PancakeswapV2RestrictedStrategyLiquidate__factory.connect(stratAddress, this.deployer);
      await strat.setWorkersOk([pancakeswapV2Worker02.address], true);
    });

    return pancakeswapV2Worker02;
  }

  public async deployPancakeV2Worker(
    vault: Vault,
    btoken: MockERC20,
    masterChef: PancakeMasterChef,
    routerV2: PancakeRouterV2,
    poolId: number,
    workFactor: BigNumberish,
    killFactor: BigNumberish,
    addStrat: PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
    liqStrat: PancakeswapV2RestrictedStrategyLiquidate,
    reinvestBountyBps: BigNumberish,
    okReinvestor: string[],
    extraStrategies: string[],
    simpleVaultConfig: SimpleVaultConfig
  ): Promise<PancakeswapV2Worker> {
    const PancakeswapV2Worker = (await ethers.getContractFactory(
      "PancakeswapV2Worker",
      this.deployer
    )) as PancakeswapV2Worker__factory;
    const pancakeswapV2Worker = (await upgrades.deployProxy(PancakeswapV2Worker, [
      vault.address,
      btoken.address,
      masterChef.address,
      routerV2.address,
      poolId,
      addStrat.address,
      liqStrat.address,
      reinvestBountyBps,
    ])) as PancakeswapV2Worker;
    await pancakeswapV2Worker.deployed();

    await simpleVaultConfig.setWorker(pancakeswapV2Worker.address, true, true, workFactor, killFactor, true, true);
    await pancakeswapV2Worker.setStrategyOk(extraStrategies, true);
    await pancakeswapV2Worker.setReinvestorOk(okReinvestor, true);

    extraStrategies.push(...[addStrat.address, liqStrat.address]);
    extraStrategies.forEach(async (stratAddress) => {
      const strat = PancakeswapV2RestrictedStrategyLiquidate__factory.connect(stratAddress, this.deployer);
      await strat.setWorkersOk([pancakeswapV2Worker.address], true);
    });

    return pancakeswapV2Worker;
  }

  public async deployWaultSwap(
    wbnb: MockWBNB,
    wexPerBlock: BigNumberish
  ): Promise<[WaultSwapFactory, WaultSwapRouter, WaultSwapToken, WexMaster]> {
    // Setup WaultSwap
    const WaultSwapFactory = (await ethers.getContractFactory(
      "WaultSwapFactory",
      this.deployer
    )) as WaultSwapFactory__factory;
    const factory = await WaultSwapFactory.deploy(await this.deployer.getAddress());
    await factory.deployed();

    const WaultSwapRouter = (await ethers.getContractFactory(
      "WaultSwapRouter",
      this.deployer
    )) as WaultSwapRouter__factory;
    const router = await WaultSwapRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

    const WaultSwapToken = (await ethers.getContractFactory(
      "WaultSwapToken",
      this.deployer
    )) as WaultSwapToken__factory;
    const wex = await WaultSwapToken.deploy();
    await wex.deployed();
    await wex.mint(await this.deployer.getAddress(), ethers.utils.parseEther("100"));

    /// Setup MasterChef
    const WexMaster = (await ethers.getContractFactory("WexMaster", this.deployer)) as WexMaster__factory;
    const wexMaster = await WexMaster.deploy(wex.address, wexPerBlock, 0);
    await wexMaster.deployed();
    // Transfer mintership so wexMaster can mint WEX
    await wex.transferMintership(wexMaster.address);

    return [factory, router, wex, wexMaster];
  }

  public async deployWaultSwapStrategies(
    router: WaultSwapRouter,
    vault: Vault,
    wbnb: MockWBNB,
    wNativeRelayer: WNativeRelayer
  ): Promise<
    [
      WaultSwapRestrictedStrategyAddBaseTokenOnly,
      WaultSwapRestrictedStrategyLiquidate,
      WaultSwapRestrictedStrategyAddTwoSidesOptimal,
      WaultSwapRestrictedStrategyWithdrawMinimizeTrading,
      WaultSwapRestrictedStrategyPartialCloseLiquidate,
      WaultSwapRestrictedStrategyPartialCloseMinimizeTrading
    ]
  > {
    /// Setup strategy
    const WaultSwapRestrictedStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyAddBaseTokenOnly",
      this.deployer
    )) as WaultSwapRestrictedStrategyAddBaseTokenOnly__factory;
    const addStrat = (await upgrades.deployProxy(WaultSwapRestrictedStrategyAddBaseTokenOnly, [
      router.address,
    ])) as WaultSwapRestrictedStrategyAddBaseTokenOnly;
    await addStrat.deployed();

    const WaultSwapRestrictedStrategyLiquidate = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyLiquidate",
      this.deployer
    )) as WaultSwapRestrictedStrategyLiquidate__factory;
    const liqStrat = (await upgrades.deployProxy(WaultSwapRestrictedStrategyLiquidate, [
      router.address,
    ])) as WaultSwapRestrictedStrategyLiquidate;
    await liqStrat.deployed();

    const WaultSwapRestrictedStrategyAddTwoSidesOptimal = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyAddTwoSidesOptimal",
      this.deployer
    )) as WaultSwapRestrictedStrategyAddTwoSidesOptimal__factory;
    const twoSidesStrat = (await upgrades.deployProxy(WaultSwapRestrictedStrategyAddTwoSidesOptimal, [
      router.address,
      vault.address,
    ])) as WaultSwapRestrictedStrategyAddTwoSidesOptimal;

    const WaultSwapRestrictedStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyWithdrawMinimizeTrading",
      this.deployer
    )) as WaultSwapRestrictedStrategyWithdrawMinimizeTrading__factory;
    const minimizeTradeStrat = (await upgrades.deployProxy(WaultSwapRestrictedStrategyWithdrawMinimizeTrading, [
      router.address,
      wbnb.address,
      wNativeRelayer.address,
    ])) as WaultSwapRestrictedStrategyWithdrawMinimizeTrading;

    const WaultSwapRestrictedStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyPartialCloseLiquidate",
      this.deployer
    )) as WaultSwapRestrictedStrategyPartialCloseLiquidate__factory;
    const partialCloseStrat = (await upgrades.deployProxy(WaultSwapRestrictedStrategyPartialCloseLiquidate, [
      router.address,
    ])) as WaultSwapRestrictedStrategyPartialCloseLiquidate;
    await partialCloseStrat.deployed();
    await wNativeRelayer.setCallerOk([partialCloseStrat.address], true);

    const WaultSwapRestrictedStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyPartialCloseMinimizeTrading",
      this.deployer
    )) as WaultSwapRestrictedStrategyPartialCloseMinimizeTrading__factory;
    const partialCloseMinimizeStrat = (await upgrades.deployProxy(
      WaultSwapRestrictedStrategyPartialCloseMinimizeTrading,
      [router.address, wbnb.address, wNativeRelayer.address]
    )) as WaultSwapRestrictedStrategyPartialCloseMinimizeTrading;
    await partialCloseMinimizeStrat.deployed();
    await wNativeRelayer.setCallerOk([partialCloseMinimizeStrat.address], true);

    return [addStrat, liqStrat, twoSidesStrat, minimizeTradeStrat, partialCloseStrat, partialCloseMinimizeStrat];
  }

  public async deploySpookySwap(
    wbnb: MockWBNB,
    booPerSec: BigNumberish
  ): Promise<[WaultSwapFactory, WaultSwapRouter, SpookyToken, SpookyMasterChef]> {
    // Note: Use WaultSwap because same fee structure
    // Setup WaultSwap
    const WaultSwapFactory = (await ethers.getContractFactory(
      "WaultSwapFactory",
      this.deployer
    )) as WaultSwapFactory__factory;
    const factory = await WaultSwapFactory.deploy(await this.deployer.getAddress());
    await factory.deployed();

    const WaultSwapRouter = (await ethers.getContractFactory(
      "WaultSwapRouter",
      this.deployer
    )) as WaultSwapRouter__factory;
    const router = await WaultSwapRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

    const SpookyToken = (await ethers.getContractFactory("SpookyToken", this.deployer)) as SpookyToken__factory;
    const boo = await SpookyToken.deploy();
    await boo.deployed();
    await boo.mint(await this.deployer.getAddress(), ethers.utils.parseEther("100"));

    /// Setup MasterChef
    const SpookyMasterChef = (await ethers.getContractFactory(
      "SpookyMasterChef",
      this.deployer
    )) as SpookyMasterChef__factory;
    const spookyMasterChef = await SpookyMasterChef.deploy(boo.address, await this.deployer.getAddress(), booPerSec, 0);
    await spookyMasterChef.deployed();
    // Transfer ownership so MasterChef can mint BOO
    await boo.transferOwnership(spookyMasterChef.address);

    return [factory, router, boo, spookyMasterChef];
  }

  public async deploySpookySwapStrategies(
    router: WaultSwapRouter,
    vault: IVault,
    wNativeRelayer: WNativeRelayer
  ): Promise<
    [
      SpookySwapStrategyAddBaseTokenOnly,
      SpookySwapStrategyLiquidate,
      SpookySwapStrategyAddTwoSidesOptimal,
      SpookySwapStrategyWithdrawMinimizeTrading,
      SpookySwapStrategyPartialCloseLiquidate,
      SpookySwapStrategyPartialCloseMinimizeTrading
    ]
  > {
    /// Setup strategy
    const SpookySwapStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "SpookySwapStrategyAddBaseTokenOnly",
      this.deployer
    )) as SpookySwapStrategyAddBaseTokenOnly__factory;
    const addStrat = (await upgrades.deployProxy(SpookySwapStrategyAddBaseTokenOnly, [
      router.address,
    ])) as SpookySwapStrategyAddBaseTokenOnly;
    await addStrat.deployed();

    const SpookySwapStrategyLiquidate = (await ethers.getContractFactory(
      "SpookySwapStrategyLiquidate",
      this.deployer
    )) as SpookySwapStrategyLiquidate__factory;
    const liqStrat = (await upgrades.deployProxy(SpookySwapStrategyLiquidate, [
      router.address,
    ])) as SpookySwapStrategyLiquidate;
    await liqStrat.deployed();

    const SpookySwapStrategyAddTwoSidesOptimal = (await ethers.getContractFactory(
      "SpookySwapStrategyAddTwoSidesOptimal",
      this.deployer
    )) as SpookySwapStrategyAddTwoSidesOptimal__factory;
    const twoSidesStrat = (await upgrades.deployProxy(SpookySwapStrategyAddTwoSidesOptimal, [
      router.address,
      vault.address,
    ])) as SpookySwapStrategyAddTwoSidesOptimal;

    const SpookySwapStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "SpookySwapStrategyWithdrawMinimizeTrading",
      this.deployer
    )) as SpookySwapStrategyWithdrawMinimizeTrading__factory;
    const minimizeTradeStrat = (await upgrades.deployProxy(SpookySwapStrategyWithdrawMinimizeTrading, [
      router.address,
      wNativeRelayer.address,
    ])) as SpookySwapStrategyWithdrawMinimizeTrading;

    const SpookySwapStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "SpookySwapStrategyPartialCloseLiquidate",
      this.deployer
    )) as SpookySwapStrategyPartialCloseLiquidate__factory;
    const partialCloseStrat = (await upgrades.deployProxy(SpookySwapStrategyPartialCloseLiquidate, [
      router.address,
    ])) as SpookySwapStrategyPartialCloseLiquidate;
    await partialCloseStrat.deployed();
    await wNativeRelayer.setCallerOk([partialCloseStrat.address], true);

    const SpookySwapStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "SpookySwapStrategyPartialCloseMinimizeTrading",
      this.deployer
    )) as SpookySwapStrategyPartialCloseMinimizeTrading__factory;
    const partialCloseMinimizeStrat = (await upgrades.deployProxy(SpookySwapStrategyPartialCloseMinimizeTrading, [
      router.address,
      wNativeRelayer.address,
    ])) as SpookySwapStrategyPartialCloseMinimizeTrading;
    await partialCloseMinimizeStrat.deployed();
    await wNativeRelayer.setCallerOk([partialCloseMinimizeStrat.address], true);

    return [addStrat, liqStrat, twoSidesStrat, minimizeTradeStrat, partialCloseStrat, partialCloseMinimizeStrat];
  }

  public async deploySolidly(
    wftm: MockWFTM
  ): Promise<
    [
      BaseV1Factory,
      BaseV1Router01,
      BaseV1GaugeFactory,
      BaseV1BribeFactory,
      BaseV1,
      VeSOLID,
      BaseV1Voter,
      LpDepositor,
      SolidexToken,
      MockSolidexVoter
    ]
  > {
    const deployerAddress = await this.deployer.getAddress();
    const BaseV1Factory = (await ethers.getContractFactory("BaseV1Factory", this.deployer)) as BaseV1Factory__factory;
    const factory = await BaseV1Factory.deploy();
    await factory.deployed();

    const BaseV1Router01 = (await ethers.getContractFactory(
      "BaseV1Router01",
      this.deployer
    )) as BaseV1Router01__factory;
    const router = await BaseV1Router01.deploy(factory.address, wftm.address);
    await router.deployed();

    const BaseV1GaugeFactory = (await ethers.getContractFactory(
      "BaseV1GaugeFactory",
      this.deployer
    )) as BaseV1GaugeFactory__factory;
    const baseV1GaugeFactory = await BaseV1GaugeFactory.deploy();

    const BaseV1BribeFactory = (await ethers.getContractFactory(
      "BaseV1BribeFactory",
      this.deployer
    )) as BaseV1BribeFactory__factory;
    const baseV1BribeFactory = await BaseV1BribeFactory.deploy();

    const SOLIDToken = (await ethers.getContractFactory("BaseV1", this.deployer)) as BaseV1__factory;
    const solid = await SOLIDToken.deploy();
    await solid.deployed();
    await solid.mint(await this.deployer.getAddress(), ethers.utils.parseEther("10000000"));

    const VotingEscrow = (await ethers.getContractFactory("veSOLID", this.deployer)) as VeSOLID__factory;
    const votingEscrow = await VotingEscrow.deploy(solid.address);
    await votingEscrow.deployed();

    const BaseV1Voter = (await ethers.getContractFactory("BaseV1Voter", this.deployer)) as BaseV1Voter__factory;
    const baseV1Voter = await BaseV1Voter.deploy(
      votingEscrow.address,
      factory.address,
      baseV1GaugeFactory.address,
      baseV1BribeFactory.address
    );
    await votingEscrow.setVoter(baseV1Voter.address);

    const LpDepositor = (await ethers.getContractFactory("LpDepositor", this.deployer)) as LpDepositor__factory;
    const lpDepositor = await LpDepositor.deploy(solid.address, votingEscrow.address, baseV1Voter.address);
    await lpDepositor.deployed();

    const SolidexToken = (await ethers.getContractFactory("SolidexToken", this.deployer)) as SolidexToken__factory;
    const sex = await SolidexToken.deploy();
    await sex.deployed();
    await sex.setMinters([await this.deployer.getAddress(), lpDepositor.address]);
    await sex.mint(await this.deployer.getAddress(), ethers.utils.parseEther("100"));

    const VeDist = (await ethers.getContractFactory("VeDist", this.deployer)) as VeDist__factory;
    const veDist = await VeDist.deploy(votingEscrow.address);
    await veDist.deployed();

    const VeDepositor = (await ethers.getContractFactory("VeDepositor", this.deployer)) as VeDepositor__factory;
    const solidSEX = await VeDepositor.deploy(solid.address, votingEscrow.address, veDist.address);
    await solidSEX.deployed();

    const MockSolidexFeeDistributor = (await ethers.getContractFactory(
      "MockSolidexFeeDistributor",
      this.deployer
    )) as MockSolidexFeeDistributor__factory;
    const mockSolidexFeeDistributor = await MockSolidexFeeDistributor.deploy();
    await mockSolidexFeeDistributor.deployed();

    const LpDepositToken = (await ethers.getContractFactory("DepositToken", this.deployer)) as DepositToken__factory;
    const lpDepositToken = await LpDepositToken.deploy();
    await lpDepositToken.deployed();

    const MockSolidexVoter = (await ethers.getContractFactory(
      "MockSolidexVoter",
      this.deployer
    )) as MockSolidexVoter__factory;
    const mockSolidexVoter = await MockSolidexVoter.deploy();
    await mockSolidexVoter.deployed();

    await mockSolidexVoter.setSolidVoter(baseV1Voter.address);

    await lpDepositor.setAddresses(
      sex.address,
      solidSEX.address,
      mockSolidexVoter.address,
      mockSolidexFeeDistributor.address,
      deployerAddress,
      deployerAddress,
      lpDepositToken.address
    );

    await solidSEX.setAddresses(lpDepositor.address, mockSolidexVoter.address, mockSolidexFeeDistributor.address);

    await solid.approve(votingEscrow.address, ethers.utils.parseEther("1"));
    await votingEscrow.create_lock(ethers.utils.parseEther("1"), 4 * 365 * 86400);
    await votingEscrow["safeTransferFrom(address,address,uint256)"](deployerAddress, solidSEX.address, 1);

    return [
      factory,
      router,
      baseV1GaugeFactory,
      baseV1BribeFactory,
      solid,
      votingEscrow,
      baseV1Voter,
      lpDepositor,
      sex,
      mockSolidexVoter,
    ];
  }

  public async deploySolidlyStrategies(
    router: BaseV1Router01,
    vault: IVault,
    wNativeRelayer: WNativeRelayer
  ): Promise<
    [
      SolidlyStrategyAddBaseTokenOnly,
      SolidlyStrategyLiquidate,
      SolidlyStrategyAddTwoSidesOptimal,
      SolidlyStrategyWithdrawMinimizeTrading,
      SolidlyStrategyPartialCloseLiquidate,
      SolidlyStrategyPartialCloseMinimizeTrading
    ]
  > {
    /// Setup strategy
    const SolidlyStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "SolidlyStrategyAddBaseTokenOnly",
      this.deployer
    )) as SolidlyStrategyAddBaseTokenOnly__factory;
    const addStrat = (await upgrades.deployProxy(SolidlyStrategyAddBaseTokenOnly, [
      router.address,
    ])) as SolidlyStrategyAddBaseTokenOnly;
    await addStrat.deployed();

    const SolidlyStrategyLiquidate = (await ethers.getContractFactory(
      "SolidlyStrategyLiquidate",
      this.deployer
    )) as SolidlyStrategyLiquidate__factory;
    const liqStrat = (await upgrades.deployProxy(SolidlyStrategyLiquidate, [
      router.address,
    ])) as SolidlyStrategyLiquidate;
    await liqStrat.deployed();

    const SolidlyStrategyAddTwoSidesOptimal = (await ethers.getContractFactory(
      "SolidlyStrategyAddTwoSidesOptimal",
      this.deployer
    )) as SolidlyStrategyAddTwoSidesOptimal__factory;
    const twoSidesStrat = (await upgrades.deployProxy(SolidlyStrategyAddTwoSidesOptimal, [
      router.address,
      vault.address,
    ])) as SolidlyStrategyAddTwoSidesOptimal;

    const SolidlyStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "SolidlyStrategyWithdrawMinimizeTrading",
      this.deployer
    )) as SolidlyStrategyWithdrawMinimizeTrading__factory;
    const minimizeTradeStrat = (await upgrades.deployProxy(SolidlyStrategyWithdrawMinimizeTrading, [
      router.address,
      wNativeRelayer.address,
    ])) as SolidlyStrategyWithdrawMinimizeTrading;

    const SolidlyStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "SolidlyStrategyPartialCloseLiquidate",
      this.deployer
    )) as SolidlyStrategyPartialCloseLiquidate__factory;
    const partialCloseStrat = (await upgrades.deployProxy(SolidlyStrategyPartialCloseLiquidate, [
      router.address,
    ])) as SolidlyStrategyPartialCloseLiquidate;
    await partialCloseStrat.deployed();
    await wNativeRelayer.setCallerOk([partialCloseStrat.address], true);

    const SolidlyStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "SolidlyStrategyPartialCloseMinimizeTrading",
      this.deployer
    )) as SolidlyStrategyPartialCloseMinimizeTrading__factory;
    const partialCloseMinimizeStrat = (await upgrades.deployProxy(SolidlyStrategyPartialCloseMinimizeTrading, [
      router.address,
      wNativeRelayer.address,
    ])) as SolidlyStrategyPartialCloseMinimizeTrading;
    await partialCloseMinimizeStrat.deployed();
    await wNativeRelayer.setCallerOk([partialCloseMinimizeStrat.address], true);

    return [addStrat, liqStrat, twoSidesStrat, minimizeTradeStrat, partialCloseStrat, partialCloseMinimizeStrat];
  }
}
