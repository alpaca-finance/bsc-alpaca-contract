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
  MockContractContext,
  MockContractContext__factory,
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
  PancakeRouterV2,
  PancakeRouterV2__factory,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedStrategyLiquidate,
  PancakeswapV2RestrictedStrategyLiquidate__factory,
  PancakeswapV2RestrictedStrategyPartialCloseLiquidate,
  PancakeswapV2RestrictedStrategyPartialCloseLiquidate__factory,
  PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading,
  PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading__factory,
  PancakeswapV2Worker,
  PancakeswapV2Worker__factory,
  SimpleVaultConfig,
  SimpleVaultConfig__factory,
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

describe("Vault - PancakeswapV2", () => {
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
  let liqStrat: PancakeswapV2RestrictedStrategyLiquidate;
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
  let poolId: number;
  let pancakeswapV2Worker: PancakeswapV2Worker;

  /// Timelock instance(s)
  let whitelistedContract: MockContractContext;
  let evilContract: MockContractContext;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let eve: Signer;

  let deployerAddress: string;
  let aliceAddress: string;
  let bobAddress: string;
  let eveAddress: string;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let fairLaunchAsAlice: FairLaunch;

  let lpAsAlice: PancakePair;
  let lpAsBob: PancakePair;

  let pancakeMasterChefAsAlice: PancakeMasterChef;
  let pancakeMasterChefAsBob: PancakeMasterChef;

  let pancakeswapV2WorkerAsEve: PancakeswapV2Worker;

  let vaultAsAlice: Vault;
  let vaultAsBob: Vault;
  let vaultAsEve: Vault;

  async function fixture() {
    [deployer, alice, bob, eve] = await ethers.getSigners();
    [deployerAddress, aliceAddress, bobAddress, eveAddress] = await Promise.all([
      deployer.getAddress(),
      alice.getAddress(),
      bob.getAddress(),
      eve.getAddress(),
    ]);

    // Setup Timelock
    const MockContractContext = (await ethers.getContractFactory(
      "MockContractContext",
      deployer
    )) as MockContractContext__factory;
    whitelistedContract = await MockContractContext.deploy();
    await whitelistedContract.deployed();
    evilContract = await MockContractContext.deploy();
    await evilContract.deployed();

    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
    factoryV2 = await PancakeFactory.deploy(deployerAddress);
    await factoryV2.deployed();

    const WBNB = (await ethers.getContractFactory("MockWBNB", deployer)) as MockWBNB__factory;
    wbnb = await WBNB.deploy();
    await wbnb.deployed();

    const PancakeRouterV2 = (await ethers.getContractFactory("PancakeRouterV2", deployer)) as PancakeRouterV2__factory;
    routerV2 = await PancakeRouterV2.deploy(factoryV2.address, wbnb.address);
    await routerV2.deployed();

    // Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    baseToken = (await upgrades.deployProxy(MockERC20, ["BTOKEN", "BTOKEN", 18])) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(deployerAddress, ethers.utils.parseEther("1000"));
    await baseToken.mint(aliceAddress, ethers.utils.parseEther("1000"));
    await baseToken.mint(bobAddress, ethers.utils.parseEther("1000"));
    farmToken = (await upgrades.deployProxy(MockERC20, ["FTOKEN", "FTOKEN", 18])) as MockERC20;
    await farmToken.deployed();
    await farmToken.mint(deployerAddress, ethers.utils.parseEther("1000"));
    await farmToken.mint(aliceAddress, ethers.utils.parseEther("1000"));
    await farmToken.mint(bobAddress, ethers.utils.parseEther("1000"));

    const CakeToken = (await ethers.getContractFactory("CakeToken", deployer)) as CakeToken__factory;
    cake = await CakeToken.deploy();
    await cake.deployed();
    await cake["mint(address,uint256)"](deployerAddress, ethers.utils.parseEther("100"));

    const SyrupBar = (await ethers.getContractFactory("SyrupBar", deployer)) as SyrupBar__factory;
    syrup = await SyrupBar.deploy(cake.address);
    await syrup.deployed();

    /// Setup BTOKEN-FTOKEN pair on Pancakeswap
    await factoryV2.createPair(baseToken.address, farmToken.address);
    lp = PancakePair__factory.connect(await factoryV2.getPair(farmToken.address, baseToken.address), deployer);
    await lp.deployed();

    // Setup FairLaunch contract
    // Deploy ALPACAs
    const AlpacaToken = (await ethers.getContractFactory("AlpacaToken", deployer)) as AlpacaToken__factory;
    alpacaToken = await AlpacaToken.deploy(132, 137);
    await alpacaToken.deployed();
    const FairLaunch = (await ethers.getContractFactory("FairLaunch", deployer)) as FairLaunch__factory;
    fairLaunch = await FairLaunch.deploy(
      alpacaToken.address,
      deployerAddress,
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
      eveAddress,
    ])) as SimpleVaultConfig;
    await simpleVaultConfig.deployed();

    // whitelisted contract to be able to call work
    await simpleVaultConfig.setWhitelistedCallers([whitelistedContract.address], true);

    // whitelisted to be able to call kill
    await simpleVaultConfig.setWhitelistedLiquidators([await alice.getAddress(), await eve.getAddress()], true);

    const DebtToken = (await ethers.getContractFactory("DebtToken", deployer)) as DebtToken__factory;
    debtToken = (await upgrades.deployProxy(DebtToken, [
      "debtibBTOKEN_V2",
      "debtibBTOKEN_V2",
      18,
      deployerAddress,
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

    /// Setup strategy
    const PancakeswapV2RestrictedStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyAddBaseTokenOnly",
      deployer
    )) as PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory;
    addStrat = (await upgrades.deployProxy(PancakeswapV2RestrictedStrategyAddBaseTokenOnly, [
      routerV2.address,
    ])) as PancakeswapV2RestrictedStrategyAddBaseTokenOnly;
    await addStrat.deployed();

    const PancakeswapV2RestrictedStrategyLiquidate = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyLiquidate",
      deployer
    )) as PancakeswapV2RestrictedStrategyLiquidate__factory;
    liqStrat = (await upgrades.deployProxy(PancakeswapV2RestrictedStrategyLiquidate, [
      routerV2.address,
    ])) as PancakeswapV2RestrictedStrategyLiquidate;
    await liqStrat.deployed();

    const PancakeswapV2RestrictedStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyPartialCloseLiquidate",
      deployer
    )) as PancakeswapV2RestrictedStrategyPartialCloseLiquidate__factory;
    partialCloseStrat = (await upgrades.deployProxy(PancakeswapV2RestrictedStrategyPartialCloseLiquidate, [
      routerV2.address,
    ])) as PancakeswapV2RestrictedStrategyPartialCloseLiquidate;
    await partialCloseStrat.deployed();

    const PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading",
      deployer
    )) as PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading__factory;
    partialCloseMinimizeStrat = (await upgrades.deployProxy(
      PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading,
      [routerV2.address, wbnb.address, wNativeRelayer.address]
    )) as PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading;
    await partialCloseMinimizeStrat.deployed();

    /// Setup MasterChef
    const PancakeMasterChef = (await ethers.getContractFactory(
      "PancakeMasterChef",
      deployer
    )) as PancakeMasterChef__factory;
    masterChef = await PancakeMasterChef.deploy(cake.address, syrup.address, deployerAddress, CAKE_REWARD_PER_BLOCK, 0);
    await masterChef.deployed();
    // Transfer ownership so masterChef can mint CAKE
    await cake.transferOwnership(masterChef.address);
    await syrup.transferOwnership(masterChef.address);
    // Add lp to masterChef's pool
    await masterChef.add(1, lp.address, true);

    /// Setup PancakeswapV2Worker
    poolId = 1;
    const PancakeswapV2Worker = (await ethers.getContractFactory(
      "PancakeswapV2Worker",
      deployer
    )) as PancakeswapV2Worker__factory;
    pancakeswapV2Worker = (await upgrades.deployProxy(PancakeswapV2Worker, [
      vault.address,
      baseToken.address,
      masterChef.address,
      routerV2.address,
      poolId,
      addStrat.address,
      liqStrat.address,
      REINVEST_BOUNTY_BPS,
    ])) as PancakeswapV2Worker;
    await pancakeswapV2Worker.deployed();
    await simpleVaultConfig.setWorker(pancakeswapV2Worker.address, true, true, WORK_FACTOR, KILL_FACTOR, true, true);
    await pancakeswapV2Worker.setStrategyOk([partialCloseStrat.address], true);
    await pancakeswapV2Worker.setStrategyOk([partialCloseMinimizeStrat.address], true);
    await pancakeswapV2Worker.setReinvestorOk([eveAddress], true);
    await addStrat.setWorkersOk([pancakeswapV2Worker.address], true);
    await liqStrat.setWorkersOk([pancakeswapV2Worker.address], true);
    await partialCloseStrat.setWorkersOk([pancakeswapV2Worker.address], true);
    await partialCloseMinimizeStrat.setWorkersOk([pancakeswapV2Worker.address], true);

    // Deployer adds 0.1 FTOKEN + 1 BTOKEN
    await baseToken.approve(routerV2.address, ethers.utils.parseEther("1"));
    await farmToken.approve(routerV2.address, ethers.utils.parseEther("0.1"));
    await routerV2.addLiquidity(
      baseToken.address,
      farmToken.address,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("0.1"),
      "0",
      "0",
      deployerAddress,
      FOREVER
    );

    // Deployer adds 0.1 CAKE + 1 NATIVE
    await cake.approve(routerV2.address, ethers.utils.parseEther("1"));
    await routerV2.addLiquidityETH(cake.address, ethers.utils.parseEther("0.1"), "0", "0", deployerAddress, FOREVER, {
      value: ethers.utils.parseEther("1"),
    });

    // Deployer adds 1 BTOKEN + 1 NATIVE
    await baseToken.approve(routerV2.address, ethers.utils.parseEther("1"));
    await routerV2.addLiquidityETH(
      baseToken.address,
      ethers.utils.parseEther("1"),
      "0",
      "0",
      deployerAddress,
      FOREVER,
      { value: ethers.utils.parseEther("1") }
    );

    // Contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    lpAsAlice = PancakePair__factory.connect(lp.address, alice);
    lpAsBob = PancakePair__factory.connect(lp.address, bob);

    fairLaunchAsAlice = FairLaunch__factory.connect(fairLaunch.address, alice);

    pancakeMasterChefAsAlice = PancakeMasterChef__factory.connect(masterChef.address, alice);
    pancakeMasterChefAsBob = PancakeMasterChef__factory.connect(masterChef.address, bob);

    vaultAsAlice = Vault__factory.connect(vault.address, alice);
    vaultAsBob = Vault__factory.connect(vault.address, bob);
    vaultAsEve = Vault__factory.connect(vault.address, eve);

    pancakeswapV2WorkerAsEve = PancakeswapV2Worker__factory.connect(pancakeswapV2Worker.address, eve);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
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
      await pancakeMasterChefAsAlice.deposit(poolId, ethers.utils.parseEther("0.01"));
      await pancakeMasterChefAsBob.deposit(poolId, ethers.utils.parseEther("0.02")); // alice +1 Reward

      // Alice and Bob withdraw stake from the pool
      await pancakeMasterChefAsBob.withdraw(poolId, ethers.utils.parseEther("0.02")); // alice +1/3 Reward  Bob + 2/3 Reward
      await pancakeMasterChefAsAlice.withdraw(poolId, ethers.utils.parseEther("0.01")); // alice +1 Reward

      AssertHelpers.assertAlmostEqual(
        (await cake.balanceOf(aliceAddress)).toString(),
        CAKE_REWARD_PER_BLOCK.mul(ethers.BigNumber.from(7)).div(ethers.BigNumber.from(3)).toString()
      );
      AssertHelpers.assertAlmostEqual(
        (await cake.balanceOf(bobAddress)).toString(),
        CAKE_REWARD_PER_BLOCK.mul(2).div(3).toString()
      );
    });
  });

  context("when owner is setting worker", async () => {
    it("should set reinvest bounty if < max", async () => {
      await pancakeswapV2Worker.setReinvestBountyBps(250);
      expect(await pancakeswapV2Worker.reinvestBountyBps()).to.be.eq(250);
    });

    it("should set max reinvest bounty", async () => {
      pancakeswapV2Worker.setMaxReinvestBountyBps(200);
    });

    it("should revert when owner set reinvestBountyBps > max", async () => {
      await expect(pancakeswapV2Worker.setReinvestBountyBps(1000)).to.be.revertedWith(
        "PancakeswapWorker::setReinvestBountyBps:: _reinvestBountyBps exceeded maxReinvestBountyBps"
      );
      expect(await pancakeswapV2Worker.reinvestBountyBps()).to.be.eq(100);
    });

    it("should set strat ok", async () => {
      await pancakeswapV2Worker.setStrategyOk([aliceAddress], true);
      expect(await pancakeswapV2Worker.okStrats(aliceAddress)).to.be.eq(true);
    });
  });

  context("when user uses LYF", async () => {
    context("when user is contract", async () => {
      it("should revert if evil contract try to call onlyEOAorWhitelisted function", async () => {
        await expect(
          evilContract.executeTransaction(
            vault.address,
            0,
            "work(uint256,address,uint256,uint256,uint256,bytes)",
            ethers.utils.defaultAbiCoder.encode(
              ["uint256", "address", "uint256", "uint256", "uint256", "bytes"],
              [
                0,
                pancakeswapV2Worker.address,
                ethers.utils.parseEther("0.3"),
                "0",
                "0",
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                ),
              ]
            )
          )
        ).to.be.revertedWith("not eoa");
      });

      it("should allow whitelisted contract to open position without debt", async () => {
        // Deployer deposit 3 BTOKEN to the vault
        await baseToken.approve(vault.address, ethers.utils.parseEther("3"));
        await vault.deposit(ethers.utils.parseEther("3"));

        // Deployer funds whitelisted contract
        await baseToken.transfer(whitelistedContract.address, ethers.utils.parseEther("1"));

        // whitelisted contract approve Alpaca to to take BTOKEN
        await whitelistedContract.executeTransaction(
          baseToken.address,
          "0",
          "approve(address,uint256)",
          ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [vault.address, ethers.utils.parseEther("0.3")])
        );
        expect(await baseToken.allowance(whitelistedContract.address, vault.address)).to.be.eq(
          ethers.utils.parseEther("0.3")
        );

        // whitelisted contract should able to open position with 0 debt
        await whitelistedContract.executeTransaction(
          vault.address,
          0,
          "work(uint256,address,uint256,uint256,uint256,bytes)",
          ethers.utils.defaultAbiCoder.encode(
            ["uint256", "address", "uint256", "uint256", "uint256", "bytes"],
            [
              0,
              pancakeswapV2Worker.address,
              ethers.utils.parseEther("0.3"),
              "0",
              "0",
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
              ),
            ]
          )
        );

        const [worker, owner] = await vault.positions(1);
        expect(owner).to.be.eq(whitelistedContract.address);
        expect(worker).to.be.eq(pancakeswapV2Worker.address);
      });

      it("should revert if evil contract try to call onlyWhitelistedLiquidators function", async () => {
        await expect(
          evilContract.executeTransaction(
            vault.address,
            0,
            "kill(uint256)",
            ethers.utils.defaultAbiCoder.encode(["uint256"], [0])
          )
        ).to.be.revertedWith("!whitelisted liquidator");
      });
    });

    context("when user is EOA", async () => {
      context("#work", async () => {
        it("should allow to open a position without debt", async () => {
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
              pancakeswapV2Worker.address,
              ethers.utils.parseEther("0.3"),
              ethers.utils.parseEther("0.3"),
              "0",
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
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
              pancakeswapV2Worker.address,
              ethers.utils.parseEther("0.3"),
              ethers.utils.parseEther("1"),
              "0",
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
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
              pancakeswapV2Worker.address,
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1"),
              "0",
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
              )
            )
          ).to.be.revertedWith("insufficient funds in the vault");
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
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("1"),
            loan,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          // Her position should have ~2 NATIVE health (minus some small trading fee)
          expect(await pancakeswapV2Worker.health(1)).to.be.eq(ethers.utils.parseEther("1.997883397660681282"));

          // Eve comes and trigger reinvest
          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
          await pancakeswapV2WorkerAsEve.reinvest();
          AssertHelpers.assertAlmostEqual(
            CAKE_REWARD_PER_BLOCK.mul("2").mul(REINVEST_BOUNTY_BPS).div("10000").toString(),
            (await cake.balanceOf(eveAddress)).toString()
          );

          await vault.deposit(0); // Random action to trigger interest computation
          const healthDebt = await vault.positionInfo("1");
          expect(healthDebt[0]).to.be.above(ethers.utils.parseEther("2"));
          const interest = ethers.utils.parseEther("0.3"); // 30% interest rate
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
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("1"),
            loan,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
          await pancakeswapV2WorkerAsEve.reinvest();
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

        it("should close position correctly when user holds multiple positions", async () => {
          // Set Vault's debt interests to 0% per year
          await simpleVaultConfig.setParams(
            ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
            "0", // 0% per year
            "1000", // 10% reserve pool
            "1000", // 10% Kill prize
            wbnb.address,
            wNativeRelayer.address,
            fairLaunch.address,
            KILL_TREASURY_BPS,
            eveAddress
          );

          // Set Reinvest bounty to 10% of the reward
          await pancakeswapV2Worker.setReinvestBountyBps("100");

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
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("10"),
            ethers.utils.parseEther("10"),
            "0", // max return = 0, don't return NATIVE to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          // Position#2: Bob borrows another 2 BTOKEN loan
          await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("1"));
          await vaultAsBob.work(
            0,
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("2"),
            "0", // max return = 0, don't return BTOKEN to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          // ---------------- Reinvest#1 -------------------
          // Wait for 1 day and someone calls reinvest
          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

          let [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
          await pancakeswapV2WorkerAsEve.reinvest();
          // PancakeWorker receives 303999999998816250 cake as a reward
          // Eve got 10% of 303999999998816250 cake = 0.01 * 303999999998816250 = 3039999999988162 bounty

          AssertHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.003039999999988162").toString(),
            (await cake.balanceOf(eveAddress)).toString()
          );

          // Remaining PancakeWorker reward = 227999999998874730 - 22799999999887473 = 205199999998987257 (~90% reward)
          // Convert 205199999998987257 cake to 671683776318381694 NATIVE
          // Convert NATIVE to 1252466339860712438 LP token and stake
          let [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);

          // LP tokens of worker should be inceased from reinvestment
          expect(workerLPAfter).to.be.gt(workerLPBefore);

          // Check Position#1 info
          await pancakeswapV2Worker.health("1");
          let [bob1Health, bob1DebtToShare] = await vault.positionInfo("1");
          expect(bob1Health).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
          AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bob1DebtToShare.toString());

          // Check Position#2 info
          await pancakeswapV2Worker.health("2");
          let [bob2Health, bob2DebtToShare] = await vault.positionInfo("2");
          expect(bob2Health).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
          AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), bob2DebtToShare.toString());

          // ---------------- Reinvest#2 -------------------
          // Wait for 1 day and someone calls reinvest
          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

          [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
          await pancakeswapV2WorkerAsEve.reinvest();

          // eve should earn cake as a reward for reinvest
          AssertHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.004559999999987660").toString(),
            (await cake.balanceOf(eveAddress)).toString()
          );

          // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
          // Convert 128572916666654734 uni to 157462478899282341 NATIVE
          // Convert NATIVE to 5001669421841640 LP token
          [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
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

          let bobBefore = await baseToken.balanceOf(bobAddress);
          let bobAlpacaBefore = await alpacaToken.balanceOf(bobAddress);
          // Bob close position#1
          await vaultAsBob.work(
            1,
            pancakeswapV2Worker.address,
            "0",
            "0",
            "1000000000000000000000",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );
          let bobAfter = await baseToken.balanceOf(bobAddress);
          let bobAlpacaAfter = await alpacaToken.balanceOf(bobAddress);

          // Check Bob account, Bob must be richer as he earn more from yield
          expect(bobAlpacaAfter).to.be.gt(bobAlpacaBefore);
          expect(bobAfter).to.be.gt(bobBefore);

          // Bob add another 10 BTOKEN
          await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
          await vaultAsBob.work(
            2,
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("10"),
            0,
            "0", // max return = 0, don't return NATIVE to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          bobBefore = await baseToken.balanceOf(bobAddress);
          bobAlpacaBefore = await alpacaToken.balanceOf(bobAddress);
          // Bob close position#2
          await vaultAsBob.work(
            2,
            pancakeswapV2Worker.address,
            "0",
            "0",
            "1000000000000000000000000000000",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );
          bobAfter = await baseToken.balanceOf(bobAddress);
          bobAlpacaAfter = await alpacaToken.balanceOf(bobAddress);

          // Check Bob account, Bob must be richer as she earned from leverage yield farm without getting liquidated
          expect(bobAfter).to.be.gt(bobBefore);
          expect(bobAlpacaAfter).to.be.gt(bobAlpacaBefore);
        });

        it("should close position correctly when user holds mix positions of leveraged and non-leveraged", async () => {
          // Set Vault's debt interests to 0% per year
          await simpleVaultConfig.setParams(
            ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
            "0", // 0% per year
            "1000", // 10% reserve pool
            "1000", // 10% Kill prize
            wbnb.address,
            wNativeRelayer.address,
            fairLaunch.address,
            KILL_TREASURY_BPS,
            eveAddress
          );

          // Set Reinvest bounty to 10% of the reward
          await pancakeswapV2Worker.setReinvestBountyBps("100");

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
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("10"),
            ethers.utils.parseEther("10"),
            "0", // max return = 0, don't return NATIVE to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          // Position#2: Bob open position without leverage
          await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("3"));
          await vaultAsBob.work(
            0,
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("3"),
            "0",
            "0", // max return = 0, don't return BTOKEN to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          // ---------------- Reinvest#1 -------------------
          // Wait for 1 day and someone calls reinvest
          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

          let [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
          await pancakeswapV2WorkerAsEve.reinvest();
          // PancakeWorker receives 303999999998816250 cake as a reward
          // Eve got 10% of 303999999998816250 cake = 0.01 * 303999999998816250 = 3039999999988162 bounty
          AssertHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.003039999999988162").toString(),
            (await cake.balanceOf(eveAddress)).toString()
          );

          // Remaining PancakeWorker reward = 227999999998874730 - 22799999999887473 = 205199999998987257 (~90% reward)
          // Convert 205199999998987257 cake to 671683776318381694 NATIVE
          // Convert NATIVE to 1252466339860712438 LP token and stake
          let [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);

          // LP tokens of worker should be inceased from reinvestment
          expect(workerLPAfter).to.be.gt(workerLPBefore);

          // Check Position#1 info
          await pancakeswapV2Worker.health("1");
          let [bob1Health, bob1DebtToShare] = await vault.positionInfo("1");
          expect(bob1Health).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
          AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bob1DebtToShare.toString());

          // Check Position#2 info
          await pancakeswapV2Worker.health("2");
          let [bob2Health, bob2DebtToShare] = await vault.positionInfo("2");
          expect(bob2Health).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
          AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("0").toString(), bob2DebtToShare.toString());

          // ---------------- Reinvest#2 -------------------
          // Wait for 1 day and someone calls reinvest
          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

          [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
          await pancakeswapV2WorkerAsEve.reinvest();

          // eve should earn cake as a reward for reinvest
          AssertHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.004559999999987660").toString(),
            (await cake.balanceOf(eveAddress)).toString()
          );

          // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
          // Convert 128572916666654734 uni to 157462478899282341 NATIVE
          // Convert NATIVE to 5001669421841640 LP token
          [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
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

          let bobBefore = await baseToken.balanceOf(bobAddress);
          let bobAlpacaBefore = await alpacaToken.balanceOf(bobAddress);
          // Bob close position#1
          await vaultAsBob.work(
            1,
            pancakeswapV2Worker.address,
            "0",
            "0",
            "1000000000000000000000",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );
          let bobAfter = await baseToken.balanceOf(bobAddress);
          let bobAlpacaAfter = await alpacaToken.balanceOf(bobAddress);

          // Check Bob account, Bob must be richer as he earn more from yield
          expect(bobAlpacaAfter).to.be.gt(bobAlpacaBefore);
          expect(bobAfter).to.be.gt(bobBefore);

          // Bob add another 10 BTOKEN
          await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
          await vaultAsBob.work(
            2,
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("10"),
            0,
            "0", // max return = 0, don't return NATIVE to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          bobBefore = await baseToken.balanceOf(bobAddress);
          bobAlpacaBefore = await alpacaToken.balanceOf(bobAddress);
          // Bob close position#2
          await vaultAsBob.work(
            2,
            pancakeswapV2Worker.address,
            "0",
            "0",
            "1000000000000000000000000000000",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );
          bobAfter = await baseToken.balanceOf(bobAddress);
          bobAlpacaAfter = await alpacaToken.balanceOf(bobAddress);

          // Check Bob account, Bob must be richer as she earned from leverage yield farm without getting liquidated
          // But bob shouldn't earn more ALPACAs from closing position#2
          expect(bobAfter).to.be.gt(bobBefore);
          expect(bobAlpacaAfter).to.be.eq(bobAlpacaBefore);
        });
      });

      context("#kill", async () => {
        it("should not allow user not whitelisted to liquidate", async () => {
          await expect(vaultAsBob.kill("1")).to.be.revertedWith("!whitelisted liquidator");
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
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("1"),
            loan,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          // Her position should have ~2 BTOKEN health (minus some small trading fee)
          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
          await pancakeswapV2WorkerAsEve.reinvest();
          await vault.deposit(0); // Random action to trigger interest computation

          // You can't liquidate her position yet
          await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");
          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
          await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");
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
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("1"),
            loan,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
          await pancakeswapV2WorkerAsEve.reinvest();
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
            deployerAddress
          );
          const toBeLiquidatedValue = await pancakeswapV2Worker.health(1);
          const liquidationBounty = toBeLiquidatedValue.mul(KILL_PRIZE_BPS).div(10000);
          const treasuryKillFees = toBeLiquidatedValue.mul(KILL_TREASURY_BPS).div(10000);
          const totalLiquidationFees = liquidationBounty.add(treasuryKillFees);
          const eveBalanceBefore = await baseToken.balanceOf(eveAddress);
          const aliceAlpacaBefore = await alpacaToken.balanceOf(aliceAddress);
          const aliceBalanceBefore = await baseToken.balanceOf(aliceAddress);
          const vaultBalanceBefore = await baseToken.balanceOf(vault.address);
          const deployerBalanceBefore = await baseToken.balanceOf(deployerAddress);
          const vaultDebtVal = await vault.vaultDebtVal();
          const debt = await vault.debtShareToVal((await vault.positions(1)).debtShare);
          const left = debt.gte(toBeLiquidatedValue.sub(totalLiquidationFees))
            ? ethers.constants.Zero
            : toBeLiquidatedValue.sub(totalLiquidationFees).sub(debt);

          // Now eve kill the position
          await expect(vaultAsEve.kill("1")).to.emit(vaultAsEve, "Kill");

          // Getting balances after killed
          const eveBalanceAfter = await baseToken.balanceOf(eveAddress);
          const aliceBalanceAfter = await baseToken.balanceOf(aliceAddress);
          const vaultBalanceAfter = await baseToken.balanceOf(vault.address);
          const deployerBalanceAfter = await baseToken.balanceOf(deployerAddress);

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
            await alpacaToken.balanceOf(aliceAddress),
            "expect Alice to get some ALPACA from holding LYF position"
          ).to.be.gt(aliceAlpacaBefore);

          // Alice creates a new position again
          await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
          await vaultAsAlice.work(
            0,
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("1"),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          // She can close position
          await vaultAsAlice.work(
            2,
            pancakeswapV2Worker.address,
            "0",
            "0",
            "115792089237316195423570985008687907853269984665640564039457584007913129639935",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
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
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("10"),
            ethers.utils.parseEther("10"),
            "0", // max return = 0, don't return BTOKEN to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          await farmToken.mint(deployerAddress, ethers.utils.parseEther("100"));
          await farmToken.approve(routerV2.address, ethers.utils.parseEther("100"));

          // Price swing 10%
          // Add more token to the pool equals to sqrt(10*((0.1)**2) / 9) - 0.1 = 0.005409255338945984, (0.1 is the balance of token in the pool)
          await routerV2.swapExactTokensForTokens(
            ethers.utils.parseEther("0.005409255338945984"),
            "0",
            [farmToken.address, baseToken.address],
            deployerAddress,
            FOREVER
          );
          await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");

          // Price swing 20%
          // Add more token to the pool equals to
          // sqrt(10*((0.10540925533894599)**2) / 8) - 0.10540925533894599 = 0.012441874858811944
          // (0.10540925533894599 is the balance of token in the pool)
          await routerV2.swapExactTokensForTokens(
            ethers.utils.parseEther("0.012441874858811944"),
            "0",
            [farmToken.address, baseToken.address],
            deployerAddress,
            FOREVER
          );
          await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");

          // Price swing 23.43%
          // Existing token on the pool = 0.10540925533894599 + 0.012441874858811944 = 0.11785113019775793
          // Add more token to the pool equals to
          // sqrt(10*((0.11785113019775793)**2) / 7.656999999999999) - 0.11785113019775793 = 0.016829279312591913
          await routerV2.swapExactTokensForTokens(
            ethers.utils.parseEther("0.016829279312591913"),
            "0",
            [farmToken.address, baseToken.address],
            deployerAddress,
            FOREVER
          );
          await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");

          // Price swing 30%
          // Existing token on the pool = 0.11785113019775793 + 0.016829279312591913 = 0.13468040951034985
          // Add more token to the pool equals to
          // sqrt(10*((0.13468040951034985)**2) / 7) - 0.13468040951034985 = 0.026293469053292218
          await routerV2.swapExactTokensForTokens(
            ethers.utils.parseEther("0.026293469053292218"),
            "0",
            [farmToken.address, baseToken.address],
            deployerAddress,
            FOREVER
          );

          // Now you can liquidate because of the price fluctuation
          const eveBefore = await baseToken.balanceOf(eveAddress);
          await expect(vaultAsEve.kill("1")).to.emit(vaultAsEve, "Kill");

          expect(await baseToken.balanceOf(eveAddress)).to.be.gt(eveBefore);
        });
      });

      context("#onlyApprovedHolder", async () => {
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
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("1"),
            loan,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
          await pancakeswapV2WorkerAsEve.reinvest();
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

          const eveBefore = await baseToken.balanceOf(eveAddress);

          // Now you can liquidate because of the insane interest rate
          await expect(vaultAsEve.kill("1")).to.emit(vaultAsEve, "Kill");

          expect(await baseToken.balanceOf(eveAddress)).to.be.gt(eveBefore);
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
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("1"),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          // She can close position
          await vaultAsAlice.work(
            2,
            pancakeswapV2Worker.address,
            "0",
            "0",
            "115792089237316195423570985008687907853269984665640564039457584007913129639935",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );
        });
      });

      context("#deposit-withdraw", async () => {
        it("should deposit and withdraw BTOKEN from Vault (bad debt case)", async () => {
          // Deployer deposits 10 BTOKEN to the Vault
          const deposit = ethers.utils.parseEther("10");
          await baseToken.approve(vault.address, deposit);
          await vault.deposit(deposit);

          expect(await vault.balanceOf(deployerAddress)).to.be.equal(deposit);

          // Bob borrows 2 BTOKEN loan
          const loan = ethers.utils.parseEther("2");
          await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("1"));
          await vaultAsBob.work(
            0,
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("1"),
            loan,
            "0", // max return = 0, don't return BTOKEN to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
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
          AssertHelpers.assertAlmostEqual(aliceDeposit.toString(), (await vault.balanceOf(aliceAddress)).toString());
          AssertHelpers.assertAlmostEqual(deposit.add(aliceDeposit).toString(), (await vault.totalSupply()).toString());

          // Simulate BTOKEN price is very high by swap FTOKEN to BTOKEN (reduce BTOKEN supply)
          await farmToken.mint(deployerAddress, ethers.utils.parseEther("100"));
          await farmToken.approve(routerV2.address, ethers.utils.parseEther("100"));
          await routerV2.swapExactTokensForTokens(
            ethers.utils.parseEther("100"),
            "0",
            [farmToken.address, baseToken.address],
            deployerAddress,
            FOREVER
          );

          // Alice liquidates Bob position#1
          let aliceBefore = await baseToken.balanceOf(aliceAddress);
          let eveBefore = await baseToken.balanceOf(eveAddress);

          await expect(vaultAsAlice.kill("1")).to.emit(vaultAsAlice, "Kill");

          let aliceAfter = await baseToken.balanceOf(aliceAddress);
          let eveAfter = await baseToken.balanceOf(eveAddress);

          // Bank balance is increase by liquidation
          AssertHelpers.assertAlmostEqual(
            ethers.utils.parseEther("10.002702699312215556").toString(),
            (await baseToken.balanceOf(vault.address)).toString()
          );
          // Alice is liquidator, Alice should receive 10% Kill prize
          // BTOKEN back from liquidation 0.00300199830261993, 10% of it is 0.000300199830261993
          AssertHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.000300199830261993").toString(),
            aliceAfter.sub(aliceBefore).toString()
          );

          // deployer is Wallet to buyback -> 1%  -> 0.0000300199830261993
          AssertHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.000030019983026199").toString(),
            eveAfter.sub(eveBefore).toString()
          );

          // Alice withdraws 2 BOKTEN
          aliceBefore = await baseToken.balanceOf(aliceAddress);
          await vaultAsAlice.withdraw(await vault.balanceOf(aliceAddress));
          aliceAfter = await baseToken.balanceOf(aliceAddress);

          // alice gots 2/12 * 10.002702699312215556 = 1.667117116552036
          AssertHelpers.assertAlmostEqual(
            ethers.utils.parseEther("1.667117116552036").toString(),
            aliceAfter.sub(aliceBefore).toString()
          );
        });
      });

      context("#reinvest", async () => {
        it("should reinvest correctly", async () => {
          // Set Vault's debt interests to 0% per year
          await simpleVaultConfig.setParams(
            ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
            "0", // 0% per year
            "1000", // 10% reserve pool
            "1000", // 10% Kill prize
            wbnb.address,
            wNativeRelayer.address,
            fairLaunch.address,
            KILL_TREASURY_BPS,
            eveAddress
          );

          // Set Reinvest bounty to 10% of the reward
          await pancakeswapV2Worker.setReinvestBountyBps("100");

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
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("10"),
            ethers.utils.parseEther("10"),
            "0", // max return = 0, don't return NATIVE to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          // Position#2: Alice borrows 2 BTOKEN loan
          await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
          await vaultAsAlice.work(
            0,
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("2"),
            "0", // max return = 0, don't return BTOKEN to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          // ---------------- Reinvest#1 -------------------
          // Wait for 1 day and someone calls reinvest
          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

          let [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
          await pancakeswapV2WorkerAsEve.reinvest();
          // PancakeWorker receives 303999999998816250 cake as a reward
          // Eve got 10% of 303999999998816250 cake = 0.01 * 303999999998816250 = 3039999999988162 bounty
          AssertHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.003039999999988162").toString(),
            (await cake.balanceOf(eveAddress)).toString()
          );

          // Remaining PancakeWorker reward = 227999999998874730 - 22799999999887473 = 205199999998987257 (~90% reward)
          // Convert 205199999998987257 cake to 671683776318381694 NATIVE
          // Convert NATIVE to 1252466339860712438 LP token and stake
          let [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);

          // LP tokens of worker should be inceased from reinvestment
          expect(workerLPAfter).to.be.gt(workerLPBefore);

          // Check Bob position info
          await pancakeswapV2Worker.health("1");
          let [bobHealth, bobDebtToShare] = await vault.positionInfo("1");
          expect(bobHealth).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
          AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bobDebtToShare.toString());

          // Check Alice position info
          await pancakeswapV2Worker.health("2");
          let [aliceHealth, aliceDebtToShare] = await vault.positionInfo("2");
          expect(aliceHealth).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
          AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), aliceDebtToShare.toString());

          // ---------------- Reinvest#2 -------------------
          // Wait for 1 day and someone calls reinvest
          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

          [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
          await pancakeswapV2WorkerAsEve.reinvest();

          // eve should earn cake as a reward for reinvest
          AssertHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.004559999999987660").toString(),
            (await cake.balanceOf(eveAddress)).toString()
          );

          // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
          // Convert 128572916666654734 uni to 157462478899282341 NATIVE
          // Convert NATIVE to 5001669421841640 LP token
          [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
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

          [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
          await pancakeswapV2WorkerAsEve.reinvest();

          // eve should earn cake as a reward for reinvest
          AssertHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.006079999999979926").toString(),
            (await cake.balanceOf(eveAddress)).toString()
          );

          // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
          // Convert 128572916666654734 uni to 74159218067697746 NATIVE
          // Convert NATIVE to 2350053120029788 LP token
          [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
          // LP tokens of worker should be inceased from reinvestment
          expect(workerLPAfter).to.be.gt(workerLPBefore);

          const bobBefore = await baseToken.balanceOf(bobAddress);
          // Bob close position#1
          await vaultAsBob.work(
            1,
            pancakeswapV2Worker.address,
            "0",
            "0",
            "1000000000000000000000",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );
          const bobAfter = await baseToken.balanceOf(bobAddress);

          // Check Bob account, Bob must be richer as he earn more from yield
          expect(bobAfter).to.be.gt(bobBefore);

          // Alice add another 10 BTOKEN
          await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("10"));
          await vaultAsAlice.work(
            2,
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("10"),
            0,
            "0", // max return = 0, don't return NATIVE to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          const aliceBefore = await baseToken.balanceOf(aliceAddress);
          // Alice close position#2
          await vaultAsAlice.work(
            2,
            pancakeswapV2Worker.address,
            "0",
            "0",
            "1000000000000000000000000000000",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );
          const aliceAfter = await baseToken.balanceOf(aliceAddress);

          // Check Alice account, Alice must be richer as she earned from leverage yield farm without getting liquidated
          expect(aliceAfter).to.be.gt(aliceBefore);
        });
      });

      context("#partialclose", async () => {
        context("#liquidate", async () => {
          context("when maxReturn is lessDebt", async () => {
            // back cannot be less than lessDebt as less debt is Min(debt, back, maxReturn) = maxReturn
            it("should pay debt 'maxReturn' BTOKEN and return 'liquidatedAmount - maxReturn' BTOKEN to user", async () => {
              // Set Vault's debt interests to 0% per year
              await simpleVaultConfig.setParams(
                ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
                "0", // 0% per year
                "1000", // 10% reserve pool
                "1000", // 10% Kill prize
                wbnb.address,
                wNativeRelayer.address,
                fairLaunch.address,
                KILL_TREASURY_BPS,
                eveAddress
              );

              // Set Reinvest bounty to 10% of the reward
              await pancakeswapV2Worker.setReinvestBountyBps("100");

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
                pancakeswapV2Worker.address,
                ethers.utils.parseEther("10"),
                ethers.utils.parseEther("10"),
                "0", // max return = 0, don't return NATIVE to the debt
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                )
              );

              // Position#2: Alice borrows 2 BTOKEN loan
              await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
              await vaultAsAlice.work(
                0,
                pancakeswapV2Worker.address,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("2"),
                "0", // max return = 0, don't return BTOKEN to the debt
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                )
              );

              // ---------------- Reinvest#1 -------------------
              // Wait for 1 day and someone calls reinvest
              await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

              let [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
              await pancakeswapV2WorkerAsEve.reinvest();
              // PancakeWorker receives 303999999998816250 cake as a reward
              // Eve got 10% of 303999999998816250 cake = 0.01 * 303999999998816250 = 3039999999988162 bounty
              AssertHelpers.assertAlmostEqual(
                ethers.utils.parseEther("0.003039999999988162").toString(),
                (await cake.balanceOf(eveAddress)).toString()
              );

              // Remaining PancakeWorker reward = 227999999998874730 - 22799999999887473 = 205199999998987257 (~90% reward)
              // Convert 205199999998987257 cake to 671683776318381694 NATIVE
              // Convert NATIVE to 1252466339860712438 LP token and stake
              let [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);

              // LP tokens of worker should be inceased from reinvestment
              expect(workerLPAfter).to.be.gt(workerLPBefore);

              // Check Bob position info
              await pancakeswapV2Worker.health("1");
              let [bobHealth, bobDebtToShare] = await vault.positionInfo("1");
              expect(bobHealth).to.be.gt(ethers.utils.parseEther("20")); // Get Reward and increase health
              AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bobDebtToShare.toString());

              // Check Alice position info
              await pancakeswapV2Worker.health("2");
              let [aliceHealth, aliceDebtToShare] = await vault.positionInfo("2");
              expect(aliceHealth).to.be.gt(ethers.utils.parseEther("3")); // Get Reward and increase health
              AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), aliceDebtToShare.toString());

              // ---------------- Reinvest#2 -------------------
              // Wait for 1 day and someone calls reinvest
              await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

              [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
              await pancakeswapV2WorkerAsEve.reinvest();

              // eve should earn cake as a reward for reinvest
              AssertHelpers.assertAlmostEqual(
                ethers.utils.parseEther("0.004559999999987660").toString(),
                (await cake.balanceOf(eveAddress)).toString()
              );

              // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
              // Convert 128572916666654734 CAKE to 157462478899282341 BTOKEN
              // Convert BTOKEN to 5001669421841640 LP token
              [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
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
              const bobBefore = await baseToken.balanceOf(bobAddress);
              const [bobHealthBefore] = await vault.positionInfo("1");
              const lpUnderBobPosition = await pancakeswapV2Worker.shareToBalance(await pancakeswapV2Worker.shares(1));
              [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
              // Bob close his position 50%
              await vaultAsBob.work(
                1,
                pancakeswapV2Worker.address,
                "0",
                "0",
                ethers.utils.parseEther("5"),
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [
                    partialCloseStrat.address,
                    ethers.utils.defaultAbiCoder.encode(
                      ["uint256", "uint256", "uint256"],
                      [
                        lpUnderBobPosition.div(2),
                        ethers.utils.parseEther("5"),
                        ethers.utils.parseEther("9.626445063812855002"),
                      ]
                    ),
                  ]
                )
              );
              const bobAfter = await baseToken.balanceOf(bobAddress);

              // After Bob liquidate half of his position which worth
              // 14.626445063812855002 BTOKEN (price impact+trading fee included)
              // Bob returns 5 BTOKEN to payback the debt hence; He should be
              // 14.626445063812855002 - 5 = 9.626445063812855002 BTOKEN richer
              expect(bobAfter.sub(bobBefore), "Bob should get 9.626445063812855002 BTOKEN back").to.be.eq(
                ethers.utils.parseEther("9.626445063812855002")
              );
              // Check Bob position info
              [bobHealth, bobDebtToShare] = await vault.positionInfo("1");
              // Bob's health after partial close position must be 50% less than before
              // due to he exit half of lp under his position
              expect(bobHealth).to.be.lt(bobHealthBefore.div(2));
              // Bob's debt should be left only 5 BTOKEN due he said he wants to return at max 5 BTOKEN
              expect(bobDebtToShare).to.be.eq(ethers.utils.parseEther("5"));
              // Check LP deposited by Worker on MasterChef
              [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
              // LP tokens of worker should be decreased by lpUnderBobPosition/2
              // due to Bob execute StrategyClosePartialLiquidate
              expect(workerLPAfter).to.be.eq(workerLPBefore.sub(lpUnderBobPosition.div(2)));
            });
          });

          context("when debt is lessDebt", async () => {
            // back cannot be less than lessDebt as less debt is Min(debt, back, maxReturn) = debt
            it("should pay back all debt and return 'liquidatedAmount - debt' BTOKEN to user", async () => {
              // Set Vault's debt interests to 0% per year
              await simpleVaultConfig.setParams(
                ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
                "0", // 0% per year
                "1000", // 10% reserve pool
                "1000", // 10% Kill prize
                wbnb.address,
                wNativeRelayer.address,
                fairLaunch.address,
                KILL_TREASURY_BPS,
                eveAddress
              );

              // Bob deposits 10 BTOKEN
              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.deposit(ethers.utils.parseEther("10"));

              // Position#1: Bob borrows 10 BTOKEN loan
              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.work(
                0,
                pancakeswapV2Worker.address,
                ethers.utils.parseEther("10"),
                ethers.utils.parseEther("10"),
                "0", // max return = 0, don't return BTOKEN to the debt
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                )
              );

              // Bob think he made enough. He now wants to close position partially.
              // He close 50% of his position and return all debt
              const bobBefore = await baseToken.balanceOf(bobAddress);
              const [bobHealthBefore] = await vault.positionInfo("1");
              const lpUnderBobPosition = await pancakeswapV2Worker.shareToBalance(await pancakeswapV2Worker.shares(1));
              const [workerLPBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);

              // Bob closes position with maxReturn 5,000,000,000 and liquidate half of his position
              // Expect that Bob will close position successfully and his debt must be reduce as liquidated amount pay debt
              await vaultAsBob.work(
                1,
                pancakeswapV2Worker.address,
                "0",
                "0",
                ethers.utils.parseEther("5000000000"),
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [
                    partialCloseStrat.address,
                    ethers.utils.defaultAbiCoder.encode(
                      ["uint256", "uint256", "uint256"],
                      [
                        lpUnderBobPosition.div(2),
                        ethers.utils.parseEther("5000000000"),
                        ethers.utils.parseEther("3.198357540187508606"),
                      ]
                    ),
                  ]
                )
              );
              const bobAfter = await baseToken.balanceOf(bobAddress);

              // After Bob liquidate half of his position which worth
              // 13.198357540187508606 BTOKEN (price impact+trading fee included)
              // Bob wish to return 5,000,000,000 BTOKEN (when maxReturn > debt, return all debt)
              // The following criteria must be stratified:
              // - Bob should get 13.198357540187508606 - 10 = 3.198357540187508606 BTOKEN back.
              // - Bob's position debt must be 0
              expect(
                bobBefore.add(ethers.utils.parseEther("3.198357540187508606")),
                "Expect BTOKEN in Bob's account after close position to increase by ~3.19 BTOKEN"
              ).to.be.eq(bobAfter);
              // Check Bob position info
              const [bobHealth, bobDebtVal] = await vault.positionInfo("1");
              // Bob's health after partial close position must be 50% less than before
              // due to he exit half of lp under his position
              expect(bobHealth).to.be.lt(bobHealthBefore.div(2));
              // Bob's debt should be 0 BTOKEN due he said he wants to return at max 5,000,000,000 BTOKEN (> debt, return all debt)
              expect(bobDebtVal).to.be.eq("0");
              // Check LP deposited by Worker on MasterChef
              const [workerLPAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
              // LP tokens of worker should be decreased by lpUnderBobPosition/2
              // due to Bob execute StrategyClosePartialLiquidate
              expect(workerLPAfter).to.be.eq(workerLPBefore.sub(lpUnderBobPosition.div(2)));
            });
          });

          context("when back is lessDebt", async () => {
            // back is eqaul to less debt as Min(debt, back, maxReturn) = back itself
            context("when maxDebtRepayment < debt", async () => {
              it("should revert bad work factor", async () => {
                // Set Vault's debt interests to 0% per year
                await simpleVaultConfig.setParams(
                  ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
                  "0", // 0% per year
                  "1000", // 10% reserve pool
                  "1000", // 10% Kill prize
                  wbnb.address,
                  wNativeRelayer.address,
                  fairLaunch.address,
                  KILL_TREASURY_BPS,
                  eveAddress
                );

                // Bob deposits 10 BTOKEN
                await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
                await vaultAsBob.deposit(ethers.utils.parseEther("10"));

                // Position#1: Bob borrows 10 BTOKEN loan
                await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
                await vaultAsBob.work(
                  0,
                  pancakeswapV2Worker.address,
                  ethers.utils.parseEther("10"),
                  ethers.utils.parseEther("10"),
                  "0", // max return = 0, don't return BTOKEN to the debt
                  ethers.utils.defaultAbiCoder.encode(
                    ["address", "bytes"],
                    [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                  )
                );

                // Price swing so it makes back = lessDebt
                await farmToken.mint(deployerAddress, ethers.utils.parseEther("100"));
                await farmToken.approve(routerV2.address, ethers.utils.parseEther("100"));

                // Price swing 80%
                // Add more token to the pool equals to sqrt(10*((0.1)**2) / 2) - 0.1 = 0.123607
                await routerV2.swapExactTokensForTokens(
                  ethers.utils.parseEther("0.123607"),
                  "0",
                  [farmToken.address, baseToken.address],
                  deployerAddress,
                  FOREVER
                );

                // Bob wants to close position using partial close liquidate.
                // He close 100% of his position and try to return all debt.
                // But his position is underwater already.
                const lpUnderBobPosition = await pancakeswapV2Worker.shareToBalance(
                  await pancakeswapV2Worker.shares(1)
                );

                // Bob closes position with maxReturn 5,000,000,000 and liquidate half of his position
                // Expect that Bob will close position successfully and his debt must be reduce as liquidated amount pay debt
                await expect(
                  vaultAsBob.work(
                    1,
                    pancakeswapV2Worker.address,
                    "0",
                    "0",
                    ethers.utils.parseEther("5000000000"),
                    ethers.utils.defaultAbiCoder.encode(
                      ["address", "bytes"],
                      [
                        partialCloseStrat.address,
                        ethers.utils.defaultAbiCoder.encode(
                          ["uint256", "uint256", "uint256"],
                          [lpUnderBobPosition, "0", "0"]
                        ),
                      ]
                    )
                  )
                ).to.be.revertedWith("bad work factor");
              });
            });

            context("when maxDebtRepayment >= debt", async () => {
              it("should revert subtraction overflow", async () => {
                // Set Vault's debt interests to 0% per year
                await simpleVaultConfig.setParams(
                  ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
                  "0", // 0% per year
                  "1000", // 10% reserve pool
                  "1000", // 10% Kill prize
                  wbnb.address,
                  wNativeRelayer.address,
                  fairLaunch.address,
                  KILL_TREASURY_BPS,
                  eveAddress
                );

                // Bob deposits 10 BTOKEN
                await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
                await vaultAsBob.deposit(ethers.utils.parseEther("10"));

                // Position#1: Bob borrows 10 BTOKEN loan
                await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
                await vaultAsBob.work(
                  0,
                  pancakeswapV2Worker.address,
                  ethers.utils.parseEther("10"),
                  ethers.utils.parseEther("10"),
                  "0", // max return = 0, don't return BTOKEN to the debt
                  ethers.utils.defaultAbiCoder.encode(
                    ["address", "bytes"],
                    [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                  )
                );

                // Price swing so it makes back = lessDebt
                await farmToken.mint(deployerAddress, ethers.utils.parseEther("100"));
                await farmToken.approve(routerV2.address, ethers.utils.parseEther("100"));

                // Price swing 80%
                // Add more token to the pool equals to sqrt(10*((0.1)**2) / 2) - 0.1 = 0.123607
                await routerV2.swapExactTokensForTokens(
                  ethers.utils.parseEther("0.123607"),
                  "0",
                  [farmToken.address, baseToken.address],
                  deployerAddress,
                  FOREVER
                );

                // Bob wants to close position using partial close liquidate.
                // He close 100% of his position and try to return all debt.
                // But his position is underwater already.
                const lpUnderBobPosition = await pancakeswapV2Worker.shareToBalance(
                  await pancakeswapV2Worker.shares(1)
                );

                // Bob closes position with maxReturn 5,000,000,000 and liquidate half of his position
                // Expect that Bob will close position successfully and his debt must be reduce as liquidated amount pay debt
                await expect(
                  vaultAsBob.work(
                    1,
                    pancakeswapV2Worker.address,
                    "0",
                    "0",
                    ethers.utils.parseEther("5000000000"),
                    ethers.utils.defaultAbiCoder.encode(
                      ["address", "bytes"],
                      [
                        partialCloseStrat.address,
                        ethers.utils.defaultAbiCoder.encode(
                          ["uint256", "uint256", "uint256"],
                          [lpUnderBobPosition, ethers.utils.parseEther("5000000000"), "0"]
                        ),
                      ]
                    )
                  )
                ).to.be.revertedWith("subtraction overflow");
              });
            });
          });

          context("when work factor is not satisfy", async () => {
            it("should revert", async () => {
              // Set Vault's debt interests to 0% per year
              await simpleVaultConfig.setParams(
                ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
                "0", // 0% per year
                "1000", // 10% reserve pool
                "1000", // 10% Kill prize
                wbnb.address,
                wNativeRelayer.address,
                fairLaunch.address,
                KILL_TREASURY_BPS,
                eveAddress
              );

              // Bob deposits 10 BTOKEN
              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.deposit(ethers.utils.parseEther("10"));

              // Position#1: Bob borrows 10 BTOKEN loan
              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.work(
                0,
                pancakeswapV2Worker.address,
                ethers.utils.parseEther("10"),
                ethers.utils.parseEther("10"),
                "0", // max return = 0, don't return BTOKEN to the debt
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                )
              );

              // Bob think he made enough. He now wants to close position partially.
              // He liquidate all of his position but not payback the debt.
              const lpUnderBobPosition = await pancakeswapV2Worker.shareToBalance(await pancakeswapV2Worker.shares(1));
              // Bob closes position with maxReturn 0 and liquidate his position
              // Expect that Bob will not be able to close his position as he liquidate all underlying assets but not paydebt
              // which made his position debt ratio higher than allow work factor
              await expect(
                vaultAsBob.work(
                  1,
                  pancakeswapV2Worker.address,
                  "0",
                  "0",
                  "0",
                  ethers.utils.defaultAbiCoder.encode(
                    ["address", "bytes"],
                    [
                      partialCloseStrat.address,
                      ethers.utils.defaultAbiCoder.encode(
                        ["uint256", "uint256", "uint256"],
                        [lpUnderBobPosition, "0", "0"]
                      ),
                    ]
                  )
                )
              ).revertedWith("bad work factor");
            });
          });
        });

        context("#minimize", async () => {
          context("when maxReturn is lessDebt", async () => {
            // back cannot be < lessDebt as less debt is Min(debt, back, maxReturn) = maxReturn
            it("should pay debt 'maxReturn' BTOKEN and return 'liquidatedAmount - maxReturn' BTOKEN to user ", async () => {
              // Set Vault's debt interests to 0% per year
              await simpleVaultConfig.setParams(
                ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
                "0", // 0% per year
                "1000", // 10% reserve pool
                "1000", // 10% Kill prize
                wbnb.address,
                wNativeRelayer.address,
                fairLaunch.address,
                KILL_TREASURY_BPS,
                deployerAddress
              );

              // Bob deposits 10 BTOKEN
              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.deposit(ethers.utils.parseEther("10"));

              // Position#1: Bob borrows 10 BTOKEN loan
              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.work(
                0,
                pancakeswapV2Worker.address,
                ethers.utils.parseEther("10"),
                ethers.utils.parseEther("10"),
                "0", // max return = 0, don't return BTOKEN to the debt
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                )
              );

              // Bob think he made enough. He now wants to close position partially minimize trading.
              // He close 50% of his position and return all debt
              const bobBTokenBefore = await baseToken.balanceOf(bobAddress);
              const bobFTokenBefore = await farmToken.balanceOf(bobAddress);
              const [bobHealthBefore] = await vault.positionInfo("1");
              const lpUnderBobPosition = await pancakeswapV2Worker.shareToBalance(await pancakeswapV2Worker.shares(1));
              const [workerLPBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);

              // Bob closes position with maxReturn 5 BTOKEN and liquidate half of his position
              // Expect that Bob will close position successfully and his debt must be reduce as liquidated amount pay debt
              await vaultAsBob.work(
                1,
                pancakeswapV2Worker.address,
                "0",
                "0",
                ethers.utils.parseEther("5"),
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [
                    partialCloseMinimizeStrat.address,
                    ethers.utils.defaultAbiCoder.encode(
                      ["uint256", "uint256", "uint256"],
                      [lpUnderBobPosition.div(2), ethers.utils.parseEther("10"), "0"]
                    ),
                  ]
                )
              );
              const bobBTokenAfter = await baseToken.balanceOf(bobAddress);
              const bobFTokenAfter = await farmToken.balanceOf(bobAddress);
              const remainFToken = bobFTokenAfter.sub(bobFTokenBefore);
              const trading = await routerV2.getAmountsOut(remainFToken, [farmToken.address, baseToken.address]);
              // After Bob liquidate half of his position which worth
              // 10 BTOKEN + 0.029120372484366723 FTOKEN (price impact+trading fee included)
              // Bob returns 5 BTOKEN to payback the debt hence; He should be
              // The following criteria must be stratified:
              // - Bob should get 10 - 5 = 5 BTOKEN back.
              // - Bob should get 0.029120372484366723 FTOKEN back.
              // - Bob's position debt must be 5 BTOKEN
              expect(bobBTokenBefore.add(ethers.utils.parseEther("5"))).to.be.eq(bobBTokenAfter);
              expect(
                bobFTokenBefore.add(ethers.utils.parseEther("0.029120372484366723")),
                "Expect BTOKEN in Bob's account after close position to increase by ~0.029 FTOKEN"
              ).to.be.eq(bobFTokenAfter);
              // Check Bob position info
              const [bobHealth, bobDebtVal] = await vault.positionInfo("1");
              // Bob's health after partial close position must be 50% less than before
              // due to he exit half of lp under his position
              expect(bobHealth).to.be.lt(bobHealthBefore.div(2));
              // Bob's debt should be left only 5 BTOKEN due he said he wants to return at max 5 BTOKEN
              expect(bobDebtVal).to.be.eq(ethers.utils.parseEther("5"));
              // Check LP deposited by Worker on MasterChef
              const [workerLPAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
              // LP tokens of worker should be decreased by lpUnderBobPosition/2
              // due to Bob execute StrategyClosePartialLiquidate
              expect(workerLPAfter).to.be.eq(workerLPBefore.sub(lpUnderBobPosition.div(2)));
            });
          });

          context("when debt is lessDebt", async () => {
            // back cannot be < lessDebt as less debt is Min(debt, back, maxReturn) = debt
            it("should pay back all debt and return 'liquidatedAmount - debt' BTOKEN to user", async () => {
              // Set Vault's debt interests to 0% per year
              await simpleVaultConfig.setParams(
                ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
                "0", // 0% per year
                "1000", // 10% reserve pool
                "1000", // 10% Kill prize
                wbnb.address,
                wNativeRelayer.address,
                fairLaunch.address,
                KILL_TREASURY_BPS,
                deployerAddress
              );

              // Bob deposits 10 BTOKEN
              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.deposit(ethers.utils.parseEther("10"));

              // Position#1: Bob borrows 10 BTOKEN loan
              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.work(
                0,
                pancakeswapV2Worker.address,
                ethers.utils.parseEther("10"),
                ethers.utils.parseEther("10"),
                "0", // max return = 0, don't return BTOKEN to the debt
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                )
              );

              // Bob think he made enough. He now wants to close position partially minimize trading.
              // He close 50% of his position and return all debt
              const bobBTokenBefore = await baseToken.balanceOf(bobAddress);
              const bobFTokenBefore = await farmToken.balanceOf(bobAddress);
              const [bobHealthBefore] = await vault.positionInfo("1");
              const lpUnderBobPosition = await pancakeswapV2Worker.shareToBalance(await pancakeswapV2Worker.shares(1));
              const [workerLPBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);

              // Bob closes position with maxReturn 5,000,000,000 and liquidate half of his position
              // Expect that Bob will close position successfully and his debt must be reduce as liquidated amount pay debt
              await vaultAsBob.work(
                1,
                pancakeswapV2Worker.address,
                "0",
                "0",
                ethers.utils.parseEther("5000000000"),
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [
                    partialCloseMinimizeStrat.address,
                    ethers.utils.defaultAbiCoder.encode(
                      ["uint256", "uint256", "uint256"],
                      [lpUnderBobPosition.div(2), ethers.utils.parseEther("10"), "0"]
                    ),
                  ]
                )
              );
              const bobBTokenAfter = await baseToken.balanceOf(bobAddress);
              const bobFTokenAfter = await farmToken.balanceOf(bobAddress);
              const remainFToken = bobFTokenAfter.sub(bobFTokenBefore);
              const trading = await routerV2.getAmountsOut(remainFToken, [farmToken.address, baseToken.address]);
              // After Bob liquidate half of his position which worth
              // 10 BTOKEN + 0.029120372484366723 FTOKEN (price impact+trading fee included)
              // Bob wish to return 5,000,000,000 BTOKEN (when maxReturn > debt, return all debt)
              // The following criteria must be stratified:
              // - Bob should get 10 - 10 = 0 BTOKEN back.
              // - Bob should get 0.029120372484366723 FTOKEN back.
              // - Bob's position debt must be 0
              expect(bobBTokenBefore).to.be.eq(bobBTokenAfter);
              expect(
                bobFTokenBefore.add(ethers.utils.parseEther("0.029120372484366723")),
                "Expect BTOKEN in Bob's account after close position to increase by ~0.029 FTOKEN"
              ).to.be.eq(bobFTokenAfter);
              // Check Bob position info
              const [bobHealth, bobDebtVal] = await vault.positionInfo("1");
              // Bob's health after partial close position must be 50% less than before
              // due to he exit half of lp under his position
              expect(bobHealth).to.be.lt(bobHealthBefore.div(2));
              // Bob's debt should be 0 BTOKEN due he said he wants to return at max 5,000,000,000 BTOKEN (> debt, return all debt)
              expect(bobDebtVal).to.be.eq("0");
              // Check LP deposited by Worker on MasterChef
              const [workerLPAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
              // LP tokens of worker should be decreased by lpUnderBobPosition/2
              // due to Bob execute StrategyClosePartialLiquidate
              expect(workerLPAfter).to.be.eq(workerLPBefore.sub(lpUnderBobPosition.div(2)));
            });
          });

          context("when back is lessDebt", async () => {
            // back is eqaul to less debt as Min(debt, back, maxReturn) = back itself
            it("should revert", async () => {
              // Set Vault's debt interests to 0% per year
              await simpleVaultConfig.setParams(
                ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
                "0", // 0% per year
                "1000", // 10% reserve pool
                "1000", // 10% Kill prize
                wbnb.address,
                wNativeRelayer.address,
                fairLaunch.address,
                KILL_TREASURY_BPS,
                eveAddress
              );

              // Bob deposits 10 BTOKEN
              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.deposit(ethers.utils.parseEther("10"));

              // Position#1: Bob borrows 10 BTOKEN loan
              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.work(
                0,
                pancakeswapV2Worker.address,
                ethers.utils.parseEther("10"),
                ethers.utils.parseEther("10"),
                "0", // max return = 0, don't return BTOKEN to the debt
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                )
              );

              // Price swing so it makes back = lessDebt
              await farmToken.mint(deployerAddress, ethers.utils.parseEther("100"));
              await farmToken.approve(routerV2.address, ethers.utils.parseEther("100"));

              // Price swing 80%
              // Add more token to the pool equals to sqrt(10*((0.1)**2) / 2) - 0.1 = 0.123607
              await routerV2.swapExactTokensForTokens(
                ethers.utils.parseEther("0.123607"),
                "0",
                [farmToken.address, baseToken.address],
                deployerAddress,
                FOREVER
              );

              // Bob wants to close position using partial close liquidate.
              // He close 100% of his position and try to return all debt.
              // But his position is underwater already.
              const lpUnderBobPosition = await pancakeswapV2Worker.shareToBalance(await pancakeswapV2Worker.shares(1));

              // Bob closes position with maxReturn 5,000,000,000 and liquidate half of his position
              // Expect that Bob won't be able to close the position as it is already underwater
              await expect(
                vaultAsBob.work(
                  1,
                  pancakeswapV2Worker.address,
                  "0",
                  "0",
                  ethers.utils.parseEther("5000000000"),
                  ethers.utils.defaultAbiCoder.encode(
                    ["address", "bytes"],
                    [
                      partialCloseMinimizeStrat.address,
                      ethers.utils.defaultAbiCoder.encode(
                        ["uint256", "uint256", "uint256"],
                        [lpUnderBobPosition, ethers.utils.parseEther("5000000000"), "0"]
                      ),
                    ]
                  )
                )
              ).to.be.reverted;
            });
          });

          context("when work factor is not satisfy", async () => {
            it("should revert bad work factor", async () => {
              // Set Vault's debt interests to 0% per year
              await simpleVaultConfig.setParams(
                ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
                "0", // 0% per year
                "1000", // 10% reserve pool
                "1000", // 10% Kill prize
                wbnb.address,
                wNativeRelayer.address,
                fairLaunch.address,
                KILL_TREASURY_BPS,
                deployerAddress
              );

              // Bob deposits 10 BTOKEN
              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.deposit(ethers.utils.parseEther("10"));

              // Position#1: Bob borrows 10 BTOKEN loan
              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.work(
                0,
                pancakeswapV2Worker.address,
                ethers.utils.parseEther("10"),
                ethers.utils.parseEther("10"),
                "0", // max return = 0, don't return BTOKEN to the debt
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                )
              );

              // Bob think he made enough. He now wants to close position partially minimize trading.
              // He liquidate half of his position but not payback the debt.
              const lpUnderBobPosition = await pancakeswapV2Worker.shareToBalance(await pancakeswapV2Worker.shares(1));
              // Bob closes position with maxReturn 0 and liquidate half of his position
              // Expect that Bob will not be able to close his position as he liquidate underlying assets but not paydebt
              // which made his position debt ratio higher than allow work factor
              await expect(
                vaultAsBob.work(
                  1,
                  pancakeswapV2Worker.address,
                  "0",
                  "0",
                  "0",
                  ethers.utils.defaultAbiCoder.encode(
                    ["address", "bytes"],
                    [
                      partialCloseMinimizeStrat.address,
                      ethers.utils.defaultAbiCoder.encode(
                        ["uint256", "uint256", "uint256"],
                        [lpUnderBobPosition.div(2), "0", "0"]
                      ),
                    ]
                  )
                )
              ).revertedWith("bad work factor");
            });
          });
        });
      });
    });
  });
});
