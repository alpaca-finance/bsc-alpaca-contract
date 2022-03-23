import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
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
  PancakeERC20,
  PancakeFactory,
  PancakeFactory__factory,
  PancakeMasterChef,
  PancakeMasterChef__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouter,
  PancakeRouterV2__factory,
  PancakeRouter__factory,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedStrategyLiquidate,
  PancakeswapV2RestrictedStrategyLiquidate__factory,
  PancakeswapV2StrategyAddBaseTokenOnly,
  PancakeswapV2StrategyAddBaseTokenOnly__factory,
  PancakeswapV2StrategyAddTwoSidesOptimalMigrate,
  PancakeswapV2StrategyAddTwoSidesOptimalMigrate__factory,
  PancakeswapV2StrategyLiquidate,
  PancakeswapV2StrategyLiquidate__factory,
  PancakeswapV2Worker,
  PancakeswapV2WorkerMigrate,
  PancakeswapV2WorkerMigrate__factory,
  PancakeswapV2Worker__factory,
  PancakeswapWorker,
  PancakeswapWorker__factory,
  SimpleVaultConfig,
  SimpleVaultConfig__factory,
  StrategyAddBaseTokenOnly,
  StrategyAddBaseTokenOnly__factory,
  StrategyLiquidate,
  StrategyLiquidate__factory,
  StrategyPartialCloseLiquidate,
  StrategyPartialCloseLiquidate__factory,
  SyrupBar,
  SyrupBar__factory,
  Vault,
  Vault__factory,
  WNativeRelayer,
  WNativeRelayer__factory,
} from "../../../../../typechain";
import * as AssertHelpers from "../../../../helpers/assert";
import * as TimeHelpers from "../../../../helpers/time";

chai.use(solidity);
const { expect } = chai;

