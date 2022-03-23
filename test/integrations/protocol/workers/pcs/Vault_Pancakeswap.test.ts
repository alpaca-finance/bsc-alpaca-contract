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
  PancakeFactory,
  PancakeFactory__factory,
  PancakeMasterChef,
  PancakeMasterChef__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouter,
  PancakeRouter__factory,
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

describe("Vault - Pancakeswap", () => {
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

  let wbnb: MockWBNB;
  let lp: PancakePair;

  /// Token-related instance(s)
  let baseToken: MockERC20;
  let farmToken: MockERC20;
  let cake: CakeToken;
  let syrup: SyrupBar;
  let debtToken: DebtToken;

  /// Strategy-ralted instance(s)
  let addStrat: StrategyAddBaseTokenOnly;
  let liqStrat: StrategyLiquidate;
  let partialCloseStrat: StrategyPartialCloseLiquidate;

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
      await deployer.getAddress(),
    ])) as SimpleVaultConfig;
    await simpleVaultConfig.deployed();

    // whitelisted to be able to call kill
    await simpleVaultConfig.setWhitelistedLiquidators([await alice.getAddress(), await eve.getAddress()], true);

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

  context("when owner is setting worker", async () => {
    it("should set reinvest bounty if < max", async () => {
      await pancakeswapWorker.setReinvestBountyBps(250);
      expect(await pancakeswapWorker.reinvestBountyBps()).to.be.eq(250);
    });

    it("should set max reinvest bounty", async () => {
      pancakeswapWorker.setMaxReinvestBountyBps(200);
    });

    it("should revert when owner set reinvestBountyBps > max", async () => {
      await expect(pancakeswapWorker.setReinvestBountyBps(1000)).to.be.revertedWith(
        "PancakeswapWorker::setReinvestBountyBps:: _reinvestBountyBps exceeded maxReinvestBountyBps"
      );
      expect(await pancakeswapWorker.reinvestBountyBps()).to.be.eq(100);
    });

    it("should set strat ok", async () => {
      await pancakeswapWorker.setStrategyOk([await alice.getAddress()], true);
      expect(await pancakeswapWorker.okStrats(await alice.getAddress())).to.be.eq(true);
    });
  });

  context("when user uses LYF", async () => {
    it("should allow to open a position without debt", async () => {
      // Deployer deposits 3 BTOKEN to the bank
      await baseToken.approve(vault.address, ethers.utils.parseEther("3"));
      await vault.deposit(ethers.utils.parseEther("3"));

      // Alice can take 0 debt ok
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
      await vaultAsAlice.work(
        0,
        pancakeswapWorker.address,
        ethers.utils.parseEther("0.3"),
        ethers.utils.parseEther("0"),
        "0",
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
    });

    it("should not allow to open a position with debt less than MIN_DEBT_SIZE", async () => {
      // Deployer deposits 3 BTOKEN to the bank
      await baseToken.approve(vault.address, ethers.utils.parseEther("3"));
      await vault.deposit(ethers.utils.parseEther("3"));

      // Alice cannot take 0.3 debt because it is too small
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
      await expect(
        vaultAsAlice.work(
          0,
          pancakeswapWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0.3"),
          "0",
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
        )
      ).to.be.revertedWith("too small debt size");
    });

    it("should not allow to open the position with bad work factor", async () => {
      // Deployer deposits 3 BTOKEN to the bank
      await baseToken.approve(vault.address, ethers.utils.parseEther("3"));
      await vault.deposit(ethers.utils.parseEther("3"));

      // Alice cannot take 1 BTOKEN loan because she only put 0.3 BTOKEN as a collateral
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
      await expect(
        vaultAsAlice.work(
          0,
          pancakeswapWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("1"),
          "0",
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
        )
      ).to.be.revertedWith("bad work factor");
    });

    it("should not allow positions if Vault has less BaseToken than requested loan", async () => {
      // Alice cannot take 1 BTOKEN loan because the contract does not have it
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
      await expect(
        vaultAsAlice.work(
          0,
          pancakeswapWorker.address,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("1"),
          "0",
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
        )
      ).to.be.revertedWith("insufficient funds in the vault");
    });

    it("should not able to liquidate healthy position", async () => {
      // Deployer deposits 3 BTOKEN to the bank
      const deposit = ethers.utils.parseEther("3");
      await baseToken.approve(vault.address, deposit);
      await vault.deposit(deposit);

      // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
      const loan = ethers.utils.parseEther("1");
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
      await vaultAsAlice.work(
        0,
        pancakeswapWorker.address,
        ethers.utils.parseEther("1"),
        loan,
        "0",
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

      // Her position should have ~2 BTOKEN health (minus some small trading fee)
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
      await pancakeswapWorkerAsEve.reinvest();
      await vault.deposit(0); // Random action to trigger interest computation

      // You can't liquidate her position yet
      await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
      await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");
    });

    it("should work", async () => {
      // Deployer deposits 3 BTOKEN to the bank
      const deposit = ethers.utils.parseEther("3");
      await baseToken.approve(vault.address, deposit);
      await vault.deposit(deposit);

      // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
      const loan = ethers.utils.parseEther("1");
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
      await vaultAsAlice.work(
        0,
        pancakeswapWorker.address,
        ethers.utils.parseEther("1"),
        loan,
        "0",
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

      // Her position should have ~2 NATIVE health (minus some small trading fee)
      expect(await pancakeswapWorker.health(1)).to.be.eq(ethers.utils.parseEther("1.998307255271658491"));

      // Eve comes and trigger reinvest
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
      await pancakeswapWorkerAsEve.reinvest();
      AssertHelpers.assertAlmostEqual(
        CAKE_REWARD_PER_BLOCK.mul("2").mul(REINVEST_BOUNTY_BPS).div("10000").toString(),
        (await cake.balanceOf(await eve.getAddress())).toString()
      );

      await vault.deposit(0); // Random action to trigger interest computation
      const healthDebt = await vault.positionInfo("1");
      expect(healthDebt[0]).to.be.above(ethers.utils.parseEther("2"));
      const interest = ethers.utils.parseEther("0.3"); //30% interest rate
      AssertHelpers.assertAlmostEqual(healthDebt[1].toString(), interest.add(loan).toString());
      AssertHelpers.assertAlmostEqual(
        (await baseToken.balanceOf(vault.address)).toString(),
        deposit.sub(loan).toString()
      );
      AssertHelpers.assertAlmostEqual((await vault.vaultDebtVal()).toString(), interest.add(loan).toString());

      const reservePool = interest.mul(RESERVE_POOL_BPS).div("10000");
      AssertHelpers.assertAlmostEqual(reservePool.toString(), (await vault.reservePool()).toString());
      AssertHelpers.assertAlmostEqual(
        deposit.add(interest).sub(reservePool).toString(),
        (await vault.totalToken()).toString()
      );
    });

    it("should has correct interest rate growth", async () => {
      // Deployer deposits 3 BTOKEN to the bank
      const deposit = ethers.utils.parseEther("3");
      await baseToken.approve(vault.address, deposit);
      await vault.deposit(deposit);

      // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
      const loan = ethers.utils.parseEther("1");
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
      await vaultAsAlice.work(
        0,
        pancakeswapWorker.address,
        ethers.utils.parseEther("1"),
        loan,
        "0",
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

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
      await pancakeswapWorkerAsEve.reinvest();
      await vault.deposit(0); // Random action to trigger interest computation

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

      await vault.deposit(0); // Random action to trigger interest computation
      const interest = ethers.utils.parseEther("0.3"); //30% interest rate
      const reservePool = interest.mul(RESERVE_POOL_BPS).div("10000");
      AssertHelpers.assertAlmostEqual(
        deposit
          .add(interest.sub(reservePool))
          .add(interest.sub(reservePool).mul(13).div(10))
          .add(interest.sub(reservePool).mul(13).div(10))
          .toString(),
        (await vault.totalToken()).toString()
      );
    });

    it("should be able to liquidate bad position", async () => {
      // Deployer deposits 3 BTOKEN to the bank
      const deposit = ethers.utils.parseEther("3");
      await baseToken.approve(vault.address, deposit);
      await vault.deposit(deposit);

      // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
      const loan = ethers.utils.parseEther("1");
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
      await vaultAsAlice.work(
        0,
        pancakeswapWorker.address,
        ethers.utils.parseEther("1"),
        loan,
        "0",
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

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
      await pancakeswapWorkerAsEve.reinvest();
      await vault.deposit(0); // Random action to trigger interest computation

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

      await vault.deposit(0); // Random action to trigger interest computation
      const interest = ethers.utils.parseEther("0.3"); //30% interest rate
      const reservePool = interest.mul(RESERVE_POOL_BPS).div("10000");
      AssertHelpers.assertAlmostEqual(
        deposit
          .add(interest.sub(reservePool))
          .add(interest.sub(reservePool).mul(13).div(10))
          .add(interest.sub(reservePool).mul(13).div(10))
          .toString(),
        (await vault.totalToken()).toString()
      );

      // Calculate the expected result.
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
      const toBeLiquidatedValue = await pancakeswapWorker.health(1);
      const liquidationBounty = toBeLiquidatedValue.mul(KILL_PRIZE_BPS).div(10000);
      const treasuryKillFees = toBeLiquidatedValue.mul(KILL_TREASURY_BPS).div(10000);
      const totalLiquidationFees = liquidationBounty.add(treasuryKillFees);
      const eveBalanceBefore = await baseToken.balanceOf(await eve.getAddress());
      const aliceAlpacaBefore = await alpacaToken.balanceOf(await alice.getAddress());
      const aliceBalanceBefore = await baseToken.balanceOf(await alice.getAddress());
      const vaultBalanceBefore = await baseToken.balanceOf(vault.address);
      const deployerBalanceBefore = await baseToken.balanceOf(await deployer.getAddress());
      const vaultDebtVal = await vault.vaultDebtVal();
      const debt = await vault.debtShareToVal((await vault.positions(1)).debtShare);
      const left = debt.gte(toBeLiquidatedValue.sub(totalLiquidationFees))
        ? ethers.constants.Zero
        : toBeLiquidatedValue.sub(totalLiquidationFees).sub(debt);

      // Now eve kill the position
      await expect(vaultAsEve.kill("1")).to.emit(vaultAsEve, "Kill");

      // Getting balances after killed
      const eveBalanceAfter = await baseToken.balanceOf(await eve.getAddress());
      const aliceBalanceAfter = await baseToken.balanceOf(await alice.getAddress());
      const vaultBalanceAfter = await baseToken.balanceOf(vault.address);
      const deployerBalanceAfter = await baseToken.balanceOf(await deployer.getAddress());

      AssertHelpers.assertAlmostEqual(
        deposit.add(interest).add(interest.mul(13).div(10)).add(interest.mul(13).div(10)).toString(),
        (await baseToken.balanceOf(vault.address)).toString()
      );
      expect(await vault.vaultDebtVal()).to.be.eq(ethers.utils.parseEther("0"));
      AssertHelpers.assertAlmostEqual(
        reservePool.add(reservePool.mul(13).div(10)).add(reservePool.mul(13).div(10)).toString(),
        (await vault.reservePool()).toString()
      );
      AssertHelpers.assertAlmostEqual(
        deposit
          .add(interest.sub(reservePool))
          .add(interest.sub(reservePool).mul(13).div(10))
          .add(interest.sub(reservePool).mul(13).div(10))
          .toString(),
        (await vault.totalToken()).toString()
      );
      expect(eveBalanceAfter.sub(eveBalanceBefore), "expect Eve to get her liquidation bounty").to.be.eq(
        liquidationBounty
      );
      expect(
        deployerBalanceAfter.sub(deployerBalanceBefore),
        "expect Deployer to get treasury liquidation fees"
      ).to.be.eq(treasuryKillFees);
      expect(aliceBalanceAfter.sub(aliceBalanceBefore), "expect Alice to get her leftover back").to.be.eq(left);
      expect(vaultBalanceAfter.sub(vaultBalanceBefore), "expect Vault to get its funds + interest").to.be.eq(
        vaultDebtVal
      );
      expect((await vault.positions(1)).debtShare, "expect Pos#1 debt share to be 0").to.be.eq(0);
      expect(
        await alpacaToken.balanceOf(await alice.getAddress()),
        "expect Alice to get some ALPACA from holding LYF position"
      ).to.be.gt(aliceAlpacaBefore);

      // Alice creates a new position again
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
      await vaultAsAlice.work(
        0,
        pancakeswapWorker.address,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1"),
        "0",
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

      // She can close position
      await vaultAsAlice.work(
        2,
        pancakeswapWorker.address,
        "0",
        "0",
        "115792089237316195423570985008687907853269984665640564039457584007913129639935",
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
      );
    }).timeout(50000);

    it("should be not allow user to emergencyWithdraw debtToken on FairLaunch", async () => {
      // Deployer deposits 3 BTOKEN to the bank
      const deposit = ethers.utils.parseEther("3");
      await baseToken.approve(vault.address, deposit);
      await vault.deposit(deposit);

      // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
      const loan = ethers.utils.parseEther("1");
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
      await vaultAsAlice.work(
        0,
        pancakeswapWorker.address,
        ethers.utils.parseEther("1"),
        loan,
        "0",
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

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
      await pancakeswapWorkerAsEve.reinvest();
      await vault.deposit(0); // Random action to trigger interest computation

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

      await vault.deposit(0); // Random action to trigger interest computation
      const interest = ethers.utils.parseEther("0.3"); //30% interest rate
      const reservePool = interest.mul(RESERVE_POOL_BPS).div("10000");
      AssertHelpers.assertAlmostEqual(
        deposit
          .add(interest.sub(reservePool))
          .add(interest.sub(reservePool).mul(13).div(10))
          .add(interest.sub(reservePool).mul(13).div(10))
          .toString(),
        (await vault.totalToken()).toString()
      );

      // Alice emergencyWithdraw from FairLaunch
      await expect(fairLaunchAsAlice.emergencyWithdraw(0)).to.be.revertedWith("only funder");

      const eveBefore = await baseToken.balanceOf(await eve.getAddress());

      // Now you can liquidate because of the insane interest rate
      await expect(vaultAsEve.kill("1")).to.emit(vaultAsEve, "Kill");

      expect(await baseToken.balanceOf(await eve.getAddress())).to.be.gt(eveBefore);
      AssertHelpers.assertAlmostEqual(
        deposit.add(interest).add(interest.mul(13).div(10)).add(interest.mul(13).div(10)).toString(),
        (await baseToken.balanceOf(vault.address)).toString()
      );
      expect(await vault.vaultDebtVal()).to.be.eq(ethers.utils.parseEther("0"));
      AssertHelpers.assertAlmostEqual(
        reservePool.add(reservePool.mul(13).div(10)).add(reservePool.mul(13).div(10)).toString(),
        (await vault.reservePool()).toString()
      );
      AssertHelpers.assertAlmostEqual(
        deposit
          .add(interest.sub(reservePool))
          .add(interest.sub(reservePool).mul(13).div(10))
          .add(interest.sub(reservePool).mul(13).div(10))
          .toString(),
        (await vault.totalToken()).toString()
      );

      // Alice creates a new position again
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
      await vaultAsAlice.work(
        0,
        pancakeswapWorker.address,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1"),
        "0",
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

      // She can close position
      await vaultAsAlice.work(
        2,
        pancakeswapWorker.address,
        "0",
        "0",
        "115792089237316195423570985008687907853269984665640564039457584007913129639935",
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
      );
    }).timeout(50000);

    it("should deposit and withdraw BTOKEN from Vault (bad debt case)", async () => {
      // Deployer deposits 10 BTOKEN to the Vault
      const deposit = ethers.utils.parseEther("10");
      await baseToken.approve(vault.address, deposit);
      await vault.deposit(deposit);

      expect(await vault.balanceOf(await deployer.getAddress())).to.be.equal(deposit);

      // Bob borrows 2 BTOKEN loan
      const loan = ethers.utils.parseEther("2");
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("1"));
      await vaultAsBob.work(
        0,
        pancakeswapWorker.address,
        ethers.utils.parseEther("1"),
        loan,
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

      expect(await baseToken.balanceOf(vault.address)).to.be.equal(deposit.sub(loan));
      expect(await vault.vaultDebtVal()).to.be.equal(loan);
      expect(await vault.totalToken()).to.be.equal(deposit);

      // Alice deposits 2 BTOKEN
      const aliceDeposit = ethers.utils.parseEther("2");
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("2"));
      await vaultAsAlice.deposit(aliceDeposit);

      AssertHelpers.assertAlmostEqual(
        deposit.sub(loan).add(aliceDeposit).toString(),
        (await baseToken.balanceOf(vault.address)).toString()
      );

      // check Alice ibBTOKEN balance = 2/10 * 10 = 2 ibBTOKEN
      AssertHelpers.assertAlmostEqual(
        aliceDeposit.toString(),
        (await vault.balanceOf(await alice.getAddress())).toString()
      );
      AssertHelpers.assertAlmostEqual(deposit.add(aliceDeposit).toString(), (await vault.totalSupply()).toString());

      // Simulate BTOKEN price is very high by swap FTOKEN to BTOKEN (reduce BTOKEN supply)
      await farmToken.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));
      await farmToken.approve(router.address, ethers.utils.parseEther("100"));
      await router.swapExactTokensForTokens(
        ethers.utils.parseEther("100"),
        "0",
        [farmToken.address, baseToken.address],
        await deployer.getAddress(),
        FOREVER
      );

      // Alice liquidates Bob position#1
      let aliceBefore = await baseToken.balanceOf(await alice.getAddress());
      let deployerBefore = await baseToken.balanceOf(await deployer.getAddress());

      await expect(vaultAsAlice.kill("1")).to.emit(vaultAsAlice, "Kill");

      let aliceAfter = await baseToken.balanceOf(await alice.getAddress());
      let deployerAfter = await baseToken.balanceOf(await deployer.getAddress());

      // Bank balance is increase by liquidation
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther("10.002702699312215556").toString(),
        (await baseToken.balanceOf(vault.address)).toString()
      );
      // Alice is liquidator, Alice should receive 10% Kill prize
      // BTOKEN back from liquidation 0.00300099799424023, 10% of 0.00300099799424023 is 0.000300099799424023
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther("0.000300099799424023").toString(),
        aliceAfter.sub(aliceBefore).toString()
      );

      // Deployer is Wallet to buyback -> 1%  -> 0.000030009979942402
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther("0.000030009979942402").toString(),
        deployerAfter.sub(deployerBefore).toString()
      );

      // Alice withdraws 2 BOKTEN
      aliceBefore = await baseToken.balanceOf(await alice.getAddress());
      await vaultAsAlice.withdraw(await vault.balanceOf(await alice.getAddress()));
      aliceAfter = await baseToken.balanceOf(await alice.getAddress());

      // alice gots 2/12 * 10.002702699312215556 = 1.667117116552036
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther("1.667117116552036").toString(),
        aliceAfter.sub(aliceBefore).toString()
      );
    });

    it("should liquidate user position correctly", async () => {
      // Bob deposits 20 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("20"));
      await vaultAsBob.deposit(ethers.utils.parseEther("20"));

      // Position#1: Alice borrows 10 BTOKEN loan
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("10"));
      await vaultAsAlice.work(
        0,
        pancakeswapWorker.address,
        ethers.utils.parseEther("10"),
        ethers.utils.parseEther("10"),
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

      await farmToken.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));
      await farmToken.approve(router.address, ethers.utils.parseEther("100"));

      // Price swing 10%
      // Add more token to the pool equals to sqrt(10*((0.1)**2) / 9) - 0.1 = 0.005409255338945984, (0.1 is the balance of token in the pool)
      await router.swapExactTokensForTokens(
        ethers.utils.parseEther("0.005409255338945984"),
        "0",
        [farmToken.address, baseToken.address],
        await deployer.getAddress(),
        FOREVER
      );
      await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");

      // Price swing 20%
      // Add more token to the pool equals to
      // sqrt(10*((0.10540925533894599)**2) / 8) - 0.10540925533894599 = 0.012441874858811944
      // (0.10540925533894599 is the balance of token in the pool)
      await router.swapExactTokensForTokens(
        ethers.utils.parseEther("0.012441874858811944"),
        "0",
        [farmToken.address, baseToken.address],
        await deployer.getAddress(),
        FOREVER
      );
      await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");

      // Price swing 23.43%
      // Existing token on the pool = 0.10540925533894599 + 0.012441874858811944 = 0.11785113019775793
      // Add more token to the pool equals to
      // sqrt(10*((0.11785113019775793)**2) / 7.656999999999999) - 0.11785113019775793 = 0.016829279312591913
      await router.swapExactTokensForTokens(
        ethers.utils.parseEther("0.016829279312591913"),
        "0",
        [farmToken.address, baseToken.address],
        await deployer.getAddress(),
        FOREVER
      );
      await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");

      // Price swing 30%
      // Existing token on the pool = 0.11785113019775793 + 0.016829279312591913 = 0.13468040951034985
      // Add more token to the pool equals to
      // sqrt(10*((0.13468040951034985)**2) / 7) - 0.13468040951034985 = 0.026293469053292218
      await router.swapExactTokensForTokens(
        ethers.utils.parseEther("0.026293469053292218"),
        "0",
        [farmToken.address, baseToken.address],
        await deployer.getAddress(),
        FOREVER
      );

      // Now you can liquidate because of the price fluctuation
      const eveBefore = await baseToken.balanceOf(await eve.getAddress());
      await expect(vaultAsEve.kill("1")).to.emit(vaultAsEve, "Kill");

      expect(await baseToken.balanceOf(await eve.getAddress())).to.be.gt(eveBefore);
    });

    it("should reinvest correctly", async () => {
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
        await deployer.getAddress()
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
      let [bobHealth, bobDebtToShare] = await vault.positionInfo("1");
      expect(bobHealth).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bobDebtToShare.toString());

      // Check Alice position info
      await pancakeswapWorker.health("2");
      let [aliceHealth, aliceDebtToShare] = await vault.positionInfo("2");
      expect(aliceHealth).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), aliceDebtToShare.toString());

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
      [bobHealth, bobDebtToShare] = await vault.positionInfo("1");
      expect(bobHealth).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bobDebtToShare.toString());

      // Check Alice position info
      [aliceHealth, aliceDebtToShare] = await vault.positionInfo("2");
      expect(aliceHealth).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), aliceDebtToShare.toString());

      // ---------------- Reinvest#3 -------------------
      // Wait for 1 day and someone calls reinvest
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

      [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
      await pancakeswapWorkerAsEve.reinvest();

      // eve should earn cake as a reward for reinvest
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther("0.006079999999979926").toString(),
        (await cake.balanceOf(await eve.getAddress())).toString()
      );

      // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
      // Convert 128572916666654734 uni to 74159218067697746 NATIVE
      // Convert NATIVE to 2350053120029788 LP token
      [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
      // LP tokens of worker should be inceased from reinvestment
      expect(workerLPAfter).to.be.gt(workerLPBefore);

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
            liqStrat.address,
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
            addStrat.address,
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
            liqStrat.address,
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
    }).timeout(50000);

    it("should liquidate user position correctly", async () => {
      // Bob deposits 20 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("20"));
      await vaultAsBob.deposit(ethers.utils.parseEther("20"));

      // Position#1: Alice borrows 10 BTOKEN loan
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("10"));
      await vaultAsAlice.work(
        0,
        pancakeswapWorker.address,
        ethers.utils.parseEther("10"),
        ethers.utils.parseEther("10"),
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

      await farmToken.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));
      await farmToken.approve(router.address, ethers.utils.parseEther("100"));

      // Price swing 10%
      // Add more token to the pool equals to sqrt(10*((0.1)**2) / 9) - 0.1 = 0.005409255338945984, (0.1 is the balance of token in the pool)
      await router.swapExactTokensForTokens(
        ethers.utils.parseEther("0.005409255338945984"),
        "0",
        [farmToken.address, baseToken.address],
        await deployer.getAddress(),
        FOREVER
      );
      await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");

      // Price swing 20%
      // Add more token to the pool equals to
      // sqrt(10*((0.10540925533894599)**2) / 8) - 0.10540925533894599 = 0.012441874858811944
      // (0.10540925533894599 is the balance of token in the pool)
      await router.swapExactTokensForTokens(
        ethers.utils.parseEther("0.012441874858811944"),
        "0",
        [farmToken.address, baseToken.address],
        await deployer.getAddress(),
        FOREVER
      );
      await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");

      // Price swing 23.43%
      // Existing token on the pool = 0.10540925533894599 + 0.012441874858811944 = 0.11785113019775793
      // Add more token to the pool equals to
      // sqrt(10*((0.11785113019775793)**2) / 7.656999999999999) - 0.11785113019775793 = 0.016829279312591913
      await router.swapExactTokensForTokens(
        ethers.utils.parseEther("0.016829279312591913"),
        "0",
        [farmToken.address, baseToken.address],
        await deployer.getAddress(),
        FOREVER
      );
      await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");

      // Price swing 30%
      // Existing token on the pool = 0.11785113019775793 + 0.016829279312591913 = 0.13468040951034985
      // Add more token to the pool equals to
      // sqrt(10*((0.13468040951034985)**2) / 7) - 0.13468040951034985 = 0.026293469053292218
      await router.swapExactTokensForTokens(
        ethers.utils.parseEther("0.026293469053292218"),
        "0",
        [farmToken.address, baseToken.address],
        await deployer.getAddress(),
        FOREVER
      );

      // Now you can liquidate because of the price fluctuation
      const eveBefore = await baseToken.balanceOf(await eve.getAddress());
      await expect(vaultAsEve.kill("1")).to.emit(vaultAsEve, "Kill");
      expect(await baseToken.balanceOf(await eve.getAddress())).to.be.gt(eveBefore);
    });

    it("should close position correctly when user holds multiple positions", async () => {
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
        await deployer.getAddress()
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

      // Position#2: Bob borrows another 2 BTOKEN loan
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("1"));
      await vaultAsBob.work(
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

      // Check Position#1 info
      await pancakeswapWorker.health("1");
      let [bob1Health, bob1DebtToShare] = await vault.positionInfo("1");
      expect(bob1Health).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bob1DebtToShare.toString());

      // Check Position#2 info
      await pancakeswapWorker.health("2");
      let [bob2Health, bob2DebtToShare] = await vault.positionInfo("2");
      expect(bob2Health).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), bob2DebtToShare.toString());

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

      // Check Position#1 position info
      [bob1Health, bob1DebtToShare] = await vault.positionInfo("1");
      expect(bob1Health).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bob1DebtToShare.toString());

      // Check Position#2 position info
      [bob2Health, bob2DebtToShare] = await vault.positionInfo("2");
      expect(bob2Health).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), bob2DebtToShare.toString());

      let bobBefore = await baseToken.balanceOf(await bob.getAddress());
      let bobAlpacaBefore = await alpacaToken.balanceOf(await bob.getAddress());
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
            liqStrat.address,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "address", "uint256"],
              [baseToken.address, farmToken.address, "0"]
            ),
          ]
        )
      );
      let bobAfter = await baseToken.balanceOf(await bob.getAddress());
      let bobAlpacaAfter = await alpacaToken.balanceOf(await bob.getAddress());

      // Check Bob account, Bob must be richer as he earn more from yield
      expect(bobAlpacaAfter).to.be.gt(bobAlpacaBefore);
      expect(bobAfter).to.be.gt(bobBefore);

      // Bob add another 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
      await vaultAsBob.work(
        2,
        pancakeswapWorker.address,
        ethers.utils.parseEther("10"),
        0,
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

      bobBefore = await baseToken.balanceOf(await bob.getAddress());
      bobAlpacaBefore = await alpacaToken.balanceOf(await bob.getAddress());
      // Bob close position#2
      await vaultAsBob.work(
        2,
        pancakeswapWorker.address,
        "0",
        "0",
        "1000000000000000000000000000000",
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
      );
      bobAfter = await baseToken.balanceOf(await bob.getAddress());
      bobAlpacaAfter = await alpacaToken.balanceOf(await bob.getAddress());

      // Check Bob account, Bob must be richer as she earned from leverage yield farm without getting liquidated
      expect(bobAfter).to.be.gt(bobBefore);
      expect(bobAlpacaAfter).to.be.gt(bobAlpacaBefore);
    }).timeout(50000);

    it("should close position correctly when user holds mix positions of leveraged and non-leveraged", async () => {
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
        await deployer.getAddress()
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

      // Position#2: Bob open position without leverage
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("3"));
      await vaultAsBob.work(
        0,
        pancakeswapWorker.address,
        ethers.utils.parseEther("3"),
        "0",
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

      // Check Position#1 info
      await pancakeswapWorker.health("1");
      let [bob1Health, bob1DebtToShare] = await vault.positionInfo("1");
      expect(bob1Health).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bob1DebtToShare.toString());

      // Check Position#2 info
      await pancakeswapWorker.health("2");
      let [bob2Health, bob2DebtToShare] = await vault.positionInfo("2");
      expect(bob2Health).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("0").toString(), bob2DebtToShare.toString());

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

      // Check Position#1 position info
      [bob1Health, bob1DebtToShare] = await vault.positionInfo("1");
      expect(bob1Health).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bob1DebtToShare.toString());

      // Check Position#2 position info
      [bob2Health, bob2DebtToShare] = await vault.positionInfo("2");
      expect(bob2Health).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("0").toString(), bob2DebtToShare.toString());

      let bobBefore = await baseToken.balanceOf(await bob.getAddress());
      let bobAlpacaBefore = await alpacaToken.balanceOf(await bob.getAddress());
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
            liqStrat.address,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "address", "uint256"],
              [baseToken.address, farmToken.address, "0"]
            ),
          ]
        )
      );
      let bobAfter = await baseToken.balanceOf(await bob.getAddress());
      let bobAlpacaAfter = await alpacaToken.balanceOf(await bob.getAddress());

      // Check Bob account, Bob must be richer as he earn more from yield
      expect(bobAlpacaAfter).to.be.gt(bobAlpacaBefore);
      expect(bobAfter).to.be.gt(bobBefore);

      // Bob add another 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
      await vaultAsBob.work(
        2,
        pancakeswapWorker.address,
        ethers.utils.parseEther("10"),
        0,
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

      bobBefore = await baseToken.balanceOf(await bob.getAddress());
      bobAlpacaBefore = await alpacaToken.balanceOf(await bob.getAddress());
      // Bob close position#2
      await vaultAsBob.work(
        2,
        pancakeswapWorker.address,
        "0",
        "0",
        "1000000000000000000000000000000",
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
      );
      bobAfter = await baseToken.balanceOf(await bob.getAddress());
      bobAlpacaAfter = await alpacaToken.balanceOf(await bob.getAddress());

      // Check Bob account, Bob must be richer as she earned from leverage yield farm without getting liquidated
      // But bob shouldn't earn more ALPACAs from closing position#2
      expect(bobAfter).to.be.gt(bobBefore);
      expect(bobAlpacaAfter).to.be.eq(bobAlpacaBefore);
    }).timeout(50000);

    it("should partially close position successfully, when maxReturn < liquidated amount, payback part of the debt", async () => {
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
        await deployer.getAddress()
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
      let [bobHealth, bobDebtToShare] = await vault.positionInfo("1");
      expect(bobHealth).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bobDebtToShare.toString());

      // Check Alice position info
      await pancakeswapWorker.health("2");
      let [aliceHealth, aliceDebtToShare] = await vault.positionInfo("2");
      expect(aliceHealth).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), aliceDebtToShare.toString());

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
      // Convert 128572916666654734 CAKE to 157462478899282341 BTOKEN
      // Convert BTOKEN to 5001669421841640 LP token
      [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
      // LP tokens of worker should be inceased from reinvestment
      expect(workerLPAfter).to.be.gt(workerLPBefore);

      // Check Bob position info
      [bobHealth, bobDebtToShare] = await vault.positionInfo("1");
      expect(bobHealth).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bobDebtToShare.toString());

      // Check Alice position info
      [aliceHealth, aliceDebtToShare] = await vault.positionInfo("2");
      expect(aliceHealth).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), aliceDebtToShare.toString());

      // Bob think he made enough. He now wants to close position partially.
      const bobBefore = await baseToken.balanceOf(await bob.getAddress());
      const [bobHealthBefore] = await vault.positionInfo("1");
      const lpUnderBobPosition = await pancakeswapWorker.shareToBalance(await pancakeswapWorker.shares(1));
      [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
      // Bob close his position 50%
      await vaultAsBob.work(
        1,
        pancakeswapWorker.address,
        "0",
        "0",
        ethers.utils.parseEther("5"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [
            partialCloseStrat.address,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "address", "uint256", "uint256"],
              [baseToken.address, farmToken.address, lpUnderBobPosition.div(2), "0"]
            ),
          ]
        )
      );
      const bobAfter = await baseToken.balanceOf(await bob.getAddress());

      // After Bob liquidate half of his position which worth
      // 14.62878631929428108 BTOKEN (price impact+trading fee included)
      // Bob returns 5 BTOKEN to payback the debt hence; He should be
      // 14.62878631929428108 - 5 = 9.62878631929 BTOKEN richer
      AssertHelpers.assertAlmostEqual(
        bobAfter.toString(),
        bobBefore.add(ethers.utils.parseEther("9.62878631929")).toString()
      );
      // Check Bob position info
      [bobHealth, bobDebtToShare] = await vault.positionInfo("1");
      // Bob's health after partial close position must be 50% less than before
      // due to he exit half of lp under his position
      expect(bobHealth).to.be.lt(bobHealthBefore.div(2));
      // Bob's debt should be left only 5 BTOKEN due he said he wants to return at max 5 BTOKEN
      expect(bobDebtToShare).to.be.eq(ethers.utils.parseEther("5"));
      // Check LP deposited by Worker on MasterChef
      [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
      // LP tokens of worker should be decreased by lpUnderBobPosition/2
      // due to Bob execute StrategyClosePartialLiquidate
      expect(workerLPAfter).to.be.eq(workerLPBefore.sub(lpUnderBobPosition.div(2)));
    }).timeout(50000);

    it("should partially close position successfully, when maxReturn > liquidated amount and liquidated amount > debt", async () => {
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
        await deployer.getAddress()
      );

      // Bob deposits 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
      await vaultAsBob.deposit(ethers.utils.parseEther("10"));

      // Position#1: Bob borrows 10 BTOKEN loan
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
      await vaultAsBob.work(
        0,
        pancakeswapWorker.address,
        ethers.utils.parseEther("10"),
        ethers.utils.parseEther("10"),
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

      // Bob think he made enough. He now wants to close position partially.
      // He close 50% of his position and return all debt
      const bobBefore = await baseToken.balanceOf(await bob.getAddress());
      const [bobHealthBefore] = await vault.positionInfo("1");
      const lpUnderBobPosition = await pancakeswapWorker.shareToBalance(await pancakeswapWorker.shares(1));
      const [workerLPBefore] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
      // Bob closes position with maxReturn 5,000,000,000 and liquidate half of his position
      // Expect that Bob will close position successfully and his debt must be reduce as liquidated amount pay debt
      await vaultAsBob.work(
        1,
        pancakeswapWorker.address,
        "0",
        "0",
        ethers.utils.parseEther("5000000000"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [
            partialCloseStrat.address,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "address", "uint256", "uint256"],
              [baseToken.address, farmToken.address, lpUnderBobPosition.div(2), "0"]
            ),
          ]
        )
      );
      const bobAfter = await baseToken.balanceOf(await bob.getAddress());

      // After Bob liquidate half of his position which worth
      // 13.200430549066301204 BTOKEN (price impact+trading fee included)
      // Bob wish to return 5,000,000,000 BTOKEN (when maxReturn > debt, return all debt)
      // The following criteria must be stratified:
      // - Bob should get 13.200430549066301204 - 10 = 3.200430549066301204 BTOKEN back.
      // - Bob's position debt must be 0
      expect(
        bobBefore.add(ethers.utils.parseEther("3.200430549066301204")),
        "Expect BTOKEN in Bob's account after close position to increase by ~3.2 BTOKEN"
      ).to.be.eq(bobAfter);
      // Check Bob position info
      const [bobHealth, bobDebtVal] = await vault.positionInfo("1");
      // Bob's health after partial close position must be 50% less than before
      // due to he exit half of lp under his position
      expect(bobHealth).to.be.lt(bobHealthBefore.div(2));
      // Bob's debt should be 0 BTOKEN due he said he wants to return at max 5,000,000,000 BTOKEN (> debt, return all debt)
      expect(bobDebtVal).to.be.eq("0");
      // Check LP deposited by Worker on MasterChef
      const [workerLPAfter] = await masterChef.userInfo(poolId, pancakeswapWorker.address);
      // LP tokens of worker should be decreased by lpUnderBobPosition/2
      // due to Bob execute StrategyClosePartialLiquidate
      expect(workerLPAfter).to.be.eq(workerLPBefore.sub(lpUnderBobPosition.div(2)));
    }).timeout(50000);

    it("should revert when partial close position made leverage higher than work factor", async () => {
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
        await deployer.getAddress()
      );

      // Bob deposits 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
      await vaultAsBob.deposit(ethers.utils.parseEther("10"));

      // Position#1: Bob borrows 10 BTOKEN loan
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
      await vaultAsBob.work(
        0,
        pancakeswapWorker.address,
        ethers.utils.parseEther("10"),
        ethers.utils.parseEther("10"),
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

      // Bob think he made enough. He now wants to close position partially.
      // He liquidate all of his position but not payback the debt.
      const lpUnderBobPosition = await pancakeswapWorker.shareToBalance(await pancakeswapWorker.shares(1));
      // Bob closes position with maxReturn 5,000,000,000 and liquidate half of his position
      // Expect that Bob will not be able to close his position as he liquidate all underlying assets but not paydebt
      // which made his position debt ratio higher than allow work factor
      await expect(
        vaultAsBob.work(
          1,
          pancakeswapWorker.address,
          "0",
          "0",
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              partialCloseStrat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256", "uint256"],
                [baseToken.address, farmToken.address, lpUnderBobPosition, "0"]
              ),
            ]
          )
        )
      ).revertedWith("bad work factor");
    }).timeout(50000);

    it("should not allow to partially close position, when returnLpAmount > LpUnderPosition", async () => {
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
        await deployer.getAddress()
      );

      // Bob deposits 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
      await vaultAsBob.deposit(ethers.utils.parseEther("10"));

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

      // Bob think he made enough. He now wants to close position partially. However, his input is invalid.
      // He put returnLpAmount > Lp that is under his position
      const lpUnderBobPosition = await pancakeswapWorker.shareToBalance(await pancakeswapWorker.shares(1));
      // Transaction should be revert due to Bob is asking contract to liquidate Lp amount > Lp that is under his position
      await expect(
        vaultAsBob.work(
          1,
          pancakeswapWorker.address,
          "0",
          "0",
          ethers.utils.parseEther("10"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              partialCloseStrat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "address", "uint256", "uint256"],
                [baseToken.address, farmToken.address, lpUnderBobPosition.mul(2), "0"]
              ),
            ]
          )
        )
      ).to.be.revertedWith("StrategyPartialCloseLiquidate::execute:: insufficient LP amount recevied from worker");
    }).timeout(50000);
  });
});
