import { ethers, network, upgrades, waffle } from "hardhat";
import { Signer, BigNumber, constants, Wallet } from "ethers";
import chai from "chai";
import { MockProvider, solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  PancakeFactory,
  PancakeFactory__factory,
  PancakeRouterV2__factory,
  PancakeMasterChef,
  PancakeMasterChef__factory,
  PancakeRouterV2,
  PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading,
  PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading__factory,
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm,
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm__factory,
  PancakeswapV2RestrictedSingleAssetStrategyLiquidate,
  PancakeswapV2RestrictedSingleAssetStrategyLiquidate__factory,
  MockVaultForRestrictedCakeMaxiAddBaseWithFarm,
  MockVaultForRestrictedCakeMaxiAddBaseWithFarm__factory,
  WETH,
  WETH__factory,
  WNativeRelayer__factory,
  WNativeRelayer,
  CakeMaxiWorker02__factory,
  CakeMaxiWorker02,
  CakeToken,
  SyrupBar,
  CakeToken__factory,
  SyrupBar__factory,
  MockBeneficialVault,
  MockBeneficialVault__factory,
  Vault,
  Vault__factory,
  SimpleVaultConfig,
  SimpleVaultConfig__factory,
  DebtToken__factory,
  DebtToken,
  FairLaunch,
  FairLaunch__factory,
  AlpacaToken__factory,
  AlpacaToken,
  CakeMaxiWorker,
  CakeMaxiWorker__factory,
  PancakePair__factory,
  CakeMaxiWorker02Migrate,
  CakeMaxiWorker02Migrate__factory,
  MasterChefV2,
  CakePool,
  CakeMaxiWorker02MCV2,
  CakeMaxiWorker02MCV2__factory,
} from "../../../../../typechain";
import * as Assert from "../../../../helpers/assert";
import { DeployHelper } from "../../../../helpers/deploy";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import * as TimeHelpers from "../../../../helpers/time";

chai.use(solidity);
const { expect } = chai;

