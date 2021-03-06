import { ethers, network, upgrades, waffle } from "hardhat";
import { constants, BigNumber, utils, providers } from "ethers";
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
  DeltaNeutralPancakeMCV2Worker02,
  DeltaNeutralPancakeMCV2Worker02__factory,
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
  MasterChefV2,
  MasterChefV2__factory,
  PancakeswapV2MCV2Worker02,
} from "../../../../../typechain";
import * as AssertHelpers from "../../../../helpers/assert";
import * as TimeHelpers from "../../../../helpers/time";
import { parseEther } from "ethers/lib/utils";
import { DeployHelper } from "../../../../helpers/deploy";
import { SwapHelper } from "../../../../helpers/swap";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
const { expect } = chai;

describe("Vault - DeltaNetPancakeWorker02MCV2", () => {
  const FOREVER = "2000000000";
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther("5000");
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther("40");
  const CAKE_RATE_TOTAL_PRECISION = BigNumber.from(1e12);
  const CAKE_RATE_TO_REGULAR_FARM = BigNumber.from(62847222222);
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
  let deltaNeutralWorker: DeltaNeutralPancakeMCV2Worker02;

  /// Timelock instance(s)
  let whitelistedContract: MockContractContext;
  let evilContract: MockContractContext;

  let priceOracle: DeltaNeutralOracle;
  let chainlink: ChainLinkPriceOracle;

  // Accounts
  let deployer: SignerWithAddress;
  let deltaNet: SignerWithAddress;
  let bob: SignerWithAddress;
  let eve: SignerWithAddress;

  let deployerAddress: string;
  let deltaNetAddress: string;
  let bobAddress: string;
  let eveAddress: string;

  // Contract Signer
  let baseTokenAsDeltaNet: MockERC20;
  let baseTokenAsBob: MockERC20;

  let farmTokenAsDeltaNet: MockERC20;

  let lpAsDeltaNet: PancakePair;
  let lpAsBob: PancakePair;

  let pancakeMasterChefAsDeltaNet: MasterChefV2;
  let pancakeMasterChefAsBob: MasterChefV2;

  let deltaNeutralWorkerAsDeployer: DeltaNeutralPancakeMCV2Worker02;
  let deltaNeutralWorkerAsBob: DeltaNeutralPancakeMCV2Worker02;
  let deltaNeutralWorkerAsEve: DeltaNeutralPancakeMCV2Worker02;

  let chainLinkOracleAsDeployer: ChainLinkPriceOracle;

  let MockAggregatorV3Factory: MockAggregatorV3__factory;

  let vaultAsDeltaNet: Vault;
  let vaultAsBob: Vault;
  let vaultAsEve: Vault;

  // Test Helper
  let swapHelper: SwapHelper;
  let deployHelper: DeployHelper;

  async function fixture() {
    [deployer, deltaNet, bob, eve] = await ethers.getSigners();
    deltaNet = deltaNet;
    [deployerAddress, deltaNetAddress, bobAddress, eveAddress] = await Promise.all([
      deployer.getAddress(),
      deltaNet.getAddress(),
      bob.getAddress(),
      eve.getAddress(),
    ]);
    deltaNetAddress = deltaNetAddress;
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
    [farmToken] = await deployHelper.deployBEP20([
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
      { address: deltaNetAddress, amount: ethers.utils.parseEther("1000") },
      { address: bobAddress, amount: ethers.utils.parseEther("1000") },
    ]);

    baseToken = cake as any as MockERC20;

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

    /// Setup DeltaNeutralPancakeMCV2Worker02
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

    [masterChefV2] = await deployHelper.deployPancakeMasterChefV2(masterChef);
    await masterChefV2.add(1, lp.address, true, true);

    deltaNeutralWorker = await deployHelper.deployDeltaNeutralPancakeMCV2Worker02(
      vault,
      baseToken,
      masterChefV2,
      routerV2,
      POOL_ID,
      WORK_FACTOR,
      KILL_FACTOR,
      addStrat,
      REINVEST_BOUNTY_BPS,
      [bobAddress, eveAddress],
      DEPLOYER,
      [cake.address],
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

    pancakeMasterChefAsDeltaNet = MasterChefV2__factory.connect(masterChefV2.address, deltaNet);
    pancakeMasterChefAsBob = MasterChefV2__factory.connect(masterChefV2.address, bob);

    vaultAsDeltaNet = Vault__factory.connect(vault.address, deltaNet);
    vaultAsBob = Vault__factory.connect(vault.address, bob);
    vaultAsEve = Vault__factory.connect(vault.address, eve);

    deltaNeutralWorkerAsDeployer = DeltaNeutralPancakeMCV2Worker02__factory.connect(
      deltaNeutralWorker.address,
      deployer
    );

    deltaNeutralWorkerAsBob = DeltaNeutralPancakeMCV2Worker02__factory.connect(deltaNeutralWorker.address, bob);
    deltaNeutralWorkerAsEve = DeltaNeutralPancakeMCV2Worker02__factory.connect(deltaNeutralWorker.address, eve);
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
      const deltaNetCakeBefore = await cake.balanceOf(deltaNetAddress);
      const bobCakeBefore = await cake.balanceOf(bobAddress);

      // Deployer sends some LP tokens to DeltaNet and Bob
      await lp.transfer(deltaNetAddress, ethers.utils.parseEther("0.05"));
      await lp.transfer(bobAddress, ethers.utils.parseEther("0.05"));

      // DeltaNet and Bob stake 0.01 LP tokens and waits for 1 day
      await lpAsDeltaNet.approve(masterChefV2.address, ethers.utils.parseEther("0.01"));
      await lpAsBob.approve(masterChefV2.address, ethers.utils.parseEther("0.02"));
      await pancakeMasterChefAsDeltaNet.deposit(POOL_ID, ethers.utils.parseEther("0.01"));
      await pancakeMasterChefAsBob.deposit(POOL_ID, ethers.utils.parseEther("0.02")); // DeltaNet +1 Reward

      // DeltaNet and Bob withdraw stake from the pool
      await pancakeMasterChefAsBob.withdraw(POOL_ID, ethers.utils.parseEther("0.02")); // DeltaNet +1/3 Reward  Bob + 2/3 Reward
      await pancakeMasterChefAsDeltaNet.withdraw(POOL_ID, ethers.utils.parseEther("0.01")); // delta net +1 Reward

      const deltaNetCakeAfter = await cake.balanceOf(deltaNetAddress);
      const bobCakeAfter = await cake.balanceOf(bobAddress);

      AssertHelpers.assertAlmostEqual(
        deltaNetCakeAfter.sub(deltaNetCakeBefore).toString(),
        CAKE_REWARD_PER_BLOCK.mul(BigNumber.from(7))
          .div(BigNumber.from(3))
          .mul(CAKE_RATE_TO_REGULAR_FARM)
          .div(CAKE_RATE_TOTAL_PRECISION)
          .toString()
      );
      AssertHelpers.assertAlmostEqual(
        bobCakeAfter.sub(bobCakeBefore).toString(),
        CAKE_REWARD_PER_BLOCK.mul(2).div(3).mul(CAKE_RATE_TO_REGULAR_FARM).div(CAKE_RATE_TOTAL_PRECISION).toString()
      );
    });
  });

  context("when owner is setting worker", async () => {
    describe("#reinvestConfig", async () => {
      it("should set reinvest config correctly", async () => {
        await expect(deltaNeutralWorker.setReinvestConfig(250, ethers.utils.parseEther("1"), [cake.address]))
          .to.be.emit(deltaNeutralWorker, "SetReinvestConfig")
          .withArgs(deployerAddress, 250, ethers.utils.parseEther("1"), [cake.address]);
        expect(await deltaNeutralWorker.reinvestBountyBps()).to.be.eq(250);
        expect(await deltaNeutralWorker.reinvestThreshold()).to.be.eq(ethers.utils.parseEther("1"));
        expect(await deltaNeutralWorker.getReinvestPath()).to.deep.eq([cake.address]);
      });

      it("should revert when owner set reinvestBountyBps > max", async () => {
        await expect(deltaNeutralWorker.setReinvestConfig(2001, "0", [cake.address])).to.be.revertedWith(
          "DeltaNeutralPancakeMCV2Worker02_ExceedReinvestBounty()"
        );
        expect(await deltaNeutralWorker.reinvestBountyBps()).to.be.eq(100);
      });

      it("should revert when owner set reinvest path that doesn't start with $CAKE and end with $BTOKN", async () => {
        await expect(deltaNeutralWorker.setReinvestConfig(200, "0", [farmToken.address])).to.be.revertedWith(
          "DeltaNeutralPancakeMCV2Worker02_InvalidReinvestPath()"
        );
      });
    });

    describe("#setMaxReinvestBountyBps", async () => {
      it("should set max reinvest bounty", async () => {
        await deltaNeutralWorker.setMaxReinvestBountyBps(200);
        expect(await deltaNeutralWorker.maxReinvestBountyBps()).to.be.eq(200);
      });

      it("should revert when new max reinvest bounty over 30%", async () => {
        await expect(deltaNeutralWorker.setMaxReinvestBountyBps("3001")).to.be.revertedWith(
          "DeltaNeutralPancakeMCV2Worker02_ExceedReinvestBps()"
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
          "DeltaNeutralPancakeMCV2Worker02_InvalidReinvestPath()"
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
                deltaNeutralWorker.address,
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
              deltaNeutralWorker.address,
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
        expect(worker).to.be.eq(deltaNeutralWorker.address);
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

    context("when user is not in whitelisted callers", async () => {
      it("should not allow to open a position", async () => {
        // Deployer deposits 3 BTOKEN to the bank
        const deposit = ethers.utils.parseEther("3");
        await baseToken.approve(vault.address, deposit);
        await vault.deposit(deposit);
        // Now DeltaNet can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
        const loan = ethers.utils.parseEther("1");
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("1"));
        await expect(
          vaultAsBob.work(
            0,
            deltaNeutralWorker.address,
            ethers.utils.parseEther("1"),
            loan,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          )
        ).to.be.revertedWith("DeltaNeutralPancakeMCV2Worker02_NotWhitelistedCaller()");
      });
    });
  });

  context("when user DeltaNet uses LYF", async () => {
    context("#work", async () => {
      it("should allow to open a position without debt", async () => {
        // Deployer deposits 3 BTOKEN to the bank
        await baseToken.approve(vault.address, ethers.utils.parseEther("3"));
        await vault.deposit(ethers.utils.parseEther("3"));
        // DeltaNet can take 0 debt ok
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("0.3"));
        await vaultAsDeltaNet.work(
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
      });

      it("should not allow to open a position with debt less than MIN_DEBT_SIZE", async () => {
        // Deployer deposits 3 BTOKEN to the bank
        await baseToken.approve(vault.address, ethers.utils.parseEther("3"));
        await vault.deposit(ethers.utils.parseEther("3"));
        // DeltaNet cannot take 0.3 debt because it is too small
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("0.3"));
        await expect(
          vaultAsDeltaNet.work(
            0,
            deltaNeutralWorker.address,
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
        // adjust work factor lower
        await simpleVaultConfig.setWorker(deltaNeutralWorker.address, true, true, "1", KILL_FACTOR, false, true);
        // Deployer deposits 3 BTOKEN to the bank
        await baseToken.approve(vault.address, ethers.utils.parseEther("3"));
        await vault.deposit(ethers.utils.parseEther("3"));
        // DeltaNet cannot take 1 BTOKEN loan because she only put 0.3 BTOKEN as a collateral
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("0.3"));
        await expect(
          vaultAsDeltaNet.work(
            0,
            deltaNeutralWorker.address,
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
        // DeltaNet cannot take 1 BTOKEN loan because the contract does not have it
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("1"));
        await expect(
          vaultAsDeltaNet.work(
            0,
            deltaNeutralWorker.address,
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
        // Now DeltaNet can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
        const loan = ethers.utils.parseEther("1");
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsDeltaNet.work(
          0,
          deltaNeutralWorker.address,
          ethers.utils.parseEther("1"),
          loan,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        // health calculation
        // lp balance = 0.231205137369691323
        // lp price = 28.299236836137312801
        // lp balance in dollar = 6.542928940156556263
        // base token price = 1.0
        // lp balance in dollar / base token price
        // 6.542928940156556263 / 1.0 = 6.542928940156556263
        const expectedHealth = ethers.utils.parseEther("6.542928940156556263");
        expect(await deltaNeutralWorker.health(1)).to.be.eq(expectedHealth);
        // Bob comes and trigger reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        let bobCakeBefore = await cake.balanceOf(bobAddress);
        await deltaNeutralWorkerAsBob.reinvest();
        let bobCakeAfter = await cake.balanceOf(bobAddress);
        AssertHelpers.assertAlmostEqual(
          CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_REGULAR_FARM)
            .div(CAKE_RATE_TOTAL_PRECISION)
            .mul("2")
            .mul(REINVEST_BOUNTY_BPS)
            .div("10000")
            .toString(),
          bobCakeAfter.sub(bobCakeBefore).toString()
        );
        await vault.deposit(0); // Random action to trigger interest computation
        await _updatePrice();
        const healthDebt = await vault.positionInfo("1");
        expect(healthDebt[0]).to.be.above(expectedHealth);
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

      it("should revert if price outdated", async () => {
        // Deployer deposits 3 BTOKEN to the bank
        const deposit = ethers.utils.parseEther("3");
        await baseToken.approve(vault.address, deposit);
        await vault.deposit(deposit);
        // Now DeltaNet can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
        const loan = ethers.utils.parseEther("1");
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("1"));
        await TimeHelpers.increase(TimeHelpers.duration.minutes(ethers.BigNumber.from("1440")));
        await expect(
          vaultAsDeltaNet.work(
            0,
            deltaNeutralWorker.address,
            ethers.utils.parseEther("1"),
            loan,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          )
        ).to.be.revertedWith("DeltaNeutralPancakeMCV2Worker02_UnTrustedPrice()");
      });

      it("should has correct interest rate growth", async () => {
        // Deployer deposits 3 BTOKEN to the bank
        const deposit = ethers.utils.parseEther("3");
        await baseToken.approve(vault.address, deposit);
        await vault.deposit(deposit);
        // Now DeltaNet can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
        const loan = ethers.utils.parseEther("1");
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsDeltaNet.work(
          0,
          deltaNeutralWorker.address,
          ethers.utils.parseEther("1"),
          loan,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        await deltaNeutralWorkerAsBob.reinvest();
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
    });

    context("#kill", async () => {
      it("should not allow user not whitelisted to liquidate", async () => {
        await expect(vaultAsEve.kill("1")).to.be.revertedWith("!whitelisted liquidator");
      });

      it("should not liquidate healthy position", async () => {
        // Deployer deposits 3 BTOKEN to the bank
        const deposit = ethers.utils.parseEther("3");
        await baseToken.approve(vault.address, deposit);
        await vault.deposit(deposit);
        // Now DeltaNet can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
        const loan = ethers.utils.parseEther("1");
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsDeltaNet.work(
          0,
          deltaNeutralWorker.address,
          ethers.utils.parseEther("1"),
          loan,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        await _updatePrice();
        await deltaNeutralWorkerAsBob.reinvest();
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
        // Now bob try kill the position
        await _updatePrice();
        await expect(vaultAsBob.kill("1")).to.be.revertedWith("can't liquidate");
      });

      it("should not allow user to liquidate bad position", async () => {
        // Bob deposits 20 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("20"));
        await vaultAsBob.deposit(ethers.utils.parseEther("20"));
        // Position#1: DeltaNet borrows 10 BTOKEN loan
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsDeltaNet.work(
          0,
          deltaNeutralWorker.address,
          ethers.utils.parseEther("10"),
          ethers.utils.parseEther("10"),
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        // Price swing 10%
        // Feed new price from 200 for 20% to make lp price down ~10%
        // 200 * (1 - 0.2) = 160
        let mockAggregatorV3 = await MockAggregatorV3Factory.deploy(ethers.utils.parseEther("160"), 18);
        await mockAggregatorV3.deployed();
        await chainLinkOracleAsDeployer.setPriceFeeds([farmToken.address], [busd.address], [mockAggregatorV3.address]);
        await expect(vaultAsBob.kill("1")).to.be.revertedWith("can't liquidate");

        // Price swing 20%
        // Feed new price from 160 for 40% to make lp price down ~20%
        // 160 * (1 - 0.4) = 96
        mockAggregatorV3 = await MockAggregatorV3Factory.deploy(ethers.utils.parseEther("96"), 18);
        await mockAggregatorV3.deployed();
        await chainLinkOracleAsDeployer.setPriceFeeds([farmToken.address], [busd.address], [mockAggregatorV3.address]);
        await expect(vaultAsBob.kill("1")).to.be.revertedWith("can't liquidate");

        // Price swing 23.43%
        // Feed new price from 96 for 46.86% to make lp price down ~23.43%
        // 96 * (1 - 0.4686) = 51.0144
        mockAggregatorV3 = await MockAggregatorV3Factory.deploy(ethers.utils.parseEther("51.0144"), 18);
        await mockAggregatorV3.deployed();
        await chainLinkOracleAsDeployer.setPriceFeeds([farmToken.address], [busd.address], [mockAggregatorV3.address]);
        await expect(vaultAsBob.kill("1")).to.be.revertedWith("can't liquidate");

        // Price swing 30%
        // Feed new price from 96 for 60% to make lp price down ~23.43%
        // 51.0144 * (1 - 0.6) = 20.40576
        mockAggregatorV3 = await MockAggregatorV3Factory.deploy(ethers.utils.parseEther("20.40576"), 18);
        await mockAggregatorV3.deployed();
        await chainLinkOracleAsDeployer.setPriceFeeds([farmToken.address], [busd.address], [mockAggregatorV3.address]);

        // Now you can liquidate because of the price fluctuation
        const bobBefore = await baseToken.balanceOf(bobAddress);
        await expect(vaultAsBob.kill("1")).to.be.revertedWith("DeltaNeutralPancakeMCV2Worker02_NotAllowToLiquidate()");
        expect(await baseToken.balanceOf(bobAddress)).to.be.eq(bobBefore);
      });
    });

    context("#deposit-#withdraw", async () => {
      it("should deposit and withdraw BTOKEN from Vault (bad debt case)", async () => {
        // Deployer deposits 10 BTOKEN to the Vault
        const deposit = ethers.utils.parseEther("10");
        await baseToken.approve(vault.address, deposit);
        await vault.deposit(deposit);

        expect(await vault.balanceOf(deployerAddress)).to.be.equal(deposit);

        // DeltaNet borrows 2 BTOKEN loan
        const loan = ethers.utils.parseEther("2");
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsDeltaNet.work(
          0,
          deltaNeutralWorker.address,
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

        // DeltaNet deposits 2 BTOKEN
        const depositAmount = ethers.utils.parseEther("2");
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("2"));
        await vaultAsDeltaNet.deposit(depositAmount);

        AssertHelpers.assertAlmostEqual(
          deposit.sub(loan).add(depositAmount).toString(),
          (await baseToken.balanceOf(vault.address)).toString()
        );

        // check DeltaNet ibBTOKEN balance = 2/10 * 10 = 2 ibBTOKEN
        AssertHelpers.assertAlmostEqual(depositAmount.toString(), (await vault.balanceOf(deltaNetAddress)).toString());
        AssertHelpers.assertAlmostEqual(deposit.add(depositAmount).toString(), (await vault.totalSupply()).toString());

        // Price swing to 1$
        let mockAggregatorV3 = await MockAggregatorV3Factory.deploy(ethers.utils.parseEther("1"), 18);
        await mockAggregatorV3.deployed();
        await chainLinkOracleAsDeployer.setPriceFeeds([farmToken.address], [busd.address], [mockAggregatorV3.address]);

        // Bob try kill position
        await expect(vaultAsBob.kill("1")).to.be.revertedWith("DeltaNeutralPancakeMCV2Worker02_NotAllowToLiquidate()");
      });
    });

    context("#reinvest", async () => {
      it("should reinvest correctly", async () => {
        // Set interests to 0% per year for easy testing
        await simpleVaultConfig.setParams(
          ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
          "0", // 0% per year
          "1000", // 10% reserve pool
          "1000", // 10% Kill prize
          wbnb.address,
          wNativeRelayer.address,
          fairLaunch.address,
          "0",
          ethers.constants.AddressZero
        );
        // Set Reinvest bounty to 10% of the reward
        await deltaNeutralWorker.setReinvestConfig("100", "0", [cake.address]);

        const [path, reinvestPath] = await Promise.all([
          deltaNeutralWorker.getPath(),
          deltaNeutralWorker.getReinvestPath(),
        ]);
        // DeltaNet deposits 10 BTOKEN
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("30"));
        await vaultAsDeltaNet.deposit(ethers.utils.parseEther("30"));
        // Position#1: DeltaNet borrows 10 BTOKEN
        await swapHelper.loadReserves(path);
        let accumLp = BigNumber.from(0);
        let workerLpBefore = BigNumber.from(0);
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsDeltaNet.work(
          0,
          deltaNeutralWorker.address,
          ethers.utils.parseEther("10"),
          ethers.utils.parseEther("10"),
          "0", // max return = 0, don't return NATIVE to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        // Pre-compute expectation
        let [expectedLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(
          ethers.utils.parseEther("20"),
          path
        );
        accumLp = accumLp.add(expectedLp);

        // Expect
        let [workerLpAfter] = await masterChefV2.userInfo(POOL_ID, deltaNeutralWorker.address);

        expect(await deltaNeutralWorker.totalLpBalance(), "expected total Lp amount").to.be.eq(expectedLp);
        expect(
          await baseToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisBtoken} BTOKEN debris`
        ).to.be.eq(debrisBtoken);
        expect(
          await farmToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisFtoken} FTOKEN debris`
        ).to.be.eq(debrisFtoken);
        expect(workerLpAfter, `expect Worker to stake ${accumLp} LP`).to.be.eq(accumLp);
        // DeltaNet borrows another 2 BTOKEN
        [workerLpBefore] = await masterChefV2.userInfo(POOL_ID, deltaNeutralWorker.address);
        let bobCakeBefore = await cake.balanceOf(bobAddress);
        let eveCakeBefore = await cake.balanceOf(eveAddress);
        let deployerCakeBefore = await cake.balanceOf(DEPLOYER);
        await swapHelper.loadReserves(path);
        await swapHelper.loadReserves(reinvestPath);
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("1"));
        // DeltaNet add collateral more in position
        await vaultAsDeltaNet.work(
          1, // change from create new position
          deltaNeutralWorker.address,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("2"),
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        await deltaNeutralWorkerAsEve.reinvest();

        [workerLpAfter] = await masterChefV2.userInfo(POOL_ID, deltaNeutralWorker.address);
        let bobCakeAfter = await cake.balanceOf(bobAddress);
        let eveCakeAfter = await cake.balanceOf(eveAddress);
        let deployerCakeAfter = await cake.balanceOf(bobAddress);
        let totalRewards = swapHelper.computeTotalRewards(
          workerLpBefore,
          CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_REGULAR_FARM).div(CAKE_RATE_TOTAL_PRECISION),
          BigNumber.from(3)
        );
        let reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
        let reinvestLeft = totalRewards.sub(reinvestFees);

        let reinvestBtoken = reinvestLeft.add(debrisBtoken);
        let reinvestLp = BigNumber.from(0);
        [expectedLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(
          ethers.utils.parseEther("3"),
          path
        );
        [reinvestLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
        accumLp = accumLp.add(reinvestLp);
        accumLp = accumLp.add(expectedLp);
        // `expect DEPLOYER to get ${reinvestFees} CAKE as treasury fees`
        AssertHelpers.assertAlmostEqual(eveCakeAfter.sub(eveCakeBefore).toString(), reinvestFees.toString());
        expect(bobCakeAfter.sub(bobCakeBefore), `expect bob's CAKE to remain the same`).to.be.eq("0");
        AssertHelpers.assertAlmostEqual(workerLpAfter.toString(), accumLp.toString());
        expect(
          await baseToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisBtoken} BTOKEN debris`
        ).to.be.eq(debrisBtoken);
        expect(
          await farmToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisFtoken} FTOKEN debris`
        ).to.be.eq(debrisFtoken);
        // ---------------- Reinvest#1 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        let [workerLPBefore] = await masterChefV2.userInfo(POOL_ID, deltaNeutralWorker.address);
        deployerCakeBefore = await cake.balanceOf(DEPLOYER);
        bobCakeBefore = await cake.balanceOf(bobAddress);
        await swapHelper.loadReserves(path);
        await swapHelper.loadReserves(reinvestPath);
        await deltaNeutralWorkerAsBob.reinvest();
        deployerCakeAfter = await cake.balanceOf(DEPLOYER);
        bobCakeAfter = await cake.balanceOf(bobAddress);
        [workerLpAfter] = await masterChefV2.userInfo(POOL_ID, deltaNeutralWorker.address);
        totalRewards = swapHelper.computeTotalRewards(
          workerLPBefore,
          CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_REGULAR_FARM).div(CAKE_RATE_TOTAL_PRECISION),
          BigNumber.from(2)
        );
        reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
        reinvestLeft = totalRewards.sub(reinvestFees);

        reinvestBtoken = reinvestLeft.add(debrisBtoken);
        [reinvestLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
        accumLp = accumLp.add(reinvestLp);
        expect(deployerCakeAfter.sub(deployerCakeBefore), `expect DEPLOYER's CAKE to remain the same`).to.be.eq("0");
        // `expect bob to get ${reinvestFees}`
        // AssertHelpers.assertAlmostEqual(bobCakeAfter.sub(bobCakeBefore).toString(), reinvestFees.toString());
        AssertHelpers.assertAlmostEqual(workerLpAfter.toString(), accumLp.toString());
        // Check Position info
        await _updatePrice();
        let [vaultHealth, vaultDebtToShare] = await vault.positionInfo("1");
        // health calculation
        // lp balance =  1.590304505857081580
        // lp price =  28.3212463635829054858466
        // lp balance in dollar =  45.039405703494381116
        // base token price =  1.0
        // lp balance in dollar / base token price
        // 45.039405703494381116 / 1.0 = 45.039405703494381116

        const vaultExpectedHealth = ethers.utils.parseEther("45.039405703494381116");
        // expect(vaultHealth, `expect Position health = ${vaultExpectedHealth}`).to.be.eq(vaultExpectedHealth);
        AssertHelpers.assertAlmostEqual(vaultExpectedHealth.toString(), vaultHealth.toString());
        // now we got debt to share as 12 because DeltaNet barrow 10 and 2
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("12").toString(), vaultDebtToShare.toString());
      });
    });

    context("#partialclose", async () => {
      context("#liquidate", async () => {
        context("when maxReturn is lessDebt", async () => {
          // back cannot be less than lessDebt as less debt is Min(debt, back, maxReturn) = maxReturn
          it("should pay debt 'maxReturn' BTOKEN and return 'liquidatedAmount - maxReturn' BTOKEN to user", async () => {
            // Set interests to 0% per year for easy testing
            await simpleVaultConfig.setParams(
              ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
              "0", // 0% per year
              "1000", // 10% reserve pool
              "1000", // 10% Kill prize
              wbnb.address,
              wNativeRelayer.address,
              fairLaunch.address,
              "0",
              ethers.constants.AddressZero
            );
            const [path, reinvestPath] = await Promise.all([
              deltaNeutralWorker.getPath(),
              deltaNeutralWorker.getReinvestPath(),
            ]);

            // Set Reinvest bounty to 1% of the reward
            await deltaNeutralWorker.setReinvestConfig("100", "0", [cake.address]);

            // DeltaNet deposits 10 BTOKEN
            await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("10"));
            await vaultAsDeltaNet.deposit(ethers.utils.parseEther("10"));

            // Position: DeltaNet borrows 10 BTOKEN loan and supply another 10 BToken
            // Thus, DeltaNet's position value will be worth 20 BTOKEN
            // After calling `work()`
            // 20 BTOKEN needs to swap 3.587061715703192586 BTOKEN to FTOKEN
            // new reserve after swap will be 4.587061715703192586 0.021843151027158060
            // based on optimal swap formula, BTOKEN-FTOKEN to be added into the LP will be 16.412938284296807414 BTOKEN - 0.078156848972841940 FTOKEN
            // new reserve after adding liquidity 21.000000000000000000 BTOKEN - 0.100000000000000000 FTOKEN
            // lp amount from adding liquidity will be 1.131492691639043045 LP
            const borrowedAmount = ethers.utils.parseEther("10");
            const principalAmount = ethers.utils.parseEther("10");
            let [workerLpBefore] = await masterChefV2.userInfo(POOL_ID, deltaNeutralWorker.address);
            await swapHelper.loadReserves(path);
            await swapHelper.loadReserves(reinvestPath);
            await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("10"));
            await vaultAsDeltaNet.work(
              0,
              deltaNeutralWorker.address,
              principalAmount,
              borrowedAmount,
              "0", // max return = 0, don't return NATIVE to the debt
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
              )
            );

            let [workerLpAfter] = await masterChefV2.userInfo(POOL_ID, deltaNeutralWorker.address);
            const [expectedLp, debrisBtoken] = await swapHelper.computeOneSidedOptimalLp(
              borrowedAmount.add(principalAmount),
              path
            );
            expect(workerLpAfter.sub(workerLpBefore)).to.eq(expectedLp);
            const eveCakeBefore = await cake.balanceOf(eveAddress);
            const deltaNetBefore = await baseToken.balanceOf(deltaNetAddress);
            // health calculation
            // lp balance =  1.131492691639043045
            // lp price =  28.311959568634539084
            // lp balance in dollar =  32.034775337890054677
            // base token price =  1.0
            // lp balance in dollar / base token price
            // 32.034775337890054677 / 1.0 = 32.034775337890054677
            const [deltaNetHealthBefore] = await vault.positionInfo("1");
            expect(deltaNetHealthBefore).to.be.eq(ethers.utils.parseEther("32.034775337890054677"));
            const lpUnderPosition = await deltaNeutralWorker.totalLpBalance();
            const liquidatedLp = lpUnderPosition.div(2);
            const returnDebt = ethers.utils.parseEther("6");
            [workerLpBefore] = await masterChefV2.userInfo(POOL_ID, deltaNeutralWorker.address);
            // Pre-compute
            await swapHelper.loadReserves(path);
            await swapHelper.loadReserves(reinvestPath);
            // Compute reinvest
            const [reinvestFees, reinvestLp] = await swapHelper.computeReinvestLp(
              workerLpBefore,
              debrisBtoken,
              CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_REGULAR_FARM).div(CAKE_RATE_TOTAL_PRECISION),
              BigNumber.from(REINVEST_BOUNTY_BPS),
              reinvestPath,
              path,
              BigNumber.from(1)
            );

            await deltaNeutralWorkerAsEve.reinvest();

            // Compute liquidate
            const [btokenAmount, ftokenAmount] = await swapHelper.computeRemoveLiquidiy(
              baseToken.address,
              farmToken.address,
              liquidatedLp
            );
            const sellFtokenAmounts = await swapHelper.computeSwapExactTokensForTokens(
              ftokenAmount,
              await deltaNeutralWorker.getReversedPath(),
              true
            );
            const liquidatedBtoken = sellFtokenAmounts[sellFtokenAmounts.length - 1].add(btokenAmount).sub(returnDebt);
            const liquidatedBtokenWithSlippage = sellFtokenAmounts[sellFtokenAmounts.length - 1]
              .add(btokenAmount)
              .sub(returnDebt)
              .mul(9975)
              .div(10000);
            await vaultAsDeltaNet.work(
              1,
              deltaNeutralWorker.address,
              "0",
              "0",
              returnDebt,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [
                  partialCloseStrat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ["uint256", "uint256", "uint256"],
                    [liquidatedLp, returnDebt, liquidatedBtokenWithSlippage]
                  ),
                ]
              )
            );

            const deltaNetAfter = await baseToken.balanceOf(deltaNetAddress);
            const eveCakeAfter = await cake.balanceOf(eveAddress);
            AssertHelpers.assertAlmostEqual(eveCakeAfter.sub(eveCakeBefore).toString(), reinvestFees.toString());
            // `expect DeltaNet get ${liquidatedBtoken}`
            AssertHelpers.assertAlmostEqual(deltaNetAfter.sub(deltaNetBefore).toString(), liquidatedBtoken.toString());
            // Check position info
            const [deltaNetHealthAfter] = await vault.positionInfo("1");
            // DeltaNet's health after partial close position must be 50% less than before
            // due to he exit half of lp under his position
            // health calculation
            // lp balance =  0.6490266789
            // lp price =  28.32697690523333528408
            // lp balance in dollar = 18.384963744080591629
            // base token price =  1.0
            // lp balance in dollar / base token price
            // 16.499953412768116671 / 1.0 = 16.499953412768116671

            expect(deltaNetHealthAfter).to.be.eq(ethers.utils.parseEther("18.384963744080591629"));
            [workerLpAfter] = await masterChefV2.userInfo(POOL_ID, deltaNeutralWorker.address);
            // LP tokens + 0.010276168801924356 LP from reinvest of worker should be decreased by lpUnderPosition / 2
            // due to Bob execute StrategyClosePartialLiquidate
            AssertHelpers.assertAlmostEqual(
              workerLpAfter.toString(),
              workerLpBefore.add(reinvestLp).sub(lpUnderPosition.div(2)).toString()
            );
          });
        });

        context("when debt is lessDebt", async () => {
          // back cannot be less than lessDebt as less debt is Min(debt, back, maxReturn) = debt
          it("should pay back all debt and return 'liquidatedAmount - debt' BTOKEN to user", async () => {
            // Set interests to 0% per year for easy testing
            await simpleVaultConfig.setParams(
              ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
              "0", // 0% per year
              "1000", // 10% reserve pool
              "1000", // 10% Kill prize
              wbnb.address,
              wNativeRelayer.address,
              fairLaunch.address,
              "0",
              ethers.constants.AddressZero
            );
            // DeltaNet deposits 10 BTOKEN
            await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("10"));
            await vaultAsDeltaNet.deposit(ethers.utils.parseEther("10"));
            // Position: DeltaNet borrows 10 BTOKEN loan and supply another 10 BToken
            // Thus, DeltaNet's position value will be worth 20 BTOKEN
            // After calling `work()`
            // 20 BTOKEN needs to swap 3.587061715703192586 BTOKEN to FTOKEN
            // new reserve after swap will be 4.587061715703192586 0.021843151027158060
            // based on optimal swap formula, BTOKEN-FTOKEN to be added into the LP will be 16.412938284296807414 BTOKEN - 0.078156848972841940 FTOKEN
            // new reserve after adding liquidity 21.000000000000000000 BTOKEN - 0.100000000000000000 FTOKEN
            // lp amount from adding liquidity will be 1.214773024691848942 LP
            let [workerLPBefore] = await masterChefV2.userInfo(POOL_ID, deltaNeutralWorker.address);
            const borrowedAmount = ethers.utils.parseEther("10");
            const principalAmount = ethers.utils.parseEther("10");
            await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("10"));
            await vaultAsDeltaNet.work(
              0,
              deltaNeutralWorker.address,
              principalAmount,
              borrowedAmount,
              "0", // max return = 0, don't return BTOKEN to the debt
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
              )
            );

            await deltaNeutralWorkerAsEve.reinvest();
            let [workerLPAfter] = await masterChefV2.userInfo(POOL_ID, deltaNeutralWorker.address);
            expect(workerLPAfter.sub(workerLPBefore)).to.eq(parseEther("1.214773024691848942"));
            // DeltaNet think he made enough. He now wants to close position partially.
            // He close 50% of his position and return all debt
            const deltaNetBefore = await baseToken.balanceOf(deltaNetAddress);
            const [deltaNetHealthBefore] = await vault.positionInfo("1");
            const lpUnderPosition = await deltaNeutralWorker.totalLpBalance();
            [workerLPBefore] = await masterChefV2.userInfo(POOL_ID, deltaNeutralWorker.address);
            // DeltaNet think he made enough. He now wants to close position partially.
            // After calling `work()` then calling `reinvest()`
            // since 1 blocks have passed since approve and work now reward will be  2.513888888879999999 CAKE (reward)
            // reward without bounty will be  2.513888888879999999  - 0.025138888888799999 =~ 2.4887499999912 CAKE (reward - bounty)

            // 2.4887499999912 CAKE can be converted into:`
            // based on optimal swap formula, 2.4887499999912 BTOKEN needs to swap 1.211055739567025687 BTOKEN (Amount In for swapExactTokensForTokens)
            // new reserve after swap will be 22.211055739567025687 BTOKEN - 0.094560399082860293 FTOKEN (r0,r1 after swapExactTokensForTokens)

            // based on optimal swap formula, BTOKEN-FTOKEN to be added into the LP will be 1.277694260424174313 BTOKEN - 0.005439600917139707 FTOKEN (baseToken.myBalance() and farmingToken.myBalance() after swapExactTokensForTokens)
            // new reserve after adding liquidity receiving from `_reinvest()` is 23.488749999991200000 BTOKEN - 0.100000000000000000 FTOKEN (r0,r1 after addLiquidity)

            // more LP amount after executing add strategy will be 0.083280333052805897 LP (Output from addLiquidity())
            // accumulated LP of the worker will be 1.131492691639043045(LP Before reinvest) + 0.083280333052805897 = 1.214773024691848942 LP

            // DeltaNet close 50% of his position, thus he will close 1.214773024691848942 / 2 = 0.607386512345924471 LP
            // BTOKEN = (607386512345924471 * 23.488749999991200000) / 1531000790708686875;
            // FTOKEN = (607386512345924471 * 0.1) / 1531000790708686875;
            // 0.607386512345924471 LP will be converted into 9.31857777503565798555 BTOKEN - 0.03967251460822372057 FTOKEN

            // Reserve after remove liquidity
            // new reserve after remove liquidity will be (23.488749999991200000-9.31857777503565798555) = 14.17017222495554201445 BTOKEN | (0.1 - 0.03967251460822372057) = 0.06032748539177627943 FTOKEN
            // 0.03967251460822372057 FTOKEN will be converted into (0.03967251460822372057 * 0.9975 * 14.17017222495554201445) / (0.06032748539177627943 + 0.03967251460822372057 * 0.9975) = 5.61317670771444130 BTOKEN
            // thus, DeltaNet will receive 9.3185777750356579855 + 5.61317670771444130 = 14.93175448275009921 BTOKEN

            await vaultAsDeltaNet.work(
              1,
              deltaNeutralWorker.address,
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
                      lpUnderPosition.div(2),
                      ethers.utils.parseEther("5000000000"),
                      ethers.utils.parseEther("4.93175448275009921"),
                    ]
                  ),
                ]
              )
            );
            const deltaNetAfter = await baseToken.balanceOf(deltaNetAddress);

            // After DeltaNet liquidate half of his position which worth
            // 14.93175448275009921 BTOKEN (price impact+trading fee included)
            // DeltaNet wish to return 5,000,000,000 BTOKEN (when maxReturn > debt, return all debt)
            // The following criteria must be stratified:
            // - DeltaNet should get 984.931754482750099210 - 980.000000000000000000 = 4.93175448275009921 BTOKEN back.
            // - DeltaNet's position debt must be 0
            // "Expect BTOKEN in Bob's account after close position to increase by ~3.32 BTOKEN"
            AssertHelpers.assertAlmostEqual(
              deltaNetBefore.add(ethers.utils.parseEther("4.93175448275009921")).toString(),
              deltaNetAfter.toString()
            );
            // Check Bob position info
            const [deltaNetHealth, deltaNetDebtVal] = await vault.positionInfo("1");
            // DeltaNet's health after partial close position must be 50% less than before
            // due to he exit half of lp under his position
            // health calculation
            // lp balance =  0.576022514621445879
            // lp price =  28.325952106647866799
            // lp balance in dollar =  16.316386161517946552
            // base token price =  1.0
            // lp balance in dollar / base token price
            // 16.316386161517946552 / 1.0 = 16.316386161517946552
            expect(deltaNetHealth).to.be.eq(ethers.utils.parseEther("17.206009220763746998"));
            // DeltaNet's debt should be 0 BTOKEN due he said he wants to return at max 5,000,000,000 BTOKEN (> debt, return all debt)
            expect(deltaNetDebtVal).to.be.eq("0");
            // Check LP deposited by Worker on MasterChef
            [workerLPAfter] = await masterChefV2.userInfo(POOL_ID, deltaNeutralWorker.address);
            // LP tokens + LP tokens from reinvest of worker should be decreased by lpUnderBobPosition/2
            // due to DeltaNet execute StrategyClosePartialLiquidate

            AssertHelpers.assertAlmostEqual(
              workerLPAfter.toString(),
              workerLPBefore.sub(lpUnderPosition.div(2)).toString()
            );
          });
        });

        context("when worker factor is not satisfy", async () => {
          it("should revert bad work factor", async () => {
            // Set interests to 0% per year for easy testing
            await simpleVaultConfig.setParams(
              ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
              "0", // 0% per year
              "1000", // 10% reserve pool
              "1000", // 10% Kill prize
              wbnb.address,
              wNativeRelayer.address,
              fairLaunch.address,
              "0",
              ethers.constants.AddressZero
            );

            await simpleVaultConfig.setWorker(deltaNeutralWorker.address, true, true, "4000", KILL_FACTOR, false, true);

            // DeltaNet deposits 10 BTOKEN
            await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("10"));
            await vaultAsDeltaNet.deposit(ethers.utils.parseEther("10"));
            // Position#1: DeltaNet borrows 10 BTOKEN
            await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("10"));
            await vaultAsDeltaNet.work(
              0,
              deltaNeutralWorker.address,
              ethers.utils.parseEther("10"),
              ethers.utils.parseEther("10"),
              "0", // max return = 0, don't return BTOKEN to the debt
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
              )
            );
            const lpUnderPosition = await deltaNeutralWorker.totalLpBalance();
            // DeltaNet try closes position with maxReturn 0 and liquidate all of his position
            // Expect that Bob will not be able to close his position as he liquidate all underlying assets but not paydebt
            // which made his position debt ratio higher than allow work factor
            await expect(
              vaultAsDeltaNet.work(
                1,
                deltaNeutralWorker.address,
                "0",
                "0",
                "0",
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [
                    partialCloseStrat.address,
                    ethers.utils.defaultAbiCoder.encode(["uint256", "uint256", "uint256"], [lpUnderPosition, "0", "0"]),
                  ]
                )
              )
            ).revertedWith("bad work factor");
          });
        });
      });
    });

    context("#addCollateral", async () => {
      const deposit = ethers.utils.parseEther("3");
      const borrowedAmount = ethers.utils.parseEther("1");
      beforeEach(async () => {
        // Deployer deposits 3 BTOKEN to the bank
        await baseToken.approve(vault.address, deposit);
        await vault.deposit(deposit);
        // Now DeltaNet can borrow 1 BTOKEN + 1 BTOKEN of her to create a new position
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("1"));
        // Position#1: DeltaNet borrows 1 BTOKEN and supply another 1 BTOKEN
        // After calling `work()`
        // 2 BTOKEN needs to swap 0.0732967258967755614 BTOKEN to 0.042234424701074812 FTOKEN
        // new reserve after swap will be 1.732967258967755614 BTOKEN 0.057765575298925188 FTOKEN
        // based on optimal swap formula, BTOKEN-FTOKEN to be added into the LP will be 1.267032741032244386 BTOKEN + 0.042234424701074812 FTOKEN
        // lp amount from adding liquidity will be (0.042234424701074812 / 0.057765575298925188) * 0.316227766016837933(first total supply) = 0.231205137369691323 LP
        // new reserve after adding liquidity 2.999999999999999954 BTOKEN + 0.100000000000000000 FTOKEN
        // ----------------
        // BTOKEN-FTOKEN reserve = 2.999999999999999954 BTOKEN + 0.100000000000000000 FTOKEN
        // BTOKEN-FTOKEN total supply = 0.547432903386529256 BTOKEN-FTOKEN LP
        // ----------------
        await swapHelper.loadReserves(await deltaNeutralWorker.getPath());
        await vaultAsDeltaNet.work(
          0,
          deltaNeutralWorker.address,
          ethers.utils.parseEther("1"),
          borrowedAmount,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const [expectedLp] = await swapHelper.computeOneSidedOptimalLp(
          ethers.utils.parseEther("1").add(borrowedAmount),
          await deltaNeutralWorker.getPath()
        );
        // health calculation
        // lp balance =  0.231205137369691323
        // lp price =  28.299236836137312801
        // lp balance in dollar =  6.542928940156556263
        // base token price =  1.0
        // lp balance in dollar / base token price = token amount
        // 6.542928940156556263 / 1.0 =  6.542928940156556263
        expect(await deltaNeutralWorker.health(1)).to.be.eq(ethers.utils.parseEther("6.542928940156556263"));
        expect(await deltaNeutralWorker.totalLpBalance()).to.be.eq(expectedLp);
      });

      async function successBtokenOnly(lastWorkBlock: BigNumber, goRouge: boolean) {
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")).sub(3));
        await _updatePrice();
        // await TimeHelpers.increase(TimeHelpers.duration.minutes(ethers.BigNumber.from("30")));
        let accumLp = await deltaNeutralWorker.totalLpBalance();
        const [workerLpBefore] = await masterChefV2.userInfo(POOL_ID, deltaNeutralWorker.address);
        const debris = await baseToken.balanceOf(addStrat.address);
        const reinvestPath = await deltaNeutralWorker.getReinvestPath();
        const path = await deltaNeutralWorker.getPath();
        let reserves = await swapHelper.loadReserves(reinvestPath);
        reserves.push(...(await swapHelper.loadReserves(path)));

        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsDeltaNet.addCollateral(
          1,
          ethers.utils.parseEther("1"),
          goRouge,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        await deltaNeutralWorkerAsEve.reinvest();

        const blockAfter = await TimeHelpers.latestBlockNumber();
        const blockDiff = blockAfter.sub(lastWorkBlock);
        const totalRewards = workerLpBefore
          .mul(
            CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_REGULAR_FARM)
              .div(CAKE_RATE_TOTAL_PRECISION)
              .mul(blockDiff)
              .mul(1e12)
              .div(workerLpBefore)
          )
          .div(1e12);
        const totalReinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
        const reinvestLeft = totalRewards.sub(totalReinvestFees);
        const reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
        const reinvestBtoken = reinvestAmts[reinvestAmts.length - 1].add(debris);

        // Compute add collateral
        const addCollateralBtoken = ethers.utils.parseEther("1");
        const [addCollateralLp] = await swapHelper.computeOneSidedOptimalLp(addCollateralBtoken, path);
        const [reinvestLp] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
        accumLp = accumLp.add(reinvestLp);
        accumLp = accumLp.add(addCollateralLp);
        const [health, debt] = await vault.positionInfo("1");
        expect(health).to.be.above(ethers.utils.parseEther("3"));
        const interest = ethers.utils.parseEther("0.3"); // 30% interest rate
        AssertHelpers.assertAlmostEqual(debt.toString(), interest.add(borrowedAmount).toString());
        AssertHelpers.assertAlmostEqual(
          (await baseToken.balanceOf(vault.address)).toString(),
          deposit.sub(borrowedAmount).toString()
        );
        AssertHelpers.assertAlmostEqual(
          (await vault.vaultDebtVal()).toString(),
          interest.add(borrowedAmount).toString()
        );

        const reservePool = interest.mul(RESERVE_POOL_BPS).div("10000");
        AssertHelpers.assertAlmostEqual(reservePool.toString(), (await vault.reservePool()).toString());
        AssertHelpers.assertAlmostEqual(
          deposit.add(interest).sub(reservePool).toString(),
          (await vault.totalToken()).toString()
        );

        AssertHelpers.assertAlmostEqual((await deltaNeutralWorker.totalLpBalance()).toString(), accumLp.toString());
        // `expect Deployer gets ${ethers.utils.formatEther(totalReinvestFees)} CAKE`
        AssertHelpers.assertAlmostEqual((await cake.balanceOf(eveAddress)).toString(), totalReinvestFees.toString());
      }

      async function successTwoSides(lastWorkBlock: BigNumber, goRouge: boolean) {
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")).sub(3));
        await _updatePrice();
        // Random action to trigger interest computation
        await vault.deposit("0");
        // Set intertest rate to 0 for easy testing
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
        let accumLp = await deltaNeutralWorker.totalLpBalance();
        const [workerLpBefore] = await masterChefV2.userInfo(POOL_ID, deltaNeutralWorker.address);
        const debris = await baseToken.balanceOf(addStrat.address);
        const reinvestPath = await deltaNeutralWorker.getReinvestPath();
        const path = await deltaNeutralWorker.getPath();
        let reserves = await swapHelper.loadReserves(reinvestPath);
        reserves.push(...(await swapHelper.loadReserves(path)));
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("1"));
        await farmTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("0.1"));
        await vaultAsDeltaNet.addCollateral(
          1,
          ethers.utils.parseEther("1"),
          goRouge,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              twoSidesStrat.address,
              ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [ethers.utils.parseEther("0.1"), "0"]),
            ]
          )
        );

        await deltaNeutralWorkerAsEve.reinvest();

        const blockAfter = await TimeHelpers.latestBlockNumber();
        const blockDiff = blockAfter.sub(lastWorkBlock);

        const totalRewards = workerLpBefore
          .mul(
            CAKE_REWARD_PER_BLOCK.mul(CAKE_RATE_TO_REGULAR_FARM)
              .div(CAKE_RATE_TOTAL_PRECISION)
              .mul(blockDiff)
              .mul(1e12)
              .div(workerLpBefore)
          )
          .div(1e12);
        const totalReinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
        let reinvestLeft = totalRewards.sub(totalReinvestFees);
        const reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
        let reinvestBtoken = reinvestAmts[reinvestAmts.length - 1].add(debris);
        reinvestBtoken = reinvestLeft;

        // Compute add collateral
        const addCollateralBtoken = ethers.utils.parseEther("1");
        const addCollateralFtoken = ethers.utils.parseEther("0.1");

        const [addCollateralLp, debrisBtoken, debrisFtoken] = await swapHelper.computeTwoSidesOptimalLp(
          addCollateralBtoken,
          addCollateralFtoken,
          path
        );
        const [reinvestLp] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
        accumLp = accumLp.add(reinvestLp);
        accumLp = accumLp.add(addCollateralLp);

        const [health, debt] = await vault.positionInfo("1");
        expect(health).to.be.above(ethers.utils.parseEther("3"));
        const interest = ethers.utils.parseEther("0.3"); // 30% interest rate
        AssertHelpers.assertAlmostEqual(debt.toString(), interest.add(borrowedAmount).toString());
        AssertHelpers.assertAlmostEqual(
          (await baseToken.balanceOf(vault.address)).toString(),
          deposit.sub(borrowedAmount).toString()
        );
        AssertHelpers.assertAlmostEqual(
          (await vault.vaultDebtVal()).toString(),
          interest.add(borrowedAmount).toString()
        );
        const reservePool = interest.mul(RESERVE_POOL_BPS).div("10000");
        AssertHelpers.assertAlmostEqual(reservePool.toString(), (await vault.reservePool()).toString());
        AssertHelpers.assertAlmostEqual(
          deposit.add(interest).sub(reservePool).toString(),
          (await vault.totalToken()).toString()
        );

        // `expect DeltaNet's staked LPs = ${accumLp}`
        AssertHelpers.assertAlmostEqual((await deltaNeutralWorker.totalLpBalance()).toString(), accumLp.toString());
        // `expect Deployer gets ${totalReinvestFees} CAKE`
        AssertHelpers.assertAlmostEqual((await cake.balanceOf(eveAddress)).toString(), totalReinvestFees.toString());
        expect(
          await baseToken.balanceOf(twoSidesStrat.address),
          `expect TwoSides to have debris ${debrisBtoken} BTOKEN`
        ).to.be.eq(debrisBtoken);
      }

      async function revertNotEnoughCollateral(goRouge: boolean, stratAddress: string) {
        // set reinvest threshold to be very large so worker won't get reinvest
        await deltaNeutralWorker.setReinvestConfig(250, ethers.utils.parseEther("100000000"), [cake.address]);
        // Simulate price swing to make position under water
        simpleVaultConfig.setWorker(deltaNeutralWorker.address, true, true, WORK_FACTOR, "100", true, true);
        await farmToken.approve(routerV2.address, ethers.utils.parseEther("888"));
        await routerV2.swapExactTokensForTokens(
          ethers.utils.parseEther("888"),
          "0",
          [farmToken.address, baseToken.address],
          deployerAddress,
          FOREVER
        );
        // Add super small collateral that it would still under the water after collateral is getting added
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("0.000000000000000001"));
        await expect(
          vaultAsDeltaNet.addCollateral(
            1,
            ethers.utils.parseEther("0.000000000000000001"),
            goRouge,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAddress, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          )
        ).to.be.revertedWith("debtRatio > killFactor margin");
      }

      async function revertUnapprovedStrat(goRouge: boolean, stratAddress: string) {
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("88"));
        await expect(
          vaultAsDeltaNet.addCollateral(
            1,
            ethers.utils.parseEther("1"),
            goRouge,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAddress, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          )
        ).to.be.revertedWith("!approved strat");
      }

      async function revertReserveNotConsistent(goRouge: boolean, stratAddress: string) {
        await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("88"));
        await expect(
          vaultAsDeltaNet.addCollateral(
            1,
            ethers.utils.parseEther("1"),
            goRouge,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [stratAddress, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          )
        ).to.be.revertedWith("reserve !consistent");
      }

      context("when go rouge is false", async () => {
        context("when worker is stable", async () => {
          it("should increase health when add BTOKEN only strat is choosen", async () => {
            await successBtokenOnly(await TimeHelpers.latestBlockNumber(), false);
          });
          it("should increase health when twosides strat is choosen", async () => {
            await successTwoSides(await TimeHelpers.latestBlockNumber(), false);
          });
          it("should revert when not enough collateral to pass kill factor", async () => {
            await revertNotEnoughCollateral(false, addStrat.address);
          });
          it("should revert when using liquidate strat", async () => {
            await revertUnapprovedStrat(false, liqStrat.address);
          });
          it("should revert when using minimize trading strat", async () => {
            await revertUnapprovedStrat(false, minimizeStrat.address);
          });
          it("should revert when using partial close liquidate start", async () => {
            await revertUnapprovedStrat(false, partialCloseStrat.address);
          });
          it("should revert when using partial close minimize start", async () => {
            await revertUnapprovedStrat(false, partialCloseMinimizeStrat.address);
          });
        });
        context("when worker is unstable", async () => {
          it("should revert", async () => {
            // Set worker to unstable
            simpleVaultConfig.setWorker(deltaNeutralWorker.address, true, true, WORK_FACTOR, KILL_FACTOR, false, true);
            await baseTokenAsDeltaNet.approve(vault.address, ethers.utils.parseEther("1"));
            await expect(
              vaultAsDeltaNet.addCollateral(
                1,
                ethers.utils.parseEther("1"),
                false,
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                )
              )
            ).to.be.revertedWith("worker !stable");
          });
        });
      });

      context("when go rouge is true", async () => {
        context("when worker is unstable", async () => {
          beforeEach(async () => {
            // Set worker to unstable
            await simpleVaultConfig.setWorker(
              deltaNeutralWorker.address,
              true,
              true,
              WORK_FACTOR,
              KILL_FACTOR,
              false,
              true
            );
          });
          it("should increase health when add BTOKEN only strat is choosen", async () => {
            await successBtokenOnly((await TimeHelpers.latestBlockNumber()).sub(1), true);
          });
          it("should increase health when twosides strat is choosen", async () => {
            await successTwoSides((await TimeHelpers.latestBlockNumber()).sub(1), true);
          });
          it("should revert when not enough collateral to pass kill factor", async () => {
            await revertNotEnoughCollateral(true, addStrat.address);
          });
          it("should revert when using liquidate strat", async () => {
            await revertUnapprovedStrat(true, liqStrat.address);
          });
          it("should revert when using minimize trading strat", async () => {
            await revertUnapprovedStrat(true, minimizeStrat.address);
          });
          it("should revert when using partial close liquidate start", async () => {
            await revertUnapprovedStrat(true, partialCloseStrat.address);
          });
          it("should revert when using partial close minimize start", async () => {
            await revertUnapprovedStrat(true, partialCloseMinimizeStrat.address);
          });
        });

        context("when reserve is inconsistent", async () => {
          beforeEach(async () => {
            // Set worker to unstable
            await simpleVaultConfig.setWorker(
              deltaNeutralWorker.address,
              true,
              true,
              WORK_FACTOR,
              KILL_FACTOR,
              false,
              false
            );
          });
          it("should revert", async () => {
            await revertReserveNotConsistent(true, addStrat.address);
          });
        });
      });
    });
  });
});
