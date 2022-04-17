import { ethers, network, upgrades, waffle } from "hardhat";
import { constants, BigNumber, utils } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  CakeToken,
  FairLaunch,
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
  DeltaNeutralPancakeWorker02,
  DeltaNeutralPancakeWorker02__factory,
  SimpleVaultConfig,
  Vault,
  Vault__factory,
  WNativeRelayer,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal,
  PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading,
  PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading,
  DeltaNeutralOracle,
  ChainLinkPriceOracle,
  ChainLinkPriceOracle__factory,
  MockAggregatorV3__factory,
  IERC20,
  DeltaNeutralPancakeWorker02Migrate,
  DeltaNeutralPancakeWorker02Migrate__factory,
  MasterChefV2__factory,
  MasterChefV2,
  DeltaNeutralPancakeMCV2Worker02,
  DeltaNeutralPancakeMCV2Worker02__factory,
} from "../../../../../typechain";
import * as AssertHelpers from "../../../../helpers/assert";
import * as TimeHelpers from "../../../../helpers/time";
import { parseEther } from "ethers/lib/utils";
import { DeployHelper } from "../../../../helpers/deploy";
import { SwapHelper } from "../../../../helpers/swap";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
const { expect } = chai;

describe("Vault - DeltaNetPancakeWorker02_Migrate", () => {
  const FOREVER = "2000000000";
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther("5000");
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther("0.076");
  const REINVEST_BOUNTY_BPS = "100"; // 1% reinvest bounty
  const RESERVE_POOL_BPS = "1000"; // 10% reserve pool
  const KILL_PRIZE_BPS = "1000"; // 10% Kill prize
  const INTEREST_RATE = "3472222222222"; // 30% per year
  const MIN_DEBT_SIZE = ethers.utils.parseEther("1"); // 1 BTOKEN min debt size
  const WORK_FACTOR = "100000000";
  const KILL_FACTOR = "8000";
  const MAX_REINVEST_BOUNTY: string = "2000";
  const DEPLOYER = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";
  const BENEFICIALVAULT_BOUNTY_BPS = "1000";
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
  let busd: MockERC20;
  let cake: CakeToken;

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

  /// PancakeswapMasterChef-related instance(s)
  let masterChef: PancakeMasterChef;
  let masterChefV2: MasterChefV2;
  let deltaNeutralWorker: DeltaNeutralPancakeWorker02;

  /// Timelock instance(s)
  let whitelistedContract: MockContractContext;
  let evilContract: MockContractContext;

  let priceOracle: DeltaNeutralOracle;
  let chainlink: ChainLinkPriceOracle;

  // Accounts
  let deployer: SignerWithAddress;
  let deltaNet: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let eve: SignerWithAddress;

  let deployerAddress: string;
  let deltaNetAddress: string;
  let bobAddress: string;

  // Contract Signer
  let baseTokenAsDeltaNet: MockERC20;
  let baseTokenAsBob: MockERC20;

  let farmTokenAsDeltaNet: MockERC20;

  let lpAsDeltaNet: PancakePair;
  let lpAsBob: PancakePair;

  let pancakeMasterChefAsDeltaNet: PancakeMasterChef;
  let pancakeMasterChefAsBob: PancakeMasterChef;

  let deltaNeutralWorkerAsDeployer: DeltaNeutralPancakeWorker02;
  let deltaNeutralWorkerAsBob: DeltaNeutralPancakeWorker02;

  let chainLinkOracleAsDeployer: ChainLinkPriceOracle;

  let MockAggregatorV3Factory: MockAggregatorV3__factory;

  let vaultAsDeltaNet: Vault;
  let vaultAsBob: Vault;
  let vaultAsEve: Vault;

  // Test Helper
  let swapHelper: SwapHelper;
  let deployHelper: DeployHelper;

  async function fixture() {
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: ["0xc44f82b07ab3e691f826951a6e335e1bc1bb0b51"],
    });
    deployer = await ethers.getSigner("0xc44f82b07ab3e691f826951a6e335e1bc1bb0b51");
    [deltaNet, bob, eve] = await ethers.getSigners();
    deltaNet = deltaNet;
    [deployerAddress, deltaNetAddress, bobAddress] = await Promise.all([
      deployer.getAddress(),
      deltaNet.getAddress(),
      bob.getAddress(),
    ]);
    deltaNetAddress = deltaNetAddress;
    await bob.sendTransaction({ value: ethers.utils.parseEther("100"), to: deployerAddress });
    deployHelper = new DeployHelper(deployer);

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
          { address: deltaNetAddress, amount: ethers.utils.parseEther("1000") },
          { address: bobAddress, amount: ethers.utils.parseEther("1000") },
        ],
      },
      {
        name: "FTOKEN",
        symbol: "FTOKEN",
        decimals: "18",
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("1000") },
          { address: deltaNetAddress, amount: ethers.utils.parseEther("1000") },
          { address: bobAddress, amount: ethers.utils.parseEther("1000") },
        ],
      },
    ]);
    wbnb = await deployHelper.deployWBNB();
    busd = await deployHelper.deployERC20();
    [factoryV2, routerV2, cake, , masterChef] = await deployHelper.deployPancakeV2(wbnb, CAKE_REWARD_PER_BLOCK, [
      { address: deployerAddress, amount: ethers.utils.parseEther("100") },
    ]);
    [, fairLaunch] = await deployHelper.deployAlpacaFairLaunch(
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
    await simpleVaultConfig.setWhitelistedLiquidators([deployerAddress, bobAddress], true);

    // Set approved add strategies
    await simpleVaultConfig.setApprovedAddStrategy([addStrat.address, twoSidesStrat.address], true);

    // Setup BTOKEN-FTOKEN pair on Pancakeswap
    // Add lp to masterChef's pool
    await factoryV2.createPair(baseToken.address, farmToken.address);
    lp = PancakePair__factory.connect(await factoryV2.getPair(farmToken.address, baseToken.address), deployer);
    await masterChef.add(1, lp.address, true);

    /// Setup DeltaNeutralPancakeWorker02
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

    deltaNeutralWorker = await deployHelper.deployDeltaNeutralPancakeWorker02(
      vault,
      baseToken,
      masterChef,
      routerV2,
      POOL_ID,
      WORK_FACTOR,
      KILL_FACTOR,
      addStrat,
      REINVEST_BOUNTY_BPS,
      [bobAddress],
      DEPLOYER,
      [cake.address, wbnb.address, baseToken.address],
      [twoSidesStrat.address, minimizeStrat.address, partialCloseStrat.address, partialCloseMinimizeStrat.address],
      simpleVaultConfig,
      priceOracle.address
    );
    await deltaNeutralWorker.setWhitelistedCallers(
      [whitelistedContract.address, deltaNeutralWorker.address, deltaNetAddress],
      true
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
        token0: baseToken as unknown as IERC20,
        token1: farmToken as unknown as IERC20,
        amount0desired: ethers.utils.parseEther("1"),
        amount1desired: ethers.utils.parseEther("0.1"),
      },
      {
        token0: cake as unknown as IERC20,
        token1: wbnb as unknown as IERC20,
        amount0desired: ethers.utils.parseEther("0.1"),
        amount1desired: ethers.utils.parseEther("1"),
      },
      {
        token0: baseToken as unknown as IERC20,
        token1: wbnb as unknown as IERC20,
        amount0desired: ethers.utils.parseEther("1"),
        amount1desired: ethers.utils.parseEther("1"),
      },
      {
        token0: farmToken as unknown as IERC20,
        token1: wbnb as unknown as IERC20,
        amount0desired: ethers.utils.parseEther("1"),
        amount1desired: ethers.utils.parseEther("1"),
      },
    ]);

    // Contract signer
    baseTokenAsDeltaNet = MockERC20__factory.connect(baseToken.address, deltaNet);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmTokenAsDeltaNet = MockERC20__factory.connect(farmToken.address, deltaNet);

    lpAsDeltaNet = PancakePair__factory.connect(lp.address, deltaNet);
    lpAsBob = PancakePair__factory.connect(lp.address, bob);

    pancakeMasterChefAsDeltaNet = PancakeMasterChef__factory.connect(masterChef.address, deltaNet);
    pancakeMasterChefAsBob = PancakeMasterChef__factory.connect(masterChef.address, bob);

    vaultAsDeltaNet = Vault__factory.connect(vault.address, deltaNet);
    vaultAsBob = Vault__factory.connect(vault.address, bob);
    vaultAsEve = Vault__factory.connect(vault.address, eve);

    deltaNeutralWorkerAsDeployer = DeltaNeutralPancakeWorker02__factory.connect(deltaNeutralWorker.address, deployer);
    deltaNeutralWorkerAsBob = DeltaNeutralPancakeWorker02__factory.connect(deltaNeutralWorker.address, bob);
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
  });

  context("when worker is initialized", async () => {
    it("should has FTOKEN as a farmingToken in DeltaNeutralPancakeWorker", async () => {
      expect(await deltaNeutralWorker.farmingToken()).to.be.equal(farmToken.address);
    });

    it("should give rewards out when you stake LP tokens", async () => {
      // Deployer sends some LP tokens to DeltaNet and Bob
      await lp.transfer(deltaNetAddress, ethers.utils.parseEther("0.05"));
      await lp.transfer(bobAddress, ethers.utils.parseEther("0.05"));

      // DeltaNet and Bob stake 0.01 LP tokens and waits for 1 day
      await lpAsDeltaNet.approve(masterChef.address, ethers.utils.parseEther("0.01"));
      await lpAsBob.approve(masterChef.address, ethers.utils.parseEther("0.02"));
      await pancakeMasterChefAsDeltaNet.deposit(POOL_ID, ethers.utils.parseEther("0.01"));
      await pancakeMasterChefAsBob.deposit(POOL_ID, ethers.utils.parseEther("0.02")); // DeltaNet +1 Reward

      // DeltaNet and Bob withdraw stake from the pool
      await pancakeMasterChefAsBob.withdraw(POOL_ID, ethers.utils.parseEther("0.02")); // DeltaNet +1/3 Reward  Bob + 2/3 Reward
      await pancakeMasterChefAsDeltaNet.withdraw(POOL_ID, ethers.utils.parseEther("0.01")); // delta net +1 Reward

      AssertHelpers.assertAlmostEqual(
        (await cake.balanceOf(deltaNetAddress)).toString(),
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
          deltaNeutralWorker.setReinvestConfig(250, ethers.utils.parseEther("1"), [cake.address, baseToken.address])
        )
          .to.be.emit(deltaNeutralWorker, "SetReinvestConfig")
          .withArgs(deployerAddress, 250, ethers.utils.parseEther("1"), [cake.address, baseToken.address]);
        expect(await deltaNeutralWorker.reinvestBountyBps()).to.be.eq(250);
        expect(await deltaNeutralWorker.reinvestThreshold()).to.be.eq(ethers.utils.parseEther("1"));
        expect(await deltaNeutralWorker.getReinvestPath()).to.deep.eq([cake.address, baseToken.address]);
      });

      it("should revert when owner set reinvestBountyBps > max", async () => {
        await expect(
          deltaNeutralWorker.setReinvestConfig(2001, "0", [cake.address, baseToken.address])
        ).to.be.revertedWith("DeltaNeutralPancakeWorker02_ExceedReinvestBounty()");
        expect(await deltaNeutralWorker.reinvestBountyBps()).to.be.eq(100);
      });

      it("should revert when owner set reinvest path that doesn't start with $CAKE and end with $BTOKN", async () => {
        await expect(
          deltaNeutralWorker.setReinvestConfig(200, "0", [baseToken.address, cake.address])
        ).to.be.revertedWith("DeltaNeutralPancakeWorker02_InvalidReinvestPath()");
      });
    });

    describe("#setMaxReinvestBountyBps", async () => {
      it("should set max reinvest bounty", async () => {
        await deltaNeutralWorker.setMaxReinvestBountyBps(200);
        expect(await deltaNeutralWorker.maxReinvestBountyBps()).to.be.eq(200);
      });

      it("should revert when new max reinvest bounty over 30%", async () => {
        await expect(deltaNeutralWorker.setMaxReinvestBountyBps("3001")).to.be.revertedWith(
          "DeltaNeutralPancakeWorker02_ExceedReinvestBps()"
        );
        expect(await deltaNeutralWorker.maxReinvestBountyBps()).to.be.eq(MAX_REINVEST_BOUNTY);
      });
    });

    describe("#setTreasuryConfig", async () => {
      it("should successfully set a treasury account", async () => {
        await deltaNeutralWorker.setTreasuryConfig(deltaNetAddress, REINVEST_BOUNTY_BPS);
        expect(await deltaNeutralWorker.treasuryAccount()).to.eq(deltaNetAddress);
      });

      it("should successfully set a treasury bounty", async () => {
        await deltaNeutralWorker.setTreasuryConfig(DEPLOYER, 499);
        expect(await deltaNeutralWorker.treasuryBountyBps()).to.eq(499);
      });

      it("should revert when a new treasury bounty > max reinvest bounty bps", async () => {
        await expect(deltaNeutralWorker.setTreasuryConfig(DEPLOYER, parseInt(MAX_REINVEST_BOUNTY) + 1)).to.revertedWith(
          "ExceedReinvestBounty()"
        );
        expect(await deltaNeutralWorker.treasuryBountyBps()).to.eq(REINVEST_BOUNTY_BPS);
      });
    });

    describe("#setStrategyOk", async () => {
      it("should set strat ok", async () => {
        await deltaNeutralWorker.setStrategyOk([deltaNetAddress], true);
        expect(await deltaNeutralWorker.okStrats(deltaNetAddress)).to.be.eq(true);
      });
    });

    describe("#setWhitelistedCallers", async () => {
      it("should set whitelisted callers", async () => {
        await expect(deltaNeutralWorker.setWhitelistedCallers([deployerAddress], true)).to.emit(
          deltaNeutralWorker,
          "SetWhitelistedCallers"
        );
        expect(await deltaNeutralWorker.whitelistCallers(deployerAddress)).to.be.eq(true);
      });
    });

    describe("#setPriceOracle", async () => {
      it("should set price oracle", async () => {
        const oldPriceOracleAddress = await deltaNeutralWorker.priceOracle();
        const [newPriceOracle] = await deployHelper.deployDeltaNeutralOracle(
          [baseToken.address, farmToken.address],
          [ethers.utils.parseEther("1"), ethers.utils.parseEther("200")],
          [18, 18],
          busd.address
        );
        await deltaNeutralWorker.setPriceOracle(newPriceOracle.address);
        const newPriceOracleAddress = await deltaNeutralWorker.priceOracle();
        expect(newPriceOracleAddress).not.be.eq(oldPriceOracleAddress);
        expect(newPriceOracleAddress).to.be.eq(newPriceOracle.address);
      });
    });

    context("#setRewardPath", async () => {
      beforeEach(async () => {
        const rewardPath = [cake.address, wbnb.address, baseToken.address];
        // set beneficialVaultConfig
        await deltaNeutralWorkerAsDeployer.setBeneficialVaultConfig(
          BENEFICIALVAULT_BOUNTY_BPS,
          vault.address,
          rewardPath
        );
      });

      it("should revert", async () => {
        const rewardPath = [cake.address, farmToken.address, farmToken.address];
        await expect(deltaNeutralWorkerAsDeployer.setRewardPath(rewardPath)).to.revertedWith(
          "DeltaNeutralPancakeWorker02_InvalidReinvestPath()"
        );
      });

      it("should be able to set new rewardpath", async () => {
        const rewardPath = [cake.address, farmToken.address, baseToken.address];
        await expect(deltaNeutralWorkerAsDeployer.setRewardPath(rewardPath))
          .to.emit(deltaNeutralWorker, "SetRewardPath")
          .withArgs(deployerAddress, rewardPath);
      });
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

      // Whitelist Bob to unit test worker
      await deltaNeutralWorker.setWhitelistedCallers([bob.address], true);
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
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("0.3"));
        await _updatePrice();
        await vaultAsBob.work(
          0,
          deltaNeutralWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        await _updatePrice();
        const healthPosition1Before = await deltaNeutralWorker.health(1);

        // Upgrade worker to migrate to MasterChefV2
        const DeltaNeutralPancakeWorker02Migrate = (await ethers.getContractFactory(
          "DeltaNeutralPancakeWorker02Migrate",
          deployer
        )) as DeltaNeutralPancakeWorker02Migrate__factory;
        const deltaNeutralPancakeWorker02Migrate = (await upgrades.upgradeProxy(
          deltaNeutralWorker.address,
          DeltaNeutralPancakeWorker02Migrate
        )) as DeltaNeutralPancakeWorker02Migrate;
        await deltaNeutralPancakeWorker02Migrate.deployed();

        const healthBeforeMigrateLp = await deltaNeutralWorker.health(1);

        // Open Position #2 before migrateLp
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("0.3"));
        await _updatePrice();
        await vaultAsBob.work(
          0,
          deltaNeutralWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const healthPosition2Before = await deltaNeutralWorker.health(2);

        await deltaNeutralPancakeWorker02Migrate.migrateLP(masterChefV2.address, 1);

        // Open Position #3 after migrateLp
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("0.3"));
        await _updatePrice();
        await vaultAsBob.work(
          0,
          deltaNeutralWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const healthPosition3Before = await deltaNeutralWorker.health(3);

        // Upgrade to non-migrate version that support MasterChefV2
        const DeltaNeutralPancakeMCV2Worker02 = (await ethers.getContractFactory(
          "DeltaNeutralPancakeMCV2Worker02",
          deployer
        )) as DeltaNeutralPancakeMCV2Worker02__factory;
        const deltaNeutralPancakeMCV2Worker02 = (await upgrades.upgradeProxy(
          deltaNeutralWorker.address,
          DeltaNeutralPancakeMCV2Worker02
        )) as DeltaNeutralPancakeMCV2Worker02;
        await deltaNeutralPancakeMCV2Worker02.deployed();

        // Open Position #4 after upgrade to non-migrate version
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("0.3"));
        await _updatePrice();
        await vaultAsBob.work(
          0,
          deltaNeutralWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const healthPosition4Before = await deltaNeutralWorker.health(4);

        const [oldMasterChefBalance] = await masterChef.userInfo(1, deltaNeutralWorker.address);
        const [masterChefV2Balance, ,] = await masterChefV2.userInfo(1, deltaNeutralWorker.address);
        expect(oldMasterChefBalance).to.be.eq(0);
        expect(masterChefV2Balance).to.be.gt(0);

        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        await deltaNeutralWorkerAsBob.reinvest();
        await vault.deposit(0); // Random action to trigger interest computation

        await _updatePrice();
        const healthPosition1After = await deltaNeutralWorker.health(1);
        const healthPosition2After = await deltaNeutralWorker.health(2);
        const healthPosition3After = await deltaNeutralWorker.health(3);
        const healthPosition4After = await deltaNeutralWorker.health(4);

        expect(healthPosition1After).to.be.gt(healthPosition1Before);
        expect(healthPosition2After).to.be.gt(healthPosition2Before);
        expect(healthPosition3After).to.be.gt(healthPosition3Before);
        expect(healthPosition4After).to.be.gt(healthPosition4Before);
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
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("0.3"));
        await vaultAsBob.work(
          0,
          deltaNeutralWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        // Upgrade worker to migrate to MasterChefV2
        const DeltaNeutralPancakeWorker02Migrate = (await ethers.getContractFactory(
          "DeltaNeutralPancakeWorker02Migrate",
          deployer
        )) as DeltaNeutralPancakeWorker02Migrate__factory;
        const deltaNeutralPancakeWorker02Migrate = (await upgrades.upgradeProxy(
          deltaNeutralWorker.address,
          DeltaNeutralPancakeWorker02Migrate
        )) as DeltaNeutralPancakeWorker02Migrate;
        await deltaNeutralPancakeWorker02Migrate.deployed();

        // Migrate LP with wrong pool id
        await expect(deltaNeutralPancakeWorker02Migrate.migrateLP(masterChefV2.address, 2)).to.be.revertedWith(
          "!LP Token"
        );
      });
    });

    context("when Bob try to migrate pool", async () => {
      it("should revert", async () => {
        // Upgrade worker to migrate to MasterChefV2
        const DeltaNeutralPancakeWorker02Migrate = (await ethers.getContractFactory(
          "DeltaNeutralPancakeWorker02Migrate",
          deployer
        )) as DeltaNeutralPancakeWorker02Migrate__factory;
        const deltaNeutralPancakeWorker02Migrate = (await upgrades.upgradeProxy(
          deltaNeutralWorker.address,
          DeltaNeutralPancakeWorker02Migrate
        )) as DeltaNeutralPancakeWorker02Migrate;
        await deltaNeutralPancakeWorker02Migrate.deployed();

        // Bob try to migrate LP
        await expect(
          deltaNeutralPancakeWorker02Migrate.connect(bob).migrateLP(masterChefV2.address, 1)
        ).to.be.revertedWith("!D");
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
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("0.3"));
        await vaultAsBob.work(
          0,
          deltaNeutralWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        // Upgrade worker to migrate to MasterChefV2
        const DeltaNeutralPancakeWorker02Migrate = (await ethers.getContractFactory(
          "DeltaNeutralPancakeWorker02Migrate",
          deployer
        )) as DeltaNeutralPancakeWorker02Migrate__factory;
        const deltaNeutralPancakeWorker02Migrate = (await upgrades.upgradeProxy(
          deltaNeutralWorker.address,
          DeltaNeutralPancakeWorker02Migrate
        )) as DeltaNeutralPancakeWorker02Migrate;
        await deltaNeutralPancakeWorker02Migrate.deployed();

        // Migrate LP 1st time successfully
        await deltaNeutralPancakeWorker02Migrate.migrateLP(masterChefV2.address, 1);

        await expect(deltaNeutralPancakeWorker02Migrate.migrateLP(masterChefV2.address, 1)).to.be.revertedWith(
          "!MasterChefV2"
        );
      });
    });
  });
});
