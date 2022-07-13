import { ethers, network, upgrades, waffle } from "hardhat";
import { BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import {
  DebtToken,
  MockERC20,
  MockERC20__factory,
  MockWBNB,
  PancakePair,
  PancakePair__factory,
  SimpleVaultConfig,
  Vault,
  Vault__factory,
  WNativeRelayer,
  WaultSwapFactory,
  WaultSwapRouter,
  SpookyToken,
  SpookySwapStrategyAddBaseTokenOnly,
  SpookySwapStrategyLiquidate,
  SpookySwapStrategyAddTwoSidesOptimal,
  SpookySwapStrategyWithdrawMinimizeTrading,
  SpookySwapStrategyPartialCloseLiquidate,
  SpookySwapStrategyPartialCloseMinimizeTrading,
  MiniFL,
  Rewarder1,
  SpookyMasterChef,
  SpookyMasterChefV2,
  SpookyWorker03,
  SpookyWorker03__factory,
  MiniFL__factory,
  SpookyMasterChef__factory,
  SpookyMasterChefV2__factory,
  SpookyWorker03Migrate__factory,
  SpookyWorker03Migrate,
  SpookyMCV2Worker03__factory,
  SpookyMCV2Worker03,
  MockAggregatorV3__factory,
  DeltaNeutralOracle,
  ChainLinkPriceOracle,
  DeltaNeutralSpookyWorker03Migrate__factory,
  ChainLinkPriceOracle__factory,
  FairLaunch,
  AlpacaToken,
  DeltaNeutralSpookyWorker03Migrate,
  DeltaNeutralSpookyWorker03,
  DeltaNeutralSpookyWorker03__factory,
  DeltaNeutralSpookyMCV2Worker03__factory,
  DeltaNeutralSpookyMCV2Worker03,
} from "../../../../../typechain";
import * as AssertHelpers from "../../../../helpers/assert";
import * as TimeHelpers from "../../../../helpers/time";
import { parseEther } from "ethers/lib/utils";
import { DeployHelper } from "../../../../helpers/deploy";
import { SwapHelper } from "../../../../helpers/swap";
import { Worker02Helper } from "../../../../helpers/worker";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
const { expect } = chai;

describe("Vault - DeltaNeutralSpookyWorker03 Migrate", () => {
  const BOO_PER_SEC = ethers.utils.parseEther("0.076");
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther("5000");
  const REINVEST_BOUNTY_BPS = "100"; // 1% reinvest bounty
  const RESERVE_POOL_BPS = "1000"; // 10% reserve pool
  const KILL_PRIZE_BPS = "1000"; // 10% Kill prize
  const INTEREST_RATE = "3472222222222"; // 30% per year
  const MIN_DEBT_SIZE = ethers.utils.parseEther("1"); // 1 BTOKEN min debt size
  const WORK_FACTOR = "7000";
  const KILL_FACTOR = "8000";
  const DEPLOYER = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";
  const KILL_TREASURY_BPS = "100";
  const POOL_ID = 0;

  /// DEX-related instance(s)
  /// Note: Use WaultSwap due to same fee structure
  let factory: WaultSwapFactory;
  let router: WaultSwapRouter;

  let wbnb: MockWBNB;
  let lp: PancakePair;

  /// Token-related instance(s)
  let alpacaToken: AlpacaToken;
  let baseToken: MockERC20;
  let farmToken: MockERC20;
  let busd: MockERC20;
  let boo: SpookyToken;
  let rToken1: MockERC20;
  let debtToken: DebtToken;

  /// Strategy-ralted instance(s)
  let addStrat: SpookySwapStrategyAddBaseTokenOnly;
  let liqStrat: SpookySwapStrategyLiquidate;
  let twoSidesStrat: SpookySwapStrategyAddTwoSidesOptimal;
  let minimizeStrat: SpookySwapStrategyWithdrawMinimizeTrading;
  let partialCloseStrat: SpookySwapStrategyPartialCloseLiquidate;
  let partialCloseMinimizeStrat: SpookySwapStrategyPartialCloseMinimizeTrading;

  /// Vault-related instance(s)
  let simpleVaultConfig: SimpleVaultConfig;
  let wNativeRelayer: WNativeRelayer;
  let vault: Vault;

  /// FairLaunch instance(s)
  let fairLaunch: FairLaunch;

  /// PancakeswapMasterChef-related instance(s)
  let spookyMasterChef: SpookyMasterChef;
  let spookyMasterChefV2: SpookyMasterChefV2;
  let deltaNeutralSpookyWorker: DeltaNeutralSpookyWorker03;

  /// Oracle-related instance(s)
  let priceOracle: DeltaNeutralOracle;
  let chainlink: ChainLinkPriceOracle;

  let MockAggregatorV3Factory: MockAggregatorV3__factory;

  // Accounts
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let eve: SignerWithAddress;

  let deployerAddress: string;
  let aliceAddress: string;
  let bobAddress: string;
  let eveAddress: string;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let farmTokenAsAlice: MockERC20;

  let lpAsAlice: PancakePair;
  let lpAsBob: PancakePair;

  let deltaNeutralSpookyWorkerAsEve: DeltaNeutralSpookyWorker03;

  let chainLinkOracleAsDeployer: ChainLinkPriceOracle;

  let vaultAsAlice: Vault;
  let vaultAsBob: Vault;
  let vaultAsEve: Vault;

  // Test Helper
  let swapHelper: SwapHelper;
  let workerHelper: Worker02Helper;

  async function fixture() {
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
    const deployHelper = new DeployHelper(deployer);

    /// Setup token stuffs
    [busd, baseToken, farmToken] = await deployHelper.deployBEP20([
      {
        name: "BUSD",
        symbol: "BUSD",
        decimals: "18",
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("88888888888888") },
          { address: aliceAddress, amount: ethers.utils.parseEther("1000") },
          { address: bobAddress, amount: ethers.utils.parseEther("1000") },
        ],
      },
      {
        name: "BTOKEN",
        symbol: "BTOKEN",
        decimals: "18",
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("1000") },
          { address: aliceAddress, amount: ethers.utils.parseEther("1000") },
          { address: bobAddress, amount: ethers.utils.parseEther("1000") },
        ],
      },
      {
        name: "FTOKEN",
        symbol: "FTOKEN",
        decimals: "18",
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("1000") },
          { address: aliceAddress, amount: ethers.utils.parseEther("1000") },
          { address: bobAddress, amount: ethers.utils.parseEther("1000") },
        ],
      },
    ]);
    wbnb = await deployHelper.deployWBNB();
    [factory, router, boo, spookyMasterChef] = await deployHelper.deploySpookySwap(wbnb, BOO_PER_SEC, [
      { address: deployerAddress, amount: ethers.utils.parseEther("100") },
    ]);
    [alpacaToken, fairLaunch] = await deployHelper.deployAlpacaFairLaunch(
      ALPACA_REWARD_PER_BLOCK,
      ALPACA_BONUS_LOCK_UP_BPS,
      132,
      137
    );

    [vault, simpleVaultConfig, wNativeRelayer] = await deployHelper.deployVault(
      wbnb,
      {
        minDebtSize: MIN_DEBT_SIZE,
        interestRate: INTEREST_RATE,
        reservePoolBps: RESERVE_POOL_BPS,
        killPrizeBps: KILL_PRIZE_BPS,
        killTreasuryBps: KILL_TREASURY_BPS,
        killTreasuryAddress: DEPLOYER,
      },
      fairLaunch,
      baseToken
    );
    // Setup strategies
    [addStrat, liqStrat, twoSidesStrat, minimizeStrat, partialCloseStrat, partialCloseMinimizeStrat] =
      await deployHelper.deploySpookySwapStrategies(router, vault, wNativeRelayer);

    // whitelisted to be able to call kill
    await simpleVaultConfig.setWhitelistedLiquidators([await alice.getAddress(), await eve.getAddress()], true);

    // Set approved add strategies
    await simpleVaultConfig.setApprovedAddStrategy([addStrat.address, twoSidesStrat.address], true);

    // Setup BTOKEN-FTOKEN pair on Pancakeswap
    // Add lp to spookyMasterChef's pool
    await factory.createPair(baseToken.address, farmToken.address);
    lp = PancakePair__factory.connect(await factory.getPair(farmToken.address, baseToken.address), deployer);
    await spookyMasterChef.add(1, lp.address);

    /// Setup DeltaNeutralOracle
    [priceOracle, chainlink] = await deployHelper.deployDeltaNeutralOracle(
      [baseToken.address, farmToken.address],
      [ethers.utils.parseEther("1"), ethers.utils.parseEther("200")],
      [18, 18],
      busd.address
    );

    MockAggregatorV3Factory = (await ethers.getContractFactory(
      "MockAggregatorV3",
      deployer
    )) as MockAggregatorV3__factory;

    chainLinkOracleAsDeployer = ChainLinkPriceOracle__factory.connect(chainlink.address, deployer);

    /// Setup SpookyWorker03
    const DeltaNeutralSpookyWorker03 = (await ethers.getContractFactory(
      "DeltaNeutralSpookyWorker03",
      deployer
    )) as DeltaNeutralSpookyWorker03__factory;
    deltaNeutralSpookyWorker = (await upgrades.deployProxy(DeltaNeutralSpookyWorker03, [
      vault.address,
      baseToken.address,
      spookyMasterChef.address,
      router.address,
      POOL_ID,
      addStrat.address,
      REINVEST_BOUNTY_BPS,
      DEPLOYER,
      [boo.address, wbnb.address, baseToken.address],
      "0",
      priceOracle.address,
    ])) as DeltaNeutralSpookyWorker03;
    await deltaNeutralSpookyWorker.deployed();

    await simpleVaultConfig.setWorker(
      deltaNeutralSpookyWorker.address,
      true,
      true,
      WORK_FACTOR,
      KILL_FACTOR,
      true,
      true
    );
    await deltaNeutralSpookyWorker.setStrategyOk([twoSidesStrat.address, partialCloseStrat.address], true);
    await deltaNeutralSpookyWorker.setReinvestorOk([eveAddress], true);
    await deltaNeutralSpookyWorker.setTreasuryConfig(DEPLOYER, REINVEST_BOUNTY_BPS);
    await deltaNeutralSpookyWorker.setWhitelistedCallers([deployerAddress, aliceAddress, eveAddress], true);
    await addStrat.setWorkersOk([deltaNeutralSpookyWorker.address], true);
    await twoSidesStrat.setWorkersOk([deltaNeutralSpookyWorker.address], true);
    await liqStrat.setWorkersOk([deltaNeutralSpookyWorker.address], true);
    await partialCloseStrat.setWorkersOk([deltaNeutralSpookyWorker.address], true);
    await simpleVaultConfig.setApprovedAddStrategy([addStrat.address, twoSidesStrat.address], true);
    await simpleVaultConfig.setWhitelistedLiquidators([aliceAddress, eveAddress], true);

    swapHelper = new SwapHelper(factory.address, router.address, BigNumber.from(998), BigNumber.from(1000), deployer);
    await swapHelper.addLiquidities([
      {
        token0: baseToken,
        token1: farmToken,
        amount0desired: ethers.utils.parseEther("1"),
        amount1desired: ethers.utils.parseEther("0.1"),
      },
      {
        token0: boo,
        token1: wbnb,
        amount0desired: ethers.utils.parseEther("0.1"),
        amount1desired: ethers.utils.parseEther("1"),
      },
      {
        token0: baseToken,
        token1: wbnb,
        amount0desired: ethers.utils.parseEther("1"),
        amount1desired: ethers.utils.parseEther("1"),
      },
      {
        token0: farmToken,
        token1: wbnb,
        amount0desired: ethers.utils.parseEther("1"),
        amount1desired: ethers.utils.parseEther("1"),
      },
    ]);

    // Contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmTokenAsAlice = MockERC20__factory.connect(farmToken.address, alice);

    lpAsAlice = PancakePair__factory.connect(lp.address, alice);
    lpAsBob = PancakePair__factory.connect(lp.address, bob);

    vaultAsAlice = Vault__factory.connect(vault.address, alice);
    vaultAsBob = Vault__factory.connect(vault.address, bob);
    vaultAsEve = Vault__factory.connect(vault.address, eve);

    deltaNeutralSpookyWorkerAsEve = DeltaNeutralSpookyWorker03Migrate__factory.connect(
      deltaNeutralSpookyWorker.address,
      eve
    );
  }

  async function _updatePrice() {
    let [[basePrice], [farmPrice]] = await Promise.all([
      priceOracle.getTokenPrice(baseToken.address),
      priceOracle.getTokenPrice(farmToken.address),
    ]);
    let mockBaseAggregatorV3 = await MockAggregatorV3Factory.deploy(basePrice, 18);
    let mockFarmAggregatorV3 = await MockAggregatorV3Factory.deploy(farmPrice, 18);
    await mockBaseAggregatorV3.deployed();
    await mockFarmAggregatorV3.deployed();
    await chainLinkOracleAsDeployer.setPriceFeeds(
      [baseToken.address, farmToken.address],
      [busd.address, busd.address],
      [mockBaseAggregatorV3.address, mockFarmAggregatorV3.address]
    );
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);

    // reassign SwapHelper here due to provider will be different for each test-case
    workerHelper = new Worker02Helper(deltaNeutralSpookyWorker.address, spookyMasterChef.address);
  });

  context("when SpookySwap migrate to V2", async () => {
    beforeEach(async () => {
      const deployHelper = new DeployHelper(deployer);

      // Deploy dummyToken for MasterChefV2 to stake in MasterChefV1
      const dummyToken = await deployHelper.deployERC20();
      await dummyToken.mint(deployerAddress, 1);

      // Retire pools in MasterChefV1
      await spookyMasterChef.set(0, 0);

      // Add Master Pool for MasterChefV2
      await spookyMasterChef.add(1, dummyToken.address);
      const MASTER_PID = (await spookyMasterChef.poolLength()).sub(1);

      // Deploy MasterChefV2
      const SpookyMasterChefV2 = (await ethers.getContractFactory(
        "SpookyMasterChefV2",
        deployer
      )) as SpookyMasterChefV2__factory;
      spookyMasterChefV2 = await SpookyMasterChefV2.deploy(spookyMasterChef.address, boo.address, MASTER_PID);
      await spookyMasterChefV2.deployed();

      // Init MasterChefV2
      await dummyToken.approve(spookyMasterChefV2.address, 1);
      await spookyMasterChefV2.init(dummyToken.address);

      // Add Dummy Pool 0
      await spookyMasterChefV2.add(0, dummyToken.address, ethers.constants.AddressZero, true);

      // Add Pool for LP
      await spookyMasterChefV2.add(1, lp.address, ethers.constants.AddressZero, true);
    });

    context("when MasterChefV2 pool is empty", async () => {
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
        await baseToken.approve(vault.address, ethers.utils.parseEther("3"));
        await vault.deposit(ethers.utils.parseEther("3"));

        // Alice can take 0 debt ok
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
        await vaultAsAlice.work(
          0,
          deltaNeutralSpookyWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const healthPosition1Before = await deltaNeutralSpookyWorker.health(1);

        // Upgrade worker to migrate to DeltaNeutralSpookyWorker03Migrate
        const DeltaNeutralSpookyWorker03Migrate = (await ethers.getContractFactory(
          "DeltaNeutralSpookyWorker03Migrate",
          deployer
        )) as DeltaNeutralSpookyWorker03Migrate__factory;
        const deltaNeutralSpookyWorker03Migrate = (await upgrades.upgradeProxy(
          deltaNeutralSpookyWorker.address,
          DeltaNeutralSpookyWorker03Migrate
        )) as DeltaNeutralSpookyWorker03Migrate;
        await deltaNeutralSpookyWorker03Migrate.deployed();

        const healthBeforeMigrateLp = await deltaNeutralSpookyWorker.health(1);

        // Open Position #2 before migrateLp
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
        await vaultAsAlice.work(
          0,
          deltaNeutralSpookyWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const healthPosition2Before = await deltaNeutralSpookyWorker.health(2);

        await deltaNeutralSpookyWorker03Migrate.migrateLP(spookyMasterChefV2.address, 1);

        // Open Position #3 after migrateLp
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
        await vaultAsAlice.work(
          0,
          deltaNeutralSpookyWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const healthPosition3Before = await deltaNeutralSpookyWorker.health(3);

        // Upgrade to non-migrate version that support SpookyMasterChefV2
        const DeltaNeutralSpookyMCV2Worker03 = (await ethers.getContractFactory(
          "DeltaNeutralSpookyMCV2Worker03",
          deployer
        )) as DeltaNeutralSpookyMCV2Worker03__factory;
        const deltaNeutralSpookyMCV2Worker03 = (await upgrades.upgradeProxy(
          deltaNeutralSpookyWorker.address,
          DeltaNeutralSpookyMCV2Worker03
        )) as DeltaNeutralSpookyMCV2Worker03;
        await deltaNeutralSpookyMCV2Worker03.deployed();

        // Open Position #4 after upgrade to non-migrate version
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
        await vaultAsAlice.work(
          0,
          deltaNeutralSpookyWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const healthPosition4Before = await deltaNeutralSpookyWorker.health(4);

        const [oldMasterChefBalance] = await spookyMasterChef.userInfo(1, deltaNeutralSpookyWorker.address);
        const [masterChefV2Balance, ,] = await spookyMasterChefV2.userInfo(1, deltaNeutralSpookyWorker.address);
        expect(oldMasterChefBalance).to.be.eq(0);
        expect(masterChefV2Balance).to.be.gt(0);

        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        await _updatePrice();
        await deltaNeutralSpookyWorkerAsEve.reinvest();
        await vault.deposit(0); // Random action to trigger interest computation

        const healthPosition1After = await deltaNeutralSpookyWorker.health(1);
        const healthPosition2After = await deltaNeutralSpookyWorker.health(2);
        const healthPosition3After = await deltaNeutralSpookyWorker.health(3);
        const healthPosition4After = await deltaNeutralSpookyWorker.health(4);

        expect(healthPosition1After).to.be.gt(healthPosition1Before);
        expect(healthPosition2After).to.be.gt(healthPosition2Before);
        expect(healthPosition3After).to.be.gt(healthPosition3Before);
        expect(healthPosition4After).to.be.gt(healthPosition4Before);
      });
    });

    context("when Alice try to migrate the pool", async () => {
      it("should revert", async () => {
        // Upgrade worker to migrate to DeltaNeutralSpookyWorker03Migrate
        const DeltaNeutralSpookyWorker03Migrate = (await ethers.getContractFactory(
          "DeltaNeutralSpookyWorker03Migrate",
          deployer
        )) as DeltaNeutralSpookyWorker03Migrate__factory;
        const deltaNeutralSpookyWorker03Migrate = (await upgrades.upgradeProxy(
          deltaNeutralSpookyWorker.address,
          DeltaNeutralSpookyWorker03Migrate
        )) as DeltaNeutralSpookyWorker03Migrate;
        await deltaNeutralSpookyWorker03Migrate.deployed();

        // Alice try to migrate the pool
        await expect(
          deltaNeutralSpookyWorker03Migrate.connect(alice).migrateLP(spookyMasterChefV2.address, 2)
        ).to.be.revertedWith("!D");
      });
    });

    context("when migrate with wrong poolId", async () => {
      it("should revert", async () => {
        // Add a new pool at MasterChefV2
        await spookyMasterChefV2.add(0, baseToken.address, ethers.constants.AddressZero, true);

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
        await baseToken.approve(vault.address, ethers.utils.parseEther("3"));
        await vault.deposit(ethers.utils.parseEther("3"));

        // Alice can take 0 debt ok
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
        await vaultAsAlice.work(
          0,
          deltaNeutralSpookyWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        // Upgrade worker to migrate to DeltaNeutralSpookyWorker03Migrate
        const DeltaNeutralSpookyWorker03Migrate = (await ethers.getContractFactory(
          "DeltaNeutralSpookyWorker03Migrate",
          deployer
        )) as DeltaNeutralSpookyWorker03Migrate__factory;
        const deltaNeutralSpookyWorker03Migrate = (await upgrades.upgradeProxy(
          deltaNeutralSpookyWorker.address,
          DeltaNeutralSpookyWorker03Migrate
        )) as DeltaNeutralSpookyWorker03Migrate;
        await deltaNeutralSpookyWorker03Migrate.deployed();

        // Migrate LP with wrong pool id
        await expect(deltaNeutralSpookyWorker03Migrate.migrateLP(spookyMasterChefV2.address, 2)).to.be.revertedWith(
          "!LP Token"
        );
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
        await baseToken.approve(vault.address, ethers.utils.parseEther("3"));
        await vault.deposit(ethers.utils.parseEther("3"));

        // Alice can take 0 debt ok
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
        await vaultAsAlice.work(
          0,
          deltaNeutralSpookyWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        // Upgrade worker to migrate to DeltaNeutralSpookyWorker03Migrate
        const DeltaNeutralSpookyWorker03Migrate = (await ethers.getContractFactory(
          "DeltaNeutralSpookyWorker03Migrate",
          deployer
        )) as DeltaNeutralSpookyWorker03Migrate__factory;
        const deltaNeutralSpookyWorker03Migrate = (await upgrades.upgradeProxy(
          deltaNeutralSpookyWorker.address,
          DeltaNeutralSpookyWorker03Migrate
        )) as DeltaNeutralSpookyWorker03Migrate;
        await deltaNeutralSpookyWorker03Migrate.deployed();

        // Migrate LP 1st time successfully
        await deltaNeutralSpookyWorker03Migrate.migrateLP(spookyMasterChefV2.address, 1);

        await expect(deltaNeutralSpookyWorker03Migrate.migrateLP(spookyMasterChefV2.address, 1)).to.be.revertedWith(
          "!MasterChefV2"
        );
      });
    });
  });
});
