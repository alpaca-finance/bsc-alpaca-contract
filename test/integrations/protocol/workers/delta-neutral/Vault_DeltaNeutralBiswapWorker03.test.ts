import { ethers, upgrades, waffle } from "hardhat";
import { constants, BigNumber, utils } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockContractContext,
  MockContractContext__factory,
  MockERC20,
  MockERC20__factory,
  MockWBNB,
  PancakePair,
  PancakePair__factory,
  SimpleVaultConfig,
  Vault,
  Vault__factory,
  WNativeRelayer,
  DeltaNeutralOracle,
  ChainLinkPriceOracle,
  ChainLinkPriceOracle__factory,
  MockAggregatorV3__factory,
  IERC20,
  SpookyMasterChef,
  SpookyToken,
  WaultSwapFactory,
  WaultSwapRouter,
  MiniFL,
  SpookySwapStrategyAddBaseTokenOnly,
  SpookySwapStrategyAddTwoSidesOptimal,
  SpookySwapStrategyLiquidate,
  SpookySwapStrategyWithdrawMinimizeTrading,
  SpookySwapStrategyPartialCloseLiquidate,
  SpookySwapStrategyPartialCloseMinimizeTrading,
  SpookyMasterChef__factory,
  DeltaNeutralSpookyWorker03__factory,
  DeltaNeutralSpookyWorker03,
} from "../../../../../typechain";
import * as AssertHelpers from "../../../../helpers/assert";
import * as TimeHelpers from "../../../../helpers/time";
import { parseEther } from "ethers/lib/utils";
import { DeployHelper } from "../../../../helpers/deploy";
import { SwapHelper } from "../../../../helpers/swap";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
const { expect } = chai;

