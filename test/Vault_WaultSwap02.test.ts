import { ethers, upgrades } from "hardhat";
import { BigNumber, Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  AlpacaToken,
  WaultSwapToken,
  DebtToken,
  FairLaunch,
  FairLaunch__factory,
  MockERC20,
  MockERC20__factory,
  MockWBNB,
  WaultSwapFactory,
  WexMaster,
  WexMaster__factory,
  PancakePair,
  PancakePair__factory,
  WaultSwapRouter,
  WaultSwapRestrictedStrategyAddBaseTokenOnly,
  WaultSwapRestrictedStrategyLiquidate,
  WaultSwapRestrictedStrategyPartialCloseLiquidate,
  WaultSwapWorker02,
  WaultSwapWorker02__factory,
  SimpleVaultConfig,
  Vault,
  Vault__factory,
  WNativeRelayer,
  WaultSwapWorker,
  WaultSwapWorker__factory,
  MockBeneficialVault__factory,
  MockBeneficialVault,
  WaultSwapRestrictedStrategyAddTwoSidesOptimal,
  WaultSwapRestrictedStrategyWithdrawMinimizeTrading,
  WaultSwapRestrictedStrategyPartialCloseMinimizeTrading,
} from "../typechain";
import * as AssertHelpers from "./helpers/assert";
import * as TimeHelpers from "./helpers/time";
import { parseEther } from "ethers/lib/utils";
import { SwapHelper } from "./helpers/swap";
import { DeployHelper } from "./helpers/deploy";
import { Worker02Helper } from "./helpers/worker";

chai.use(solidity);
const { expect } = chai;

