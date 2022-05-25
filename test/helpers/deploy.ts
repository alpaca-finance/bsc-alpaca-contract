import { MockMiniFL } from "./../../typechain/MockMiniFL";
import { MockMiniFL__factory } from "./../../typechain/factories/MockMiniFL__factory";
import { BaseContract, BigNumber, BigNumberish, Signer } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
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
  PancakeswapV2MCV2Worker02,
  PancakeswapV2MCV2Worker02__factory,
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
  DeltaNeutralVault__factory,
  DeltaNeutralVault,
  DeltaNeutralVaultConfig,
  DeltaNeutralVaultConfig__factory,
  DeltaNeutralOracle,
  DeltaNeutralOracle__factory,
  ChainLinkPriceOracle,
  ChainLinkPriceOracle__factory,
  MockAggregatorV3__factory,
  DeltaNeutralPancakeWorker02__factory,
  DeltaNeutralPancakeWorker02,
  DeltaNeutralMdexWorker02,
  DeltaNeutralMdexWorker02__factory,
  DeltaNeutralVaultGateway__factory,
  DeltaNeutralVaultGateway,
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
  TShareRewardPool,
  TShare__factory,
  TShareRewardPool__factory,
  TShare,
  DeltaNeutralSpookyWorker03__factory,
  DeltaNeutralSpookyWorker03,
  MasterChefV2,
  MasterChefV2__factory,
  DeltaNeutralPancakeMCV2Worker02,
  DeltaNeutralPancakeMCV2Worker02__factory,
  BiswapRouter02,
  BiswapRouter02__factory,
  BiswapStrategyAddBaseTokenOnly,
  BiswapStrategyAddBaseTokenOnly__factory,
  BiswapStrategyLiquidate,
  BiswapStrategyLiquidate__factory,
  BiswapStrategyAddTwoSidesOptimal,
  BiswapStrategyAddTwoSidesOptimal__factory,
  BiswapStrategyWithdrawMinimizeTrading,
  BiswapStrategyWithdrawMinimizeTrading__factory,
  BiswapStrategyPartialCloseLiquidate,
  BiswapStrategyPartialCloseLiquidate__factory,
  BiswapStrategyPartialCloseMinimizeTrading,
  BiswapStrategyPartialCloseMinimizeTrading__factory,
  BiswapFactory,
  BiswapFactory__factory,
  BSWToken,
  BSWToken__factory,
  BiswapMasterChef,
  BiswapMasterChef__factory,
  BiswapWorker03,
  BiswapWorker03__factory,
  DeltaNeutralBiswapWorker03,
  DeltaNeutralBiswapWorker03__factory,
  VaultAip42,
  CakePool,
  CakePool__factory,
} from "../../typechain";
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

export interface IDeltaNeutralVault {
  name: string;
  symbol: string;
  vaultStable: string;
  vaultAsset: string;
  stableVaultWorker: string;
  assetVaultWorker: string;
  lpToken: string;
  alpacaToken: string;
  deltaNeutralOracle: string;
  deltaVaultConfig: string;
}

export interface IDeltaNeutralVaultGatewayDeployParams {
  deltaVault: string;
  router: string;
}

export interface IDeltaNeutralVaultConfig {
  wNativeAddr: string;
  wNativeRelayer: string;
  fairlaunchAddr: string;
  rebalanceFactor: BigNumberish;
  positionValueTolerance: BigNumberish;
  debtRatioTolerance: BigNumberish;
  depositFeeTreasury: string;
  managementFeeTreasury: string;
  withdrawFeeTreasury: string;
  alpacaTokenAddress: string;
}

export class DeployHelper {
  private deployer: SignerWithAddress;

  constructor(_deployer: SignerWithAddress) {
    this.deployer = _deployer;
  }

  public async deployWBNB(): Promise<MockWBNB> {
    const WBNB = (await ethers.getContractFactory("MockWBNB", this.deployer)) as MockWBNB__factory;
    const wbnb = await WBNB.deploy();
    await wbnb.deployed();
    return wbnb;
  }

