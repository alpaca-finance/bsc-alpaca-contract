import { ethers, upgrades, waffle } from "hardhat";
import { BigNumber, Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  MockWBNB,
  WaultSwapFactory,
  PancakePair,
  PancakePair__factory,
  WaultSwapRouter,
  SimpleVaultConfig,
  Vault,
  Vault__factory,
  WNativeRelayer,
  SpookyToken,
  SpookySwapStrategyAddBaseTokenOnly,
  SpookySwapStrategyLiquidate,
  SpookySwapStrategyAddTwoSidesOptimal,
  SpookySwapStrategyWithdrawMinimizeTrading,
  SpookySwapStrategyPartialCloseLiquidate,
  SpookySwapStrategyPartialCloseMinimizeTrading,
  MiniFL,
  Rewarder1,
  MiniFL__factory,
  TombWorker03,
  TShare,
  TombWorker03__factory,
} from "../../../../../typechain";
import * as AssertHelpers from "../../../../helpers/assert";
import * as TimeHelpers from "../../../../helpers/time";
import { SwapHelper } from "../../../../helpers/swap";
import { DeployHelper } from "../../../../helpers/deploy";
import { Worker02Helper } from "../../../../helpers/worker";
import { TShareRewardPool } from "../../../../../typechain/TShareRewardPool";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
const { expect } = chai;