describe("Vault - WaultSwap02", () => {
  const FOREVER = "2000000000";
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther("5000");
  const WEX_REWARD_PER_BLOCK = ethers.utils.parseEther("0.076");
  const REINVEST_BOUNTY_BPS = "100"; // 1% reinvest bounty
  const RESERVE_POOL_BPS = "1000"; // 10% reserve pool
  const KILL_PRIZE_BPS = "1000"; // 10% Kill prize
  const INTEREST_RATE = "3472222222222"; // 30% per year
  const MIN_DEBT_SIZE = ethers.utils.parseEther("1"); // 1 BTOKEN min debt size
  const WORK_FACTOR = "7000";
  const KILL_FACTOR = "8000";
  const MAX_REINVEST_BOUNTY: string = "500";
  const DEPLOYER = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";
  const BENEFICIALVAULT_BOUNTY_BPS = "1000";
  const KILL_TREASURY_BPS = "100";
  const POOL_ID = 0;

  /// WaultSwap-related instance(s)
  let factory: WaultSwapFactory;
  let router: WaultSwapRouter;

  let wbnb: MockWBNB;
  let lp: PancakePair;

  /// Token-related instance(s)
  let baseToken: MockERC20;
  let farmToken: MockERC20;
  let wex: WaultSwapToken;
  let debtToken: DebtToken;

  /// Strategy-ralted instance(s)
  let addStrat: WaultSwapRestrictedStrategyAddBaseTokenOnly;
  let liqStrat: WaultSwapRestrictedStrategyLiquidate;
  let twoSidesStrat: WaultSwapRestrictedStrategyAddTwoSidesOptimal;
  let minimizeStrat: WaultSwapRestrictedStrategyWithdrawMinimizeTrading;
  let partialCloseStrat: WaultSwapRestrictedStrategyPartialCloseLiquidate;
  let partialCloseMinimizeStrat: WaultSwapRestrictedStrategyPartialCloseMinimizeTrading;

  /// Vault-related instance(s)
  let simpleVaultConfig: SimpleVaultConfig;
  let wNativeRelayer: WNativeRelayer;
  let vault: Vault;

  /// FairLaunch-related instance(s)
  let fairLaunch: FairLaunch;
  let alpacaToken: AlpacaToken;

  /// WexMaster-related instance(s)
  let wexMaster: WexMaster;
  let waultSwapWorker: WaultSwapWorker02;
  let waultSwapWorker01: WaultSwapWorker;

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

  let wexMasterAsAlice: WexMaster;
  let wexMasterAsBob: WexMaster;

  let waultSwapWorkerAsEve: WaultSwapWorker02;
  let waultSwapWorker01AsEve: WaultSwapWorker;

  let vaultAsAlice: Vault;
  let vaultAsBob: Vault;
  let vaultAsEve: Vault;

  // Test Helper
  let swapHelper: SwapHelper;
  let workerHelper: Worker02Helper;

  beforeEach(async () => {
    [deployer, alice, bob, eve] = await ethers.getSigners();
    [deployerAddress, aliceAddress, bobAddress, eveAddress] = await Promise.all([
      deployer.getAddress(),
      alice.getAddress(),
      bob.getAddress(),
      eve.getAddress(),
    ]);
    const deployHelper = new DeployHelper(deployer);

    wbnb = await deployHelper.deployWBNB();
    [factory, router, wex, wexMaster] = await deployHelper.deployWaultSwap(wbnb, WEX_REWARD_PER_BLOCK);
    [baseToken, farmToken] = await deployHelper.deployBEP20([
      {
        name: "BTOKEN",
        symbol: "BTOKEN",
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("1000") },
          { address: aliceAddress, amount: ethers.utils.parseEther("1000") },
          { address: bobAddress, amount: ethers.utils.parseEther("1000") },
        ],
      },
      {
        name: "FTOKEN",
        symbol: "FTOKEN",
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("1000") },
          { address: aliceAddress, amount: ethers.utils.parseEther("1000") },
          { address: bobAddress, amount: ethers.utils.parseEther("1000") },
        ],
      },
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
    [addStrat, liqStrat, twoSidesStrat, minimizeStrat, partialCloseStrat, partialCloseMinimizeStrat] =
      await deployHelper.deployWaultSwapStrategies(router, vault, wbnb, wNativeRelayer);

    /// Setup BTOKEN-FTOKEN pair on WaultSwap
    await factory.createPair(baseToken.address, farmToken.address);
    lp = PancakePair__factory.connect(await factory.getPair(farmToken.address, baseToken.address), deployer);
    await lp.deployed();

    // Add lp to masterChef's pool
    await wexMaster.add(1, lp.address, true);

    /// Setup WaultSwapWorker02
    const WaultSwapWorker02 = (await ethers.getContractFactory(
      "WaultSwapWorker02",
      deployer
    )) as WaultSwapWorker02__factory;
    waultSwapWorker = (await upgrades.deployProxy(WaultSwapWorker02, [
      vault.address,
      baseToken.address,
      wexMaster.address,
      router.address,
      POOL_ID,
      addStrat.address,
      liqStrat.address,
      REINVEST_BOUNTY_BPS,
      DEPLOYER,
      [wex.address, wbnb.address, baseToken.address],
      "0",
    ])) as WaultSwapWorker02;
    await waultSwapWorker.deployed();

    const WaultSwapWorker = (await ethers.getContractFactory("WaultSwapWorker", deployer)) as WaultSwapWorker__factory;
    waultSwapWorker01 = (await upgrades.deployProxy(WaultSwapWorker, [
      vault.address,
      baseToken.address,
      wexMaster.address,
      router.address,
      POOL_ID,
      addStrat.address,
      liqStrat.address,
      REINVEST_BOUNTY_BPS,
    ])) as WaultSwapWorker;
    await waultSwapWorker01.deployed();

    await simpleVaultConfig.setWorker(waultSwapWorker.address, true, true, WORK_FACTOR, KILL_FACTOR, true, true);
    await simpleVaultConfig.setWorker(waultSwapWorker01.address, true, true, WORK_FACTOR, KILL_FACTOR, true, true);
    await waultSwapWorker.setStrategyOk([twoSidesStrat.address, partialCloseStrat.address], true);
    await waultSwapWorker.setReinvestorOk([eveAddress], true);
    await waultSwapWorker.setTreasuryConfig(DEPLOYER, REINVEST_BOUNTY_BPS);
    await waultSwapWorker01.setStrategyOk([twoSidesStrat.address, partialCloseStrat.address], true);
    await waultSwapWorker01.setReinvestorOk([eveAddress], true);
    await addStrat.setWorkersOk([waultSwapWorker.address, waultSwapWorker01.address], true);
    await twoSidesStrat.setWorkersOk([waultSwapWorker.address, waultSwapWorker01.address], true);
    await liqStrat.setWorkersOk([waultSwapWorker.address, waultSwapWorker01.address], true);
    await partialCloseStrat.setWorkersOk([waultSwapWorker.address, waultSwapWorker01.address], true);
    await simpleVaultConfig.setApprovedAddStrategy([addStrat.address, twoSidesStrat.address], true);

    // Initiate swapHelper
    swapHelper = new SwapHelper(factory.address, router.address, BigNumber.from(998), BigNumber.from(1000), deployer);
    workerHelper = new Worker02Helper(waultSwapWorker.address, wexMaster.address);

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
      deployerAddress,
      FOREVER
    );

    // Deployer adds 0.1 WEX + 1 NATIVE
    await wex.approve(router.address, ethers.utils.parseEther("1"));
    await router.addLiquidityETH(wex.address, ethers.utils.parseEther("0.1"), "0", "0", deployerAddress, FOREVER, {
      value: ethers.utils.parseEther("1"),
    });

    // Deployer adds 1 BTOKEN + 1 NATIVE
    await baseToken.approve(router.address, ethers.utils.parseEther("1"));
    await router.addLiquidityETH(baseToken.address, ethers.utils.parseEther("1"), "0", "0", deployerAddress, FOREVER, {
      value: ethers.utils.parseEther("1"),
    });

    // Deployer adds 1 FTOKEN + 1 NATIVE
    await farmToken.approve(router.address, ethers.utils.parseEther("1"));
    await router.addLiquidityETH(farmToken.address, ethers.utils.parseEther("1"), "0", "0", deployerAddress, FOREVER, {
      value: ethers.utils.parseEther("1"),
    });

    // Contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmTokenAsAlice = MockERC20__factory.connect(farmToken.address, alice);

    lpAsAlice = PancakePair__factory.connect(lp.address, alice);
    lpAsBob = PancakePair__factory.connect(lp.address, bob);

    fairLaunchAsAlice = FairLaunch__factory.connect(fairLaunch.address, alice);

    wexMasterAsAlice = WexMaster__factory.connect(wexMaster.address, alice);
    wexMasterAsBob = WexMaster__factory.connect(wexMaster.address, bob);

    vaultAsAlice = Vault__factory.connect(vault.address, alice);
    vaultAsBob = Vault__factory.connect(vault.address, bob);
    vaultAsEve = Vault__factory.connect(vault.address, eve);

    waultSwapWorkerAsEve = WaultSwapWorker02__factory.connect(waultSwapWorker.address, eve);
    waultSwapWorker01AsEve = WaultSwapWorker__factory.connect(waultSwapWorker01.address, eve);
  });

  context("when worker is initialized", async () => {
    it("should has FTOKEN as a farmingToken in WaultSwapWorker02", async () => {
      expect(await waultSwapWorker.farmingToken()).to.be.equal(farmToken.address);
    });

    it("should initialized the correct fee and feeDenom", async () => {
      expect(await waultSwapWorker.fee()).to.be.bignumber.eq("998");
      expect(await waultSwapWorker.feeDenom()).to.be.bignumber.eq("1000");
    });
  });

  context("when owner is setting worker", async () => {
    describe("#setReinvestConfig", async () => {
      it("should set reinvest config correctly", async () => {
        await expect(
          waultSwapWorker.setReinvestConfig(250, ethers.utils.parseEther("1"), [wex.address, baseToken.address])
        )
          .to.be.emit(waultSwapWorker, "SetReinvestConfig")
          .withArgs(deployerAddress, 250, ethers.utils.parseEther("1"), [wex.address, baseToken.address]);
        expect(await waultSwapWorker.reinvestBountyBps()).to.be.bignumber.eq(250);
        expect(await waultSwapWorker.reinvestThreshold()).to.be.bignumber.eq(ethers.utils.parseEther("1"));
        expect(await waultSwapWorker.getReinvestPath()).to.deep.eq([wex.address, baseToken.address]);
      });

      it("should revert when owner set reinvestBountyBps > max", async () => {
        await expect(waultSwapWorker.setReinvestConfig(1000, "0", [wex.address, baseToken.address])).to.be.revertedWith(
          "WaultSwapWorker02::setReinvestConfig:: _reinvestBountyBps exceeded maxReinvestBountyBps"
        );
        expect(await waultSwapWorker.reinvestBountyBps()).to.be.bignumber.eq(100);
      });

      it("should revert when owner set reinvest path that does not start with WEX and end with BTOKEN", async () => {
        await expect(waultSwapWorker.setReinvestConfig(200, "0", [baseToken.address, wex.address])).to.be.revertedWith(
          "WaultSwapWorker02::setReinvestConfig:: _reinvestPath must start with WEX, end with BTOKEN"
        );
      });
    });

    describe("#setMaxReinvestBountyBps", async () => {
      it("should set max reinvest bounty", async () => {
        await waultSwapWorker.setMaxReinvestBountyBps(200);
        expect(await waultSwapWorker.maxReinvestBountyBps()).to.be.bignumber.eq(200);
      });

      it("should revert when new max reinvest bounty over 30%", async () => {
        await expect(waultSwapWorker.setMaxReinvestBountyBps("3001")).to.be.revertedWith(
          "WaultSwapWorker02::setMaxReinvestBountyBps:: _maxReinvestBountyBps exceeded 30%"
        );
        expect(await waultSwapWorker.maxReinvestBountyBps()).to.be.eq("500");
      });
    });

    describe("#setTreasuryConfig", async () => {
      it("should successfully set a treasury account", async () => {
        const aliceAddr = aliceAddress;
        await waultSwapWorker.setTreasuryConfig(aliceAddr, REINVEST_BOUNTY_BPS);
        expect(await waultSwapWorker.treasuryAccount()).to.eq(aliceAddr);
      });

      it("should successfully set a treasury bounty", async () => {
        await waultSwapWorker.setTreasuryConfig(DEPLOYER, 499);
        expect(await waultSwapWorker.treasuryBountyBps()).to.eq(499);
      });

      it("should revert when treasury bounty > max reinvest bounty", async () => {
        await expect(waultSwapWorker.setTreasuryConfig(DEPLOYER, parseInt(MAX_REINVEST_BOUNTY) + 1)).to.revertedWith(
          "WaultSwapWorker02::setTreasuryConfig:: _treasuryBountyBps exceeded maxReinvestBountyBps"
        );
        expect(await waultSwapWorker.treasuryBountyBps()).to.eq(REINVEST_BOUNTY_BPS);
      });
    });

    describe("#setStrategyOk", async () => {
      it("should set strat ok", async () => {
        await waultSwapWorker.setStrategyOk([aliceAddress], true);
        expect(await waultSwapWorker.okStrats(aliceAddress)).to.be.eq(true);
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
          waultSwapWorker.address,
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
        expect(await waultSwapWorker.health(1)).to.be.equal(ethers.utils.parseEther("0.29950805066751796"));

        // must be able to close position
        await vaultAsAlice.work(
          1,
          waultSwapWorker.address,
          "0",
          "0",
          ethers.constants.MaxUint256.toString(),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        expect(await waultSwapWorker.health(1)).to.be.equal(ethers.constants.Zero);
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
            waultSwapWorker.address,
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
            waultSwapWorker.address,
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
        baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await expect(
          vaultAsAlice.work(
            0,
            waultSwapWorker.address,
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
        const deposit = ethers.utils.parseEther("3");
        await baseToken.approve(vault.address, deposit);
        await vault.deposit(deposit);

        // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
        const loan = ethers.utils.parseEther("1");
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.work(
          0,
          waultSwapWorker.address,
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

        expect(await waultSwapWorker.health(1)).to.be.bignumber.eq(ethers.utils.parseEther("1.998307255271658491"));

        // Eve comes and trigger reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        await waultSwapWorkerAsEve.reinvest();
        AssertHelpers.assertAlmostEqual(
          WEX_REWARD_PER_BLOCK.mul("2").mul(REINVEST_BOUNTY_BPS).div("10000").toString(),
          (await wex.balanceOf(eveAddress)).toString()
        );

        await vault.deposit(0); // Random action to trigger interest computation
        const healthDebt = await vault.positionInfo("1");
        expect(healthDebt[0]).to.be.bignumber.above(ethers.utils.parseEther("2"));
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
        // Deployer deposits 3 BTOKEN to the Vault
        const deposit = ethers.utils.parseEther("3");
        await baseToken.approve(vault.address, deposit);
        await vault.deposit(deposit);

        // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
        const loan = ethers.utils.parseEther("1");
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.work(
          0,
          waultSwapWorker.address,
          ethers.utils.parseEther("1"),
          loan,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        await waultSwapWorkerAsEve.reinvest();
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
        await waultSwapWorker.setReinvestConfig("100", "0", [wex.address, wbnb.address, baseToken.address]);

        const [path, reinvestPath] = await Promise.all([waultSwapWorker.getPath(), waultSwapWorker.getReinvestPath()]);

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
          waultSwapWorker.address,
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
        let [workerLpAfter] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        expect(await waultSwapWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.bignumber.eq(shares[0]);
        expect(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1)),
          `expect Pos#1 LPs = ${expectedLp}`
        ).to.be.bignumber.eq(expectedLp);
        expect(await waultSwapWorker.totalShare(), `expect totalShare = ${totalShare}`).to.be.bignumber.eq(totalShare);
        expect(
          await baseToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisBtoken} BTOKEN debris`
        ).to.be.bignumber.eq(debrisBtoken);
        expect(
          await farmToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisFtoken} FTOKEN debris`
        ).to.be.bignumber.eq(debrisFtoken);
        expect(workerLpAfter, `expect Worker to stake ${accumLp} LP`).to.be.bignumber.eq(accumLp);

        // Position#2: Bob borrows another 2 BTOKEN
        [workerLpBefore] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        let eveWexBefore = await wex.balanceOf(eveAddress);
        let deployerWexBefore = await wex.balanceOf(DEPLOYER);
        await swapHelper.loadReserves(path);
        await swapHelper.loadReserves(reinvestPath);
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsBob.work(
          0,
          waultSwapWorker.address,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("2"),
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        [workerLpAfter] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        let eveWexAfter = await wex.balanceOf(eveAddress);
        let deployerWexAfter = await wex.balanceOf(DEPLOYER);
        let totalRewards = swapHelper.computeTotalRewards(workerLpBefore, WEX_REWARD_PER_BLOCK, BigNumber.from(2));
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

        expect(await waultSwapWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.bignumber.eq(shares[0]);
        expect(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1)),
          `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
        ).to.be.bignumber.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

        expect(await waultSwapWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.bignumber.eq(shares[1]);
        expect(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(2)),
          `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
        ).to.be.bignumber.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

        expect(
          deployerWexAfter.sub(deployerWexBefore),
          `expect DEPLOYER to get ${reinvestFees} WEX as treasury fees`
        ).to.be.bignumber.eq(reinvestFees);
        expect(eveWexAfter.sub(eveWexBefore), `expect eve's WEX to remain the same`).to.be.bignumber.eq("0");
        expect(workerLpAfter, `expect Worker to stake ${accumLp} LP`).to.be.bignumber.eq(accumLp);
        expect(
          await baseToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisBtoken} BTOKEN debris`
        ).to.be.bignumber.eq(debrisBtoken);
        expect(
          await farmToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisFtoken} FTOKEN debris`
        ).to.be.bignumber.eq(debrisFtoken);

        // ---------------- Reinvest#1 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        let [workerLPBefore] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        deployerWexBefore = await wex.balanceOf(DEPLOYER);
        eveWexBefore = await wex.balanceOf(eveAddress);
        await swapHelper.loadReserves(path);
        await swapHelper.loadReserves(reinvestPath);

        await waultSwapWorkerAsEve.reinvest();

        deployerWexAfter = await wex.balanceOf(DEPLOYER);
        eveWexAfter = await wex.balanceOf(eveAddress);
        [workerLpAfter] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        totalRewards = swapHelper.computeTotalRewards(workerLPBefore, WEX_REWARD_PER_BLOCK, BigNumber.from(2));
        reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
        reinvestLeft = totalRewards.sub(reinvestFees);

        reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
        reinvestBtoken = reinvestAmts[reinvestAmts.length - 1].add(debrisBtoken);
        [reinvestLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
        accumLp = accumLp.add(reinvestLp);

        expect(await waultSwapWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.bignumber.eq(shares[0]);
        expect(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1)),
          `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
        ).to.be.bignumber.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

        expect(await waultSwapWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.bignumber.eq(shares[1]);
        expect(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(2)),
          `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
        ).to.be.bignumber.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

        expect(deployerWexAfter.sub(deployerWexBefore), `expect DEPLOYER's WEX to remain the same`).to.be.bignumber.eq(
          "0"
        );
        expect(eveWexAfter.sub(eveWexBefore), `expect eve to get ${reinvestFees}`).to.be.bignumber.eq(reinvestFees);
        expect(workerLpAfter).to.be.bignumber.eq(accumLp);

        // Check Position#1 info
        let [bob1Health, bob1DebtToShare] = await vault.positionInfo("1");
        const bob1ExpectedHealth = await swapHelper.computeLpHealth(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1)),
          baseToken.address,
          farmToken.address
        );
        expect(bob1Health, `expect Pos#1 health = ${bob1ExpectedHealth}`).to.be.bignumber.eq(bob1ExpectedHealth);
        expect(bob1Health).to.be.gt(ethers.utils.parseEther("20"));
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bob1DebtToShare.toString());

        // Check Position#2 info
        let [bob2Health, bob2DebtToShare] = await vault.positionInfo("2");
        const bob2ExpectedHealth = await swapHelper.computeLpHealth(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(2)),
          baseToken.address,
          farmToken.address
        );
        expect(bob2Health, `expect Pos#2 health = ${bob2ExpectedHealth}`).to.be.bignumber.eq(bob2ExpectedHealth);
        expect(bob2Health).to.be.gt(ethers.utils.parseEther("3"));
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), bob2DebtToShare.toString());

        let bobBefore = await baseToken.balanceOf(bobAddress);
        let bobAlpacaBefore = await alpacaToken.balanceOf(bobAddress);
        // Bob close position#1
        await vaultAsBob.work(
          1,
          waultSwapWorker.address,
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
        expect(bobAlpacaAfter).to.be.bignumber.gt(bobAlpacaBefore);
        expect(bobAfter).to.be.bignumber.gt(bobBefore);

        // Bob add another 10 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.work(
          2,
          waultSwapWorker.address,
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
          waultSwapWorker.address,
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
        expect(bobAfter).to.be.bignumber.gt(bobBefore);
        expect(bobAlpacaAfter).to.be.bignumber.gt(bobAlpacaBefore);
      });

      it("should close position correctly when user holds mix positions of leveraged and non-leveraged", async () => {
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

        const [path, reinvestPath] = await Promise.all([waultSwapWorker.getPath(), waultSwapWorker.getReinvestPath()]);

        // Set Reinvest bounty to 10% of the reward
        await waultSwapWorker.setReinvestConfig("100", "0", [wex.address, wbnb.address, baseToken.address]);

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
          waultSwapWorker.address,
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
        let [workerLpAfter] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        expect(await waultSwapWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.bignumber.eq(shares[0]);
        expect(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1)),
          `expect Pos#1 LPs = ${expectedLp}`
        ).to.be.bignumber.eq(expectedLp);
        expect(await waultSwapWorker.totalShare(), `expect totalShare = ${totalShare}`).to.be.bignumber.eq(totalShare);
        expect(
          await baseToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisBtoken} BTOKEN debris`
        ).to.be.bignumber.eq(debrisBtoken);
        expect(
          await farmToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisFtoken} FTOKEN debris`
        ).to.be.bignumber.eq(debrisFtoken);
        expect(workerLpAfter, `expect Worker to stake ${accumLp} LP`).to.be.bignumber.eq(accumLp);

        // Position#2: Bob borrows another 2 BTOKEN
        [workerLpBefore] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        let eveWexBefore = await wex.balanceOf(eveAddress);
        let deployerWexBefore = await wex.balanceOf(DEPLOYER);

        // Position#2: Bob open 1x position with 3 BTOKEN
        await swapHelper.loadReserves(path);
        await swapHelper.loadReserves(reinvestPath);
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("3"));
        await vaultAsBob.work(
          0,
          waultSwapWorker.address,
          ethers.utils.parseEther("3"),
          "0",
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        [workerLpAfter] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        let eveWexAfter = await wex.balanceOf(eveAddress);
        let deployerWexAfter = await wex.balanceOf(DEPLOYER);
        let totalRewards = swapHelper.computeTotalRewards(workerLpBefore, WEX_REWARD_PER_BLOCK, BigNumber.from(2));
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

        expect(await waultSwapWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.bignumber.eq(shares[0]);
        expect(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1)),
          `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
        ).to.be.bignumber.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

        expect(await waultSwapWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.bignumber.eq(shares[1]);
        expect(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(2)),
          `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
        ).to.be.bignumber.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

        expect(
          deployerWexAfter.sub(deployerWexBefore),
          `expect DEPLOYER to get ${reinvestFees} WEX as treasury fees`
        ).to.be.bignumber.eq(reinvestFees);
        expect(eveWexAfter.sub(eveWexBefore), `expect eve's WEX to remain the same`).to.be.bignumber.eq("0");
        expect(workerLpAfter, `expect Worker to stake ${accumLp} LP`).to.be.bignumber.eq(accumLp);
        expect(
          await baseToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisBtoken} BTOKEN debris`
        ).to.be.bignumber.eq(debrisBtoken);
        expect(
          await farmToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisFtoken} FTOKEN debris`
        ).to.be.bignumber.eq(debrisFtoken);

        // ---------------- Reinvest#1 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        let [workerLPBefore] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        deployerWexBefore = await wex.balanceOf(DEPLOYER);
        eveWexBefore = await wex.balanceOf(eveAddress);
        await swapHelper.loadReserves(path);
        await swapHelper.loadReserves(reinvestPath);

        await waultSwapWorkerAsEve.reinvest();

        deployerWexAfter = await wex.balanceOf(DEPLOYER);
        eveWexAfter = await wex.balanceOf(eveAddress);
        [workerLpAfter] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        totalRewards = swapHelper.computeTotalRewards(workerLPBefore, WEX_REWARD_PER_BLOCK, BigNumber.from(2));
        reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
        reinvestLeft = totalRewards.sub(reinvestFees);

        reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
        reinvestBtoken = reinvestAmts[reinvestAmts.length - 1].add(debrisBtoken);
        [reinvestLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
        accumLp = accumLp.add(reinvestLp);

        expect(await waultSwapWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.bignumber.eq(shares[0]);
        expect(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1)),
          `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
        ).to.be.bignumber.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

        expect(await waultSwapWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.bignumber.eq(shares[1]);
        expect(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(2)),
          `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
        ).to.be.bignumber.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

        expect(deployerWexAfter.sub(deployerWexBefore), `expect DEPLOYER's WEX to remain the same`).to.be.bignumber.eq(
          "0"
        );
        expect(eveWexAfter.sub(eveWexBefore), `expect eve to get ${reinvestFees}`).to.be.bignumber.eq(reinvestFees);
        expect(workerLpAfter).to.be.bignumber.eq(accumLp);

        // Check Position#1 info
        let [bob1Health, bob1DebtToShare] = await vault.positionInfo("1");
        const bob1ExpectedHealth = await swapHelper.computeLpHealth(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1)),
          baseToken.address,
          farmToken.address
        );
        expect(bob1Health, `expect Pos#1 health = ${bob1ExpectedHealth}`).to.be.bignumber.eq(bob1ExpectedHealth);
        expect(bob1Health).to.be.gt(ethers.utils.parseEther("20"));
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bob1DebtToShare.toString());

        // Check Position#2 info
        let [bob2Health, bob2DebtToShare] = await vault.positionInfo("2");
        const bob2ExpectedHealth = await swapHelper.computeLpHealth(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(2)),
          baseToken.address,
          farmToken.address
        );
        expect(bob2Health, `expect Pos#2 health = ${bob2ExpectedHealth}`).to.be.bignumber.eq(bob2ExpectedHealth);
        expect(bob2Health).to.be.gt(ethers.utils.parseEther("3"));
        AssertHelpers.assertAlmostEqual("0", bob2DebtToShare.toString());

        let bobBefore = await baseToken.balanceOf(bobAddress);
        let bobAlpacaBefore = await alpacaToken.balanceOf(bobAddress);
        // Bob close position#1
        await vaultAsBob.work(
          1,
          waultSwapWorker.address,
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
        expect(bobAlpacaAfter).to.be.bignumber.gt(bobAlpacaBefore);
        expect(bobAfter).to.be.bignumber.gt(bobBefore);

        // Bob add another 10 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsBob.work(
          2,
          waultSwapWorker.address,
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
          waultSwapWorker.address,
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
        expect(bobAfter).to.be.bignumber.gt(bobBefore);
        expect(bobAlpacaAfter).to.be.bignumber.eq(bobAlpacaBefore);
      });
    });

    context("#kill", async () => {
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
          waultSwapWorker.address,
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
        await waultSwapWorkerAsEve.reinvest();
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
          waultSwapWorker.address,
          ethers.utils.parseEther("1"),
          loan,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        await waultSwapWorkerAsEve.reinvest();
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
        const toBeLiquidatedValue = await waultSwapWorker.health(1);
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
        expect(await vault.vaultDebtVal()).to.be.bignumber.eq(ethers.utils.parseEther("0"));
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
        ).to.be.bignumber.gt(aliceAlpacaBefore);

        // Alice creates a new position again
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.work(
          0,
          waultSwapWorker.address,
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
          waultSwapWorker.address,
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
          waultSwapWorker.address,
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

        expect(await baseToken.balanceOf(eveAddress)).to.be.bignumber.gt(eveBefore);
      });
    });

    context("#onlyApproveHolders", async () => {
      it("should be not allow user to emergencyWithdraw debtToken on FairLaunch", async () => {
        // Deployer deposits 3 BTOKEN to the Vault
        const deposit = ethers.utils.parseEther("3");
        await baseToken.approve(vault.address, deposit);
        await vault.deposit(deposit);

        // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
        const loan = ethers.utils.parseEther("1");
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.work(
          0,
          waultSwapWorker.address,
          ethers.utils.parseEther("1"),
          loan,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
        await waultSwapWorkerAsEve.reinvest();
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

        expect(await baseToken.balanceOf(eveAddress)).to.be.bignumber.gt(eveBefore);
        AssertHelpers.assertAlmostEqual(
          deposit.add(interest).add(interest.mul(13).div(10)).add(interest.mul(13).div(10)).toString(),
          (await baseToken.balanceOf(vault.address)).toString()
        );
        expect(await vault.vaultDebtVal()).to.be.bignumber.eq(ethers.utils.parseEther("0"));
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
          waultSwapWorker.address,
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
          waultSwapWorker.address,
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

        expect(await vault.balanceOf(deployerAddress)).to.be.bignumber.equal(deposit);

        // Bob borrows 2 BTOKEN loan
        const loan = ethers.utils.parseEther("2");
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsBob.work(
          0,
          waultSwapWorker.address,
          ethers.utils.parseEther("1"),
          loan,
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        expect(await baseToken.balanceOf(vault.address)).to.be.bignumber.equal(deposit.sub(loan));
        expect(await vault.vaultDebtVal()).to.be.bignumber.equal(loan);
        expect(await vault.totalToken()).to.be.bignumber.equal(deposit);

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
        await waultSwapWorker.setReinvestConfig("100", "0", [wex.address, wbnb.address, baseToken.address]);

        const [path, reinvestPath] = await Promise.all([waultSwapWorker.getPath(), waultSwapWorker.getReinvestPath()]);

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
          waultSwapWorker.address,
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
        let [workerLpAfter] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        expect(await waultSwapWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.bignumber.eq(shares[0]);
        expect(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1)),
          `expect Pos#1 LPs = ${expectedLp}`
        ).to.be.bignumber.eq(expectedLp);
        expect(await waultSwapWorker.totalShare(), `expect totalShare = ${totalShare}`).to.be.bignumber.eq(totalShare);
        expect(
          await baseToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisBtoken} BTOKEN debris`
        ).to.be.bignumber.eq(debrisBtoken);
        expect(
          await farmToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisFtoken} FTOKEN debris`
        ).to.be.bignumber.eq(debrisFtoken);
        expect(workerLpAfter, `expect Worker to stake ${accumLp} LP`).to.be.bignumber.eq(accumLp);

        // Position#2: Bob borrows another 2 BTOKEN
        [workerLpBefore] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        let eveWexBefore = await wex.balanceOf(eveAddress);
        let deployerWexBefore = await wex.balanceOf(DEPLOYER);
        await swapHelper.loadReserves(path);
        await swapHelper.loadReserves(reinvestPath);
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.work(
          0,
          waultSwapWorker.address,
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("2"),
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        [workerLpAfter] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        let eveWexAfter = await wex.balanceOf(eveAddress);
        let deployerWexAfter = await wex.balanceOf(DEPLOYER);
        let totalRewards = swapHelper.computeTotalRewards(workerLpBefore, WEX_REWARD_PER_BLOCK, BigNumber.from(2));
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

        expect(await waultSwapWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.bignumber.eq(shares[0]);
        expect(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1)),
          `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
        ).to.be.bignumber.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

        expect(await waultSwapWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.bignumber.eq(shares[1]);
        expect(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(2)),
          `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
        ).to.be.bignumber.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

        expect(
          deployerWexAfter.sub(deployerWexBefore),
          `expect DEPLOYER to get ${reinvestFees} WEX as treasury fees`
        ).to.be.bignumber.eq(reinvestFees);
        expect(eveWexAfter.sub(eveWexBefore), `expect eve's WEX to remain the same`).to.be.bignumber.eq("0");
        expect(workerLpAfter, `expect Worker to stake ${accumLp} LP`).to.be.bignumber.eq(accumLp);
        expect(
          await baseToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisBtoken} BTOKEN debris`
        ).to.be.bignumber.eq(debrisBtoken);
        expect(
          await farmToken.balanceOf(addStrat.address),
          `expect add BTOKEN strat to have ${debrisFtoken} FTOKEN debris`
        ).to.be.bignumber.eq(debrisFtoken);

        // ---------------- Reinvest#1 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        let [workerLPBefore] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        deployerWexBefore = await wex.balanceOf(DEPLOYER);
        eveWexBefore = await wex.balanceOf(eveAddress);
        await swapHelper.loadReserves(path);
        await swapHelper.loadReserves(reinvestPath);

        await waultSwapWorkerAsEve.reinvest();

        deployerWexAfter = await wex.balanceOf(DEPLOYER);
        eveWexAfter = await wex.balanceOf(eveAddress);
        [workerLpAfter] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        totalRewards = swapHelper.computeTotalRewards(workerLPBefore, WEX_REWARD_PER_BLOCK, BigNumber.from(2));
        reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
        reinvestLeft = totalRewards.sub(reinvestFees);

        reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
        reinvestBtoken = reinvestAmts[reinvestAmts.length - 1].add(debrisBtoken);
        [reinvestLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
        accumLp = accumLp.add(reinvestLp);

        expect(await waultSwapWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.bignumber.eq(shares[0]);
        expect(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1)),
          `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
        ).to.be.bignumber.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

        expect(await waultSwapWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.bignumber.eq(shares[1]);
        expect(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(2)),
          `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
        ).to.be.bignumber.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

        expect(deployerWexAfter.sub(deployerWexBefore), `expect DEPLOYER's WEX to remain the same`).to.be.bignumber.eq(
          "0"
        );
        expect(eveWexAfter.sub(eveWexBefore), `expect eve to get ${reinvestFees}`).to.be.bignumber.eq(reinvestFees);
        expect(workerLpAfter).to.be.bignumber.eq(accumLp);

        // Check Position#1 info
        let [bob1Health, bob1DebtToShare] = await vault.positionInfo("1");
        const bob1ExpectedHealth = await swapHelper.computeLpHealth(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1)),
          baseToken.address,
          farmToken.address
        );
        expect(bob1Health, `expect Pos#1 health = ${bob1ExpectedHealth}`).to.be.bignumber.eq(bob1ExpectedHealth);
        expect(bob1Health).to.be.gt(ethers.utils.parseEther("20"));
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bob1DebtToShare.toString());

        // Check Position#2 info
        let [alice2Health, alice2DebtToShare] = await vault.positionInfo("2");
        const alice2ExpectedHealth = await swapHelper.computeLpHealth(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(2)),
          baseToken.address,
          farmToken.address
        );
        expect(alice2Health, `expect Pos#2 health = ${alice2ExpectedHealth}`).to.be.bignumber.eq(alice2ExpectedHealth);
        expect(alice2Health).to.be.gt(ethers.utils.parseEther("3"));
        AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), alice2DebtToShare.toString());

        const bobBefore = await baseToken.balanceOf(bobAddress);
        // Bob close position#1
        await vaultAsBob.work(
          1,
          waultSwapWorker.address,
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
        expect(bobAfter).to.be.bignumber.gt(bobBefore);

        // Alice add another 10 BTOKEN
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsAlice.work(
          2,
          waultSwapWorker.address,
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
          waultSwapWorker.address,
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
        expect(aliceAfter).to.be.bignumber.gt(aliceBefore);
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
              waultSwapWorker.getPath(),
              waultSwapWorker.getReinvestPath(),
            ]);

            // Set Reinvest bounty to 1% of the reward
            await waultSwapWorker.setReinvestConfig("100", "0", [wex.address, wbnb.address, baseToken.address]);

            // Bob deposits 10 BTOKEN
            await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
            await vaultAsBob.deposit(ethers.utils.parseEther("10"));

            // Action 1: Bob a new position. Providing 10 BTOKEN and borrow 10 BTOKEN
            const borrowedAmount = ethers.utils.parseEther("10");
            const principalAmount = ethers.utils.parseEther("10");
            await swapHelper.loadReserves(path);
            await swapHelper.loadReserves(reinvestPath);

            await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
            let [workerLpBefore] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
            await vaultAsBob.work(
              0,
              waultSwapWorker.address,
              principalAmount,
              borrowedAmount,
              "0", // max return = 0, don't return NATIVE to the debt
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
              )
            );
            let [workerLpAfter] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);

            const [expectedLp, debrisBtoken] = await swapHelper.computeOneSidedOptimalLp(
              borrowedAmount.add(principalAmount),
              path
            );
            expect(workerLpAfter.sub(workerLpBefore)).to.eq(expectedLp);

            const deployerWexBefore = await wex.balanceOf(DEPLOYER);
            const bobBefore = await baseToken.balanceOf(bobAddress);
            const [bobHealthBefore] = await vault.positionInfo("1");
            const lpUnderBobPosition = await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1));
            const liquidatedLp = lpUnderBobPosition.div(2);
            const returnDebt = ethers.utils.parseEther("6");
            [workerLpBefore] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);

            // Pre-compute
            await swapHelper.loadReserves(path);
            await swapHelper.loadReserves(reinvestPath);

            // Compute reinvest
            const [reinvestFees, reinvestLp] = await swapHelper.computeReinvestLp(
              workerLpBefore,
              debrisBtoken,
              WEX_REWARD_PER_BLOCK,
              BigNumber.from(REINVEST_BOUNTY_BPS),
              reinvestPath,
              path,
              BigNumber.from(1)
            );

            // Compute liquidate
            const [btokenAmount, ftokenAmount] = await swapHelper.computeRemoveLiquidiy(
              baseToken.address,
              farmToken.address,
              liquidatedLp
            );
            const sellFtokenAmounts = await swapHelper.computeSwapExactTokensForTokens(
              ftokenAmount,
              await waultSwapWorker.getReversedPath(),
              true
            );
            const liquidatedBtoken = sellFtokenAmounts[sellFtokenAmounts.length - 1].add(btokenAmount).sub(returnDebt);

            await vaultAsBob.work(
              1,
              waultSwapWorker.address,
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
            const bobAfter = await baseToken.balanceOf(bobAddress);
            const deployerWexAfter = await wex.balanceOf(DEPLOYER);

            expect(deployerWexAfter.sub(deployerWexBefore), `expect Deployer to get ${reinvestFees}`).to.be.eq(
              reinvestFees
            );
            expect(bobAfter.sub(bobBefore), `expect Bob get ${liquidatedBtoken}`).to.be.eq(liquidatedBtoken);
            // Check Bob position info
            const [bobHealth, bobDebtToShare] = await vault.positionInfo("1");
            // Bob's health after partial close position must be 50% less than before
            // due to he exit half of lp under his position
            expect(bobHealth).to.be.bignumber.lt(bobHealthBefore.div(2));
            // Bob's debt should be left only 4 BTOKEN due he said he wants to return at max 4 BTOKEN
            expect(bobDebtToShare).to.be.bignumber.eq(borrowedAmount.sub(returnDebt));
            // Check LP deposited by Worker on MasterChef
            [workerLpAfter] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
            // LP tokens + 0.000207570473714694 LP from reinvest of worker should be decreased by lpUnderBobPosition/2
            // due to Bob execute StrategyClosePartialLiquidate
            expect(workerLpAfter).to.be.bignumber.eq(workerLpBefore.add(reinvestLp).sub(lpUnderBobPosition.div(2)));
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
              deployerAddress
            );

            // Bob deposits 10 BTOKEN
            await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
            await vaultAsBob.deposit(ethers.utils.parseEther("10"));

            // Position#1: Bob borrows 10 BTOKEN loan and supply another 10 BToken
            // Thus, Bob's position value will be worth 20 BTOKEN
            // After calling `work()`
            // 20 BTOKEN needs to swap 3.586163261419937287 BTOKEN to FTOKEN
            // 3.586163261419937287 BTOKEN will be swapped to (3.586163261419937287  * 0.998 * 0.1) / (1 + 3.586163261419937287  * 0.998) = 0.078161127326571727
            // new reserve after swap will be 4.586163261419937287 BTOKEN - 0.021838872673428273 FTOKEN
            // based on optimal swap formula,
            // BTOKEN-FTOKEN to be added into the LP will be 16.413836738580062713 BTOKEN - 0.078161127326571727 FTOKEN = min((16.413836738580062713 / 4.586163261419937287 * 0.031622776601683793), (0.078161127326571727 / 0.021838872673428273 * 0.031622776601683793)) =~ 1.131776307937023350 LP
            // new reserve after adding liquidity 21.000000000000000000 BTOKEN - 0.100000000000000000 FTOKEN
            // lp amount from adding liquidity will be 1.131776307937023350 LP
            await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
            await vaultAsBob.work(
              0,
              waultSwapWorker.address,
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
            const lpUnderBobPosition = await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1));
            const [workerLPBefore] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);

            // Bob closes position with maxReturn 5,000,000,000 and liquidate half of his position
            // Expect that Bob will close position successfully and his debt must be reduce as liquidated amount pay debt
            // Bob think he made enough. He now wants to close position partially.

            // After calling `work()`, the `_reinvest()` is invoked
            // since 1 blocks have passed since approve and work now reward will be 0.076 * 1 =~ 0.075999999998831803 ~   wex
            // reward without bounty will be 0.075999999998831803 - 0.000759999999988318 =~ 0.0752399999988435 wex
            // 0.0752399999988435 wex can be converted into:
            // (0.0752399999988435 * 0.998 * 1) / (0.1 + 0.0752399999988435 * 0.998) = 0.428863589322029016 WBNB
            // 0.021792385851914001 WBNB can be converted into (0.428863589322029016 * 0.998 * 1) / (1 + 0.428863589322029016 * 0.998) = 0.299722762692979212 BTOKEN
            // based on optimal swap formula, 0.299722762692979212 BTOKEN needs to swap 0.149479919413161109 BTOKEN
            // new reserve after swap will be 21.149479919413161109 BTOKEN - 0.099294625357551732 FTOKEN
            // based on optimal swap formula, 0.150242843279818103 BTOKEN - 0/000705374642448268 FTOKEN will be converted into (0.150242843279818103 / 21.149479919413161109) * 1.448004073953861283 =~ 0.010286411296189659 LP
            // new reserve after adding liquidity receiving from `_reinvest()` is 21.299722762692979212 BTOKEN - 0.100000000000000000 FTOKEN
            // more LP amount after executing add strategy will be 0.010286411296189659 LP
            // accumulated LP of the worker will be 1.131776307937023350 + 0.010286411296189659 = 1142062719233213009 LP

            // bob close 50% of his position, thus he will close 1.131776307937023350 (bob lp) * (1.131776307937023350 (total balance) /  (1.131776307937023350 (bob's share))) =~ 1.131776307937023350 / 2 =~ 0.565888153968511675 LP
            // 0.565888153968511675 LP will be converted into 8.265335964360120225 BTOKEN - 0.038804899277079193 FTOKEN
            // 0.038804899277079193 FTOKEN will be converted into (0.038804899277079193 * 0.998 * 13.034386798332858987) / (0.061195100722920807 + 0.038804899277079193 * 0.998) = 5.051785387603725080 BTOKEN
            // thus, Bob will receive 5.051785387603725080+ 8.265335964360120225 = 13.317121351963845305 BTOKEN
            await vaultAsBob.work(
              1,
              waultSwapWorker.address,
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
                      ethers.utils.parseEther("3.317121351963845305"),
                    ]
                  ),
                ]
              )
            );

            const bobAfter = await baseToken.balanceOf(bobAddress);

            // After Bob liquidate half of his position which worth
            // swapAmount = 13.317121351963845305 BTOKEN (price impact+trading fee included)
            // Bob wish to return 5,000,000,000 BTOKEN (when maxReturn > debt, return all debt)
            // The following criteria must be stratified:
            // - Bob should get 13.317121351963845305 - 10 = 3.317121351963845305 BTOKEN back.
            // - Bob's position debt must be 0
            expect(
              bobBefore.add(ethers.utils.parseEther("3.317121351963845305")),
              "Expect BTOKEN in Bob's account after close position to increase by ~3.31 BTOKEN"
            ).to.be.bignumber.eq(bobAfter);
            // Check Bob position info
            const [bobHealth, bobDebtVal] = await vault.positionInfo("1");
            // Bob's health after partial close position must be 50% less than before
            // due to he exit half of lp under his position
            expect(bobHealth).to.be.bignumber.lt(bobHealthBefore.div(2));
            // Bob's debt should be 0 BTOKEN due he said he wants to return at max 5,000,000,000 BTOKEN (> debt, return all debt)
            expect(bobDebtVal).to.be.bignumber.eq("0");
            // Check LP deposited by Worker on MasterChef
            const [workerLPAfter] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
            // LP tokens of worker should be decreased by lpUnderBobPosition/2
            // due to Bob execute StrategyClosePartialLiquidate
            expect(workerLPAfter).to.be.bignumber.eq(
              workerLPBefore.add(parseEther("0.010286411296189659")).sub(lpUnderBobPosition.div(2))
            );
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
              deployerAddress
            );

            // Bob deposits 10 BTOKEN
            await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
            await vaultAsBob.deposit(ethers.utils.parseEther("10"));

            // Position#1: Bob borrows 10 BTOKEN loan
            await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
            await vaultAsBob.work(
              0,
              waultSwapWorker.address,
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
            const lpUnderBobPosition = await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1));
            // Bob closes position with maxReturn 0 and liquidate full of his position
            // Expect that Bob will not be able to close his position as he liquidate all underlying assets but not paydebt
            // which made his position debt ratio higher than allow work factor
            await expect(
              vaultAsBob.work(
                1,
                waultSwapWorker.address,
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

    context("When the treasury Account and treasury bounty bps haven't been set", async () => {
      it("should not reinvest", async () => {
        await waultSwapWorker.setTreasuryConfig(ethers.constants.AddressZero, ethers.constants.Zero);
        // Deployer deposits 3 BTOKEN to the Vault
        const deposit = ethers.utils.parseEther("3");
        await baseToken.approve(vault.address, deposit);
        await vault.deposit(deposit);

        // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
        const loan = ethers.utils.parseEther("1");
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.work(
          0,
          waultSwapWorker.address,
          ethers.utils.parseEther("1"),
          loan,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        expect(await waultSwapWorker.shares(1)).to.eq(ethers.utils.parseEther("0.231263113939866546"));
        expect(await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1))).to.eq(
          ethers.utils.parseEther("0.231263113939866546")
        );

        // Alice open another position.
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
        await vaultAsAlice.work(
          0,
          waultSwapWorker.address,
          ethers.utils.parseEther("1"),
          loan,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        // Expect that LPs under her position remain the same as no reinvest happened
        expect(await waultSwapWorker.shares(1)).to.eq(ethers.utils.parseEther("0.231263113939866546"));
        expect(await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1))).to.eq(
          ethers.utils.parseEther("0.231263113939866546")
        );

        expect(await waultSwapWorker.treasuryBountyBps()).to.eq(ethers.constants.Zero);
        expect(await waultSwapWorker.treasuryAccount()).to.eq(ethers.constants.AddressZero);
      });
    });

    context("when the worker is an older version", async () => {
      context("when upgrade is during the tx flow", async () => {
        context("When beneficialVault == operator", async () => {
          it("should work with the new upgraded worker", async () => {
            // Deployer deposits 3 BTOKEN to the Vault
            const deposit = ethers.utils.parseEther("3");
            await baseToken.approve(vault.address, deposit);
            await vault.deposit(deposit);

            // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
            const loan = ethers.utils.parseEther("1");
            await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
            // Position#1: Bob borrows 1 BTOKEN loan and supply another 1 BToken
            // Thus, Bob's position value will be worth 20 BTOKEN
            // After calling `work()`
            // 2 BTOKEN needs to swap 0.0732967258967755614 BTOKEN to 0.042234424701074812 FTOKEN
            // new reserve after swap will be 1.732967258967755614 ฺBTOKEN 0.057759458210855529 FTOKEN
            // based on optimal swap formula, BTOKEN-FTOKEN to be added into the LP will be 1.267032741032244386 BTOKEN - 0.042234424701074812 FTOKEN
            // lp amount from adding liquidity will be (0.042234424701074812 / 0.057759458210855529) * 316227766016837933(first total supply) = 0.231263113939866546 LP
            // new reserve after adding liquidity 2.999999999999999954 BTOKEN - 0.100000000000000000 FTOKEN
            await vaultAsAlice.work(
              0,
              waultSwapWorker01.address,
              ethers.utils.parseEther("1"),
              loan,
              "0",
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
              )
            );

            // Her position should have ~2 NATIVE health (minus some small trading fee)
            expect(await waultSwapWorker01.health(1)).to.be.bignumber.eq(
              ethers.utils.parseEther("1.998307255271658491")
            );
            expect(await waultSwapWorker01.shares(1)).to.eq(ethers.utils.parseEther("0.231263113939866546"));
            expect(await waultSwapWorker01.shareToBalance(await waultSwapWorker01.shares(1))).to.eq(
              ethers.utils.parseEther("0.231263113939866546")
            );

            // WaultSwapWorker needs to be updated to WaultSwapWorker02
            const WaultSwapWorker02 = (await ethers.getContractFactory(
              "WaultSwapWorker02",
              deployer
            )) as WaultSwapWorker02__factory;
            const waultSwapWorker02 = (await upgrades.upgradeProxy(
              waultSwapWorker01.address,
              WaultSwapWorker02
            )) as WaultSwapWorker02;
            await waultSwapWorker02.deployed();

            expect(await waultSwapWorker02.health(1)).to.be.bignumber.eq(
              ethers.utils.parseEther("1.998307255271658491")
            );
            expect(waultSwapWorker02.address).to.eq(waultSwapWorker01.address);

            const waultSwapWorker02AsEve = WaultSwapWorker02__factory.connect(waultSwapWorker02.address, eve);
            // set beneficialVaultRelatedData
            await waultSwapWorker02.setBeneficialVaultConfig(BENEFICIALVAULT_BOUNTY_BPS, vault.address, [
              wex.address,
              wbnb.address,
              baseToken.address,
            ]);

            expect(
              await waultSwapWorker02.beneficialVault(),
              "expect beneficialVault to be equal to input vault"
            ).to.eq(vault.address);
            expect(
              await waultSwapWorker02.beneficialVaultBountyBps(),
              "expect beneficialVaultBountyBps to be equal to BENEFICIALVAULT_BOUNTY_BPS"
            ).to.eq(BENEFICIALVAULT_BOUNTY_BPS);
            expect(await waultSwapWorker02.rewardPath(0), "index #0 of reward path should be wex").to.eq(wex.address);
            expect(await waultSwapWorker02.rewardPath(1), "index #1 of reward path should be wbnb").to.eq(wbnb.address);
            expect(await waultSwapWorker02.rewardPath(2), "index #2 of reward path should be baseToken").to.eq(
              baseToken.address
            );

            // Eve comes and trigger reinvest
            await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
            // Eve calls reinvest to increase the LP size and receive portion of rewards
            // it's 4 blocks apart since the first tx, thus 0.0076 * 4 = 0.303999999999841411 WEX
            // 1% of 0.303999999999841411 will become a bounty, thus eve shall get 90% of 0.003039999999998414 WEX
            // 10% of 0.003039999999998414 will increase a beneficial vault's totalToken, this beneficial vault will get 0.0003039999999998414 WEX
            // thus, 0.002735999999998573 will be returned to eve

            // 0.000303999999999841 WEX is converted to (0.000303999999999841 * 0.998 * 1) / (0.1 + 0.000303999999999841 * 0.998) = 0.003024743171197493 WBNB
            // 0.003024743171197493 WBNB is converted to (0.003024743171197493 * 0.998 * 1) / (0.1 + 0.003024743171197493 * 0.998) = 0.003009608598385266 BTOKEN
            // 0.003009608598385266 will be returned to beneficial vault

            // total reward left to be added to lp is~ 0.300959999999946471 WEX
            // 0.300959999999946471 WEX is converted to (0.300959999999946471 * 0.998 * 0.996975256828802507) / (1.00303999999999945 * 0.998) = 0.747386860140577110 WBNB
            // 0.747386860140577110 WBNB is converted to (0.747386860140577110 * 0.998 * 0.996990391401614734) / (1.003024743171197493 + 0.747386860140577110 * 0.998) = 0.425204464043745703 BTOKEN
            // 0.425204464043745703 BTOKEN will be added to add strat to increase an lp size
            // after optimal swap, 0.425204464043745703 needs to swap 0.205765534821723126 BTOKEN to get the pair
            // thus (0.205765534821723126 * 0.998 * 0.1) / (2.999999999999999958 + 0.205765534821723126 * 0.998) = 0.006406593577860641
            // 0.205765534821723126 BTOKEN - 0.006406593577860641 FTOKEN to be added to  the pool
            // LP from adding the pool will be (0.006406593577860641 / 0.093593406422139359) * 0.547490879956704479 = 0.037476481405619496 LP
            // Accumulated LP will be 0.231263113939866546 + 0.037476481405619496 = 0.268739595345486042
            // now her balance based on share will be equal to (2.31205137369691323 / 2.31205137369691323) * 0.268739595345486042 = 0.268739595345486042 LP
            let vaultBalanceBefore = await baseToken.balanceOf(vault.address);
            await waultSwapWorker02AsEve.reinvest();
            let vaultBalanceAfter = await baseToken.balanceOf(vault.address);
            AssertHelpers.assertAlmostEqual(
              vaultBalanceAfter.sub(vaultBalanceBefore).toString(),
              ethers.utils.parseEther("0.003009608598385266").toString()
            );
            expect(await waultSwapWorker02.buybackAmount()).to.eq(ethers.utils.parseEther("0"));
            AssertHelpers.assertAlmostEqual(
              WEX_REWARD_PER_BLOCK.mul("4")
                .mul(REINVEST_BOUNTY_BPS)
                .div("10000")
                .sub(
                  WEX_REWARD_PER_BLOCK.mul("4")
                    .mul(REINVEST_BOUNTY_BPS)
                    .mul(BENEFICIALVAULT_BOUNTY_BPS)
                    .div("10000")
                    .div("10000")
                )
                .toString(),
              (await wex.balanceOf(eveAddress)).toString()
            );
            await vault.deposit(0); // Random action to trigger interest computation
            const healthDebt = await vault.positionInfo("1");
            expect(healthDebt[0]).to.be.bignumber.above(ethers.utils.parseEther("2"));
            const interest = ethers.utils.parseEther("0.3"); // 30% interest rate
            AssertHelpers.assertAlmostEqual(healthDebt[1].toString(), interest.add(loan).toString());
            AssertHelpers.assertAlmostEqual(
              (await baseToken.balanceOf(vault.address)).toString(),
              deposit.sub(loan).add(ethers.utils.parseEther("0.003009608598385266")).toString()
            );
            AssertHelpers.assertAlmostEqual((await vault.vaultDebtVal()).toString(), interest.add(loan).toString());
            const reservePool = interest.mul(RESERVE_POOL_BPS).div("10000");
            AssertHelpers.assertAlmostEqual(reservePool.toString(), (await vault.reservePool()).toString());
            AssertHelpers.assertAlmostEqual(
              deposit.add(ethers.utils.parseEther("0.003009608598385266")).add(interest).sub(reservePool).toString(),
              (await vault.totalToken()).toString()
            );
            expect(await waultSwapWorker01.shares(1)).to.eq(ethers.utils.parseEther("0.231263113939866546"));
            expect(await waultSwapWorker01.shareToBalance(await waultSwapWorker01.shares(1))).to.eq(
              ethers.utils.parseEther("0.268739595345486042")
            );
            const baseTokenBefore = await baseToken.balanceOf(aliceAddress);
            const farmingTokenBefore = await farmToken.balanceOf(aliceAddress);
            const vaultDebtValBefore = await vault.vaultDebtVal();

            // tresaury config has been set. reinvest will trigger if someone call work.
            await waultSwapWorker02.setTreasuryConfig(DEPLOYER, REINVEST_BOUNTY_BPS);

            // Alice closes her position. reinvest get trigger automatically.
            // it's 3 blocks apart since the first tx, thus 0.0076 * 2 = 0.227999999999734123 WEX
            // 1% of 0.227999999999734123 will become a bounty, thus DELPOYER shall get 90% of 0.002279999999997341 WEX
            // 10% of 0.002279999999997341 will be returned to the beneficial vault = 0.000227999999999734 WEX
            // ----------
            // thus DELPOYER will receive 0.002051999999997607 WEX as a bounty
            // ----------

            // 0.000227999999999734 WEX is converted to (0.000227999999999734 * 0.998 * 0.249588396688225397) / (0.401263999999946416 + 0.000227999999999734 * 0.998) = 0.000141453395431827 WBNB
            // 0.000141453395431827 WBNB is converted to (0.000141453395431827 * 0.998 * 0.571785927357869031) / (1.750411603311774603 + 0.000141453395431827 * 0.998) = 0.000046110748542528 BTOKEN
            // ----------
            // WEX-WBNB reserve: 0.40149199999994615 WEX + 0.24944694329279357 WBNB
            // BTOKN-WBNB reserve: 0.571739816609326503 BTOKEN + 1.75055305670720643 WBNB
            // 0.000046110748542528 will be returned to beneficial vault
            // ----------

            // total bounty left to be added to lp is ~0.225719999999736782 WEX
            // 0.225719999999736782 WEX is converted to (0.225719999999736782 * 0.998 * 0.24944694329279357) / (0.40149199999994615 + 0.225719999999736782  * 0.998) = 0.089655535619427166 WBNB
            // 0.089655535619427166 WBNB is converted to (0.089655535619427166 * 0.998 * 0.571739816609326503) / (1.75055305670720643 + 0.089655535619427166 * 0.998) = 0.027802340286222614 BTOKEN
            // 0.027802340286222614 BTOKEN will be added to add strat to increase an lp size
            // after optimal swap, 0.027802340286222614 needs to swap 0.013886962136907274 BTOKEN to get the pair
            // thus (0.013886962136907274 * 0.998 * 0.1) / (3.425204464043745703 + 0.013886962136907274 * 0.998) = 0.000402993070615032 FTOKEN
            // 0.01391537814931534 BTOKEN + 0.000402993070615032 FTOKEN to be added to  the pool
            // ------------
            // WEX-WBNB after swap: 0.627211999999682932 WEX + 0.159791407673366404 WBNB
            // WBNB-BTOKN after swap: 0.543937476323103889 BTOKEN + 1.840208592326633596 WBNB
            // FTOKEN-BTOKEN after swap & add liq: 0.1 FTOKEN + 3.453006804329968317 BTOKEN
            // LP from adding the pool will be (0.000402993070615032 / 0.099597006929384968) * 0.584967361362323975 = 0.002366916440893809 LP
            // latest LP total supply will be 0.584967361362323975 + 0.002366916440893809 = 0.587334277803217784
            // Accumulated LP will be 0.268739595345486042 + 0.002366916440893809 = 0.271106511786379851
            // now her balance based on share will be equal to (2.31205137369691323 / 2.31205137369691323) * 0.271106511786379851 = 0.271106511786379851
            // ------------

            // now she removes 0.271106511786379851 of her lp to BTOKEN-FTOKEN pair
            // (0.271106511786379851 / 0.587334277803217784) * 0.1 = 0.046158809732745102 FTOKEN
            // (0.271106511786379851 / 0.587334277803217784) * 3.453006804329968317 = 1.593866840869412066 BTOKEN
            // 0.046158809732745102 FTOKEN will be converted to (0.046158809732745102 * 0.998 * 1.859139963460556251) / (0.053841190267254898 + 0.046158809732745102 * 0.998) = 0.857231940763397191 BTOKEN
            // ------------
            // FTOKEN-BTOKEN reserve: 1.00269939881816965 BTOKEN + 0.100000000000000000 FTOKEN
            // Alice has 1 BTOKEN debt + 0.3 BTOKEN interest to pay = 1.3 BTOKEN to pay back to Vault
            // thus, alice will receive 1.593866840869412066 + 0.857231940763397191 - 1.3 = 1.151098781632809257 BTOKEN
            // ------------
            vaultBalanceBefore = await baseToken.balanceOf(vault.address);
            await vaultAsAlice.work(
              1,
              waultSwapWorker01.address,
              "0",
              "0",
              "115792089237316195423570985008687907853269984665640564039457584007913129639935",
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
              )
            );
            vaultBalanceAfter = await baseToken.balanceOf(vault.address);
            const baseTokenAfter = await baseToken.balanceOf(aliceAddress);
            const farmingTokenAfter = await farmToken.balanceOf(aliceAddress);
            AssertHelpers.assertAlmostEqual(
              vaultBalanceAfter.sub(vaultBalanceBefore).toString(),
              ethers.utils.parseEther("0.000030747133689487").add(vaultDebtValBefore).toString()
            );
            AssertHelpers.assertAlmostEqual(
              ethers.utils.parseEther("0.002735999999998573").toString(),
              (await wex.balanceOf(eveAddress)).toString()
            );
            AssertHelpers.assertAlmostEqual(
              ethers.utils.parseEther("0.002051999999997607").toString(),
              (await wex.balanceOf(DEPLOYER)).toString()
            );
            expect(await waultSwapWorker02.buybackAmount()).to.eq(ethers.utils.parseEther("0.000046110748542528"));
            expect(await waultSwapWorker02.shares(1)).to.eq(ethers.utils.parseEther("0"));
            expect(await waultSwapWorker02.shareToBalance(await waultSwapWorker02.shares(1))).to.eq(
              ethers.utils.parseEther("0")
            );
            AssertHelpers.assertAlmostEqual(
              baseTokenAfter.sub(baseTokenBefore).toString(),
              ethers.utils
                .parseEther("1.593866840869412066")
                .add(ethers.utils.parseEther("0.857231940763397191"))
                .sub(interest.add(loan))
                .toString()
            );
            expect(farmingTokenAfter.sub(farmingTokenBefore)).to.eq("0");
          });
        });

        context("when beneficialVault != operator", async () => {
          it("should work with the new upgraded worker", async () => {
            // Deploy MockBeneficialVault
            const MockBeneficialVault = (await ethers.getContractFactory(
              "MockBeneficialVault",
              deployer
            )) as MockBeneficialVault__factory;
            const mockFtokenVault = (await upgrades.deployProxy(MockBeneficialVault, [
              farmToken.address,
            ])) as MockBeneficialVault;

            // Deployer deposits 3 BTOKEN to the Vault
            const deposit = ethers.utils.parseEther("3");
            await baseToken.approve(vault.address, deposit);
            await vault.deposit(deposit);

            // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
            const loan = ethers.utils.parseEther("1");
            await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
            // Position#1: Bob borrows 1 BTOKEN loan and supply another 1 BToken
            // Thus, Bob's position value will be worth 20 BTOKEN
            // After calling `work()`
            // 2 BTOKEN needs to swap 0.732783746325665846 BTOKEN to make 50-50
            // thus (0.732783746325665846 * 0.998 * 0.1) / (1 + 0.732783746325665846 * 0.998) = 0.042240541789144471
            // BTOKEN-FTOKEN reserve after swap -> 1.732783746325665846 BTOKEN 0.057759458210855529 FTOKEN
            // BTOKEN-FTOKEN to be added into the -> 1.267216253674334154 BTOKEN + 0.042240541789144471 FTOKEN
            // lp amount from adding liquidity will be (0.042240541789144471 / 0.057759458210855529) * 0.316227766016837933 (first total supply) = 0.231263113939866546 LP
            // new reserve after adding liquidity 2.999999999999999958 BTOKEN - 0.100000000000000000 FTOKEN
            await vaultAsAlice.work(
              0,
              waultSwapWorker01.address,
              ethers.utils.parseEther("1"),
              loan,
              "0",
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
              )
            );

            // Her position should have ~2 NATIVE health (minus some small trading fee)
            expect(await waultSwapWorker01.health(1)).to.be.bignumber.eq(
              ethers.utils.parseEther("1.998307255271658491")
            );
            expect(await waultSwapWorker01.shares(1)).to.eq(ethers.utils.parseEther("0.231263113939866546"));
            expect(await waultSwapWorker01.shareToBalance(await waultSwapWorker01.shares(1))).to.eq(
              ethers.utils.parseEther("0.231263113939866546")
            );

            // WaultSwapWorker needs to be updated to WaultSwapWorker02
            const WaultSwapWorker02 = (await ethers.getContractFactory(
              "WaultSwapWorker02",
              deployer
            )) as WaultSwapWorker02__factory;
            const waultSwapWorker02 = (await upgrades.upgradeProxy(
              waultSwapWorker01.address,
              WaultSwapWorker02
            )) as WaultSwapWorker02;
            await waultSwapWorker02.deployed();

            expect(await waultSwapWorker02.health(1)).to.be.bignumber.eq(
              ethers.utils.parseEther("1.998307255271658491")
            );
            expect(waultSwapWorker02.address).to.eq(waultSwapWorker01.address);

            const waultSwapWorker02AsEve = WaultSwapWorker02__factory.connect(waultSwapWorker02.address, eve);

            // set beneficialVaultRelatedData
            await waultSwapWorker02.setBeneficialVaultConfig(BENEFICIALVAULT_BOUNTY_BPS, mockFtokenVault.address, [
              wex.address,
              wbnb.address,
              farmToken.address,
            ]);

            expect(
              await waultSwapWorker02.beneficialVault(),
              "expect beneficialVault to be equal to input vault"
            ).to.eq(mockFtokenVault.address);
            expect(
              await waultSwapWorker02.beneficialVaultBountyBps(),
              "expect beneficialVaultBountyBps to be equal to BENEFICIALVAULT_BOUNTY_BPS"
            ).to.eq(BENEFICIALVAULT_BOUNTY_BPS);
            expect(await waultSwapWorker02.getReinvestPath()).to.be.deep.eq([
              wex.address,
              wbnb.address,
              baseToken.address,
            ]);
            expect(await waultSwapWorker02.getRewardPath()).to.be.deep.eq([
              wex.address,
              wbnb.address,
              farmToken.address,
            ]);

            // Eve comes and trigger reinvest
            await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
            // Eve calls reinvest to increase the LP size and receive portion of rewards
            // it's 4 blocks apart since the first tx, thus 0.0076 * 4 = 0.30399999999994593 WEX
            // 1% of 0.30399999999994593 will become a bounty, thus eve shall get 90% of 0.003039999999999450 WEX
            // 10% of 0.003039999999999450 will increase a beneficial vault's totalToken, this beneficial vault will get 0.000303999999999945 WEX
            // --------
            // ******* thus, 0.002735999999999505 WEX will be returned to eve *******
            // --------

            // 0.000303999999999945 WEX is converted to (0.000303999999999945 * 0.998 * 1) / (0.1 + 0.000303999999999945 * 0.998) = 0.003024743171197493 WBNB
            // 0.003024743171197493 WBNB is converted to (0.003024743171197493 * 0.998 * 1) / (1 + 0.003024743171197493 * 0.998) = 0.003009608598385266 FTOKEN
            // --------
            // ******* 0.003009608598385266 FTOKEN will be returned to beneficial vault *******
            // ******* WEX-WBNB after swap 0.100303999999999945 WEX + 0.996975256828802507 WBNB *******
            // ******* WBNB-FTOKEN after swap 0.996990391401614734 FTOKEN + 1.003024743171197493 WBNB ******
            // --------

            // total reward left to be added to lp is ~0.300959999999946471 WEX
            // 0.300959999999946471 WEX is converted to (0.300959999999946471 * 0.998 * 0.996975256828802507) / (0.100303999999999945 + 0.300959999999946471 * 0.998) = 0.747386860140577110 WBNB
            // 0.747386860140577110 WBNB is converted to (0.747386860140577110 * 0.998 * 1) / (1 + 0.747386860140577110 * 0.998) = 0.427226912947203892 BTOKEN
            // 0.427226912947203892 BTOKEN will be added to add strat to increase an lp size
            // after optimal swap, 0.427226912947203892 needs to swap 0.206712721069059174 BTOKEN to get the pair
            // thus (0.206712721069059174 * 0.998 * 0.1) / (2.999999999999999958 + 0.206712721069059174 * 0.998) = 0.006434187098761900
            // 0.220514191878144760 BTOKEN + 0.006434187098761900 FTOKEN to be added to  the pool
            // --------
            // ******* LP from adding the pool will be (0.006434187098761900 / 0.093565812901238100) * 0.547490879956704479 = 0.037648994299077102 LP
            // ******* WEX-WBNB after swap: 0.401263999999946416 WEX + 0.249588396688225397 WBNB
            // ******* WBNB-BTOKN after swap: 0.572773087052796108 BTOKEN + 1.74738686014057711 WBNB
            // ******* FTOKEN-BTOKEN after swap & add liq: 0.1 FTOKEN + 3.427226912947203892 BTOKEN
            // ******* LP total supply = 0.547490879956704479 + 0.037648994299077102 = 0.585139874255781581 LPs
            // ******* Accumulated LP will be 0.231263113939866546 + 0.037648994299077102 = 0.268912108238943648 LPs *******
            // ******* now her balance based on share will be equal to (0.231263113939866546 / 0.231263113939866546) * 0.268912108238943648 = 0.268912108238943648 LP *******
            // --------
            await waultSwapWorker02AsEve.reinvest();
            expect(await farmToken.balanceOf(mockFtokenVault.address)).to.be.eq(
              ethers.utils.parseEther("0.003009608598385266")
            );
            AssertHelpers.assertAlmostEqual(
              WEX_REWARD_PER_BLOCK.mul("4")
                .mul(REINVEST_BOUNTY_BPS)
                .div("10000")
                .sub(
                  WEX_REWARD_PER_BLOCK.mul("4")
                    .mul(REINVEST_BOUNTY_BPS)
                    .mul(BENEFICIALVAULT_BOUNTY_BPS)
                    .div("10000")
                    .div("10000")
                )
                .toString(),
              (await wex.balanceOf(eveAddress)).toString()
            );
            await vault.deposit(0); // Random action to trigger interest computation
            const healthDebt = await vault.positionInfo("1");
            expect(healthDebt[0]).to.be.bignumber.above(ethers.utils.parseEther("2"));
            const interest = ethers.utils.parseEther("0.300001"); // 30% interest rate + 0.000001 for margin
            AssertHelpers.assertAlmostEqual(healthDebt[1].toString(), interest.add(loan).toString());
            AssertHelpers.assertAlmostEqual((await vault.vaultDebtVal()).toString(), interest.add(loan).toString());
            // add 0.000001 for error-margin
            const reservePool = interest.mul(RESERVE_POOL_BPS).div("10000");
            AssertHelpers.assertAlmostEqual(reservePool.toString(), (await vault.reservePool()).toString());
            expect(await waultSwapWorker02.shares(1)).to.eq(ethers.utils.parseEther("0.231263113939866546"));
            expect(await waultSwapWorker02.shareToBalance(await waultSwapWorker02.shares(1))).to.eq(
              ethers.utils.parseEther("0.268912108238943648")
            );

            // tresaury config has been set. reinvest will trigger if someone call work.
            await waultSwapWorker02.setTreasuryConfig(DEPLOYER, REINVEST_BOUNTY_BPS);

            // Alice closes position. This will trigger _reinvest in work function. Hence, positions get reinvested.
            // Reinvest fees should be transferred to DEPLOYER account.
            // it's 3 blocks apart since the first tx, thus 0.0076 * 3 = 0.227999999999856152 WEX
            // 1% of 0.227999999999856152 will become a bounty, thus DEPLOYER shall get 90% of 0.002279999999998561 WEX
            // 10% of 0.002279999999998561 will be returned to the beneficial vault = 0.000227999999999856 WEX
            // --------
            // ***** thus DEPLOYER will receive 0.002051999999998705 WEX as a bounty *****
            // ***** Eve's WEX should still be the same. *****
            // --------

            // 0.000227999999999856 WEX is converted to (0.000227999999999856 * 0.998 * 0.249588396688225397) / (0.401263999999946416 + 0.000227999999999856 * 0.998) = 0.000141453395431903 WBNB
            // 0.000141453395431903 WBNB is converted to (0.000141453395431903 * 0.998 * 0.996990391401614734) / (1.003024743171197493 + 0.000141453395431903 * 0.998) = 0.000140301438483995 FTOKEN
            // --------
            // ***** WEX-WBNB reserve after swap: 0.401491999999946272 WEX + 0.249446943292793494 WBNB
            // ***** FTOKEN-WBNB reserve after swap: 0.996850089963130739 FTOKEN + 1.003166196566629396 WBNB
            // ***** 0.000140301438483995 FTOKEN will be returned to beneficial vault automatically *****
            // ***** Hence mockFtokenVault's FTOKN = 0.000140301438483995 + 0.003009608598385266 = 0.003149910036869261 FTOKEN
            // --------

            // total bounty left to be added to lp is ~0.225719999999857591 WEX
            // 0.225719999999857591 WEX is converted to (0.225719999999857591 * 0.998 * 0.249446943292793494) / (0.401491999999946272 + 0.225719999999857591  * 0.998) = 0.089655535619457860 WBNB
            // 0.089655535619457860 WBNB is converted to (0.089655535619457860 * 0.998 * 0.572773087052796108) / (1.74738686014057711 + 0.089655535619457860 * 0.998) = 0.027900595193786757 BTOKEN
            // 0.027900595193786757 BTOKEN will be added to add strat to increase an lp size
            // after optimal swap, 0.027900595193786757 needs to swap 0.01393595668835438 BTOKEN to get the pair
            // thus (0.01393595668835438 * 0.998 * 0.1) / (3.427226912947203855 + 0.01393595668835438 * 0.998) = 0.000404171437161981 FTOKEN
            // 0.013964638505432377 BTOKEN + 0.000404171437161981 FTOKEN to be added to the pool
            // --------
            // ******* LP from adding the pool will be (0.000404171437161981 / 0.099595828562838019) * 0.585139874255781581 = 0.002374565554917062 LP
            // ******* WEX-WBNB after swap: 0.627211999999803863 WEX + 0.159791407673335634 WBNB
            // ******* WBNB-BTOKN after swap: 0.544872491859009351 BTOKEN + 1.83704239576003497 WBNB
            // ******* FTOKEN-BTOKEN after swap & add liq: 0.1 FTOKEN + 3.455127508140990612 BTOKEN
            // ******* LP total supply = 0.585139874255781581 + 0.002374565554917062 = 0.587514439810698643 LPs
            // ******* Accumulated LP will be 0.268912108238943648 + 0.002374565554917062 = 0.27128667379386071 LPs *******
            // ******* now her balance based on share will be equal to (0.231263113939866546 / 0.231263113939866546) * 0.27128667379386071 = 0.27128667379386071 LP *******
            // --------

            // now she removes 0.27128667379386071 of her lp to BTOKEN-FTOKEN pair
            // (0.27128667379386071 / 0.587514439810698643) * 0.1 = 0.046175320198303758 FTOKEN
            // (0.27128667379386071 / 0.587514439810698643) * 3.455127508140990612 = 1.595416190143776184 BTOKEN
            // 0.046175320198303758 FTOKEN will be converted to (0.046175320198303758 * 0.998 * 1.859711317997214428) / (0.053824679801696242 + 0.046175320198303758 * 0.998) = 0.857802386534912541 BTOKEN
            // --------
            // ***** latest balance of BTOKEN-FTOKEN pair will be 1.001908931462301887 BTOKEN 0.100000000000000000 FTOKEN
            // ***** thus, alice will receive 1.595416190143776184 + 0.857802386534912541 - 1.3 (interest + debt) ~= 1.153218576678688725 BTOKEN *****
            // --------
            const aliceBaseTokenBefore = await baseToken.balanceOf(aliceAddress);
            const aliceFarmingTokenBefore = await farmToken.balanceOf(aliceAddress);
            const eveWexBefore = await wex.balanceOf(eveAddress);
            await vaultAsAlice.work(
              1,
              waultSwapWorker02.address,
              "0",
              "0",
              "115792089237316195423570985008687907853269984665640564039457584007913129639935",
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
              )
            );
            const aliceBaseTokenAfter = await baseToken.balanceOf(aliceAddress);
            const aliceFarmingTokenAfter = await farmToken.balanceOf(aliceAddress);

            expect(await wex.balanceOf(eveAddress), "expect Eve's WEX stay the same").to.be.eq(eveWexBefore);
            expect(await wex.balanceOf(DEPLOYER), "expect deployer get 0.002051999999998705 WEX").to.be.eq(
              ethers.utils.parseEther("0.002051999999998705")
            );
            expect(
              await farmToken.balanceOf(mockFtokenVault.address),
              "expect mockFtokenVault get 0.003103164951042951 FTOKEN from buyback & redistribute"
            ).to.be.eq(ethers.utils.parseEther("0.003149910036869261"));
            expect(
              await baseToken.balanceOf(waultSwapWorker02.address),
              "expect worker shouldn't has any BTOKEN due to operator != beneficialVault"
            ).to.be.eq(ethers.utils.parseEther("0"));
            expect(
              await farmToken.balanceOf(waultSwapWorker02.address),
              "expect worker shouldn't has any FTOKEN due to it is automatically redistribute to ibFTOKEN holder"
            ).to.be.eq(ethers.utils.parseEther("0"));
            expect(await waultSwapWorker02.shares(1), "expect shares(1) is 0 as Alice closed position").to.eq(
              ethers.utils.parseEther("0")
            );
            expect(
              await waultSwapWorker02.shareToBalance(await waultSwapWorker02.shares(1)),
              "expect shareToBalance(shares(1) is 0 as Alice closed position"
            ).to.eq(ethers.utils.parseEther("0"));
            AssertHelpers.assertAlmostEqual(
              aliceBaseTokenAfter.sub(aliceBaseTokenBefore).toString(),
              ethers.utils
                .parseEther("1.595416190143776184")
                .add(ethers.utils.parseEther("0.857802386534912541"))
                .sub(interest.add(loan))
                .toString()
            );
            expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.eq("0");
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
        await swapHelper.loadReserves(await waultSwapWorker.getPath());
        await vaultAsAlice.work(
          0,
          waultSwapWorker.address,
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
          await waultSwapWorker.getPath()
        );
        const expectedHealth = await swapHelper.computeLpHealth(expectedLp, baseToken.address, farmToken.address);

        expect(await waultSwapWorker.health(1)).to.be.bignumber.eq(expectedHealth);
        expect(await waultSwapWorker.shares(1)).to.eq(expectedLp);
        expect(await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1))).to.eq(expectedLp);
      });

      async function successBtokenOnly(lastWorkBlock: BigNumber, goRouge: boolean) {
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));

        let accumLp = await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1));
        const [workerLpBefore] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        const debris = await baseToken.balanceOf(addStrat.address);

        const reinvestPath = await waultSwapWorker.getReinvestPath();
        const path = await waultSwapWorker.getPath();

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
        const blockAfter = await TimeHelpers.latestBlockNumber();
        const blockDiff = blockAfter.sub(lastWorkBlock);
        const totalRewards = workerLpBefore
          .mul(WEX_REWARD_PER_BLOCK.mul(blockDiff).mul(1e12).div(workerLpBefore))
          .div(1e12);
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
        expect(health).to.be.bignumber.above(ethers.utils.parseEther("3"));
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
        expect(await waultSwapWorker.shares(1), `expect Alice's shares = ${accumLp}`).to.be.bignumber.eq(accumLp);
        expect(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1)),
          `expect Alice's staked LPs = ${accumLp}`
        ).to.be.bignumber.eq(accumLp);
        expect(
          await wex.balanceOf(DEPLOYER),
          `expect Deployer gets ${ethers.utils.formatEther(totalReinvestFees)} WEX`
        ).to.be.bignumber.eq(totalReinvestFees);
      }

      async function successTwoSides(lastWorkBlock: BigNumber, goRouge: boolean) {
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
          fairLaunch.address,
          KILL_TREASURY_BPS,
          deployerAddress
        );

        let accumLp = await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1));
        const [workerLpBefore] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        const debris = await baseToken.balanceOf(addStrat.address);

        const reinvestPath = await waultSwapWorker.getReinvestPath();
        const path = await waultSwapWorker.getPath();

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
        const blockAfter = await TimeHelpers.latestBlockNumber();
        const blockDiff = blockAfter.sub(lastWorkBlock);
        const totalRewards = workerLpBefore
          .mul(WEX_REWARD_PER_BLOCK.mul(blockDiff).mul(1e12).div(workerLpBefore))
          .div(1e12);
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
        expect(health).to.be.bignumber.above(ethers.utils.parseEther("3"));
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
        expect(await waultSwapWorker.shares(1), `expect Alice's shares = ${accumLp}`).to.be.bignumber.eq(accumLp);
        expect(
          await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1)),
          `expect Alice's staked LPs = ${accumLp}`
        ).to.be.bignumber.eq(accumLp);
        expect(await wex.balanceOf(DEPLOYER), `expect Deployer gets ${totalReinvestFees} WEX`).to.be.bignumber.eq(
          totalReinvestFees
        );
        expect(
          await baseToken.balanceOf(twoSidesStrat.address),
          `expect TwoSides to have debris ${debrisBtoken} BTOKEN`
        ).to.be.bignumber.eq(debrisBtoken);
        expect(
          await farmToken.balanceOf(twoSidesStrat.address),
          `expect TwoSides to have debris ${debrisFtoken} FTOKEN`
        ).to.be.bignumber.eq(debrisFtoken);
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
            simpleVaultConfig.setWorker(waultSwapWorker.address, true, true, WORK_FACTOR, KILL_FACTOR, false, true);

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
          beforeEach(async () => {
            // Set worker to unstable
            await simpleVaultConfig.setWorker(
              waultSwapWorker.address,
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
              waultSwapWorker.address,
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
