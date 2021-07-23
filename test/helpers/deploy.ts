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
  MasterChef,
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
  WNativeRelayer,
  WNativeRelayer__factory,
} from "../../typechain";

export interface IBEP20 {
  name: string;
  symbol: string;
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
    cakePerBlock: BigNumberish
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

    const CakeToken = (await ethers.getContractFactory("CakeToken", this.deployer)) as CakeToken__factory;
    const cake = await CakeToken.deploy();
    await cake.deployed();
    await cake["mint(address,uint256)"](await this.deployer.getAddress(), ethers.utils.parseEther("100"));

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
    await cake.transferOwnership(masterChef.address);
    await syrup.transferOwnership(masterChef.address);

    return [factoryV2, routerV2, cake, syrup, masterChef];
  }

  public async deployPancakeV2Strategies(
    router: PancakeRouterV2,
    vault: Vault
  ): Promise<
    [
      PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
      PancakeswapV2RestrictedStrategyLiquidate,
      PancakeswapV2RestrictedStrategyAddTwoSidesOptimal,
      PancakeswapV2RestrictedStrategyPartialCloseLiquidate
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

    const PancakeswapV2RestrictedStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyPartialCloseLiquidate",
      this.deployer
    )) as PancakeswapV2RestrictedStrategyPartialCloseLiquidate__factory;
    const partialCloseStrat = (await upgrades.deployProxy(PancakeswapV2RestrictedStrategyPartialCloseLiquidate, [
      router.address,
    ])) as PancakeswapV2RestrictedStrategyPartialCloseLiquidate;
    await partialCloseStrat.deployed();

    return [addStrat, liqStrat, twoSidesStrat, partialCloseStrat];
  }

  public async deployBEP20(bep20s: Array<IBEP20>): Promise<Array<MockERC20>> {
    const deployedBEP20: Array<MockERC20> = [];
    for (const bep20 of bep20s) {
      const MockERC20 = (await ethers.getContractFactory("MockERC20", this.deployer)) as MockERC20__factory;
      const mockBep20 = (await upgrades.deployProxy(MockERC20, [bep20.name, bep20.symbol])) as MockERC20;
      await mockBep20.deployed();
      deployedBEP20.push(mockBep20);

      if (bep20.holders !== undefined) {
        bep20.holders.forEach(async (holder) => await mockBep20.mint(holder.address, holder.amount));
      }
    }
    return deployedBEP20;
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

  public async deployVault(
    wbnb: MockWBNB,
    vaultConfig: IVaultConfig,
    fairlaunch: FairLaunch,
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
      fairlaunch.address,
      vaultConfig.killTreasuryBps,
      vaultConfig.killTreasuryAddress,
    ])) as SimpleVaultConfig;
    await simpleVaultConfig.deployed();

    const DebtToken = (await ethers.getContractFactory("DebtToken", this.deployer)) as DebtToken__factory;
    const debtToken = (await upgrades.deployProxy(DebtToken, [
      "debtibBTOKEN_V2",
      "debtibBTOKEN_V2",
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
      18,
      debtToken.address,
    ])) as Vault;
    await vault.deployed();

    await wNativeRelayer.setCallerOk([vault.address], true);

    // Set holders of debtToken
    await debtToken.setOkHolders([fairlaunch.address, vault.address], true);

    // Transfer ownership to vault
    await debtToken.transferOwnership(vault.address);

    // Set add FairLaunch poool and set fairLaunchPoolId for Vault
    await fairlaunch.addPool(1, await vault.debtToken(), false);
    await vault.setFairLaunchPoolId(0);

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

    await simpleVaultConfig.setWorker(pancakeswapV2Worker02.address, true, true, workFactor, killFactor, true);
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

    await simpleVaultConfig.setWorker(pancakeswapV2Worker.address, true, true, workFactor, killFactor, true);
    await pancakeswapV2Worker.setStrategyOk(extraStrategies, true);
    await pancakeswapV2Worker.setReinvestorOk(okReinvestor, true);

    extraStrategies.push(...[addStrat.address, liqStrat.address]);
    extraStrategies.forEach(async (stratAddress) => {
      const strat = PancakeswapV2RestrictedStrategyLiquidate__factory.connect(stratAddress, this.deployer);
      await strat.setWorkersOk([pancakeswapV2Worker.address], true);
    });

    return pancakeswapV2Worker;
  }
}
