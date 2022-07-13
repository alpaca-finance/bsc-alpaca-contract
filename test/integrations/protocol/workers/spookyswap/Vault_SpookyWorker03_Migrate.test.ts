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

describe("Vault - SpookyWorker03 Migrate", () => {
  const BOO_PER_SEC = ethers.utils.parseEther("0.076");
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
  let alpacaToken: MockERC20;
  let baseToken: MockERC20;
  let farmToken: MockERC20;
  let extraToken: MockERC20;
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

  /// MiniFL instance(s)
  let miniFL: MiniFL;
  let rewarder1: Rewarder1;

  /// PancakeswapMasterChef-related instance(s)
  let spookyMasterChef: SpookyMasterChef;
  let spookyMasterChefV2: SpookyMasterChefV2;
  let spookyWorker: SpookyWorker03;

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

  let miniFLAsAlice: MiniFL;

  let lpAsAlice: PancakePair;
  let lpAsBob: PancakePair;

  let spookyWorkerAsEve: SpookyWorker03;

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
    [alpacaToken, extraToken, baseToken, farmToken] = await deployHelper.deployBEP20([
      {
        name: "Alpaca Token",
        symbol: "ALP",
        decimals: 18,
        holders: [
          {
            address: deployerAddress,
            amount: ethers.utils.parseEther("88888888888888"),
          },
        ],
      },
      {
        name: "EXTRA",
        symbol: "EXTRA",
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
    miniFL = await deployHelper.deployMiniFL(alpacaToken.address);
    rewarder1 = await deployHelper.deployRewarder1(miniFL.address, extraToken.address);

    // Seed reward liquidity
    await alpacaToken.mint(miniFL.address, ethers.utils.parseEther("888888888888"));
    await extraToken.mint(rewarder1.address, ethers.utils.parseEther("888888888888"));

    [vault, simpleVaultConfig, wNativeRelayer] = await deployHelper.deployMiniFLVault(
      wbnb,
      {
        minDebtSize: MIN_DEBT_SIZE,
        interestRate: INTEREST_RATE,
        reservePoolBps: RESERVE_POOL_BPS,
        killPrizeBps: KILL_PRIZE_BPS,
        killTreasuryBps: KILL_TREASURY_BPS,
        killTreasuryAddress: DEPLOYER,
      },
      miniFL,
      rewarder1.address,
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

    /// Setup SpookyWorker03
    const SpookyWorker03 = (await ethers.getContractFactory("SpookyWorker03", deployer)) as SpookyWorker03__factory;
    spookyWorker = (await upgrades.deployProxy(SpookyWorker03, [
      vault.address,
      baseToken.address,
      spookyMasterChef.address,
      router.address,
      POOL_ID,
      addStrat.address,
      liqStrat.address,
      REINVEST_BOUNTY_BPS,
      DEPLOYER,
      [boo.address, wbnb.address, baseToken.address],
      "0",
    ])) as SpookyWorker03;
    await spookyWorker.deployed();

    await simpleVaultConfig.setWorker(spookyWorker.address, true, true, WORK_FACTOR, KILL_FACTOR, true, true);
    await spookyWorker.setStrategyOk([twoSidesStrat.address, partialCloseStrat.address], true);
    await spookyWorker.setReinvestorOk([eveAddress], true);
    await spookyWorker.setTreasuryConfig(DEPLOYER, REINVEST_BOUNTY_BPS);
    await addStrat.setWorkersOk([spookyWorker.address], true);
    await twoSidesStrat.setWorkersOk([spookyWorker.address], true);
    await liqStrat.setWorkersOk([spookyWorker.address], true);
    await partialCloseStrat.setWorkersOk([spookyWorker.address], true);
    await simpleVaultConfig.setApprovedAddStrategy([addStrat.address, twoSidesStrat.address], true);
    await simpleVaultConfig.setWhitelistedLiquidators([await alice.getAddress(), await eve.getAddress()], true);

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

    miniFLAsAlice = MiniFL__factory.connect(miniFL.address, alice);

    vaultAsAlice = Vault__factory.connect(vault.address, alice);
    vaultAsBob = Vault__factory.connect(vault.address, bob);
    vaultAsEve = Vault__factory.connect(vault.address, eve);

    spookyWorkerAsEve = SpookyWorker03__factory.connect(spookyWorker.address, eve);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);

    // reassign SwapHelper here due to provider will be different for each test-case
    workerHelper = new Worker02Helper(spookyWorker.address, spookyMasterChef.address);
  });

  context("when worker is initialized", async () => {
    it("should has FTOKEN as a farmingToken in PancakeswapWorker", async () => {
      expect(await spookyWorker.farmingToken()).to.be.equal(farmToken.address);
    });

    it("should initialized the correct fee and feeDenom", async () => {
      expect(await spookyWorker.fee()).to.be.eq("998");
      expect(await spookyWorker.feeDenom()).to.be.eq("1000");
    });
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
          miniFL.address,
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
          spookyWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const healthPosition1Before = await spookyWorker.health(1);

        // Upgrade worker to migrate to SpookyMasterChefV2
        const SpookyWorker03Migrate = (await ethers.getContractFactory(
          "SpookyWorker03Migrate",
          deployer
        )) as SpookyWorker03Migrate__factory;
        const spookyWorker03Migrage = (await upgrades.upgradeProxy(
          spookyWorker.address,
          SpookyWorker03Migrate
        )) as SpookyWorker03Migrate;
        await spookyWorker03Migrage.deployed();

        const healthBeforeMigrateLp = await spookyWorker.health(1);

        // Open Position #2 before migrateLp
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
        await vaultAsAlice.work(
          0,
          spookyWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const healthPosition2Before = await spookyWorker.health(2);

        await spookyWorker03Migrage.migrateLP(spookyMasterChefV2.address, 1);

        // Open Position #3 after migrateLp
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
        await vaultAsAlice.work(
          0,
          spookyWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const healthPosition3Before = await spookyWorker.health(3);

        // Upgrade to non-migrate version that support SpookyMasterChefV2
        const SpookyMCV2Worker03 = (await ethers.getContractFactory(
          "SpookyMCV2Worker03",
          deployer
        )) as SpookyMCV2Worker03__factory;
        const spookyMCV2Worker03 = (await upgrades.upgradeProxy(
          spookyWorker.address,
          SpookyMCV2Worker03
        )) as SpookyMCV2Worker03;
        await spookyMCV2Worker03.deployed();

        // Open Position #4 after upgrade to non-migrate version
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
        await vaultAsAlice.work(
          0,
          spookyWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const healthPosition4Before = await spookyWorker.health(4);

        const [oldMasterChefBalance] = await spookyMasterChef.userInfo(1, spookyWorker.address);
        const [masterChefV2Balance, ,] = await spookyMasterChefV2.userInfo(1, spookyWorker.address);
        expect(oldMasterChefBalance).to.be.eq(0);
        expect(masterChefV2Balance).to.be.gt(0);

        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        await spookyWorkerAsEve.reinvest();
        await vault.deposit(0); // Random action to trigger interest computation

        const healthPosition1After = await spookyWorker.health(1);
        const healthPosition2After = await spookyWorker.health(2);
        const healthPosition3After = await spookyWorker.health(3);
        const healthPosition4After = await spookyWorker.health(4);

        expect(healthPosition1After).to.be.gt(healthPosition1Before);
        expect(healthPosition2After).to.be.gt(healthPosition2Before);
        expect(healthPosition3After).to.be.gt(healthPosition3Before);
        expect(healthPosition4After).to.be.gt(healthPosition4Before);
      });
    });

    context("when Alice try to migrate the pool", async () => {
      it("should revert", async () => {
        // Upgrade worker to migrate to MasterChefV2
        const SpookyWorker03Migrate = (await ethers.getContractFactory(
          "SpookyWorker03Migrate",
          deployer
        )) as SpookyWorker03Migrate__factory;
        const spookyWorker03Migrate = (await upgrades.upgradeProxy(
          spookyWorker.address,
          SpookyWorker03Migrate
        )) as SpookyWorker03Migrate;
        await spookyWorker03Migrate.deployed();

        // Alice try to migrate the pool
        await expect(spookyWorker03Migrate.connect(alice).migrateLP(spookyMasterChefV2.address, 2)).to.be.revertedWith(
          "!D"
        );
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
          miniFL.address,
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
          spookyWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        // Upgrade worker to migrate to MasterChefV2
        const SpookyWorker03Migrate = (await ethers.getContractFactory(
          "SpookyWorker03Migrate",
          deployer
        )) as SpookyWorker03Migrate__factory;
        const spookyWorker03Migrate = (await upgrades.upgradeProxy(
          spookyWorker.address,
          SpookyWorker03Migrate
        )) as SpookyWorker03Migrate;
        await spookyWorker03Migrate.deployed();

        // Migrate LP with wrong pool id
        await expect(spookyWorker03Migrate.migrateLP(spookyMasterChefV2.address, 2)).to.be.revertedWith("!LP Token");
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
          miniFL.address,
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
          spookyWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        // Upgrade worker to migrate to MasterChefV2
        const SpookyWorker03Migrate = (await ethers.getContractFactory(
          "SpookyWorker03Migrate",
          deployer
        )) as SpookyWorker03Migrate__factory;
        const spookyWorker03Migrate = (await upgrades.upgradeProxy(
          spookyWorker.address,
          SpookyWorker03Migrate
        )) as SpookyWorker03Migrate;
        await spookyWorker03Migrate.deployed();

        // Migrate LP 1st time successfully
        await spookyWorker03Migrate.migrateLP(spookyMasterChefV2.address, 1);

        await expect(spookyWorker03Migrate.migrateLP(spookyMasterChefV2.address, 1)).to.be.revertedWith(
          "!MasterChefV2"
        );
      });
    });
  });
});
