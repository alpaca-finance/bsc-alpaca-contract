import { ethers, network, upgrades, waffle } from "hardhat";
import { constants, BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import {
  AlpacaToken,
  CakeToken,
  DebtToken,
  FairLaunch,
  FairLaunch__factory,
  MockContractContext,
  MockContractContext__factory,
  MockERC20,
  MockERC20__factory,
  MockWBNB,
  PancakeFactory,
  PancakeMasterChef,
  PancakeMasterChef__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouterV2,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedStrategyLiquidate,
  PancakeswapV2RestrictedStrategyPartialCloseLiquidate,
  PancakeswapV2Worker,
  PancakeswapV2Worker__factory,
  PancakeswapV2Worker02,
  PancakeswapV2Worker02__factory,
  SimpleVaultConfig,
  SyrupBar,
  Vault,
  Vault__factory,
  WNativeRelayer,
  MockBeneficialVault__factory,
  MockBeneficialVault,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal,
  PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading,
  PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading,
  MasterChefV2__factory,
  MasterChefV2,
  PancakeswapV2Worker02Migrate,
  PancakeswapV2Worker02Migrate__factory,
  PancakeswapV2MCV2Worker02,
  PancakeswapV2MCV2Worker02__factory,
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

describe("Vault - PancakeswapV202_Migrate", () => {
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
  const MAX_REINVEST_BOUNTY: string = "900";
  const DEPLOYER = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";
  const BENEFICIALVAULT_BOUNTY_BPS = "1000";
  const REINVEST_THRESHOLD = ethers.utils.parseEther("1"); // If pendingCake > 1 $CAKE, then reinvest
  const KILL_TREASURY_BPS = "100";
  const POOL_ID = 1;

  /// Pancakeswap-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouterV2;

  let wbnb: MockWBNB;
  let lp: PancakePair;

  /// Token-related instance(s)
  let baseToken: MockERC20;
  let farmToken: MockERC20;
  let cake: CakeToken;
  let syrup: SyrupBar;
  let debtToken: DebtToken;

  /// Strategy-ralted instance(s)
  let addStrat: PancakeswapV2RestrictedStrategyAddBaseTokenOnly;
  let twoSidesStrat: PancakeswapV2RestrictedStrategyAddTwoSidesOptimal;
  let liqStrat: PancakeswapV2RestrictedStrategyLiquidate;
  let minimizeStrat: PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading;
  let partialCloseStrat: PancakeswapV2RestrictedStrategyPartialCloseLiquidate;
  let partialCloseMinimizeStrat: PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading;

  /// Vault-related instance(s)
  let simpleVaultConfig: SimpleVaultConfig;
  let wNativeRelayer: WNativeRelayer;
  let vault: Vault;

  /// FairLaunch-related instance(s)
  let fairLaunch: FairLaunch;
  let alpacaToken: AlpacaToken;

  /// PancakeswapMasterChef-related instance(s)
  let masterChef: PancakeMasterChef;
  let masterChefV2: MasterChefV2;
  let pancakeswapV2Worker: PancakeswapV2Worker02;
  let pancakeswapV2Worker01: PancakeswapV2Worker;

  /// Timelock instance(s)
  let whitelistedContract: MockContractContext;
  let evilContract: MockContractContext;

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

  let fairLaunchAsAlice: FairLaunch;

  let lpAsAlice: PancakePair;
  let lpAsBob: PancakePair;

  let pancakeMasterChefAsAlice: PancakeMasterChef;
  let pancakeMasterChefAsBob: PancakeMasterChef;

  let pancakeswapV2WorkerAsEve: PancakeswapV2Worker02;
  let pancakeswapV2Worker01AsEve: PancakeswapV2Worker;

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

    // Setup MockContractContext
    const MockContractContext = (await ethers.getContractFactory(
      "MockContractContext",
      deployer
    )) as MockContractContext__factory;
    whitelistedContract = await MockContractContext.deploy();
    await whitelistedContract.deployed();
    evilContract = await MockContractContext.deploy();
    await evilContract.deployed();

    /// Setup token stuffs
    [baseToken, farmToken] = await deployHelper.deployBEP20([
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
    [factoryV2, routerV2, cake, syrup, masterChef] = await deployHelper.deployPancakeV2(wbnb, CAKE_REWARD_PER_BLOCK, [
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
      await deployHelper.deployPancakeV2Strategies(routerV2, vault, wbnb, wNativeRelayer);

    // whitelisted contract to be able to call work
    await simpleVaultConfig.setWhitelistedCallers([whitelistedContract.address], true);

    // whitelisted to be able to call kill
    await simpleVaultConfig.setWhitelistedLiquidators([await alice.getAddress(), await eve.getAddress()], true);

    // Set approved add strategies
    await simpleVaultConfig.setApprovedAddStrategy([addStrat.address, twoSidesStrat.address], true);

    // Setup BTOKEN-FTOKEN pair on Pancakeswap
    // Add lp to masterChef's pool
    await factoryV2.createPair(baseToken.address, farmToken.address);
    lp = PancakePair__factory.connect(await factoryV2.getPair(farmToken.address, baseToken.address), deployer);
    await masterChef.add(1, lp.address, true);

    /// Setup PancakeswapV2Worker02
    pancakeswapV2Worker = await deployHelper.deployPancakeV2Worker02(
      vault,
      baseToken,
      masterChef,
      routerV2,
      POOL_ID,
      WORK_FACTOR,
      KILL_FACTOR,
      addStrat,
      liqStrat,
      REINVEST_BOUNTY_BPS,
      [eveAddress],
      DEPLOYER,
      [cake.address, wbnb.address, baseToken.address],
      [twoSidesStrat.address, minimizeStrat.address, partialCloseStrat.address, partialCloseMinimizeStrat.address],
      simpleVaultConfig
    );

    pancakeswapV2Worker01 = await deployHelper.deployPancakeV2Worker(
      vault,
      baseToken,
      masterChef,
      routerV2,
      POOL_ID,
      WORK_FACTOR,
      KILL_FACTOR,
      addStrat,
      liqStrat,
      REINVEST_BOUNTY_BPS,
      [eveAddress],
      [twoSidesStrat.address, minimizeStrat.address, partialCloseStrat.address, partialCloseMinimizeStrat.address],
      simpleVaultConfig
    );

    swapHelper = new SwapHelper(
      factoryV2.address,
      routerV2.address,
      BigNumber.from(9975),
      BigNumber.from(10000),
      deployer
    );
    await swapHelper.addLiquidities([
      {
        token0: baseToken,
        token1: farmToken,
        amount0desired: ethers.utils.parseEther("1"),
        amount1desired: ethers.utils.parseEther("0.1"),
      },
      {
        token0: cake,
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

    fairLaunchAsAlice = FairLaunch__factory.connect(fairLaunch.address, alice);

    pancakeMasterChefAsAlice = PancakeMasterChef__factory.connect(masterChef.address, alice);
    pancakeMasterChefAsBob = PancakeMasterChef__factory.connect(masterChef.address, bob);

    vaultAsAlice = Vault__factory.connect(vault.address, alice);
    vaultAsBob = Vault__factory.connect(vault.address, bob);
    vaultAsEve = Vault__factory.connect(vault.address, eve);

    pancakeswapV2WorkerAsEve = PancakeswapV2Worker02__factory.connect(pancakeswapV2Worker.address, eve);
    pancakeswapV2Worker01AsEve = PancakeswapV2Worker__factory.connect(pancakeswapV2Worker01.address, eve);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);

    // reassign SwapHelper here due to provider will be different for each test-case
    workerHelper = new Worker02Helper(pancakeswapV2Worker.address, masterChef.address);
  });

  context("when worker is initialized", async () => {
    it("should has FTOKEN as a farmingToken in PancakeswapWorker", async () => {
      expect(await pancakeswapV2Worker.farmingToken()).to.be.equal(farmToken.address);
    });

    it("should initialized the correct fee and feeDenom", async () => {
      expect(await pancakeswapV2Worker.fee()).to.be.eq("9975");
      expect(await pancakeswapV2Worker.feeDenom()).to.be.eq("10000");
    });

    it("should give rewards out when you stake LP tokens", async () => {
      // Deployer sends some LP tokens to Alice and Bob
      await lp.transfer(aliceAddress, ethers.utils.parseEther("0.05"));
      await lp.transfer(bobAddress, ethers.utils.parseEther("0.05"));

      // Alice and Bob stake 0.01 LP tokens and waits for 1 day
      await lpAsAlice.approve(masterChef.address, ethers.utils.parseEther("0.01"));
      await lpAsBob.approve(masterChef.address, ethers.utils.parseEther("0.02"));
      await pancakeMasterChefAsAlice.deposit(POOL_ID, ethers.utils.parseEther("0.01"));
      await pancakeMasterChefAsBob.deposit(POOL_ID, ethers.utils.parseEther("0.02")); // alice +1 Reward

      // Alice and Bob withdraw stake from the pool
      await pancakeMasterChefAsBob.withdraw(POOL_ID, ethers.utils.parseEther("0.02")); // alice +1/3 Reward  Bob + 2/3 Reward
      await pancakeMasterChefAsAlice.withdraw(POOL_ID, ethers.utils.parseEther("0.01")); // alice +1 Reward

      AssertHelpers.assertAlmostEqual(
        (await cake.balanceOf(aliceAddress)).toString(),
        CAKE_REWARD_PER_BLOCK.mul(BigNumber.from(7)).div(BigNumber.from(3)).toString()
      );
      AssertHelpers.assertAlmostEqual(
        (await cake.balanceOf(bobAddress)).toString(),
        CAKE_REWARD_PER_BLOCK.mul(2).div(3).toString()
      );
    });
  });

  context("when PCS migrate to V2", async () => {
    beforeEach(async () => {
      const deployHelper = new DeployHelper(deployer);

      // Deploy dummyToken for MasterChefV2 to stake in MasterChefV1
      const dummyToken = await deployHelper.deployERC20();
      await dummyToken.mint(deployerAddress, 1);

      // Retire pools in MasterChefV1
      await masterChef.set(1, 0, true);

      // Add Master Pool for MasterChefV2
      await masterChef.add(1, dummyToken.address, true);
      const MASTER_PID = (await masterChef.poolLength()).sub(1);

      // Deploy MasterChefV2
      const MasterChefV2 = (await ethers.getContractFactory("MasterChefV2", deployer)) as MasterChefV2__factory;
      masterChefV2 = await MasterChefV2.deploy(masterChef.address, cake.address, MASTER_PID, deployerAddress);
      await masterChefV2.deployed();

      // Init MasterChefV2
      await dummyToken.approve(masterChefV2.address, 1);
      await masterChefV2.init(dummyToken.address);

      // Add Dummy Pool 0
      await masterChefV2.add(0, dummyToken.address, true, true);

      // Add Pool for LP
      await masterChefV2.add(1, lp.address, true, true);
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
          pancakeswapV2Worker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const healthPosition1Before = await pancakeswapV2Worker.health(1);

        // Upgrade worker to migrate to MasterChefV2
        const PancakeswapV2Worker02Migrate = (await ethers.getContractFactory(
          "PancakeswapV2Worker02Migrate",
          deployer
        )) as PancakeswapV2Worker02Migrate__factory;
        const pancakeswapV202workerMigrate = (await upgrades.upgradeProxy(
          pancakeswapV2Worker.address,
          PancakeswapV2Worker02Migrate
        )) as PancakeswapV2Worker02Migrate;
        await pancakeswapV202workerMigrate.deployed();

        const healthBeforeMigrateLp = await pancakeswapV2Worker.health(1);

        // Open Position #2 before migrateLp
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
        await vaultAsAlice.work(
          0,
          pancakeswapV2Worker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const healthPosition2Before = await pancakeswapV2Worker.health(2);

        await pancakeswapV202workerMigrate.migrateLP(masterChefV2.address, 1);

        // Open Position #3 after migrateLp
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
        await vaultAsAlice.work(
          0,
          pancakeswapV2Worker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const healthPosition3Before = await pancakeswapV2Worker.health(3);

        // Upgrade to non-migrate version that support MasterChefV2
        const PancakeswapV2MCV2Worker02 = (await ethers.getContractFactory(
          "PancakeswapV2MCV2Worker02",
          deployer
        )) as PancakeswapV2MCV2Worker02__factory;
        const pancakeswapV2MCV2Worker02 = (await upgrades.upgradeProxy(
          pancakeswapV2Worker.address,
          PancakeswapV2MCV2Worker02
        )) as PancakeswapV2MCV2Worker02;
        await pancakeswapV2MCV2Worker02.deployed();

        // Open Position #4 after upgrade to non-migrate version
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
        await vaultAsAlice.work(
          0,
          pancakeswapV2Worker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const healthPosition4Before = await pancakeswapV2Worker.health(4);

        const [oldMasterChefBalance] = await masterChef.userInfo(1, pancakeswapV2Worker.address);
        const [masterChefV2Balance, ,] = await masterChefV2.userInfo(1, pancakeswapV2Worker.address);
        expect(oldMasterChefBalance).to.be.eq(0);
        expect(masterChefV2Balance).to.be.gt(0);

        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        await pancakeswapV2WorkerAsEve.reinvest();
        await vault.deposit(0); // Random action to trigger interest computation

        const healthPosition1After = await pancakeswapV2Worker.health(1);
        const healthPosition2After = await pancakeswapV2Worker.health(2);
        const healthPosition3After = await pancakeswapV2Worker.health(3);
        const healthPosition4After = await pancakeswapV2Worker.health(4);

        expect(healthPosition1After).to.be.gt(healthPosition1Before);
        expect(healthPosition2After).to.be.gt(healthPosition2Before);
        expect(healthPosition3After).to.be.gt(healthPosition3Before);
        expect(healthPosition4After).to.be.gt(healthPosition4Before);
      });
    });

    context("when Alice try to migrate the pool", async () => {
      it("should revert", async () => {
        // Upgrade worker to migrate to MasterChefV2
        const PancakeswapV2Worker02Migrate = (await ethers.getContractFactory(
          "PancakeswapV2Worker02Migrate",
          deployer
        )) as PancakeswapV2Worker02Migrate__factory;
        const pancakeswapV202workerMigrate = (await upgrades.upgradeProxy(
          pancakeswapV2Worker.address,
          PancakeswapV2Worker02Migrate
        )) as PancakeswapV2Worker02Migrate;
        await pancakeswapV202workerMigrate.deployed();

        // Alice try to migrate the pool
        await expect(pancakeswapV202workerMigrate.connect(alice).migrateLP(masterChefV2.address, 2)).to.be.revertedWith(
          "!D"
        );
      });
    });

    context("when migrate with wrong poolId", async () => {
      it("should revert", async () => {
        // Add a new pool at MasterChefV2
        await masterChefV2.add(0, baseToken.address, true, true);

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
          pancakeswapV2Worker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        // Upgrade worker to migrate to MasterChefV2
        const PancakeswapV2Worker02Migrate = (await ethers.getContractFactory(
          "PancakeswapV2Worker02Migrate",
          deployer
        )) as PancakeswapV2Worker02Migrate__factory;
        const pancakeswapV202workerMigrate = (await upgrades.upgradeProxy(
          pancakeswapV2Worker.address,
          PancakeswapV2Worker02Migrate
        )) as PancakeswapV2Worker02Migrate;
        await pancakeswapV202workerMigrate.deployed();

        // Migrate LP with wrong pool id
        await expect(pancakeswapV202workerMigrate.migrateLP(masterChefV2.address, 2)).to.be.revertedWith("!LP Token");
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
          pancakeswapV2Worker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        // Upgrade worker to migrate to MasterChefV2
        const PancakeswapV2Worker02Migrate = (await ethers.getContractFactory(
          "PancakeswapV2Worker02Migrate",
          deployer
        )) as PancakeswapV2Worker02Migrate__factory;
        const pancakeswapV202workerMigrate = (await upgrades.upgradeProxy(
          pancakeswapV2Worker.address,
          PancakeswapV2Worker02Migrate
        )) as PancakeswapV2Worker02Migrate;
        await pancakeswapV202workerMigrate.deployed();

        // Migrate LP 1st time successfully
        await pancakeswapV202workerMigrate.migrateLP(masterChefV2.address, 1);

        await expect(pancakeswapV202workerMigrate.migrateLP(masterChefV2.address, 1)).to.be.revertedWith(
          "!MasterChefV2"
        );
      });
    });
  });
});
