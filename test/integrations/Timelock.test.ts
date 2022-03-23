import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  AlpacaToken,
  AlpacaToken__factory,
  ConfigurableInterestVaultConfig,
  ConfigurableInterestVaultConfig__factory,
  DebtToken,
  DebtToken__factory,
  FairLaunch,
  FairLaunch__factory,
  MockERC20,
  MockERC20__factory,
  SimplePriceOracle,
  SimplePriceOracle__factory,
  SimpleVaultConfig,
  SimpleVaultConfig__factory,
  StrategyAddBaseTokenOnly,
  StrategyAddBaseTokenOnly__factory,
  StrategyLiquidate,
  Timelock,
  Timelock__factory,
  WorkerConfig,
  WorkerConfig__factory,
  Vault,
  Vault__factory,
  WETH,
  WETH__factory,
  PancakeMasterChef,
  PancakeswapWorker,
  PancakeswapWorker__factory,
  CakeToken,
  CakeToken__factory,
  PancakeMasterChef__factory,
  SyrupBar__factory,
  SyrupBar,
  PancakeFactory,
  PancakeRouter,
  PancakePair,
  PancakeFactory__factory,
  PancakeRouter__factory,
  PancakePair__factory,
} from "../../typechain";
import * as TimeHelpers from "../helpers/time";

chai.use(solidity);
const { expect } = chai;