describe("CakeMaxiWorker02Migrate", () => {
  const FOREVER = "2000000000";
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther("40");
  const CAKE_RATE_TOTAL_PRECISION = BigNumber.from(1e12);
  const CAKE_RATE_TO_REGULAR_FARM = BigNumber.from(10 * 1e10);
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther("5000");
  const REINVEST_BOUNTY_BPS = "100"; // 1% reinvest bounty
  const RESERVE_POOL_BPS = "0"; // 0% reserve pool
  const KILL_PRIZE_BPS = "1000"; // 10% Kill prize
  const INTEREST_RATE = "3472222222222"; // 30% per year
  const MIN_DEBT_SIZE = ethers.utils.parseEther("0.05");
  const ZERO_BENEFICIALVAULT_BOUNTY_BPS = "0";
  const BENEFICIALVAULT_BOUNTY_BPS = "1000";
  const poolId = 0;
  const WORK_FACTOR = "7000";
  const KILL_FACTOR = "8000";
  const MAX_REINVEST_BOUNTY = "2000";
  const DEPLOYER = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";
  const ZERO_REINVEST_THRESHOLD = "0";
  const KILL_TREASURY_BPS = "100";

  /// PancakeswapV2-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouterV2;
  let masterChef: PancakeMasterChef;
  let masterChefV2: MasterChefV2;
  let cakePool: CakePool;

  /// cake maxi worker instance(s)
  let cakeMaxiWorkerNative: CakeMaxiWorker02;
  let cakeMaxiWorkerNonNative: CakeMaxiWorker02;
  let integratedCakeMaxiWorker: CakeMaxiWorker02;
  let integratedCakeMaxiWorker01: CakeMaxiWorker;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let alpaca: AlpacaToken;
  let cake: CakeToken;
  let syrup: SyrupBar;

  /// Strategy instance(s)
  let stratAdd: PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly;
  let stratLiq: PancakeswapV2RestrictedSingleAssetStrategyLiquidate;
  let stratAddWithFarm: PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm;
  let stratMinimize: PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading;
  let stratEvil: PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading;

  // Accounts
  let deployer: SignerWithAddress;
  let alice: Signer;
  let bob: Signer;
  let eve: Signer;

  let deployerAddress: string;
  let aliceAddress: string;
  let bobAddress: string;
  let eveAddress: string;

  // Vault
  let mockedVault: MockVaultForRestrictedCakeMaxiAddBaseWithFarm;
  let mockedBeneficialVault: MockBeneficialVault;
  let integratedVault: Vault;
  let simpleVaultConfig: SimpleVaultConfig;
  let debtToken: DebtToken;
  let fairLaunch: FairLaunch;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let cakeAsAlice: MockERC20;

  let wbnbTokenAsAlice: WETH;
  let wbnbTokenAsBob: WETH;

  let routerV2AsAlice: PancakeRouterV2;

  let cakeMaxiWorkerNativeAsAlice: CakeMaxiWorker02;
  let cakeMaxiWorkerNonNativeAsAlice: CakeMaxiWorker02;
  let cakeMaxiWorkerNativeAsEve: CakeMaxiWorker02;
  let cakeMaxiWorkerNonNativeAsEve: CakeMaxiWorker02;
  let notOperatorCakeMaxiWorker: CakeMaxiWorker02;
  let integratedVaultAsAlice: Vault;
  let integratedVaultAsBob: Vault;
  let integratedCakeMaxiWorkerAsEve: CakeMaxiWorker02;
  let integratedCakeMaxiWorker01AsEve: CakeMaxiWorker;

  let wNativeRelayer: WNativeRelayer;

  async function fixture(maybeWallets?: Wallet[], maybeProvider?: MockProvider) {
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: ["0xc44f82b07ab3e691f826951a6e335e1bc1bb0b51"],
    });
    deployer = await ethers.getSigner("0xc44f82b07ab3e691f826951a6e335e1bc1bb0b51");
    [alice, bob, eve] = await ethers.getSigners();
    [deployerAddress, aliceAddress, bobAddress, eveAddress] = await Promise.all([
      deployer.getAddress(),
      alice.getAddress(),
      bob.getAddress(),
      eve.getAddress(),
    ]);
    await alice.sendTransaction({ value: ethers.utils.parseEther("100"), to: deployerAddress });

    // Setup Mocked Vault (for unit testing purposed)
    const MockVault = (await ethers.getContractFactory(
      "MockVaultForRestrictedCakeMaxiAddBaseWithFarm",
      deployer
    )) as MockVaultForRestrictedCakeMaxiAddBaseWithFarm__factory;
    mockedVault = (await upgrades.deployProxy(MockVault)) as MockVaultForRestrictedCakeMaxiAddBaseWithFarm;
    await mockedVault.deployed();
    await mockedVault.setMockOwner(await alice.getAddress());

    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
    factoryV2 = await PancakeFactory.deploy(await deployer.getAddress());
    await factoryV2.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();
    await wbnb.deployed();

    // Setup WNativeRelayer
    const WNativeRelayer = (await ethers.getContractFactory("WNativeRelayer", deployer)) as WNativeRelayer__factory;
    wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
    await wNativeRelayer.deployed();

    const PancakeRouterV2 = (await ethers.getContractFactory("PancakeRouterV2", deployer)) as PancakeRouterV2__factory;
    routerV2 = await PancakeRouterV2.deploy(factoryV2.address, wbnb.address);
    await routerV2.deployed();

    // Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    baseToken = (await upgrades.deployProxy(MockERC20, ["BTOKEN", "BTOKEN", 18])) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
    const AlpacaToken = (await ethers.getContractFactory("AlpacaToken", deployer)) as AlpacaToken__factory;
    alpaca = await AlpacaToken.deploy(132, 137);
    await alpaca.deployed();
    await alpaca.mint(await deployer.getAddress(), ethers.utils.parseEther("1000"));
    const CakeToken = (await ethers.getContractFactory("CakeToken", deployer)) as CakeToken__factory;
    cake = await CakeToken.deploy();
    await cake.deployed();
    await cake["mint(address,uint256)"](await deployer.getAddress(), ethers.utils.parseEther("100"));
    await cake["mint(address,uint256)"](await alice.getAddress(), ethers.utils.parseEther("10"));
    await cake["mint(address,uint256)"](await bob.getAddress(), ethers.utils.parseEther("10"));
    await factoryV2.createPair(baseToken.address, wbnb.address);
    await factoryV2.createPair(cake.address, wbnb.address);
    await factoryV2.createPair(alpaca.address, wbnb.address);
    const SyrupBar = (await ethers.getContractFactory("SyrupBar", deployer)) as SyrupBar__factory;
    syrup = await SyrupBar.deploy(cake.address);
    await syrup.deployed();

    // add beneficial vault with alpaca as an underlying token, thus beneficialVault reward is ALPACA
    const MockBeneficialVault = (await ethers.getContractFactory(
      "MockBeneficialVault",
      deployer
    )) as MockBeneficialVault__factory;
    mockedBeneficialVault = (await upgrades.deployProxy(MockBeneficialVault, [alpaca.address])) as MockBeneficialVault;
    await mockedBeneficialVault.deployed();
    await mockedBeneficialVault.setMockOwner(await alice.getAddress());

    // Setup Strategies
    const PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly",
      deployer
    )) as PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly__factory;
    stratAdd = (await upgrades.deployProxy(PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly, [
      routerV2.address,
    ])) as PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly;
    await stratAdd.deployed();
    const PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm",
      deployer
    )) as PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm__factory;
    stratAddWithFarm = (await upgrades.deployProxy(PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm, [
      routerV2.address,
      mockedVault.address,
    ])) as PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm;
    await stratAddWithFarm.deployed();
    const PancakeswapV2RestrictedSingleAssetStrategyLiquidate = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedSingleAssetStrategyLiquidate",
      deployer
    )) as PancakeswapV2RestrictedSingleAssetStrategyLiquidate__factory;
    stratLiq = (await upgrades.deployProxy(PancakeswapV2RestrictedSingleAssetStrategyLiquidate, [
      routerV2.address,
    ])) as PancakeswapV2RestrictedSingleAssetStrategyLiquidate;
    await stratLiq.deployed();
    const PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading",
      deployer
    )) as PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading__factory;
    stratMinimize = (await upgrades.deployProxy(PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading, [
      routerV2.address,
      wNativeRelayer.address,
    ])) as PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading;
    await stratMinimize.deployed();
    const EvilStrat = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading",
      deployer
    )) as PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading__factory;
    stratEvil = (await upgrades.deployProxy(EvilStrat, [
      routerV2.address,
      wNativeRelayer.address,
    ])) as PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading;
    await stratEvil.deployed();

    /// Setup MasterChef
    const PancakeMasterChef = (await ethers.getContractFactory(
      "PancakeMasterChef",
      deployer
    )) as PancakeMasterChef__factory;
    masterChef = await PancakeMasterChef.deploy(
      cake.address,
      syrup.address,
      await deployer.getAddress(),
      CAKE_REWARD_PER_BLOCK,
      0
    );
    await masterChef.deployed();
    // Transfer ownership so masterChef can mint CAKE
    await cake.transferOwnership(masterChef.address);
    await syrup.transferOwnership(masterChef.address);

    // Setup Cake Maxi Worker
    const CakeMaxiWorker02 = (await ethers.getContractFactory(
      "CakeMaxiWorker02",
      deployer
    )) as CakeMaxiWorker02__factory;
    const CakeMaxiWorker = (await ethers.getContractFactory("CakeMaxiWorker", deployer)) as CakeMaxiWorker__factory;

    cakeMaxiWorkerNative = (await upgrades.deployProxy(CakeMaxiWorker02, [
      await alice.getAddress(),
      wbnb.address,
      masterChef.address,
      routerV2.address,
      mockedBeneficialVault.address,
      poolId,
      stratAdd.address,
      stratLiq.address,
      REINVEST_BOUNTY_BPS,
      ZERO_BENEFICIALVAULT_BOUNTY_BPS,
      [wbnb.address, cake.address],
      [cake.address, wbnb.address, alpaca.address],
      ZERO_REINVEST_THRESHOLD,
    ])) as CakeMaxiWorker02;
    await cakeMaxiWorkerNative.deployed();

    cakeMaxiWorkerNonNative = (await upgrades.deployProxy(CakeMaxiWorker02, [
      await alice.getAddress(),
      baseToken.address,
      masterChef.address,
      routerV2.address,
      mockedBeneficialVault.address,
      poolId,
      stratAdd.address,
      stratLiq.address,
      REINVEST_BOUNTY_BPS,
      ZERO_BENEFICIALVAULT_BOUNTY_BPS,
      [baseToken.address, wbnb.address, cake.address],
      [cake.address, wbnb.address, alpaca.address],
      ZERO_REINVEST_THRESHOLD,
    ])) as CakeMaxiWorker02;
    await cakeMaxiWorkerNonNative.deployed();

    // Set Up integrated Vault (for integration test purposed)
    const FairLaunch = (await ethers.getContractFactory("FairLaunch", deployer)) as FairLaunch__factory;
    fairLaunch = await FairLaunch.deploy(
      alpaca.address,
      await deployer.getAddress(),
      ALPACA_REWARD_PER_BLOCK,
      0,
      ALPACA_BONUS_LOCK_UP_BPS,
      0
    );
    await fairLaunch.deployed();

    await alpaca.transferOwnership(fairLaunch.address);

    const SimpleVaultConfig = (await ethers.getContractFactory(
      "SimpleVaultConfig",
      deployer
    )) as SimpleVaultConfig__factory;
    simpleVaultConfig = (await upgrades.deployProxy(SimpleVaultConfig, [
      MIN_DEBT_SIZE,
      INTEREST_RATE,
      RESERVE_POOL_BPS,
      KILL_PRIZE_BPS,
      wbnb.address,
      wNativeRelayer.address,
      fairLaunch.address,
      "0",
      ethers.constants.AddressZero,
    ])) as SimpleVaultConfig;
    await simpleVaultConfig.deployed();

    await simpleVaultConfig.setWhitelistedLiquidators([bobAddress], true);

    const DebtToken = (await ethers.getContractFactory("DebtToken", deployer)) as DebtToken__factory;
    debtToken = (await upgrades.deployProxy(DebtToken, [
      "debtibBTOKEN_V2",
      "debtibBTOKEN_V2",
      18,
      await deployer.getAddress(),
    ])) as DebtToken;
    await debtToken.deployed();

    const Vault = (await ethers.getContractFactory("Vault", deployer)) as Vault__factory;
    integratedVault = (await upgrades.deployProxy(Vault, [
      simpleVaultConfig.address,
      wbnb.address,
      "Interest Bearing BNB",
      "ibBNB",
      18,
      debtToken.address,
    ])) as Vault;
    await integratedVault.deployed();
    await debtToken.setOkHolders([fairLaunch.address, integratedVault.address], true);
    await debtToken.transferOwnership(integratedVault.address);

    // Add FairLaunch pool and set fairLaunchPoolId for Vault
    await fairLaunch.addPool(1, await integratedVault.debtToken(), false);
    await integratedVault.setFairLaunchPoolId(0);

    // Setup integrated CakeMaxiWorker02 for integration test
    integratedCakeMaxiWorker = (await upgrades.deployProxy(CakeMaxiWorker02, [
      integratedVault.address,
      wbnb.address,
      masterChef.address,
      routerV2.address,
      integratedVault.address,
      poolId,
      stratAdd.address,
      stratLiq.address,
      REINVEST_BOUNTY_BPS,
      ZERO_BENEFICIALVAULT_BOUNTY_BPS,
      [wbnb.address, cake.address],
      [cake.address, wbnb.address],
      ZERO_REINVEST_THRESHOLD,
    ])) as CakeMaxiWorker02;

    // Setup CakeMaxiWorker01 (previous implementation) for integration test
    integratedCakeMaxiWorker01 = (await upgrades.deployProxy(CakeMaxiWorker, [
      integratedVault.address,
      wbnb.address,
      masterChef.address,
      routerV2.address,
      integratedVault.address,
      poolId,
      stratAdd.address,
      stratLiq.address,
      REINVEST_BOUNTY_BPS,
      ZERO_BENEFICIALVAULT_BOUNTY_BPS,
      [wbnb.address, cake.address],
      [cake.address, wbnb.address],
    ])) as CakeMaxiWorker;

    await cakeMaxiWorkerNonNative.deployed();

    // Setting up dependencies for workers & strategies
    await simpleVaultConfig.setWorker(
      integratedCakeMaxiWorker.address,
      true,
      true,
      WORK_FACTOR,
      KILL_FACTOR,
      true,
      true
    );
    await simpleVaultConfig.setWorker(
      integratedCakeMaxiWorker01.address,
      true,
      true,
      WORK_FACTOR,
      KILL_FACTOR,
      true,
      true
    );
    await wNativeRelayer.setCallerOk(
      [stratMinimize.address, stratLiq.address, stratAddWithFarm.address, stratAdd.address, integratedVault.address],
      true
    );
    await cakeMaxiWorkerNative.setStrategyOk(
      [stratAdd.address, stratAddWithFarm.address, stratLiq.address, stratMinimize.address],
      true
    );
    await cakeMaxiWorkerNative.setReinvestorOk([await eve.getAddress()], true);
    await cakeMaxiWorkerNative.setTreasuryConfig(await eve.getAddress(), REINVEST_BOUNTY_BPS);
    await cakeMaxiWorkerNonNative.setStrategyOk(
      [stratAdd.address, stratAddWithFarm.address, stratLiq.address, stratMinimize.address],
      true
    );
    await cakeMaxiWorkerNonNative.setReinvestorOk([await eve.getAddress()], true);
    await cakeMaxiWorkerNonNative.setTreasuryConfig(await eve.getAddress(), REINVEST_BOUNTY_BPS);
    await integratedCakeMaxiWorker.setStrategyOk(
      [stratAdd.address, stratAddWithFarm.address, stratLiq.address, stratMinimize.address],
      true
    );
    await integratedCakeMaxiWorker.setReinvestorOk([await eve.getAddress()], true);
    await integratedCakeMaxiWorker.setTreasuryConfig(await eve.getAddress(), REINVEST_BOUNTY_BPS);
    await integratedCakeMaxiWorker01.setStrategyOk(
      [stratAdd.address, stratAddWithFarm.address, stratLiq.address, stratMinimize.address],
      true
    );
    await integratedCakeMaxiWorker01.setReinvestorOk([await eve.getAddress()], true);
    await stratAdd.setWorkersOk(
      [
        cakeMaxiWorkerNative.address,
        cakeMaxiWorkerNonNative.address,
        integratedCakeMaxiWorker.address,
        integratedCakeMaxiWorker01.address,
      ],
      true
    );
    await stratAddWithFarm.setWorkersOk(
      [
        cakeMaxiWorkerNative.address,
        cakeMaxiWorkerNonNative.address,
        integratedCakeMaxiWorker.address,
        integratedCakeMaxiWorker01.address,
      ],
      true
    );
    await stratLiq.setWorkersOk(
      [
        cakeMaxiWorkerNative.address,
        cakeMaxiWorkerNonNative.address,
        integratedCakeMaxiWorker.address,
        integratedCakeMaxiWorker01.address,
      ],
      true
    );
    await stratMinimize.setWorkersOk(
      [
        cakeMaxiWorkerNative.address,
        cakeMaxiWorkerNonNative.address,
        integratedCakeMaxiWorker.address,
        integratedCakeMaxiWorker01.address,
      ],
      true
    );
    await stratEvil.setWorkersOk(
      [
        cakeMaxiWorkerNative.address,
        cakeMaxiWorkerNonNative.address,
        integratedCakeMaxiWorker.address,
        integratedCakeMaxiWorker01.address,
      ],
      true
    );

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);
    cakeAsAlice = MockERC20__factory.connect(cake.address, alice);
    wbnbTokenAsAlice = WETH__factory.connect(wbnb.address, alice);
    wbnbTokenAsBob = WETH__factory.connect(wbnb.address, bob);
    routerV2AsAlice = PancakeRouterV2__factory.connect(routerV2.address, alice);
    cakeMaxiWorkerNativeAsAlice = CakeMaxiWorker02__factory.connect(cakeMaxiWorkerNative.address, alice);
    cakeMaxiWorkerNonNativeAsAlice = CakeMaxiWorker02__factory.connect(cakeMaxiWorkerNonNative.address, alice);
    cakeMaxiWorkerNativeAsEve = CakeMaxiWorker02__factory.connect(cakeMaxiWorkerNative.address, eve);
    cakeMaxiWorkerNonNativeAsEve = CakeMaxiWorker02__factory.connect(cakeMaxiWorkerNonNative.address, eve);
    notOperatorCakeMaxiWorker = CakeMaxiWorker02__factory.connect(cakeMaxiWorkerNative.address, bob);
    integratedVaultAsAlice = Vault__factory.connect(integratedVault.address, alice);
    integratedVaultAsBob = Vault__factory.connect(integratedVault.address, bob);
    integratedCakeMaxiWorkerAsEve = CakeMaxiWorker02__factory.connect(integratedCakeMaxiWorker.address, eve);
    integratedCakeMaxiWorker01AsEve = CakeMaxiWorker__factory.connect(integratedCakeMaxiWorker01.address, eve);

    // Adding liquidity to the pool
    await wbnbTokenAsAlice.deposit({
      value: ethers.utils.parseEther("52"),
    });
    await wbnbTokenAsBob.deposit({
      value: ethers.utils.parseEther("50"),
    });
    await wbnb.deposit({
      value: ethers.utils.parseEther("50"),
    });
    await cakeAsAlice.approve(routerV2.address, ethers.utils.parseEther("0.1"));
    await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("1"));
    await wbnbTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("2"));
    await alpaca.approve(routerV2.address, ethers.utils.parseEther("10"));
    await wbnb.approve(routerV2.address, ethers.utils.parseEther("10"));

    // Add liquidity to the BTOKEN-WBNB pool on Pancakeswap
    await routerV2AsAlice.addLiquidity(
      baseToken.address,
      wbnb.address,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("1"),
      "0",
      "0",
      await alice.getAddress(),
      FOREVER
    );
    // Add liquidity to the CAKE-WBNB pool on Pancakeswap
    await routerV2AsAlice.addLiquidity(
      cake.address,
      wbnb.address,
      ethers.utils.parseEther("0.1"),
      ethers.utils.parseEther("1"),
      "0",
      "0",
      await alice.getAddress(),
      FOREVER
    );
    // Add liquidity to the ALPACA-WBNB pool on Pancakeswap
    await routerV2.addLiquidity(
      wbnb.address,
      alpaca.address,
      ethers.utils.parseEther("10"),
      ethers.utils.parseEther("10"),
      "0",
      "0",
      await deployer.getAddress(),
      FOREVER
    );
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  describe("iworker2", async () => {
    it("should return the correct path", async () => {
      expect(await cakeMaxiWorkerNative.getPath()).to.be.deep.eq([wbnb.address, cake.address]);
      expect(await cakeMaxiWorkerNonNative.getPath()).to.be.deep.eq([baseToken.address, wbnb.address, cake.address]);
    });

    it("should reverse path", async () => {
      expect(await cakeMaxiWorkerNative.getReversedPath()).to.be.deep.eq([cake.address, wbnb.address]);
      expect(await cakeMaxiWorkerNonNative.getReversedPath()).to.be.deep.eq([
        cake.address,
        wbnb.address,
        baseToken.address,
      ]);
    });

    it("should return reward path", async () => {
      expect(await cakeMaxiWorkerNative.getRewardPath()).to.be.deep.eq([cake.address, wbnb.address, alpaca.address]);
      expect(await cakeMaxiWorkerNonNative.getRewardPath()).to.be.deep.eq([cake.address, wbnb.address, alpaca.address]);
    });
  });

  describe("#setTreasuryBountyBps", async () => {
    context("when treasury bounty > max reinvest bounty", async () => {
      it("should revert", async () => {
        await expect(
          cakeMaxiWorkerNative.setTreasuryConfig(DEPLOYER, parseInt(MAX_REINVEST_BOUNTY) + 1)
        ).to.revertedWith("CakeMaxiWorker02::setTreasuryConfig:: _treasuryBountyBps exceeded maxReinvestBountyBps");
        expect(await cakeMaxiWorkerNative.treasuryBountyBps()).to.eq(REINVEST_BOUNTY_BPS);
      });
    });

    context("when treasury bounty <= max reinvest bounty", async () => {
      it("should successfully set a treasury bounty", async () => {
        await cakeMaxiWorkerNative.setTreasuryConfig(DEPLOYER, 499);
        expect(await cakeMaxiWorkerNative.treasuryBountyBps()).to.eq(499);
      });
    });
  });

  describe("#setTreasuryAccount", async () => {
    it("should successfully set a treasury account", async () => {
      const aliceAddr = await alice.getAddress();
      await cakeMaxiWorkerNative.setTreasuryConfig(aliceAddr, REINVEST_BOUNTY_BPS);
      expect(await cakeMaxiWorkerNative.treasuryAccount()).to.eq(aliceAddr);
    });
  });

  describe("#setMaxReinvestBountyBps", async () => {
    it("should successfully set a max reinvest bounty bps", async () => {
      await cakeMaxiWorkerNative.setMaxReinvestBountyBps("3000");
      expect(await cakeMaxiWorkerNative.maxReinvestBountyBps()).to.be.eq("3000");
    });

    it("should revert when new max reinvest bounty over 30%", async () => {
      await expect(cakeMaxiWorkerNative.setMaxReinvestBountyBps("3001")).to.be.revertedWith(
        "CakeMaxiWorker02::setMaxReinvestBountyBps:: _maxReinvestBountyBps exceeded 30%"
      );
      expect(await cakeMaxiWorkerNative.maxReinvestBountyBps()).to.be.eq("2000");
    });
  });

  describe("when PCS migrate to V2", async () => {
    beforeEach(async () => {
      const deployHelper = new DeployHelper(deployer);
      [masterChefV2] = await deployHelper.deployPancakeMasterChefV2(masterChef);
      [cakePool] = await deployHelper.deployPancakeCakePool(masterChefV2);

      await cakePool.setWithdrawFeeUser(integratedCakeMaxiWorker.address, true);
    });

    context("when CakePool pool is empty", async () => {
      it("should migrate and continue reinvest correctly", async () => {
        // Set Bank's debt interests to 0% per year
        await simpleVaultConfig.setParams(
          ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
          "0", // 0% per year
          "1000", // 10% reserve pool
          "1000", // 10% Kill prize
          wbnb.address,
          wNativeRelayer.address,
          fairLaunch.address,
          KILL_TREASURY_BPS,
          await eve.getAddress()
        );

        // Deployer deposits 3 BTOKEN to the bank
        await integratedVault.deposit(ethers.utils.parseEther("3"), { value: ethers.utils.parseEther("3") });

        // Alice can take 0 debt ok
        await integratedVaultAsAlice.work(
          0,
          integratedCakeMaxiWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          ),
          { value: ethers.utils.parseEther("0.3") }
        );
        const healthPosition1Before = await integratedCakeMaxiWorker.health(1);

        // Upgrade worker to migrate to MasterChefV2
        const CakeMaxiWorker02Migrate = (await ethers.getContractFactory(
          "CakeMaxiWorker02Migrate",
          deployer
        )) as CakeMaxiWorker02Migrate__factory;
        const cakeMaxiWorker02Migrate = (await upgrades.upgradeProxy(
          integratedCakeMaxiWorker.address,
          CakeMaxiWorker02Migrate
        )) as CakeMaxiWorker02Migrate;
        await cakeMaxiWorker02Migrate.deployed();

        const healthBeforeMigrateLp = await integratedCakeMaxiWorker.health(1);

        // Open Position #2 before migrateLp
        await integratedVaultAsAlice.work(
          0,
          integratedCakeMaxiWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          ),
          { value: ethers.utils.parseEther("0.3") }
        );
        const healthPosition2Before = await integratedCakeMaxiWorker.health(2);

        await cakeMaxiWorker02Migrate.migrateCAKE(cakePool.address);

        // Open Position #3 after migrateLp
        await integratedVaultAsAlice.work(
          0,
          integratedCakeMaxiWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          ),
          { value: ethers.utils.parseEther("0.3") }
        );
        const healthPosition3Before = await integratedCakeMaxiWorker.health(3);

        // Upgrade to non-migrate version that support MasterChefV2
        const CakeMaxiWorker02MCV2 = (await ethers.getContractFactory(
          "CakeMaxiWorker02MCV2",
          deployer
        )) as CakeMaxiWorker02MCV2__factory;
        const cakeMaxiWorker02MCV2 = (await upgrades.upgradeProxy(
          integratedCakeMaxiWorker.address,
          CakeMaxiWorker02MCV2
        )) as CakeMaxiWorker02MCV2;
        await cakeMaxiWorker02MCV2.deployed();

        // Open Position #4 after upgrade to non-migrate version
        await integratedVaultAsAlice.work(
          0,
          integratedCakeMaxiWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          ),
          { value: ethers.utils.parseEther("0.3") }
        );
        const healthPosition4Before = await integratedCakeMaxiWorker.health(4);

        const [oldMasterChefBalance] = await masterChef.userInfo(1, integratedCakeMaxiWorker.address);
        const [cakePoolBalance, ,] = await cakePool.userInfo(integratedCakeMaxiWorker.address);
        expect(oldMasterChefBalance).to.be.eq(0);
        expect(cakePoolBalance).to.be.gt(0);

        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        await integratedCakeMaxiWorkerAsEve.reinvest();
        await integratedVault.deposit(0); // Random action to trigger interest computation

        const healthPosition1After = await integratedCakeMaxiWorker.health(1);
        const healthPosition2After = await integratedCakeMaxiWorker.health(2);
        const healthPosition3After = await integratedCakeMaxiWorker.health(3);
        const healthPosition4After = await integratedCakeMaxiWorker.health(4);

        expect(healthPosition1After).to.be.gt(healthPosition1Before);
        expect(healthPosition2After).to.be.gt(healthPosition2Before);
        expect(healthPosition3After).to.be.gt(healthPosition3Before);
        expect(healthPosition4After).to.be.gt(healthPosition4Before);
      });
    });

    context("when migrate with wrong CakePool", async () => {
      it("shouled revert", async () => {
        // Set Bank's debt interests to 0% per year
        await simpleVaultConfig.setParams(
          ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
          "0", // 0% per year
          "1000", // 10% reserve pool
          "1000", // 10% Kill prize
          wbnb.address,
          wNativeRelayer.address,
          fairLaunch.address,
          KILL_TREASURY_BPS,
          await eve.getAddress()
        );

        // Deployer deposits 3 BTOKEN to the bank
        await integratedVault.deposit(ethers.utils.parseEther("3"), { value: ethers.utils.parseEther("3") });

        // Alice can take 0 debt ok
        await integratedVaultAsAlice.work(
          0,
          integratedCakeMaxiWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          ),
          { value: ethers.utils.parseEther("0.3") }
        );
        const healthPosition1Before = await integratedCakeMaxiWorker.health(1);

        // Upgrade worker to migrate to MasterChefV2
        const CakeMaxiWorker02Migrate = (await ethers.getContractFactory(
          "CakeMaxiWorker02Migrate",
          deployer
        )) as CakeMaxiWorker02Migrate__factory;
        const cakeMaxiWorker02Migrate = (await upgrades.upgradeProxy(
          integratedCakeMaxiWorker.address,
          CakeMaxiWorker02Migrate
        )) as CakeMaxiWorker02Migrate;
        await cakeMaxiWorker02Migrate.deployed();

        const healthBeforeMigrateLp = await integratedCakeMaxiWorker.health(1);

        // Open Position #2 before migrateLp
        await integratedVaultAsAlice.work(
          0,
          integratedCakeMaxiWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          ),
          { value: ethers.utils.parseEther("0.3") }
        );
        const healthPosition2Before = await integratedCakeMaxiWorker.health(2);

        await expect(cakeMaxiWorker02Migrate.migrateCAKE(masterChef.address)).to.be.reverted;
      });
    });

    context("when migrate twice", async () => {
      it("should revert", async () => {
        // Set Bank's debt interests to 0% per year
        await simpleVaultConfig.setParams(
          ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
          "0", // 0% per year
          "1000", // 10% reserve pool
          "1000", // 10% Kill prize
          wbnb.address,
          wNativeRelayer.address,
          fairLaunch.address,
          KILL_TREASURY_BPS,
          await eve.getAddress()
        );

        // Deployer deposits 3 BTOKEN to the bank
        await integratedVault.deposit(ethers.utils.parseEther("3"), { value: ethers.utils.parseEther("3") });

        // Alice can take 0 debt ok
        await integratedVaultAsAlice.work(
          0,
          integratedCakeMaxiWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          ),
          { value: ethers.utils.parseEther("0.3") }
        );
        const healthPosition1Before = await integratedCakeMaxiWorker.health(1);

        // Upgrade worker to migrate to MasterChefV2
        const CakeMaxiWorker02Migrate = (await ethers.getContractFactory(
          "CakeMaxiWorker02Migrate",
          deployer
        )) as CakeMaxiWorker02Migrate__factory;
        const cakeMaxiWorker02Migrate = (await upgrades.upgradeProxy(
          integratedCakeMaxiWorker.address,
          CakeMaxiWorker02Migrate
        )) as CakeMaxiWorker02Migrate;
        await cakeMaxiWorker02Migrate.deployed();

        const healthBeforeMigrateLp = await integratedCakeMaxiWorker.health(1);

        // Open Position #2 before migrateLp
        await integratedVaultAsAlice.work(
          0,
          integratedCakeMaxiWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          ),
          { value: ethers.utils.parseEther("0.3") }
        );
        const healthPosition2Before = await integratedCakeMaxiWorker.health(2);

        await cakeMaxiWorker02Migrate.migrateCAKE(cakePool.address);
        await expect(cakeMaxiWorker02Migrate.migrateCAKE(cakePool.address)).to.be.revertedWith("migrated");
      });
    });

    context("when Bob try to migrate", async () => {
      it("should revert", async () => {
        // Upgrade worker to migrate to MasterChefV2
        const CakeMaxiWorker02Migrate = (await ethers.getContractFactory(
          "CakeMaxiWorker02Migrate",
          deployer
        )) as CakeMaxiWorker02Migrate__factory;
        const cakeMaxiWorker02Migrate = (await upgrades.upgradeProxy(
          integratedCakeMaxiWorker.address,
          CakeMaxiWorker02Migrate
        )) as CakeMaxiWorker02Migrate;
        await cakeMaxiWorker02Migrate.deployed();

        await expect(cakeMaxiWorker02Migrate.connect(bob).migrateCAKE(cakePool.address)).to.be.revertedWith("!D");
      });
    });

    context("when CakePool withdrawal fee is on", async () => {
      it("should prevent deposit only, withdraw is still possible", async () => {
        // Set Bank's debt interests to 0% per year
        await simpleVaultConfig.setParams(
          ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
          "0", // 0% per year
          "1000", // 10% reserve pool
          "1000", // 10% Kill prize
          wbnb.address,
          wNativeRelayer.address,
          fairLaunch.address,
          KILL_TREASURY_BPS,
          await eve.getAddress()
        );

        // Deployer deposits 3 BTOKEN to the bank
        await integratedVault.deposit(ethers.utils.parseEther("3"), { value: ethers.utils.parseEther("3") });

        // Alice can take 0 debt ok
        await integratedVaultAsAlice.work(
          0,
          integratedCakeMaxiWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          ),
          { value: ethers.utils.parseEther("0.3") }
        );
        const healthPosition1Before = await integratedCakeMaxiWorker.health(1);

        // Upgrade worker to migrate to MasterChefV2
        const CakeMaxiWorker02Migrate = (await ethers.getContractFactory(
          "CakeMaxiWorker02Migrate",
          deployer
        )) as CakeMaxiWorker02Migrate__factory;
        const cakeMaxiWorker02Migrate = (await upgrades.upgradeProxy(
          integratedCakeMaxiWorker.address,
          CakeMaxiWorker02Migrate
        )) as CakeMaxiWorker02Migrate;
        await cakeMaxiWorker02Migrate.deployed();

        const healthBeforeMigrateLp = await integratedCakeMaxiWorker.health(1);

        // Open Position #2 before migrateLp
        await integratedVaultAsAlice.work(
          0,
          integratedCakeMaxiWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          ),
          { value: ethers.utils.parseEther("0.3") }
        );
        const healthPosition2Before = await integratedCakeMaxiWorker.health(2);

        await cakeMaxiWorker02Migrate.migrateCAKE(cakePool.address);

        // Turn withdrawal fee back on
        await cakePool.setWithdrawFeeUser(integratedCakeMaxiWorker.address, false);

        // Open Position #3 after migrateLp and withdrawal fee on, should fail
        await expect(
          integratedVaultAsAlice.work(
            0,
            integratedCakeMaxiWorker.address,
            ethers.utils.parseEther("0.3"),
            ethers.utils.parseEther("0"),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            ),
            { value: ethers.utils.parseEther("0.3") }
          )
        ).to.be.revertedWith("CakeMaxiWorker02Migrate::deposit::cannot deposit with withdrawal fee on");

        // Close Position #2 should success
        await integratedVaultAsAlice.work(
          2,
          integratedCakeMaxiWorker.address,
          ethers.utils.parseEther("0"),
          ethers.utils.parseEther("0"),
          ethers.constants.MaxUint256,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratLiq.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
          )
        );
      });
    });
  });
});