describe("Vault - Pancakeswap Migrate", () => {
  const FOREVER = "2000000000";
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther("5000");
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther("0.076");
  const REINVEST_BOUNTY_BPS = "100"; // 1% reinvest bounty
  const RESERVE_POOL_BPS = "1000"; // 10% reserve pool
  const KILL_PRIZE_BPS = "1000"; // 10% Kill prize
  const INTEREST_RATE = "3472222222222"; // 30% per year
  const MIN_DEBT_SIZE = ethers.utils.parseEther("1"); // 1 BTOKEN min debt size
  const WORK_FACTOR = "7000";
  const KILL_FACTOR = "8000";
  const KILL_TREASURY_BPS = "100";

  /// Pancakeswap-related instance(s)
  let factory: PancakeFactory;
  let router: PancakeRouter;

  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouter;

  let wbnb: MockWBNB;
  let lp: PancakePair;
  let lpV2: PancakePair;

  /// Token-related instance(s)
  let baseToken: MockERC20;
  let farmToken: MockERC20;
  let cake: CakeToken;
  let syrup: SyrupBar;
  let debtToken: DebtToken;

  /// Strategy-ralted instance(s)
  let addStrat: StrategyAddBaseTokenOnly;
  let liqStrat: StrategyLiquidate;
  let addStratV2: PancakeswapV2StrategyAddBaseTokenOnly;
  let liqStratV2: PancakeswapV2StrategyLiquidate;
  let partialCloseStrat: StrategyPartialCloseLiquidate;
  let twoSidesOptimalMigrate: PancakeswapV2StrategyAddTwoSidesOptimalMigrate;

  /// Vault-related instance(s)
  let simpleVaultConfig: SimpleVaultConfig;
  let wNativeRelayer: WNativeRelayer;
  let vault: Vault;

  /// FairLaunch-related instance(s)
  let fairLaunch: FairLaunch;
  let alpacaToken: AlpacaToken;

  /// PancakeswapMasterChef-related instance(s)
  let masterChef: PancakeMasterChef;
  let poolId: number;
  let lpV2poolId: number;
  let pancakeswapWorker: PancakeswapWorker;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let eve: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let fairLaunchAsAlice: FairLaunch;
  let fairLaunchAsBob: FairLaunch;

  let lpAsAlice: PancakePair;
  let lpAsBob: PancakePair;

  let pancakeMasterChefAsAlice: PancakeMasterChef;
  let pancakeMasterChefAsBob: PancakeMasterChef;

  let pancakeswapWorkerAsEve: PancakeswapWorker;

  let vaultAsAlice: Vault;
  let vaultAsBob: Vault;
  let vaultAsEve: Vault;

  async function fixture() {
    [deployer, alice, bob, eve] = await ethers.getSigners();

    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
    factory = await PancakeFactory.deploy(await deployer.getAddress());
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory("MockWBNB", deployer)) as MockWBNB__factory;
    wbnb = await WBNB.deploy();
    await factory.deployed();

    const PancakeRouter = (await ethers.getContractFactory("PancakeRouter", deployer)) as PancakeRouter__factory;
    router = await PancakeRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

    /// Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    baseToken = (await upgrades.deployProxy(MockERC20, ["BTOKEN", "BTOKEN", 18])) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(await deployer.getAddress(), ethers.utils.parseEther("1000"));
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther("1000"));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther("1000"));
    farmToken = (await upgrades.deployProxy(MockERC20, ["FTOKEN", "FTOKEN", 18])) as MockERC20;
    await farmToken.deployed();
    await farmToken.mint(await deployer.getAddress(), ethers.utils.parseEther("1000"));
    await farmToken.mint(await alice.getAddress(), ethers.utils.parseEther("1000"));
    await farmToken.mint(await bob.getAddress(), ethers.utils.parseEther("1000"));

    const CakeToken = (await ethers.getContractFactory("CakeToken", deployer)) as CakeToken__factory;
    cake = await CakeToken.deploy();
    await cake.deployed();
    await cake["mint(address,uint256)"](await deployer.getAddress(), ethers.utils.parseEther("100"));

    const SyrupBar = (await ethers.getContractFactory("SyrupBar", deployer)) as SyrupBar__factory;
    syrup = await SyrupBar.deploy(cake.address);
    await syrup.deployed();

    /// Setup BTOKEN-FTOKEN pair on Pancakeswap
    await factory.createPair(baseToken.address, farmToken.address);
    lp = PancakePair__factory.connect(await factory.getPair(farmToken.address, baseToken.address), deployer);
    await lp.deployed();

    /// Setup strategy
    const StrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "StrategyAddBaseTokenOnly",
      deployer
    )) as StrategyAddBaseTokenOnly__factory;
    addStrat = (await upgrades.deployProxy(StrategyAddBaseTokenOnly, [router.address])) as StrategyAddBaseTokenOnly;
    await addStrat.deployed();

    const StrategyLiquidate = (await ethers.getContractFactory(
      "StrategyLiquidate",
      deployer
    )) as StrategyLiquidate__factory;
    liqStrat = (await upgrades.deployProxy(StrategyLiquidate, [router.address])) as StrategyLiquidate;
    await liqStrat.deployed();

    const StrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "StrategyPartialCloseLiquidate",
      deployer
    )) as StrategyPartialCloseLiquidate__factory;
    partialCloseStrat = (await upgrades.deployProxy(StrategyPartialCloseLiquidate, [
      router.address,
    ])) as StrategyPartialCloseLiquidate;
    await partialCloseStrat.deployed();

    // Setup FairLaunch contract
    // Deploy ALPACAs
    const AlpacaToken = (await ethers.getContractFactory("AlpacaToken", deployer)) as AlpacaToken__factory;
    alpacaToken = await AlpacaToken.deploy(132, 137);
    await alpacaToken.deployed();

    const FairLaunch = (await ethers.getContractFactory("FairLaunch", deployer)) as FairLaunch__factory;
    fairLaunch = await FairLaunch.deploy(
      alpacaToken.address,
      await deployer.getAddress(),
      ALPACA_REWARD_PER_BLOCK,
      0,
      ALPACA_BONUS_LOCK_UP_BPS,
      0
    );
    await fairLaunch.deployed();

    await alpacaToken.transferOwnership(fairLaunch.address);

    // Config & Deploy Vault ibBTOKEN
    // Create a new instance of BankConfig & Vault
    const WNativeRelayer = (await ethers.getContractFactory("WNativeRelayer", deployer)) as WNativeRelayer__factory;
    wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
    await wNativeRelayer.deployed();

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
      KILL_TREASURY_BPS,
      await eve.getAddress(),
    ])) as SimpleVaultConfig;
    await simpleVaultConfig.deployed();

    const DebtToken = (await ethers.getContractFactory("DebtToken", deployer)) as DebtToken__factory;
    debtToken = (await upgrades.deployProxy(DebtToken, [
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
      "Interest Bearing BTOKEN",
      "ibBTOKEN",
      18,
      debtToken.address,
    ])) as Vault;
    await vault.deployed();

    await wNativeRelayer.setCallerOk([vault.address], true);

    // Transfer ownership to vault
    await debtToken.setOkHolders([vault.address, fairLaunch.address], true);
    await debtToken.transferOwnership(vault.address);

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
    await masterChef.add(1, lp.address, true);

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
    await pancakeswapWorker.setStrategyOk([partialCloseStrat.address], true);
    await pancakeswapWorker.setReinvestorOk([await eve.getAddress()], true);

    // Deployer adds 0.1 FTOKEN + 1 BTOKEN
    await baseToken.approve(router.address, ethers.utils.parseEther("1"));
    await farmToken.approve(router.address, ethers.utils.parseEther("0.1"));
    await router.addLiquidity(
      baseToken.address,
      farmToken.address,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("0.1"),
      "0",
      "0",
      await deployer.getAddress(),
      FOREVER
    );

    // Deployer adds 0.1 CAKE + 1 NATIVE
    await cake.approve(router.address, ethers.utils.parseEther("1"));
    await router.addLiquidityETH(
      cake.address,
      ethers.utils.parseEther("0.1"),
      "0",
      "0",
      await deployer.getAddress(),
      FOREVER,
      { value: ethers.utils.parseEther("1") }
    );

    // Deployer adds 1 BTOKEN + 1 NATIVE
    await baseToken.approve(router.address, ethers.utils.parseEther("1"));
    await router.addLiquidityETH(
      baseToken.address,
      ethers.utils.parseEther("1"),
      "0",
      "0",
      await deployer.getAddress(),
      FOREVER,
      { value: ethers.utils.parseEther("1") }
    );

    // Contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    lpAsAlice = PancakePair__factory.connect(lp.address, alice);
    lpAsBob = PancakePair__factory.connect(lp.address, bob);

    fairLaunchAsAlice = FairLaunch__factory.connect(fairLaunch.address, alice);
    fairLaunchAsBob = FairLaunch__factory.connect(fairLaunch.address, bob);

    pancakeMasterChefAsAlice = PancakeMasterChef__factory.connect(masterChef.address, alice);
    pancakeMasterChefAsBob = PancakeMasterChef__factory.connect(masterChef.address, bob);

    vaultAsAlice = Vault__factory.connect(vault.address, alice);
    vaultAsBob = Vault__factory.connect(vault.address, bob);
    vaultAsEve = Vault__factory.connect(vault.address, eve);

    pancakeswapWorkerAsEve = PancakeswapWorker__factory.connect(pancakeswapWorker.address, eve);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("when worker is initialized", async () => {
    it("should has FTOKEN as a farmingToken in PancakeswapWorker", async () => {
      expect(await pancakeswapWorker.farmingToken()).to.be.equal(farmToken.address);
    });

    it("should give rewards out when you stake LP tokens", async () => {
      // Deployer sends some LP tokens to Alice and Bob
      await lp.transfer(await alice.getAddress(), ethers.utils.parseEther("0.05"));
      await lp.transfer(await bob.getAddress(), ethers.utils.parseEther("0.05"));

      // Alice and Bob stake 0.01 LP tokens and waits for 1 day
      await lpAsAlice.approve(masterChef.address, ethers.utils.parseEther("0.01"));
      await lpAsBob.approve(masterChef.address, ethers.utils.parseEther("0.02"));
      await pancakeMasterChefAsAlice.deposit(poolId, ethers.utils.parseEther("0.01"));
      await pancakeMasterChefAsBob.deposit(poolId, ethers.utils.parseEther("0.02")); // alice +1 Reward

      // Alice and Bob withdraw stake from the pool
      await pancakeMasterChefAsBob.withdraw(poolId, ethers.utils.parseEther("0.02")); // alice +1/3 Reward  Bob + 2/3 Reward
      await pancakeMasterChefAsAlice.withdraw(poolId, ethers.utils.parseEther("0.01")); // alice +1 Reward

      AssertHelpers.assertAlmostEqual(
        (await cake.balanceOf(await alice.getAddress())).toString(),
        CAKE_REWARD_PER_BLOCK.mul(ethers.BigNumber.from(7)).div(ethers.BigNumber.from(3)).toString()
      );
      AssertHelpers.assertAlmostEqual(
        (await cake.balanceOf(await bob.getAddress())).toString(),
        CAKE_REWARD_PER_BLOCK.mul(2).div(3).toString()
      );
    });
  });

  context("when PCS migrate to V2", async () => {
    beforeEach(async () => {
      /// Setup PancakeV2
      const PancakeFactoryV2 = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
      factoryV2 = await PancakeFactoryV2.deploy(await deployer.getAddress());
      await factoryV2.deployed();

      const PancakeRouterV2 = (await ethers.getContractFactory(
        "PancakeRouterV2",
        deployer
      )) as PancakeRouterV2__factory;
      routerV2 = await PancakeRouterV2.deploy(factoryV2.address, wbnb.address);
      await routerV2.deployed();

      /// Setup BTOKEN-FTOKEN pair on PancakeswapV2
      await factoryV2.createPair(baseToken.address, farmToken.address);
      lpV2 = PancakePair__factory.connect(await factoryV2.getPair(farmToken.address, baseToken.address), deployer);
      await lpV2.deployed();

      /// Setup PancakeswapV2 strategies
      const PancakeswapV2StrategyAddBaseTokenOnly = (await ethers.getContractFactory(
        "PancakeswapV2StrategyAddBaseTokenOnly",
        deployer
      )) as PancakeswapV2StrategyAddBaseTokenOnly__factory;
      addStratV2 = (await upgrades.deployProxy(PancakeswapV2StrategyAddBaseTokenOnly, [
        routerV2.address,
      ])) as PancakeswapV2StrategyAddBaseTokenOnly;
      await addStratV2.deployed();

      const PancakeswapV2StrategyLiquidate = (await ethers.getContractFactory(
        "PancakeswapV2StrategyLiquidate",
        deployer
      )) as PancakeswapV2StrategyLiquidate__factory;
      liqStratV2 = (await upgrades.deployProxy(PancakeswapV2StrategyLiquidate, [
        routerV2.address,
      ])) as PancakeswapV2StrategyLiquidate;
      await liqStratV2.deployed();

      const PancakeswapV2StrategyTwoSidesOptimalMigrate = (await ethers.getContractFactory(
        "PancakeswapV2StrategyAddTwoSidesOptimalMigrate",
        deployer
      )) as PancakeswapV2StrategyAddTwoSidesOptimalMigrate__factory;
      twoSidesOptimalMigrate = (await upgrades.deployProxy(PancakeswapV2StrategyTwoSidesOptimalMigrate, [
        routerV2.address,
      ])) as PancakeswapV2StrategyAddTwoSidesOptimalMigrate;
      await twoSidesOptimalMigrate.deployed();
    });

    context("when V2 pool is empty", async () => {
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

        // Set Reinvest bounty to 10% of the reward
        await pancakeswapWorker.setReinvestBountyBps("100");

        // Bob deposits 10 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.deposit(ethers.utils.parseEther("10"));

        // Alice deposits 12 BTOKEN
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("12"));
        await vaultAsAlice.deposit(ethers.utils.parseEther("12"));

        // Position#1: Bob borrows 10 BTOKEN loan
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.work(
          0,
          pancakeswapWorker.address,
          ethers.utils.parseEther("10"),
          ethers.utils.parseEther("10"),
          "0", // max return = 0, don't return NATIVE to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              addStrat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );

        // Position#2: Alice borrows 2 BTOKEN loan
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.work(
          0,
          pancakeswapWorker.address,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("2"),
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              addStrat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );

        // ---------------- Reinvest#1 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        let [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
        await pancakeswapWorkerAsEve.reinvest();
        // PancakeWorker receives 303999999998816250 cake as a reward
        // Eve got 10% of 303999999998816250 cake = 0.01 * 303999999998816250 = 3039999999988162 bounty
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther("0.003039999999988162").toString(),
          (await cake.balanceOf(await eve.getAddress())).toString()
        );

        // Remaining PancakeWorker reward = 227999999998874730 - 22799999999887473 = 205199999998987257 (~90% reward)
        // Convert 205199999998987257 cake to 671683776318381694 NATIVE
        // Convert NATIVE to 1252466339860712438 LP token and stake
        let [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapWorker.address);

        // LP tokens of worker should be inceased from reinvestment
        expect(workerLPAfter).to.be.gt(workerLPBefore);

        // Check Bob position info
        await pancakeswapWorker.health("1");
        let [bobHealth, bobDebt] = await vault.positionInfo("1");
        expect(bobHealth).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bobDebt.toString());

        // Check Alice position info
        await pancakeswapWorker.health("2");
        let [aliceHealth, aliceDebt] = await vault.positionInfo("2");
        expect(aliceHealth).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), aliceDebt.toString());

        // ---------------- Reinvest#2 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
        await pancakeswapWorkerAsEve.reinvest();

        // eve should earn cake as a reward for reinvest
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther("0.004559999999987660").toString(),
          (await cake.balanceOf(await eve.getAddress())).toString()
        );

        // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
        // Convert 128572916666654734 uni to 157462478899282341 NATIVE
        // Convert NATIVE to 5001669421841640 LP token
        [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
        // LP tokens of worker should be inceased from reinvestment
        expect(workerLPAfter).to.be.gt(workerLPBefore);

        // Check Bob position info
        [bobHealth, bobDebt] = await vault.positionInfo("1");
        expect(bobHealth).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bobDebt.toString());

        // Check Alice position info
        [aliceHealth, aliceDebt] = await vault.positionInfo("2");
        expect(aliceHealth).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), aliceDebt.toString());

        // Pancakeswap annouce the upgrade to RouterV2 and FactoryV2
        // turn off rewards for LPv1 immediately, move rewards to LPv2
        // worker migrate should be executed here
        // after migration is done everything should continue to work perfectly
        await masterChef.add(1, lpV2.address, true);
        await masterChef.set(1, 0, true);
        lpV2poolId = 2;

        // PancakeswapWorker needs to be updated to PancakeswapV2WorkerMigrate
        const PancakeswapV2WorkerMigrate = (await ethers.getContractFactory(
          "PancakeswapV2WorkerMigrate",
          deployer
        )) as PancakeswapV2WorkerMigrate__factory;
        const pancakeswapV2workerMigrate = (await upgrades.upgradeProxy(
          pancakeswapWorker.address,
          PancakeswapV2WorkerMigrate
        )) as PancakeswapV2WorkerMigrate;
        await pancakeswapV2workerMigrate.deployed();

        // Bob's health must be still the same until pancakeswapV2Worker migrate LP
        const [bobHealthAfterUpgrade, bobDebtAfterUpgrade] = await vault.positionInfo("1");
        expect(bobHealthAfterUpgrade).to.be.eq(bobHealth);
        expect(bobDebtAfterUpgrade).to.be.eq(bobDebt);

        // Alice's health must be still the same until pancakeswapV2Worker migrate LP
        const [aliceHealthAfterUpgrade, aliceDebtAfterUpgrade] = await vault.positionInfo("2");
        expect(aliceHealthAfterUpgrade).to.be.eq(aliceHealth);
        expect(aliceDebtAfterUpgrade).to.be.eq(aliceDebt);

        // Assuming CAKE on V2 is the same liquidity dept and price as V1
        const cakeBnbLpV1 = PancakePair__factory.connect(await factory.getPair(cake.address, wbnb.address), deployer);
        await cake.approve(routerV2.address, await cake.balanceOf(cakeBnbLpV1.address));
        await routerV2.addLiquidityETH(
          cake.address,
          await cake.balanceOf(cakeBnbLpV1.address),
          "0",
          "0",
          await deployer.getAddress(),
          FOREVER,
          { value: await wbnb.balanceOf(cakeBnbLpV1.address) }
        );

        const btokenBnbLpV1 = PancakePair__factory.connect(
          await factory.getPair(baseToken.address, wbnb.address),
          deployer
        );
        await baseToken.approve(routerV2.address, await baseToken.balanceOf(btokenBnbLpV1.address));
        await routerV2.addLiquidityETH(
          baseToken.address,
          await baseToken.balanceOf(btokenBnbLpV1.address),
          "0",
          "0",
          await deployer.getAddress(),
          FOREVER,
          { value: await wbnb.balanceOf(btokenBnbLpV1.address) }
        );

        await pancakeswapV2workerMigrate.migrateLP(
          routerV2.address,
          lpV2poolId,
          twoSidesOptimalMigrate.address,
          addStratV2.address,
          liqStratV2.address,
          [],
          [addStrat.address, liqStrat.address, partialCloseStrat.address]
        );

        // expect that all old strats must be disabled
        expect(await pancakeswapWorker.okStrats(addStrat.address)).to.be.eq(false);
        expect(await pancakeswapWorker.okStrats(liqStrat.address)).to.be.eq(false);
        expect(await pancakeswapWorker.okStrats(partialCloseStrat.address)).to.be.eq(false);

        // expect that all new strats must be enabled
        expect(await pancakeswapWorker.okStrats(addStratV2.address)).to.be.eq(true);
        expect(await pancakeswapWorker.okStrats(liqStratV2.address)).to.be.eq(true);

        // total shareToBalance must be equal to what worker has on masterchef
        const [stakedAmt] = await masterChef.userInfo(lpV2poolId, pancakeswapV2workerMigrate.address);
        const totalShare = await pancakeswapV2workerMigrate.totalShare();
        const workerBalance = await pancakeswapV2workerMigrate.shareToBalance(totalShare);
        expect(stakedAmt).to.be.eq(workerBalance);

        // ---------------- Reinvest#3 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(lpV2poolId, pancakeswapWorker.address);
        await pancakeswapWorkerAsEve.reinvest();

        // eve should earn cake as a reward for reinvest
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther("0.007219999999962344").toString(),
          (await cake.balanceOf(await eve.getAddress())).toString()
        );

        // Remaining Worker reward = 72199999999623440 - 7219999999962344 = 128572916666654734 (~90% reward)
        // Convert 128572916666654734 uni to 74159218067697746 NATIVE
        // Convert NATIVE to 2350053120029788 LP token
        [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(lpV2poolId, pancakeswapWorker.address);
        // LP tokens of worker should be inceased from reinvestment
        expect(workerLPAfter).to.be.gt(workerLPBefore);

        // Bob try to close position#1 with disabled strategy
        await expect(
          vaultAsBob.work(
            1,
            pancakeswapWorker.address,
            "0",
            "0",
            "1000000000000000000000",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                liqStrat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "address", "uint256"],
                  [baseToken.address, farmToken.address, "0"]
                ),
              ]
            )
          )
        ).to.be.revertedWith("PancakeswapWorker::work:: unapproved work strategy");

        const bobBefore = await baseToken.balanceOf(await bob.getAddress());
        // Bob close position#1
        await vaultAsBob.work(
          1,
          pancakeswapWorker.address,
          "0",
          "0",
          "1000000000000000000000",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              liqStratV2.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );
        const bobAfter = await baseToken.balanceOf(await bob.getAddress());

        // Check Bob account, Bob must be richer as he earn more from yield
        expect(bobAfter).to.be.gt(bobBefore);

        // Alice add another 10 BTOKEN
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsAlice.work(
          2,
          pancakeswapWorker.address,
          ethers.utils.parseEther("10"),
          0,
          "0", // max return = 0, don't return NATIVE to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              addStratV2.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );

        const aliceBefore = await baseToken.balanceOf(await alice.getAddress());
        // Alice close position#2
        await vaultAsAlice.work(
          2,
          pancakeswapWorker.address,
          "0",
          "0",
          "1000000000000000000000000000000",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              liqStratV2.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );
        const aliceAfter = await baseToken.balanceOf(await alice.getAddress());

        // Check Alice account, Alice must be richer as she earned from leverage yield farm without getting liquidated
        expect(aliceAfter).to.be.gt(aliceBefore);

        // there should be no LPv1 and LPv2 left in Worker, MasterChef as every exited the positions
        const [stakedLPv2] = await masterChef.userInfo(lpV2poolId, pancakeswapWorker.address);
        const [stakedLPv1] = await masterChef.userInfo(poolId, pancakeswapWorker.address);

        expect(stakedLPv1).to.be.eq(0);
        expect(stakedLPv2).to.be.eq(0);
      }).timeout(50000);
    });

    context("when price of BTOKEN on V2 5% is more expensive than V1", async () => {
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

        // Set Reinvest bounty to 10% of the reward
        await pancakeswapWorker.setReinvestBountyBps("100");

        // Bob deposits 10 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.deposit(ethers.utils.parseEther("10"));

        // Alice deposits 12 BTOKEN
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("12"));
        await vaultAsAlice.deposit(ethers.utils.parseEther("12"));

        // Position#1: Bob borrows 10 BTOKEN loan
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.work(
          0,
          pancakeswapWorker.address,
          ethers.utils.parseEther("10"),
          ethers.utils.parseEther("10"),
          "0", // max return = 0, don't return NATIVE to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              addStrat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );

        // Position#2: Alice borrows 2 BTOKEN loan
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.work(
          0,
          pancakeswapWorker.address,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("2"),
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              addStrat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );

        // ---------------- Reinvest#1 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        let [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
        await pancakeswapWorkerAsEve.reinvest();
        // PancakeWorker receives 303999999998816250 cake as a reward
        // Eve got 10% of 303999999998816250 cake = 0.01 * 303999999998816250 = 3039999999988162 bounty
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther("0.003039999999988162").toString(),
          (await cake.balanceOf(await eve.getAddress())).toString()
        );

        // Remaining PancakeWorker reward = 227999999998874730 - 22799999999887473 = 205199999998987257 (~90% reward)
        // Convert 205199999998987257 cake to 671683776318381694 NATIVE
        // Convert NATIVE to 1252466339860712438 LP token and stake
        let [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapWorker.address);

        // LP tokens of worker should be inceased from reinvestment
        expect(workerLPAfter).to.be.gt(workerLPBefore);

        // Check Bob position info
        await pancakeswapWorker.health("1");
        let [bobHealth, bobDebt] = await vault.positionInfo("1");
        expect(bobHealth).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bobDebt.toString());

        // Check Alice position info
        await pancakeswapWorker.health("2");
        let [aliceHealth, aliceDebt] = await vault.positionInfo("2");
        expect(aliceHealth).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), aliceDebt.toString());

        // ---------------- Reinvest#2 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
        await pancakeswapWorkerAsEve.reinvest();

        // eve should earn cake as a reward for reinvest
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther("0.004559999999987660").toString(),
          (await cake.balanceOf(await eve.getAddress())).toString()
        );

        // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
        // Convert 128572916666654734 uni to 157462478899282341 NATIVE
        // Convert NATIVE to 5001669421841640 LP token
        [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
        // LP tokens of worker should be inceased from reinvestment
        expect(workerLPAfter).to.be.gt(workerLPBefore);

        // Check Bob position info
        [bobHealth, bobDebt] = await vault.positionInfo("1");
        expect(bobHealth).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bobDebt.toString());

        // Check Alice position info
        [aliceHealth, aliceDebt] = await vault.positionInfo("2");
        expect(aliceHealth).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), aliceDebt.toString());

        // Pancakeswap annouce the upgrade to RouterV2 and FactoryV2
        // turn off rewards for LPv1 immediately, move rewards to LPv2
        // worker migrate should be executed here
        // after migration is done everything should continue to work perfectly
        await masterChef.add(1, lpV2.address, true);
        await masterChef.set(1, 0, true);
        lpV2poolId = 2;

        // PancakeswapWorker needs to be updated to PancakeswapV2WorkerMigrate
        const PancakeswapV2WorkerMigrate = (await ethers.getContractFactory(
          "PancakeswapV2WorkerMigrate",
          deployer
        )) as PancakeswapV2WorkerMigrate__factory;
        const pancakeswapV2workerMigrate = (await upgrades.upgradeProxy(
          pancakeswapWorker.address,
          PancakeswapV2WorkerMigrate
        )) as PancakeswapV2WorkerMigrate;
        await pancakeswapV2workerMigrate.deployed();

        // Bob's health must be still the same until pancakeswapV2Worker migrate LP
        const [bobHealthAfterUpgrade, bobDebtAfterUpgrade] = await vault.positionInfo("1");
        expect(bobHealthAfterUpgrade).to.be.eq(bobHealth);
        expect(bobDebtAfterUpgrade).to.be.eq(bobDebt);

        // Alice's health must be still the same until pancakeswapV2Worker migrate LP
        const [aliceHealthAfterUpgrade, aliceDebtAfterUpgrade] = await vault.positionInfo("2");
        expect(aliceHealthAfterUpgrade).to.be.eq(aliceHealth);
        expect(aliceDebtAfterUpgrade).to.be.eq(aliceDebt);

        // Assuming CAKE on V2 is the same liquidity dept and price as V1
        const cakeBnbLpV1 = PancakePair__factory.connect(await factory.getPair(cake.address, wbnb.address), deployer);
        await cake.approve(routerV2.address, await cake.balanceOf(cakeBnbLpV1.address));
        await routerV2.addLiquidityETH(
          cake.address,
          await cake.balanceOf(cakeBnbLpV1.address),
          "0",
          "0",
          await deployer.getAddress(),
          FOREVER,
          { value: await wbnb.balanceOf(cakeBnbLpV1.address) }
        );

        const btokenBnbLpV1 = PancakePair__factory.connect(
          await factory.getPair(baseToken.address, wbnb.address),
          deployer
        );
        await baseToken.approve(routerV2.address, await baseToken.balanceOf(btokenBnbLpV1.address));
        await routerV2.addLiquidityETH(
          baseToken.address,
          await baseToken.balanceOf(btokenBnbLpV1.address),
          "0",
          "0",
          await deployer.getAddress(),
          FOREVER,
          { value: await wbnb.balanceOf(btokenBnbLpV1.address) }
        );

        // However FTOKENBTOKEN price on V2 is 5% > V1 (BTOKEN is 5% more expensive on V2)
        const btokenFtokenLpV1 = PancakePair__factory.connect(
          await factory.getPair(baseToken.address, farmToken.address),
          deployer
        );
        const desiredBtokenReserveV2 = (await baseToken.balanceOf(btokenFtokenLpV1.address)).mul(9500).div(10000);
        const desiredFtokenReserveV2 = await farmToken.balanceOf(btokenFtokenLpV1.address);
        await baseToken.approve(routerV2.address, desiredBtokenReserveV2);
        await farmToken.approve(routerV2.address, await farmToken.balanceOf(btokenFtokenLpV1.address));
        await routerV2.addLiquidity(
          baseToken.address,
          farmToken.address,
          desiredBtokenReserveV2,
          desiredFtokenReserveV2,
          "0",
          "0",
          await deployer.getAddress(),
          FOREVER
        );

        const [btokenReserveV1, ftokenReserveV1] = await btokenFtokenLpV1.getReserves();

        await pancakeswapV2workerMigrate.migrateLP(
          routerV2.address,
          lpV2poolId,
          twoSidesOptimalMigrate.address,
          addStratV2.address,
          liqStratV2.address,
          [],
          [addStrat.address, liqStrat.address, partialCloseStrat.address]
        );

        const btokenFtokenLpV2 = PancakePair__factory.connect(
          await factoryV2.getPair(baseToken.address, farmToken.address),
          deployer
        );
        const [btokenReserveV2, ftokenReserveV2] = await btokenFtokenLpV2.getReserves();

        // expect that all old strats must be disabled
        expect(await pancakeswapWorker.okStrats(addStrat.address)).to.be.eq(false);
        expect(await pancakeswapWorker.okStrats(liqStrat.address)).to.be.eq(false);
        expect(await pancakeswapWorker.okStrats(partialCloseStrat.address)).to.be.eq(false);

        // expect that all new strats must be enabled
        expect(await pancakeswapWorker.okStrats(addStratV2.address)).to.be.eq(true);
        expect(await pancakeswapWorker.okStrats(liqStratV2.address)).to.be.eq(true);

        // total shareToBalance must be equal to what worker has on masterchef
        const [stakedAmt] = await masterChef.userInfo(lpV2poolId, pancakeswapV2workerMigrate.address);
        const totalShare = await pancakeswapV2workerMigrate.totalShare();
        const workerBalance = await pancakeswapV2workerMigrate.shareToBalance(totalShare);
        expect(stakedAmt).to.be.eq(workerBalance);

        // Check Bob position info
        // Bob health after migrate should be come more than before migrate
        // this is due to price of BTOKEN is 5% higher on V2 than V1
        // and opening position is shorting borrowed asset
        // hence the contract will sell some BTOKEN for FTOKEN
        // Bob's debt must still the same
        const [bobHealthAfterMigrate, bobDebtToShareMigrate] = await vault.positionInfo("1");
        expect(bobHealthAfterMigrate).to.be.gt(bobHealth);
        expect(bobDebtToShareMigrate).to.be.eq(bobDebt);

        // Check Alice position info
        // Same as Bob, Alice health after migrate should be come less than before migrate
        // this is due to price of BTOKEN is 5% higher on V2 than V1
        // and opening position is shorting borrowed asset
        // hence the contract will dump BTOKEN for FTOKEN
        // Alice's debt must still the same
        const [aliceHealthAfterMigrate, aliceDebtToShareMigrate] = await vault.positionInfo("2");
        expect(aliceHealthAfterMigrate).to.be.gt(aliceHealth);
        expect(aliceDebtToShareMigrate).to.be.eq(aliceDebt);

        // ---------------- Reinvest#3 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(lpV2poolId, pancakeswapWorker.address);
        await pancakeswapWorkerAsEve.reinvest();

        // eve should earn cake as a reward for reinvest
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther("0.007219999999962344").toString(),
          (await cake.balanceOf(await eve.getAddress())).toString()
        );

        // Remaining Worker reward = 72199999999623440 - 7219999999962344 = 128572916666654734 (~90% reward)
        // Convert 128572916666654734 uni to 74159218067697746 NATIVE
        // Convert NATIVE to 2350053120029788 LP token
        [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(lpV2poolId, pancakeswapWorker.address);
        // LP tokens of worker should be inceased from reinvestment
        expect(workerLPAfter).to.be.gt(workerLPBefore);

        // Bob try to close position#1 with disabled strategy
        await expect(
          vaultAsBob.work(
            1,
            pancakeswapWorker.address,
            "0",
            "0",
            "1000000000000000000000",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                liqStrat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "address", "uint256"],
                  [baseToken.address, farmToken.address, "0"]
                ),
              ]
            )
          )
        ).to.be.revertedWith("PancakeswapWorker::work:: unapproved work strategy");

        const bobBefore = await baseToken.balanceOf(await bob.getAddress());
        // Bob close position#1
        await vaultAsBob.work(
          1,
          pancakeswapWorker.address,
          "0",
          "0",
          "1000000000000000000000",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              liqStratV2.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );
        const bobAfter = await baseToken.balanceOf(await bob.getAddress());

        // Check Bob account, Bob must be richer as he earn more from yield
        expect(bobAfter).to.be.gt(bobBefore);

        // Alice add another 10 BTOKEN
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsAlice.work(
          2,
          pancakeswapWorker.address,
          ethers.utils.parseEther("10"),
          0,
          "0", // max return = 0, don't return NATIVE to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              addStratV2.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );

        const aliceBefore = await baseToken.balanceOf(await alice.getAddress());
        // Alice close position#2
        await vaultAsAlice.work(
          2,
          pancakeswapWorker.address,
          "0",
          "0",
          "1000000000000000000000000000000",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              liqStratV2.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );
        const aliceAfter = await baseToken.balanceOf(await alice.getAddress());

        // Check Alice account, Alice must be richer as she earned from leverage yield farm without getting liquidated
        expect(aliceAfter).to.be.gt(aliceBefore);

        // there should be no LPv1 and LPv2 left in Worker, MasterChef as every exited the positions
        const [stakedLPv2] = await masterChef.userInfo(lpV2poolId, pancakeswapWorker.address);
        const [stakedLPv1] = await masterChef.userInfo(poolId, pancakeswapWorker.address);

        expect(stakedLPv1).to.be.eq(0);
        expect(stakedLPv2).to.be.eq(0);
      }).timeout(50000);
    });

    context("when price of BTOKEN on V2 5% is cheaper than V1", async () => {
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

        // Set Reinvest bounty to 10% of the reward
        await pancakeswapWorker.setReinvestBountyBps("100");

        // Bob deposits 10 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.deposit(ethers.utils.parseEther("10"));

        // Alice deposits 12 BTOKEN
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("12"));
        await vaultAsAlice.deposit(ethers.utils.parseEther("12"));

        // Position#1: Bob borrows 10 BTOKEN loan
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.work(
          0,
          pancakeswapWorker.address,
          ethers.utils.parseEther("10"),
          ethers.utils.parseEther("10"),
          "0", // max return = 0, don't return NATIVE to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              addStrat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );

        // Position#2: Alice borrows 2 BTOKEN loan
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.work(
          0,
          pancakeswapWorker.address,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("2"),
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              addStrat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );

        // ---------------- Reinvest#1 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        let [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
        await pancakeswapWorkerAsEve.reinvest();
        // PancakeWorker receives 303999999998816250 cake as a reward
        // Eve got 10% of 303999999998816250 cake = 0.01 * 303999999998816250 = 3039999999988162 bounty
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther("0.003039999999988162").toString(),
          (await cake.balanceOf(await eve.getAddress())).toString()
        );

        // Remaining PancakeWorker reward = 227999999998874730 - 22799999999887473 = 205199999998987257 (~90% reward)
        // Convert 205199999998987257 cake to 671683776318381694 NATIVE
        // Convert NATIVE to 1252466339860712438 LP token and stake
        let [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapWorker.address);

        // LP tokens of worker should be inceased from reinvestment
        expect(workerLPAfter).to.be.gt(workerLPBefore);

        // Check Bob position info
        await pancakeswapWorker.health("1");
        let [bobHealth, bobDebt] = await vault.positionInfo("1");
        expect(bobHealth).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bobDebt.toString());

        // Check Alice position info
        await pancakeswapWorker.health("2");
        let [aliceHealth, aliceDebt] = await vault.positionInfo("2");
        expect(aliceHealth).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), aliceDebt.toString());

        // ---------------- Reinvest#2 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
        await pancakeswapWorkerAsEve.reinvest();

        // eve should earn cake as a reward for reinvest
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther("0.004559999999987660").toString(),
          (await cake.balanceOf(await eve.getAddress())).toString()
        );

        // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
        // Convert 128572916666654734 uni to 157462478899282341 NATIVE
        // Convert NATIVE to 5001669421841640 LP token
        [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
        // LP tokens of worker should be inceased from reinvestment
        expect(workerLPAfter).to.be.gt(workerLPBefore);

        // Check Bob position info
        [bobHealth, bobDebt] = await vault.positionInfo("1");
        expect(bobHealth).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bobDebt.toString());

        // Check Alice position info
        [aliceHealth, aliceDebt] = await vault.positionInfo("2");
        expect(aliceHealth).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), aliceDebt.toString());

        // Pancakeswap annouce the upgrade to RouterV2 and FactoryV2
        // turn off rewards for LPv1 immediately, move rewards to LPv2
        // worker migrate should be executed here
        // after migration is done everything should continue to work perfectly
        await masterChef.add(1, lpV2.address, true);
        await masterChef.set(1, 0, true);
        lpV2poolId = 2;

        // PancakeswapWorker needs to be updated to PancakeswapV2WorkerMigrate
        const PancakeswapV2WorkerMigrate = (await ethers.getContractFactory(
          "PancakeswapV2WorkerMigrate",
          deployer
        )) as PancakeswapV2WorkerMigrate__factory;
        const pancakeswapV2workerMigrate = (await upgrades.upgradeProxy(
          pancakeswapWorker.address,
          PancakeswapV2WorkerMigrate
        )) as PancakeswapV2WorkerMigrate;
        await pancakeswapV2workerMigrate.deployed();

        // Bob's health must be still the same until pancakeswapV2Worker migrate LP
        const [bobHealthAfterUpgrade, bobDebtAfterUpgrade] = await vault.positionInfo("1");
        expect(bobHealthAfterUpgrade).to.be.eq(bobHealth);
        expect(bobDebtAfterUpgrade).to.be.eq(bobDebt);

        // Alice's health must be still the same until pancakeswapV2Worker migrate LP
        const [aliceHealthAfterUpgrade, aliceDebtAfterUpgrade] = await vault.positionInfo("2");
        expect(aliceHealthAfterUpgrade).to.be.eq(aliceHealth);
        expect(aliceDebtAfterUpgrade).to.be.eq(aliceDebt);

        // Assuming CAKE on V2 is the same liquidity dept and price as V1
        const cakeBnbLpV1 = PancakePair__factory.connect(await factory.getPair(cake.address, wbnb.address), deployer);
        await cake.approve(routerV2.address, await cake.balanceOf(cakeBnbLpV1.address));
        await routerV2.addLiquidityETH(
          cake.address,
          await cake.balanceOf(cakeBnbLpV1.address),
          "0",
          "0",
          await deployer.getAddress(),
          FOREVER,
          { value: await wbnb.balanceOf(cakeBnbLpV1.address) }
        );

        const btokenBnbLpV1 = PancakePair__factory.connect(
          await factory.getPair(baseToken.address, wbnb.address),
          deployer
        );
        await baseToken.approve(routerV2.address, await baseToken.balanceOf(btokenBnbLpV1.address));
        await routerV2.addLiquidityETH(
          baseToken.address,
          await baseToken.balanceOf(btokenBnbLpV1.address),
          "0",
          "0",
          await deployer.getAddress(),
          FOREVER,
          { value: await wbnb.balanceOf(btokenBnbLpV1.address) }
        );

        // However FTOKENBTOKEN price on V2 is 5% > V1 (BTOKEN is 5% more expensive on V2)
        const btokenFtokenLpV1 = PancakePair__factory.connect(
          await factory.getPair(baseToken.address, farmToken.address),
          deployer
        );
        const desiredBtokenReserveV2 = await baseToken.balanceOf(btokenFtokenLpV1.address);
        const desiredFtokenReserveV2 = (await farmToken.balanceOf(btokenFtokenLpV1.address)).mul(9500).div(10000);
        await baseToken.approve(routerV2.address, desiredBtokenReserveV2);
        await farmToken.approve(routerV2.address, await farmToken.balanceOf(btokenFtokenLpV1.address));
        await routerV2.addLiquidity(
          baseToken.address,
          farmToken.address,
          desiredBtokenReserveV2,
          desiredFtokenReserveV2,
          "0",
          "0",
          await deployer.getAddress(),
          FOREVER
        );

        const [btokenReserveV1, ftokenReserveV1] = await btokenFtokenLpV1.getReserves();

        await pancakeswapV2workerMigrate.migrateLP(
          routerV2.address,
          lpV2poolId,
          twoSidesOptimalMigrate.address,
          addStratV2.address,
          liqStratV2.address,
          [],
          [addStrat.address, liqStrat.address, partialCloseStrat.address]
        );

        const btokenFtokenLpV2 = PancakePair__factory.connect(
          await factoryV2.getPair(baseToken.address, farmToken.address),
          deployer
        );
        const [btokenReserveV2, ftokenReserveV2] = await btokenFtokenLpV2.getReserves();

        // expect that all old strats must be disabled
        expect(await pancakeswapWorker.okStrats(addStrat.address)).to.be.eq(false);
        expect(await pancakeswapWorker.okStrats(liqStrat.address)).to.be.eq(false);
        expect(await pancakeswapWorker.okStrats(partialCloseStrat.address)).to.be.eq(false);

        // expect that all new strats must be enabled
        expect(await pancakeswapWorker.okStrats(addStratV2.address)).to.be.eq(true);
        expect(await pancakeswapWorker.okStrats(liqStratV2.address)).to.be.eq(true);

        // total shareToBalance must be equal to what worker has on masterchef
        const [stakedAmt] = await masterChef.userInfo(lpV2poolId, pancakeswapV2workerMigrate.address);
        const totalShare = await pancakeswapV2workerMigrate.totalShare();
        const workerBalance = await pancakeswapV2workerMigrate.shareToBalance(totalShare);
        expect(stakedAmt).to.be.eq(workerBalance);

        // Check Bob position info
        // Bob health after migrate should become less than before migrate
        // this is due to price of BTOKEN is 5% lower on V2 than V1
        // and opening position is shorting borrowed asset
        // hence the contract will pump BTOKEN because it needs to sell FTOKEN for BTOKEN
        // Bob's debt must still the same
        // TODO: check here where it is greater than before
        let [bobHealthAfterMigrate, bobDebtToShareMigrate] = await vault.positionInfo("1");
        expect(bobHealthAfterMigrate).to.be.gt(bobHealth);
        expect(bobDebtToShareMigrate).to.be.eq(bobDebt);

        // Check Alice position info
        // Same as Bob, Alice health after migrate should be come less than before migrate
        // this is due to price of BTOKEN is 5% lower on V2 than V1
        // and opening position is shorting borrowed asset
        // hence the contract will pump BTOKEN because it needs to sell FTOKEN for BTOKEN
        // Alice's debt must still the same
        // TODO: check here where it is greater than before
        let [aliceHealthAfterMigrate, aliceDebtToShareMigrate] = await vault.positionInfo("2");
        expect(aliceHealthAfterMigrate).to.be.gt(aliceHealth);
        expect(aliceDebtToShareMigrate).to.be.eq(aliceDebt);

        // ---------------- Reinvest#3 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(lpV2poolId, pancakeswapWorker.address);
        await pancakeswapWorkerAsEve.reinvest();

        // eve should earn cake as a reward for reinvest
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther("0.007219999999962344").toString(),
          (await cake.balanceOf(await eve.getAddress())).toString()
        );

        // Remaining Worker reward = 72199999999623440 - 7219999999962344 = 128572916666654734 (~90% reward)
        // Convert 128572916666654734 uni to 74159218067697746 NATIVE
        // Convert NATIVE to 2350053120029788 LP token
        [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(lpV2poolId, pancakeswapWorker.address);
        // LP tokens of worker should be inceased from reinvestment
        expect(workerLPAfter).to.be.gt(workerLPBefore);

        // Bob try to close position#1 with disabled strategy
        await expect(
          vaultAsBob.work(
            1,
            pancakeswapWorker.address,
            "0",
            "0",
            "1000000000000000000000",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                liqStrat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "address", "uint256"],
                  [baseToken.address, farmToken.address, "0"]
                ),
              ]
            )
          )
        ).to.be.revertedWith("PancakeswapWorker::work:: unapproved work strategy");

        const bobBefore = await baseToken.balanceOf(await bob.getAddress());
        // Bob close position#1
        await vaultAsBob.work(
          1,
          pancakeswapWorker.address,
          "0",
          "0",
          "1000000000000000000000",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              liqStratV2.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );
        const bobAfter = await baseToken.balanceOf(await bob.getAddress());

        // Check Bob account, Bob must be richer as he earn more from yield
        expect(bobAfter).to.be.gt(bobBefore);

        // Alice add another 10 BTOKEN
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsAlice.work(
          2,
          pancakeswapWorker.address,
          ethers.utils.parseEther("10"),
          0,
          "0", // max return = 0, don't return NATIVE to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              addStratV2.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );

        const aliceBefore = await baseToken.balanceOf(await alice.getAddress());
        // Alice close position#2
        await vaultAsAlice.work(
          2,
          pancakeswapWorker.address,
          "0",
          "0",
          "1000000000000000000000000000000",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              liqStratV2.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );
        const aliceAfter = await baseToken.balanceOf(await alice.getAddress());

        // Check Alice account, Alice must be richer as she earned from leverage yield farm without getting liquidated
        expect(aliceAfter).to.be.gt(aliceBefore);

        // there should be no LPv1 and LPv2 left in Worker, MasterChef as every exited the positions
        const [stakedLPv2] = await masterChef.userInfo(lpV2poolId, pancakeswapWorker.address);
        const [stakedLPv1] = await masterChef.userInfo(poolId, pancakeswapWorker.address);

        expect(stakedLPv1).to.be.eq(0);
        expect(stakedLPv2).to.be.eq(0);
      }).timeout(50000);
    });

    context("when migrate completed, remove migrateLP function", async () => {
      it("should continue to work as expect", async () => {
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

        // Set Reinvest bounty to 10% of the reward
        await pancakeswapWorker.setReinvestBountyBps("100");

        // Bob deposits 10 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.deposit(ethers.utils.parseEther("10"));

        // Alice deposits 12 BTOKEN
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("12"));
        await vaultAsAlice.deposit(ethers.utils.parseEther("12"));

        // Position#1: Bob borrows 10 BTOKEN loan
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.work(
          0,
          pancakeswapWorker.address,
          ethers.utils.parseEther("10"),
          ethers.utils.parseEther("10"),
          "0", // max return = 0, don't return NATIVE to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              addStrat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );

        // startBlock here due to the 1st position just deposit to MasterChef
        let cursor = await TimeHelpers.latestBlockNumber();

        // Position#2: Alice borrows 2 BTOKEN loan
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.work(
          0,
          pancakeswapWorker.address,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("2"),
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              addStrat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );

        // ---------------- Reinvest#1 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        let [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
        let eveCakeBefore = await cake.balanceOf(await eve.getAddress());

        // Reinvest
        await pancakeswapWorkerAsEve.reinvest();

        // PancakeWorker receives 303999999998816250 cake as a reward
        // Eve got 10% of 303999999998816250 cake = 0.01 * 303999999998816250 = 3039999999988162 bounty
        AssertHelpers.assertAlmostEqual(
          eveCakeBefore
            .add(CAKE_REWARD_PER_BLOCK.mul((await TimeHelpers.latestBlockNumber()).sub(cursor)).div(100))
            .toString(),
          (await cake.balanceOf(await eve.getAddress())).toString()
        );

        // Remaining PancakeWorker reward = 227999999998874730 - 22799999999887473 = 205199999998987257 (~90% reward)
        // Convert 205199999998987257 cake to 671683776318381694 NATIVE
        // Convert NATIVE to 1252466339860712438 LP token and stake
        let [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapWorker.address);

        // LP tokens of worker should be inceased from reinvestment
        expect(workerLPAfter).to.be.gt(workerLPBefore);

        // Check Bob position info
        await pancakeswapWorker.health("1");
        let [bobHealth, bobDebt] = await vault.positionInfo("1");
        expect(bobHealth).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bobDebt.toString());

        // Check Alice position info
        await pancakeswapWorker.health("2");
        let [aliceHealth, aliceDebt] = await vault.positionInfo("2");
        expect(aliceHealth).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), aliceDebt.toString());

        // ---------------- Reinvest#2 -------------------
        // Wait for 1 day and someone calls reinvest
        cursor = await TimeHelpers.latestBlockNumber();
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
        eveCakeBefore = await cake.balanceOf(await eve.getAddress());

        // Reinvest
        await pancakeswapWorkerAsEve.reinvest();

        // eve should earn cake as a reward for reinvest
        AssertHelpers.assertAlmostEqual(
          eveCakeBefore
            .add(CAKE_REWARD_PER_BLOCK.mul((await TimeHelpers.latestBlockNumber()).sub(cursor)).div(100))
            .toString(),
          (await cake.balanceOf(await eve.getAddress())).toString()
        );

        // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
        // Convert 128572916666654734 uni to 157462478899282341 NATIVE
        // Convert NATIVE to 5001669421841640 LP token
        [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
        // LP tokens of worker should be inceased from reinvestment
        expect(workerLPAfter).to.be.gt(workerLPBefore);

        // Check Bob position info
        [bobHealth, bobDebt] = await vault.positionInfo("1");
        expect(bobHealth).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bobDebt.toString());

        // Check Alice position info
        [aliceHealth, aliceDebt] = await vault.positionInfo("2");
        expect(aliceHealth).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), aliceDebt.toString());

        // Pancakeswap annouce the upgrade to RouterV2 and FactoryV2
        // turn off rewards for LPv1 immediately, move rewards to LPv2
        // worker migrate should be executed here
        // after migration is done everything should continue to work perfectly
        await masterChef.add(1, lpV2.address, true);
        await masterChef.set(1, 0, true);
        lpV2poolId = 2;

        // PancakeswapWorker needs to be updated to PancakeswapV2WorkerMigrate
        const PancakeswapV2WorkerMigrate = (await ethers.getContractFactory(
          "PancakeswapV2WorkerMigrate",
          deployer
        )) as PancakeswapV2WorkerMigrate__factory;
        const pancakeswapV2workerMigrate = (await upgrades.upgradeProxy(
          pancakeswapWorker.address,
          PancakeswapV2WorkerMigrate
        )) as PancakeswapV2WorkerMigrate;
        await pancakeswapV2workerMigrate.deployed();

        // Bob's health must be still the same until pancakeswapV2Worker migrate LP
        const [bobHealthAfterUpgrade, bobDebtAfterUpgrade] = await vault.positionInfo("1");
        expect(bobHealthAfterUpgrade).to.be.eq(bobHealth);
        expect(bobDebtAfterUpgrade).to.be.eq(bobDebt);

        // Alice's health must be still the same until pancakeswapV2Worker migrate LP
        const [aliceHealthAfterUpgrade, aliceDebtAfterUpgrade] = await vault.positionInfo("2");
        expect(aliceHealthAfterUpgrade).to.be.eq(aliceHealth);
        expect(aliceDebtAfterUpgrade).to.be.eq(aliceDebt);

        // Assuming CAKE on V2 is the same liquidity dept and price as V1
        const cakeBnbLpV1 = PancakePair__factory.connect(await factory.getPair(cake.address, wbnb.address), deployer);
        await cake.approve(routerV2.address, await cake.balanceOf(cakeBnbLpV1.address));
        await routerV2.addLiquidityETH(
          cake.address,
          await cake.balanceOf(cakeBnbLpV1.address),
          "0",
          "0",
          await deployer.getAddress(),
          FOREVER,
          { value: await wbnb.balanceOf(cakeBnbLpV1.address) }
        );

        const btokenBnbLpV1 = PancakePair__factory.connect(
          await factory.getPair(baseToken.address, wbnb.address),
          deployer
        );
        await baseToken.approve(routerV2.address, await baseToken.balanceOf(btokenBnbLpV1.address));
        await routerV2.addLiquidityETH(
          baseToken.address,
          await baseToken.balanceOf(btokenBnbLpV1.address),
          "0",
          "0",
          await deployer.getAddress(),
          FOREVER,
          { value: await wbnb.balanceOf(btokenBnbLpV1.address) }
        );

        // However FTOKENBTOKEN price on V2 is 5% > V1 (BTOKEN is 5% more expensive on V2)
        const btokenFtokenLpV1 = PancakePair__factory.connect(
          await factory.getPair(baseToken.address, farmToken.address),
          deployer
        );
        const desiredBtokenReserveV2 = await baseToken.balanceOf(btokenFtokenLpV1.address);
        const desiredFtokenReserveV2 = (await farmToken.balanceOf(btokenFtokenLpV1.address)).mul(9500).div(10000);
        await baseToken.approve(routerV2.address, desiredBtokenReserveV2);
        await farmToken.approve(routerV2.address, await farmToken.balanceOf(btokenFtokenLpV1.address));
        await routerV2.addLiquidity(
          baseToken.address,
          farmToken.address,
          desiredBtokenReserveV2,
          desiredFtokenReserveV2,
          "0",
          "0",
          await deployer.getAddress(),
          FOREVER
        );

        const [btokenReserveV1, ftokenReserveV1] = await btokenFtokenLpV1.getReserves();

        // Update cursor here due to reward will start to accum on the next block
        cursor = await TimeHelpers.latestBlockNumber();

        await pancakeswapV2workerMigrate.migrateLP(
          routerV2.address,
          lpV2poolId,
          twoSidesOptimalMigrate.address,
          addStratV2.address,
          liqStratV2.address,
          [],
          [addStrat.address, liqStrat.address, partialCloseStrat.address]
        );

        const btokenFtokenLpV2 = PancakePair__factory.connect(
          await factoryV2.getPair(baseToken.address, farmToken.address),
          deployer
        );
        const [btokenReserveV2, ftokenReserveV2] = await btokenFtokenLpV2.getReserves();

        // expect that all old strats must be disabled
        expect(await pancakeswapWorker.okStrats(addStrat.address)).to.be.eq(false);
        expect(await pancakeswapWorker.okStrats(liqStrat.address)).to.be.eq(false);
        expect(await pancakeswapWorker.okStrats(partialCloseStrat.address)).to.be.eq(false);

        // expect that all new strats must be enabled
        expect(await pancakeswapWorker.okStrats(addStratV2.address)).to.be.eq(true);
        expect(await pancakeswapWorker.okStrats(liqStratV2.address)).to.be.eq(true);

        // total shareToBalance must be equal to what worker has on masterchef
        const [stakedAmt] = await masterChef.userInfo(lpV2poolId, pancakeswapV2workerMigrate.address);
        const totalShare = await pancakeswapV2workerMigrate.totalShare();
        const workerBalance = await pancakeswapV2workerMigrate.shareToBalance(totalShare);
        expect(stakedAmt).to.be.eq(workerBalance);

        // Check Bob position info
        // Bob health after migrate should become less than before migrate
        // this is due to price of BTOKEN is 5% lower on V2 than V1
        // and opening position is shorting borrowed asset
        // hence the contract will pump BTOKEN because it needs to sell FTOKEN for BTOKEN
        // Bob's debt must still the same
        // TODO: check here where it is greater than before
        let [bobHealthAfterMigrate, bobDebtToShareMigrate] = await vault.positionInfo("1");
        expect(bobHealthAfterMigrate).to.be.gt(bobHealth);
        expect(bobDebtToShareMigrate).to.be.eq(bobDebt);

        // Check Alice position info
        // Same as Bob, Alice health after migrate should be come less than before migrate
        // this is due to price of BTOKEN is 5% lower on V2 than V1
        // and opening position is shorting borrowed asset
        // hence the contract will pump BTOKEN because it needs to sell FTOKEN for BTOKEN
        // Alice's debt must still the same
        let [aliceHealthAfterMigrate, aliceDebtToShareMigrate] = await vault.positionInfo("2");
        expect(aliceHealthAfterMigrate).to.be.gt(aliceHealth);
        expect(aliceDebtToShareMigrate).to.be.eq(aliceDebt);

        // Migratation is done; Now we want to remove migrateLP function from the worker
        const PancakeswapV2Worker = (await ethers.getContractFactory(
          "PancakeswapV2Worker",
          deployer
        )) as PancakeswapV2Worker__factory;
        const pancakeswapV2worker = (await upgrades.upgradeProxy(
          pancakeswapWorker.address,
          PancakeswapV2Worker
        )) as PancakeswapV2Worker;
        await pancakeswapV2worker.deployed();

        // Change the the critical strats to restricted strats
        /// Setup strategy
        const PancakeswapV2RestrictedStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
          "PancakeswapV2RestrictedStrategyAddBaseTokenOnly",
          deployer
        )) as PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory;
        const restrictedAddStrat = (await upgrades.deployProxy(PancakeswapV2RestrictedStrategyAddBaseTokenOnly, [
          routerV2.address,
        ])) as PancakeswapV2RestrictedStrategyAddBaseTokenOnly;
        await restrictedAddStrat.deployed();
        await restrictedAddStrat.setWorkersOk([pancakeswapV2worker.address], true);

        const PancakeswapV2RestrictedStrategyLiquidate = (await ethers.getContractFactory(
          "PancakeswapV2RestrictedStrategyLiquidate",
          deployer
        )) as PancakeswapV2RestrictedStrategyLiquidate__factory;
        const restrictedLiqStrat = (await upgrades.deployProxy(PancakeswapV2RestrictedStrategyLiquidate, [
          routerV2.address,
        ])) as PancakeswapV2RestrictedStrategyLiquidate;
        await restrictedLiqStrat.deployed();
        await restrictedLiqStrat.setWorkersOk([pancakeswapV2worker.address], true);

        await pancakeswapV2worker.setCriticalStrategies(restrictedAddStrat.address, restrictedLiqStrat.address);

        // expect to be reverted with try to use migrateLP
        await expect(
          pancakeswapV2workerMigrate.migrateLP(
            routerV2.address,
            lpV2poolId,
            twoSidesOptimalMigrate.address,
            addStratV2.address,
            liqStratV2.address,
            [],
            [addStrat.address, liqStrat.address, partialCloseStrat.address]
          )
        ).to.be.reverted;

        // Check Bob position info
        // Bob health after clean should eqaul to after migrate
        // Bob's debt must still the same
        let [bobHealthAfterClean, bobDebtClean] = await vault.positionInfo("1");
        expect(bobHealthAfterClean).to.be.eq(bobHealthAfterMigrate);
        expect(bobDebtClean).to.be.eq(bobDebt);

        // Check Alice position info
        // Alice health after clean should eqaul to after migrate
        // Alice's debt must still the same
        let [aliceHealthClean, aliceDebtClean] = await vault.positionInfo("2");
        expect(aliceHealthClean).to.be.eq(aliceHealthAfterMigrate);
        expect(aliceDebtClean).to.be.eq(aliceDebt);

        // ---------------- Reinvest#3 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        eveCakeBefore = await cake.balanceOf(await eve.getAddress());
        [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(lpV2poolId, pancakeswapWorker.address);

        await pancakeswapWorkerAsEve.reinvest();

        // eve should earn cake as a reward for reinvest
        AssertHelpers.assertAlmostEqual(
          eveCakeBefore
            .add(
              CAKE_REWARD_PER_BLOCK.mul((await TimeHelpers.latestBlockNumber()).sub(cursor).mul(10).add(5)).div(1000)
            )
            .toString(),
          (await cake.balanceOf(await eve.getAddress())).toString()
        );

        [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(lpV2poolId, pancakeswapWorker.address);
        // LP tokens of worker should be inceased from reinvestment
        expect(workerLPAfter).to.be.gt(workerLPBefore);

        // Bob try to close position#1 with disabled strategy
        await expect(
          vaultAsBob.work(
            1,
            pancakeswapWorker.address,
            "0",
            "0",
            "1000000000000000000000",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                liqStrat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "address", "uint256"],
                  [baseToken.address, farmToken.address, "0"]
                ),
              ]
            )
          )
        ).to.be.revertedWith("PancakeswapWorker::work:: unapproved work strategy");

        const bobBefore = await baseToken.balanceOf(await bob.getAddress());
        // Bob close position#1
        await vaultAsBob.work(
          1,
          pancakeswapWorker.address,
          "0",
          "0",
          "1000000000000000000000",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              liqStratV2.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );
        const bobAfter = await baseToken.balanceOf(await bob.getAddress());

        // Check Bob account, Bob must be richer as he earn more from yield
        expect(bobAfter).to.be.gt(bobBefore);

        // Alice add another 10 BTOKEN
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsAlice.work(
          2,
          pancakeswapWorker.address,
          ethers.utils.parseEther("10"),
          0,
          "0", // max return = 0, don't return NATIVE to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              addStratV2.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );

        const aliceBefore = await baseToken.balanceOf(await alice.getAddress());
        // Alice close position#2
        await vaultAsAlice.work(
          2,
          pancakeswapWorker.address,
          "0",
          "0",
          "1000000000000000000000000000000",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              liqStratV2.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256"],
                [baseToken.address, farmToken.address, "0"]
              ),
            ]
          )
        );
        const aliceAfter = await baseToken.balanceOf(await alice.getAddress());

        // Check Alice account, Alice must be richer as she earned from leverage yield farm without getting liquidated
        expect(aliceAfter).to.be.gt(aliceBefore);

        // there should be no LPv1 and LPv2 left in Worker, MasterChef as every exited the positions
        const [stakedLPv2] = await masterChef.userInfo(lpV2poolId, pancakeswapWorker.address);
        const [stakedLPv1] = await masterChef.userInfo(poolId, pancakeswapWorker.address);

        expect(stakedLPv1).to.be.eq(0);
        expect(stakedLPv2).to.be.eq(0);
      }).timeout(50000);
    });
  });
});