  public async deployERC20(): Promise<MockERC20> {
    const ERC20 = (await ethers.getContractFactory("MockERC20", this.deployer)) as MockERC20__factory;
    const erc20 = (await upgrades.deployProxy(ERC20, ["token0", "token0", "18"])) as MockERC20;
    await erc20.deployed();
    return erc20;
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

  public async deployPancakeMasterChefV2(masterChef: PancakeMasterChef): Promise<[MasterChefV2]> {
    // Deploy dummyToken for MasterChefV2 to stake in MasterChefV1
    const dummyToken = await this.deployERC20();
    await dummyToken.mint(this.deployer.address, 1);

    // Add Master Pool for MasterChefV2
    await masterChef.add(1, dummyToken.address, true);
    await masterChef.set(0, 0, true);
    const MASTER_PID = (await masterChef.poolLength()).sub(1);

    // Deploy MasterChefV2
    const MasterChefV2 = (await ethers.getContractFactory("MasterChefV2", this.deployer)) as MasterChefV2__factory;
    const masterChefV2 = await MasterChefV2.deploy(
      masterChef.address,
      await masterChef.cake(),
      MASTER_PID,
      this.deployer.address
    );
    await masterChefV2.deployed();

    // Init MasterChefV2
    await dummyToken.approve(masterChefV2.address, 1);
    await masterChefV2.init(dummyToken.address);

    // Add Dummy Pool 0
    await masterChefV2.add(0, dummyToken.address, true, true);
    return [masterChefV2];
  }

  public async deployPancakeCakePool(masterChefV2: MasterChefV2): Promise<[CakePool]> {
    // Deploy dummyToken for CakePool to stake in MasterChefV2
    const dummyToken = await this.deployERC20();
    await dummyToken.mint(this.deployer.address, 1);

    // Add Master Pool for MasterChefV2
    await masterChefV2.add(1, dummyToken.address, false, true);
    const CAKE_POOL_PID = (await masterChefV2.poolLength()).sub(1);

    const CakePool = (await ethers.getContractFactory("CakePool", this.deployer)) as CakePool__factory;
    const cakePool = await CakePool.deploy(
      await masterChefV2.CAKE(),
      masterChefV2.address,
      this.deployer.address,
      this.deployer.address,
      this.deployer.address,
      CAKE_POOL_PID
    );
    await cakePool.deployed();

    await masterChefV2.updateWhiteList(cakePool.address, true);
    await dummyToken.approve(cakePool.address, 1);
    await cakePool.init(dummyToken.address);

    return [cakePool];
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

  public async deployAlpacaMockMiniFL(maxAlpacaPerSecond: BigNumberish): Promise<[AlpacaToken, MockMiniFL]> {
    const AlpacaToken = (await ethers.getContractFactory("AlpacaToken", this.deployer)) as AlpacaToken__factory;
    const alpacaToken = await AlpacaToken.deploy(0, 1);
    await alpacaToken.deployed();

    const MiniFL = (await ethers.getContractFactory("MockMiniFL", this.deployer)) as MockMiniFL__factory;
    const miniFL = (await upgrades.deployProxy(MiniFL, [alpacaToken.address, maxAlpacaPerSecond])) as MockMiniFL;

    return [alpacaToken, miniFL];
  }

  private async _deployVault(
    wbnb: MockWBNB,
    vaultConfig: IVaultConfig,
    fairlaunchAddress: string,
    btoken: MockERC20,
    vaultVersion = "Vault"
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

    const Vault = (await ethers.getContractFactory(vaultVersion, this.deployer)) as Vault__factory;
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
    await vault.setFairLaunchPoolId((await fairlaunch.poolLength()).sub(1));

    return [vault, simpleVaultConfig, wNativeRelayer];
  }

  public async deployVaultAip42(
    wbnb: MockWBNB,
    vaultConfig: IVaultConfig,
    fairlaunch: FairLaunch,
    btoken: MockERC20
  ): Promise<[VaultAip42, SimpleVaultConfig, WNativeRelayer]> {
    const [vault, simpleVaultConfig, wNativeRelayer] = await this._deployVault(
      wbnb,
      vaultConfig,
      fairlaunch.address,
      btoken,
      "VaultAip42"
    );

    // Set add FairLaunch poool and set fairLaunchPoolId for Vault
    await fairlaunch.addPool(1, await vault.debtToken(), true);
    await vault.setFairLaunchPoolId((await fairlaunch.poolLength()).sub(1));

    return [vault as unknown as VaultAip42, simpleVaultConfig, wNativeRelayer];
  }

  public async deployMiniFLVault(
    wbnb: MockWBNB,
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

  public async deployPancakeV2MCV2Worker02(
    vault: Vault,
    btoken: MockERC20,
    masterChef: MasterChefV2,
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
  ): Promise<PancakeswapV2MCV2Worker02> {
    const PancakeswapV2MCV2Worker02 = (await ethers.getContractFactory(
      "PancakeswapV2MCV2Worker02",
      this.deployer
    )) as PancakeswapV2MCV2Worker02__factory;
    const pancakeswapV2Worker02 = (await upgrades.deployProxy(PancakeswapV2MCV2Worker02, [
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
    ])) as PancakeswapV2MCV2Worker02;
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

  public async deployDeltaNeutralOracle(
    tokens: string[],
    tokenPrices: BigNumber[],
    tokenDecimals: number[],
    usdToken: string
  ): Promise<[DeltaNeutralOracle, ChainLinkPriceOracle]> {
    const ChainLinkPriceOracle = (await ethers.getContractFactory(
      "ChainLinkPriceOracle",
      this.deployer
    )) as ChainLinkPriceOracle__factory;
    const chainLinkOracle = (await upgrades.deployProxy(ChainLinkPriceOracle)) as ChainLinkPriceOracle;
    await chainLinkOracle.deployed();

    const MockAggregatorV3 = (await ethers.getContractFactory(
      "MockAggregatorV3",
      this.deployer
    )) as MockAggregatorV3__factory;

    const aggregators = await Promise.all(
      tokens.map(async (_, index) => {
        const mockAggregatorV3 = await MockAggregatorV3.deploy(tokenPrices[index], tokenDecimals[index]);
        await mockAggregatorV3.deployed();
        return mockAggregatorV3.address;
      })
    );
    const chainLinkOracleAsDeployer = ChainLinkPriceOracle__factory.connect(chainLinkOracle.address, this.deployer);
    chainLinkOracleAsDeployer.setPriceFeeds(
      tokens,
      tokens.map((_) => usdToken),
      aggregators
    );

    const DeltaNeutralOracle = (await ethers.getContractFactory(
      "DeltaNeutralOracle",
      this.deployer
    )) as DeltaNeutralOracle__factory;
    const deltaNeutralOracle = (await upgrades.deployProxy(DeltaNeutralOracle, [
      chainLinkOracle.address,
      usdToken,
    ])) as DeltaNeutralOracle;
    await deltaNeutralOracle.deployed();
    return [deltaNeutralOracle, chainLinkOracle];
  }

  public async deployDeltaNeutralSpookyWorker03(
    vault: Vault,
    btoken: MockERC20,
    masterChef: SpookyMasterChef,
    router: WaultSwapRouter,
    poolId: number,
    workFactor: BigNumberish,
    killFactor: BigNumberish,
    addStrat: SpookySwapStrategyAddBaseTokenOnly,
    reinvestBountyBps: BigNumberish,
    okReinvestor: string[],
    treasuryAddress: string,
    reinvestPath: Array<string>,
    extraStrategies: string[],
    simpleVaultConfig: SimpleVaultConfig,
    priceOracleAddress: string
  ): Promise<DeltaNeutralSpookyWorker03> {
    const DeltaNeutralSpookyWorker03 = (await ethers.getContractFactory(
      "DeltaNeutralSpookyWorker03",
      this.deployer
    )) as DeltaNeutralSpookyWorker03__factory;

    const deltaNeutralWorker03 = (await upgrades.deployProxy(DeltaNeutralSpookyWorker03, [
      vault.address,
      btoken.address,
      masterChef.address,
      router.address,
      poolId,
      addStrat.address,
      reinvestBountyBps,
      treasuryAddress,
      reinvestPath,
      0,
      priceOracleAddress,
    ])) as DeltaNeutralSpookyWorker03;
    await deltaNeutralWorker03.deployed();

    await simpleVaultConfig.setWorker(deltaNeutralWorker03.address, true, true, workFactor, killFactor, true, true);
    await deltaNeutralWorker03.setStrategyOk(extraStrategies, true);
    await deltaNeutralWorker03.setReinvestorOk(okReinvestor, true);
    await deltaNeutralWorker03.setTreasuryConfig(treasuryAddress, reinvestBountyBps);

    extraStrategies.push(addStrat.address);
    extraStrategies.forEach(async (stratAddress) => {
      const strat = SpookySwapStrategyLiquidate__factory.connect(stratAddress, this.deployer);
      await strat.setWorkersOk([deltaNeutralWorker03.address], true);
    });

    return deltaNeutralWorker03;
  }

  public async deployDeltaNeutralBiswapWorker03(
    vault: Vault,
    btoken: MockERC20,
    masterChef: BiswapMasterChef,
    router: BiswapRouter02,
    poolId: number,
    workFactor: BigNumberish,
    killFactor: BigNumberish,
    addStrat: BiswapStrategyAddBaseTokenOnly,
    reinvestBountyBps: BigNumberish,
    okReinvestor: string[],
    treasuryAddress: string,
    reinvestPath: Array<string>,
    extraStrategies: string[],
    simpleVaultConfig: SimpleVaultConfig,
    priceOracleAddress: string
  ): Promise<DeltaNeutralBiswapWorker03> {
    const DeltaNeutralBiswapWorker03 = (await ethers.getContractFactory(
      "DeltaNeutralBiswapWorker03",
      this.deployer
    )) as DeltaNeutralBiswapWorker03__factory;

    const deltaNeutralWorker03 = (await upgrades.deployProxy(DeltaNeutralBiswapWorker03, [
      vault.address,
      btoken.address,
      masterChef.address,
      router.address,
      poolId,
      addStrat.address,
      reinvestBountyBps,
      treasuryAddress,
      reinvestPath,
      0,
      priceOracleAddress,
    ])) as DeltaNeutralBiswapWorker03;
    await deltaNeutralWorker03.deployed();

    await simpleVaultConfig.setWorker(deltaNeutralWorker03.address, true, true, workFactor, killFactor, true, true);
    await deltaNeutralWorker03.setStrategyOk(extraStrategies, true);
    await deltaNeutralWorker03.setReinvestorOk(okReinvestor, true);
    await deltaNeutralWorker03.setTreasuryConfig(treasuryAddress, reinvestBountyBps);

    extraStrategies.push(addStrat.address);
    extraStrategies.forEach(async (stratAddress) => {
      const strat = BiswapStrategyLiquidate__factory.connect(stratAddress, this.deployer);
      await strat.setWorkersOk([deltaNeutralWorker03.address], true);
    });

    return deltaNeutralWorker03;
  }

  public async deployDeltaNeutralPancakeWorker02(
    vault: Vault,
    btoken: MockERC20,
    masterChef: PancakeMasterChef,
    routerV2: PancakeRouterV2,
    poolId: number,
    workFactor: BigNumberish,
    killFactor: BigNumberish,
    addStrat: PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
    reinvestBountyBps: BigNumberish,
    okReinvestor: string[],
    treasuryAddress: string,
    reinvestPath: Array<string>,
    extraStrategies: string[],
    simpleVaultConfig: SimpleVaultConfig,
    priceOracleAddress: string
  ): Promise<DeltaNeutralPancakeWorker02> {
    const DeltaNeutralPancakeWorker02 = (await ethers.getContractFactory(
      "DeltaNeutralPancakeWorker02",
      this.deployer
    )) as DeltaNeutralPancakeWorker02__factory;
    const deltaNeutralWorker02 = (await upgrades.deployProxy(DeltaNeutralPancakeWorker02, [
      vault.address,
      btoken.address,
      masterChef.address,
      routerV2.address,
      poolId,
      addStrat.address,
      reinvestBountyBps,
      treasuryAddress,
      reinvestPath,
      0,
      priceOracleAddress,
    ])) as DeltaNeutralPancakeWorker02;
    await deltaNeutralWorker02.deployed();

    await simpleVaultConfig.setWorker(deltaNeutralWorker02.address, true, true, workFactor, killFactor, true, true);
    await deltaNeutralWorker02.setStrategyOk(extraStrategies, true);
    await deltaNeutralWorker02.setReinvestorOk(okReinvestor, true);
    await deltaNeutralWorker02.setTreasuryConfig(treasuryAddress, reinvestBountyBps);

    extraStrategies.push(addStrat.address);
    extraStrategies.forEach(async (stratAddress) => {
      const strat = PancakeswapV2RestrictedStrategyLiquidate__factory.connect(stratAddress, this.deployer);
      await strat.setWorkersOk([deltaNeutralWorker02.address], true);
    });

    return deltaNeutralWorker02;
  }

  public async deployDeltaNeutralPancakeMCV2Worker02(
    vault: Vault,
    btoken: MockERC20,
    masterChef: MasterChefV2,
    routerV2: PancakeRouterV2,
    poolId: number,
    workFactor: BigNumberish,
    killFactor: BigNumberish,
    addStrat: PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
    reinvestBountyBps: BigNumberish,
    okReinvestor: string[],
    treasuryAddress: string,
    reinvestPath: Array<string>,
    extraStrategies: string[],
    simpleVaultConfig: SimpleVaultConfig,
    priceOracleAddress: string
  ): Promise<DeltaNeutralPancakeMCV2Worker02> {
    const DeltaNeutralPancakeMCV2Worker02 = (await ethers.getContractFactory(
      "DeltaNeutralPancakeMCV2Worker02",
      this.deployer
    )) as DeltaNeutralPancakeMCV2Worker02__factory;
    const deltaNeutralWorker02 = (await upgrades.deployProxy(DeltaNeutralPancakeMCV2Worker02, [
      vault.address,
      btoken.address,
      masterChef.address,
      routerV2.address,
      poolId,
      addStrat.address,
      reinvestBountyBps,
      treasuryAddress,
      reinvestPath,
      0,
      priceOracleAddress,
    ])) as DeltaNeutralPancakeMCV2Worker02;
    await deltaNeutralWorker02.deployed();

    await simpleVaultConfig.setWorker(deltaNeutralWorker02.address, true, true, workFactor, killFactor, true, true);
    await deltaNeutralWorker02.setStrategyOk(extraStrategies, true);
    await deltaNeutralWorker02.setReinvestorOk(okReinvestor, true);
    await deltaNeutralWorker02.setTreasuryConfig(treasuryAddress, reinvestBountyBps);

    extraStrategies.push(addStrat.address);
    extraStrategies.forEach(async (stratAddress) => {
      const strat = PancakeswapV2RestrictedStrategyLiquidate__factory.connect(stratAddress, this.deployer);
      await strat.setWorkersOk([deltaNeutralWorker02.address], true);
    });

    return deltaNeutralWorker02;
  }

  public async deployDeltaNeutralMdexWorker02(
    vault: Vault,
    btoken: MockERC20,
    masterChef: BSCPool,
    routerV2: MdexRouter,
    poolIndex: number,
    workFactor: BigNumberish,
    killFactor: BigNumberish,
    addStrat: MdexRestrictedStrategyAddBaseTokenOnly,
    reinvestBountyBps: BigNumberish,
    okReinvestor: string[],
    treasuryAddress: string,
    reinvestPath: Array<string>,
    extraStrategies: string[],
    simpleVaultConfig: SimpleVaultConfig,
    priceOracleAddress: string
  ): Promise<DeltaNeutralMdexWorker02> {
    const DeltaNeutralMdexWorker02 = (await ethers.getContractFactory(
      "DeltaNeutralMdexWorker02",
      this.deployer
    )) as DeltaNeutralMdexWorker02__factory;
    const worker = (await upgrades.deployProxy(DeltaNeutralMdexWorker02, [
      vault.address,
      btoken.address,
      masterChef.address,
      routerV2.address,
      poolIndex,
      addStrat.address,
      reinvestBountyBps,
      treasuryAddress,
      reinvestPath,
      0,
      priceOracleAddress,
    ])) as DeltaNeutralMdexWorker02;
    await worker.deployed();

    await simpleVaultConfig.setWorker(worker.address, true, true, workFactor, killFactor, true, true);
    await worker.setStrategyOk(extraStrategies, true);
    await worker.setReinvestorOk(okReinvestor, true);
    await worker.setTreasuryConfig(treasuryAddress, reinvestBountyBps);

    extraStrategies.push(addStrat.address);
    extraStrategies.forEach(async (stratAddress) => {
      const strat = MdexRestrictedStrategyLiquidate__factory.connect(stratAddress, this.deployer);
      await strat.setWorkersOk([worker.address], true);
    });

    return worker;
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

  public async deployDeltaNeutralVaultConfig(input: IDeltaNeutralVaultConfig): Promise<DeltaNeutralVaultConfig> {
    const DeltaNeutralVaultConfig = (await ethers.getContractFactory(
      "DeltaNeutralVaultConfig",
      this.deployer
    )) as DeltaNeutralVaultConfig__factory;

    const deltaNeutralVaultConfig = (await upgrades.deployProxy(DeltaNeutralVaultConfig, [
      input.wNativeAddr,
      input.wNativeRelayer,
      input.fairlaunchAddr,
      input.rebalanceFactor,
      input.positionValueTolerance,
      input.debtRatioTolerance,
      input.depositFeeTreasury,
      input.managementFeeTreasury,
      input.withdrawFeeTreasury,
      input.alpacaTokenAddress,
    ])) as DeltaNeutralVaultConfig;
    await deltaNeutralVaultConfig.deployed();
    return deltaNeutralVaultConfig;
  }

  public async deployDeltaNeutralVault(input: IDeltaNeutralVault): Promise<DeltaNeutralVault> {
    const DeltaNeutralVault = (await ethers.getContractFactory(
      "DeltaNeutralVault",
      this.deployer
    )) as DeltaNeutralVault__factory;
    const deltaNeutralVault = (await upgrades.deployProxy(DeltaNeutralVault, [
      input.name,
      input.symbol,
      input.vaultStable,
      input.vaultAsset,
      input.stableVaultWorker,
      input.assetVaultWorker,
      input.lpToken,
      input.alpacaToken,
      input.deltaNeutralOracle,
      input.deltaVaultConfig,
    ])) as DeltaNeutralVault;
    await deltaNeutralVault.deployed();
    return deltaNeutralVault;
  }

  public async deployDeltaNeutralGateway(
    params: IDeltaNeutralVaultGatewayDeployParams
  ): Promise<DeltaNeutralVaultGateway> {
    const DeltaNeutralVaultGateway = (await ethers.getContractFactory(
      "DeltaNeutralVaultGateway",
      this.deployer
    )) as DeltaNeutralVaultGateway__factory;
    const deltaNeutralVaultGateway = (await upgrades.deployProxy(DeltaNeutralVaultGateway, [
      params.deltaVault,
      params.router,
    ])) as DeltaNeutralVaultGateway;
    await deltaNeutralVaultGateway.deployed();
    return deltaNeutralVaultGateway;
  }

  public async deploySpookySwap(
    wbnb: MockWBNB,
    booPerSec: BigNumberish,
    holders: Array<IHolder>
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

    if (holders !== undefined) {
      holders.forEach(async (holder) => await boo.mint(holder.address, holder.amount));
    }

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

  public async deployBiswap(
    wbnb: MockWBNB,
    bswPerBlock: BigNumberish
  ): Promise<[BiswapFactory, BiswapRouter02, BSWToken, BiswapMasterChef]> {
    const BiswapFactory = (await ethers.getContractFactory("BiswapFactory", this.deployer)) as BiswapFactory__factory;
    const factory = await BiswapFactory.deploy(await this.deployer.getAddress());
    await factory.deployed();

    const BiswapRouter02 = (await ethers.getContractFactory(
      "BiswapRouter02",
      this.deployer
    )) as BiswapRouter02__factory;
    const router = await BiswapRouter02.deploy(factory.address, wbnb.address);
    await router.deployed();

    const BSWToken = (await ethers.getContractFactory("BSWToken", this.deployer)) as BSWToken__factory;
    const bsw = await BSWToken.deploy();
    await bsw.deployed();
    await bsw["mint(uint256)"](ethers.utils.parseEther("100"));

    /// Setup MasterChef
    const BiswapMasterChef = (await ethers.getContractFactory(
      "BiswapMasterChef",
      this.deployer
    )) as BiswapMasterChef__factory;
    /*_BSW: string,
    _devaddr: string,
    _refAddr: string,
    _safuaddr: string,
    _BSWPerBlock: BigNumberish,
    _startBlock: BigNumberish,
    _stakingPercent: BigNumberish,
    _devPercent: BigNumberish,
    _refPercent: BigNumberish,
    _safuPercent: BigNumberish,*/
    const biswapMasterChef = await BiswapMasterChef.deploy(
      bsw.address,
      await this.deployer.getAddress(),
      await this.deployer.getAddress(),
      await this.deployer.getAddress(),
      bswPerBlock,
      BigNumber.from(0),
      BigNumber.from(1000000),
      BigNumber.from(0),
      BigNumber.from(0),
      BigNumber.from(0)
    );

    await biswapMasterChef.deployed();
    // Transfer mintership so biswapMasterChef can mint BSW
    await bsw.addMinter(biswapMasterChef.address);

    return [factory, router, bsw, biswapMasterChef];
  }

  public async deployBiswapStrategies(
    router: BiswapRouter02,
    vault: BaseContract,
    wNativeRelayer: WNativeRelayer
  ): Promise<
    [
      BiswapStrategyAddBaseTokenOnly,
      BiswapStrategyLiquidate,
      BiswapStrategyAddTwoSidesOptimal,
      BiswapStrategyWithdrawMinimizeTrading,
      BiswapStrategyPartialCloseLiquidate,
      BiswapStrategyPartialCloseMinimizeTrading
    ]
  > {
    /// Setup strategy
    const BiswapStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "BiswapStrategyAddBaseTokenOnly",
      this.deployer
    )) as BiswapStrategyAddBaseTokenOnly__factory;
    const addStrat = (await upgrades.deployProxy(BiswapStrategyAddBaseTokenOnly, [
      router.address,
    ])) as BiswapStrategyAddBaseTokenOnly;
    await addStrat.deployed();

    const BiswapStrategyLiquidate = (await ethers.getContractFactory(
      "BiswapStrategyLiquidate",
      this.deployer
    )) as BiswapStrategyLiquidate__factory;
    const liqStrat = (await upgrades.deployProxy(BiswapStrategyLiquidate, [router.address])) as BiswapStrategyLiquidate;
    await liqStrat.deployed();

    const BiswapStrategyAddTwoSidesOptimal = (await ethers.getContractFactory(
      "BiswapStrategyAddTwoSidesOptimal",
      this.deployer
    )) as BiswapStrategyAddTwoSidesOptimal__factory;
    const twoSidesStrat = (await upgrades.deployProxy(BiswapStrategyAddTwoSidesOptimal, [
      router.address,
      vault.address,
    ])) as BiswapStrategyAddTwoSidesOptimal;

    const BiswapStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "BiswapStrategyWithdrawMinimizeTrading",
      this.deployer
    )) as BiswapStrategyWithdrawMinimizeTrading__factory;
    const minimizeTradeStrat = (await upgrades.deployProxy(BiswapStrategyWithdrawMinimizeTrading, [
      router.address,
      wNativeRelayer.address,
    ])) as BiswapStrategyWithdrawMinimizeTrading;

    const BiswapStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "BiswapStrategyPartialCloseLiquidate",
      this.deployer
    )) as BiswapStrategyPartialCloseLiquidate__factory;
    const partialCloseStrat = (await upgrades.deployProxy(BiswapStrategyPartialCloseLiquidate, [
      router.address,
    ])) as BiswapStrategyPartialCloseLiquidate;
    await partialCloseStrat.deployed();
    await wNativeRelayer.setCallerOk([partialCloseStrat.address], true);

    const BiswapStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "BiswapStrategyPartialCloseMinimizeTrading",
      this.deployer
    )) as BiswapStrategyPartialCloseMinimizeTrading__factory;
    const partialCloseMinimizeStrat = (await upgrades.deployProxy(BiswapStrategyPartialCloseMinimizeTrading, [
      router.address,
      wNativeRelayer.address,
    ])) as BiswapStrategyPartialCloseMinimizeTrading;
    await partialCloseMinimizeStrat.deployed();
    await wNativeRelayer.setCallerOk([partialCloseMinimizeStrat.address], true);

    return [addStrat, liqStrat, twoSidesStrat, minimizeTradeStrat, partialCloseStrat, partialCloseMinimizeStrat];
  }

  public async deployBiswapWorker03(
    vault: Vault,
    btoken: MockERC20,
    masterChef: BiswapMasterChef,
    routerV2: BiswapRouter02,
    poolIndex: number,
    workFactor: BigNumberish,
    killFactor: BigNumberish,
    addStrat: BiswapStrategyAddBaseTokenOnly,
    liqStrat: BiswapStrategyLiquidate,
    reinvestBountyBps: BigNumberish,
    okReinvestor: string[],
    treasuryAddress: string,
    reinvestPath: Array<string>,
    extraStrategies: string[],
    simpleVaultConfig: SimpleVaultConfig
  ): Promise<BiswapWorker03> {
    const BiswapWorker03 = (await ethers.getContractFactory(
      "BiswapWorker03",
      this.deployer
    )) as BiswapWorker03__factory;
    const worker = (await upgrades.deployProxy(BiswapWorker03, [
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
    ])) as BiswapWorker03;
    await worker.deployed();
    await simpleVaultConfig.setWorker(worker.address, true, true, workFactor, killFactor, true, true);
    await worker.setStrategyOk(extraStrategies, true);
    await worker.setReinvestorOk(okReinvestor, true);
    await worker.setTreasuryConfig(treasuryAddress, reinvestBountyBps);

    extraStrategies.push(...[addStrat.address, liqStrat.address]);
    extraStrategies.forEach(async (stratAddress) => {
      const strat = BiswapStrategyLiquidate__factory.connect(stratAddress, this.deployer);
      await strat.setWorkersOk([worker.address], true);
    });

    return worker;
  }
  public async deploySpookySwapStrategies(
    router: WaultSwapRouter,
    vault: BaseContract,
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

  public async deployTShareRewardPool(): Promise<[TShare, TShareRewardPool]> {
    const TShare = (await ethers.getContractFactory("TShare", this.deployer)) as TShare__factory;
    const tshare = await TShare.deploy(
      (await TimeHelpers.latest()).add("10"),
      this.deployer.address,
      this.deployer.address
    );

    const TShareRewardPool = (await ethers.getContractFactory(
      "TShareRewardPool",
      this.deployer
    )) as TShareRewardPool__factory;
    const tshareRewardPool = await TShareRewardPool.deploy(tshare.address, (await TimeHelpers.latest()).add("10"));

    await tshare.distributeReward(tshareRewardPool.address);

    return [tshare, tshareRewardPool];
  }
}
