import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumber, constants, Wallet, BigNumberish } from "ethers";
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
  PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate,
  PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate__factory,
  MockVaultForRestrictedCakeMaxiAddBaseWithFarm,
  MockVaultForRestrictedCakeMaxiAddBaseWithFarm__factory,
  WETH,
  WETH__factory,
  WNativeRelayer__factory,
  WNativeRelayer,
  CakeMaxiWorker02MCV2__factory,
  CakeMaxiWorker02MCV2,
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
  MasterChefV2,
  CakePool,
} from "../../../../../typechain";
import { DeployHelper } from "../../../../helpers/deploy";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { SwapHelper } from "../../../../helpers/swap";
import { Worker02Helper } from "../../../../helpers/worker";
import { assertHelpers } from "../../../../helpers";

chai.use(solidity);
const { expect } = chai;

describe("CakeMaxiWorker02MCV2", () => {
  const FOREVER = "2000000000";
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther("40");
  const CAKE_RATE_TOTAL_PRECISION = BigNumber.from(1e12);
  const CAKE_RATE_TO_SPECIAL_FARM = BigNumber.from(293402777778);
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
  let cakeMaxiWorkerNative: CakeMaxiWorker02MCV2;
  let cakeMaxiWorkerNonNative: CakeMaxiWorker02MCV2;
  let integratedCakeMaxiWorker: CakeMaxiWorker02MCV2;

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
  let stratPartialCloseLiquidate: PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate;
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
  let treasuryAddress: string;

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

  let cakeMaxiWorkerNativeAsAlice: CakeMaxiWorker02MCV2;
  let cakeMaxiWorkerNonNativeAsAlice: CakeMaxiWorker02MCV2;
  let cakeMaxiWorkerNativeAsEve: CakeMaxiWorker02MCV2;
  let cakeMaxiWorkerNonNativeAsEve: CakeMaxiWorker02MCV2;
  let notOperatorCakeMaxiWorker: CakeMaxiWorker02MCV2;
  let integratedVaultAsAlice: Vault;
  let integratedVaultAsBob: Vault;
  let integratedCakeMaxiWorkerAsEve: CakeMaxiWorker02MCV2;

  let wNativeRelayer: WNativeRelayer;

  let swapHelper: SwapHelper;

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
    const PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate",
      deployer
    )) as PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate__factory;
    stratPartialCloseLiquidate = (await upgrades.deployProxy(
      PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate,
      [routerV2.address]
    )) as PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate;
    await stratPartialCloseLiquidate.deployed();
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

    // Deploy MasterChefV2
    const deployHelper = new DeployHelper(deployer);
    [masterChefV2] = await deployHelper.deployPancakeMasterChefV2(masterChef);
    [cakePool] = await deployHelper.deployPancakeCakePool(masterChefV2);

    // Setup Cake Maxi Worker
    const CakeMaxiWorker02MCV2 = (await ethers.getContractFactory(
      "CakeMaxiWorker02MCV2",
      deployer
    )) as CakeMaxiWorker02MCV2__factory;

    cakeMaxiWorkerNative = (await upgrades.deployProxy(CakeMaxiWorker02MCV2, [
      await alice.getAddress(),
      wbnb.address,
      cakePool.address,
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
    ])) as CakeMaxiWorker02MCV2;
    await cakeMaxiWorkerNative.deployed();

    cakeMaxiWorkerNonNative = (await upgrades.deployProxy(CakeMaxiWorker02MCV2, [
      await alice.getAddress(),
      baseToken.address,
      cakePool.address,
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
    ])) as CakeMaxiWorker02MCV2;
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

    // Setup integrated CakeMaxiWorker02MCV2 for integration test
    integratedCakeMaxiWorker = (await upgrades.deployProxy(CakeMaxiWorker02MCV2, [
      integratedVault.address,
      wbnb.address,
      cakePool.address,
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
    ])) as CakeMaxiWorker02MCV2;

    await integratedCakeMaxiWorker.deployed();

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
    await wNativeRelayer.setCallerOk(
      [
        stratMinimize.address,
        stratLiq.address,
        stratAddWithFarm.address,
        stratAdd.address,
        integratedVault.address,
        stratPartialCloseLiquidate.address,
      ],
      true
    );
    await cakeMaxiWorkerNative.setStrategyOk(
      [
        stratAdd.address,
        stratAddWithFarm.address,
        stratLiq.address,
        stratMinimize.address,
        stratPartialCloseLiquidate.address,
      ],
      true
    );
    await cakeMaxiWorkerNative.setReinvestorOk([await eve.getAddress()], true);
    await cakeMaxiWorkerNative.setTreasuryConfig(await eve.getAddress(), REINVEST_BOUNTY_BPS);
    await cakeMaxiWorkerNonNative.setStrategyOk(
      [
        stratAdd.address,
        stratAddWithFarm.address,
        stratLiq.address,
        stratMinimize.address,
        stratPartialCloseLiquidate.address,
      ],
      true
    );
    await cakeMaxiWorkerNonNative.setReinvestorOk([await eve.getAddress()], true);
    await cakeMaxiWorkerNonNative.setTreasuryConfig(await eve.getAddress(), REINVEST_BOUNTY_BPS);
    await integratedCakeMaxiWorker.setStrategyOk(
      [
        stratAdd.address,
        stratAddWithFarm.address,
        stratLiq.address,
        stratMinimize.address,
        stratPartialCloseLiquidate.address,
      ],
      true
    );
    await integratedCakeMaxiWorker.setReinvestorOk([await eve.getAddress()], true);
    await integratedCakeMaxiWorker.setTreasuryConfig(await eve.getAddress(), REINVEST_BOUNTY_BPS);
    treasuryAddress = await eve.getAddress();
    await stratAdd.setWorkersOk(
      [cakeMaxiWorkerNative.address, cakeMaxiWorkerNonNative.address, integratedCakeMaxiWorker.address],
      true
    );
    await stratAddWithFarm.setWorkersOk(
      [cakeMaxiWorkerNative.address, cakeMaxiWorkerNonNative.address, integratedCakeMaxiWorker.address],
      true
    );
    await stratLiq.setWorkersOk(
      [cakeMaxiWorkerNative.address, cakeMaxiWorkerNonNative.address, integratedCakeMaxiWorker.address],
      true
    );
    await stratMinimize.setWorkersOk(
      [cakeMaxiWorkerNative.address, cakeMaxiWorkerNonNative.address, integratedCakeMaxiWorker.address],
      true
    );
    await stratEvil.setWorkersOk(
      [cakeMaxiWorkerNative.address, cakeMaxiWorkerNonNative.address, integratedCakeMaxiWorker.address],
      true
    );
    await stratPartialCloseLiquidate.setWorkersOk(
      [cakeMaxiWorkerNative.address, cakeMaxiWorkerNonNative.address, integratedCakeMaxiWorker.address],
      true
    );
    await cakePool.setWithdrawFeeUser(cakeMaxiWorkerNative.address, true);
    await cakePool.setWithdrawFeeUser(cakeMaxiWorkerNonNative.address, true);
    await cakePool.setWithdrawFeeUser(integratedCakeMaxiWorker.address, true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);
    cakeAsAlice = MockERC20__factory.connect(cake.address, alice);
    wbnbTokenAsAlice = WETH__factory.connect(wbnb.address, alice);
    wbnbTokenAsBob = WETH__factory.connect(wbnb.address, bob);
    routerV2AsAlice = PancakeRouterV2__factory.connect(routerV2.address, alice);
    cakeMaxiWorkerNativeAsAlice = CakeMaxiWorker02MCV2__factory.connect(cakeMaxiWorkerNative.address, alice);
    cakeMaxiWorkerNonNativeAsAlice = CakeMaxiWorker02MCV2__factory.connect(cakeMaxiWorkerNonNative.address, alice);
    cakeMaxiWorkerNativeAsEve = CakeMaxiWorker02MCV2__factory.connect(cakeMaxiWorkerNative.address, eve);
    cakeMaxiWorkerNonNativeAsEve = CakeMaxiWorker02MCV2__factory.connect(cakeMaxiWorkerNonNative.address, eve);
    notOperatorCakeMaxiWorker = CakeMaxiWorker02MCV2__factory.connect(cakeMaxiWorkerNative.address, bob);
    integratedVaultAsAlice = Vault__factory.connect(integratedVault.address, alice);
    integratedVaultAsBob = Vault__factory.connect(integratedVault.address, bob);
    integratedCakeMaxiWorkerAsEve = CakeMaxiWorker02MCV2__factory.connect(integratedCakeMaxiWorker.address, eve);

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

    swapHelper = new SwapHelper(factoryV2.address, routerV2.address, "9975", "10000", deployer);
  }

  async function getUserCakeStakedBalance(userAddress: string): Promise<BigNumber> {
    const userInfo = await cakePool.userInfo(userAddress);
    return userInfo.shares.mul(await cakePool.getPricePerFullShare()).div(ethers.utils.parseEther("1"));
  }

  function computeBalanceToShare(
    balance: BigNumberish,
    totalShare: BigNumberish,
    totalBalance: BigNumberish
  ): BigNumber {
    const balanceBN = BigNumber.from(balance);
    const totalShareBN = BigNumber.from(totalShare);

    if (totalShareBN.eq(0)) return balanceBN;

    return balanceBN.mul(totalShareBN).div(totalBalance);
  }

  function computeShareToBalance(share: BigNumberish, totalShare: BigNumberish, totalBalance: BigNumberish): BigNumber {
    const shareBN = BigNumber.from(share);
    const totalShareBN = BigNumber.from(totalShare);

    if (totalShareBN.eq(0)) return shareBN;

    return shareBN.mul(totalBalance).div(totalShareBN);
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
        ).to.revertedWith("CakeMaxiWorker02MCV2::setTreasuryConfig:: _treasuryBountyBps exceeded maxReinvestBountyBps");
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
        "CakeMaxiWorker02MCV2::setMaxReinvestBountyBps:: _maxReinvestBountyBps exceeded 30%"
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
        ).to.revertedWith("CakeMaxiWorker02MCV2::onlyOperator:: not operator");
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
        ).to.revertedWith("CakeMaxiWorker02MCV2::work:: unapproved work strategy");
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
        ).to.revertedWith("CakeMaxiWorker02MCV2::work:: unapproved work strategy");
      });
    });

    context("When the treasury Account and treasury bounty bps haven't been set", async () => {
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

        const treasuryBalanceBefore = await cake.balanceOf(treasuryAddress);

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

        const treasuryBalanceAfter = await cake.balanceOf(treasuryAddress);

        expect(
          treasuryBalanceAfter,
          "Treasury should not receive any CAKE, because reinvest should not happen."
        ).to.be.eq(treasuryBalanceBefore);
        expect(await cakeMaxiWorkerNativeAsAlice.accumulatedBounty(), "`accumulatedBounty` should be zero.").to.be.eq(
          0
        );
        expect(await cakeMaxiWorkerNative.shares(0), "Alice's Position#1 share will stay the same.").to.eq(
          ethers.utils.parseEther("0.00907024323709934")
        );
        expect(
          await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0)),
          "Total balance will grow from MasterChefV2 auto-compound."
        ).to.gt(ethers.utils.parseEther("0.00907024323709934"));
      });
    });

    context("When the user passes addBaseToken strategy", async () => {
      it("should convert an input base token to a farming token and stake to the masterchef", async () => {
        let shares: Record<number, BigNumber> = [];
        let totalShare: BigNumber = ethers.constants.Zero;
        let totalBalance: BigNumber = ethers.constants.Zero;
        let totalReinvestFee: BigNumber = ethers.constants.Zero;
        const path = await cakeMaxiWorkerNative.getPath();
        const performanceFee = await cakePool.performanceFeeContract();

        await swapHelper.loadReserves(path);

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

        // --- Compute ---
        let amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
        shares[0] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
        totalShare = totalShare.add(shares[0]);
        totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

        expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
          amtsOut[amtsOut.length - 1]
        );

        await swapHelper.loadReserves(path);

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

        // --- Compute ---
        // Put it as 1 wei because CakePool stake 1 wei to MCv2
        let cakeEarned = swapHelper.computeTotalRewards(
          1,
          CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
          2,
          ethers.constants.WeiPerEther
        );
        // Apply performance fee
        cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
        // Apply reinvest fee
        let reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
        cakeEarned = cakeEarned.sub(reinvestFee);
        totalBalance = totalBalance.add(cakeEarned);
        // Compute swap
        amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
        totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
        // Compute share
        // Because of removeShare makes totalShare = 0, so addShare given the balance == share
        shares[0] = totalBalance;
        totalShare = totalBalance;
        totalReinvestFee = totalReinvestFee.add(reinvestFee);

        expect(await getUserCakeStakedBalance(cakeMaxiWorkerNativeAsAlice.address)).to.be.eq(totalBalance);
        expect(await cakeMaxiWorkerNative.shares(0)).to.be.eq(shares[0]);
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.be.eq(totalBalance);
        expect(await cake.balanceOf(await eve.getAddress())).to.be.eq(totalReinvestFee);
        expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq(0);
        expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.eq(0);

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

        // --- Compute ---
        cakeEarned = swapHelper.computeTotalRewards(
          1,
          CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
          2,
          ethers.constants.WeiPerEther
        );
        // Apply performance fee
        cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
        // Apply reinvest fee
        reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
        cakeEarned = cakeEarned.sub(reinvestFee);
        totalBalance = totalBalance.add(cakeEarned);
        // Compute swap
        amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
        // Compute share
        // shares[0] remains the same, calculate shares[1]
        // Update individual share & total share
        shares[1] = computeBalanceToShare(amtsOut[amtsOut.length - 1], totalShare, totalBalance);
        totalShare = totalShare.add(shares[1]);
        // Deposit back to CakePool
        totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
        totalReinvestFee = totalReinvestFee.add(reinvestFee);

        expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
          computeShareToBalance(shares[0], totalShare, totalBalance)
        );
        expect(await cakeMaxiWorkerNative.shares(1)).to.eq(shares[1]);
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(1))).to.eq(
          computeShareToBalance(shares[1], totalShare, totalBalance)
        );
        expect(await cake.balanceOf(await eve.getAddress())).to.eq(totalReinvestFee);
        expect(await cakeMaxiWorkerNative.rewardBalance()).to.eq(0);
        expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.eq(0);
      });
    });

    context("When the user passes addBaseWithFarm strategy", async () => {
      it("should convert an input as a base token with some farming token and stake to the masterchef", async () => {
        let shares: Record<number, BigNumber> = [];
        let totalShare: BigNumber = ethers.constants.Zero;
        let totalBalance: BigNumber = ethers.constants.Zero;
        let totalReinvestFee: BigNumber = ethers.constants.Zero;
        const path = await cakeMaxiWorkerNative.getPath();
        const performanceFee = await cakePool.performanceFeeContract();

        await swapHelper.loadReserves(path);

        // Alice transfer 0.1 WBNB to StrategyAddBaseWithFarm first
        await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
        await cakeMaxiWorkerNativeAsAlice.work(
          0,
          await alice.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAddWithFarm.address, ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], ["0", "0"])]
          )
        );

        // --- Compute ---
        let amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
        shares[0] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
        totalShare = totalShare.add(shares[0]);
        totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

        expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
          amtsOut[amtsOut.length - 1]
        );

        await swapHelper.loadReserves(path);

        let cakeAmount = ethers.utils.parseEther("0.04");
        await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
        await cakeAsAlice.approve(mockedVault.address, cakeAmount);
        await cakeMaxiWorkerNativeAsAlice.work(
          0,
          await alice.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAddWithFarm.address, ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [cakeAmount, "0"])]
          )
        );

        // --- Compute ---
        // Put it as 1 wei because CakePool stake 1 wei to MCv2
        let cakeEarned = swapHelper.computeTotalRewards(
          1,
          CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
          3,
          ethers.constants.WeiPerEther
        );
        // Apply performance fee
        cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
        // Apply reinvest fee
        let reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
        cakeEarned = cakeEarned.sub(reinvestFee);
        totalBalance = totalBalance.add(cakeEarned);
        // Compute swap
        amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
        totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]).add(cakeAmount);
        // Compute share
        // Because of removeShare makes totalShare = 0, so addShare given the balance == share
        shares[0] = totalBalance;
        totalShare = totalBalance;
        totalReinvestFee = totalReinvestFee.add(reinvestFee);

        expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(totalBalance);
        expect(await cake.balanceOf(await eve.getAddress())).to.eq(totalReinvestFee);
        expect(await cakeMaxiWorkerNative.rewardBalance()).to.eq(0);
        expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.eq(0);

        cakeAmount = ethers.utils.parseEther("0.05");
        await wbnbTokenAsBob.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
        await cakeAsAlice.approve(mockedVault.address, cakeAmount);
        await cakeMaxiWorkerNativeAsAlice.work(
          1,
          await bob.getAddress(),
          0,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratAddWithFarm.address, ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [cakeAmount, "0"])]
          )
        );

        // --- Compute ---
        cakeEarned = swapHelper.computeTotalRewards(
          1,
          CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
          3,
          ethers.constants.WeiPerEther
        );
        // Apply performance fee
        cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
        // Apply reinvest fee
        reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
        cakeEarned = cakeEarned.sub(reinvestFee);
        totalBalance = totalBalance.add(cakeEarned);
        // Compute swap
        amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
        // Compute share
        // shares[0] remains the same, calculate shares[1]
        // Update individual share & total share
        shares[1] = computeBalanceToShare(amtsOut[amtsOut.length - 1].add(cakeAmount), totalShare, totalBalance);
        totalShare = totalShare.add(shares[1]);
        // Deposit back to CakePool
        totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1].add(cakeAmount));
        totalReinvestFee = totalReinvestFee.add(reinvestFee);

        expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
          computeShareToBalance(shares[0], totalShare, totalBalance)
        );
        expect(await cakeMaxiWorkerNative.shares(1)).to.eq(shares[1]);
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(1))).to.eq(
          computeShareToBalance(shares[1], totalShare, totalBalance)
        );
        expect(await cake.balanceOf(await eve.getAddress())).to.eq(totalReinvestFee);
        expect(await cakeMaxiWorkerNative.rewardBalance()).to.eq(0);
        expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.eq(0);
      });
    });

    context("When the user passes liquidation strategy to close the position", async () => {
      context("When alice opened and closed her position", async () => {
        it("should liquidate a position based on the share of a user", async () => {
          let shares: Record<number, BigNumber> = [];
          let totalShare: BigNumber = ethers.constants.Zero;
          let totalBalance: BigNumber = ethers.constants.Zero;
          let totalReinvestFee: BigNumber = ethers.constants.Zero;
          const [path, reversePath] = await Promise.all([
            cakeMaxiWorkerNative.getPath(),
            cakeMaxiWorkerNative.getReversedPath(),
          ]);
          const performanceFee = await cakePool.performanceFeeContract();

          await swapHelper.loadReserves(path);

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

          // --- Compute ---
          let amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
          shares[0] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
          totalShare = totalShare.add(shares[0]);
          totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

          expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
          expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
            amtsOut[amtsOut.length - 1]
          );

          await swapHelper.loadReserves(reversePath);

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

          // --- Compute ---
          // Put it as 1 wei because CakePool stake 1 wei to MCv2
          let cakeEarned = swapHelper.computeTotalRewards(
            1,
            CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
            1,
            ethers.constants.WeiPerEther
          );
          // Apply performance fee
          cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
          // Apply reinvest fee
          let reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
          totalReinvestFee = totalReinvestFee.add(reinvestFee);
          cakeEarned = cakeEarned.sub(reinvestFee);
          totalBalance = totalBalance.add(cakeEarned);
          // Compute liquidate
          amtsOut = await swapHelper.computeSwapExactTokensForTokens(totalBalance, reversePath, true);
          // Compute accounting
          shares[0] = ethers.constants.Zero;
          totalShare = ethers.constants.Zero;
          totalBalance = ethers.constants.Zero;

          const aliceBaseTokenAfter = await wbnb.balanceOf(await alice.getAddress());
          const aliceFarmingTokenAfter = await cake.balanceOf(await alice.getAddress());
          expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
          expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
          expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq("0");
          expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.eq("0");
          expect(await cake.balanceOf(eveAddress)).to.be.eq(totalReinvestFee);
          expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.be.eq(amtsOut[amtsOut.length - 1]);
          expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.eq(ethers.utils.parseEther("0"));
        });
      });

      context("When alice closed her position after bob open his position", async () => {
        it("should liquidate a position based on the share of a user", async () => {
          let shares: Record<number, BigNumber> = [];
          let totalShare: BigNumber = ethers.constants.Zero;
          let totalBalance: BigNumber = ethers.constants.Zero;
          let totalReinvestFee: BigNumber = ethers.constants.Zero;
          const [path, reversePath] = await Promise.all([
            cakeMaxiWorkerNative.getPath(),
            cakeMaxiWorkerNative.getReversedPath(),
          ]);
          const performanceFee = await cakePool.performanceFeeContract();

          await swapHelper.loadReserves(path);

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

          // --- Compute ---
          let amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
          shares[0] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
          totalShare = totalShare.add(shares[0]);
          totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

          expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
          expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
            amtsOut[amtsOut.length - 1]
          );

          await swapHelper.loadReserves(path);

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

          // --- Compute ---
          let cakeEarned = swapHelper.computeTotalRewards(
            1,
            CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
            2,
            ethers.constants.WeiPerEther
          );
          // Apply performance fee
          cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
          // Apply reinvest fee
          let reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
          cakeEarned = cakeEarned.sub(reinvestFee);
          totalBalance = totalBalance.add(cakeEarned);
          // Compute swap
          amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
          // Compute share
          // shares[0] remains the same, calculate shares[1]
          // Update individual share & total share
          shares[1] = computeBalanceToShare(amtsOut[amtsOut.length - 1], totalShare, totalBalance);
          totalShare = totalShare.add(shares[1]);
          // Deposit back to CakePool
          totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
          totalReinvestFee = totalReinvestFee.add(reinvestFee);

          expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
          expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
          expect(await cakeMaxiWorkerNative.shares(1)).to.eq(shares[1]);
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
            computeShareToBalance(shares[0], totalShare, totalBalance)
          );
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(1))).to.eq(
            computeShareToBalance(shares[1], totalShare, totalBalance)
          );
          expect(await cake.balanceOf(eveAddress)).to.be.eq(totalReinvestFee);

          await swapHelper.loadReserves(reversePath);

          const aliceBaseTokenBefore = await wbnb.balanceOf(aliceAddress);
          const aliceFarmingTokenBefore = await cake.balanceOf(aliceAddress);

          // Alice call liquidate strategy to close her position
          // once alice call function `work()` the `reinvest()` will be triggered
          await cakeMaxiWorkerNativeAsAlice.work(
            0,
            aliceAddress,
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratLiq.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            )
          );

          // --- Compute ---
          // Put it as 1 wei because CakePool stake 1 wei to MCv2
          cakeEarned = swapHelper.computeTotalRewards(
            1,
            CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
            1,
            ethers.constants.WeiPerEther
          );
          // Apply performance fee
          cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
          // Apply reinvest fee
          reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
          totalReinvestFee = totalReinvestFee.add(reinvestFee);
          cakeEarned = cakeEarned.sub(reinvestFee);
          totalBalance = totalBalance.add(cakeEarned);
          // Compute liquidate
          const cakeLiquidate = computeShareToBalance(shares[0], totalShare, totalBalance);
          amtsOut = await swapHelper.computeSwapExactTokensForTokens(cakeLiquidate, reversePath, true);
          // Compute accounting
          totalShare = totalShare.sub(shares[0]);
          shares[0] = ethers.constants.Zero;
          totalBalance = totalBalance.sub(cakeLiquidate);

          const aliceBaseTokenAfter = await wbnb.balanceOf(await alice.getAddress());
          const aliceFarmingTokenAfter = await cake.balanceOf(await alice.getAddress());

          // only bobs' left
          expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
          expect(await cakeMaxiWorkerNative.shares(0)).to.eq(0);
          // bob's position should remain the same
          expect(await cakeMaxiWorkerNative.shares(1)).to.eq(shares[1]);
          expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq(0);
          expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.eq(amtsOut[amtsOut.length - 1]);
          expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.eq(0);
        });
      });
    });

    context("When the user passes close minimize trading strategy to close the position", async () => {
      it("should send a base token to be enough for repaying the debt, the rest will be sent as a farming token", async () => {
        let shares: Record<number, BigNumber> = [];
        let totalShare: BigNumber = ethers.constants.Zero;
        let totalBalance: BigNumber = ethers.constants.Zero;
        let totalReinvestFee: BigNumber = ethers.constants.Zero;
        const [path, reversePath] = await Promise.all([
          cakeMaxiWorkerNative.getPath(),
          cakeMaxiWorkerNative.getReversedPath(),
        ]);
        const performanceFee = await cakePool.performanceFeeContract();

        await swapHelper.loadReserves(path);

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

        // --- Compute ---
        let amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
        shares[0] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
        totalShare = totalShare.add(shares[0]);
        totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

        expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
          amtsOut[amtsOut.length - 1]
        );

        await swapHelper.loadReserves(reversePath);

        const aliceBaseTokenBefore = await wbnb.balanceOf(await alice.getAddress());
        const aliceFarmingTokenBefore = await cake.balanceOf(await alice.getAddress());

        // Alice call withdraw minimize trading strategy to close her position
        // once alice call function `work()` the `reinvest()` will be triggered
        await cakeMaxiWorkerNativeAsAlice.work(
          0,
          await alice.getAddress(),
          ethers.utils.parseEther("0.05"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratMinimize.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
          )
        );

        // --- Compute ---
        // Put it as 1 wei because CakePool stake 1 wei to MCv2
        let cakeEarned = swapHelper.computeTotalRewards(
          1,
          CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
          1,
          ethers.constants.WeiPerEther
        );
        // Apply performance fee
        cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
        // Apply reinvest fee
        let reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
        totalReinvestFee = totalReinvestFee.add(reinvestFee);
        cakeEarned = cakeEarned.sub(reinvestFee);
        totalBalance = totalBalance.add(cakeEarned);
        // Compute liquidate
        const cakePos0 = computeShareToBalance(shares[0], totalShare, totalBalance);
        amtsOut = await swapHelper.computeSwapTokensForExactTokens(ethers.utils.parseEther("0.05"), path, true);
        // Compute accounting
        totalShare = totalShare.sub(shares[0]);
        shares[0] = ethers.constants.Zero;
        totalBalance = ethers.constants.Zero;

        const aliceBaseTokenAfter = await wbnb.balanceOf(await alice.getAddress());
        const aliceFarmingTokenAfter = await cake.balanceOf(await alice.getAddress());
        expect(await cake.balanceOf(eveAddress)).to.be.eq(totalReinvestFee);
        expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(0);
        expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq(0);
        expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.eq(ethers.utils.parseEther("0.05"));
        expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.eq(cakePos0.sub(amtsOut[0]));
      });
    });
  });

  describe("#reinvest()", async () => {
    context("When the caller is not a reinvestor", async () => {
      it("should be reverted", async () => {
        await expect(cakeMaxiWorkerNativeAsAlice.reinvest()).to.revertedWith(
          "CakeMaxiWorker02MCV2::onlyReinvestor:: not reinvestor"
        );
      });
    });

    context("When the reinvestor reinvest in the middle of a transaction set", async () => {
      context("When beneficialVaultBounty takes 0% of reinvest bounty", async () => {
        it("should increase the size of total balance, bounty is sent to the reinvestor", async () => {
          let shares: Record<number, BigNumber> = [];
          let totalShare: BigNumber = ethers.constants.Zero;
          let totalBalance: BigNumber = ethers.constants.Zero;
          let totalReinvestFee: BigNumber = ethers.constants.Zero;
          const [path, reversePath] = await Promise.all([
            cakeMaxiWorkerNative.getPath(),
            cakeMaxiWorkerNative.getReversedPath(),
          ]);
          const performanceFee = await cakePool.performanceFeeContract();

          await swapHelper.loadReserves(path);

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

          // --- Compute ---
          let amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
          shares[0] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
          totalShare = totalShare.add(shares[0]);
          totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

          expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
          expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
            amtsOut[amtsOut.length - 1]
          );

          await swapHelper.loadReserves(path);

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

          // --- Compute ---
          // Put it as 1 wei because CakePool stake 1 wei to MCv2
          let cakeEarned = swapHelper.computeTotalRewards(
            1,
            CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
            2,
            ethers.constants.WeiPerEther
          );
          // Apply performance fee
          cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
          // Apply reinvest fee
          let reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
          cakeEarned = cakeEarned.sub(reinvestFee);
          totalBalance = totalBalance.add(cakeEarned);
          // Compute swap
          amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
          totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
          // Compute share
          // Because of removeShare makes totalShare = 0, so addShare given the balance == share
          shares[0] = totalBalance;
          totalShare = totalBalance;
          totalReinvestFee = totalReinvestFee.add(reinvestFee);

          expect(await getUserCakeStakedBalance(cakeMaxiWorkerNativeAsAlice.address)).to.be.eq(totalBalance);
          expect(await cakeMaxiWorkerNative.shares(0)).to.be.eq(shares[0]);
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.be.eq(
            totalBalance
          );
          expect(await cake.balanceOf(await eve.getAddress())).to.be.eq(totalReinvestFee);
          expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq(0);
          expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.eq(0);

          // reinvest.. the size of the reward should be 1 (blocks) * 0.1 FToken (CAKE)
          await cakeMaxiWorkerNativeAsEve.reinvest();

          // --- Compute ---
          // Put it as 1 wei because CakePool stake 1 wei to MCv2
          cakeEarned = swapHelper.computeTotalRewards(
            1,
            CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
            1,
            ethers.constants.WeiPerEther
          );
          // Apply performance fee
          cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
          // Apply reinvest fee
          reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
          cakeEarned = cakeEarned.sub(reinvestFee);
          totalBalance = totalBalance.add(cakeEarned);
          totalReinvestFee = totalReinvestFee.add(reinvestFee);

          expect(await cake.balanceOf(eveAddress)).to.be.eq(totalReinvestFee);
          expect(await alpaca.balanceOf(mockedBeneficialVault.address)).to.be.eq(0);

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

          // --- Compute ---
          cakeEarned = swapHelper.computeTotalRewards(
            1,
            CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
            2,
            ethers.constants.WeiPerEther
          );
          // Apply performance fee
          cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
          // Apply reinvest fee
          reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
          cakeEarned = cakeEarned.sub(reinvestFee);
          totalBalance = totalBalance.add(cakeEarned);
          // Compute swap
          amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
          // Compute share
          // shares[0] remains the same, calculate shares[1]
          // Update individual share & total share
          shares[1] = computeBalanceToShare(amtsOut[amtsOut.length - 1], totalShare, totalBalance);
          totalShare = totalShare.add(shares[1]);
          // Deposit back to CakePool
          totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
          totalReinvestFee = totalReinvestFee.add(reinvestFee);

          expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
          expect(await cakeMaxiWorkerNative.shares(1)).to.eq(shares[1]);
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(1))).to.eq(
            computeShareToBalance(shares[1], totalShare, totalBalance)
          );
          expect(await cakeMaxiWorkerNative.shares(0)).to.be.eq(shares[0]);
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.be.eq(
            computeShareToBalance(shares[0], totalShare, totalBalance)
          );
          expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq(0);
        });

        context("When bounty is below reinvestThreshold", async () => {
          it("should not withdraw bounty and keep track of the accumulated bounty correctly", async () => {
            let shares: Record<number, BigNumber> = [];
            let totalShare: BigNumber = ethers.constants.Zero;
            let totalBalance: BigNumber = ethers.constants.Zero;
            let totalReinvestFee: BigNumber = ethers.constants.Zero;
            const path = await cakeMaxiWorkerNative.getPath();
            const performanceFee = await cakePool.performanceFeeContract();

            // Set reinvestThreshold to 1 CAKE
            await cakeMaxiWorkerNative.setReinvestConfig(REINVEST_BOUNTY_BPS, ethers.utils.parseEther("1"));

            await swapHelper.loadReserves(path);

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

            // --- Compute ---
            let amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
            shares[0] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
            totalShare = totalShare.add(shares[0]);
            totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

            expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
            expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
            expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
              amtsOut[amtsOut.length - 1]
            );

            await swapHelper.loadReserves(path);

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

            // --- Compute ---
            // Put it as 1 wei because CakePool stake 1 wei to MCv2
            let cakeEarned = swapHelper.computeTotalRewards(
              1,
              CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
              2,
              ethers.constants.WeiPerEther
            );
            // Apply performance fee
            cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
            // Apply reinvest fee
            let reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
            cakeEarned = cakeEarned.sub(reinvestFee);
            totalBalance = totalBalance.add(cakeEarned);
            // Compute swap
            amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
            totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
            // Compute share
            // Because of removeShare makes totalShare = 0, so addShare given the balance == share
            shares[0] = totalBalance;
            totalShare = totalBalance;
            totalReinvestFee = totalReinvestFee.add(reinvestFee);

            // after all these steps above, alice will have a balance and share in total of 11.896630354291151718 + 0.12 (accumulatedBounty)
            expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.be.eq(
              totalBalance.add(reinvestFee)
            );
            expect(await cakeMaxiWorkerNative.shares(0)).to.be.eq(shares[0]);
            expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.be.eq(
              computeBalanceToShare(shares[0], totalShare, totalBalance)
            );
            expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq(0);
            expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.eq(reinvestFee);
          });
        });

        context("When bounty is below reinvestThreshold, but reinvestor trigger reinvest", async () => {
          it("should not withdraw bounty and keep track of the accumulated bounty correctly", async () => {
            let shares: Record<number, BigNumber> = [];
            let totalShare: BigNumber = ethers.constants.Zero;
            let totalBalance: BigNumber = ethers.constants.Zero;
            let totalReinvestFee: BigNumber = ethers.constants.Zero;
            const path = await cakeMaxiWorkerNative.getPath();
            const performanceFee = await cakePool.performanceFeeContract();

            // Set reinvestThreshold to 1 CAKE
            await cakeMaxiWorkerNative.setReinvestConfig(REINVEST_BOUNTY_BPS, ethers.utils.parseEther("1"));

            await swapHelper.loadReserves(path);

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

            // --- Compute ---
            let amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
            shares[0] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
            totalShare = totalShare.add(shares[0]);
            totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

            expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
            expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
            expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
              amtsOut[amtsOut.length - 1]
            );

            await swapHelper.loadReserves(path);

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

            // --- Compute ---
            // Put it as 1 wei because CakePool stake 1 wei to MCv2
            let cakeEarned = swapHelper.computeTotalRewards(
              1,
              CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
              2,
              ethers.constants.WeiPerEther
            );
            // Apply performance fee
            cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
            // Apply reinvest fee
            let reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
            cakeEarned = cakeEarned.sub(reinvestFee);
            totalBalance = totalBalance.add(cakeEarned);
            // Compute swap
            amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
            totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
            // Compute share
            // Because of removeShare makes totalShare = 0, so addShare given the balance == share
            shares[0] = totalBalance;
            totalShare = totalBalance;
            totalReinvestFee = totalReinvestFee.add(reinvestFee);

            // after all these steps above, alice will have a balance and share in total of 11.896630354291151718 + 0.12 (accumulatedBounty)
            expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.be.eq(
              totalBalance.add(reinvestFee)
            );
            expect(await cakeMaxiWorkerNative.shares(0)).to.be.eq(shares[0]);
            expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.be.eq(
              computeBalanceToShare(shares[0], totalShare, totalBalance)
            );
            expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq(0);
            expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.eq(reinvestFee);

            // reinvest.. the size of the reward should be 1 (blocks) * 0.1 FToken (CAKE)
            await cakeMaxiWorkerNativeAsEve.reinvest();

            // --- Compute ---
            // Put it as 1 wei because CakePool stake 1 wei to MCv2
            cakeEarned = swapHelper.computeTotalRewards(
              1,
              CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
              1,
              ethers.constants.WeiPerEther
            );
            // Apply performance fee
            cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
            // Apply reinvest fee
            reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
            cakeEarned = cakeEarned.sub(reinvestFee);
            totalBalance = totalBalance.add(cakeEarned);
            totalReinvestFee = totalReinvestFee.add(reinvestFee);

            expect(await cake.balanceOf(eveAddress)).to.be.eq(totalReinvestFee);
            expect(await alpaca.balanceOf(mockedBeneficialVault.address)).to.be.eq(0);
            expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.eq(0);

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

            // --- Compute ---
            cakeEarned = swapHelper.computeTotalRewards(
              1,
              CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
              2,
              ethers.constants.WeiPerEther
            );
            // Apply performance fee
            cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
            // Apply reinvest fee
            reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
            cakeEarned = cakeEarned.sub(reinvestFee);
            totalBalance = totalBalance.add(cakeEarned);
            // Compute swap
            amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
            // Compute share
            // shares[0] remains the same, calculate shares[1]
            // Update individual share & total share
            shares[1] = computeBalanceToShare(amtsOut[amtsOut.length - 1], totalShare, totalBalance);
            totalShare = totalShare.add(shares[1]);
            // Deposit back to CakePool
            totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
            totalReinvestFee = totalReinvestFee.add(reinvestFee);

            expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance.add(reinvestFee));
            expect(await cakeMaxiWorkerNative.shares(1)).to.eq(shares[1]);
            expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(1))).to.eq(
              computeShareToBalance(shares[1], totalShare, totalBalance)
            );
            expect(await cakeMaxiWorkerNative.shares(0)).to.be.eq(shares[0]);
            expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.be.eq(
              computeShareToBalance(shares[0], totalShare, totalBalance)
            );
            expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq(0);
            expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.eq(reinvestFee);
          });
        });

        context(
          "When bounty is below reinvestThreshold, but reinvestor trigger reinvest at the last step",
          async () => {
            it("should not withdraw bounty and keep track of the accumulated bounty correctly", async () => {
              let shares: Record<number, BigNumber> = [];
              let totalShare: BigNumber = ethers.constants.Zero;
              let totalBalance: BigNumber = ethers.constants.Zero;
              let totalReinvestFee: BigNumber = ethers.constants.Zero;
              const path = await cakeMaxiWorkerNative.getPath();
              const performanceFee = await cakePool.performanceFeeContract();

              // Set reinvestThreshold to 1 CAKE
              await cakeMaxiWorkerNative.setReinvestConfig(REINVEST_BOUNTY_BPS, ethers.utils.parseEther("1"));

              await swapHelper.loadReserves(path);

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

              // --- Compute ---
              let amtsOut = await swapHelper.computeSwapExactTokensForTokens(
                ethers.utils.parseEther("0.1"),
                path,
                true
              );
              shares[0] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
              totalShare = totalShare.add(shares[0]);
              totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

              expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
              expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
              expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
                amtsOut[amtsOut.length - 1]
              );

              await swapHelper.loadReserves(path);

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
              // --- Compute ---
              // Put it as 1 wei because CakePool stake 1 wei to MCv2
              let cakeEarned = swapHelper.computeTotalRewards(
                1,
                CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
                2,
                ethers.constants.WeiPerEther
              );
              // Apply performance fee
              cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
              // Apply reinvest fee
              let reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
              cakeEarned = cakeEarned.sub(reinvestFee);
              totalBalance = totalBalance.add(cakeEarned);
              // Compute swap
              amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
              totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
              // Compute share
              // Because of removeShare makes totalShare = 0, so addShare given the balance == share
              shares[0] = totalBalance;
              totalShare = totalBalance;
              totalReinvestFee = totalReinvestFee.add(reinvestFee);

              // after all these steps above, alice will have a balance and share in total of 11.896630354291151718 + 0.12 (accumulatedBounty)
              expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.be.eq(
                totalBalance.add(reinvestFee)
              );
              expect(await cakeMaxiWorkerNative.shares(0)).to.be.eq(shares[0]);
              expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.be.eq(
                computeBalanceToShare(shares[0], totalShare, totalBalance)
              );
              expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq(0);
              expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.eq(reinvestFee);
              expect(await cake.balanceOf(eveAddress)).to.be.eq(0);

              await wbnbTokenAsBob.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
              await cakeMaxiWorkerNativeAsAlice.work(
                1,
                bobAddress,
                0,
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
                )
              );

              // --- Compute ---
              cakeEarned = swapHelper.computeTotalRewards(
                1,
                CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
                2,
                ethers.constants.WeiPerEther
              );
              // Apply performance fee
              cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
              // Apply reinvest fee
              reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
              cakeEarned = cakeEarned.sub(reinvestFee);
              totalBalance = totalBalance.add(cakeEarned);
              // Compute swap
              amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
              // Compute share
              // shares[0] remains the same, calculate shares[1]
              // Update individual share & total share
              shares[1] = computeBalanceToShare(amtsOut[amtsOut.length - 1], totalShare, totalBalance);
              totalShare = totalShare.add(shares[1]);
              // Deposit back to CakePool
              totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
              totalReinvestFee = totalReinvestFee.add(reinvestFee);

              expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.be.eq(
                totalBalance.add(totalReinvestFee)
              );
              expect(await cakeMaxiWorkerNative.shares(1)).to.eq(shares[1]);
              expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(1))).to.eq(
                computeShareToBalance(shares[1], totalShare, totalBalance)
              );
              expect(await cakeMaxiWorkerNative.shares(0)).to.be.eq(shares[0]);
              expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.be.eq(
                computeShareToBalance(shares[0], totalShare, totalBalance)
              );
              expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq(0);
              expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.eq(totalReinvestFee);

              // reinvest.. the size of the reward should be 1 (blocks) * 0.1 FToken (CAKE)
              await cakeMaxiWorkerNativeAsEve.reinvest();

              // --- Compute ---
              // Put it as 1 wei because CakePool stake 1 wei to MCv2
              cakeEarned = swapHelper.computeTotalRewards(
                1,
                CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
                1,
                ethers.constants.WeiPerEther
              );
              // Apply performance fee
              cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
              // Apply reinvest fee
              reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
              cakeEarned = cakeEarned.sub(reinvestFee);
              totalBalance = totalBalance.add(cakeEarned);
              totalReinvestFee = totalReinvestFee.add(reinvestFee);

              expect(await cake.balanceOf(eveAddress)).to.be.eq(totalReinvestFee);
              expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.be.eq(totalBalance);
              expect(await alpaca.balanceOf(mockedBeneficialVault.address)).to.be.eq(0);
              expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.eq(0);
            });
          }
        );

        context("When accumulatedBounty > 0, but all positions are fully closed", async () => {
          it("should collect performance fee correctly", async () => {
            let shares: Record<number, BigNumber> = [];
            let totalShare: BigNumber = ethers.constants.Zero;
            let totalBalance: BigNumber = ethers.constants.Zero;
            let totalReinvestFee: BigNumber = ethers.constants.Zero;
            const [path, reversePath] = await Promise.all([
              cakeMaxiWorkerNative.getPath(),
              cakeMaxiWorkerNative.getReversedPath(),
            ]);
            const performanceFee = await cakePool.performanceFeeContract();

            // Set reinvestThreshold to 1 CAKE
            await cakeMaxiWorkerNative.setReinvestConfig(REINVEST_BOUNTY_BPS, ethers.utils.parseEther("1"));

            await swapHelper.loadReserves(path);

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

            // --- Compute ---
            let amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
            shares[0] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
            totalShare = totalShare.add(shares[0]);
            totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

            expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
            expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
            expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
              amtsOut[amtsOut.length - 1]
            );

            const aliceBaseTokenBefore = await wbnb.balanceOf(await alice.getAddress());
            const aliceFarmingTokenBefore = await cake.balanceOf(await alice.getAddress());

            // Alice call liquidate strategy to close her position
            // once alice call function `work()` the `reinvest()` will be triggered
            await cakeMaxiWorkerNativeAsAlice.work(
              0,
              aliceAddress,
              0,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [stratLiq.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
              )
            );

            // --- Compute ---
            // Put it as 1 wei because CakePool stake 1 wei to MCv2
            let cakeEarned = swapHelper.computeTotalRewards(
              1,
              CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
              1,
              ethers.constants.WeiPerEther
            );
            // Apply performance fee
            cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
            // Apply reinvest fee
            let reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
            totalReinvestFee = totalReinvestFee.add(reinvestFee);
            cakeEarned = cakeEarned.sub(reinvestFee);
            totalBalance = totalBalance.add(cakeEarned);
            // Compute liquidate
            amtsOut = await swapHelper.computeSwapExactTokensForTokens(totalBalance, reversePath, true);
            // Compute accounting
            shares[0] = ethers.constants.Zero;
            totalShare = ethers.constants.Zero;
            totalBalance = ethers.constants.Zero;

            const aliceBaseTokenAfter = await wbnb.balanceOf(await alice.getAddress());
            const aliceFarmingTokenAfter = await cake.balanceOf(await alice.getAddress());

            expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.be.eq(reinvestFee);
            expect(await cakeMaxiWorkerNative.shares(0)).to.eq(0);
            expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq(0);
            expect(await cake.balanceOf(await eve.getAddress())).to.be.eq(0);
            expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.be.eq(amtsOut[amtsOut.length - 1]);
            expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.eq(ethers.utils.parseEther("0"));
            expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.eq(reinvestFee);

            // reinvest.. the size of the reward should be 1 (blocks) * 0.1 FToken (CAKE)
            await cakeMaxiWorkerNativeAsEve.reinvest();

            // --- Compute ---
            // Put it as 1 wei because CakePool stake 1 wei to MCv2
            cakeEarned = swapHelper.computeTotalRewards(
              1,
              CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
              1,
              ethers.constants.WeiPerEther
            );
            // Apply performance fee
            cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
            // Apply reinvest fee
            reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
            cakeEarned = cakeEarned.sub(reinvestFee);
            totalBalance = totalBalance.add(cakeEarned);
            totalReinvestFee = totalReinvestFee.add(reinvestFee);

            expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.eq(0);
            expect(await cake.balanceOf(eveAddress)).to.be.eq(totalReinvestFee);
            expect(await alpaca.balanceOf(mockedBeneficialVault.address)).to.be.eq(0);
            expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.eq(0);
          });
        });

        context("When worker only is a small share in CakePool", async () => {
          it("should reinvest correctly", async () => {
            let shares: Record<number, BigNumber> = [];
            let totalShare: BigNumber = ethers.constants.Zero;
            let totalBalance: BigNumber = ethers.constants.Zero;
            let totalReinvestFee: BigNumber = ethers.constants.Zero;
            const [path, reversePath] = await Promise.all([
              cakeMaxiWorkerNative.getPath(),
              cakeMaxiWorkerNative.getReversedPath(),
            ]);
            const performanceFee = await cakePool.performanceFeeContract();

            // Set reinvestThreshold to 1 CAKE
            await cakeMaxiWorkerNative.setReinvestConfig(REINVEST_BOUNTY_BPS, ethers.utils.parseEther("1"));

            // Deposit CAKE as Deployer to dilute the share in the pool, so workers would receive small CAKE rewards
            await cake.approve(cakePool.address, ethers.constants.MaxUint256);
            await cakePool.deposit(ethers.utils.parseEther("100"), 0);

            await swapHelper.loadReserves(path);

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

            // --- Compute ---
            let amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
            shares[0] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
            totalShare = totalShare.add(shares[0]);
            totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

            expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance.sub(1));
            expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
            expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
              totalBalance.sub(1)
            );

            await swapHelper.loadReserves(path);

            let workerCakePoolInfo = await cakePool.userInfo(cakeMaxiWorkerNative.address);
            let deployerCakePoolInfo = await cakePool.userInfo(deployerAddress);
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

            // --- Compute ---
            // Put it as 1 wei because CakePool stake 1 wei to MCv2
            let cakeEarned = swapHelper.computeTotalRewards(
              1,
              CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
              2,
              ethers.constants.WeiPerEther
            );
            // Apply share on cakeEarned
            cakeEarned = cakeEarned
              .mul(workerCakePoolInfo.shares)
              .div(workerCakePoolInfo.shares.add(deployerCakePoolInfo.shares));
            // Apply performance fee
            cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
            // Apply reinvest fee
            let reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
            cakeEarned = cakeEarned.sub(reinvestFee);
            totalBalance = totalBalance.add(cakeEarned);
            // Compute swap
            amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
            totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
            // Compute share
            // Because of removeShare makes totalShare = 0, so addShare given the balance == share
            shares[0] = totalBalance;
            totalShare = totalBalance;
            totalReinvestFee = totalReinvestFee.add(reinvestFee);

            // after all these steps above, alice will have a balance and share in total of 0.017592370040615058 + 0.000009717330802660 (accumulatedCake) = 0.017602087371417718 CAKE
            expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.be.closeTo(
              totalBalance.add(reinvestFee),
              10
            );
            expect(await cakeMaxiWorkerNative.shares(0)).to.be.closeTo(shares[0], 10);
            expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq(0);
            expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.be.closeTo(
              totalBalance,
              10
            );
            expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.eq(reinvestFee);
            expect(await cake.balanceOf(eveAddress)).to.be.eq(0);

            workerCakePoolInfo = await cakePool.userInfo(cakeMaxiWorkerNative.address);
            deployerCakePoolInfo = await cakePool.userInfo(deployerAddress);

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

            // --- Compute ---
            // Put it as 1 wei because CakePool stake 1 wei to MCv2
            cakeEarned = swapHelper.computeTotalRewards(
              1,
              CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
              2,
              ethers.constants.WeiPerEther
            );
            // Apply share on cakeEarned
            cakeEarned = cakeEarned
              .mul(workerCakePoolInfo.shares)
              .div(workerCakePoolInfo.shares.add(deployerCakePoolInfo.shares));
            // Apply performance fee
            cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
            // Apply reinvest fee
            reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
            cakeEarned = cakeEarned.sub(reinvestFee);
            totalBalance = totalBalance.add(cakeEarned);
            // Compute swap
            amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
            // Compute share
            // Don't touch shares[0] here so no need to update shares[0]
            shares[1] = computeBalanceToShare(amtsOut[amtsOut.length - 1], totalShare, totalBalance);
            totalShare = totalShare.add(shares[1]);
            totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
            totalReinvestFee = totalReinvestFee.add(reinvestFee);

            expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.be.closeTo(
              totalBalance.add(totalReinvestFee),
              10
            );
            expect(await cakeMaxiWorkerNative.shares(0)).to.be.closeTo(shares[0], 10);
            expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.be.closeTo(
              computeShareToBalance(shares[0], totalShare, totalBalance),
              10
            );
            expect(await cakeMaxiWorkerNative.shares(1)).to.be.closeTo(shares[1], 10);
            expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(1))).to.be.closeTo(
              computeShareToBalance(shares[1], totalShare, totalBalance),
              10
            );
            expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq(0);
            expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.closeTo(totalReinvestFee, 10);

            // reinvest.. the size of the reward should be 1 (blocks) * 0.1 FToken (CAKE)
            workerCakePoolInfo = await cakePool.userInfo(cakeMaxiWorkerNative.address);
            deployerCakePoolInfo = await cakePool.userInfo(deployer.address);

            await cakeMaxiWorkerNativeAsEve.reinvest();

            // --- Compute ---
            // Put it as 1 wei because CakePool stake 1 wei to MCv2
            cakeEarned = swapHelper.computeTotalRewards(
              1,
              CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
              1,
              ethers.constants.WeiPerEther
            );
            // Apply share on cakeEarned
            cakeEarned = cakeEarned
              .mul(workerCakePoolInfo.shares)
              .div(workerCakePoolInfo.shares.add(deployerCakePoolInfo.shares));
            // Apply performance fee
            cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
            // Apply reinvest fee
            reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
            cakeEarned = cakeEarned.sub(reinvestFee);
            totalBalance = totalBalance.add(cakeEarned);
            totalReinvestFee = totalReinvestFee.add(reinvestFee);

            expect(await cake.balanceOf(eveAddress)).to.be.closeTo(totalReinvestFee, 10);
            expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.be.closeTo(totalBalance, 10);
            expect(await alpaca.balanceOf(mockedBeneficialVault.address)).to.be.eq(0);
            expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.eq(0);
          });
        });

        context(
          "When there is no CakePool interaction at all, between each reinvest and bounty is below minimum withdraw amount",
          async () => {
            it("should track accumulated bounty correctly", async () => {
              let shares: Record<number, BigNumber> = [];
              let totalShare: BigNumber = ethers.constants.Zero;
              let totalBalance: BigNumber = ethers.constants.Zero;
              let totalReinvestFee: BigNumber = ethers.constants.Zero;
              const [path, reversePath] = await Promise.all([
                cakeMaxiWorkerNative.getPath(),
                cakeMaxiWorkerNative.getReversedPath(),
              ]);
              const performanceFee = await cakePool.performanceFeeContract();

              // Set reinvestThreshold to 0 CAKE
              await cakeMaxiWorkerNative.setReinvestConfig(REINVEST_BOUNTY_BPS, ethers.utils.parseEther("0"));

              // Deposit CAKE as Deployer to dilute the share in the pool, so workers would receive small CAKE rewards
              await cake.approve(cakePool.address, ethers.constants.MaxUint256);
              await cakePool.deposit(ethers.utils.parseEther("100"), 0);

              await swapHelper.loadReserves(path);

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

              // --- Compute ---
              let amtsOut = await swapHelper.computeSwapExactTokensForTokens(
                ethers.utils.parseEther("0.1"),
                path,
                true
              );
              shares[0] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
              totalShare = totalShare.add(shares[0]);
              totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

              expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance.sub(1));
              expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
              expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
                totalBalance.sub(1)
              );

              // reinvest..
              let workerCakePoolInfo = await cakePool.userInfo(cakeMaxiWorkerNative.address);
              let deployerCakePoolInfo = await cakePool.userInfo(deployer.address);

              await cakeMaxiWorkerNativeAsEve.reinvest();

              // --- Compute ---
              // Put it as 1 wei because CakePool stake 1 wei to MCv2
              let cakeEarned = swapHelper.computeTotalRewards(
                1,
                CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
                1,
                ethers.constants.WeiPerEther
              );
              // Apply share on cakeEarned
              cakeEarned = cakeEarned
                .mul(workerCakePoolInfo.shares)
                .div(workerCakePoolInfo.shares.add(deployerCakePoolInfo.shares));
              // Apply performance fee
              cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
              // Apply reinvest fee
              let reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
              cakeEarned = cakeEarned.sub(reinvestFee);
              totalBalance = totalBalance.add(cakeEarned);
              totalReinvestFee = totalReinvestFee.add(reinvestFee);

              expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.closeTo(totalReinvestFee, 10);
              expect(await cake.balanceOf(eveAddress)).to.be.eq(0);

              // reinvest..
              // Bounty is higher than MIN_WITHDRAW_AMOUNT and it is collectable
              // eve, the reinvestor, should receive 0.00001457599620399 CAKE
              workerCakePoolInfo = await cakePool.userInfo(cakeMaxiWorkerNative.address);
              deployerCakePoolInfo = await cakePool.userInfo(deployer.address);

              await cakeMaxiWorkerNativeAsEve.reinvest();

              // --- Compute ---
              // Put it as 1 wei because CakePool stake 1 wei to MCv2
              cakeEarned = swapHelper.computeTotalRewards(
                1,
                CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
                1,
                ethers.constants.WeiPerEther
              );
              // Apply share on cakeEarned
              cakeEarned = cakeEarned
                .mul(workerCakePoolInfo.shares)
                .div(workerCakePoolInfo.shares.add(deployerCakePoolInfo.shares));
              // Apply performance fee
              cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
              // Apply reinvest fee
              reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
              cakeEarned = cakeEarned.sub(reinvestFee);
              totalBalance = totalBalance.add(cakeEarned);
              totalReinvestFee = totalReinvestFee.add(reinvestFee);

              expect(await cakeMaxiWorkerNative.accumulatedBounty()).to.be.eq(0);
              expect(await cake.balanceOf(eveAddress)).to.be.closeTo(totalReinvestFee, 10);
            });
          }
        );
      });

      context("When beneficialVaultBounty takes 10% of reinvest bounty", async () => {
        it("should increase the size of total balance, bounty is sent to the reinvestor and beneficial vault based on a correct bps", async () => {
          let shares: Record<number, BigNumber> = [];
          let totalShare: BigNumber = ethers.constants.Zero;
          let totalBalance: BigNumber = ethers.constants.Zero;
          let totalReinvestFee: BigNumber = ethers.constants.Zero;
          let totalBeneficialVaultReceived: BigNumber = ethers.constants.Zero;
          const [path, reversePath, rewardPath] = await Promise.all([
            cakeMaxiWorkerNative.getPath(),
            cakeMaxiWorkerNative.getReversedPath(),
            cakeMaxiWorkerNative.getRewardPath(),
          ]);
          const performanceFee = await cakePool.performanceFeeContract();

          await cakeMaxiWorkerNative.setBeneficialVaultBountyBps(BENEFICIALVAULT_BOUNTY_BPS);
          expect(await cakeMaxiWorkerNative.beneficialVaultBountyBps()).to.eq(BENEFICIALVAULT_BOUNTY_BPS);

          await swapHelper.loadReserves(path);

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

          // --- Compute ---
          let amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
          shares[0] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
          totalShare = totalShare.add(shares[0]);
          totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

          expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
          expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
            amtsOut[amtsOut.length - 1]
          );

          await swapHelper.loadReserves(path);
          await swapHelper.loadReserves(rewardPath);

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

          // --- Compute ---
          // Put it as 1 wei because CakePool stake 1 wei to MCv2
          let cakeEarned = swapHelper.computeTotalRewards(
            1,
            CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
            2,
            ethers.constants.WeiPerEther
          );
          // Apply performance fee
          cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
          // Apply reinvest fee
          let reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
          let cakeForBeneficialVault = reinvestFee.mul(BENEFICIALVAULT_BOUNTY_BPS).div(10000);
          let beneficialVaultReceivedAmts = await swapHelper.computeSwapExactTokensForTokens(
            cakeForBeneficialVault,
            rewardPath,
            true
          );
          cakeEarned = cakeEarned.sub(reinvestFee);
          totalBalance = totalBalance.add(cakeEarned);
          // Compute swap
          amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
          totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
          // Compute share
          // Because of removeShare makes totalShare = 0, so addShare given the balance == share
          shares[0] = totalBalance;
          totalShare = totalBalance;
          totalReinvestFee = totalReinvestFee.add(reinvestFee.sub(cakeForBeneficialVault));
          totalBeneficialVaultReceived = totalBeneficialVaultReceived.add(
            beneficialVaultReceivedAmts[beneficialVaultReceivedAmts.length - 1]
          );

          // after all these steps above, alice will have a balance in total of 11.898649767504567299
          expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
          expect(await cakeMaxiWorkerNative.shares(0)).to.be.eq(shares[0]);
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
            computeShareToBalance(shares[0], totalShare, totalBalance)
          );
          expect(await cake.balanceOf(eveAddress)).to.be.eq(totalReinvestFee);
          expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq(0);
          expect(await alpaca.balanceOf(mockedBeneficialVault.address)).to.be.eq(totalBeneficialVaultReceived);

          // reinvest..
          await cakeMaxiWorkerNativeAsEve.reinvest();

          // --- Compute ---
          // Put it as 1 wei because CakePool stake 1 wei to MCv2
          cakeEarned = swapHelper.computeTotalRewards(
            1,
            CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
            1,
            ethers.constants.WeiPerEther
          );
          // Apply performance fee
          cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
          // Apply reinvest fee
          reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
          cakeForBeneficialVault = reinvestFee.mul(BENEFICIALVAULT_BOUNTY_BPS).div(10000);
          beneficialVaultReceivedAmts = await swapHelper.computeSwapExactTokensForTokens(
            cakeForBeneficialVault,
            rewardPath,
            true
          );
          cakeEarned = cakeEarned.sub(reinvestFee);
          totalBalance = totalBalance.add(cakeEarned);
          totalReinvestFee = totalReinvestFee.add(reinvestFee.sub(cakeForBeneficialVault));
          totalBeneficialVaultReceived = totalBeneficialVaultReceived.add(
            beneficialVaultReceivedAmts[beneficialVaultReceivedAmts.length - 1]
          );

          expect(await cake.balanceOf(eveAddress)).to.be.eq(totalReinvestFee);
          expect(await alpaca.balanceOf(mockedBeneficialVault.address)).to.be.eq(totalBeneficialVaultReceived);

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

          // --- Compute ---
          cakeEarned = swapHelper.computeTotalRewards(
            1,
            CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
            2,
            ethers.constants.WeiPerEther
          );
          // Apply performance fee
          cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
          // Apply reinvest fee
          reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
          cakeForBeneficialVault = reinvestFee.mul(BENEFICIALVAULT_BOUNTY_BPS).div(10000);
          beneficialVaultReceivedAmts = await swapHelper.computeSwapExactTokensForTokens(
            cakeForBeneficialVault,
            rewardPath,
            true
          );
          cakeEarned = cakeEarned.sub(reinvestFee);
          totalBalance = totalBalance.add(cakeEarned);
          // Compute swap
          amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
          // Compute share
          // shares[0] remains the same, calculate shares[1]
          // Update individual share & total share
          shares[1] = computeBalanceToShare(amtsOut[amtsOut.length - 1], totalShare, totalBalance);
          totalShare = totalShare.add(shares[1]);
          // Deposit back to CakePool
          totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
          totalReinvestFee = totalReinvestFee.add(reinvestFee);
          totalBeneficialVaultReceived = totalBeneficialVaultReceived.add(
            beneficialVaultReceivedAmts[beneficialVaultReceivedAmts.length - 1]
          );

          expect(await alpaca.balanceOf(mockedBeneficialVault.address)).to.be.eq(totalBeneficialVaultReceived);
          expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.be.eq(totalBalance);
          expect(await cakeMaxiWorkerNative.shares(0)).to.be.eq(shares[0]);
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.be.eq(
            computeShareToBalance(shares[0], totalShare, totalBalance)
          );
          expect(await cakeMaxiWorkerNative.shares(1)).to.eq(shares[1]);
          expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(1))).to.eq(
            computeShareToBalance(shares[1], totalShare, totalBalance)
          );
          expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq(0);
        });
      });
    });

    context("When integrated with an actual vault", async () => {
      it("should reinvest with updated beneficial vault reward to the beneficial vault", async () => {
        let shares: Record<number, BigNumber> = [];
        let totalShare: BigNumber = ethers.constants.Zero;
        let totalBalance: BigNumber = ethers.constants.Zero;
        let totalReinvestFee: BigNumber = ethers.constants.Zero;
        let totalBeneficialVaultReceived: BigNumber = ethers.constants.Zero;
        let accumBuybackAmount: BigNumber = ethers.constants.Zero;
        const [path, reversePath, rewardPath] = await Promise.all([
          integratedCakeMaxiWorker.getPath(),
          integratedCakeMaxiWorker.getReversedPath(),
          integratedCakeMaxiWorker.getRewardPath(),
        ]);
        const performanceFee = await cakePool.performanceFeeContract();

        await integratedCakeMaxiWorker.setBeneficialVaultBountyBps(BENEFICIALVAULT_BOUNTY_BPS);
        expect(await integratedCakeMaxiWorker.beneficialVaultBountyBps()).to.eq(BENEFICIALVAULT_BOUNTY_BPS);

        // alice deposit some portion of her native bnb into a vault, thus interest will be accrued afterward
        await integratedVaultAsAlice.deposit(ethers.utils.parseEther("1"), {
          value: ethers.utils.parseEther("1"),
        });

        await swapHelper.loadReserves(path);

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

        // --- Compute ---
        let amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
        shares[1] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
        totalShare = totalShare.add(shares[1]);
        totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

        expect(await getUserCakeStakedBalance(integratedCakeMaxiWorker.address)).to.eq(totalBalance);
        expect(await integratedCakeMaxiWorker.shares(1)).to.eq(shares[1]);
        expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(1))).to.eq(
          amtsOut[amtsOut.length - 1]
        );

        await swapHelper.loadReserves(path);
        await swapHelper.loadReserves(rewardPath);

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

        // --- Compute ---
        // Put it as 1 wei because CakePool stake 1 wei to MCv2
        let cakeEarned = swapHelper.computeTotalRewards(
          1,
          CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
          1,
          ethers.constants.WeiPerEther
        );
        // Apply performance fee
        cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
        // Apply reinvest fee
        let reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
        let cakeForBeneficialVault = reinvestFee.mul(BENEFICIALVAULT_BOUNTY_BPS).div(10000);
        let beneficialVaultReceivedAmts = await swapHelper.computeSwapExactTokensForTokens(
          cakeForBeneficialVault,
          rewardPath,
          true
        );
        cakeEarned = cakeEarned.sub(reinvestFee);
        totalBalance = totalBalance.add(cakeEarned);
        // Compute swap
        amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
        totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
        // Compute share
        // Because of removeShare makes totalShare = 0, so addShare given the balance == share
        shares[1] = totalBalance;
        totalShare = totalBalance;
        totalReinvestFee = totalReinvestFee.add(reinvestFee.sub(cakeForBeneficialVault));
        accumBuybackAmount = accumBuybackAmount.add(
          beneficialVaultReceivedAmts[beneficialVaultReceivedAmts.length - 1]
        );
        totalBeneficialVaultReceived = totalBeneficialVaultReceived.add(
          beneficialVaultReceivedAmts[beneficialVaultReceivedAmts.length - 1]
        );

        expect(await getUserCakeStakedBalance(integratedCakeMaxiWorker.address)).to.be.eq(totalBalance);
        expect(await cake.balanceOf(eveAddress)).to.be.eq(totalReinvestFee);
        expect(await integratedCakeMaxiWorker.rewardBalance()).to.be.eq(0);
        expect(await integratedCakeMaxiWorker.shares(1)).to.be.eq(shares[1]);
        expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(1))).to.be.eq(
          totalBalance
        );
        expect(await wbnb.balanceOf(integratedVault.address)).to.be.eq(ethers.utils.parseEther("0.95"));
        expect(await integratedCakeMaxiWorker.buybackAmount()).to.be.eq(accumBuybackAmount);

        // reinvest..
        await integratedCakeMaxiWorkerAsEve.reinvest();

        // --- Compute ---
        // Put it as 1 wei because CakePool stake 1 wei to MCv2
        cakeEarned = swapHelper.computeTotalRewards(
          1,
          CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
          1,
          ethers.constants.WeiPerEther
        );
        // Apply performance fee
        cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
        // Apply reinvest fee
        reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
        cakeForBeneficialVault = reinvestFee.mul(BENEFICIALVAULT_BOUNTY_BPS).div(10000);
        beneficialVaultReceivedAmts = await swapHelper.computeSwapExactTokensForTokens(
          cakeForBeneficialVault,
          rewardPath,
          true
        );
        cakeEarned = cakeEarned.sub(reinvestFee);
        totalBalance = totalBalance.add(cakeEarned);
        totalReinvestFee = totalReinvestFee.add(reinvestFee.sub(cakeForBeneficialVault));
        totalBeneficialVaultReceived = totalBeneficialVaultReceived.add(
          beneficialVaultReceivedAmts[beneficialVaultReceivedAmts.length - 1]
        );
        accumBuybackAmount = ethers.constants.Zero;

        expect(await cake.balanceOf(eveAddress)).to.be.eq(totalReinvestFee);
        expect(await wbnb.balanceOf(integratedVault.address)).to.be.eq(
          ethers.utils.parseEther("1").sub(ethers.utils.parseEther("0.05")).add(totalBeneficialVaultReceived)
        );
        expect(await integratedCakeMaxiWorker.buybackAmount()).to.be.eq(accumBuybackAmount);

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

        // --- Compute ---
        cakeEarned = swapHelper.computeTotalRewards(
          1,
          CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
          1,
          ethers.constants.WeiPerEther
        );
        // Apply performance fee
        cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
        // Apply reinvest fee
        reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
        cakeForBeneficialVault = reinvestFee.mul(BENEFICIALVAULT_BOUNTY_BPS).div(10000);
        beneficialVaultReceivedAmts = await swapHelper.computeSwapExactTokensForTokens(
          cakeForBeneficialVault,
          rewardPath,
          true
        );
        cakeEarned = cakeEarned.sub(reinvestFee);
        totalBalance = totalBalance.add(cakeEarned);
        // Compute swap
        amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
        // Compute share
        // shares[1] remains the same, calculate shares[2]
        // Update individual share & total share
        shares[2] = computeBalanceToShare(amtsOut[amtsOut.length - 1], totalShare, totalBalance);
        totalShare = totalShare.add(shares[2]);
        // Deposit back to CakePool
        totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
        totalReinvestFee = totalReinvestFee.add(reinvestFee);
        totalBeneficialVaultReceived = totalBeneficialVaultReceived.add(
          beneficialVaultReceivedAmts[beneficialVaultReceivedAmts.length - 1]
        );
        accumBuybackAmount = accumBuybackAmount.add(
          beneficialVaultReceivedAmts[beneficialVaultReceivedAmts.length - 1]
        );

        expect(await getUserCakeStakedBalance(integratedCakeMaxiWorker.address)).to.be.eq(totalBalance);
        expect(await integratedCakeMaxiWorker.shares(1)).to.be.eq(shares[1]);
        expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(1))).to.be.eq(
          computeShareToBalance(shares[1], totalShare, totalBalance)
        );
        expect(await integratedCakeMaxiWorker.shares(2)).to.be.eq(shares[2]);
        expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(2))).to.be.eq(
          computeShareToBalance(shares[2], totalShare, totalBalance)
        );
        expect(await wbnb.balanceOf(integratedVault.address)).to.be.eq(
          ethers.utils.parseEther("0.95").add(totalBeneficialVaultReceived.sub(accumBuybackAmount))
        );
        expect(await integratedCakeMaxiWorker.buybackAmount()).to.be.eq(accumBuybackAmount);
        expect(await integratedCakeMaxiWorker.rewardBalance()).to.be.eq(0);

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

        // --- Compute ---
        cakeEarned = swapHelper.computeTotalRewards(
          1,
          CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
          1,
          ethers.constants.WeiPerEther
        );
        // Apply performance fee
        cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
        // Apply reinvest fee
        reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
        cakeForBeneficialVault = reinvestFee.mul(BENEFICIALVAULT_BOUNTY_BPS).div(10000);
        beneficialVaultReceivedAmts = await swapHelper.computeSwapExactTokensForTokens(
          cakeForBeneficialVault,
          rewardPath,
          true
        );
        cakeEarned = cakeEarned.sub(reinvestFee);
        totalBalance = totalBalance.add(cakeEarned);
        // Compute swap
        amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
        // Compute share
        // calculate shares[3]
        // Update individual share & total share
        shares[3] = computeBalanceToShare(amtsOut[amtsOut.length - 1], totalShare, totalBalance);
        totalShare = totalShare.add(shares[3]);
        // Deposit back to CakePool
        totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
        totalReinvestFee = totalReinvestFee.add(reinvestFee);
        totalBeneficialVaultReceived = totalBeneficialVaultReceived.add(
          beneficialVaultReceivedAmts[beneficialVaultReceivedAmts.length - 1]
        );
        accumBuybackAmount = accumBuybackAmount.add(
          beneficialVaultReceivedAmts[beneficialVaultReceivedAmts.length - 1]
        );

        expect(await getUserCakeStakedBalance(integratedCakeMaxiWorker.address)).to.be.eq(totalBalance);
        expect(await integratedCakeMaxiWorker.shares(1)).to.be.eq(shares[1]);
        expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(1))).to.be.eq(
          computeShareToBalance(shares[1], totalShare, totalBalance)
        );
        expect(await integratedCakeMaxiWorker.shares(2)).to.be.eq(shares[2]);
        expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(2))).to.be.eq(
          computeShareToBalance(shares[2], totalShare, totalBalance)
        );
        expect(await integratedCakeMaxiWorker.shares(3)).to.be.eq(shares[3]);
        expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(3))).to.be.eq(
          computeShareToBalance(shares[3], totalShare, totalBalance)
        );
        expect(await wbnb.balanceOf(integratedVault.address)).to.be.eq(
          ethers.utils.parseEther("0.95").add(totalBeneficialVaultReceived.sub(accumBuybackAmount))
        );
        expect(await integratedCakeMaxiWorker.buybackAmount()).to.be.eq(accumBuybackAmount);
        expect(await integratedCakeMaxiWorker.rewardBalance()).to.be.eq(0);
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
        expect(await getUserCakeStakedBalance(cakeMaxiWorkerNonNativeAsAlice.address)).to.eq(
          ethers.utils.parseEther("0.008296899991192416")
        );
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
        expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(
          ethers.utils.parseEther("0.00907024323709934")
        );
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
      let shares: Record<number, BigNumber> = [];
      let totalShare: BigNumber = ethers.constants.Zero;
      let totalBalance: BigNumber = ethers.constants.Zero;
      const [path, reversePath] = await Promise.all([
        cakeMaxiWorkerNative.getPath(),
        cakeMaxiWorkerNative.getReversedPath(),
      ]);
      const performanceFee = await cakePool.performanceFeeContract();

      await swapHelper.loadReserves(path);

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

      // --- Compute ---
      let amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
      shares[0] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
      totalShare = totalShare.add(shares[0]);
      totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

      expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
      expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
      expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
        amtsOut[amtsOut.length - 1]
      );

      await swapHelper.loadReserves(reversePath);

      // Alice call liquidate strategy to close her position
      const aliceBaseTokenBefore = await wbnb.balanceOf(await alice.getAddress());
      const aliceFarmingTokenBefore = await cake.balanceOf(await alice.getAddress());

      await cakeMaxiWorkerNativeAsAlice.liquidate(0);

      // --- Compute ---
      // Put it as 1 wei because CakePool stake 1 wei to MCv2
      let cakeEarned = swapHelper.computeTotalRewards(
        1,
        CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
        1,
        ethers.constants.WeiPerEther
      );
      // Apply performance fee
      cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
      // Apply reinvest fee
      cakeEarned = cakeEarned.sub(cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000));
      totalBalance = totalBalance.add(cakeEarned);
      // Compute liquidate
      amtsOut = await swapHelper.computeSwapExactTokensForTokens(totalBalance, reversePath, true);
      // Compute accounting
      shares[0] = ethers.constants.Zero;
      totalShare = ethers.constants.Zero;
      totalBalance = ethers.constants.Zero;

      const aliceBaseTokenAfter = await wbnb.balanceOf(await alice.getAddress());
      const aliceFarmingTokenAfter = await cake.balanceOf(await alice.getAddress());
      expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.be.eq(0);
      expect(await cakeMaxiWorkerNative.shares(0)).to.eq(0);
      expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq(0);
      expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.be.eq(amtsOut[amtsOut.length - 1]);
      expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.eq(0);
    });

    context("When integrated with an actual vault", async () => {
      context("when there is buybackAmount left when killing a position", async () => {
        it("should successfully liquidate a certain position without any returning a buybackAmount", async () => {
          let shares: Record<number, BigNumber> = [];
          let totalShare: BigNumber = ethers.constants.Zero;
          let totalBalance: BigNumber = ethers.constants.Zero;
          let totalReinvestFee: BigNumber = ethers.constants.Zero;
          let accumBuybackAmount: BigNumber = ethers.constants.Zero;
          let totalBeneficialVaultReceived: BigNumber = ethers.constants.Zero;
          const [path, reversePath, rewardPath] = await Promise.all([
            integratedCakeMaxiWorker.getPath(),
            integratedCakeMaxiWorker.getReversedPath(),
            integratedCakeMaxiWorker.getRewardPath(),
          ]);
          const performanceFee = await cakePool.performanceFeeContract();

          await integratedCakeMaxiWorker.setBeneficialVaultBountyBps(BENEFICIALVAULT_BOUNTY_BPS);
          expect(await integratedCakeMaxiWorker.beneficialVaultBountyBps()).to.eq(BENEFICIALVAULT_BOUNTY_BPS);

          // alice deposit some portion of her native bnb into a vault, thus interest will be accrued afterward
          await integratedVaultAsAlice.deposit(ethers.utils.parseEther("1"), {
            value: ethers.utils.parseEther("1"),
          });

          await swapHelper.loadReserves(path);

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

          // --- Compute ---
          let amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
          shares[1] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
          totalShare = totalShare.add(shares[1]);
          totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

          expect(await getUserCakeStakedBalance(integratedCakeMaxiWorker.address)).to.eq(totalBalance);
          expect(await integratedCakeMaxiWorker.shares(1)).to.eq(shares[1]);
          expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(1))).to.eq(
            amtsOut[amtsOut.length - 1]
          );

          await swapHelper.loadReserves(path);
          await swapHelper.loadReserves(rewardPath);

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

          // --- Compute ---
          // Put it as 1 wei because CakePool stake 1 wei to MCv2
          let cakeEarned = swapHelper.computeTotalRewards(
            1,
            CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
            1,
            ethers.constants.WeiPerEther
          );
          // Apply performance fee
          cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
          // Apply reinvest fee
          let reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
          let cakeForBeneficialVault = reinvestFee.mul(BENEFICIALVAULT_BOUNTY_BPS).div(10000);
          let beneficialVaultReceivedAmts = await swapHelper.computeSwapExactTokensForTokens(
            cakeForBeneficialVault,
            rewardPath,
            true
          );
          cakeEarned = cakeEarned.sub(reinvestFee);
          totalBalance = totalBalance.add(cakeEarned);
          // Compute swap
          amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
          totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
          // Compute share
          // Because of removeShare makes totalShare = 0, so addShare given the balance == share
          shares[1] = totalBalance;
          totalShare = totalBalance;
          totalReinvestFee = totalReinvestFee.add(reinvestFee.sub(cakeForBeneficialVault));
          accumBuybackAmount = accumBuybackAmount.add(
            beneficialVaultReceivedAmts[beneficialVaultReceivedAmts.length - 1]
          );
          totalBeneficialVaultReceived = totalBeneficialVaultReceived.add(
            beneficialVaultReceivedAmts[beneficialVaultReceivedAmts.length - 1]
          );

          expect(await getUserCakeStakedBalance(integratedCakeMaxiWorker.address)).to.be.eq(totalBalance);
          expect(await integratedCakeMaxiWorker.shares(1)).to.be.eq(shares[1]);
          expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(1))).to.be.eq(
            computeShareToBalance(shares[1], totalShare, totalBalance)
          );
          expect(await cake.balanceOf(eveAddress)).to.be.eq(totalReinvestFee);
          expect(await integratedCakeMaxiWorker.rewardBalance()).to.be.eq(0);
          expect(await wbnb.balanceOf(integratedVault.address)).to.be.eq(ethers.utils.parseEther("0.95"));
          expect(await integratedCakeMaxiWorker.buybackAmount()).to.be.eq(accumBuybackAmount);

          // Now it's a liquidation part
          await cake.approve(routerV2.address, constants.MaxUint256);
          // alice sell CAKE so that the price will be fluctuated, hence position can be liquidated
          await routerV2.swapExactTokensForTokens(
            ethers.utils.parseEther("1.5"),
            0,
            [cake.address, wbnb.address],
            aliceAddress,
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

          const bobBalanceBefore = await ethers.provider.getBalance(await bob.getAddress());
          const aliceBalanceBefore = await ethers.provider.getBalance(await alice.getAddress());
          const deployerBalanceBefore = await ethers.provider.getBalance(await deployer.getAddress());
          const vaultBalanceBefore = await wbnb.balanceOf(integratedVault.address);
          const debt = await integratedVault.debtShareToVal((await integratedVault.positions(1)).debtShare);

          await swapHelper.loadReserves(path);
          await swapHelper.loadReserves(reversePath);

          // bob call `kill` alice's position, which is position #1
          await integratedVaultAsBob.kill(1, {
            gasPrice: 0,
          });

          // --- Compute ---
          // Put it as 1 wei because CakePool stake 1 wei to MCv2
          cakeEarned = swapHelper.computeTotalRewards(
            1,
            CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
            4,
            ethers.constants.WeiPerEther
          );
          // Apply performance fee
          cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
          // Apply reinvest fee
          reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
          cakeForBeneficialVault = reinvestFee.mul(BENEFICIALVAULT_BOUNTY_BPS).div(10000);
          beneficialVaultReceivedAmts = await swapHelper.computeSwapExactTokensForTokens(
            cakeForBeneficialVault,
            rewardPath,
            true
          );
          cakeEarned = cakeEarned.sub(reinvestFee);
          totalBalance = totalBalance.add(cakeEarned);
          accumBuybackAmount = accumBuybackAmount.add(
            beneficialVaultReceivedAmts[beneficialVaultReceivedAmts.length - 1]
          );
          // Compute liquidate
          amtsOut = await swapHelper.computeSwapExactTokensForTokens(totalBalance, reversePath, true);
          const liquidationBounty = amtsOut[amtsOut.length - 1].mul(KILL_PRIZE_BPS).div(10000);
          const treasuryKillBps = amtsOut[amtsOut.length - 1].mul(KILL_TREASURY_BPS).div(10000);
          const totalLiquidationFees = liquidationBounty.add(treasuryKillBps);
          const left = debt.gte(amtsOut[amtsOut.length - 1])
            ? ethers.constants.Zero
            : amtsOut[amtsOut.length - 1].sub(totalLiquidationFees).sub(debt);
          const repaid = debt.gte(amtsOut[amtsOut.length - 1].sub(totalLiquidationFees))
            ? amtsOut[amtsOut.length - 1].sub(totalLiquidationFees)
            : debt;

          // Compute accounting
          shares[0] = ethers.constants.Zero;
          totalShare = ethers.constants.Zero;
          totalBalance = ethers.constants.Zero;

          const bobBalanceAfter = await ethers.provider.getBalance(bobAddress);
          const aliceBalanceAfter = await ethers.provider.getBalance(aliceAddress);
          const vaultBalanceAfter = await wbnb.balanceOf(integratedVault.address);
          const deployerBalanceAfter = await ethers.provider.getBalance(deployerAddress);
          expect(bobBalanceAfter.sub(bobBalanceBefore), "expect Bob to get a correct liquidation bounty").to.eq(
            liquidationBounty
          );
          expect(aliceBalanceAfter.sub(aliceBalanceBefore), "expect Alice to get a correct left amount").to.eq(left);
          expect(vaultBalanceAfter.sub(vaultBalanceBefore), "expect Vault should get its funds back").to.eq(repaid);
          expect(deployerBalanceAfter.sub(deployerBalanceBefore), "expect Deployer should get tresaury fees").to.eq(
            treasuryKillBps
          );
          expect((await integratedVaultAsAlice.positions(1)).debtShare).to.eq(0);
          expect(await integratedCakeMaxiWorker.buybackAmount()).to.be.eq(accumBuybackAmount);
        });
      });

      context("when there is no buybackAmount left when killing a position", async () => {
        it("should successfully liquidate a certain position after all transactions", async () => {
          let shares: Record<number, BigNumber> = [];
          let totalShare: BigNumber = ethers.constants.Zero;
          let totalBalance: BigNumber = ethers.constants.Zero;
          let totalReinvestFee: BigNumber = ethers.constants.Zero;
          let accumBuybackAmount: BigNumber = ethers.constants.Zero;
          let totalBeneficialVaultReceived: BigNumber = ethers.constants.Zero;
          const [path, reversePath, rewardPath] = await Promise.all([
            integratedCakeMaxiWorker.getPath(),
            integratedCakeMaxiWorker.getReversedPath(),
            integratedCakeMaxiWorker.getRewardPath(),
          ]);
          const performanceFee = await cakePool.performanceFeeContract();

          await integratedCakeMaxiWorker.setBeneficialVaultBountyBps(BENEFICIALVAULT_BOUNTY_BPS);
          expect(await integratedCakeMaxiWorker.beneficialVaultBountyBps()).to.eq(BENEFICIALVAULT_BOUNTY_BPS);

          // alice deposit some portion of her native bnb into a vault, thus interest will be accrued afterward
          await integratedVaultAsAlice.deposit(ethers.utils.parseEther("1"), {
            value: ethers.utils.parseEther("1"),
          });

          await swapHelper.loadReserves(path);

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

          // --- Compute ---
          let amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
          shares[1] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
          totalShare = totalShare.add(shares[1]);
          totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

          expect(await getUserCakeStakedBalance(integratedCakeMaxiWorker.address)).to.eq(totalBalance);
          expect(await integratedCakeMaxiWorker.shares(1)).to.eq(shares[1]);
          expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(1))).to.eq(
            amtsOut[amtsOut.length - 1]
          );

          await swapHelper.loadReserves(path);
          await swapHelper.loadReserves(rewardPath);

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

          // --- Compute ---
          // Put it as 1 wei because CakePool stake 1 wei to MCv2
          let cakeEarned = swapHelper.computeTotalRewards(
            1,
            CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
            1,
            ethers.constants.WeiPerEther
          );
          // Apply performance fee
          cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
          // Apply reinvest fee
          let reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
          let cakeForBeneficialVault = reinvestFee.mul(BENEFICIALVAULT_BOUNTY_BPS).div(10000);
          let beneficialVaultReceivedAmts = await swapHelper.computeSwapExactTokensForTokens(
            cakeForBeneficialVault,
            rewardPath,
            true
          );
          cakeEarned = cakeEarned.sub(reinvestFee);
          totalBalance = totalBalance.add(cakeEarned);
          // Compute swap
          amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
          totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);
          // Compute share
          // Because of removeShare makes totalShare = 0, so addShare given the balance == share
          shares[1] = totalBalance;
          totalShare = totalBalance;
          totalReinvestFee = totalReinvestFee.add(reinvestFee.sub(cakeForBeneficialVault));
          accumBuybackAmount = accumBuybackAmount.add(
            beneficialVaultReceivedAmts[beneficialVaultReceivedAmts.length - 1]
          );
          totalBeneficialVaultReceived = totalBeneficialVaultReceived.add(
            beneficialVaultReceivedAmts[beneficialVaultReceivedAmts.length - 1]
          );

          expect(await getUserCakeStakedBalance(integratedCakeMaxiWorker.address)).to.be.eq(totalBalance);
          expect(await integratedCakeMaxiWorker.shares(1)).to.be.eq(shares[1]);
          expect(await integratedCakeMaxiWorker.shareToBalance(await integratedCakeMaxiWorker.shares(1))).to.be.eq(
            computeShareToBalance(shares[1], totalShare, totalBalance)
          );
          expect(await cake.balanceOf(eveAddress)).to.be.eq(totalReinvestFee);
          expect(await integratedCakeMaxiWorker.rewardBalance()).to.be.eq(0);
          expect(await wbnb.balanceOf(integratedVault.address)).to.be.eq(ethers.utils.parseEther("0.95"));
          expect(await integratedCakeMaxiWorker.buybackAmount()).to.be.eq(accumBuybackAmount);

          // reinvest..
          await integratedCakeMaxiWorkerAsEve.reinvest();

          // --- Compute ---
          // Put it as 1 wei because CakePool stake 1 wei to MCv2
          cakeEarned = swapHelper.computeTotalRewards(
            1,
            CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
            1,
            ethers.constants.WeiPerEther
          );
          // Apply performance fee
          cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
          // Apply reinvest fee
          reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
          cakeForBeneficialVault = reinvestFee.mul(BENEFICIALVAULT_BOUNTY_BPS).div(10000);
          beneficialVaultReceivedAmts = await swapHelper.computeSwapExactTokensForTokens(
            cakeForBeneficialVault,
            rewardPath,
            true
          );
          cakeEarned = cakeEarned.sub(reinvestFee);
          totalBalance = totalBalance.add(cakeEarned);
          accumBuybackAmount = accumBuybackAmount.add(
            beneficialVaultReceivedAmts[beneficialVaultReceivedAmts.length - 1]
          );
          totalReinvestFee = totalReinvestFee.add(reinvestFee.sub(cakeForBeneficialVault));
          totalBeneficialVaultReceived = totalBeneficialVaultReceived.add(
            beneficialVaultReceivedAmts[beneficialVaultReceivedAmts.length - 1]
          );

          expect(await cake.balanceOf(eveAddress)).to.be.eq(totalReinvestFee);
          expect(await wbnb.balanceOf(integratedVault.address)).to.be.eq(
            ethers.utils.parseEther("0.95").add(totalBeneficialVaultReceived)
          );
          expect(await integratedCakeMaxiWorker.buybackAmount()).to.be.eq(0);

          // Now it's a liquidation part
          await cake.approve(routerV2.address, constants.MaxUint256);
          // alice sell CAKE so that the price will be fluctuated, hence position can be liquidated
          await routerV2.swapExactTokensForTokens(
            ethers.utils.parseEther("1.5"),
            0,
            [cake.address, wbnb.address],
            aliceAddress,
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

          const bobBalanceBefore = await ethers.provider.getBalance(await bob.getAddress());
          const aliceBalanceBefore = await ethers.provider.getBalance(await alice.getAddress());
          const vaultBalanceBefore = await wbnb.balanceOf(integratedVault.address);
          const deployerBalanceBefore = await ethers.provider.getBalance(await deployer.getAddress());
          const vaultDebtVal = await integratedVault.vaultDebtVal();
          const debt = await integratedVault.debtShareToVal((await integratedVault.positions(1)).debtShare);

          await swapHelper.loadReserves(path);
          await swapHelper.loadReserves(reversePath);

          // bob call `kill` alice's position, which is position #1
          await integratedVaultAsBob.kill(1, {
            gasPrice: 0,
          });

          // --- Compute ---
          // Put it as 1 wei because CakePool stake 1 wei to MCv2
          cakeEarned = swapHelper.computeTotalRewards(
            1,
            CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
            4,
            ethers.constants.WeiPerEther
          );
          // Apply performance fee
          cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
          // Apply reinvest fee
          reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
          cakeForBeneficialVault = reinvestFee.mul(BENEFICIALVAULT_BOUNTY_BPS).div(10000);
          beneficialVaultReceivedAmts = await swapHelper.computeSwapExactTokensForTokens(
            cakeForBeneficialVault,
            rewardPath,
            true
          );
          cakeEarned = cakeEarned.sub(reinvestFee);
          totalBalance = totalBalance.add(cakeEarned);
          // Compute liquidate
          amtsOut = await swapHelper.computeSwapExactTokensForTokens(totalBalance, reversePath, true);
          const liquidationBounty = amtsOut[amtsOut.length - 1].mul(KILL_PRIZE_BPS).div(10000);
          const treasuryKillBps = amtsOut[amtsOut.length - 1].mul(KILL_TREASURY_BPS).div(10000);
          const totalLiquidationFees = liquidationBounty.add(treasuryKillBps);
          const left = debt.gte(amtsOut[amtsOut.length - 1])
            ? ethers.constants.Zero
            : amtsOut[amtsOut.length - 1].sub(totalLiquidationFees).sub(debt);
          const repaid = debt.gte(amtsOut[amtsOut.length - 1].sub(totalLiquidationFees))
            ? amtsOut[amtsOut.length - 1].sub(totalLiquidationFees)
            : debt;

          // Compute accounting
          shares[0] = ethers.constants.Zero;
          totalShare = ethers.constants.Zero;
          totalBalance = ethers.constants.Zero;

          const bobBalanceAfter = await ethers.provider.getBalance(bobAddress);
          const aliceBalanceAfter = await ethers.provider.getBalance(aliceAddress);
          const vaultBalanceAfter = await wbnb.balanceOf(integratedVault.address);
          const deployerBalanceAfter = await ethers.provider.getBalance(deployerAddress);
          expect(deployerBalanceAfter.sub(deployerBalanceBefore)).to.be.eq(treasuryKillBps);
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
          "CakeMaxiWorker02MCV2::setBeneficialVaultBountyBps:: _beneficialVaultBountyBps exceeds 100%"
        );
      });
    });

    context("when the param is correct", async () => {
      it("should successfully set the beneficial vault bounty bps", async () => {
        expect(await cakeMaxiWorkerNonNative.beneficialVaultBountyBps()).to.eq(BigNumber.from("0"));
        await expect(cakeMaxiWorkerNonNative.setBeneficialVaultBountyBps(BigNumber.from("10000"))).not.to.revertedWith(
          "CakeMaxiWorker02MCV2::setBeneficialVaultBountyBps:: _beneficialVaultBountyBps exceeds 100%"
        );
        expect(await cakeMaxiWorkerNonNative.beneficialVaultBountyBps()).to.eq(BigNumber.from("10000"));
        await expect(cakeMaxiWorkerNonNative.setBeneficialVaultBountyBps(BigNumber.from("5000"))).not.to.revertedWith(
          "CakeMaxiWorker02MCV2::setBeneficialVaultBountyBps:: _beneficialVaultBountyBps exceeds 100%"
        );
        expect(await cakeMaxiWorkerNonNative.beneficialVaultBountyBps()).to.eq(BigNumber.from("5000"));
      });
    });
  });

  describe("#CakePool withdrawalFee", async () => {
    context("When the withdrawal fee is on", async () => {
      it("should not allow deposit into positions", async () => {
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
        expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(
          ethers.utils.parseEther("0.00907024323709934")
        );
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.00907024323709934"));
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
          ethers.utils.parseEther("0.00907024323709934")
        );

        // Turn withdrawal fee back on
        await cakePool.setWithdrawFeeUser(cakeMaxiWorkerNative.address, false);

        await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther("0.1"));
        await expect(
          cakeMaxiWorkerNativeAsAlice.work(
            0,
            await alice.getAddress(),
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAdd.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
            )
          )
        ).to.be.revertedWith("CakeMaxiWorker02MCV2::deposit::cannot deposit with withdrawal fee on");
      });

      it("should allow fully closing position", async () => {
        let shares: Record<number, BigNumber> = [];
        let totalShare: BigNumber = ethers.constants.Zero;
        let totalBalance: BigNumber = ethers.constants.Zero;
        let totalReinvestFee: BigNumber = ethers.constants.Zero;
        const [path, reversePath] = await Promise.all([
          cakeMaxiWorkerNative.getPath(),
          cakeMaxiWorkerNative.getReversedPath(),
        ]);
        const performanceFee = await cakePool.performanceFeeContract();

        await swapHelper.loadReserves(path);

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

        // --- Compute ---
        let amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
        shares[0] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
        totalShare = totalShare.add(shares[0]);
        totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

        expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
          amtsOut[amtsOut.length - 1]
        );

        // Turn withdrawal fee back on
        await cakePool.setWithdrawFeeUser(cakeMaxiWorkerNative.address, false);
        const invertedWithdrawalFee = BigNumber.from(10000).sub(await cakePool.withdrawFeeContract());

        await swapHelper.loadReserves(reversePath);

        // Alice call liquidate strategy to close her position
        // once alice call function `work()` the `reinvest()` will be triggered
        const aliceBaseTokenBefore = await wbnb.balanceOf(await alice.getAddress());
        const aliceFarmingTokenBefore = await cake.balanceOf(await alice.getAddress());
        await cakeMaxiWorkerNativeAsAlice.work(
          0,
          await alice.getAddress(),
          0,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [stratLiq.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0")])]
          )
        );

        // --- Compute ---
        // Put it as 1 wei because CakePool stake 1 wei to MCv2
        let cakeEarned = swapHelper.computeTotalRewards(
          1,
          CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
          2,
          ethers.constants.WeiPerEther
        );
        // Apply performance fee
        cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
        // Apply reinvest fee
        let reinvestFee = cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000);
        totalReinvestFee = totalReinvestFee.add(reinvestFee.mul(invertedWithdrawalFee).div(10000));
        cakeEarned = cakeEarned.sub(reinvestFee);
        totalBalance = totalBalance.add(cakeEarned);
        // Apply withdraw fee
        totalBalance = totalBalance.mul(invertedWithdrawalFee).div(10000);
        // Compute liquidate
        amtsOut = await swapHelper.computeSwapExactTokensForTokens(totalBalance, reversePath, true);
        // Compute accounting
        shares[0] = ethers.constants.Zero;
        totalShare = ethers.constants.Zero;
        totalBalance = ethers.constants.Zero;

        const aliceBaseTokenAfter = await wbnb.balanceOf(await alice.getAddress());
        const aliceFarmingTokenAfter = await cake.balanceOf(await alice.getAddress());

        expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.be.eq(0);
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(0);
        expect(await cakeMaxiWorkerNative.rewardBalance()).to.be.eq(0);
        expect(await cake.balanceOf(eveAddress)).to.be.eq(totalReinvestFee);
        expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.be.eq(amtsOut[amtsOut.length - 1]);
        expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.eq(0);
      });

      it("should not allow partial closing position", async () => {
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
        expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(
          ethers.utils.parseEther("0.00907024323709934")
        );
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther("0.00907024323709934"));

        // Turn withdrawal fee back on
        await cakePool.setWithdrawFeeUser(cakeMaxiWorkerNative.address, false);
        const invertedWithdrawalFee = BigNumber.from(10000).sub(await cakePool.withdrawFeeContract());
        // Alice call liquidate strategy to close her position
        // once alice call function `work()` the `reinvest()` will be triggered
        await expect(
          cakeMaxiWorkerNativeAsAlice.work(
            0,
            await alice.getAddress(),
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                stratPartialCloseLiquidate.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [
                    ethers.utils.parseEther("5.82453512161854967"),
                    ethers.utils.parseEther("0"),
                    ethers.utils.parseEther("0"),
                  ]
                ),
              ]
            )
          )
        ).to.be.revertedWith("CakeMaxiWorker02MCV2::deposit::cannot deposit with withdrawal fee on");
      });

      it("should calculate position's health correctly with fees", async () => {
        let shares: Record<number, BigNumber> = [];
        let totalShare: BigNumber = ethers.constants.Zero;
        let totalBalance: BigNumber = ethers.constants.Zero;
        let totalReinvestFee: BigNumber = ethers.constants.Zero;
        const [path, reversePath] = await Promise.all([
          cakeMaxiWorkerNative.getPath(),
          cakeMaxiWorkerNative.getReversedPath(),
        ]);
        const performanceFee = await cakePool.performanceFeeContract();

        await swapHelper.loadReserves(path);

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

        // --- Compute ---
        let amtsOut = await swapHelper.computeSwapExactTokensForTokens(ethers.utils.parseEther("0.1"), path, true);
        shares[0] = computeBalanceToShare(amtsOut[amtsOut.length - 1], 0, 0);
        totalShare = totalShare.add(shares[0]);
        totalBalance = totalBalance.add(amtsOut[amtsOut.length - 1]);

        expect(await getUserCakeStakedBalance(cakeMaxiWorkerNative.address)).to.eq(totalBalance);
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(shares[0]);
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(
          amtsOut[amtsOut.length - 1]
        );

        // Set up swap helper
        const invertedWithdrawalFee = BigNumber.from(10000).sub(await cakePool.withdrawFeeContract());

        // Turn withdrawal fee back on
        await cakePool.setWithdrawFeeUser(cakeMaxiWorkerNative.address, false);

        // --- Compute ---
        // Put it as 1 wei because CakePool stake 1 wei to MCv2
        let cakeEarned = swapHelper.computeTotalRewards(
          1,
          CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_SPECIAL_FARM).div(CAKE_RATE_TOTAL_PRECISION),
          1,
          ethers.constants.WeiPerEther
        );
        // Apply performance fee
        cakeEarned = cakeEarned.sub(cakeEarned.mul(performanceFee).div(10000));
        // Apply reinvest fee
        cakeEarned = cakeEarned.sub(cakeEarned.mul(REINVEST_BOUNTY_BPS).div(10000));
        totalBalance = totalBalance.add(cakeEarned);
        // Apply withdrawal fee
        const withdrawableAmount = totalBalance.mul(invertedWithdrawalFee).div(10000);
        // Compute liquidate
        amtsOut = await swapHelper.computeSwapExactTokensForTokens(withdrawableAmount, reversePath, true);

        expect(await cakeMaxiWorkerNative.health(0)).to.be.eq(amtsOut[amtsOut.length - 1]);
        expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.be.eq(
          computeShareToBalance(shares[0], totalShare, totalBalance)
        );
      });
    });
  });
});
