import { ethers, upgrades, waffle } from "hardhat";
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
  Alpies,
  Alpies__factory,
  FixedPriceModel,
  FixedPriceModel__factory,
  NFTStaking,
  NFTStaking__factory,
  ConfigurableInterestVaultConfig__factory,
  ConfigurableInterestVaultConfig,
  TripleSlopeModel__factory,
  TripleSlopeModel,
  SimplePriceOracle__factory,
  SimplePriceOracle,
  WorkerConfig,
  WorkerConfig__factory,
  SingleAssetWorkerConfig,
  SingleAssetWorkerConfig__factory,
} from "../typechain";
import * as Assert from "./helpers/assert";
import * as TimeHelpers from "./helpers/time";

chai.use(solidity);
const { expect } = chai;

describe("CakeMaxiWorker02 with NFTStaking", () => {
  const FOREVER = "2000000000";
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther("0.1");
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

  const MAX_SALE_ALPIES = 100;
  const MAX_RESERVE_AMOUNT = 5;
  const MAX_PREMINT_AMOUNT = 10;
  const ALPIES_PRICE = ethers.utils.parseEther("1");

  const ALPIES_POOL_ID = ethers.utils.solidityKeccak256(["string"], ["ALPIES"]);

  /// PancakeswapV2-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouterV2;
  let masterChef: PancakeMasterChef;

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
  let deployer: Signer;
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
  let configVault: ConfigurableInterestVaultConfig;
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

  let tripleSlopeModel: TripleSlopeModel;
  let nftStaking: NFTStaking;
  let alpies: Alpies;
  let simplePriceOracle: SimplePriceOracle;
  let singleAssetWorkerConfig: SingleAssetWorkerConfig;

  async function fixture(maybeWallets?: Wallet[], maybeProvider?: MockProvider) {
    [deployer, alice, bob, eve] = await ethers.getSigners();
    [deployerAddress, aliceAddress, bobAddress, eveAddress] = await Promise.all([
      deployer.getAddress(),
      alice.getAddress(),
      bob.getAddress(),
      eve.getAddress(),
    ]);

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

    const TripleSlopeModel = (await ethers.getContractFactory(
      "TripleSlopeModel",
      deployer
    )) as TripleSlopeModel__factory;
    tripleSlopeModel = await TripleSlopeModel.deploy();

    const ConfigurableInterestVaultConfig = (await ethers.getContractFactory(
      "ConfigurableInterestVaultConfig",
      deployer
    )) as ConfigurableInterestVaultConfig__factory;
    configVault = (await upgrades.deployProxy(ConfigurableInterestVaultConfig, [
      MIN_DEBT_SIZE,
      RESERVE_POOL_BPS,
      0,
      tripleSlopeModel.address,
      wbnb.address,
      wNativeRelayer.address,
      fairLaunch.address,
      0,
      ethers.constants.AddressZero,
    ])) as ConfigurableInterestVaultConfig;
    await configVault.deployed();

    const SimplePriceOracle = (await ethers.getContractFactory(
      "SimplePriceOracle",
      deployer
    )) as SimplePriceOracle__factory;
    simplePriceOracle = (await upgrades.deployProxy(SimplePriceOracle, [
      await deployer.getAddress(),
    ])) as SimplePriceOracle;
    await simplePriceOracle.deployed();

    const DebtToken = (await ethers.getContractFactory("DebtToken", deployer)) as DebtToken__factory;
    debtToken = (await upgrades.deployProxy(DebtToken, [
      "debtibBTOKEN_V2",
      "debtibBTOKEN_V2",
      await deployer.getAddress(),
    ])) as DebtToken;
    await debtToken.deployed();

    const Vault = (await ethers.getContractFactory("Vault", deployer)) as Vault__factory;
    integratedVault = (await upgrades.deployProxy(Vault, [
      configVault.address,
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

    const SingleAssetWorkerConfig = (await ethers.getContractFactory(
      "SingleAssetWorkerConfig",
      deployer
    )) as SingleAssetWorkerConfig__factory;
    singleAssetWorkerConfig = (await upgrades.deployProxy(SingleAssetWorkerConfig, [
      simplePriceOracle.address,
      routerV2.address,
    ])) as SingleAssetWorkerConfig;

    // Setting up dependencies for workers & strategies
    await configVault.setWorkers(
      [integratedCakeMaxiWorker.address, integratedCakeMaxiWorker01.address],
      [singleAssetWorkerConfig.address, singleAssetWorkerConfig.address]
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

    const NFTStaking = (await ethers.getContractFactory("NFTStaking", deployer)) as NFTStaking__factory;
    nftStaking = (await upgrades.deployProxy(NFTStaking, [])) as NFTStaking;
    await nftStaking.deployed();

    const FixedPriceModel = (await ethers.getContractFactory("FixedPriceModel", deployer)) as FixedPriceModel__factory;
    const fixedPriceModel = await FixedPriceModel.deploy(
      (await TimeHelpers.latestBlockNumber()).add(1000),
      (await TimeHelpers.latestBlockNumber()).add(1800),
      ALPIES_PRICE
    );
    await fixedPriceModel.deployed();

    // Deploy Alpies
    // Sale will start 1000 blocks from here and another 1000 blocks to reveal
    const Alpies = (await ethers.getContractFactory("Alpies", deployer)) as Alpies__factory;
    alpies = (await upgrades.deployProxy(Alpies, [
      "Alpies",
      "ALPIES",
      MAX_SALE_ALPIES,
      (await TimeHelpers.latestBlockNumber()).add(1850),
      fixedPriceModel.address,
      MAX_RESERVE_AMOUNT,
      MAX_PREMINT_AMOUNT,
    ])) as Alpies;
    await alpies.deployed();

    await nftStaking.addPool(ALPIES_POOL_ID, [alpies.address]);

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

  describe("#work()", async () => {
    context("When the caller is not an operator", async () => {
      it("should be reverted", async () => {
        await expect(
          notOperatorCakeMaxiWorker.work(
            0,
            await bob.getAddress(),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
            )
          )
        ).to.revertedWith("CakeMaxiWorker02::onlyOperator:: not operator");
      });
    });

    context("When the caller calling a non-whitelisted strategy", async () => {
      it("should be reverted", async () => {
        await expect(
          cakeMaxiWorkerNativeAsAlice.work(
            0,
            await alice.getAddress(),
            ethers.utils.parseEther("0.1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratEvil.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            )
          )
        ).to.revertedWith("CakeMaxiWorker02::work:: unapproved work strategy");
      });
    });

    context("When the operator calling a revoked strategy", async () => {
      it("should be reverted", async () => {
        await cakeMaxiWorkerNative.setStrategyOk([stratAdd.address], false);
        await expect(
          cakeMaxiWorkerNativeAsAlice.work(
            0,
            await alice.getAddress(),
            ethers.utils.parseEther("0.1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            )
          )
        ).to.revertedWith("CakeMaxiWorker02::work:: unapproved work strategy");
      });
    });

    context.only("When the treasury Account and treasury bounty bps haven't been set", async () => {
      it("should not auto reinvest", async () => {
        await cakeMaxiWorkerNative.setTreasuryConfig(constants.AddressZero, 0);

        // sending 0.1 wbnb to the worker (let's pretend to be the value from the vault)
        // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB
        // amountOut of 0.1 will be
        // if 1WBNB = 0.1 FToken
        // 0.1WBNB will be (0.1* 0.9975 * 0.1) / ( 1 + 0.1 * 0.9975) = 0.009070243237099340 FTOKEN
        await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
        await cakeMaxiWorkerNativeAsAlice.work(
          0,
          await alice.getAddress(),
          0,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
          )
        );

        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.00907024323709934"));
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
          ethers.utils.parseEther("0.00907024323709934")
        );

        // Alice opens a new position with 0.1 WBNB. This position ID is 1.
        // Her previous position must still has the same LPs as before due to reinvest is not triggered.
        await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
        await cakeMaxiWorkerNativeAsAlice.work(
          1,
          await alice.getAddress(),
          0,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
          )
        );

        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.00907024323709934"));
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
          ethers.utils.parseEther("0.00907024323709934")
        );
      });
    });

    context("When the user passes addBaseToken strategy", async () => {
      it("should convert an input base token to a farming token and stake to the masterchef", async () => {
        // sending 0.1 wbnb to the worker (let's pretend to be the value from the vault)
        // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB
        // amountOut of 0.1 will be
        // if 1WBNB = 0.1 FToken
        // 0.1WBNB will be (0.1* 0.9975 * 0.1) / ( 1 + 0.1 * 0.9975) = 0.009070243237099340 FTOKEN
        await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
        await cakeMaxiWorkerNativeAsAlice.work(
          0,
          await alice.getAddress(),
          0,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
          )
        );
        let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
        expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.00907024323709934"));
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.00907024323709934"));
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
          ethers.utils.parseEther("0.00907024323709934")
        );
        // Alice uses AddBaseTokenOnly strategy to add another 0.1 WBNB
        // once alice call function `work()` the `reinvest()` will be triggered
        // since it's 2 blocks away from the last `work()`, the reward will be 0.2 CAKE
        // thus, reward staked in the masterchef will be  0.2 - 0.002 (as a reward) + 0.009070243237099340 = 0.207070243237097456

        // amountOut of 0.1 from alice will be
        // if 1.1 WBNB = (0.1 - 0.00907024323709934) FToken  ((0.1 - 0.00907024323709934) is from a reserve pool changed during swap)
        // if 1.1 WBNB = 0.09092975676290066 FToken
        // 0.1 WBNB will be (0.1 * 0.9975 * 0.09092975676290066) /(1.1 + 0.1 * 0.9975)
        // = 0.0075601110540523785
        // thus, the current amount accumulated with the previous one will be 0.0075601110540523785 + 0.207070243237097456 = 0.214630354291149834 CAKE
        await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
        await cakeMaxiWorkerNativeAsAlice.work(
          0,
          await alice.getAddress(),
          0,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
          )
        );
        // after all these steps above, alice will have a balance in total of 0.214630354291149834
        userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
        expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.214630354291149834"));
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.214630354291149834"));
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
          ethers.utils.parseEther("0.214630354291149834")
        );
        Assert.assertAlmostEqual(
          (await cake.balanceOf(await eve.getAddress())).toString(),
          ethers.utils.parseEther("0.002").toString()
        );
        Assert.assertAlmostEqual(
          (await cakeMaxiWorkerNative.rewardBalance()).toString(),
          ethers.utils.parseEther("0").toString()
        );
        // bob start opening his position using 0.1 wbnb
        // once bob call function `work()` the `reinvest()` will be triggered
        // since it's 2 blocks away from the last `work()`, the reward will be 0.2 CAKE
        // thus, reward staked in the masterchef will be  0.2 - 0.002 (as a reward) + 0.214630354291149834 = 0.412630354291058781

        // amountOut of 0.1 will be
        // if 1.2 WBNB = (0.1 - (0.00907024323709934 + 0.0075601110540523785)) FToken
        // if 1.2 WBNB = 0.08336964570884828 FToken
        // 0.1 WBNB will be (0.1 * 0.9975 * 0.08336964570884828) / (1.2+0.1*0.9975) = 0.006398247477943924
        // total farming token amount will be 0.412630354291058781 + 0.006398247477943924 = 0.419028601769002705
        // bob total share will be (0.006398247477943924 /  0.412630354291058781) * 0.214630354291149834 = 0.003328058900060705
        // alice total balance will be (0.214630354291149834 /  0.214630354291149834) * 0.419028601769002705 = 0.419028601769002705
        await wbnbTokenAsBob.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
        await cakeMaxiWorkerNativeAsAlice.work(
          1,
          await bob.getAddress(),
          0,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
          )
        );
        userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
        expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.419028601769002705"));
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.214630354291149834"));
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
          ethers.utils.parseEther("0.412630354291058781")
        );
        expect(await cakeMaxiWorkerNative.shares(1)).to.eq(ethers.utils.parseEther("0.003328058900060705"));
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(1))).to.eq(
          ethers.utils.parseEther("0.006398247477943923")
        );
        Assert.assertAlmostEqual(
          (await cake.balanceOf(await eve.getAddress())).toString(),
          ethers.utils.parseEther("0.004").toString()
        );
        Assert.assertAlmostEqual(
          (await cakeMaxiWorkerNative.rewardBalance()).toString(),
          ethers.utils.parseEther("0").toString()
        );
      });
    });

    context("When the user passes addBaseWithFarm strategy", async () => {
      it("should convert an input as a base token with some farming token and stake to the masterchef", async () => {
        // Alice transfer 0.1 WBNB to StrategyAddBaseWithFarm first
        await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
        // Alice uses AddBaseWithFarm strategy to add 0.1 WBNB
        // amountOut of 0.1 will be
        // if 1WBNB = 0.1 FToken
        // 0.1WBNB will be (0.1 * 0.9975 * 0.1) / (1 + 0.1 * 0.9975) = 0.00907024323709934
        await cakeMaxiWorkerNativeAsAlice.work(
          0,
          await alice.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAddWithFarm.address, ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], ["0", "0"])]
          )
        );

        // after all these steps above, alice will have a balance in total of 0.00907024323709934
        let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
        expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.00907024323709934"));
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.00907024323709934"));
        // Alice uses AddBaseWithFarm strategy to add another 0.1 WBNB with 0.04 CAKE
        // once alice call function `work()` the `reinvest()` will be triggered
        // since it's 3 blocks away from the last `work()`, the reward will be 0.3 CAKE
        // thus, reward staked in the masterchef will be  0.3 - 0.003 (as a reward) + 0.009070243237099340 = 0.306070243237092023

        // amountOut of 0.1 will be
        // if 1.1 WBNB = (0.1 - 0.00907024323709934) FToken
        // if 1.1 WBNB = 0.09092975676290066 FToken
        // 0.1 WBNB will be (0.1 * 0.9975 * 0.09092975676290066) / (1.1 + 0.1 * 0.9975) = 0.0075601110540523785
        // thus, the current amount accumulated with the previous one will be 0.0075601110540523785 + 0.306070243237092023 + 0.04 = 0.353630354291144401
        await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
        await cakeAsAlice.approve(mockedVault.address, ethers.utils.parseEther("0.04"));
        await cakeMaxiWorkerNativeAsAlice.work(
          0,
          await alice.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              stratAddWithFarm.address,
              ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [ethers.utils.parseEther("0.04"), "0"]),
            ]
          )
        );
        // after all these steps above, alice will have a balance in total of 0.353630354291144401
        userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
        expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.353630354291144401"));
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.353630354291144401"));
        Assert.assertAlmostEqual(
          (await cakeMaxiWorkerNative.rewardBalance()).toString(),
          ethers.utils.parseEther("0").toString()
        );

        // Bob start opening his position using 0.1 wbnb with 0.05 CAKE
        // once alice call function `work()` the `reinvest()` will be triggered
        // since it's 3 blocks away from the last `work()`, the reward will be 0.3 CAKE
        // thus, reward staked in the masterchef will be  0.3 - 0.003 (as a reward) + 0.353630354291144401 = 0.650630354290912584

        // amountOut of 0.1 will be
        // if 1.2 WBNB = (0.1 - (0.0075601110540523785 + 0.00907024323709934)) FToken
        // if 1.2 WBNB = 0.08336964570884828 FToken
        // 0.1 WBNB will be (0.1 * 0.9975 * 0.08336964570884828) / (1.2 + 0.1 * 0.9975) = 0.006398247477943925
        // thus, total staked balance will be = 0.650630354290912584 + 0.006398247477943925 + 0.05 =  0.707028601768856508
        // bob will receive total share of ((0.05 + 0.006398247477943925) / 0.650630354290912584) * 0.353630354291144401 = 0.030653553289503376
        await wbnbTokenAsBob.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
        await cakeAsAlice.approve(mockedVault.address, ethers.utils.parseEther("0.05"));
        await cakeMaxiWorkerNativeAsAlice.work(
          1,
          await bob.getAddress(),
          0,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              stratAddWithFarm.address,
              ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [ethers.utils.parseEther("0.05"), "0"]),
            ]
          )
        );
        userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
        expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.707028601768856508"));
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.353630354291144401"));
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
          ethers.utils.parseEther("0.650630354290912585")
        );
        expect(await cakeMaxiWorkerNative.shares(1)).to.eq(ethers.utils.parseEther("0.030653553289503376"));
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(1))).to.eq(
          ethers.utils.parseEther("0.056398247477943922")
        );
        Assert.assertAlmostEqual(
          (await cakeMaxiWorkerNative.rewardBalance()).toString(),
          ethers.utils.parseEther("0").toString()
        );
      });
    });

    context("When the user passes liquidation strategy to close the position", async () => {
      context("When alice opened and closed her position", async () => {
        it("should liquidate a position based on the share of a user", async () => {
          // sending 0.1 wbnb to the worker (let's pretend to be the value from the vault)
          // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB
          // amountOut of 0.1 will be
          // if 1WBNB = 0.1 FToken
          // 0.1WBNB will be (0.1 * 0.9975 * 0.1) / (1+ 0.1 * 0.9975) = 0.009070243237099340
          await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
          const aliceBaseTokenBefore = await wbnb.balanceOf(await alice.getAddress());
          const aliceFarmingTokenBefore = await cake.balanceOf(await alice.getAddress());
          await cakeMaxiWorkerNativeAsAlice.work(
            0,
            await alice.getAddress(),
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            )
          );
          let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
          expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.00907024323709934"));
          expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.00907024323709934"));
          // Alice call liquidate strategy to close her position
          // once alice call function `work()` the `reinvest()` will be triggered
          await cakeMaxiWorkerNativeAsAlice.work(
            0,
            await alice.getAddress(),
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratLiq.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            )
          );
          // since it's 1 blocks away from the last `work()`, the reward will be 0.1 CAKE
          // thus, reward staked in the masterchef will be  0.1 - 0.001 (as a reward) + 0.009070243237099340 = 0.108070243237093908 FTOKEN
          // alice will get a base token based on 0.108070243237093908 farming token (staked balance)
          // if  0.1  - 0.108070243237093908 FTOKEN = 1.1 BNB
          // if 0.09092975676290066 FTOKEN = 1.1 BNB
          // 0.108070243237093908 FTOKEN = (0.108070243237093908 * 0.9975 * 1.1) / (0.09092975676290066 + 0.108070243237093908 * 0.9975) = 0.596689876593748878 BNB
          // thus, alice should get a baseToken amount of 0.596689876593748878
          userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
          const aliceBaseTokenAfter = await wbnb.balanceOf(await alice.getAddress());
          const aliceFarmingTokenAfter = await cake.balanceOf(await alice.getAddress());
          expect(userInfo[0]).to.eq(ethers.utils.parseEther("0"));
          expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0"));
          Assert.assertAlmostEqual(
            (await cakeMaxiWorkerNative.rewardBalance()).toString(),
            ethers.utils.parseEther("0").toString()
          );
          Assert.assertAlmostEqual(
            (await cake.balanceOf(await eve.getAddress())).toString(),
            ethers.utils.parseEther("0.001").toString()
          );
          expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.eq(ethers.utils.parseEther("0.596689876593748878"));
          expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.eq(ethers.utils.parseEther("0"));
        });
      });

      context("When alice closed her position after bob did", async () => {
        it("should liquidate a position based on the share of a user", async () => {
          // sending 0.1 wbnb to the worker (let's pretend to be the value from the vault)
          // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB
          // amountOut of 0.1 will be
          // if 1WBNB = 0.1 FToken
          // 0.1WBNB will be (0.1 * 0.9975 * 0.1) / (1+ 0.1 * 0.9975) = 0.009070243237099340
          await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
          const aliceBaseTokenBefore = await wbnb.balanceOf(await alice.getAddress());
          const aliceFarmingTokenBefore = await cake.balanceOf(await alice.getAddress());
          await cakeMaxiWorkerNativeAsAlice.work(
            0,
            await alice.getAddress(),
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            )
          );
          let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
          expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.00907024323709934"));
          expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.00907024323709934"));

          // Bob uses AddBaseTokenOnly strategy to add 0.1 WBNB
          // once Bob call function `work()` the `reinvest()` will be triggered
          // since it's 2 blocks away from the last `work()`, the reward will be 0.2 CAKE
          // thus, reward staked in the masterchef will be  0.2 - 0.002 (as a reward) + 0.009070243237099340 = 0.207070243237097456

          // amountOut of 0.1 from Bob will be
          // if 1.1 WBNB = (0.1 - 0.00907024323709934) FToken
          // if 1.1 WBNB = 0.09092975676290066 FToken
          // 0.1 WBNB will be (0.1 * 0.9975 * 0.09092975676290066) /(1.1 + 0.1 * 0.9975)
          // = 0.0075601110540523785
          // thus, the current amount accumulated with the previous one will be 0.0075601110540523785 + 0.207070243237097456 = 0.214630354291149834 CAKE
          // bob will receive the total share of (0.0075601110540523785 / 0.207070243237097456) * 0.009070243237099340 = 0.000331153550059932
          await wbnbTokenAsBob.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
          await cakeMaxiWorkerNativeAsAlice.work(
            1,
            await bob.getAddress(),
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            )
          );
          userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
          Assert.assertAlmostEqual(
            (await cake.balanceOf(await eve.getAddress())).toString(),
            ethers.utils.parseEther("0.002").toString()
          );
          expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.214630354291149834"));
          expect(await cakeMaxiWorkerNative.shares(1)).to.eq(ethers.utils.parseEther("0.000331153550059932"));
          // Alice call liquidate strategy to close her position
          // once alice call function `work()` the `reinvest()` will be triggered
          // since it's 1 blocks away from the last `work()`, the reward will be 0.1 CAKE
          // thus, reward staked in the masterchef will be  0.1 - 0.001 (as a reward) + 0.214630354291149834 = 0.313630354290998067
          await cakeMaxiWorkerNativeAsAlice.work(
            0,
            await alice.getAddress(),
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratLiq.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            )
          );
          // alice's share is 0.00907024323709934 farming token (staked balance)
          // thus alice is going to liquidate for (0.00907024323709934 / 9401396787159272) * 0.313630354290998067 = 0.302583080403795127 CAKE
          // thus the leftover balance will be 0.313630354290998067 - 0.302583080403795127 = 0.011047273887202940
          // if  0.1  - 0.01663035429115172 FTOKEN = 1.2 BNB
          // if 0.08336964570884828 FTOKEN = 1.2 BNB
          // 0.302583080403795127 FTOKEN = (0.302583080403795127 * 0.9975 * 1.2) / (0.08336964570884828 + 0.302583080403795127 * 0.9975) = 0.940278961519668853 BNB
          // thus, alice should get a baseToken amount of 0.940278961519668853
          userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
          const aliceBaseTokenAfter = await wbnb.balanceOf(await alice.getAddress());
          const aliceFarmingTokenAfter = await cake.balanceOf(await alice.getAddress());
          // only bobs' left
          expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.011047273887202940"));
          expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0"));
          // bob's position should remain the same
          expect(await cakeMaxiWorkerNative.shares(1)).to.eq(ethers.utils.parseEther("0.000331153550059932"));
          Assert.assertAlmostEqual(
            (await cakeMaxiWorkerNative.rewardBalance()).toString(),
            ethers.utils.parseEther("0").toString()
          );
          expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.eq(ethers.utils.parseEther("0.940278961519668853"));
          expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.eq(ethers.utils.parseEther("0"));
        });
      });
    });

    context("When the user passes close minimize trading strategy to close the position", async () => {
      it("should send a base token to be enough for repaying the debt, the rest will be sent as a farming token", async () => {
        // sending 0.1 wbnb to the worker (let's pretend to be the value from the vault)
        // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB
        // amountOut of 0.1 will be
        // if 1WBNB = 0.1 FToken
        // 0.1WBNB will be (0.1 * 0.9975 * 0.1) / (1+ 0.1 * 0.9975) = 0.009070243237099340
        await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
        const aliceBaseTokenBefore = await wbnb.balanceOf(await alice.getAddress());
        const aliceFarmingTokenBefore = await cake.balanceOf(await alice.getAddress());
        await cakeMaxiWorkerNativeAsAlice.work(
          0,
          await alice.getAddress(),
          0,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
          )
        );
        let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
        expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.00907024323709934"));
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.00907024323709934"));
        // Alice call withdraw minimize trading strategy to close her position
        // once alice call function `work()` the `reinvest()` will be triggered
        // since it's 1 blocks away from the last `work()`, the reward will be 0.1 CAKE
        // thus, reward staked in the masterchef will be  0.1 - 0.001 (as a reward) + 0.009070243237099340 = 0.108070243237093908
        await cakeMaxiWorkerNativeAsAlice.work(
          0,
          await alice.getAddress(),
          ethers.utils.parseEther("0.05"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratMinimize.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
          )
        );

        // 0.1 - 0.00907024323709934 FTOKEN = 1.1 WBNB
        // 0.09092975676290066 FTOKEN =  1.1 WBNB
        // x FTOKEN = (x * 0.9975 * 1.1) / (0.09092975676290066 + x * 0.9975) = 0.05 WBNB
        // x = 0.004340840518577427
        // thus, the remaining farming token will be 0.108070243237093908 - 0.004340840518577427
        // = 0.10372940271851648
        userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
        const aliceBaseTokenAfter = await wbnb.balanceOf(await alice.getAddress());
        const aliceFarmingTokenAfter = await cake.balanceOf(await alice.getAddress());
        Assert.assertAlmostEqual(
          (await cake.balanceOf(await eve.getAddress())).toString(),
          ethers.utils.parseEther("0.001").toString()
        );
        expect(userInfo[0]).to.eq(ethers.utils.parseEther("0"));
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0"));
        Assert.assertAlmostEqual(
          (await cakeMaxiWorkerNative.rewardBalance()).toString(),
          ethers.utils.parseEther("0").toString()
        );
        expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.eq(ethers.utils.parseEther("0.05"));
        expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.eq(
          ethers.utils.parseEther("0.10372940271851648")
        );
      });
    });
  });

  describe("#reinvest()", async () => {
    context("When the caller is not a reinvestor", async () => {
      it("should be reverted", async () => {
        await expect(cakeMaxiWorkerNativeAsAlice.reinvest()).to.revertedWith(
          "CakeMaxiWorker02::onlyReinvestor:: not reinvestor"
        );
      });
    });
    context("When the reinvestor reinvest in the middle of a transaction set", async () => {
      context("When beneficialVaultBounty takes 0% of reinvest bounty", async () => {
        it("should increase the size of total balance, bounty is sent to the reinvestor", async () => {
          // sending 0.1 wbnb to the worker (let's pretend to be the value from the vault)
          // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB
          // amountOut of 0.1 will be
          // if 1WBNB = 0.1 FToken
          // 0.1WBNB will be (0.1 * 0.9975 * 0.1) / (1 + 0.1 * 0.9975) = 0.009070243237099340
          await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
          await cakeMaxiWorkerNativeAsAlice.work(
            0,
            await alice.getAddress(),
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            )
          );
          let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
          expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.00907024323709934"));
          expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.00907024323709934"));
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
            ethers.utils.parseEther("0.00907024323709934")
          );

          // Alice uses AddBaseTokenOnly strategy to add another 0.1 WBNB
          // once alice call function `work()` the `reinvest()` will be triggered
          // since it's 2 blocks away from the last `work()`, the reward will be 0.2 CAKE
          // thus, reward staked in the masterchef will be  0.2 - 0.002 (as a reward) + 0.009070243237099340 = 0.207070243237097456

          // amountOut of 0.1 from alice will be
          // if 1.1 WBNB = (0.1 - 0.00907024323709934) FToken
          // if 1.1 WBNB = 0.09092975676290066 FToken
          // 0.1 WBNB will be (0.1 * 0.9975 * 0.09092975676290066) /(1.1 + 0.1 * 0.9975)
          // = 0.0075601110540523785
          // thus, the current amount accumulated with the previous one will be 0.0075601110540523785 + 0.207070243237097456 = 0.214630354291149834 CAKE
          await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
          await cakeMaxiWorkerNativeAsAlice.work(
            0,
            await alice.getAddress(),
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            )
          );
          // after all these steps above, alice will have a balance and share in total of 0.214630354291149834
          userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
          expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.214630354291149834"));
          expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.214630354291149834"));
          Assert.assertAlmostEqual(
            (await cakeMaxiWorkerNative.rewardBalance()).toString(),
            ethers.utils.parseEther("0").toString()
          );
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
            ethers.utils.parseEther("0.214630354291149834")
          );
          // reinvest.. the size of the reward should be 1 (blocks) * 0.1 FToken (CAKE)
          await cakeMaxiWorkerNativeAsEve.reinvest();
          // eve, who is a reinvestor will get her bounty for 0.1 * 1% = 0.001
          // thus, current balance will be 0.214630354291149834 + (0.1 - 0.001) = 0.313630354290998067 FTOKEN
          // now eve will get 0.002 + 0.001 = 0.003 FTOKEN
          Assert.assertAlmostEqual(
            (await cake.balanceOf(await eve.getAddress())).toString(),
            ethers.utils.parseEther("0.003").toString()
          );
          Assert.assertAlmostEqual(
            (await alpaca.balanceOf(mockedBeneficialVault.address)).toString(),
            ethers.utils.parseEther("0").toString()
          );
          userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
          // Bob start opening his position using 0.1 wbnb
          // once bob call function `work()` the `reinvest()` will be triggered
          // since it's 2 blocks away from the last `work()`, the reward will be 0.2 CAKE
          // thus, reward staked in the masterchef will be  0.2 - 0.002 (as a reward) + 0.313630354290998067 = 0.511630354290967637

          // amountOut of 0.1 will be
          // if 1.2 WBNB = (0.1 - (0.00907024323709934 + 0.0075601110540523785)) FToken
          // if 1.2 WBNB = 0.08336964570884828 FToken
          // 0.1 WBNB will be (0.1 * 0.9975 * 0.08336964570884828) / (1.2+0.1*0.9975) = 0.006398247477943924
          // total farming token amount will be 0.511630354290967637 + 0.006398247477943924 = 0.518028601768911561
          // bob total share will be (0.006398247477943924 /  0.511630354290967637) * 0.214630354291149834 = 0.002684082583287423
          const bobShare = ethers.utils.parseEther("0.002684082583287423");
          const aliceShare = ethers.utils.parseEther("0.214630354291149834");
          await wbnbTokenAsBob.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
          await cakeMaxiWorkerNativeAsAlice.work(
            1,
            await bob.getAddress(),
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            )
          );
          userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
          const bobBalance = bobShare.mul(userInfo[0]).div(await cakeMaxiWorkerNative.totalShare());
          const aliceBalance = aliceShare.mul(userInfo[0]).div(await cakeMaxiWorkerNative.totalShare());
          expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.518028601768911561"));
          expect(await cakeMaxiWorkerNative.shares(1)).to.eq(bobShare);
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(1))).to.eq(bobBalance);
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(aliceBalance);
          Assert.assertAlmostEqual(
            (await cakeMaxiWorkerNative.rewardBalance()).toString(),
            ethers.utils.parseEther("0").toString()
          );
        });
      });
      context("When beneficialVaultBounty takes 10% of reinvest bounty", async () => {
        it("should increase the size of total balance, bounty is sent to the reinvestor and beneficial vault based on a correct bps", async () => {
          await cakeMaxiWorkerNative.setBeneficialVaultBountyBps(BigNumber.from(BENEFICIALVAULT_BOUNTY_BPS));
          expect(await cakeMaxiWorkerNative.beneficialVaultBountyBps()).to.eq(
            BigNumber.from(BENEFICIALVAULT_BOUNTY_BPS)
          );
          // sending 0.1 wbnb to the worker (let's pretend to be the value from the vault)
          // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB
          // amountOut of 0.1 will be
          // if 1WBNB = 0.1 FToken
          // 0.1 WBNB will be (0.1 * 0.9975 * 0.1) / (1 + 0.1 * 0.9975) = 0.009070243237099340
          await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
          await cakeMaxiWorkerNativeAsAlice.work(
            0,
            await alice.getAddress(),
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            )
          );
          let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
          expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.00907024323709934"));
          expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.00907024323709934"));
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
            ethers.utils.parseEther("0.00907024323709934")
          );
          // Alice uses AddBaseTokenOnly strategy to add another 0.1 WBNB
          // once alice call function `work()` the `reinvest()` will be triggered
          // since it's 2 blocks away from the last `work()`, the reward will be 0.2 CAKE
          // total bounty will be 0.2 * 1% = 0.002
          // 90% if reinvest bounty 0.002 * 90 / 100 = 0.0018
          // thus, alice we get a bounty of 0.0018
          // 10% of 0.002 (0.0002) will be distributed to the vault by swapping 0.001 of reward token into a beneficial vault token (this is scenario, it will be ALPACA)
          // thus, reward staked in the masterchef will be  0.2 - 0.002 (as a reward) + 0.009070243237099340 = 0.207070243237097456

          // if (0.1 - 0.00907024323709934 ) FToken = 1.1 WBNB
          // 0.090929756762900660 FToken = 1.1 WBNB
          // 0.0002 will be (0.0002 * 0.9975 * 1.1) / (0.090929756762900660  + 0.0002 * 0.9975) = 0.002408117961182992 WBNB
          // if 10WBNB = 10ALPACA
          // 0.002408117961182992 WBNB = (0.002408117961182992 * 0.9975 * 10) / (10  + 0.002408117961182992 * 0.9975) = 0.002401520797529707 ALPACA

          // amountOut of 0.1 from alice will be
          // if (1.1 - 0.002408117961182992) WBNB = (0.090929756762900660 - 0.0002) FToken
          // if 1.097591882038817008 WBNB = 0.091129756762900658 FToken
          // 0.1 WBNB will be (0.1 * 0.9975 * 0.091129756762900658) /(1.097591882038817008 + 0.1 * 0.9975)
          // = 0.007591978008503875
          // thus, the current amount accumulated with the previous one will be 0.007591978008503875 + 0.207070243237097456 = 0.214662221245601331 CAKE
          await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
          await cakeMaxiWorkerNativeAsAlice.work(
            0,
            await alice.getAddress(),
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            )
          );
          // after all these steps above, alice will have a balance in total of 0.214662221245601331
          userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
          expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.214662221245601331"));
          expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.214662221245601331"));
          Assert.assertAlmostEqual(
            (await cake.balanceOf(await eve.getAddress())).toString(),
            ethers.utils.parseEther("0.0018").toString()
          );
          Assert.assertAlmostEqual(
            (await cakeMaxiWorkerNative.rewardBalance()).toString(),
            ethers.utils.parseEther("0").toString()
          );
          Assert.assertAlmostEqual(
            (await alpaca.balanceOf(mockedBeneficialVault.address)).toString(),
            ethers.utils.parseEther("0.002401520797529707").toString()
          );
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
            ethers.utils.parseEther("0.214662221245601331")
          );
          // since it's 2 blocks away from the last `work()`, the reward will be 0.2 CAKE
          // thus, reward staked in the masterchef will be  0.1 - 0.001 (as a reward) + 0.214662221245601331 = 0.313662221245495030
          // total bounty will be 0.1 * 1% = 0.001
          // 90% if reinvest bounty 0.001 * 90 / 100 = 0.0009
          // thus, alice we get a bounty of 0.0027
          // 10% of 0.001 (0.0001) will be distributed to the vault by swapping 0.001 of reward token into a beneficial vault token (this is scenario, it will be ALPACA)

          // if (0.091129756762900658 - 0.007591978008503875) FToken = 1.197591882038817008  WBNB
          // 0.083537778754396783 FToken = 1.197591882038817008 WBNB
          // 0.0001 will be (0.0001 * 0.9975 * 1.2) / (0.083537778754396783  + 0.0001 * 0.9975) = 0.001428303681521235 WBNB
          // if 10.002408117961182992 WBNB = 9.997598479202470293 ALPACA
          // 0.001428303681521235 WBNB =  (0.001428303681521235 * 0.9975 * 9.997598479202470293) / (10.002408117961182992  + 0.001428303681521235 * 0.9975) = 0.001423845031174474 ALPACA
          userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
          await cakeMaxiWorkerNativeAsEve.reinvest();
          Assert.assertAlmostEqual(
            (await cake.balanceOf(await eve.getAddress())).toString(),
            ethers.utils.parseEther("0.0027").toString()
          );
          Assert.assertAlmostEqual(
            (await alpaca.balanceOf(mockedBeneficialVault.address)).toString(),
            ethers.utils
              .parseEther("0.001423845031174474")
              .add(ethers.utils.parseEther("0.002401520797529707"))
              .toString()
          );
          userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
          // Bob start opening his position using 0.1 wbnb
          // once bob call function `work()` the `reinvest()` will be triggered
          // since it's 2 blocks away from the last `work()`, the reward will be 0.2 CAKE
          // thus, reward staked in the masterchef will be  0.2 - 0.002 (as a reward) + 0.313662221245495030  = 0.511662221245326915

          // 90% if reinvest bounty 0.002 * 90 / 100 = 0.00018
          // thus, eve we get a bounty of 00018
          // 10% of 0.002 (0.0002) will be distributed to the vault by swapping 0.002 of reward token into a beneficial vault token (this is scenario, it will be ALPACA)

          // if 0.083637778754396675 FToken = 1.196163578357295773  WBNB
          // 0.0002 FToken will be (0.0002 * 0.9975 * 1.196163578357295773) / (0.083637778754396675  + 0.0002 * 0.9975) = 0.002846402428938134 WBNB
          // if 10.003836421642704227 WBNB = 9.996174634171295819 ALPACA
          // 0.002846402428938134 WBNB =  (0.002846402428938134 * 0.9975 * 9.996174634171295819) / (10.003836421642704227  + 0.002846402428938134 * 0.9975) = 0.002836306856284102 ALPACA

          // amountOut of 0.1 will be
          // if 1.193317175928357639 WBNB = 0.08366964570884827 FToken
          // 0.1 WBNB will be (0.1 * 0.9975 * 0.08366964570884827) / (1.193317175928357639 + 0.1 * 0.9975) = 0.006467427668440323
          // bob's share will be (0.006467427668440323 / 0.511662221245326915) * 0.214662221245601331 = 0.002713337689215490
          // total farming token amount will be 0.511662221245326915 + 0.006467427668440323 = 0.518129648913767238
          const bobShare = ethers.utils.parseEther("0.002713337689215490");
          const aliceShare = ethers.utils.parseEther("0.214662221245601331");
          await wbnbTokenAsBob.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
          await cakeMaxiWorkerNativeAsAlice.work(
            1,
            await bob.getAddress(),
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            )
          );
          userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
          const bobBalance = bobShare.mul(userInfo[0]).div(await cakeMaxiWorkerNative.totalShare());
          const aliceBalance = aliceShare.mul(userInfo[0]).div(await cakeMaxiWorkerNative.totalShare());
          Assert.assertAlmostEqual(
            (await alpaca.balanceOf(mockedBeneficialVault.address)).toString(),
            ethers.utils
              .parseEther("0.001423845031174474")
              .add(ethers.utils.parseEther("0.002401520797529707").add(ethers.utils.parseEther("0.002836306856284102")))
              .toString()
          );
          expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.518129648913767238"));
          expect(await cakeMaxiWorkerNative.shares(1)).to.eq(bobShare);
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(1))).to.eq(bobBalance);
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(aliceBalance);
          Assert.assertAlmostEqual(
            (await cakeMaxiWorkerNative.rewardBalance()).toString(),
            ethers.utils.parseEther("0").toString()
          );
        });
      });
    });
    context("When integrated with an actual vault", async () => {
      it("should reinvest with updated beneficial vault reward to the beneficial vault", async () => {
        await integratedCakeMaxiWorker.setBeneficialVaultBountyBps(BigNumber.from(BENEFICIALVAULT_BOUNTY_BPS));
        expect(await integratedCakeMaxiWorker.beneficialVaultBountyBps()).to.eq(
          BigNumber.from(BENEFICIALVAULT_BOUNTY_BPS)
        );
        // alice deposit some portion of her native bnb into a vault, thus interest will be accrued afterward
        await integratedVaultAsAlice.deposit(ethers.utils.parseEther("1"), {
          value: ethers.utils.parseEther("1"),
        });
        // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB (0.05 as principal amount, 0.05 as a loan)
        // amountOut of 0.1 will be
        // if 1WBNB = 0.1 FToken
        // 0.1WBNB will be (0.1 * 0.9975 * 0.1) / (1 + 0.1 * 0.9975) = 0.009070243237099340
        await integratedVaultAsAlice.work(
          0,
          integratedCakeMaxiWorker.address,
          ethers.utils.parseEther("0.05"),
          ethers.utils.parseEther("0.05"),
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
          ),
          {
            value: ethers.utils.parseEther("0.05"),
          }
        );
        let userInfo = await masterChef.userInfo(0, integratedCakeMaxiWorker.address);
        expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.00907024323709934"));
        expect(await integratedCakeMaxiWorker.shares(1)).to.eq(ethers.utils.parseEther("0.00907024323709934"));
        expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(1))).to.eq(
          ethers.utils.parseEther("0.00907024323709934")
        );
        // Alice uses AddBaseTokenOnly strategy to add another 0.1 WBNB
        // once alice call function `work()` the `reinvest()` will be triggered
        // since it's 1 blocks away from the last `work()`, the reward will be 0.1 CAKE
        // total bounty will be 0.1 * 1% = 0.001
        // 90% if reinvest bounty 0.001 * 90 / 100 = 0.0009
        // thus, alice we get a bounty of 0.0018
        // 10% of 0.001 (0.0001) will be distributed to the vault by swapping 0.001 of reward token into a beneficial vault token (this is scenario, it will be wbnb)
        // thus, reward staked in the masterchef will be  0.1 - 0.001 (as a reward) + 0.009070243237099340 = 0.108070243237093908

        // if (0.1 - 0.00907024323709934 ) FToken = 1.1 WBNB
        // 0.090929756762900660 FToken = 1.1 WBNB
        // 0.0001 will be (0.0001 * 0.9975 * 1.1) / (0.090929756762900660  + 0.0001 * 0.9975) = 0.001205378386656404 WBNB

        // amountOut of 0.1 from alice will be
        // if (1.1 - 0.001205378386656404) WBNB = (0.090929756762900660 - 0.0001) FToken
        // if 1.098794621613343596 WBNB = 0.091029756762900654 FToken
        // 0.1 WBNB will be (0.1 * 0.9975 * 0.091029756762900654) /(1.098794621613343596 + 0.1 * 0.9975)
        // = 0.007576036864507046
        // thus, the current amount accumulated with the previous one will be 0.007576036864507046 + 0.108070243237093908 = 0.115646280101600954 CAKE
        await integratedVaultAsAlice.work(
          1,
          integratedCakeMaxiWorker.address,
          ethers.utils.parseEther("0.1"),
          ethers.utils.parseEther("0"),
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
          ),
          {
            value: ethers.utils.parseEther("0.1"),
          }
        );
        userInfo = await masterChef.userInfo(0, integratedCakeMaxiWorker.address);
        // after all these steps above, alice will have a balance in total of 0.115646280101600954
        expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.115646280101600954"));
        expect(await integratedCakeMaxiWorker.shares(1)).to.eq(ethers.utils.parseEther("0.115646280101600954"));
        Assert.assertAlmostEqual(
          (await cake.balanceOf(await eve.getAddress())).toString(),
          ethers.utils.parseEther("0.0009").toString()
        );
        Assert.assertAlmostEqual(
          (await integratedCakeMaxiWorker.rewardBalance()).toString(),
          ethers.utils.parseEther("0").toString()
        );
        expect(await await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(1))).to.eq(
          ethers.utils.parseEther("0.115646280101600954")
        );
        Assert.assertAlmostEqual(
          (await wbnb.balanceOf(integratedVault.address))
            .sub(ethers.utils.parseEther("1").sub(ethers.utils.parseEther("0.05")))
            .toString(),
          ethers.utils.parseEther("0").toString()
        );
        Assert.assertAlmostEqual(
          (await integratedCakeMaxiWorker.buybackAmount()).toString(),
          ethers.utils.parseEther("0.001205378386656404").toString()
        );
        // since it's 1 blocks away from the last `work()`, the reward will be 0.1 CAKE
        // thus, reward staked in the masterchef will be  0.1 - 0.001 (as a reward) + 0.115646280101600954 = 0.214646280101518468
        // total bounty will be 0.1 * 1% = 0.001
        // 90% if reinvest bounty 0.001 * 90 / 100 = 0.0009
        // thus, alice we get a bounty of 0.0018
        // 10% of 0.001 (0.0001) will be distributed to the vault by swapping 0.001 of reward token into a beneficial vault token (this is scenario, it will be wbnb)

        // if (0.091029756762900654 - 0.007576036864507046) FToken = 1.198794621613343596  WBNB
        // 0.083453719898393608 FToken = 1.198794621613343596 WBNB
        // 0.0001 will be (0.0001 * 0.9975 * 1.198794621613343596) / (0.083453719898393608  + 0.0001 * 0.9975) = 0.001431176510697250 WBNB
        userInfo = await masterChef.userInfo(0, integratedCakeMaxiWorker.address);
        await integratedCakeMaxiWorkerAsEve.reinvest();
        Assert.assertAlmostEqual(
          (await cake.balanceOf(await eve.getAddress())).toString(),
          ethers.utils.parseEther("0.0018").toString()
        );
        Assert.assertAlmostEqual(
          (await wbnb.balanceOf(integratedVault.address))
            .sub(ethers.utils.parseEther("1").sub(ethers.utils.parseEther("0.05")))
            .toString(),
          ethers.utils
            .parseEther("0.001431176510697250")
            .add(ethers.utils.parseEther("0.001205378386656404"))
            .toString()
        );
        Assert.assertAlmostEqual(
          (await integratedCakeMaxiWorker.buybackAmount()).toString(),
          ethers.utils.parseEther("0").toString()
        );
        userInfo = await masterChef.userInfo(0, integratedCakeMaxiWorker.address);

        // Bob start opening his position using 0.1 wbnb
        // once bob call function `work()` the `reinvest()` will be triggered
        // since it's 1 blocks away from the last `work()`, the reward will be 0.2 CAKE
        // thus, reward staked in the masterchef will be  0.1 - 0.001 (as a reward) + 0.21464628010160097  = 0.313646280101601

        // 90% if reinvest bounty 0.002 * 90 / 100 = 0.00009
        // thus, alice we get a bounty of 0.00009
        // 10% of 0.001 (0.0001) will be distributed to the vault by swapping 0.002 of reward token into a beneficial vault token (this is scenario, it will be wbnb)

        // if 0.083553719898393524 FToken = 1.197363445102646346  WBNB
        // 0.0001 FToken will be (0.0001 * 0.9975 * 1.197363445102646346) / (0.083553719898393524  + 0.0001 * 0.9975) = 0.001427759109023196 WBNB

        // amountOut of 0.1 will be
        // if 1.195935685993623150 WBNB = 0.083653719898393390 FToken
        // 0.1 WBNB will be (0.1 * 0.9975 * 0.083653719898393390) / (1.195935685993623150 + 0.1 * 0.9975) = 0.006440187346413124 FTOKEN
        // bob's share will be (0.006440187346413124 / 0.313646280101601) * 0.115646280101600954 = 0.002374597618467932
        // total farming token amount will be 0.313646280101601 + 0.006440187346413124 = 0.320086467447799501
        const alicePos1Share = ethers.utils.parseEther("0.115646280101600954");
        const bobPos2Share = ethers.utils.parseEther("0.002374597618467932");
        await integratedVaultAsBob.work(
          0,
          integratedCakeMaxiWorker.address,
          ethers.utils.parseEther("0.1"),
          ethers.utils.parseEther("0"),
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
          ),
          {
            value: ethers.utils.parseEther("0.1"),
          }
        );
        userInfo = await masterChef.userInfo(0, integratedCakeMaxiWorker.address);
        let alicePos1Balance = alicePos1Share.mul(userInfo[0]).div(await integratedCakeMaxiWorker.totalShare());
        let bobPos2Balance = bobPos2Share.mul(userInfo[0]).div(await integratedCakeMaxiWorker.totalShare());
        expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.320086467447799501"));
        expect(await integratedCakeMaxiWorker.shares(1)).to.eq(alicePos1Share);
        expect(await integratedCakeMaxiWorker.shares(2)).to.eq(bobPos2Share);
        expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(1))).to.eq(
          alicePos1Balance
        );
        expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(2))).to.eq(
          bobPos2Balance
        );
        Assert.assertAlmostEqual(
          (await wbnb.balanceOf(integratedVault.address))
            .sub(ethers.utils.parseEther("1").sub(ethers.utils.parseEther("0.05")))
            .toString(),
          ethers.utils
            .parseEther("0.001431176510697250")
            .add(ethers.utils.parseEther("0.001205378386656404"))
            .toString()
        );
        Assert.assertAlmostEqual(
          (await integratedCakeMaxiWorker.buybackAmount()).toString(),
          ethers.utils.parseEther("0.001427759109023196").toString()
        );
        Assert.assertAlmostEqual(
          (await integratedCakeMaxiWorker.rewardBalance()).toString(),
          ethers.utils.parseEther("0").toString()
        );

        // Alice open another position using 0.1 wbnb
        // once Alice call function `work()` the `reinvest()` wFill be triggered
        // since it's 1 blocks away from the last `work()`, the reward will be 0.1 CAKE
        // --------
        // thus, reward staked in the masterchef will be  0.1 - 0.001 (as a reward) + 0.320086467447799501  = 0.419086467447799501
        // ** actual amount = 0.098999999999785573 + 0.320086467447799501 = 0.419086467447585074 ** (diff due to rounding in PCS MasterChef)
        // --------

        // 90% if reinvest bounty 0.098999999999785573 * 90 / 100 = 0.000899999999999951
        // --------
        // thus, deployer will get a bounty of 0.000899999999999951
        // 10% of 0.001 (0.000099999999999994) will be distributed to the vault by swapping 0.001 FTOKEN into a beneficial vault token (this is scenario, it will be wbnb)
        // --------

        // if 0.077213532551980266 FTOKEN = 1.29593568599362315 WBNB
        // 0.000099999999999994 FTOKEN will be (0.000099999999999994 * 0.9975 * 1.29593568599362315) / (0.077213532551980266  + 0.000099999999999994 * 0.9975) = 0.001672022974719046 WBNB
        // --------
        // Hence, buyback amount should be 0.001427759109023196 + 0.001672022974719046 = 0.003099782083742242 WBNB
        // --------

        // amountOut of 0.1 will be
        // if 1.294263663018907628 WBNB = 0.077313532551980049 FToken
        // 0.1 WBNB will be (0.1 * 0.9975 * 0.077313532551980049) / (1.294263663018907628 + 0.1 * 0.9975) = 0.005532244824171001 FTOKEN
        // Alice's share will be (0.005532244824171001 / 0.419086467447585074) * 0.118020877720068886 = 0.001557961042950235
        // total farming token amount will be 0.419086467447799501 + 0.005532244824171001 = 0.424618712271970502
        const alicePos3Share = ethers.utils.parseEther("0.001557961042950235");
        await integratedVaultAsBob.work(
          0,
          integratedCakeMaxiWorker.address,
          ethers.utils.parseEther("0.1"),
          ethers.utils.parseEther("0"),
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
          ),
          {
            value: ethers.utils.parseEther("0.1"),
          }
        );
        userInfo = await masterChef.userInfo(0, integratedCakeMaxiWorker.address);
        alicePos1Balance = alicePos1Share.mul(userInfo[0]).div(await integratedCakeMaxiWorker.totalShare());
        bobPos2Balance = bobPos2Share.mul(userInfo[0]).div(await integratedCakeMaxiWorker.totalShare());
        let alicePos3Balance = alicePos3Share.mul(userInfo[0]).div(await integratedCakeMaxiWorker.totalShare());
        Assert.assertAlmostEqual(userInfo[0].toString(), ethers.utils.parseEther("0.424618712271970502").toString());
        expect(await integratedCakeMaxiWorker.shares(1)).to.eq(alicePos1Share);
        expect(await integratedCakeMaxiWorker.shares(2)).to.eq(bobPos2Share);
        expect(await integratedCakeMaxiWorker.shares(3)).to.eq(alicePos3Share);
        expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(1))).to.eq(
          alicePos1Balance
        );
        expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(2))).to.eq(
          bobPos2Balance
        );
        expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(3))).to.eq(
          alicePos3Balance
        );
        Assert.assertAlmostEqual(
          (await wbnb.balanceOf(integratedVault.address))
            .sub(ethers.utils.parseEther("1").sub(ethers.utils.parseEther("0.05")))
            .toString(),
          ethers.utils
            .parseEther("0.001431176510697250")
            .add(ethers.utils.parseEther("0.001205378386656404"))
            .toString()
        );
        Assert.assertAlmostEqual(
          (await integratedCakeMaxiWorker.buybackAmount()).toString(),
          ethers.utils.parseEther("0.003099782083742242").toString()
        );
        Assert.assertAlmostEqual(
          (await integratedCakeMaxiWorker.rewardBalance()).toString(),
          ethers.utils.parseEther("0").toString()
        );
      });

      context("when the worker is an older version", async () => {
        context("with upgrade during the flow", async () => {
          it("should reinvest with updated beneficial vault reward to the beneficial vault", async () => {
            await integratedCakeMaxiWorker01.setBeneficialVaultBountyBps(BigNumber.from(BENEFICIALVAULT_BOUNTY_BPS));
            expect(await integratedCakeMaxiWorker01.beneficialVaultBountyBps()).to.eq(
              BigNumber.from(BENEFICIALVAULT_BOUNTY_BPS)
            );
            // alice deposit some portion of her native bnb into a vault, thus interest will be accrued afterward
            await integratedVaultAsAlice.deposit(ethers.utils.parseEther("1"), {
              value: ethers.utils.parseEther("1"),
            });
            // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB (0.05 as principal amount, 0.05 as a loan)
            // amountOut of 0.1 will be
            // if 1WBNB = 0.1 FToken
            // 0.1WBNB will be (0.1 * 0.9975 * 0.1) / (1 + 0.1 * 0.9975) = 0.009070243237099340
            await integratedVaultAsAlice.work(
              0,
              integratedCakeMaxiWorker01.address,
              ethers.utils.parseEther("0.05"),
              ethers.utils.parseEther("0.05"),
              "0", // max return = 0, don't return BTOKEN to the debt
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
              ),
              {
                value: ethers.utils.parseEther("0.05"),
              }
            );
            let userInfo = await masterChef.userInfo(0, integratedCakeMaxiWorker01.address);
            expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.00907024323709934"));
            expect(await integratedCakeMaxiWorker01.shares(1)).to.eq(ethers.utils.parseEther("0.00907024323709934"));
            expect(await integratedCakeMaxiWorker01.shareToBalance(await integratedCakeMaxiWorker01.shares(1))).to.eq(
              ethers.utils.parseEther("0.00907024323709934")
            );

            // Upgrade from CakeMaxiWorker to CakeMaxiWorker02 for optimized reinvest
            const CakeMaxiWorker02 = (await ethers.getContractFactory(
              "CakeMaxiWorker02",
              deployer
            )) as CakeMaxiWorker02__factory;
            const integratedCakeMaxiWorker02 = (await upgrades.upgradeProxy(
              integratedCakeMaxiWorker01.address,
              CakeMaxiWorker02
            )) as CakeMaxiWorker02;
            await integratedCakeMaxiWorker02.deployed();

            expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.00907024323709934"));
            expect(await integratedCakeMaxiWorker02.shares(1)).to.eq(ethers.utils.parseEther("0.00907024323709934"));
            expect(await integratedCakeMaxiWorker02.shareToBalance(await integratedCakeMaxiWorker02.shares(1))).to.eq(
              ethers.utils.parseEther("0.00907024323709934")
            );
            // Alice uses AddBaseTokenOnly strategy to add another 0.1 WBNB
            // once alice call function `work()`, the `reinvest()` won't be triggered yet due to tresaury hasn't been set.
            // since it is 2 blocks away from previous `work()`, so there will be rewards out.
            // 0.1 CAKE/block = 0.1 * 2 = 0.199999999999998096 CAKE.
            // This rewards won't be reinvested. Hence, it should stay in `worker.rewardBalance()`.

            // amountOut of 0.1 from alice will be
            // if 1.1 WBNB = 0.090929756762900660 FToken
            // 0.1 WBNB will be (0.1 * 0.9975 * 0.090929756762900660) /(1.1 + 0.1 * 0.9975)
            // = 0.007560111054052378 FTOKEN
            // thus, the current amount accumulated with the previous one will be 0.007560111054052378 + 0.00907024323709934 = 0.016630354291151718 CAKE
            await integratedVaultAsAlice.work(
              1,
              integratedCakeMaxiWorker02.address,
              ethers.utils.parseEther("0.1"),
              ethers.utils.parseEther("0"),
              "0", // max return = 0, don't return BTOKEN to the debt
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
              ),
              {
                value: ethers.utils.parseEther("0.1"),
              }
            );
            userInfo = await masterChef.userInfo(0, integratedCakeMaxiWorker02.address);
            // after all these steps above, alice will have a balance in total of 0.016630354291151718
            expect(userInfo[0], "expect worker has 0.016630354291151718 CAKE staked in MasterChef").to.eq(
              ethers.utils.parseEther("0.016630354291151718")
            );
            expect(await integratedCakeMaxiWorker02.shares(1), "expect Alice's shares = 0.016630354291151718").to.eq(
              ethers.utils.parseEther("0.016630354291151718")
            );
            expect(
              await cake.balanceOf(DEPLOYER),
              "expect DEPLOYER's CAKE remains 0 as no reinvest happened"
            ).to.be.bignumber.eq(0);
            expect(
              await integratedCakeMaxiWorker02.rewardBalance(),
              "expect worker.rewardBalance is 0.199999999999998096"
            ).to.be.bignumber.eq(ethers.utils.parseEther("0.199999999999998096"));
            expect(
              await integratedCakeMaxiWorker02.shareToBalance(await integratedCakeMaxiWorker02.shares(1)),
              "expect Alice's position#1 balance is 0.016630354291151718 CAKE"
            ).to.eq(ethers.utils.parseEther("0.016630354291151718"));
            Assert.assertAlmostEqual(
              (await wbnb.balanceOf(integratedVault.address))
                .sub(ethers.utils.parseEther("1").sub(ethers.utils.parseEther("0.05")))
                .toString(),
              ethers.utils.parseEther("0").toString()
            );
            expect(
              await integratedCakeMaxiWorker02.buybackAmount(),
              "expect buybackAmount is 0 as no reinvest happened"
            ).to.be.bignumber.eq(0);

            // Eve calls `reinvest()`
            // since it's 1 block away from the last `work()`, there will be 0.099999999999985732 pending CAKE
            // there are also rewards inside `worker.rewardBalance()` =  0.199999999999998096 CAKE
            // hence worker.rewardBalance() + pendingCake = 0.299999999999983828 CAKE
            // total fee will be 0.299999999999983828 * 1% = 0.002999999999999838 CAKE
            // thus, reward staked in the masterchef will be
            // **** 0.299999999999983828 - 0.002999999999999838 (as fees) + 0.016630354291151718 = 0.313630354291135708 CAKE ******
            // **** 10% of 0.002999999999999838 = 0.000299999999999983 will be distributed to the beneficial vault.
            // **** 90% of 0.002999999999999838 = 0.002699999999999855 CAKE
            // **** thus, Eve we get a bounty of 0.002699999999999855 CAKE

            // if (0.090929756762900660 - 0.007560111054052378) CAKE = 1.2  WBNB
            // 0.083369645708848282 CAKE = 1.2 WBNB
            // 0.000299999999999983 will be
            // (0.000299999999999983 * 0.9975 * 1.2) / (0.083369645708848282  + 0.000299999999999983 * 0.9975) = 0.004291917527507221 WBNB
            await integratedCakeMaxiWorker01AsEve.reinvest();
            userInfo = await masterChef.userInfo(0, integratedCakeMaxiWorker02.address);
            expect(userInfo[0], "expect worker staked 0.313630354291135708 CAKE").to.be.eq(
              ethers.utils.parseEther("0.313630354291135708")
            );
            expect(await cake.balanceOf(await eve.getAddress()), "expect Eve's CAKE is 0.002699999999999855").to.be.eq(
              ethers.utils.parseEther("0.002699999999999855")
            );
            expect(
              (await wbnb.balanceOf(integratedVault.address)).sub(
                ethers.utils.parseEther("1").sub(ethers.utils.parseEther("0.05"))
              ),
              "expect WBNB balance in Beneficial Vault increase by 0.004291917527507221"
            ).to.be.eq(ethers.utils.parseEther("0.004291917527507221"));
            expect(await integratedCakeMaxiWorker02.buybackAmount(), "expect worker.buybackAmount is 0").to.be.eq("0");

            // Setting tresaury config
            await integratedCakeMaxiWorker02.setTreasuryConfig(DEPLOYER, REINVEST_BOUNTY_BPS);

            // Bob start opening his position using 0.1 wbnb
            // once bob call function `work()` the `reinvest()` will be triggered
            // since it's 2 blocks away from the last `work()`, the reward will be 0.199999999999743405 CAKE
            // total fee will be 0.199999999999743405 * 1% = 0.001999999999997434 CAKE
            // thus, reward staked in the masterchef will be
            // 0.199999999999743405 - 0.001999999999997434 + 0.313630354291135708 = 0.511630354290881679
            // **** 10% of 0.001999999999997434 = 0.000199999999999743 will be distributed to the beneficial vault.
            // **** 90% of 0.001999999999997434 = 0.001799999999997691 CAKE
            // **** thus, DEPLOYER we get a bounty of 0.001799999999997691 CAKE

            // === Swap CAKE->WBNB to increase amount of WBNB in Beneficial Vault
            // if 0.083669645708848265 CAKE = 1.195708082472492779  WBNB
            // 0.000199999999999743 CAKE will be
            // (0.000199999999999743 * 0.9975 * 1.195708082472492779) / (0.083669645708848265  + 0.000199999999999743 * 0.9975) = 0.002844237418144941 WBNB

            // amountOut of 0.1 will be
            // if 1.192863845054347838 WBNB = 0.083869645708848008 FToken
            // 0.1 WBNB will be (0.1 * 0.9975 * 0.083869645708848008) / (1.192863845054347838 + 0.1 * 0.9975) = 0.006472154999319105
            // bob's share will be (0.006472154999319105 / 0.511630354290881679) * 0.016630354291151718 = 0.000210374989996647
            // total farming token amount will be 0.511630354290881679 + 0.006472154999319105 = 0.518102509290200784
            const bobShare = ethers.utils.parseEther("0.000210374989996647");
            const aliceShare = ethers.utils.parseEther("0.016630354291151718");
            await integratedVaultAsBob.work(
              0,
              integratedCakeMaxiWorker02.address,
              ethers.utils.parseEther("0.1"),
              ethers.utils.parseEther("0"),
              "0", // max return = 0, don't return BTOKEN to the debt
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
              ),
              {
                value: ethers.utils.parseEther("0.1"),
              }
            );
            userInfo = await masterChef.userInfo(0, integratedCakeMaxiWorker02.address);
            const bobBalance = bobShare.mul(userInfo[0]).div(await integratedCakeMaxiWorker02.totalShare());
            const aliceBalance = aliceShare.mul(userInfo[0]).div(await integratedCakeMaxiWorker02.totalShare());
            expect(userInfo[0], "expect worker staked 0.518102509290200784 CAKE").to.eq(
              ethers.utils.parseEther("0.518102509290200784")
            );
            expect(await integratedCakeMaxiWorker02.shares(2), "expect Bob's share is correct").to.eq(bobShare);
            expect(
              await integratedCakeMaxiWorker02.shareToBalance(await integratedCakeMaxiWorker02.shares(2)),
              "expect Bob's balance is correct"
            ).to.eq(bobBalance);
            expect(
              await integratedCakeMaxiWorker02.shareToBalance(await integratedCakeMaxiWorker02.shares(1)),
              "expect Alice's balance is correct"
            ).to.eq(aliceBalance);
            expect(await cake.balanceOf(DEPLOYER), "expect DEPLOYER's CAKE is 0.001799999999997691 CAKE").to.be.eq(
              ethers.utils.parseEther("0.001799999999997691")
            );
            expect(
              (await wbnb.balanceOf(integratedVault.address)).sub(
                ethers.utils.parseEther("1").sub(ethers.utils.parseEther("0.05"))
              ),
              "expect WBNB balance in Beneficial Vault remain 0.004291917527507221 WBNB"
            ).to.be.eq(ethers.utils.parseEther("0.004291917527507221"));
            expect(
              await integratedCakeMaxiWorker02.buybackAmount(),
              "expect buyback amount is 0.002844237418144941"
            ).to.be.eq(ethers.utils.parseEther("0.002844237418144941"));
            expect(await integratedCakeMaxiWorker02.rewardBalance(), "expect reward balance is 0").to.be.eq("0");
          });
        });
      });
    });
  });

  describe("#health()", async () => {
    context("When the worker is not a native", async () => {
      it("should convert CAKE(FarmingToken) back to Base Token with a correct amount out", async () => {
        // Pretend that this transfer statement is from the vault
        await baseTokenAsAlice.transfer(cakeMaxiWorkerNonNative.address, ethers.utils.parseEther("0.1"));
        // Alice uses AddBaseTokenOnly strategy to add 0.1 BASE
        // amountOut of 0.1 will be
        // if 1 BASE = 1 BNB
        // 0.1 BASE will be (0.1 * 0.9975 * 1) / (1 + 0.1 * 0.9975) = 0.09070243237099342 BNB
        // if 1 BNB = 0.1 FTOKEN
        // 0.09070243237099342 BNB = (0.09070243237099342 * 0.9975) * (0.1 / (1 + 0.09070243237099342 * 0.9975)) = 0.008296899991192416 FTOKEN
        await cakeMaxiWorkerNonNativeAsAlice.work(
          0,
          await alice.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNonNativeAsAlice.address);
        expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.008296899991192416"));
        expect(await cakeMaxiWorkerNonNativeAsAlice.shares(0)).to.eq(ethers.utils.parseEther("0.008296899991192416"));
        // if  0.091703100008807584 FTOKEN = 1.090702432370993407 BNB
        // 0.008296899991192416 FTOKEN = (0.008296899991192416 * 0.9975) * (1.090702432370993407 / (0.091703100008807584 + 0.008296899991192416 * 0.9975)) = 0.09028698134165357 BNB
        // if  0.909297567629006593 BNB = 1.1 BaseToken
        // 0.09028698134165357 BNB = (0.09028698134165357 * 0.9975) * (1.1 / (0.909297567629006593 + 0.09028698134165357 * 0.9975)) = 0.09913094991787623
        // thus, calling health should return 0.099130949917876232
        let health = await cakeMaxiWorkerNonNativeAsAlice.health(0);
        expect(health).to.eq(ethers.utils.parseEther("0.099130949917876232"));
      });
    });
    context("When the worker is native", async () => {
      it("should convert CAKE(FarmingToken) back to Base Token with a correct amount out", async () => {
        // Alice transfer 0.1 WBNB to StrategyAddBaseTokenOnly first
        await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
        // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB
        // amountOut of 0.1 will be
        // if 1WBNB = 0.1 FToken
        // 0.1WBNB will be (0.1 * 0.9975 * 0.1) / (1 + 0.1 * 0.9975) = 0.00907024323709934
        await cakeMaxiWorkerNativeAsAlice.work(
          0,
          await alice.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
        expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.00907024323709934"));
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.00907024323709934"));
        // if  0.1  - 0.00907024323709934 FTOKEN = 1.1 BNB
        // if 0.09092975676290066 FTOKEN = 1.1 BNB
        // 0.00907024323709934 FTOKEN = (0.00907024323709934 * 0.9975) * (1.1 / (0.09092975676290066 + 0.00907024323709934 * 0.9975)) = 0.0995458165383035 BNB
        // thus, calling health should return 0.099545816538303460
        let health = await cakeMaxiWorkerNative.health(0);
        expect(health).to.eq(ethers.utils.parseEther("0.099545816538303460"));
      });
    });
  });

  describe("#liquidate()", async () => {
    it("should liquidate a position based on the share of a user", async () => {
      // sending 0.1 wbnb to the worker (let's pretend to be the value from the vault)
      // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB
      // amountOut of 0.1 will be
      // if 1WBNB = 0.1 FToken
      // 0.1WBNB will be (0.1 * 0.9975 * 0.1) / (1 + 0.1 * 0.9975) = 0.009070243237099340
      await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
      const aliceBaseTokenBefore = await wbnb.balanceOf(await alice.getAddress());
      const aliceFarmingTokenBefore = await cake.balanceOf(await alice.getAddress());
      await cakeMaxiWorkerNativeAsAlice.work(
        0,
        await alice.getAddress(),
        0,
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
        )
      );
      let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
      expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.00907024323709934"));
      expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.00907024323709934"));
      Assert.assertAlmostEqual(
        (await integratedCakeMaxiWorker.buybackAmount()).toString(),
        ethers.utils.parseEther("0").toString()
      );
      // Alice call liquidate strategy to close her position
      await cakeMaxiWorkerNativeAsAlice.liquidate(0);
      // alice will get a base token based on 0.00907024323709934 farming token (staked balance)
      // if  0.1  - 0.00907024323709934 FTOKEN = 1.1 BNB
      // if 0.09092975676290066 FTOKEN = 1.1 BNB
      // 0.00907024323709934 FTOKEN = (0.00907024323709934 * 0.9975) * (1.1 / (0.09092975676290066 + 0.00907024323709934 * 0.9975)) = 0.0995458165383035 BNB
      // thus, alice should get a baseToken amount of 0.099545816538303460
      userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address);
      const aliceBaseTokenAfter = await wbnb.balanceOf(await alice.getAddress());
      const aliceFarmingTokenAfter = await cake.balanceOf(await alice.getAddress());
      expect(userInfo[0]).to.eq(ethers.utils.parseEther("0"));
      expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0"));
      Assert.assertAlmostEqual(
        (await cakeMaxiWorkerNative.rewardBalance()).toString(),
        ethers.utils.parseEther("0.1").toString()
      );
      expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.eq(ethers.utils.parseEther("0.099545816538303460"));
      expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.eq(ethers.utils.parseEther("0"));
    });

    context("When integrated with an actual vault", async () => {
      context("when there is buybackAmount left when killing a position", async () => {
        it("should successfully liquidate a certain position without any returning a buybackAmount", async () => {
          await integratedCakeMaxiWorker.setBeneficialVaultBountyBps(BigNumber.from(BENEFICIALVAULT_BOUNTY_BPS));
          expect(await integratedCakeMaxiWorker.beneficialVaultBountyBps()).to.eq(
            BigNumber.from(BENEFICIALVAULT_BOUNTY_BPS)
          );
          // alice deposit some portion of her native bnb into a vault, thus interest will be accrued afterward
          await integratedVaultAsAlice.deposit(ethers.utils.parseEther("1"), {
            value: ethers.utils.parseEther("1"),
          });
          // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB (0.05 as principal amount, 0.05 as a loan)
          // amountOut of 0.1 will be
          // if 1WBNB = 0.1 FToken
          // 0.1WBNB will be (0.1 * 0.9975 * 0.1) / (1 + 0.1 * 0.9975) = 0.009070243237099340
          await integratedVaultAsAlice.work(
            0,
            integratedCakeMaxiWorker.address,
            ethers.utils.parseEther("0.05"),
            ethers.utils.parseEther("0.05"),
            "0", // max return = 0, don't return BTOKEN to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            ),
            {
              value: ethers.utils.parseEther("0.05"),
            }
          );

          let userInfo = await masterChef.userInfo(0, integratedCakeMaxiWorker.address);
          expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.00907024323709934"));
          expect(await integratedCakeMaxiWorker.shares(1)).to.eq(ethers.utils.parseEther("0.00907024323709934"));
          expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(1))).to.eq(
            ethers.utils.parseEther("0.00907024323709934")
          );
          // Alice uses AddBaseTokenOnly strategy to add another 0.1 WBNB
          // once alice call function `work()` the `reinvest()` will be triggered
          // since it's 1 blocks away from the last `work()`, the reward will be 0.1 CAKE
          // total bounty will be 0.1 * 1% = 0.001
          // 90% if reinvest bounty 0.001 * 90 / 100 = 0.0009
          // thus, alice we get a bounty of 0.0018
          // 10% of 0.001 (0.0001) will be distributed to the vault by swapping 0.001 of reward token into a beneficial vault token (this is scenario, it will be wbnb)
          // thus, reward staked in the masterchef will be  0.1 - 0.001 (as a reward) + 0.009070243237099340 = 0.108070243237093908

          // if (0.1 - 0.00907024323709934 ) FToken = 1.1 WBNB
          // 0.090929756762900660 FToken = 1.1 WBNB
          // 0.0001 will be (0.0001 * 0.9975 * 1.1) / (0.090929756762900660  + 0.0001 * 0.9975) = 0.001205378386656404 WBNB

          // amountOut of 0.1 from alice will be
          // if (1.1 - 0.001205378386656404) WBNB = (0.090929756762900660 - 0.0001) FToken
          // if 1.098794621613343596 WBNB = 0.091029756762900654 FToken
          // 0.1 WBNB will be (0.1 * 0.9975 * 0.091029756762900654) /(1.098794621613343596 + 0.1 * 0.9975)
          // = 0.007576036864507046
          // thus, the current amount accumulated with the previous one will be 0.007576036864507046 + 0.108070243237093908 = 0.115646280101600954 CAKE
          await integratedVaultAsAlice.work(
            1,
            integratedCakeMaxiWorker.address,
            ethers.utils.parseEther("0.1"),
            ethers.utils.parseEther("0"),
            "0", // max return = 0, don't return BTOKEN to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            ),
            {
              value: ethers.utils.parseEther("0.1"),
            }
          );
          userInfo = await masterChef.userInfo(0, integratedCakeMaxiWorker.address);
          // after all these steps above, alice will have a balance in total of 0.115646280101600954
          expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.115646280101600954"));
          expect(await integratedCakeMaxiWorker.shares(1)).to.eq(ethers.utils.parseEther("0.115646280101600954"));
          Assert.assertAlmostEqual(
            (await cake.balanceOf(await eve.getAddress())).toString(),
            ethers.utils.parseEther("0.0009").toString()
          );
          Assert.assertAlmostEqual(
            (await integratedCakeMaxiWorker.rewardBalance()).toString(),
            ethers.utils.parseEther("0").toString()
          );
          expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(1))).to.eq(
            ethers.utils.parseEther("0.115646280101600954")
          );
          Assert.assertAlmostEqual(
            (await wbnb.balanceOf(integratedVault.address))
              .sub(ethers.utils.parseEther("1").sub(ethers.utils.parseEther("0.05")))
              .toString(),
            ethers.utils.parseEther("0").toString()
          );
          Assert.assertAlmostEqual(
            (await integratedCakeMaxiWorker.buybackAmount()).toString(),
            ethers.utils.parseEther("0.001205378386656404").toString()
          );
          // Now it's a liquidation part
          await cakeAsAlice.approve(routerV2.address, constants.MaxUint256);
          // alice buy wbnb so that the price will be fluctuated, so that the position can be liquidated
          // swap tokens for exact 0.935 WBNB.
          await routerV2AsAlice.swapTokensForExactETH(
            ethers.utils.parseEther("0.935"),
            constants.MaxUint256,
            [cake.address, wbnb.address],
            await alice.getAddress(),
            FOREVER
          );
          // set interest rate to be 0 to be easy for testing.
          await simpleVaultConfig.setParams(
            MIN_DEBT_SIZE,
            0,
            RESERVE_POOL_BPS,
            KILL_PRIZE_BPS,
            wbnb.address,
            wNativeRelayer.address,
            fairLaunch.address,
            KILL_TREASURY_BPS,
            await deployer.getAddress()
          );
          // pre calculated left, liquidation reward, health
          const toBeLiquidatedValue = await integratedCakeMaxiWorker.health(1);
          const liquidationBounty = toBeLiquidatedValue.mul(1000).div(10000);
          const treasuryKillFees = toBeLiquidatedValue.mul(100).div(10000);
          const totalLiquidationFees = liquidationBounty.add(treasuryKillFees);
          const bobBalanceBefore = await ethers.provider.getBalance(await bob.getAddress());
          const aliceBalanceBefore = await ethers.provider.getBalance(await alice.getAddress());
          const deployerBalanceBefore = await ethers.provider.getBalance(await deployer.getAddress());
          const vaultBalanceBefore = await wbnb.balanceOf(integratedVault.address);
          const debt = await integratedVault.debtShareToVal((await integratedVault.positions(1)).debtShare);
          const left = debt.gte(toBeLiquidatedValue.sub(totalLiquidationFees))
            ? ethers.constants.Zero
            : toBeLiquidatedValue.sub(totalLiquidationFees).sub(debt);
          const repaid = debt.gte(toBeLiquidatedValue.sub(totalLiquidationFees))
            ? toBeLiquidatedValue.sub(totalLiquidationFees)
            : debt;
          // bob call `kill` alice's position, which is position #1
          await integratedVaultAsBob.kill(1, {
            gasPrice: 0,
          });

          const bobBalanceAfter = await ethers.provider.getBalance(await bob.getAddress());
          const aliceBalanceAfter = await ethers.provider.getBalance(await alice.getAddress());
          const vaultBalanceAfter = await wbnb.balanceOf(integratedVault.address);
          const deployerBalanceAfter = await ethers.provider.getBalance(await deployer.getAddress());
          expect(bobBalanceAfter.sub(bobBalanceBefore), "expect Bob to get a correct liquidation bounty").to.eq(
            liquidationBounty
          );
          expect(aliceBalanceAfter.sub(aliceBalanceBefore), "expect Alice to get a correct left amount").to.eq(left);
          expect(vaultBalanceAfter.sub(vaultBalanceBefore), "expect Vault should get its funds back").to.eq(repaid);
          expect(deployerBalanceAfter.sub(deployerBalanceBefore), "expect Deployer should get tresaury fees").to.eq(
            treasuryKillFees
          );
          expect((await integratedVaultAsAlice.positions(1)).debtShare).to.eq(0);
          Assert.assertAlmostEqual(
            (await integratedCakeMaxiWorker.buybackAmount()).toString(),
            ethers.utils.parseEther("0.001205378386656404").toString()
          );
        });
      });
      context("when there is no buybackAmount left when killing a position", async () => {
        it("should successfully liquidate a certain position after all transactions", async () => {
          await integratedCakeMaxiWorker.setBeneficialVaultBountyBps(BigNumber.from(BENEFICIALVAULT_BOUNTY_BPS));
          expect(await integratedCakeMaxiWorker.beneficialVaultBountyBps()).to.eq(
            BigNumber.from(BENEFICIALVAULT_BOUNTY_BPS)
          );
          // alice deposit some portion of her native bnb into a vault, thus interest will be accrued afterward
          await integratedVaultAsAlice.deposit(ethers.utils.parseEther("1"), {
            value: ethers.utils.parseEther("1"),
          });
          // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB (0.05 as principal amount, 0.05 as a loan)
          // amountOut of 0.1 will be
          // if 1WBNB = 0.1 FToken
          // 0.1WBNB will be (0.1 * 0.9975 * 0.1) / (1 + 0.1 * 0.9975) = 0.009070243237099340
          await integratedVaultAsAlice.work(
            0,
            integratedCakeMaxiWorker.address,
            ethers.utils.parseEther("0.05"),
            ethers.utils.parseEther("0.05"),
            "0", // max return = 0, don't return BTOKEN to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            ),
            {
              value: ethers.utils.parseEther("0.05"),
            }
          );

          let userInfo = await masterChef.userInfo(0, integratedCakeMaxiWorker.address);
          expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.00907024323709934"));
          expect(await integratedCakeMaxiWorker.shares(1)).to.eq(ethers.utils.parseEther("0.00907024323709934"));
          expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(1))).to.eq(
            ethers.utils.parseEther("0.00907024323709934")
          );
          // Alice uses AddBaseTokenOnly strategy to add another 0.1 WBNB
          // once alice call function `work()` the `reinvest()` will be triggered
          // since it's 1 blocks away from the last `work()`, the reward will be 0.1 CAKE
          // total bounty will be 0.1 * 1% = 0.001
          // 90% if reinvest bounty 0.001 * 90 / 100 = 0.0009
          // thus, alice we get a bounty of 0.0018
          // 10% of 0.001 (0.0001) will be distributed to the vault by swapping 0.001 of reward token into a beneficial vault token (this is scenario, it will be wbnb)
          // thus, reward staked in the masterchef will be  0.1 - 0.001 (as a reward) + 0.009070243237099340 = 0.108070243237093908

          // if (0.1 - 0.00907024323709934 ) FToken = 1.1 WBNB
          // 0.090929756762900660 FToken = 1.1 WBNB
          // 0.0001 will be (0.0001 * 0.9975 * 1.1) / (0.090929756762900660  + 0.0001 * 0.9975) = 0.001205378386656404 WBNB

          // amountOut of 0.1 from alice will be
          // if (1.1 - 0.001205378386656404) WBNB = (0.090929756762900660 - 0.0001) FToken
          // if 1.098794621613343596 WBNB = 0.091029756762900654 FToken
          // 0.1 WBNB will be (0.1 * 0.9975 * 0.091029756762900654) /(1.098794621613343596 + 0.1 * 0.9975)
          // = 0.007576036864507046
          // thus, the current amount accumulated with the previous one will be 0.007576036864507046 + 0.108070243237093908 = 0.115646280101600954 CAKE
          await integratedVaultAsAlice.work(
            1,
            integratedCakeMaxiWorker.address,
            ethers.utils.parseEther("0.1"),
            ethers.utils.parseEther("0"),
            "0", // max return = 0, don't return BTOKEN to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            ),
            {
              value: ethers.utils.parseEther("0.1"),
            }
          );
          userInfo = await masterChef.userInfo(0, integratedCakeMaxiWorker.address);
          // after all these steps above, alice will have a balance in total of 0.115646280101600954
          expect(userInfo[0]).to.eq(ethers.utils.parseEther("0.115646280101600954"));
          expect(await integratedCakeMaxiWorker.shares(1)).to.eq(ethers.utils.parseEther("0.115646280101600954"));
          Assert.assertAlmostEqual(
            (await cake.balanceOf(await eve.getAddress())).toString(),
            ethers.utils.parseEther("0.0009").toString()
          );
          Assert.assertAlmostEqual(
            (await integratedCakeMaxiWorker.rewardBalance()).toString(),
            ethers.utils.parseEther("0").toString()
          );
          expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(1))).to.eq(
            ethers.utils.parseEther("0.115646280101600954")
          );
          Assert.assertAlmostEqual(
            (await wbnb.balanceOf(integratedVault.address))
              .sub(ethers.utils.parseEther("1").sub(ethers.utils.parseEther("0.05")))
              .toString(),
            ethers.utils.parseEther("0").toString()
          );
          Assert.assertAlmostEqual(
            (await integratedCakeMaxiWorker.buybackAmount()).toString(),
            ethers.utils.parseEther("0.001205378386656404").toString()
          );
          // since it's 1 blocks away from the last `work()`, the reward will be 0.2 CAKE
          // thus, reward staked in the masterchef will be  0.1 - 0.001 (as a reward) + 0.115646280101600954 = 0.214646280101518468
          // total bounty will be 0.1 * 1% = 0.001
          // 90% if reinvest bounty 0.001 * 90 / 100 = 0.0009
          // thus, alice we get a bounty of 0.0027
          // 10% of 0.001 (0.0001) will be distributed to the vault by swapping 0.001 of reward token into a beneficial vault token (this is scenario, it will be wbnb)
          // accumulated reward for alice will be 0.1 - 0.001 + 0.115646280101600954 = 0.21464628010160097 FTOKEN

          // if (0.091029756762900654 - 0.007576036864507046) FToken = 1.198794621613343596  WBNB
          // 0.083453719898393608 FToken = 1.198794621613343596 WBNB
          // 0.0001 will be (0.0001 * 0.9975 * 1.198794621613343596) / (0.083453719898393608 + 0.0001 * 0.9975) = 0.001431176510697250 WBNB

          userInfo = await masterChef.userInfo(0, integratedCakeMaxiWorker.address);
          const beforeVaultTotalToken = await integratedVault.totalToken();
          await integratedCakeMaxiWorkerAsEve.reinvest();
          const afterVaultTotalToken = await integratedVault.totalToken();
          Assert.assertAlmostEqual(
            (await cake.balanceOf(await eve.getAddress())).toString(),
            ethers.utils.parseEther("0.0018").toString()
          );
          Assert.assertAlmostEqual(
            (await wbnb.balanceOf(integratedVault.address))
              .sub(ethers.utils.parseEther("1").sub(ethers.utils.parseEther("0.05")))
              .toString(),
            ethers.utils
              .parseEther("0.001431176510697250")
              .add(ethers.utils.parseEther("0.001205378386656404"))
              .toString()
          );
          Assert.assertAlmostEqual(
            (await integratedCakeMaxiWorker.buybackAmount()).toString(),
            ethers.utils.parseEther("0").toString()
          );
          // Now it's a liquidation part
          await cakeAsAlice.approve(routerV2.address, constants.MaxUint256);
          // alice buy wbnb so that the price will be fluctuated, so that the position can be liquidated
          // swap tokens for exact 0.935 WBNB.
          await routerV2AsAlice.swapTokensForExactETH(
            ethers.utils.parseEther("1"),
            constants.MaxUint256,
            [cake.address, wbnb.address],
            await alice.getAddress(),
            FOREVER
          );

          // set interest rate to be 0 to be easy for testing.
          await simpleVaultConfig.setParams(
            MIN_DEBT_SIZE,
            0,
            RESERVE_POOL_BPS,
            KILL_PRIZE_BPS,
            wbnb.address,
            wNativeRelayer.address,
            fairLaunch.address,
            KILL_TREASURY_BPS,
            await deployer.getAddress()
          );
          // pre calculated left, liquidation reward, health
          const toBeLiquidatedValue = await integratedCakeMaxiWorker.health(1);
          const liquidationBounty = toBeLiquidatedValue.mul(KILL_PRIZE_BPS).div(10000);
          const treasuryKillFees = toBeLiquidatedValue.mul(KILL_TREASURY_BPS).div(10000);
          const totalLiquidationFees = liquidationBounty.add(treasuryKillFees);
          const bobBalanceBefore = await ethers.provider.getBalance(await bob.getAddress());
          const aliceBalanceBefore = await ethers.provider.getBalance(await alice.getAddress());
          const vaultBalanceBefore = await wbnb.balanceOf(integratedVault.address);
          const deployerBalanceBefore = await ethers.provider.getBalance(await deployer.getAddress());
          const vaultDebtVal = await integratedVault.vaultDebtVal();
          const debt = await integratedVault.debtShareToVal((await integratedVault.positions(1)).debtShare);
          const left = debt.gte(toBeLiquidatedValue.sub(totalLiquidationFees))
            ? ethers.constants.Zero
            : toBeLiquidatedValue.sub(totalLiquidationFees).sub(debt);
          // bob call `kill` alice's position, which is position #1
          await integratedVaultAsBob.kill(1, {
            gasPrice: 0,
          });

          const bobBalanceAfter = await ethers.provider.getBalance(await bob.getAddress());
          const aliceBalanceAfter = await ethers.provider.getBalance(await alice.getAddress());
          const vaultBalanceAfter = await wbnb.balanceOf(integratedVault.address);
          const deployerBalanceAfter = await ethers.provider.getBalance(await deployer.getAddress());
          expect(deployerBalanceAfter.sub(deployerBalanceBefore)).to.be.eq(treasuryKillFees);
          expect(bobBalanceAfter.sub(bobBalanceBefore)).to.eq(liquidationBounty); // bob should get liquidation reward
          expect(aliceBalanceAfter.sub(aliceBalanceBefore)).to.eq(left); // alice should get her left back
          expect(vaultBalanceAfter.sub(vaultBalanceBefore)).to.eq(vaultDebtVal); // vault should get it's deposit value back
          expect((await integratedVaultAsAlice.positions(1)).debtShare).to.eq(0);
        });
      });
    });
  });

  describe("#setBeneficialVaultBountyBps", async () => {
    context("When the caller is not an owner", async () => {
      it("should be reverted", async () => {
        await expect(cakeMaxiWorkerNonNativeAsAlice.setBeneficialVaultBountyBps(BigNumber.from("1000"))).to.reverted;
      });
    });
    context("When the _beneficialVaultBountyBps > 10000 (100%)", async () => {
      it("should be reverted", async () => {
        await expect(cakeMaxiWorkerNonNative.setBeneficialVaultBountyBps(BigNumber.from("10001"))).to.revertedWith(
          "CakeMaxiWorker02::setBeneficialVaultBountyBps:: _beneficialVaultBountyBps exceeds 100%"
        );
      });
    });

    context("when the param is correct", async () => {
      it("should successfully set the beneficial vault bounty bps", async () => {
        expect(await cakeMaxiWorkerNonNative.beneficialVaultBountyBps()).to.eq(BigNumber.from("0"));
        await expect(cakeMaxiWorkerNonNative.setBeneficialVaultBountyBps(BigNumber.from("10000"))).not.to.revertedWith(
          "CakeMaxiWorker02::setBeneficialVaultBountyBps:: _beneficialVaultBountyBps exceeds 100%"
        );
        expect(await cakeMaxiWorkerNonNative.beneficialVaultBountyBps()).to.eq(BigNumber.from("10000"));
        await expect(cakeMaxiWorkerNonNative.setBeneficialVaultBountyBps(BigNumber.from("5000"))).not.to.revertedWith(
          "CakeMaxiWorker02::setBeneficialVaultBountyBps:: _beneficialVaultBountyBps exceeds 100%"
        );
        expect(await cakeMaxiWorkerNonNative.beneficialVaultBountyBps()).to.eq(BigNumber.from("5000"));
      });
    });
  });
});
