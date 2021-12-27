import { ethers, upgrades, waffle } from "hardhat";
import { Signer, constants, BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
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
  MasterChef,
  NFTStaking,
  NFTStaking__factory,
  Alpies,
  Alpies__factory,
  FixedPriceModel,
  FixedPriceModel__factory,
  ConfigurableInterestVaultConfig__factory,
  ConfigurableInterestVaultConfig,
  TripleSlopeModel__factory,
  TripleSlopeModel,
  SimplePriceOracle__factory,
  SimplePriceOracle,
  WorkerConfig,
  WorkerConfig__factory,
} from "../typechain";
import * as AssertHelpers from "./helpers/assert";
import * as TimeHelpers from "./helpers/time";
import { parseEther } from "ethers/lib/utils";
import { DeployHelper } from "./helpers/deploy";
import { SwapHelper } from "./helpers/swap";
import { Worker02Helper } from "./helpers/worker";

chai.use(solidity);
const { expect } = chai;

describe("Vault - PancakeswapV202", () => {
  const FOREVER = "2000000000";
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther("5000");
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther("0.076");
  const REINVEST_BOUNTY_BPS = "100"; // 1% reinvest bounty
  const RESERVE_POOL_BPS = "1000"; // 10% reserve pool
  const KILL_PRIZE_BPS = "500"; // 10% Kill prize
  const INTEREST_RATE = "3472222222222"; // 30% per year
  const MIN_DEBT_SIZE = ethers.utils.parseEther("1"); // 1 BTOKEN min debt size
  const WORK_FACTOR = "7000";
  const KILL_FACTOR = "8000";
  const MAX_REINVEST_BOUNTY: string = "500";
  const DEPLOYER = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";
  const BENEFICIALVAULT_BOUNTY_BPS = "1000";
  const REINVEST_THRESHOLD = ethers.utils.parseEther("1"); // If pendingCake > 1 $CAKE, then reinvest
  const KILL_TREASURY_BPS = "0";
  const POOL_ID = 1;

  const MAX_SALE_ALPIES = 100;
  const MAX_RESERVE_AMOUNT = 5;
  const MAX_PREMINT_AMOUNT = 10;
  const ALPIES_PRICE = ethers.utils.parseEther("1");

  const ALPIES_POOL_ID = ethers.utils.solidityKeccak256(["string"], ["ALPIES"]);

  const INTEREST_MODEL = ethers.constants.AddressZero;
  const WRAP_NATIVE_ADDR = ethers.constants.AddressZero;
  const WNATIVE_RELAYER = ethers.constants.AddressZero;
  const FAIR_LAUNCH_ADDR = ethers.constants.AddressZero;
  const TREASURY_ADDR = ethers.constants.AddressZero;

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
  let pancakeswapV2Worker: PancakeswapV2Worker02;
  let pancakeswapV2Worker01: PancakeswapV2Worker;

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

  let nftStaking: NFTStaking;
  let alpies: Alpies;
  let configVault: ConfigurableInterestVaultConfig;
  let tripleSlopeModel: TripleSlopeModel;
  let simplePriceOracle: SimplePriceOracle;
  let workerConfig: WorkerConfig;

  let alpiesAsAlice: Alpies;
  let nftStakingAsAlice: NFTStaking;

  async function fixture() {
    [deployer, alice, bob, eve] = await ethers.getSigners();
    [deployerAddress, aliceAddress, bobAddress, eveAddress] = await Promise.all([
      deployer.getAddress(),
      alice.getAddress(),
      bob.getAddress(),
      eve.getAddress(),
    ]);
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
          { address: deployerAddress, amount: ethers.utils.parseEther("100000") },
          { address: aliceAddress, amount: ethers.utils.parseEther("1000") },
          { address: bobAddress, amount: ethers.utils.parseEther("1000") },
        ],
      },
      {
        name: "FTOKEN",
        symbol: "FTOKEN",
        decimals: "18",
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("100000") },
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
      KILL_PRIZE_BPS,
      tripleSlopeModel.address,
      WRAP_NATIVE_ADDR,
      WNATIVE_RELAYER,
      fairLaunch.address,
      KILL_TREASURY_BPS,
      TREASURY_ADDR,
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

    /// Deploy WorkerConfig
    const WorkerConfig = (await ethers.getContractFactory("WorkerConfig", deployer)) as WorkerConfig__factory;
    workerConfig = (await upgrades.deployProxy(WorkerConfig, [simplePriceOracle.address])) as WorkerConfig;
    await workerConfig.deployed();

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
    await vault.updateConfig(configVault.address);

    // Setup strategies
    [addStrat, liqStrat, twoSidesStrat, minimizeStrat, partialCloseStrat, partialCloseMinimizeStrat] =
      await deployHelper.deployPancakeV2Strategies(routerV2, vault, wbnb, wNativeRelayer);

    // whitelisted contract to be able to call work
    await configVault.setWhitelistedCallers([whitelistedContract.address], true);

    // whitelisted to be able to call kill
    await configVault.setWhitelistedLiquidators([await alice.getAddress(), await eve.getAddress()], true);

    // Set approved add strategies
    await configVault.setApprovedAddStrategy([addStrat.address, twoSidesStrat.address], true);

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

    await configVault.setWorkers(
      [pancakeswapV2Worker.address, pancakeswapV2Worker01.address],
      [workerConfig.address, workerConfig.address]
    );

    await workerConfig.setConfigs(
      [pancakeswapV2Worker.address, pancakeswapV2Worker01.address],
      [
        {
          acceptDebt: true,
          workFactor: WORK_FACTOR,
          killFactor: KILL_FACTOR,
          maxPriceDiff: 10000000,
        },
        {
          acceptDebt: true,
          workFactor: WORK_FACTOR,
          killFactor: KILL_FACTOR,
          maxPriceDiff: 10000000,
        },
      ]
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

    alpiesAsAlice = Alpies__factory.connect(alpies.address, alice);
    nftStakingAsAlice = NFTStaking__factory.connect(nftStaking.address, alice);
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
      expect(await pancakeswapV2Worker.fee()).to.be.bignumber.eq("9975");
      expect(await pancakeswapV2Worker.feeDenom()).to.be.bignumber.eq("10000");
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

  context("when owner is setting worker", async () => {
    describe("#reinvestConfig", async () => {
      it("should set reinvest config correctly", async () => {
        await expect(
          pancakeswapV2Worker.setReinvestConfig(250, ethers.utils.parseEther("1"), [cake.address, baseToken.address])
        )
          .to.be.emit(pancakeswapV2Worker, "SetReinvestConfig")
          .withArgs(deployerAddress, 250, ethers.utils.parseEther("1"), [cake.address, baseToken.address]);
        expect(await pancakeswapV2Worker.reinvestBountyBps()).to.be.bignumber.eq(250);
        expect(await pancakeswapV2Worker.reinvestThreshold()).to.be.bignumber.eq(ethers.utils.parseEther("1"));
        expect(await pancakeswapV2Worker.getReinvestPath()).to.deep.eq([cake.address, baseToken.address]);
      });

      it("should revert when owner set reinvestBountyBps > max", async () => {
        await expect(
          pancakeswapV2Worker.setReinvestConfig(1000, "0", [cake.address, baseToken.address])
        ).to.be.revertedWith(
          "PancakeswapV2Worker02::setReinvestConfig:: _reinvestBountyBps exceeded maxReinvestBountyBps"
        );
        expect(await pancakeswapV2Worker.reinvestBountyBps()).to.be.bignumber.eq(100);
      });

      it("should revert when owner set reinvest path that doesn't start with $CAKE and end with $BTOKN", async () => {
        await expect(
          pancakeswapV2Worker.setReinvestConfig(200, "0", [baseToken.address, cake.address])
        ).to.be.revertedWith(
          "PancakeswapV2Worker02::setReinvestConfig:: _reinvestPath must start with CAKE, end with BTOKEN"
        );
      });
    });

    describe("#setMaxReinvestBountyBps", async () => {
      it("should set max reinvest bounty", async () => {
        await pancakeswapV2Worker.setMaxReinvestBountyBps(200);
        expect(await pancakeswapV2Worker.maxReinvestBountyBps()).to.be.eq(200);
      });

      it("should revert when new max reinvest bounty over 30%", async () => {
        await expect(pancakeswapV2Worker.setMaxReinvestBountyBps("3001")).to.be.revertedWith(
          "PancakeswapV2Worker02::setMaxReinvestBountyBps:: _maxReinvestBountyBps exceeded 30%"
        );
        expect(await pancakeswapV2Worker.maxReinvestBountyBps()).to.be.eq("500");
      });
    });

    describe("#setTreasuryConfig", async () => {
      it("should successfully set a treasury account", async () => {
        const aliceAddr = aliceAddress;
        await pancakeswapV2Worker.setTreasuryConfig(aliceAddr, REINVEST_BOUNTY_BPS);
        expect(await pancakeswapV2Worker.treasuryAccount()).to.eq(aliceAddr);
      });

      it("should successfully set a treasury bounty", async () => {
        await pancakeswapV2Worker.setTreasuryConfig(DEPLOYER, 499);
        expect(await pancakeswapV2Worker.treasuryBountyBps()).to.eq(499);
      });

      it("should revert when a new treasury bounty > max reinvest bounty bps", async () => {
        await expect(
          pancakeswapV2Worker.setTreasuryConfig(DEPLOYER, parseInt(MAX_REINVEST_BOUNTY) + 1)
        ).to.revertedWith(
          "PancakeswapV2Worker02::setTreasuryConfig:: _treasuryBountyBps exceeded maxReinvestBountyBps"
        );
        expect(await pancakeswapV2Worker.treasuryBountyBps()).to.eq(REINVEST_BOUNTY_BPS);
      });
    });

    describe("#setStrategyOk", async () => {
      it("should set strat ok", async () => {
        await pancakeswapV2Worker.setStrategyOk([aliceAddress], true);
        expect(await pancakeswapV2Worker.okStrats(aliceAddress)).to.be.eq(true);
      });
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
        it("should not allow to open the position with bad work factor", async () => {
          // Set Price
          let [r0, r1] = await lp.getReserves();
          const token0 = await lp.token0();
          const token1 = await lp.token1();
          await simplePriceOracle.setPrices(
            [token0, token1],
            [token1, token0],
            [r1.mul(ethers.constants.WeiPerEther).div(r0), r0.mul(ethers.constants.WeiPerEther).div(r1)]
          );

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
          // Set Price
          let [r0, r1] = await lp.getReserves();
          const token0 = await lp.token0();
          const token1 = await lp.token1();
          await simplePriceOracle.setPrices(
            [token0, token1],
            [token1, token0],
            [r1.mul(ethers.constants.WeiPerEther).div(r0), r0.mul(ethers.constants.WeiPerEther).div(r1)]
          );

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

        it("should not able to liquidate healthy position", async () => {
          // Set Price
          let [r0, r1] = await lp.getReserves();
          const token0 = await lp.token0();
          const token1 = await lp.token1();
          await simplePriceOracle.setPrices(
            [token0, token1],
            [token1, token0],
            [r1.mul(ethers.constants.WeiPerEther).div(r0), r0.mul(ethers.constants.WeiPerEther).div(r1)]
          );

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

          // Set Price
          [r0, r1] = await lp.getReserves();
          await simplePriceOracle.setPrices(
            [token0, token1],
            [token1, token0],
            [r1.mul(ethers.constants.WeiPerEther).div(r0), r0.mul(ethers.constants.WeiPerEther).div(r1)]
          );

          // You can't liquidate her position yet
          await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");
          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

          // Set Price
          [r0, r1] = await lp.getReserves();
          await simplePriceOracle.setPrices(
            [token0, token1],
            [token1, token0],
            [r1.mul(ethers.constants.WeiPerEther).div(r0), r0.mul(ethers.constants.WeiPerEther).div(r1)]
          );
          await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");
        });

        it("should work", async () => {
          // Set Price
          let [r0, r1] = await lp.getReserves();
          const token0 = await lp.token0();
          const token1 = await lp.token1();
          await simplePriceOracle.setPrices(
            [token0, token1],
            [token1, token0],
            [r1.mul(ethers.constants.WeiPerEther).div(r0), r0.mul(ethers.constants.WeiPerEther).div(r1)]
          );

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
          expect(await pancakeswapV2Worker.health(1)).to.be.bignumber.eq(
            ethers.utils.parseEther("1.997883397660681282")
          );

          // Eve comes and trigger reinvest
          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
          await pancakeswapV2WorkerAsEve.reinvest();
          AssertHelpers.assertAlmostEqual(
            CAKE_REWARD_PER_BLOCK.mul("2").mul(REINVEST_BOUNTY_BPS).div("10000").toString(),
            (await cake.balanceOf(eveAddress)).toString()
          );
        });

        it("should allow opening position with normal work factor when NFTStaking is not set up", async () => {
          // Set Price
          let [r0, r1] = await lp.getReserves();
          const token0 = await lp.token0();
          const token1 = await lp.token1();
          await simplePriceOracle.setPrices(
            [token0, token1],
            [token1, token0],
            [r1.mul(ethers.constants.WeiPerEther).div(r0), r0.mul(ethers.constants.WeiPerEther).div(r1)]
          );

          // Deployer deposits 3 BTOKEN to the bank
          const deposit = ethers.utils.parseEther("3");
          await baseToken.approve(vault.address, deposit);
          await vault.deposit(deposit);

          // Now Alice can take 1 BTOKEN loan + 2.3 BTOKEN of her to create a new position
          // This would be witnin normal 70% work factor
          const loan = ethers.utils.parseEther("2.3");
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

          // Her position should have ~3.3 NATIVE health (minus some small trading fee)
          expect(await pancakeswapV2Worker.health(1)).to.be.bignumber.eq(
            ethers.utils.parseEther("3.297406179570338080")
          );

          // Eve comes and trigger reinvest
          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
          await pancakeswapV2WorkerAsEve.reinvest();
          AssertHelpers.assertAlmostEqual(
            CAKE_REWARD_PER_BLOCK.mul("2").mul(REINVEST_BOUNTY_BPS).div("10000").toString(),
            (await cake.balanceOf(eveAddress)).toString()
          );
        });

        it("should not allow opening position which exceed normal work factor when NFTStaking is not set up", async () => {
          // Set Price
          let [r0, r1] = await lp.getReserves();
          const token0 = await lp.token0();
          const token1 = await lp.token1();
          await simplePriceOracle.setPrices(
            [token0, token1],
            [token1, token0],
            [r1.mul(ethers.constants.WeiPerEther).div(r0), r0.mul(ethers.constants.WeiPerEther).div(r1)]
          );

          // Deployer deposits 3 BTOKEN to the bank
          const deposit = ethers.utils.parseEther("3");
          await baseToken.approve(vault.address, deposit);
          await vault.deposit(deposit);

          // Now Alice can take 1 BTOKEN loan + 3 BTOKEN of her to create a new position
          // This would exceed normal 70% work factor
          const loan = ethers.utils.parseEther("3");
          await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
          await expect(
            vaultAsAlice.work(
              0,
              pancakeswapV2Worker.address,
              ethers.utils.parseEther("1"),
              loan,
              "0",
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
              )
            )
          ).to.be.revertedWith("bad work factor");
        });

        it("should allow opening position with normal leverage when NFT is not staked", async () => {
          // Setup NFT Staking for Alpies
          await configVault.setNftStaking(nftStaking.address);
          await workerConfig.setBoostedLeverage(
            [pancakeswapV2Worker.address],
            [
              {
                allowBoost: 1,
                boostedWorkFactor: 7500,
              },
            ]
          );

          // Set Price
          let [r0, r1] = await lp.getReserves();
          const token0 = await lp.token0();
          const token1 = await lp.token1();
          await simplePriceOracle.setPrices(
            [token0, token1],
            [token1, token0],
            [r1.mul(ethers.constants.WeiPerEther).div(r0), r0.mul(ethers.constants.WeiPerEther).div(r1)]
          );

          // Deployer deposits 3 BTOKEN to the bank
          const deposit = ethers.utils.parseEther("3");
          await baseToken.approve(vault.address, deposit);
          await vault.deposit(deposit);

          // Now Alice can take 1 BTOKEN loan + 2.3 BTOKEN of her to create a new position
          // This would be within normal 70% work factor
          const loan = ethers.utils.parseEther("2.3");
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

          // Her position should have ~3.3 NATIVE health (minus some small trading fee)
          expect(await pancakeswapV2Worker.health(1)).to.be.bignumber.eq(
            ethers.utils.parseEther("3.297406179570338080")
          );

          // Eve comes and trigger reinvest
          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
          await pancakeswapV2WorkerAsEve.reinvest();
          AssertHelpers.assertAlmostEqual(
            CAKE_REWARD_PER_BLOCK.mul("2").mul(REINVEST_BOUNTY_BPS).div("10000").toString(),
            (await cake.balanceOf(eveAddress)).toString()
          );
        });

        it("should not allow opening position which exceed normal leverage when NFT is not staked", async () => {
          // Setup NFT Staking for Alpies
          await configVault.setNftStaking(nftStaking.address);
          await workerConfig.setBoostedLeverage(
            [pancakeswapV2Worker.address],
            [
              {
                allowBoost: 1,
                boostedWorkFactor: 7500,
              },
            ]
          );

          // Set Price
          let [r0, r1] = await lp.getReserves();
          const token0 = await lp.token0();
          const token1 = await lp.token1();
          await simplePriceOracle.setPrices(
            [token0, token1],
            [token1, token0],
            [r1.mul(ethers.constants.WeiPerEther).div(r0), r0.mul(ethers.constants.WeiPerEther).div(r1)]
          );

          // Deployer deposits 3 BTOKEN to the bank
          const deposit = ethers.utils.parseEther("3");
          await baseToken.approve(vault.address, deposit);
          await vault.deposit(deposit);

          // Now Alice can take 1 BTOKEN loan + 2.5 BTOKEN of her to create a new position
          // This would exceed normal 70% work factor
          const loan = ethers.utils.parseEther("2.5");
          await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
          await expect(
            vaultAsAlice.work(
              0,
              pancakeswapV2Worker.address,
              ethers.utils.parseEther("1"),
              loan,
              "0",
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
              )
            )
          ).to.be.revertedWith("bad work factor");
        });

        it("should allow opening position with boosted leverage from staked NFT", async () => {
          // Setup NFT Staking for Alpies
          await configVault.setNftStaking(nftStaking.address);
          await workerConfig.setBoostedLeverage(
            [pancakeswapV2Worker.address],
            [
              {
                allowBoost: 1,
                boostedWorkFactor: 7500,
              },
            ]
          );

          // Alice stake 1 Alpies
          await alpies.mintReserve(1);
          await alpies.transferFrom(deployerAddress, aliceAddress, 0);
          await alpiesAsAlice.approve(nftStaking.address, 0);
          await nftStakingAsAlice.stakeNFT(ALPIES_POOL_ID, alpies.address, 0);
          expect(await nftStaking.isStaked(ALPIES_POOL_ID, aliceAddress)).to.be.true;

          // Set Price
          let [r0, r1] = await lp.getReserves();
          const token0 = await lp.token0();
          const token1 = await lp.token1();
          await simplePriceOracle.setPrices(
            [token0, token1],
            [token1, token0],
            [r1.mul(ethers.constants.WeiPerEther).div(r0), r0.mul(ethers.constants.WeiPerEther).div(r1)]
          );

          // Deployer deposits 3 BTOKEN to the bank
          const deposit = ethers.utils.parseEther("5");
          await baseToken.approve(vault.address, deposit);
          await vault.deposit(deposit);

          // Now Alice can take 1 BTOKEN loan + 2.5 BTOKEN of her to create a new position
          // This would exceed normal 70% work factor, but Alice has staked Alpies, so she is eligible for 75% work factor
          const loan = ethers.utils.parseEther("2.5");
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

          // Her position should have ~3.5 NATIVE health (minus some small trading fee)
          const positionHealth = await pancakeswapV2Worker.health(1);
          expect(positionHealth).to.be.bignumber.eq(ethers.utils.parseEther("3.497351774877757908"));

          // Alice borrow more 0.5 BASE token which is okay because she has boosted leverage
          await vaultAsAlice.work(
            1,
            pancakeswapV2Worker.address,
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("1"),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );
          const positionHealthAfterBorrowMore = await pancakeswapV2Worker.health(1);
          expect(positionHealthAfterBorrowMore).to.be.gt(positionHealth);
        });

        it("should not allow borrowing more when unstake NFT from a boosted leverage position", async () => {
          // Setup NFT Staking for Alpies
          await configVault.setNftStaking(nftStaking.address);
          await workerConfig.setBoostedLeverage(
            [pancakeswapV2Worker.address],
            [
              {
                allowBoost: 1,
                boostedWorkFactor: 7500,
              },
            ]
          );

          // Alice stake 1 Alpies
          await alpies.mintReserve(1);
          await alpies.transferFrom(deployerAddress, aliceAddress, 0);
          await alpiesAsAlice.approve(nftStaking.address, 0);
          await nftStakingAsAlice.stakeNFT(ALPIES_POOL_ID, alpies.address, 0);
          expect(await nftStaking.isStaked(ALPIES_POOL_ID, aliceAddress)).to.be.true;

          // Set Price
          let [r0, r1] = await lp.getReserves();
          const token0 = await lp.token0();
          const token1 = await lp.token1();
          await simplePriceOracle.setPrices(
            [token0, token1],
            [token1, token0],
            [r1.mul(ethers.constants.WeiPerEther).div(r0), r0.mul(ethers.constants.WeiPerEther).div(r1)]
          );

          // Deployer deposits 5 BTOKEN to the bank
          const deposit = ethers.utils.parseEther("5");
          await baseToken.approve(vault.address, deposit);
          await vault.deposit(deposit);

          // Now Alice can take 1 BTOKEN loan + 2.5 BTOKEN of her to create a new position
          // This would exceed normal 70% work factor, but Alice has staked Alpies, so she is eligible for 75% work factor
          const loan = ethers.utils.parseEther("2.5");
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

          // Her position should have ~3.5 NATIVE health (minus some small trading fee)
          const positionHealth = await pancakeswapV2Worker.health(1);
          expect(positionHealth).to.be.bignumber.eq(ethers.utils.parseEther("3.497351774877757908"));

          // Alice unstake her NFT which would make her position not eligible for boosted leverage
          await nftStakingAsAlice.unstakeNFT(ALPIES_POOL_ID);

          // Alice borrow more 0.5 BASE token which is not allowed
          await expect(
            vaultAsAlice.work(
              1,
              pancakeswapV2Worker.address,
              ethers.utils.parseEther("0"),
              ethers.utils.parseEther("1"),
              "0",
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
              )
            )
          ).to.be.revertedWith("bad work factor");
        });
      });

      context("#kill", async () => {
        it("should not allow user not whitelisted to liquidate", async () => {
          await expect(vaultAsBob.kill("1")).to.be.revertedWith("!whitelisted liquidator");
        });

        it("should liquidate user position correctly", async () => {
          // Set Price
          let [r0, r1] = await lp.getReserves();
          const token0 = await lp.token0();
          const token1 = await lp.token1();
          await simplePriceOracle.setPrices(
            [token0, token1],
            [token1, token0],
            [r1.mul(ethers.constants.WeiPerEther).div(r0), r0.mul(ethers.constants.WeiPerEther).div(r1)]
          );

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
          expect(await baseToken.balanceOf(eveAddress)).to.be.bignumber.gt(eveBefore);
        });

        it("should not liquidate user position with boosted kill factor", async () => {
          // Setup NFT Staking for Alpies
          await configVault.setNftStaking(nftStaking.address);
          await workerConfig.setBoostedKillFactor(
            [pancakeswapV2Worker.address],
            [
              {
                allowBoost: 1,
                boostedKillFactor: 8500,
              },
            ]
          );

          // Alice stake 1 Alpies
          await alpies.mintReserve(1);
          await alpies.transferFrom(deployerAddress, aliceAddress, 0);
          await alpiesAsAlice.approve(nftStaking.address, 0);
          await nftStakingAsAlice.stakeNFT(ALPIES_POOL_ID, alpies.address, 0);
          expect(await nftStaking.isStaked(ALPIES_POOL_ID, aliceAddress)).to.be.true;

          // Set Price
          let [r0, r1] = await lp.getReserves();
          const token0 = await lp.token0();
          const token1 = await lp.token1();
          await simplePriceOracle.setPrices(
            [token0, token1],
            [token1, token0],
            [r1.mul(ethers.constants.WeiPerEther).div(r0), r0.mul(ethers.constants.WeiPerEther).div(r1)]
          );

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

          // Now Eve try to liquidate, but failed as boosted kill factor still protect this position
          [r0, r1] = await lp.getReserves();
          await simplePriceOracle.setPrices(
            [token0, token1],
            [token1, token0],
            [r1.mul(ethers.constants.WeiPerEther).div(r0), r0.mul(ethers.constants.WeiPerEther).div(r1)]
          );
          const eveBefore = await baseToken.balanceOf(eveAddress);
          await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");

          // Alice unstake her NFT and now lose the boosted kill factor
          await nftStakingAsAlice.unstakeNFT(ALPIES_POOL_ID);

          // Eve should be able to liquidate now
          await expect(vaultAsEve.kill("1")).to.emit(vaultAsEve, "Kill");
          expect(await baseToken.balanceOf(eveAddress)).to.be.bignumber.gt(eveBefore);
        });
      });
    });
  });
});