describe("Timelock", () => {
  /// Constant
  const ADDRESS0 = "0x0000000000000000000000000000000000000000";
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther("5000");
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther("0.076");
  const REINVEST_BOUNTY_BPS = "100"; // 1% reinvest bounty
  const RESERVE_POOL_BPS = "1000"; // 10% reserve pool
  const KILL_PRIZE_BPS = "300"; // 3% Kill prize
  const INTEREST_RATE = "3472222222222"; // 30% per year
  const MIN_DEBT_SIZE = "1"; // 1 ETH min debt size
  const WORK_FACTOR = "7000";
  const KILL_FACTOR = "8000";
  const MAX_PRICE_DIFF = "1300";
  const KILL_TREASURY_BPS = "100";

  // Timelock-related instance(s)
  let timelock: Timelock;

  /// Pancakeswap-related instance(s)
  let factory: PancakeFactory;
  let wbnb: WETH;
  let router: PancakeRouter;
  let lp: PancakePair;

  /// Token-related instance(s)
  let quoteToken: MockERC20;
  let baseToken: MockERC20;
  let cake: CakeToken;
  let syrup: SyrupBar;

  /// Strategy-ralted instance(s)
  let addStrat: StrategyAddBaseTokenOnly;
  let liqStrat: StrategyLiquidate;

  /// Vault-related instance(s)
  let simpleVaultConfig: SimpleVaultConfig;
  let configurableInterestVaultConfig: ConfigurableInterestVaultConfig;
  let vault: Vault;

  /// FairLaunch-related instance(s)
  let fairLaunch: FairLaunch;
  let alpacaToken: AlpacaToken;

  /// PancakeswapWorker-related instance(s)
  let masterChef: PancakeMasterChef;
  let poolId: number;
  let pancakeswapWorker: PancakeswapWorker;
  let pancakeswapWorkerConfig: WorkerConfig;

  /// SimpleOracle-related instance(s)
  let simplePriceOracle: SimplePriceOracle;

  // Contract Signer
  let configurableInterestVaultConfigAsAlice: ConfigurableInterestVaultConfig;
  let fairLaunchAsAlice: FairLaunch;
  let simpleVaultConfigAsAlice: SimpleVaultConfig;
  let simplePriceOracleAsAlice: SimplePriceOracle;
  let pancakeswapWorkerConfigAsAlice: WorkerConfig;
  let pancakeswapWorkerAsAlice: PancakeswapWorker;
  let timelockAsAdmin: Timelock;
  let vaultAsAlice: Vault;

  // Accounts
  let deployer: Signer;
  let admin: Signer;
  let alice: Signer;
  let bob: Signer;

  async function fixture() {
    [deployer, admin, alice, bob] = await ethers.getSigners();

    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
    factory = await PancakeFactory.deploy(await deployer.getAddress());
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();
    await factory.deployed();

    const PancakeRouter = (await ethers.getContractFactory("PancakeRouter", deployer)) as PancakeRouter__factory;
    router = await PancakeRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

    /// Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    baseToken = (await upgrades.deployProxy(MockERC20, ["BTOKEN", "BTOKEN", 18])) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
    quoteToken = (await upgrades.deployProxy(MockERC20, ["FTOKEN", "FTOKEN", 18])) as MockERC20;
    await quoteToken.deployed();
    await quoteToken.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));
    await quoteToken.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
    await quoteToken.mint(await bob.getAddress(), ethers.utils.parseEther("100"));

    const CakeToken = (await ethers.getContractFactory("CakeToken", deployer)) as CakeToken__factory;
    cake = await CakeToken.deploy();
    await cake.deployed();
    await cake["mint(address,uint256)"](await deployer.getAddress(), ethers.utils.parseEther("100"));

    const SyrupBar = (await ethers.getContractFactory("SyrupBar", deployer)) as SyrupBar__factory;
    syrup = await SyrupBar.deploy(cake.address);
    await syrup.deployed();

    /// Setup BTOKEN-FTOKEN pair on Pancakeswap
    await factory.createPair(baseToken.address, quoteToken.address);
    lp = PancakePair__factory.connect(await factory.getPair(quoteToken.address, baseToken.address), deployer);
    await lp.deployed();

    /// Setup Strategy
    const StrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "StrategyAddBaseTokenOnly",
      deployer
    )) as StrategyAddBaseTokenOnly__factory;
    addStrat = (await upgrades.deployProxy(StrategyAddBaseTokenOnly, [router.address])) as StrategyAddBaseTokenOnly;
    await addStrat.deployed();

    const StrategyLiquidate = (await ethers.getContractFactory(
      "StrategyLiquidate",
      deployer
    )) as StrategyAddBaseTokenOnly__factory;
    liqStrat = (await upgrades.deployProxy(StrategyLiquidate, [router.address])) as StrategyLiquidate;
    await liqStrat.deployed();

    // Setup FairLaunch contract
    // Deploy ALPACAs
    const AlpacaToken = (await ethers.getContractFactory("AlpacaToken", deployer)) as AlpacaToken__factory;
    alpacaToken = await AlpacaToken.deploy(132, 137);
    await alpacaToken.deployed();

    const FairLaunch = (await ethers.getContractFactory("FairLaunch", deployer)) as FairLaunch__factory;
    fairLaunch = await FairLaunch.deploy(
      alpacaToken.address,
      await alice.getAddress(),
      ALPACA_REWARD_PER_BLOCK,
      0,
      ALPACA_BONUS_LOCK_UP_BPS,
      0
    );
    await fairLaunch.deployed();

    await alpacaToken.transferOwnership(fairLaunch.address);

    // Config & Deploy Vault ibWBTC
    // Create a new instance of VaultConfig & Vault
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
      ADDRESS0,
      fairLaunch.address,
      KILL_TREASURY_BPS,
      await deployer.getAddress(),
    ])) as SimpleVaultConfig;
    await simpleVaultConfig.deployed();

    const ConfigurableInterestVaultConfig = (await ethers.getContractFactory(
      "ConfigurableInterestVaultConfig",
      deployer
    )) as ConfigurableInterestVaultConfig__factory;
    configurableInterestVaultConfig = (await upgrades.deployProxy(ConfigurableInterestVaultConfig, [
      MIN_DEBT_SIZE,
      RESERVE_POOL_BPS,
      KILL_PRIZE_BPS,
      ADDRESS0,
      ADDRESS0,
      ADDRESS0,
      fairLaunch.address,
      KILL_TREASURY_BPS,
      await deployer.getAddress(),
    ])) as ConfigurableInterestVaultConfig;
    await configurableInterestVaultConfig.deployed();

    const DebtToken = (await ethers.getContractFactory("DebtToken", deployer)) as DebtToken__factory;
    const debtToken = (await upgrades.deployProxy(DebtToken, [
      "debtibBTOKEN_V2",
      "debtibBTOKEN_V2",
      18,
      await deployer.getAddress(),
    ])) as DebtToken;
    await debtToken.deployed();

    const Vault = (await ethers.getContractFactory("Vault", deployer)) as Vault__factory;
    vault = (await upgrades.deployProxy(Vault, [
      simpleVaultConfig.address,
      baseToken.address,
      "Interest Bearing WBTC",
      "ibWBTC",
      18,
      debtToken.address,
    ])) as Vault;
    await vault.deployed();

    // Set add FairLaunch poool and set fairLaunchPoolId for Vault
    await fairLaunch.addPool(1, await vault.debtToken(), false);
    await vault.setFairLaunchPoolId(0);

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
    // Add lp to masterChef's pool
    await masterChef.add(1, lp.address, false);

    /// Setup PancakeswapWorker
    poolId = 1;
    const PancakeswapWorker = (await ethers.getContractFactory(
      "PancakeswapWorker",
      deployer
    )) as PancakeswapWorker__factory;
    pancakeswapWorker = (await upgrades.deployProxy(PancakeswapWorker, [
      vault.address,
      baseToken.address,
      masterChef.address,
      router.address,
      poolId,
      addStrat.address,
      liqStrat.address,
      REINVEST_BOUNTY_BPS,
    ])) as PancakeswapWorker;
    await pancakeswapWorker.deployed();
    await simpleVaultConfig.setWorker(pancakeswapWorker.address, true, true, WORK_FACTOR, KILL_FACTOR, true, true);

    /// Deploy SimpleOracle
    const SimplePriceOracle = (await ethers.getContractFactory(
      "SimplePriceOracle",
      deployer
    )) as SimplePriceOracle__factory;
    simplePriceOracle = (await upgrades.deployProxy(SimplePriceOracle, [ADDRESS0])) as SimplePriceOracle;
    await simplePriceOracle.deployed();

    /// Deploy WorkerConfig
    const WorkerConfig = (await ethers.getContractFactory("WorkerConfig", deployer)) as WorkerConfig__factory;
    pancakeswapWorkerConfig = (await upgrades.deployProxy(WorkerConfig, [simplePriceOracle.address])) as WorkerConfig;
    await pancakeswapWorkerConfig.deployed();

    /// Deploy Timelock
    const Timelock = (await ethers.getContractFactory("Timelock", deployer)) as Timelock__factory;
    timelock = await Timelock.deploy(await admin.getAddress(), "259200");
    await timelock.deployed();

    /// transfer ownership to Timelock contract
    await fairLaunch.transferOwnership(timelock.address);
    await simpleVaultConfig.transferOwnership(timelock.address);
    await configurableInterestVaultConfig.transferOwnership(timelock.address);
    await vault.transferOwnership(timelock.address);
    await pancakeswapWorker.transferOwnership(timelock.address);
    await pancakeswapWorkerConfig.transferOwnership(timelock.address);
    await simplePriceOracle.transferOwnership(timelock.address);

    // Setup contract signer
    configurableInterestVaultConfigAsAlice = ConfigurableInterestVaultConfig__factory.connect(
      configurableInterestVaultConfig.address,
      alice
    );
    timelockAsAdmin = Timelock__factory.connect(timelock.address, admin);
    fairLaunchAsAlice = FairLaunch__factory.connect(fairLaunch.address, alice);
    vaultAsAlice = Vault__factory.connect(vault.address, alice);
    pancakeswapWorkerAsAlice = PancakeswapWorker__factory.connect(pancakeswapWorker.address, alice);
    pancakeswapWorkerConfigAsAlice = WorkerConfig__factory.connect(pancakeswapWorkerConfig.address, alice);
    simplePriceOracleAsAlice = SimplePriceOracle__factory.connect(simplePriceOracle.address, alice);
    simpleVaultConfigAsAlice = SimpleVaultConfig__factory.connect(simpleVaultConfig.address, alice);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("when non-owner try to adjust params", async () => {
    it("should not allow to do so on FairLaunch contract", async () => {
      // Check all functions that can adjust params in FairLaunch contract
      await expect(fairLaunchAsAlice.transferOwnership(await bob.getAddress())).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
      await expect(fairLaunchAsAlice.setBonus(10000, 1000, 1000)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
      await expect(fairLaunchAsAlice.addPool(1, wbnb.address, false)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
      await expect(fairLaunchAsAlice.setPool(1, 1, false)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should not allow to do so on Vault contract", async () => {
      // Check all functions that can adjust params in Vault contract
      await expect(vaultAsAlice.updateConfig(ADDRESS0)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(vaultAsAlice.setFairLaunchPoolId(1)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(vaultAsAlice.withdrawReserve(ADDRESS0, ethers.utils.parseEther("1"))).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
      await expect(vaultAsAlice.reduceReserve(ethers.utils.parseEther("1"))).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should not allow to do so on Worker contract", async () => {
      await expect(pancakeswapWorkerAsAlice.setReinvestBountyBps(100)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
      await expect(pancakeswapWorkerAsAlice.setStrategyOk([ADDRESS0], true)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
      await expect(pancakeswapWorkerAsAlice.setCriticalStrategies(ADDRESS0, ADDRESS0)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should not allow to do so on SimplePriceOracle contract", async () => {
      await expect(simplePriceOracleAsAlice.setFeeder(ADDRESS0)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should not allow to do so on SimpleVaultConfig", async () => {
      await expect(
        simpleVaultConfigAsAlice.setParams(1, 1, 1, ADDRESS0, ADDRESS0, ADDRESS0, ADDRESS0, 1, ADDRESS0)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(simpleVaultConfigAsAlice.setWorker(ADDRESS0, true, true, 1, 1, true, true)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should not allow to do so on ConfigurableInterestVaultConfig", async () => {
      await expect(
        configurableInterestVaultConfigAsAlice.setParams(1, 1, 1, ADDRESS0, ADDRESS0, ADDRESS0, ADDRESS0, 1, ADDRESS0)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(configurableInterestVaultConfigAsAlice.setWorkers([ADDRESS0], [ADDRESS0])).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should not allow to do so on WorkerConfig", async () => {
      await expect(pancakeswapWorkerConfig.setOracle(ADDRESS0)).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        pancakeswapWorkerConfig.setConfigs(
          [ADDRESS0],
          [{ acceptDebt: true, workFactor: 1, killFactor: 1, maxPriceDiff: 1 }]
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  context("when timelock adjust params", async () => {
    it("should setBonus in FairLaunch contract", async () => {
      const eta = (await TimeHelpers.latest()).add(TimeHelpers.duration.days(ethers.BigNumber.from("4")));
      await timelockAsAdmin.queueTransaction(
        fairLaunch.address,
        "0",
        "setBonus(uint256,uint256,uint256)",
        ethers.utils.defaultAbiCoder.encode(["uint256", "uint256", "uint256"], [10, 500000, 1]),
        eta
      );

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

      await expect(
        timelockAsAdmin.executeTransaction(
          fairLaunch.address,
          "0",
          "setBonus(uint256,uint256,uint256)",
          ethers.utils.defaultAbiCoder.encode(["uint256", "uint256", "uint256"], ["10", "500000", "1"]),
          eta
        )
      ).to.be.revertedWith("Timelock::executeTransaction: Transaction hasn't surpassed time lock.");

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("4")));

      await timelockAsAdmin.executeTransaction(
        fairLaunch.address,
        "0",
        "setBonus(uint256,uint256,uint256)",
        ethers.utils.defaultAbiCoder.encode(["uint256", "uint256", "uint256"], ["10", "500000", "1"]),
        eta
      );

      expect(await fairLaunch.bonusMultiplier()).to.be.eq("10");
      expect(await fairLaunch.bonusEndBlock()).to.be.eq("500000");
      expect(await fairLaunch.bonusLockUpBps()).to.be.eq("1");
    });

    it("should set oracle in WorkerConfig", async () => {
      const eta = (await TimeHelpers.latest()).add(TimeHelpers.duration.days(ethers.BigNumber.from("4")));
      await timelockAsAdmin.queueTransaction(
        pancakeswapWorkerConfig.address,
        "0",
        "setOracle(address)",
        ethers.utils.defaultAbiCoder.encode(["address"], [await bob.getAddress()]),
        eta
      );

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

      await expect(
        timelockAsAdmin.executeTransaction(
          pancakeswapWorkerConfig.address,
          "0",
          "setOracle(address)",
          ethers.utils.defaultAbiCoder.encode(["address"], [await bob.getAddress()]),
          eta
        )
      ).to.be.revertedWith("Timelock::executeTransaction: Transaction hasn't surpassed time lock.");

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("4")));

      await timelockAsAdmin.executeTransaction(
        pancakeswapWorkerConfig.address,
        "0",
        "setOracle(address)",
        ethers.utils.defaultAbiCoder.encode(["address"], [await bob.getAddress()]),
        eta
      );

      expect(await pancakeswapWorkerConfig.oracle()).to.be.eq(await bob.getAddress());
    });

    it("should setConfigs in WorkerConfig", async () => {
      const eta = (await TimeHelpers.latest()).add(TimeHelpers.duration.days(ethers.BigNumber.from("4")));

      await timelockAsAdmin.queueTransaction(
        pancakeswapWorkerConfig.address,
        "0",
        "setConfigs(address[],(bool,uint64,uint64,uint64)[])",
        ethers.utils.defaultAbiCoder.encode(
          ["address[]", "(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]"],
          [
            [await bob.getAddress()],
            [{ acceptDebt: true, workFactor: WORK_FACTOR, killFactor: KILL_FACTOR, maxPriceDiff: MAX_PRICE_DIFF }],
          ]
        ),
        eta
      );

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

      await expect(
        timelockAsAdmin.executeTransaction(
          pancakeswapWorkerConfig.address,
          "0",
          "setConfigs(address[],(bool,uint64,uint64,uint64)[])",
          ethers.utils.defaultAbiCoder.encode(
            ["address[]", "(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]"],
            [
              [await bob.getAddress()],
              [{ acceptDebt: true, workFactor: WORK_FACTOR, killFactor: KILL_FACTOR, maxPriceDiff: MAX_PRICE_DIFF }],
            ]
          ),
          eta
        )
      ).to.be.revertedWith("Timelock::executeTransaction: Transaction hasn't surpassed time lock.");

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("4")));

      await timelockAsAdmin.executeTransaction(
        pancakeswapWorkerConfig.address,
        "0",
        "setConfigs(address[],(bool,uint64,uint64,uint64)[])",
        ethers.utils.defaultAbiCoder.encode(
          ["address[]", "(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]"],
          [
            [await bob.getAddress()],
            [{ acceptDebt: true, workFactor: WORK_FACTOR, killFactor: KILL_FACTOR, maxPriceDiff: MAX_PRICE_DIFF }],
          ]
        ),
        eta
      );
    });
  });
});