describe("Vault - TombWorker03", () => {
  const FOREVER = "2000000000";
  const LM_REWARD_PER_SECOND = ethers.utils.parseEther("100");
  const TSHARE_PER_SEC = ethers.utils.parseEther("0.076");
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
  let extraToken: MockERC20;
  let baseToken: MockERC20;
  let farmToken: MockERC20;
  let boo: SpookyToken;

  /// MiniFL instance(s)
  let miniFL: MiniFL;
  let rewarder1: Rewarder1;

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

  /// Tomb-related instance(s)
  let tshare: TShare;
  let tshareRewardPool: TShareRewardPool;
  let tombWorker: TombWorker03;

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

  let tombWorkerAsEve: TombWorker03;

  let vaultAsAlice: Vault;
  let vaultAsBob: Vault;
  let vaultAsEve: Vault;

  let miniFLasAlice: MiniFL;
  let miniFLasBob: MiniFL;
  let miniFLasEve: MiniFL;

  // Test Helper
  let swapHelper: SwapHelper;
  let workerHelper: Worker02Helper;

  async function fixture() {
    [deployer, alice, bob, eve] = await ethers.getSigners();
    [deployerAddress, aliceAddress, bobAddress, eveAddress] = await Promise.all([
      deployer.getAddress(),
      alice.getAddress(),
      bob.getAddress(),
      eve.getAddress(),
    ]);
    const deployHelper = new DeployHelper(deployer);

    wbnb = await deployHelper.deployWBNB();
    [factory, router, boo] = await deployHelper.deploySpookySwap(wbnb, 0, [
      { address: deployerAddress, amount: ethers.utils.parseEther("100") },
    ]);
    [alpacaToken, extraToken, baseToken, farmToken] = await deployHelper.deployBEP20([
      {
        name: "ALPACA",
        symbol: "ALPACA",
        decimals: "18",
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("88888888888888") },
          { address: aliceAddress, amount: ethers.utils.parseEther("1000") },
          { address: bobAddress, amount: ethers.utils.parseEther("1000") },
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
        decimals: "6",
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
    miniFL = await deployHelper.deployMiniFL(alpacaToken.address);
    rewarder1 = await deployHelper.deployRewarder1(miniFL.address, extraToken.address);
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
    [addStrat, liqStrat, twoSidesStrat, minimizeStrat, partialCloseStrat, partialCloseMinimizeStrat] =
      await deployHelper.deploySpookySwapStrategies(router, vault, wNativeRelayer);
    [tshare, tshareRewardPool] = await deployHelper.deployTShareRewardPool();

    /// Set reward per second on both MiniFL and Rewarder
    await miniFL.setAlpacaPerSecond(LM_REWARD_PER_SECOND, true);
    await rewarder1.setRewardPerSecond(LM_REWARD_PER_SECOND, true);
    await rewarder1.addPool(1, 0, true);

    /// Setup BTOKEN-FTOKEN pair on SpookySwap
    await factory.createPair(baseToken.address, farmToken.address);
    lp = PancakePair__factory.connect(await factory.getPair(farmToken.address, baseToken.address), deployer);
    await lp.deployed();

    // Add LP to tshare's pool
    await tshareRewardPool.add(1, lp.address, true, 0);

    /// Setup TombWorker03
    const TombWorker03 = (await ethers.getContractFactory("TombWorker03", deployer)) as TombWorker03__factory;
    tombWorker = (await upgrades.deployProxy(TombWorker03, [
      vault.address,
      baseToken.address,
      tshareRewardPool.address,
      router.address,
      POOL_ID,
      addStrat.address,
      liqStrat.address,
      REINVEST_BOUNTY_BPS,
      DEPLOYER,
      [tshare.address, wbnb.address, baseToken.address],
      "0",
    ])) as TombWorker03;
    await tombWorker.deployed();

    await simpleVaultConfig.setWorker(tombWorker.address, true, true, WORK_FACTOR, KILL_FACTOR, true, true);
    await tombWorker.setStrategyOk([twoSidesStrat.address, partialCloseStrat.address], true);
    await tombWorker.setReinvestorOk([eveAddress], true);
    await tombWorker.setTreasuryConfig(DEPLOYER, REINVEST_BOUNTY_BPS);
    await addStrat.setWorkersOk([tombWorker.address], true);
    await twoSidesStrat.setWorkersOk([tombWorker.address], true);
    await liqStrat.setWorkersOk([tombWorker.address], true);
    await partialCloseStrat.setWorkersOk([tombWorker.address], true);
    await simpleVaultConfig.setApprovedAddStrategy([addStrat.address, twoSidesStrat.address], true);
    await simpleVaultConfig.setWhitelistedLiquidators([await alice.getAddress(), await eve.getAddress()], true);

    // Initiate swapHelper
    swapHelper = new SwapHelper(factory.address, router.address, BigNumber.from(998), BigNumber.from(1000), deployer);
    workerHelper = new Worker02Helper(tombWorker.address, tshareRewardPool.address);

    // Initialized liquidities
    await swapHelper.addLiquidities([
      {
        token0: baseToken,
        token1: farmToken,
        amount0desired: ethers.utils.parseEther("1"),
        amount1desired: ethers.utils.parseEther("0.1"),
      },
      {
        token0: tshare,
        token1: wbnb,
        amount0desired: ethers.utils.parseEther("0.1"),
        amount1desired: ethers.utils.parseEther("1"),
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

    vaultAsAlice = Vault__factory.connect(vault.address, alice);
    vaultAsBob = Vault__factory.connect(vault.address, bob);
    vaultAsEve = Vault__factory.connect(vault.address, eve);

    miniFLasAlice = MiniFL__factory.connect(miniFL.address, alice);
    miniFLasBob = MiniFL__factory.connect(miniFL.address, bob);
    miniFLasEve = MiniFL__factory.connect(miniFL.address, eve);

    tombWorkerAsEve = TombWorker03__factory.connect(tombWorker.address, eve);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("when worker is initialized", async () => {
    it("should has FTOKEN as a farmingToken in SpookyWorker03", async () => {
      expect(await tombWorker.farmingToken()).to.be.equal(farmToken.address);
    });

    it("should initialized the correct fee and feeDenom", async () => {
      expect(await tombWorker.fee()).to.be.eq("998");
      expect(await tombWorker.feeDenom()).to.be.eq("1000");
    });
  });

  context("when owner is setting worker", async () => {
    describe("#setReinvestConfig", async () => {
      it("should set reinvest config correctly", async () => {
        await expect(
          tombWorker.setReinvestConfig(250, ethers.utils.parseEther("1"), [tshare.address, baseToken.address])
        )
          .to.be.emit(tombWorker, "SetReinvestConfig")
          .withArgs(deployerAddress, 250, ethers.utils.parseEther("1"), [tshare.address, baseToken.address]);
        expect(await tombWorker.reinvestBountyBps()).to.be.eq(250);
        expect(await tombWorker.reinvestThreshold()).to.be.eq(ethers.utils.parseEther("1"));
        expect(await tombWorker.getReinvestPath()).to.deep.eq([tshare.address, baseToken.address]);
      });

      it("should revert when owner set reinvestBountyBps > max", async () => {
        await expect(tombWorker.setReinvestConfig(1000, "0", [tshare.address, baseToken.address])).to.be.revertedWith(
          "exceeded maxReinvestBountyBps"
        );
        expect(await tombWorker.reinvestBountyBps()).to.be.eq(100);
      });

      it("should revert when owner set reinvest path that does not start with TSHARE and end with BTOKEN", async () => {
        await expect(tombWorker.setReinvestConfig(200, "0", [baseToken.address, tshare.address])).to.be.revertedWith(
          "bad _reinvestPath"
        );
      });
    });

    describe("#setMaxReinvestBountyBps", async () => {
      it("should set max reinvest bounty", async () => {
        await tombWorker.setMaxReinvestBountyBps(200);
        expect(await tombWorker.maxReinvestBountyBps()).to.be.eq(200);
      });

      it("should revert when new max reinvest bounty over 30%", async () => {
        await expect(tombWorker.setMaxReinvestBountyBps("3001")).to.be.revertedWith("exceeded 30%");
        expect(await tombWorker.maxReinvestBountyBps()).to.be.eq("900");
      });
    });

    describe("#setTreasuryConfig", async () => {
      it("should successfully set a treasury account", async () => {
        const aliceAddr = aliceAddress;
        await tombWorker.setTreasuryConfig(aliceAddr, REINVEST_BOUNTY_BPS);
        expect(await tombWorker.treasuryAccount()).to.eq(aliceAddr);
      });

      it("should successfully set a treasury bounty", async () => {
        await tombWorker.setTreasuryConfig(DEPLOYER, 499);
        expect(await tombWorker.treasuryBountyBps()).to.eq(499);
      });

      it("should revert when treasury bounty > max reinvest bounty", async () => {
        await expect(tombWorker.setTreasuryConfig(DEPLOYER, parseInt(MAX_REINVEST_BOUNTY) + 1)).to.revertedWith(
          "exceeded maxReinvestBountyBps"
        );
        expect(await tombWorker.treasuryBountyBps()).to.eq(REINVEST_BOUNTY_BPS);
      });

      it("should revert when treasury account set to address(0)", async () => {
        await expect(
          tombWorker.setTreasuryConfig(ethers.constants.AddressZero, parseInt(MAX_REINVEST_BOUNTY))
        ).to.revertedWith("bad _treasuryAccount");
        expect(await tombWorker.treasuryAccount()).to.eq(DEPLOYER);
        expect(await tombWorker.treasuryBountyBps()).to.eq(REINVEST_BOUNTY_BPS);
      });
    });

    describe("#setStrategyOk", async () => {
      it("should set strat ok", async () => {
        await tombWorker.setStrategyOk([aliceAddress], true);
        expect(await tombWorker.okStrats(aliceAddress)).to.be.eq(true);
      });
    });
  });

  context("when user uses LYF", async () => {
    context("#work", async () => {
      it("should allow to open a position without debt", async () => {
        // Deployer deposits 3 BTOKEN to the Vault
        await baseToken.approve(vault.address, ethers.utils.parseEther("3"));
        await vault.deposit(ethers.utils.parseEther("3"));

        // Alice can take 0 debt ok
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
        await vaultAsAlice.work(
          0,
          tombWorker.address,
          ethers.utils.parseEther("0.3"),
          ethers.utils.parseEther("0"),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        // To find health of the position, derive following variables:
        // totalBaseToken = 1.3
        // totalFarmingToken = 0.1
        // userBaseToken = 0.159684250517396851
        // userFarmingToken = 0.012283403885953603

        // health = amount of underlying of lp after converted to BTOKEN
        // = userBaseToken + userFarmingTokenAfterSellToBaseToken

        // Find userFarmingTokenAfterSellToBaseToken from
        // mktSellAMount
        // = [(userFarmingToken * 9980) * (totalBaseToken - userBaseToken)] / [((totalFarmingToken - userFarmingToken) * 10000) + (userFarmingToken * 9980)]
        // = [(0.012283403885953603 * 9980) * (1.3 - 0.159684250517396851)] / [((0.1 - 0.012283403885953603) * 10000) + (0.012283403885953603 * 9980)]
        // = 0.139823800150121109

        // health = userBaseToken + userFarmingTokenAfterSellToBaseToken
        // = 0.159684250517396851 + 0.139823800150121109
        // = 0.29950805066751796
        expect(await tombWorker.health(1)).to.be.equal(ethers.utils.parseEther("0.29950805066751796"));

        // must be able to close position
        await vaultAsAlice.work(
          1,
          tombWorker.address,
          "0",
          "0",
          ethers.constants.MaxUint256.toString(),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        expect(await tombWorker.health(1)).to.be.equal(ethers.constants.Zero);
      });

      it("should not allow to open a position with debt less than MIN_DEBT_SIZE", async () => {
        // Deployer deposits 3 BTOKEN to the Vault
        await baseToken.approve(vault.address, ethers.utils.parseEther("3"));
        await vault.deposit(ethers.utils.parseEther("3"));

        // Alice cannot take 0.3 debt because it is too small
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
        await expect(
          vaultAsAlice.work(
            0,
            tombWorker.address,
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
        // Deployer deposits 3 BTOKEN to the Vault
        await baseToken.approve(vault.address, ethers.utils.parseEther("3"));
        await vault.deposit(ethers.utils.parseEther("3"));

        // Alice cannot take 1 BTOKEN loan because she only put 0.3 BTOKEN as a collateral
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.3"));
        await expect(
          vaultAsAlice.work(
            0,
            tombWorker.address,
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
            tombWorker.address,
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
        // Deployer deposits 3 BTOKEN to the Vault
        const stages: any = {};
        const deposit = ethers.utils.parseEther("3");
        await baseToken.approve(vault.address, deposit);
        await vault.deposit(deposit);

        // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
        const loan = ethers.utils.parseEther("1");
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.work(
          0,
          tombWorker.address,
          ethers.utils.parseEther("1"),
          loan,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        // Her position should have ~2 NATIVE health (minus some small trading fee)
        // To find health of the position, derive following variables:
        // totalBaseToken = 2.999999999999999958
        // totalFarmingToken = 0.1
        // userBaseToken = 1.267216253674334111
        // userFarmingToken = 0.042240541789144470

        // health = amount of underlying of lp after converted to BTOKEN
        // = userBaseToken + userFarmingTokenAfterSellToBaseToken

        // Find userFarmingTokenAfterSellToBaseToken from
        // mktSellAMount
        // = [(userFarmingToken * 9980) * (totalBaseToken - userBaseToken)] / [((totalFarmingToken - userFarmingToken) * 10000) + (userFarmingToken * 9980)]
        // = [(0.042240541789144470 * 9980) * (2.999999999999999958 - 1.267216253674334111)] / [((0.1 - 0.042240541789144470) * 10000) + (0.042240541789144470 * 9980)]
        // = 0.731091001597324380

        // health = userBaseToken + userFarmingTokenAfterSellToBaseToken
        // = 1.267216253674334111 + 0.731091001597324380
        // = 1.998307255271658491

        expect(await tombWorker.health(1)).to.be.eq(ethers.utils.parseEther("1.998307255271658491"));

        // Eve comes and trigger reinvest
        stages["beforeReinvest"] = await TimeHelpers.latest();
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        await tombWorkerAsEve.reinvest();
        stages["afterReinvest"] = await TimeHelpers.latest();
        AssertHelpers.assertAlmostEqual(
          TSHARE_PER_SEC.mul(stages["afterReinvest"].sub(stages["beforeReinvest"]))
            .mul(REINVEST_BOUNTY_BPS)
            .div("10000")
            .toString(),
          (await tshare.balanceOf(eveAddress)).toString()
        );

        await vault.deposit(0); // Random action to trigger interest computation
        const positionInfo = await vault.positionInfo("1");
        expect(positionInfo[0]).to.be.above(ethers.utils.parseEther("2"));
        const interest = ethers.utils.parseEther("0.3"); // 30% interest rate
        AssertHelpers.assertAlmostEqual(positionInfo[1].toString(), interest.add(loan).toString());
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
        // Deployer deposits 3 BTOKEN to the Vault
        const deposit = ethers.utils.parseEther("3");
        await baseToken.approve(vault.address, deposit);
        await vault.deposit(deposit);

        // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
        const loan = ethers.utils.parseEther("1");
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.work(
          0,
          tombWorker.address,
          ethers.utils.parseEther("1"),
          loan,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        await tombWorkerAsEve.reinvest();
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
        await tombWorker.setReinvestConfig("100", "0", [tshare.address, wbnb.address, baseToken.address]);

        const [path, reinvestPath] = await Promise.all([tombWorker.getPath(), tombWorker.getReinvestPath()]);

        // Bob deposits 10 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.deposit(ethers.utils.parseEther("10"));

        // Alice deposits 12 BTOKEN
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("12"));
        await vaultAsAlice.deposit(ethers.utils.parseEther("12"));

        // Position#1: Bob borrows 10 BTOKEN
        await swapHelper.loadReserves(path);
        let accumLp = BigNumber.from(0);
        let workerLpBefore = BigNumber.from(0);
        let totalShare = BigNumber.from(0);
        let shares: Array<BigNumber> = [];
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.work(
          0,
          tombWorker.address,
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

        let expectedShare = workerHelper.computeBalanceToShare(expectedLp, totalShare, workerLpBefore);
        shares.push(expectedShare);
        totalShare = totalShare.add(expectedShare);

        // Expect
        let [workerLpAfter] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
        expect(await tombWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
        expect(
          await tombWorker.shareToBalance(await tombWorker.shares(1)),
          `expect Pos#1 LPs = ${expectedLp}`
        ).to.be.eq(expectedLp);
        expect(await tombWorker.totalShare(), `expect totalShare = ${totalShare}`).to.be.eq(totalShare);
        expect(
          await baseToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisBtoken} BTOKEN debris`
        ).to.be.eq(debrisBtoken);
        expect(
          await farmToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisFtoken} FTOKEN debris`
        ).to.be.eq(debrisFtoken);
        expect(workerLpAfter, `expect Worker to stake ${accumLp} LP`).to.be.eq(accumLp);

        // Position#2: Bob borrows another 2 BTOKEN
        [workerLpBefore] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
        let eveTShareBefore = await tshare.balanceOf(eveAddress);
        let deployerTShareBefore = await tshare.balanceOf(DEPLOYER);
        stages["beforeReinvest"] = await TimeHelpers.latest();
        await swapHelper.loadReserves(path);
        await swapHelper.loadReserves(reinvestPath);
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsBob.work(
          0,
          tombWorker.address,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("2"),
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        stages["afterReinvest"] = await TimeHelpers.latest();
        [workerLpAfter] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
        let eveTShareAfter = await tshare.balanceOf(eveAddress);
        let deployerTShareAfter = await tshare.balanceOf(DEPLOYER);
        let totalRewards = swapHelper.computeTotalRewards(
          workerLpBefore,
          TSHARE_PER_SEC,
          stages["afterReinvest"].sub(stages["beforeReinvest"]),
          ethers.constants.WeiPerEther
        );
        let reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
        let reinvestLeft = totalRewards.sub(reinvestFees);

        let reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
        let reinvestBtoken = reinvestAmts[reinvestAmts.length - 1].add(debrisBtoken);
        let reinvestLp = BigNumber.from(0);
        [reinvestLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
        accumLp = accumLp.add(reinvestLp);

        [expectedLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(
          ethers.utils.parseEther("3"),
          path
        );
        accumLp = accumLp.add(expectedLp);

        expectedShare = workerHelper.computeBalanceToShare(expectedLp, totalShare, workerLpBefore.add(reinvestLp));
        shares.push(expectedShare);
        totalShare = totalShare.add(expectedShare);

        expect(await tombWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
        expect(
          await tombWorker.shareToBalance(await tombWorker.shares(1)),
          `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
        ).to.be.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

        expect(await tombWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.eq(shares[1]);
        expect(
          await tombWorker.shareToBalance(await tombWorker.shares(2)),
          `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
        ).to.be.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

        expect(
          deployerTShareAfter.sub(deployerTShareBefore),
          `expect DEPLOYER to get ${reinvestFees} TSHARE as treasury fees`
        ).to.be.eq(reinvestFees);
        expect(eveTShareAfter.sub(eveTShareBefore), `expect eve's TSHARE to remain the same`).to.be.eq("0");
        expect(workerLpAfter, `expect Worker to stake ${accumLp} LP`).to.be.eq(accumLp);
        expect(
          await baseToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisBtoken} BTOKEN debris`
        ).to.be.eq(debrisBtoken);
        expect(
          await farmToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisFtoken} FTOKEN debris`
        ).to.be.eq(debrisFtoken);

        // Update beforeReinvest timestamp
        stages["beforeReinvest"] = await TimeHelpers.latest();

        // ---------------- Reinvest#1 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        let [workerLPBefore] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
        deployerTShareBefore = await tshare.balanceOf(DEPLOYER);
        eveTShareBefore = await tshare.balanceOf(eveAddress);
        await swapHelper.loadReserves(path);
        await swapHelper.loadReserves(reinvestPath);

        await tombWorkerAsEve.reinvest();
        stages["afterReinvest"] = await TimeHelpers.latest();

        deployerTShareAfter = await tshare.balanceOf(DEPLOYER);
        eveTShareAfter = await tshare.balanceOf(eveAddress);
        [workerLpAfter] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
        totalRewards = swapHelper.computeTotalRewards(
          workerLPBefore,
          TSHARE_PER_SEC,
          stages["afterReinvest"].sub(stages["beforeReinvest"]),
          ethers.constants.WeiPerEther
        );
        reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
        reinvestLeft = totalRewards.sub(reinvestFees);

        reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
        reinvestBtoken = reinvestAmts[reinvestAmts.length - 1].add(debrisBtoken);
        [reinvestLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
        accumLp = accumLp.add(reinvestLp);

        expect(await tombWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
        expect(
          await tombWorker.shareToBalance(await tombWorker.shares(1)),
          `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
        ).to.be.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

        expect(await tombWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.eq(shares[1]);
        expect(
          await tombWorker.shareToBalance(await tombWorker.shares(2)),
          `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
        ).to.be.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

        expect(deployerTShareAfter.sub(deployerTShareBefore), `expect DEPLOYER's TSHARE to remain the same`).to.be.eq(
          "0"
        );
        AssertHelpers.assertBigNumberClosePercent(eveTShareAfter.sub(eveTShareBefore), reinvestFees);
        expect(workerLpAfter).to.be.eq(accumLp);

        // Check Position#1 info
        let [bob1Health, bob1DebtToShare] = await vault.positionInfo("1");
        const bob1ExpectedHealth = await swapHelper.computeLpHealth(
          await tombWorker.shareToBalance(await tombWorker.shares(1)),
          baseToken.address,
          farmToken.address
        );
        expect(bob1Health, `expect Pos#1 health = ${bob1ExpectedHealth}`).to.be.eq(bob1ExpectedHealth);
        expect(bob1Health).to.be.gt(ethers.utils.parseEther("20"));
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bob1DebtToShare.toString());

        // Check Position#2 info
        let [bob2Health, bob2DebtToShare] = await vault.positionInfo("2");
        const bob2ExpectedHealth = await swapHelper.computeLpHealth(
          await tombWorker.shareToBalance(await tombWorker.shares(2)),
          baseToken.address,
          farmToken.address
        );
        expect(bob2Health, `expect Pos#2 health = ${bob2ExpectedHealth}`).to.be.eq(bob2ExpectedHealth);
        expect(bob2Health).to.be.gt(ethers.utils.parseEther("3"));
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), bob2DebtToShare.toString());

        let bobBefore = await baseToken.balanceOf(bobAddress);
        // Bob close position#1
        await vaultAsBob.work(
          1,
          tombWorker.address,
          "0",
          "0",
          ethers.constants.MaxUint256,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        let bobAfter = await baseToken.balanceOf(bobAddress);

        // Check Bob account, Bob must be richer as he earn more from yield
        expect(bobAfter).to.be.gt(bobBefore);

        // Assert MiniFL states
        expect((await miniFL.userInfo(0, bobAddress)).amount).to.be.eq(ethers.utils.parseEther("2"));
        expect((await rewarder1.userInfo(0, bobAddress)).amount).to.be.eq(ethers.utils.parseEther("2"));
        expect(await miniFL.pendingAlpaca(0, bobAddress)).to.be.gt(0);
        expect(await rewarder1.pendingToken(0, bobAddress)).to.be.gt(0);

        // Bob add another 10 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.work(
          2,
          tombWorker.address,
          ethers.utils.parseEther("10"),
          0,
          "0", // max return = 0, don't return NATIVE to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        // Assert MiniFL states
        expect((await miniFL.userInfo(0, bobAddress)).amount).to.be.eq(ethers.utils.parseEther("2"));
        expect((await rewarder1.userInfo(0, bobAddress)).amount).to.be.eq(ethers.utils.parseEther("2"));
        expect(await miniFL.pendingAlpaca(0, bobAddress)).to.be.gt(0);
        expect(await rewarder1.pendingToken(0, bobAddress)).to.be.gt(0);

        bobBefore = await baseToken.balanceOf(bobAddress);
        // Bob close position#2
        await vaultAsBob.work(
          2,
          tombWorker.address,
          "0",
          "0",
          "1000000000000000000000000000000",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        bobAfter = await baseToken.balanceOf(bobAddress);

        // Assert MiniFL states
        expect((await miniFL.userInfo(0, bobAddress)).amount).to.be.eq(0);
        expect((await rewarder1.userInfo(0, bobAddress)).amount).to.be.eq(0);
        expect(await miniFL.pendingAlpaca(0, bobAddress)).to.be.gt(0);
        expect(await rewarder1.pendingToken(0, bobAddress)).to.be.gt(0);

        // Check Bob account, Bob must be richer as she earned from leverage yield farm without getting liquidated
        expect(bobAfter).to.be.gt(bobBefore);

        // Expect to be reverted if bob try to claim pendingAlpaca & pendingToken now
        await expect(miniFLasBob.harvest(0)).to.be.reverted;

        // Seed reward liquidity
        await alpacaToken.mint(miniFL.address, ethers.utils.parseEther("888888888888"));
        await extraToken.mint(rewarder1.address, ethers.utils.parseEther("888888888888"));

        // Now Bob can harvest rewards
        const alpaceBefore = await alpacaToken.balanceOf(bobAddress);
        const extraBefore = await extraToken.balanceOf(bobAddress);

        await miniFLasBob.harvest(0);

        // Bob should earn rewards
        expect(await alpacaToken.balanceOf(bobAddress)).to.be.gt(alpaceBefore);
        expect(await extraToken.balanceOf(bobAddress)).to.be.gt(extraBefore);
      });

      it("should close position correctly when user holds mix positions of leveraged and non-leveraged", async () => {
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

        const [path, reinvestPath] = await Promise.all([tombWorker.getPath(), tombWorker.getReinvestPath()]);

        // Set Reinvest bounty to 10% of the reward
        await tombWorker.setReinvestConfig("100", "0", [tshare.address, wbnb.address, baseToken.address]);

        // Bob deposits 10 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.deposit(ethers.utils.parseEther("10"));

        // Alice deposits 12 BTOKEN
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("12"));
        await vaultAsAlice.deposit(ethers.utils.parseEther("12"));

        // Position#1: Bob borrows 10 BTOKEN
        await swapHelper.loadReserves(path);
        let accumLp = BigNumber.from(0);
        let workerLpBefore = BigNumber.from(0);
        let totalShare = BigNumber.from(0);
        let shares: Array<BigNumber> = [];
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.work(
          0,
          tombWorker.address,
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

        let expectedShare = workerHelper.computeBalanceToShare(expectedLp, totalShare, workerLpBefore);
        shares.push(expectedShare);
        totalShare = totalShare.add(expectedShare);

        // Expect
        let [workerLpAfter] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
        expect(await tombWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
        expect(
          await tombWorker.shareToBalance(await tombWorker.shares(1)),
          `expect Pos#1 LPs = ${expectedLp}`
        ).to.be.eq(expectedLp);
        expect(await tombWorker.totalShare(), `expect totalShare = ${totalShare}`).to.be.eq(totalShare);
        expect(
          await baseToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisBtoken} BTOKEN debris`
        ).to.be.eq(debrisBtoken);
        expect(
          await farmToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisFtoken} FTOKEN debris`
        ).to.be.eq(debrisFtoken);
        expect(workerLpAfter, `expect Worker to stake ${accumLp} LP`).to.be.eq(accumLp);

        // Update beforeReinvest
        stages["beforeReinvest"] = await TimeHelpers.latest();

        // Position#2: Bob borrows another 2 BTOKEN
        [workerLpBefore] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
        let eveTShareBefore = await tshare.balanceOf(eveAddress);
        let deployerTShareBefore = await tshare.balanceOf(DEPLOYER);

        // Position#2: Bob open 1x position with 3 BTOKEN
        await swapHelper.loadReserves(path);
        await swapHelper.loadReserves(reinvestPath);
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("3"));
        await vaultAsBob.work(
          0,
          tombWorker.address,
          ethers.utils.parseEther("3"),
          "0",
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        [workerLpAfter] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
        let eveTShareAfter = await tshare.balanceOf(eveAddress);
        let deployerTShareAfter = await tshare.balanceOf(DEPLOYER);
        stages["afterReinvest"] = await TimeHelpers.latest();
        let totalRewards = swapHelper.computeTotalRewards(
          workerLpBefore,
          TSHARE_PER_SEC,
          stages["afterReinvest"].sub(stages["beforeReinvest"]),
          ethers.constants.WeiPerEther
        );
        let reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
        let reinvestLeft = totalRewards.sub(reinvestFees);

        let reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
        let reinvestBtoken = reinvestAmts[reinvestAmts.length - 1].add(debrisBtoken);
        let reinvestLp = BigNumber.from(0);
        [reinvestLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
        accumLp = accumLp.add(reinvestLp);

        [expectedLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(
          ethers.utils.parseEther("3"),
          path
        );
        accumLp = accumLp.add(expectedLp);

        expectedShare = workerHelper.computeBalanceToShare(expectedLp, totalShare, workerLpBefore.add(reinvestLp));
        shares.push(expectedShare);
        totalShare = totalShare.add(expectedShare);

        expect(await tombWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
        expect(
          await tombWorker.shareToBalance(await tombWorker.shares(1)),
          `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
        ).to.be.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

        expect(await tombWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.eq(shares[1]);
        expect(
          await tombWorker.shareToBalance(await tombWorker.shares(2)),
          `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
        ).to.be.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

        expect(
          deployerTShareAfter.sub(deployerTShareBefore),
          `expect DEPLOYER to get ${reinvestFees} TSHARE as treasury fees`
        ).to.be.eq(reinvestFees);
        expect(eveTShareAfter.sub(eveTShareBefore), `expect eve's TSHARE to remain the same`).to.be.eq("0");
        expect(workerLpAfter, `expect Worker to stake ${accumLp} LP`).to.be.eq(accumLp);
        expect(
          await baseToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisBtoken} BTOKEN debris`
        ).to.be.eq(debrisBtoken);
        expect(
          await farmToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisFtoken} FTOKEN debris`
        ).to.be.eq(debrisFtoken);

        // Update beforeReinvest
        stages["beforeReinvest"] = await TimeHelpers.latest();

        // ---------------- Reinvest#1 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        let [workerLPBefore] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
        deployerTShareBefore = await tshare.balanceOf(DEPLOYER);
        eveTShareBefore = await tshare.balanceOf(eveAddress);
        await swapHelper.loadReserves(path);
        await swapHelper.loadReserves(reinvestPath);

        await tombWorkerAsEve.reinvest();
        stages["afterReinvest"] = await TimeHelpers.latest();

        deployerTShareAfter = await tshare.balanceOf(DEPLOYER);
        eveTShareAfter = await tshare.balanceOf(eveAddress);
        [workerLpAfter] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
        totalRewards = swapHelper.computeTotalRewards(
          workerLPBefore,
          TSHARE_PER_SEC,
          stages["afterReinvest"].sub(stages["beforeReinvest"]),
          ethers.constants.WeiPerEther
        );
        reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
        reinvestLeft = totalRewards.sub(reinvestFees);

        reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
        reinvestBtoken = reinvestAmts[reinvestAmts.length - 1].add(debrisBtoken);
        [reinvestLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
        accumLp = accumLp.add(reinvestLp);

        expect(await tombWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
        expect(
          await tombWorker.shareToBalance(await tombWorker.shares(1)),
          `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
        ).to.be.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

        expect(await tombWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.eq(shares[1]);
        expect(
          await tombWorker.shareToBalance(await tombWorker.shares(2)),
          `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
        ).to.be.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

        expect(deployerTShareAfter.sub(deployerTShareBefore), `expect DEPLOYER's TSHARE to remain the same`).to.be.eq(
          "0"
        );
        AssertHelpers.assertBigNumberClosePercent(eveTShareAfter.sub(eveTShareBefore), reinvestFees);
        expect(workerLpAfter).to.be.eq(accumLp);

        // Check Position#1 info
        let [bob1Health, bob1DebtToShare] = await vault.positionInfo("1");
        const bob1ExpectedHealth = await swapHelper.computeLpHealth(
          await tombWorker.shareToBalance(await tombWorker.shares(1)),
          baseToken.address,
          farmToken.address
        );
        expect(bob1Health, `expect Pos#1 health = ${bob1ExpectedHealth}`).to.be.eq(bob1ExpectedHealth);
        expect(bob1Health).to.be.gt(ethers.utils.parseEther("20"));
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bob1DebtToShare.toString());

        // Check Position#2 info
        let [bob2Health, bob2DebtToShare] = await vault.positionInfo("2");
        const bob2ExpectedHealth = await swapHelper.computeLpHealth(
          await tombWorker.shareToBalance(await tombWorker.shares(2)),
          baseToken.address,
          farmToken.address
        );
        expect(bob2Health, `expect Pos#2 health = ${bob2ExpectedHealth}`).to.be.eq(bob2ExpectedHealth);
        expect(bob2Health).to.be.gt(ethers.utils.parseEther("3"));
        AssertHelpers.assertAlmostEqual("0", bob2DebtToShare.toString());

        let bobBefore = await baseToken.balanceOf(bobAddress);
        // Bob close position#1
        await vaultAsBob.work(
          1,
          tombWorker.address,
          "0",
          "0",
          "1000000000000000000000",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        let bobAfter = await baseToken.balanceOf(bobAddress);

        // Check Bob account, Bob must be richer as he earn more from yield
        expect(bobAfter).to.be.gt(bobBefore);

        // Bob add another 10 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.work(
          2,
          tombWorker.address,
          ethers.utils.parseEther("10"),
          0,
          "0", // max return = 0, don't return NATIVE to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        bobBefore = await baseToken.balanceOf(bobAddress);
        // Bob close position#2
        await vaultAsBob.work(
          2,
          tombWorker.address,
          "0",
          "0",
          "1000000000000000000000000000000",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        bobAfter = await baseToken.balanceOf(bobAddress);

        // Check Bob account, Bob must be richer as she earned from leverage yield farm without getting liquidated
        // But bob shouldn't earn more ALPACAs from closing position#2
        expect(bobAfter).to.be.gt(bobBefore);
      });
    });

    context("#kill", async () => {
      it("should not allow user not whitelisted to liquidate", async () => {
        await expect(vaultAsBob.kill("1")).to.be.revertedWith("!whitelisted liquidator");
      });

      it("should not able to liquidate healthy position", async () => {
        // Deployer deposits 3 BTOKEN to the Vault
        const deposit = ethers.utils.parseEther("3");
        await baseToken.approve(vault.address, deposit);
        await vault.deposit(deposit);

        // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
        const loan = ethers.utils.parseEther("1");
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.work(
          0,
          tombWorker.address,
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
        await tombWorkerAsEve.reinvest();
        await vault.deposit(0); // Random action to trigger interest computation

        // You can't liquidate her position yet
        await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        await expect(vaultAsEve.kill("1")).to.be.revertedWith("can't liquidate");
      });

      it("should be able to liquidate bad position", async () => {
        // Deployer deposits 3 BTOKEN to the Vault
        const deposit = ethers.utils.parseEther("3");
        await baseToken.approve(vault.address, deposit);
        await vault.deposit(deposit);

        // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
        const loan = ethers.utils.parseEther("1");
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.work(
          0,
          tombWorker.address,
          ethers.utils.parseEther("1"),
          loan,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        await tombWorkerAsEve.reinvest();
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
        const toBeLiquidatedValue = await tombWorker.health(1);
        const liquidationBounty = toBeLiquidatedValue.mul(KILL_PRIZE_BPS).div(10000);
        const treasuryKillFees = toBeLiquidatedValue.mul(KILL_TREASURY_BPS).div(10000);
        const totalLiquidationFees = liquidationBounty.add(treasuryKillFees);
        const eveBalanceBefore = await baseToken.balanceOf(eveAddress);
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

        // Alice creates a new position again
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.work(
          0,
          tombWorker.address,
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
          tombWorker.address,
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
          tombWorker.address,
          ethers.utils.parseEther("10"),
          ethers.utils.parseEther("10"),
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        await farmToken.mint(deployerAddress, ethers.utils.parseEther("100"));
        await farmToken.approve(router.address, ethers.utils.parseEther("100"));

        // Price swing 10%
        // Add more token to the pool equals to sqrt(10*((0.1)**2) / 9) - 0.1 = 0.005409255338945984, (0.1 is the balance of token in the pool)
        await router.swapExactTokensForTokens(
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
        await router.swapExactTokensForTokens(
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
        await router.swapExactTokensForTokens(
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
        await router.swapExactTokensForTokens(
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
          tombWorker.address,
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
        await farmToken.approve(router.address, ethers.utils.parseEther("100"));
        await router.swapExactTokensForTokens(
          ethers.utils.parseEther("100"),
          "0",
          [farmToken.address, baseToken.address],
          deployerAddress,
          FOREVER
        );

        // Alice liquidates Bob position#1
        const vaultBaseBefore = await baseToken.balanceOf(vault.address);
        let aliceBefore = await baseToken.balanceOf(aliceAddress);
        await expect(vaultAsAlice.kill("1")) // at health = 0.003000997994240237
          .to.emit(vaultAsAlice, "Kill");

        let aliceAfter = await baseToken.balanceOf(aliceAddress);

        // Vault balance is increase by liquidation (0.002700898194816214 = 0.9 * 0.003000997994240237)
        AssertHelpers.assertAlmostEqual(
          vaultBaseBefore.add(ethers.utils.parseEther("0.002700898194816214")).toString(),
          (await baseToken.balanceOf(vault.address)).toString()
        );

        // Alice is liquidator, Alice should receive 10% Kill prize
        // BTOKEN back from liquidation 0.003000997994240237, 3% of it is 0.000300099799424023
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther("0.000300099799424023").toString(),
          aliceAfter.sub(aliceBefore).toString()
        );

        // Alice withdraws 2 BOKTEN
        aliceBefore = await baseToken.balanceOf(aliceAddress);
        await vaultAsAlice.withdraw(await vault.balanceOf(aliceAddress));
        aliceAfter = await baseToken.balanceOf(aliceAddress);

        // alice gots 2/12 * 10.002700898194816214 = 1.667116816365802702
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther("1.667116816365802702").toString(),
          aliceAfter.sub(aliceBefore).toString()
        );
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

        // Set Reinvest bounty to 1% of the reward
        await tombWorker.setReinvestConfig("100", "0", [tshare.address, wbnb.address, baseToken.address]);

        const [path, reinvestPath] = await Promise.all([tombWorker.getPath(), tombWorker.getReinvestPath()]);

        // Bob deposits 10 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.deposit(ethers.utils.parseEther("10"));

        // Alice deposits 12 BTOKEN
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("12"));
        await vaultAsAlice.deposit(ethers.utils.parseEther("12"));

        // Position#1: Bob borrows 10 BTOKEN
        await swapHelper.loadReserves(path);
        let accumLp = BigNumber.from(0);
        let workerLpBefore = BigNumber.from(0);
        let totalShare = BigNumber.from(0);
        let shares: Array<BigNumber> = [];
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.work(
          0,
          tombWorker.address,
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

        let expectedShare = workerHelper.computeBalanceToShare(expectedLp, totalShare, workerLpBefore);
        shares.push(expectedShare);
        totalShare = totalShare.add(expectedShare);

        // Expect
        let [workerLpAfter] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
        expect(await tombWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
        expect(
          await tombWorker.shareToBalance(await tombWorker.shares(1)),
          `expect Pos#1 LPs = ${expectedLp}`
        ).to.be.eq(expectedLp);
        expect(await tombWorker.totalShare(), `expect totalShare = ${totalShare}`).to.be.eq(totalShare);
        expect(
          await baseToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisBtoken} BTOKEN debris`
        ).to.be.eq(debrisBtoken);
        expect(
          await farmToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisFtoken} FTOKEN debris`
        ).to.be.eq(debrisFtoken);
        expect(workerLpAfter, `expect Worker to stake ${accumLp} LP`).to.be.eq(accumLp);

        // Update beforeReinvest
        stages["beforeReinvest"] = await TimeHelpers.latest();

        // Position#2: Bob borrows another 2 BTOKEN
        [workerLpBefore] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
        let eveTShareBefore = await tshare.balanceOf(eveAddress);
        let deployerTShareBefore = await tshare.balanceOf(DEPLOYER);
        await swapHelper.loadReserves(path);
        await swapHelper.loadReserves(reinvestPath);
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.work(
          0,
          tombWorker.address,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("2"),
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        stages["afterReinvest"] = await TimeHelpers.latest();
        [workerLpAfter] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
        let eveTShareAfter = await tshare.balanceOf(eveAddress);
        let deployerTShareAfter = await tshare.balanceOf(DEPLOYER);
        let totalRewards = swapHelper.computeTotalRewards(
          workerLpBefore,
          TSHARE_PER_SEC,
          stages["afterReinvest"].sub(stages["beforeReinvest"]),
          ethers.constants.WeiPerEther
        );
        let reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
        let reinvestLeft = totalRewards.sub(reinvestFees);

        let reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
        let reinvestBtoken = reinvestAmts[reinvestAmts.length - 1].add(debrisBtoken);
        let reinvestLp = BigNumber.from(0);
        [reinvestLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
        accumLp = accumLp.add(reinvestLp);

        [expectedLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(
          ethers.utils.parseEther("3"),
          path
        );
        accumLp = accumLp.add(expectedLp);

        expectedShare = workerHelper.computeBalanceToShare(expectedLp, totalShare, workerLpBefore.add(reinvestLp));
        shares.push(expectedShare);
        totalShare = totalShare.add(expectedShare);

        expect(await tombWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
        expect(
          await tombWorker.shareToBalance(await tombWorker.shares(1)),
          `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
        ).to.be.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

        expect(await tombWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.eq(shares[1]);
        expect(
          await tombWorker.shareToBalance(await tombWorker.shares(2)),
          `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
        ).to.be.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

        expect(
          deployerTShareAfter.sub(deployerTShareBefore),
          `expect DEPLOYER to get ${reinvestFees} TSHARE as treasury fees`
        ).to.be.eq(reinvestFees);
        expect(eveTShareAfter.sub(eveTShareBefore), `expect eve's TSHARE to remain the same`).to.be.eq("0");
        expect(workerLpAfter, `expect Worker to stake ${accumLp} LP`).to.be.eq(accumLp);
        expect(
          await baseToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisBtoken} BTOKEN debris`
        ).to.be.eq(debrisBtoken);
        expect(
          await farmToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisFtoken} FTOKEN debris`
        ).to.be.eq(debrisFtoken);

        // Update beforeReinvest
        stages["beforeReinvest"] = await TimeHelpers.latest();

        // ---------------- Reinvest#1 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        let [workerLPBefore] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
        deployerTShareBefore = await tshare.balanceOf(DEPLOYER);
        eveTShareBefore = await tshare.balanceOf(eveAddress);
        await swapHelper.loadReserves(path);
        await swapHelper.loadReserves(reinvestPath);

        await tombWorkerAsEve.reinvest();
        stages["afterReinvest"] = await TimeHelpers.latest();

        deployerTShareAfter = await tshare.balanceOf(DEPLOYER);
        eveTShareAfter = await tshare.balanceOf(eveAddress);
        [workerLpAfter] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
        totalRewards = swapHelper.computeTotalRewards(
          workerLPBefore,
          TSHARE_PER_SEC,
          stages["afterReinvest"].sub(stages["beforeReinvest"]),
          ethers.constants.WeiPerEther
        );
        reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
        reinvestLeft = totalRewards.sub(reinvestFees);

        reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
        reinvestBtoken = reinvestAmts[reinvestAmts.length - 1].add(debrisBtoken);
        [reinvestLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
        accumLp = accumLp.add(reinvestLp);

        expect(await tombWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
        expect(
          await tombWorker.shareToBalance(await tombWorker.shares(1)),
          `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
        ).to.be.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

        expect(await tombWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.eq(shares[1]);
        expect(
          await tombWorker.shareToBalance(await tombWorker.shares(2)),
          `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
        ).to.be.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

        expect(deployerTShareAfter.sub(deployerTShareBefore), `expect DEPLOYER's TSHARE to remain the same`).to.be.eq(
          "0"
        );
        AssertHelpers.assertBigNumberClose(eveTShareAfter.sub(eveTShareBefore), reinvestFees, 10);
        expect(workerLpAfter).to.be.eq(accumLp);

        // Check Position#1 info
        let [bob1Health, bob1DebtToShare] = await vault.positionInfo("1");
        const bob1ExpectedHealth = await swapHelper.computeLpHealth(
          await tombWorker.shareToBalance(await tombWorker.shares(1)),
          baseToken.address,
          farmToken.address
        );
        expect(bob1Health, `expect Pos#1 health = ${bob1ExpectedHealth}`).to.be.eq(bob1ExpectedHealth);
        expect(bob1Health).to.be.gt(ethers.utils.parseEther("20"));
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bob1DebtToShare.toString());

        // Check Position#2 info
        let [alice2Health, alice2DebtToShare] = await vault.positionInfo("2");
        const alice2ExpectedHealth = await swapHelper.computeLpHealth(
          await tombWorker.shareToBalance(await tombWorker.shares(2)),
          baseToken.address,
          farmToken.address
        );
        expect(alice2Health, `expect Pos#2 health = ${alice2ExpectedHealth}`).to.be.eq(alice2ExpectedHealth);
        expect(alice2Health).to.be.gt(ethers.utils.parseEther("3"));
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), alice2DebtToShare.toString());

        const bobBefore = await baseToken.balanceOf(bobAddress);
        // Bob close position#1
        await vaultAsBob.work(
          1,
          tombWorker.address,
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
          tombWorker.address,
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
          tombWorker.address,
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

            const [path, reinvestPath] = await Promise.all([tombWorker.getPath(), tombWorker.getReinvestPath()]);

            // Set Reinvest bounty to 1% of the reward
            await tombWorker.setReinvestConfig("100", "0", [tshare.address, wbnb.address, baseToken.address]);

            // Bob deposits 10 BTOKEN
            await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
            await vaultAsBob.deposit(ethers.utils.parseEther("10"));

            // Action 1: Bob a new position. Providing 10 BTOKEN and borrow 10 BTOKEN
            const borrowedAmount = ethers.utils.parseEther("10");
            const principalAmount = ethers.utils.parseEther("10");
            await swapHelper.loadReserves(path);
            await swapHelper.loadReserves(reinvestPath);

            await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
            let [workerLpBefore] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
            await vaultAsBob.work(
              0,
              tombWorker.address,
              principalAmount,
              borrowedAmount,
              "0", // max return = 0, don't return NATIVE to the debt
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
              )
            );
            let [workerLpAfter] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);

            const [expectedLp, debrisBtoken] = await swapHelper.computeOneSidedOptimalLp(
              borrowedAmount.add(principalAmount),
              path
            );
            expect(workerLpAfter.sub(workerLpBefore)).to.eq(expectedLp);

            const deployerTShareBefore = await tshare.balanceOf(DEPLOYER);
            const bobBefore = await baseToken.balanceOf(bobAddress);
            const [bobHealthBefore] = await vault.positionInfo("1");
            const lpUnderBobPosition = await tombWorker.shareToBalance(await tombWorker.shares(1));
            const liquidatedLp = lpUnderBobPosition.div(2);
            const returnDebt = ethers.utils.parseEther("6");
            [workerLpBefore] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);

            // Load reserve
            await swapHelper.loadReserves(path);
            await swapHelper.loadReserves(reinvestPath);
            stages["beforeReinvest"] = await TimeHelpers.latest();

            await vaultAsBob.work(
              1,
              tombWorker.address,
              "0",
              "0",
              returnDebt,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [
                  partialCloseStrat.address,
                  ethers.utils.defaultAbiCoder.encode(["uint256", "uint256", "uint256"], [liquidatedLp, returnDebt, 0]),
                ]
              )
            );
            const bobAfter = await baseToken.balanceOf(bobAddress);
            const deployerTShareAfter = await tshare.balanceOf(DEPLOYER);
            stages["afterReinvest"] = await TimeHelpers.latest();

            // Compute reinvest
            const [reinvestFees, reinvestLp] = await swapHelper.computeReinvestLp(
              workerLpBefore,
              debrisBtoken,
              TSHARE_PER_SEC,
              BigNumber.from(REINVEST_BOUNTY_BPS),
              reinvestPath,
              path,
              stages["afterReinvest"].sub(stages["beforeReinvest"]),
              ethers.constants.WeiPerEther
            );

            // Compute liquidate
            const [btokenAmount, ftokenAmount] = await swapHelper.computeRemoveLiquidiy(
              baseToken.address,
              farmToken.address,
              liquidatedLp
            );
            const sellFtokenAmounts = await swapHelper.computeSwapExactTokensForTokens(
              ftokenAmount,
              await tombWorker.getReversedPath(),
              true
            );
            const liquidatedBtoken = sellFtokenAmounts[sellFtokenAmounts.length - 1].add(btokenAmount).sub(returnDebt);

            expect(deployerTShareAfter.sub(deployerTShareBefore), `expect Deployer to get ${reinvestFees}`).to.be.eq(
              reinvestFees
            );
            expect(bobAfter.sub(bobBefore), `expect Bob get ${liquidatedBtoken}`).to.be.eq(liquidatedBtoken);
            // Check Bob position info
            const [bobHealth, bobDebtToShare] = await vault.positionInfo("1");
            // Bob's health after partial close position must be 50% less than before
            // due to he exit half of lp under his position
            expect(bobHealth).to.be.lt(bobHealthBefore.div(2));
            // Bob's debt should be left only 4 BTOKEN due he said he wants to return at max 4 BTOKEN
            expect(bobDebtToShare).to.be.eq(borrowedAmount.sub(returnDebt));
            // Check LP deposited by Worker on MasterChef
            [workerLpAfter] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
            // LP tokens + 0.000207570473714694 LP from reinvest of worker should be decreased by lpUnderBobPosition/2
            // due to Bob execute StrategyClosePartialLiquidate
            expect(workerLpAfter).to.be.eq(workerLpBefore.add(reinvestLp).sub(lpUnderBobPosition.div(2)));
          });
        });

        context("when debt is lessDebt", async () => {
          // back cannot be less than lessDebt as less debt is Min(debt, back, maxReturn) = debt
          it("should pay back all debt and return 'liquidatedAmount - debt' BTOKEN to user", async () => {
            const stages: any = {};
            // Set Vault's debt interests to 0% per year
            await simpleVaultConfig.setParams(
              ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,
              "0", // 0% per year
              "1000", // 10% reserve pool
              "1000", // 10% Kill prize
              wbnb.address,
              wNativeRelayer.address,
              miniFL.address,
              KILL_TREASURY_BPS,
              deployerAddress
            );

            const [path, reinvestPath] = await Promise.all([tombWorker.getPath(), tombWorker.getReinvestPath()]);

            // Bob deposits 10 BTOKEN
            await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
            await vaultAsBob.deposit(ethers.utils.parseEther("10"));

            // Action 1: Bob a new position. Providing 10 BTOKEN and borrow 10 BTOKEN
            const borrowedAmount = ethers.utils.parseEther("10");
            const principalAmount = ethers.utils.parseEther("10");
            await swapHelper.loadReserves(path);
            await swapHelper.loadReserves(reinvestPath);

            await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
            let [workerLpBefore] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
            await vaultAsBob.work(
              0,
              tombWorker.address,
              principalAmount,
              borrowedAmount,
              "0", // max return = 0, don't return BTOKEN to the debt
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
              )
            );
            let [workerLpAfter] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);

            const [expectedLp, debrisBtoken] = await swapHelper.computeOneSidedOptimalLp(
              borrowedAmount.add(principalAmount),
              path
            );
            expect(workerLpAfter.sub(workerLpBefore)).to.eq(expectedLp);

            // Bob think he made enough. He now wants to close position partially.
            // He close 50% of his position and return all debt
            const deployerTShareBefore = await tshare.balanceOf(DEPLOYER);
            const bobBefore = await baseToken.balanceOf(bobAddress);
            const [bobHealthBefore] = await vault.positionInfo("1");
            const lpUnderBobPosition = await tombWorker.shareToBalance(await tombWorker.shares(1));
            [workerLpBefore] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);

            // Load reserve
            await swapHelper.loadReserves(path);
            await swapHelper.loadReserves(reinvestPath);
            stages["beforeReinvest"] = await TimeHelpers.latest();

            await vaultAsBob.work(
              1,
              tombWorker.address,
              "0",
              "0",
              ethers.utils.parseEther("5000000000"),
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [
                  partialCloseStrat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ["uint256", "uint256", "uint256"],
                    [lpUnderBobPosition.div(2), ethers.utils.parseEther("5000000000"), 0]
                  ),
                ]
              )
            );
            const bobAfter = await baseToken.balanceOf(bobAddress);
            const deployerTShareAfter = await tshare.balanceOf(DEPLOYER);
            stages["afterReinvest"] = await TimeHelpers.latest();

            // Compute reinvest
            const [reinvestFees, reinvestLp] = await swapHelper.computeReinvestLp(
              workerLpBefore,
              debrisBtoken,
              TSHARE_PER_SEC,
              BigNumber.from(REINVEST_BOUNTY_BPS),
              reinvestPath,
              path,
              stages["afterReinvest"].sub(stages["beforeReinvest"]),
              ethers.constants.WeiPerEther
            );

            // Compute liquidate
            const [btokenAmount, ftokenAmount] = await swapHelper.computeRemoveLiquidiy(
              baseToken.address,
              farmToken.address,
              lpUnderBobPosition.div(2)
            );
            const sellFtokenAmounts = await swapHelper.computeSwapExactTokensForTokens(
              ftokenAmount,
              await tombWorker.getReversedPath(),
              true
            );
            const liquidatedBtoken = sellFtokenAmounts[sellFtokenAmounts.length - 1]
              .add(btokenAmount)
              .sub(borrowedAmount);

            expect(
              deployerTShareAfter.sub(deployerTShareBefore),
              `expect Deployer to get ${reinvestFees} TSHARE`
            ).to.eq(reinvestFees);
            expect(bobAfter.sub(bobBefore), `expect Bob get ${liquidatedBtoken} BTOKEN`).to.be.eq(liquidatedBtoken);
            // Check Bob position info
            const [bobHealth, bobDebtVal] = await vault.positionInfo("1");
            // Bob's health after partial close position must be 50% less than before
            // due to he exit half of lp under his position
            expect(bobHealth).to.be.lt(bobHealthBefore.div(2));
            // Bob's debt should be 0 BTOKEN due he said he wants to return at max 5,000,000,000 BTOKEN (> debt, return all debt)
            expect(bobDebtVal).to.be.eq("0");
            // Check LP deposited by Worker on MasterChef
            [workerLpAfter] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
            // LP tokens of worker should be decreased by lpUnderBobPosition/2
            // due to Bob execute StrategyClosePartialLiquidate
            expect(workerLpAfter).to.be.eq(workerLpBefore.add(reinvestLp).sub(lpUnderBobPosition.div(2)));
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
              miniFL.address,
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
              tombWorker.address,
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
            const lpUnderBobPosition = await tombWorker.shareToBalance(await tombWorker.shares(1));
            // Bob closes position with maxReturn 0 and liquidate full of his position
            // Expect that Bob will not be able to close his position as he liquidate all underlying assets but not paydebt
            // which made his position debt ratio higher than allow work factor
            await expect(
              vaultAsBob.work(
                1,
                tombWorker.address,
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
            ).to.be.revertedWith("bad work factor");
          });
        });
      });
    });

    context("#addCollateral", async () => {
      const deposit = ethers.utils.parseEther("3");
      const borrowedAmount = ethers.utils.parseEther("1");

      beforeEach(async () => {
        // Deployer deposits 3 BTOKEN to the Vault
        await baseToken.approve(vault.address, deposit);
        await vault.deposit(deposit);

        // Now Alice can borrow 1 BTOKEN + 1 BTOKEN of her to create a new position
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await swapHelper.loadReserves(await tombWorker.getPath());
        await vaultAsAlice.work(
          0,
          tombWorker.address,
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
          await tombWorker.getPath()
        );
        const expectedHealth = await swapHelper.computeLpHealth(expectedLp, baseToken.address, farmToken.address);

        expect(await tombWorker.health(1)).to.be.eq(expectedHealth);
        expect(await tombWorker.shares(1)).to.eq(expectedLp);
        expect(await tombWorker.shareToBalance(await tombWorker.shares(1))).to.eq(expectedLp);
      });

      async function successBtokenOnly(lastWorkBlockTimestamp: BigNumber, goRouge: boolean) {
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        let accumLp = await tombWorker.shareToBalance(await tombWorker.shares(1));
        const [workerLpBefore] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
        const debris = await baseToken.balanceOf(addStrat.address);

        const reinvestPath = await tombWorker.getReinvestPath();
        const path = await tombWorker.getPath();

        let reserves = await swapHelper.loadReserves(reinvestPath);
        reserves.push(...(await swapHelper.loadReserves(path)));

        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.addCollateral(
          1,
          ethers.utils.parseEther("1"),
          goRouge,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const blockAfter = await TimeHelpers.latest();
        const totalRewards = swapHelper.computeTotalRewards(
          workerLpBefore,
          TSHARE_PER_SEC,
          blockAfter.sub(lastWorkBlockTimestamp),
          ethers.constants.WeiPerEther
        );
        const totalReinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
        const reinvestLeft = totalRewards.sub(totalReinvestFees);
        const reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);

        const reinvestBtoken = reinvestAmts[reinvestAmts.length - 1].add(debris);
        const [reinvestLp] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
        accumLp = accumLp.add(reinvestLp);

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
        expect(await tombWorker.shares(1), `expect Alice's shares = ${accumLp}`).to.be.eq(accumLp);
        expect(
          await tombWorker.shareToBalance(await tombWorker.shares(1)),
          `expect Alice's staked LPs = ${accumLp}`
        ).to.be.eq(accumLp);
        expect(
          await tshare.balanceOf(DEPLOYER),
          `expect Deployer gets ${ethers.utils.formatEther(totalReinvestFees)} TSHARE`
        ).to.be.eq(totalReinvestFees);
      }

      async function successTwoSides(lastWorkBlockTimestamp: BigNumber, goRouge: boolean) {
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

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

        let accumLp = await tombWorker.shareToBalance(await tombWorker.shares(1));
        const [workerLpBefore] = await tshareRewardPool.userInfo(POOL_ID, tombWorker.address);
        const debris = await baseToken.balanceOf(addStrat.address);

        const reinvestPath = await tombWorker.getReinvestPath();
        const path = await tombWorker.getPath();

        let reserves = await swapHelper.loadReserves(reinvestPath);
        reserves.push(...(await swapHelper.loadReserves(path)));

        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await farmTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.1"));
        await vaultAsAlice.addCollateral(
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
        const blockAfter = await TimeHelpers.latest();
        const totalRewards = swapHelper.computeTotalRewards(
          workerLpBefore,
          TSHARE_PER_SEC,
          blockAfter.sub(lastWorkBlockTimestamp),
          ethers.constants.WeiPerEther
        );
        const totalReinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
        const reinvestLeft = totalRewards.sub(totalReinvestFees);
        const reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);

        const reinvestBtoken = reinvestAmts[reinvestAmts.length - 1].add(debris);
        const [reinvestLp] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
        accumLp = accumLp.add(reinvestLp);

        // Compute add collateral
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
        expect(await tombWorker.shares(1), `expect Alice's shares = ${accumLp}`).to.be.eq(accumLp);
        expect(
          await tombWorker.shareToBalance(await tombWorker.shares(1)),
          `expect Alice's staked LPs = ${accumLp}`
        ).to.be.eq(accumLp);
        expect(await tshare.balanceOf(DEPLOYER), `expect Deployer gets ${totalReinvestFees} TSHARE`).to.be.eq(
          totalReinvestFees
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
        await farmToken.approve(router.address, ethers.utils.parseEther("888"));
        await router.swapExactTokensForTokens(
          ethers.utils.parseEther("888"),
          "0",
          [farmToken.address, baseToken.address],
          deployerAddress,
          FOREVER
        );
        // Add super small collateral that it would still under the water after collateral is getting added
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("0.000000000000000001"));
        await expect(
          vaultAsAlice.addCollateral(
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
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("88"));
        await expect(
          vaultAsAlice.addCollateral(
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
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("88"));
        await expect(
          vaultAsAlice.addCollateral(
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
            await successBtokenOnly(await TimeHelpers.latest(), false);
          });

          it("should increase health when twosides strat is choosen", async () => {
            await successTwoSides(await TimeHelpers.latest(), false);
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
            simpleVaultConfig.setWorker(tombWorker.address, true, true, WORK_FACTOR, KILL_FACTOR, false, true);

            await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
            await expect(
              vaultAsAlice.addCollateral(
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
          let timestampAfterWork: BigNumber;

          beforeEach(async () => {
            // Set worker to unstable
            timestampAfterWork = await TimeHelpers.latest();
            await simpleVaultConfig.setWorker(tombWorker.address, true, true, WORK_FACTOR, KILL_FACTOR, false, true);
          });

          it("should increase health when add BTOKEN only strat is choosen", async () => {
            await successBtokenOnly(timestampAfterWork, true);
          });

          it("should increase health when twosides strat is choosen", async () => {
            await successTwoSides(timestampAfterWork, true);
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
            await simpleVaultConfig.setWorker(tombWorker.address, true, true, WORK_FACTOR, KILL_FACTOR, false, false);
          });

          it("should revert", async () => {
            await revertReserveNotConsistent(true, addStrat.address);
          });
        });
      });
    });
  });
});