describe("Vault - DeltaNetSpookyWorker03", () => {
  const FOREVER = "2000000000";
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther("5000");
  const BOO_REWARD_PER_SEC = ethers.utils.parseEther("0.076");
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
  const POOL_ID = 0;

  /// DEX-related instance(s)
  /// Note: Use WaultSwap due to same fee structure
  let factory: WaultSwapFactory;
  let router: WaultSwapRouter;

  let wbnb: MockWBNB;
  let lp: PancakePair;

  /// Token-related instance(s)
  let baseToken: MockERC20;
  let farmToken: MockERC20;
  let busd: MockERC20;
  let boo: SpookyToken;
  let alpacaToken: MockERC20;

  /// Strategy-ralted instance(s)
  let addStrat: SpookySwapStrategyAddBaseTokenOnly;
  let twoSidesStrat: SpookySwapStrategyAddTwoSidesOptimal;
  let liqStrat: SpookySwapStrategyLiquidate;
  let minimizeStrat: SpookySwapStrategyWithdrawMinimizeTrading;
  let partialCloseStrat: SpookySwapStrategyPartialCloseLiquidate;
  let partialCloseMinimizeStrat: SpookySwapStrategyPartialCloseMinimizeTrading;

  /// Vault-related instance(s)
  let simpleVaultConfig: SimpleVaultConfig;
  let wNativeRelayer: WNativeRelayer;
  let vault: Vault;

  /// MiniFL-related instance(s)
  let miniFL: MiniFL;

  /// Spooky-related instance(s)
  let spookyMasterChef: SpookyMasterChef;
  let deltaNeutralWorker: DeltaNeutralSpookyWorker03;

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

  // Contract Signer
  let baseTokenAsDeltaNet: MockERC20;
  let baseTokenAsBob: MockERC20;

  let farmTokenAsDeltaNet: MockERC20;

  let lpAsDeltaNet: PancakePair;
  let lpAsBob: PancakePair;

  let spookyMasterChefAsDeltaNet: SpookyMasterChef;
  let spookyMasterChefAsBob: SpookyMasterChef;

  let deltaNeutralWorkerAsDeployer: DeltaNeutralSpookyWorker03;
  let deltaNeutralWorkerAsBob: DeltaNeutralSpookyWorker03;

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
    [deployerAddress, deltaNetAddress, bobAddress] = await Promise.all([
      deployer.getAddress(),
      deltaNet.getAddress(),
      bob.getAddress(),
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
    [alpacaToken, baseToken, farmToken] = await deployHelper.deployBEP20([
      {
        name: "ALPACA",
        symbol: "ALPACA",
        decimals: "18",
        holders: [{ address: deployerAddress, amount: ethers.utils.parseEther("88888888888888") }],
      },
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

    [factory, router, boo, spookyMasterChef] = await deployHelper.deploySpookySwap(wbnb, BOO_REWARD_PER_SEC, [
      { address: deployerAddress, amount: ethers.utils.parseEther("100") },
    ]);

    miniFL = await deployHelper.deployMiniFL(alpacaToken.address);

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
      ethers.constants.AddressZero,
      baseToken
    );

    // Setup strategies
    [addStrat, liqStrat, twoSidesStrat, minimizeStrat, partialCloseStrat, partialCloseMinimizeStrat] =
      await deployHelper.deploySpookySwapStrategies(router, vault, wNativeRelayer);

    // whitelisted contract to be able to call work
    await simpleVaultConfig.setWhitelistedCallers([whitelistedContract.address], true);

    // whitelisted to be able to call kill
    await simpleVaultConfig.setWhitelistedLiquidators([deployerAddress, bobAddress], true);

    // Set approved add strategies
    await simpleVaultConfig.setApprovedAddStrategy([addStrat.address, twoSidesStrat.address], true);

    // Setup BTOKEN-FTOKEN pair on Spooky
    // Add lp to masterChef's pool

    await factory.createPair(baseToken.address, farmToken.address);
    lp = PancakePair__factory.connect(await factory.getPair(farmToken.address, baseToken.address), deployer);
    await spookyMasterChef.add(1, lp.address);

    /// Setup DeltaNeutralSpookyWorker03
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

    deltaNeutralWorker = await deployHelper.deployDeltaNeutralSpookyWorker03(
      vault,
      baseToken,
      spookyMasterChef,
      router,
      POOL_ID,
      WORK_FACTOR,
      KILL_FACTOR,
      addStrat,
      REINVEST_BOUNTY_BPS,
      [bobAddress],
      DEPLOYER,
      [boo.address, wbnb.address, baseToken.address],
      [twoSidesStrat.address, minimizeStrat.address, partialCloseStrat.address, partialCloseMinimizeStrat.address],
      simpleVaultConfig,
      priceOracle.address
    );

    await deltaNeutralWorker.setWhitelistedCallers(
      [whitelistedContract.address, deltaNeutralWorker.address, deltaNetAddress],
      true
    );

    swapHelper = new SwapHelper(factory.address, router.address, BigNumber.from(998), BigNumber.from(1000), deployer);

    await swapHelper.addLiquidities([
      {
        token0: baseToken as unknown as IERC20,
        token1: farmToken as unknown as IERC20,
        amount0desired: ethers.utils.parseEther("1"),
        amount1desired: ethers.utils.parseEther("0.1"),
      },
      {
        token0: boo as unknown as IERC20,
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

    spookyMasterChefAsDeltaNet = SpookyMasterChef__factory.connect(spookyMasterChef.address, deltaNet);
    spookyMasterChefAsBob = SpookyMasterChef__factory.connect(spookyMasterChef.address, bob);

    vaultAsDeltaNet = Vault__factory.connect(vault.address, deltaNet);
    vaultAsBob = Vault__factory.connect(vault.address, bob);
    vaultAsEve = Vault__factory.connect(vault.address, eve);

    deltaNeutralWorkerAsDeployer = DeltaNeutralSpookyWorker03__factory.connect(deltaNeutralWorker.address, deployer);
    deltaNeutralWorkerAsBob = DeltaNeutralSpookyWorker03__factory.connect(deltaNeutralWorker.address, bob);
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
    it("should has FTOKEN as a farmingToken in DeltaNeutralSpookyWorker", async () => {
      expect(await deltaNeutralWorker.farmingToken()).to.be.equal(farmToken.address);
    });

    it("should give rewards out when you stake LP tokens", async () => {
      // Deployer sends some LP tokens to DeltaNet and Bob
      await lp.transfer(deltaNetAddress, ethers.utils.parseEther("0.05"));
      await lp.transfer(bobAddress, ethers.utils.parseEther("0.05"));

      // DeltaNet and Bob stake 0.01 LP tokens and waits for 1 day
      await lpAsDeltaNet.approve(spookyMasterChef.address, ethers.utils.parseEther("0.01"));
      await lpAsBob.approve(spookyMasterChef.address, ethers.utils.parseEther("0.02"));
      await spookyMasterChefAsDeltaNet.deposit(POOL_ID, ethers.utils.parseEther("0.01"));
      await spookyMasterChefAsBob.deposit(POOL_ID, ethers.utils.parseEther("0.02")); // DeltaNet +1 Reward

      // DeltaNet and Bob withdraw stake from the pool
      await spookyMasterChefAsBob.withdraw(POOL_ID, ethers.utils.parseEther("0.02")); // DeltaNet +1/3 Reward  Bob + 2/3 Reward
      await spookyMasterChefAsDeltaNet.withdraw(POOL_ID, ethers.utils.parseEther("0.01")); // delta net +1 Reward

      AssertHelpers.assertAlmostEqual(
        (await boo.balanceOf(deltaNetAddress)).toString(),
        BOO_REWARD_PER_SEC.mul(BigNumber.from(7)).div(BigNumber.from(3)).toString()
      );
      AssertHelpers.assertAlmostEqual(
        (await boo.balanceOf(bobAddress)).toString(),
        BOO_REWARD_PER_SEC.mul(2).div(3).toString()
      );
    });
  });

  context("when owner is setting worker", async () => {
    describe("#reinvestConfig", async () => {
      it("should set reinvest config correctly", async () => {
        await expect(
          deltaNeutralWorker.setReinvestConfig(250, ethers.utils.parseEther("1"), [boo.address, baseToken.address])
        )
          .to.be.emit(deltaNeutralWorker, "SetReinvestConfig")
          .withArgs(deployerAddress, 250, ethers.utils.parseEther("1"), [boo.address, baseToken.address]);
        expect(await deltaNeutralWorker.reinvestBountyBps()).to.be.eq(250);
        expect(await deltaNeutralWorker.reinvestThreshold()).to.be.eq(ethers.utils.parseEther("1"));
        expect(await deltaNeutralWorker.getReinvestPath()).to.deep.eq([boo.address, baseToken.address]);
      });

      it("should revert when owner set reinvestBountyBps > max", async () => {
        await expect(
          deltaNeutralWorker.setReinvestConfig(2001, "0", [boo.address, baseToken.address])
        ).to.be.revertedWith("DeltaNeutralSpookyWorker03_ExceedReinvestBounty()");
        expect(await deltaNeutralWorker.reinvestBountyBps()).to.be.eq(100);
      });

      it("should revert when owner set reinvest path that doesn't start with $BOO and end with $BTOKN", async () => {
        await expect(
          deltaNeutralWorker.setReinvestConfig(200, "0", [baseToken.address, boo.address])
        ).to.be.revertedWith("DeltaNeutralSpookyWorker03_InvalidReinvestPath()");
      });
    });

    describe("#setMaxReinvestBountyBps", async () => {
      it("should set max reinvest bounty", async () => {
        await deltaNeutralWorker.setMaxReinvestBountyBps(200);
        expect(await deltaNeutralWorker.maxReinvestBountyBps()).to.be.eq(200);
      });

      it("should revert when new max reinvest bounty over 30%", async () => {
        await expect(deltaNeutralWorker.setMaxReinvestBountyBps("3001")).to.be.revertedWith(
          "DeltaNeutralSpookyWorker03_ExceedReinvestBps()"
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
        const rewardPath = [boo.address, wbnb.address, baseToken.address];
        // set beneficialVaultConfig
        await deltaNeutralWorkerAsDeployer.setBeneficialVaultConfig(
          BENEFICIALVAULT_BOUNTY_BPS,
          vault.address,
          rewardPath
        );
      });

      it("should revert", async () => {
        const rewardPath = [boo.address, farmToken.address, farmToken.address];
        await expect(deltaNeutralWorkerAsDeployer.setRewardPath(rewardPath)).to.revertedWith(
          "DeltaNeutralSpookyWorker03_InvalidReinvestPath()"
        );
      });

      it("should be able to set new rewardpath", async () => {
        const rewardPath = [boo.address, farmToken.address, baseToken.address];
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
        ).to.be.revertedWith("DeltaNeutralSpookyWorker03_NotWhitelistedCaller()");
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
        const stages: any = {};
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

        // lp balance = 0.231263113939866546
        // lp price = 28.296240087240846586
        // lp balance in dollar = 6.543876595365399198
        // base token price = 1.0
        // lp balance in dollar / base token price
        // 6.543876595365399198 / 1.0 = 6.543876595365399198
        const expectedHealth = ethers.utils.parseEther("6.543876595365399198");
        expect(await deltaNeutralWorker.health(1)).to.be.eq(expectedHealth);
        // Bob comes and trigger reinvest
        stages["beforeReinvest"] = await TimeHelpers.latest();
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        await deltaNeutralWorkerAsBob.reinvest();
        stages["afterReinvest"] = await TimeHelpers.latest();
        AssertHelpers.assertAlmostEqual(
          BOO_REWARD_PER_SEC.mul(stages["afterReinvest"].sub(stages["beforeReinvest"]))
            .mul(REINVEST_BOUNTY_BPS)
            .div("10000")
            .toString(),
          (await boo.balanceOf(bobAddress)).toString()
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
        ).to.be.revertedWith("DeltaNeutralSpookyWorker03_UnTrustedPrice()");
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
          miniFL.address,
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
        await expect(vaultAsBob.kill("1")).to.be.revertedWith("DeltaNeutralSpookyWorker03_NotAllowToLiquidate()");
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
        await expect(vaultAsBob.kill("1")).to.be.revertedWith("DeltaNeutralSpookyWorker03_NotAllowToLiquidate()");
      });
    });

    context("#reinvest", async () => {
      it("should reinvest correctly", async () => {
        const stages: any = {};
        // Set interests to 0% per year for easy testing
        await simpleVaultConfig.setParams(
          ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
          "0", // 0% per year
          "1000", // 10% reserve pool
          "1000", // 10% Kill prize
          wbnb.address,
          wNativeRelayer.address,
          miniFL.address,
          "0",
          ethers.constants.AddressZero
        );
        // Set Reinvest bounty to 10% of the reward
        await deltaNeutralWorker.setReinvestConfig("100", "0", [boo.address, wbnb.address, baseToken.address]);
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
        let [workerLpAfter] = await spookyMasterChef.userInfo(POOL_ID, deltaNeutralWorker.address);

        // 1131492691639043045
        // 1131776307937023350
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
        [workerLpBefore] = await spookyMasterChef.userInfo(POOL_ID, deltaNeutralWorker.address);
        let bobBooBefore = await boo.balanceOf(bobAddress);
        let deployerBooBefore = await boo.balanceOf(DEPLOYER);
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

        // trigger reinvest once for simple calculation
        await deltaNeutralWorkerAsBob.reinvest();

        // Update beforeReinvest
        stages["beforeReinvest"] = await TimeHelpers.latest();

        // ---------------- Reinvest#1 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        let [workerLPBefore] = await spookyMasterChef.userInfo(POOL_ID, deltaNeutralWorker.address);
        deployerBooBefore = await boo.balanceOf(DEPLOYER);
        bobBooBefore = await boo.balanceOf(bobAddress);
        await swapHelper.loadReserves(path);
        await swapHelper.loadReserves(reinvestPath);

        await deltaNeutralWorkerAsBob.reinvest();
        stages["afterReinvest"] = await TimeHelpers.latest();

        const deployerBooAfter = await boo.balanceOf(DEPLOYER);
        const bobBooAfter = await boo.balanceOf(bobAddress);
        [workerLpAfter] = await spookyMasterChef.userInfo(POOL_ID, deltaNeutralWorker.address);
        let totalRewards = swapHelper.computeTotalRewards(
          workerLPBefore,
          BOO_REWARD_PER_SEC,
          stages["afterReinvest"].sub(stages["beforeReinvest"])
        );

        const reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
        const reinvestLeft = totalRewards.sub(reinvestFees);

        const reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
        const reinvestBtoken = reinvestAmts[reinvestAmts.length - 1].add(debrisBtoken);
        let reinvestLp;
        [reinvestLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
        accumLp = accumLp.add(reinvestLp);
        expect(deployerBooAfter.sub(deployerBooBefore), `expect DEPLOYER's BOO to remain the same`).to.be.eq("0");
        expect(bobBooAfter.sub(bobBooBefore), `expect bob to get ${reinvestFees}`).to.be.eq(reinvestFees);
        expect(workerLpAfter).to.be.eq(workerLPBefore.add(reinvestLp));
        // Check Position info
        await _updatePrice();
        let [vaultHealth, vaultDebtToShare] = await vault.positionInfo("1");

        // dynamic health calculation since reinvest lp based on time passed
        const [baseTokenPrice] = await priceOracle.getTokenPrice(baseToken.address);
        const [lpValue] = await priceOracle.lpToDollar(workerLpAfter, lp.address);
        const vaultExpectedHealth = lpValue.mul(ethers.utils.parseEther("1")).div(baseTokenPrice);
        expect(vaultHealth, `expect Position health = ${vaultExpectedHealth}`).to.be.eq(vaultExpectedHealth);
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
              miniFL.address,
              "0",
              ethers.constants.AddressZero
            );
            const [path, reinvestPath] = await Promise.all([
              deltaNeutralWorker.getPath(),
              deltaNeutralWorker.getReinvestPath(),
            ]);
            // Set Reinvest bounty to 1% of the reward
            await deltaNeutralWorker.setReinvestConfig("100", "0", [boo.address, wbnb.address, baseToken.address]);
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
            // lp amount from adding liquidity will be 1.131776307937023350 LP
            const borrowedAmount = ethers.utils.parseEther("10");
            const principalAmount = ethers.utils.parseEther("10");
            let [workerLpBefore] = await spookyMasterChef.userInfo(POOL_ID, deltaNeutralWorker.address);
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
            let [workerLpAfter] = await spookyMasterChef.userInfo(POOL_ID, deltaNeutralWorker.address);
            const [expectedLp, debrisBtoken] = await swapHelper.computeOneSidedOptimalLp(
              borrowedAmount.add(principalAmount),
              path
            );
            expect(workerLpAfter.sub(workerLpBefore)).to.eq(expectedLp);
            const deployerBooBefore = await boo.balanceOf(DEPLOYER);
            const deltaNetBefore = await baseToken.balanceOf(deltaNetAddress);
            // health calculation
            // lp balance = 1.131776307937023350
            // lp price = 28.306414188406775957
            // lp balance in dollar = 32.036528941091194155
            // base token price = 1.0
            // lp balance in dollar / base token price
            // 32.036528941091194155 / 1.0 = 32.036528941091194155

            const [deltaNetHealthBefore] = await vault.positionInfo("1");
            expect(deltaNetHealthBefore).to.be.eq(ethers.utils.parseEther("32.036528941091194155"));
            const lpUnderPosition = await deltaNeutralWorker.totalLpBalance();
            const liquidatedLp = lpUnderPosition.div(2);
            const returnDebt = ethers.utils.parseEther("6");
            [workerLpBefore] = await spookyMasterChef.userInfo(POOL_ID, deltaNeutralWorker.address);
            // Pre-compute
            await swapHelper.loadReserves(path);
            await swapHelper.loadReserves(reinvestPath);

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
                    [liquidatedLp, returnDebt, liquidatedBtoken]
                  ),
                ]
              )
            );

            const deltaNetAfter = await baseToken.balanceOf(deltaNetAddress);

            expect(deltaNetAfter.sub(deltaNetBefore), `expect DeltaNet get ${liquidatedBtoken}`).to.be.eq(
              liquidatedBtoken
            );
            // Check position info
            const [deltaNetHealthAfter] = await vault.positionInfo("1");

            // DeltaNet's health after partial close position must be 50% less than before
            // due to he exit half of lp under his position
            // health calculation
            // lp balance =  0.565888153968511675
            // lp price =  28.317482983668635249
            // lp balance in dollar =  16.024528170662986041
            // base token price =  1.0
            // lp balance in dollar / base token price
            // 16.024528170662986041 / 1.0 = 16.024528170662986041
            expect(deltaNetHealthAfter).to.be.eq(ethers.utils.parseEther("16.024528170662986041"));
            [workerLpAfter] = await spookyMasterChef.userInfo(POOL_ID, deltaNeutralWorker.address);
            // LP tokens should be decreased by lpUnderPosition / 2
            // due to Bob execute StrategyClosePartialLiquidate
            expect(workerLpAfter).to.be.eq(lpUnderPosition.div(2));
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
              miniFL.address,
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
            // lp amount from adding liquidity will be 1.131776307937023350 LP
            let [workerLPBefore] = await spookyMasterChef.userInfo(POOL_ID, deltaNeutralWorker.address);
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
            let [workerLPAfter] = await spookyMasterChef.userInfo(POOL_ID, deltaNeutralWorker.address);
            expect(workerLPAfter.sub(workerLPBefore)).to.eq(parseEther("1.131776307937023350"));
            // DeltaNet think he made enough. He now wants to close position partially.
            // He close 50% of his position and return all debt
            const deltaNetBefore = await baseToken.balanceOf(deltaNetAddress);
            const [deltaNetHealthBefore] = await vault.positionInfo("1");
            const lpUnderPosition = await deltaNeutralWorker.totalLpBalance();
            [workerLPBefore] = await spookyMasterChef.userInfo(POOL_ID, deltaNeutralWorker.address);
            // DeltaNet think he made enough. He now wants to close position partially.

            // accumulated LP of the worker will be 1.131776307937023350 LP
            // DeltaNet close 50% of his position, thus he will close 1.131776307937023350/ 2 = 0.565888153968511675 LP
            // 0.565888153968511675 LP will be converted into 13.200430549066301204 BTOKEN - 0.039080563663285863 FTOKEN
            // 0.039080563663285863 FTOKEN will be converted into 4.993512179776269871 BTOKEN
            // thus, DeltaNet will receive 13.200430549066301204 + 4.993512179776269871 - 5 = 13.193942728842571075 BTOKEN
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
                    [lpUnderPosition.div(2), ethers.utils.parseEther("5000000000"), 0]
                  ),
                ]
              )
            );
            const deltaNetAfter = await baseToken.balanceOf(deltaNetAddress);
            // After DeltaNet liquidate half of his position which worth
            // 13.200430549066301204 BTOKEN (price impact+trading fee included)
            // DeltaNet wish to return 5,000,000,000 BTOKEN (when maxReturn > debt, return all debt)
            // The following criteria must be stratified:
            // - DeltaNet should get 13.200430549066301204 - 10 = 3.200430549066301204 BTOKEN back.
            // - DeltaNet's position debt must be 0
            expect(
              deltaNetBefore.add(ethers.utils.parseEther("3.200430549066301204")),
              "Expect BTOKEN in Bob's account after close position to increase by ~3.32 BTOKEN"
            ).to.be.eq(deltaNetAfter);
            // Check Bob position info
            const [deltaNetHealth, deltaNetDebtVal] = await vault.positionInfo("1");
            // DeltaNet's health after partial close position must be 50% less than before
            // due to he exit half of lp under his position
            // health calculation
            // lp balance = 0.565888153968511675
            // lp price = 28.317482983668635249
            // lp balance in dollar =  16.024528170662986041
            // base token price =  1.0
            // lp balance in dollar / base token price
            // 16.024528170662986041 / 1.0 = 16.024528170662986041
            expect(deltaNetHealth).to.be.eq(ethers.utils.parseEther("16.024528170662986041"));
            // DeltaNet's debt should be 0 BTOKEN due he said he wants to return at max 5,000,000,000 BTOKEN (> debt, return all debt)
            expect(deltaNetDebtVal).to.be.eq("0");
            // Check LP deposited by Worker on MasterChef
            [workerLPAfter] = await spookyMasterChef.userInfo(POOL_ID, deltaNeutralWorker.address);
            // LP tokens of worker should be decreased by lpUnderBobPosition/2
            // due to DeltaNet execute StrategyClosePartialLiquidate
            expect(workerLPAfter).to.be.eq(lpUnderPosition.div(2));
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
              miniFL.address,
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
        // lp balance = 0.231263113939866546
        // lp price = 28.296240087240846586
        // lp balance in dollar = 6.543876595365399198
        // base token price = 1.0
        // lp balance in dollar / base token price
        // 6.543876595365399198 / 1.0 = 6.543876595365399198

        expect(await deltaNeutralWorker.health(1)).to.be.eq(ethers.utils.parseEther("6.543876595365399198"));
        expect(await deltaNeutralWorker.totalLpBalance()).to.be.eq(expectedLp);
      });

      async function successBtokenOnly(lastWorkBlock: BigNumber, goRouge: boolean) {
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        await _updatePrice();

        let accumLp = await deltaNeutralWorker.totalLpBalance();

        const path = await deltaNeutralWorker.getPath();
        await swapHelper.loadReserves(path);

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

        // Compute add collateral
        const addCollateralBtoken = ethers.utils.parseEther("1");
        const [addCollateralLp] = await swapHelper.computeOneSidedOptimalLp(addCollateralBtoken, path);
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
      }

      async function successTwoSides(lastWorkBlock: BigNumber, goRouge: boolean) {
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
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
          miniFL.address,
          KILL_TREASURY_BPS,
          deployerAddress
        );
        let accumLp = await deltaNeutralWorker.totalLpBalance();
        const path = await deltaNeutralWorker.getPath();
        await swapHelper.loadReserves(path);

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

        const addCollateralBtoken = ethers.utils.parseEther("1");
        const addCollateralFtoken = ethers.utils.parseEther("0.1");
        const [addCollateralLp, debrisBtoken, debrisFtoken] = await swapHelper.computeTwoSidesOptimalLp(
          addCollateralBtoken,
          addCollateralFtoken,
          path
        );
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

        expect(await deltaNeutralWorker.totalLpBalance(), `expect DeltaNet's staked LPs = ${accumLp}`).to.be.eq(
          accumLp
        );
        expect(
          await baseToken.balanceOf(twoSidesStrat.address),
          `expect TwoSides to have debris ${debrisBtoken} BTOKEN`
        ).to.be.eq(debrisBtoken);
        expect(
          await farmToken.balanceOf(twoSidesStrat.address),
          `expect TwoSides to have debris ${debrisFtoken} FTOKEN`
        ).to.be.eq(debrisFtoken);
      }

      async function revertNotEnoughCollateral(goRouge: boolean, stratAddress: string) {
        // Simulate price swing to make position under water
        simpleVaultConfig.setWorker(deltaNeutralWorker.address, true, true, WORK_FACTOR, "100", true, true);
        await farmToken.approve(router.address, ethers.utils.parseEther("888"));
        await router.swapExactTokensForTokens(
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
