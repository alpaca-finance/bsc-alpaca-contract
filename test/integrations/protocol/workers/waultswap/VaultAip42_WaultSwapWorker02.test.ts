import { ethers, network, upgrades, waffle } from "hardhat";
import { BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
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
  WaultSwapWorker02,
  WaultSwapWorker02__factory,
  SimpleVaultConfig,
  WNativeRelayer,
  StrategyOracleMinimize,
  StrategyOracleLiquidate,
  StrategyOracleMinimize__factory,
  SimplePriceOracle__factory,
  SimplePriceOracle,
  StrategyOracleLiquidate__factory,
  VaultAip42,
  VaultAip42__factory,
} from "../../../../../typechain";
import * as TimeHelpers from "../../../../helpers/time";
import { SwapHelper } from "../../../../helpers/swap";
import { DeployHelper } from "../../../../helpers/deploy";
import { Worker02Helper } from "../../../../helpers/worker";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
const { expect } = chai;

describe("VaultAip42 - WaultSwap02", () => {
  const FOREVER = "2000000000";
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther("5000");
  const WEX_REWARD_PER_BLOCK = ethers.utils.parseEther("0.076");
  const REINVEST_BOUNTY_BPS = "100"; // 1% reinvest bounty
  const RESERVE_POOL_BPS = "1000"; // 10% reserve pool
  const KILL_PRIZE_BPS = "1000"; // 10% Kill prize
  const INTEREST_RATE = "0"; // 0% per year for easy testing
  const MIN_DEBT_SIZE = ethers.utils.parseEther("1"); // 1 BTOKEN min debt size
  const WORK_FACTOR = "7000";
  const KILL_FACTOR = "8000";
  const DISCOUNT_FACTOR = ethers.BigNumber.from("9500");
  const DEPLOYER = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";
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

  /// Price-oracle instance(s)
  let priceOracle: SimplePriceOracle;

  /// Strategy-ralted instance(s)
  let addStrat: WaultSwapRestrictedStrategyAddBaseTokenOnly;
  let liqStrat: WaultSwapRestrictedStrategyLiquidate;
  let oracleMinimizeStrat: StrategyOracleMinimize;
  let oracleLiquidateStrat: StrategyOracleLiquidate;

  /// Vault-related instance(s)
  let simpleVaultConfig: SimpleVaultConfig;
  let wNativeRelayer: WNativeRelayer;
  let vault: VaultAip42;

  /// FairLaunch-related instance(s)
  let fairLaunch: FairLaunch;
  let alpacaToken: AlpacaToken;

  /// WexMaster-related instance(s)
  let wexMaster: WexMaster;
  let waultSwapWorker: WaultSwapWorker02;

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

  let vaultAsAlice: VaultAip42;
  let vaultAsBob: VaultAip42;
  let vaultAsEve: VaultAip42;

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
    // Seed deployer with some native
    await alice.sendTransaction({ to: deployer.address, value: ethers.utils.parseEther("100") });
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
    [alpacaToken, fairLaunch] = await deployHelper.deployAlpacaFairLaunch(
      ALPACA_REWARD_PER_BLOCK,
      ALPACA_BONUS_LOCK_UP_BPS,
      132,
      137
    );
    [vault, simpleVaultConfig, wNativeRelayer] = await deployHelper.deployVaultAip42(
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
    [addStrat, liqStrat] = await deployHelper.deployWaultSwapStrategies(router, vault, wbnb, wNativeRelayer);

    const SimplePriceOracle = new SimplePriceOracle__factory(deployer);
    priceOracle = (await upgrades.deployProxy(SimplePriceOracle, [deployer.address])) as SimplePriceOracle;

    const StrategyOracleMinimize = new StrategyOracleMinimize__factory(deployer);
    oracleMinimizeStrat = (await upgrades.deployProxy(StrategyOracleMinimize, [
      "WaultSwap Oracle Minimize Strategy",
      router.address,
      wNativeRelayer.address,
      priceOracle.address,
      deployer.address,
      DISCOUNT_FACTOR,
    ])) as StrategyOracleMinimize;

    const StrategyOracleLiquidate = new StrategyOracleLiquidate__factory(deployer);
    oracleLiquidateStrat = (await upgrades.deployProxy(StrategyOracleLiquidate, [
      "WaultSwap Oracle Liquidate Strategy",
      router.address,
      priceOracle.address,
      deployer.address,
      DISCOUNT_FACTOR,
    ])) as StrategyOracleLiquidate;

    await baseToken.approve(oracleMinimizeStrat.address, ethers.constants.MaxUint256);
    await baseToken.approve(oracleLiquidateStrat.address, ethers.constants.MaxUint256);

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

    await simpleVaultConfig.setWorker(waultSwapWorker.address, true, true, WORK_FACTOR, KILL_FACTOR, true, true);
    await waultSwapWorker.setStrategyOk([oracleMinimizeStrat.address, oracleLiquidateStrat.address], true);
    await waultSwapWorker.setReinvestorOk([eveAddress], true);
    await waultSwapWorker.setTreasuryConfig(DEPLOYER, REINVEST_BOUNTY_BPS);
    await addStrat.setWorkersOk([waultSwapWorker.address], true);
    await oracleMinimizeStrat.setWorkersOk([waultSwapWorker.address], true);
    await liqStrat.setWorkersOk([waultSwapWorker.address], true);
    await oracleLiquidateStrat.setWorkersOk([waultSwapWorker.address], true);
    await simpleVaultConfig.setApprovedAddStrategy([addStrat.address], true);
    await simpleVaultConfig.setWhitelistedLiquidators([aliceAddress, eveAddress], true);

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

    vaultAsAlice = VaultAip42__factory.connect(vault.address, alice);
    vaultAsBob = VaultAip42__factory.connect(vault.address, bob);
    vaultAsEve = VaultAip42__factory.connect(vault.address, eve);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("when user uses LYF", async () => {
    context("#kill", async () => {
      context("when the positions are liquidatable", async () => {
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

          // Price swing 70%
          // Add more token to the pool equals to
          // sqrt(10*((0.10540925533894599)**2) / 3) - 0.10540925533894599 = 0.08704083439092929
          // (0.10540925533894599 is the balance of token in the pool)
          await router.swapExactTokensForTokens(
            ethers.utils.parseEther("0.08704083439092929"),
            "0",
            [farmToken.address, baseToken.address],
            deployerAddress,
            FOREVER
          );

          // Now position can be liquidated but AIP4.2 is running
          await expect(vaultAsEve.kill("1")).revertedWith("aip4.2");
        });
      });
    });

    context("#forceClose", async () => {
      const borrowAmount = ethers.utils.parseEther("10");
      let stages: Record<string, BigNumber>;
      let accumLp: BigNumber;

      beforeEach(async () => {
        stages = {};

        // Bob deposits 20 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("20"));
        await vaultAsBob.deposit(ethers.utils.parseEther("20"));

        // Position#1: Alice borrows 10 BTOKEN loan
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("10"));
        await vaultAsAlice.work(
          0,
          waultSwapWorker.address,
          ethers.utils.parseEther("10"),
          borrowAmount,
          "0", // max return = 0, don't return BTOKEN to the debt
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );

        [accumLp] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
        console.log(accumLp);

        stages["aliceOpenPosition"] = await TimeHelpers.latestBlockNumber();

        await priceOracle.setPrices(
          [baseToken.address, farmToken.address],
          [farmToken.address, baseToken.address],
          [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("10")]
        );
      });

      context("when caller is not a deployer", async () => {
        it("should revert", async () => {
          await expect(vaultAsEve.forceClose("1", "0x")).to.be.revertedWith("!D");
        });
      });

      context("when caller is a deployer", async () => {
        context("when position is not underwater", async () => {
          context("when use oracle minimize", async () => {
            context("when debt < received base token", async () => {
              it("should work", async () => {
                const [path, reinvestPath] = await Promise.all([
                  waultSwapWorker.getPath(),
                  waultSwapWorker.getReinvestPath(),
                ]);
                await swapHelper.loadReserves(path);
                await swapHelper.loadReserves(reinvestPath);

                const [workerLpBefore] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
                const aliceBaseBefore = await baseToken.balanceOf(aliceAddress);
                const aliceFarmBefore = await farmToken.balanceOf(aliceAddress);

                await vault.forceClose(
                  "1",
                  ethers.utils.defaultAbiCoder.encode(
                    ["address", "bytes"],
                    [oracleMinimizeStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                  )
                );

                const aliceBaseAfter = await baseToken.balanceOf(aliceAddress);
                const aliceFarmAfter = await farmToken.balanceOf(aliceAddress);
                stages["afterForceCloseAlicePosition"] = await TimeHelpers.latestBlockNumber();
                const [workerLpAfter] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
                let totalRewards = swapHelper.computeTotalRewards(
                  workerLpBefore,
                  WEX_REWARD_PER_BLOCK,
                  stages["afterForceCloseAlicePosition"].sub(stages["aliceOpenPosition"])
                );
                let reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
                let reinvestLeft = totalRewards.sub(reinvestFees);

                let reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
                let reinvestBtoken = reinvestAmts[reinvestAmts.length - 1];
                let [reinvestLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(
                  reinvestBtoken,
                  path
                );
                accumLp = accumLp.add(reinvestLp);

                let [receivedBaseToken, receivedFarmToken] = await swapHelper.computeRemoveLiquidiy(
                  baseToken.address,
                  farmToken.address,
                  accumLp
                );

                const positionInfo = await vault.positions(1);
                expect(workerLpAfter).to.be.eq(0);
                expect(aliceBaseAfter.sub(aliceBaseBefore)).to.be.eq(receivedBaseToken.sub(borrowAmount));
                expect(aliceFarmAfter.sub(aliceFarmBefore)).to.be.eq(receivedFarmToken);
                expect(positionInfo.debtShare).to.be.eq(0);
              });
            });

            context("when debt > received base token", async () => {
              it("should work", async () => {
                await farmToken.mint(deployerAddress, ethers.utils.parseEther("100"));
                await farmToken.approve(router.address, ethers.utils.parseEther("100"));

                // Price swing 66%
                // Add more token to the pool equals to sqrt(100*((0.1)**2) / 34) - 0.1 = 0.0714986,
                // (0.1 is the balance of token in the pool)
                await router.swapExactTokensForTokens(
                  ethers.utils.parseEther("0.0714986"),
                  "0",
                  [farmToken.address, baseToken.address],
                  deployerAddress,
                  FOREVER
                );

                const [path, reinvestPath] = await Promise.all([
                  waultSwapWorker.getPath(),
                  waultSwapWorker.getReinvestPath(),
                ]);
                await swapHelper.loadReserves(path);
                await swapHelper.loadReserves(reinvestPath);

                const [workerLpBefore] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
                const aliceBaseBefore = await baseToken.balanceOf(aliceAddress);
                const aliceFarmBefore = await farmToken.balanceOf(aliceAddress);
                const liquidityBaseBefore = await baseToken.balanceOf(deployerAddress);
                const liquidityFarmBefore = await farmToken.balanceOf(deployerAddress);

                await vault.forceClose(
                  "1",
                  ethers.utils.defaultAbiCoder.encode(
                    ["address", "bytes"],
                    [oracleMinimizeStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                  )
                );

                const aliceBaseAfter = await baseToken.balanceOf(aliceAddress);
                const aliceFarmAfter = await farmToken.balanceOf(aliceAddress);
                const liquidityBaseAfter = await baseToken.balanceOf(deployerAddress);
                const liquidityFarmAfter = await farmToken.balanceOf(deployerAddress);

                stages["afterForceCloseAlicePosition"] = await TimeHelpers.latestBlockNumber();
                const [workerLpAfter] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
                let totalRewards = swapHelper.computeTotalRewards(
                  workerLpBefore,
                  WEX_REWARD_PER_BLOCK,
                  stages["afterForceCloseAlicePosition"].sub(stages["aliceOpenPosition"])
                );
                let reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
                let reinvestLeft = totalRewards.sub(reinvestFees);

                let reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
                let reinvestBtoken = reinvestAmts[reinvestAmts.length - 1];
                let [reinvestLp] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
                accumLp = accumLp.add(reinvestLp);

                let [receivedBaseToken, receivedFarmToken] = await swapHelper.computeRemoveLiquidiy(
                  baseToken.address,
                  farmToken.address,
                  accumLp
                );

                const positionInfo = await vault.positions(1);
                const farmOraclePriceData = await priceOracle.getPrice(farmToken.address, baseToken.address);
                const baseNeed = borrowAmount.sub(receivedBaseToken);
                const farmToDeduct = baseNeed
                  .mul(ethers.constants.WeiPerEther)
                  .div(farmOraclePriceData.price.mul(DISCOUNT_FACTOR).div(10000));

                expect(workerLpAfter).to.be.eq(0);
                expect(aliceBaseAfter.sub(aliceBaseBefore)).to.be.eq(0);
                expect(aliceFarmAfter.sub(aliceFarmBefore)).to.be.eq(receivedFarmToken.sub(farmToDeduct));
                expect(liquidityBaseBefore.sub(liquidityBaseAfter)).to.be.eq(baseNeed);
                expect(liquidityFarmAfter.sub(liquidityFarmBefore)).to.be.eq(farmToDeduct);
                expect(positionInfo.debtShare).to.be.eq(0);
              });
            });
          });

          context("when use oracle liquidate", async () => {
            context("when position is not underwater", async () => {
              it("should work", async () => {
                const [path, reinvestPath] = await Promise.all([
                  waultSwapWorker.getPath(),
                  waultSwapWorker.getReinvestPath(),
                ]);
                await swapHelper.loadReserves(path);
                await swapHelper.loadReserves(reinvestPath);

                const [workerLpBefore] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
                const aliceBaseBefore = await baseToken.balanceOf(aliceAddress);
                const aliceFarmBefore = await farmToken.balanceOf(aliceAddress);
                const liquidityBaseBefore = await baseToken.balanceOf(deployerAddress);
                const liquidityFarmBefore = await farmToken.balanceOf(deployerAddress);

                await vault.forceClose(
                  "1",
                  ethers.utils.defaultAbiCoder.encode(
                    ["address", "bytes"],
                    [oracleLiquidateStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                  )
                );

                const aliceBaseAfter = await baseToken.balanceOf(aliceAddress);
                const aliceFarmAfter = await farmToken.balanceOf(aliceAddress);
                const liquidityBaseAfter = await baseToken.balanceOf(deployerAddress);
                const liquidityFarmAfter = await farmToken.balanceOf(deployerAddress);

                stages["afterForceCloseAlicePosition"] = await TimeHelpers.latestBlockNumber();
                const [workerLpAfter] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
                let totalRewards = swapHelper.computeTotalRewards(
                  workerLpBefore,
                  WEX_REWARD_PER_BLOCK,
                  stages["afterForceCloseAlicePosition"].sub(stages["aliceOpenPosition"])
                );
                let reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
                let reinvestLeft = totalRewards.sub(reinvestFees);

                let reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
                let reinvestBtoken = reinvestAmts[reinvestAmts.length - 1];
                let [reinvestLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(
                  reinvestBtoken,
                  path
                );
                accumLp = accumLp.add(reinvestLp);

                let [receivedBaseToken, receivedFarmToken] = await swapHelper.computeRemoveLiquidiy(
                  baseToken.address,
                  farmToken.address,
                  accumLp
                );

                const positionInfo = await vault.positions(1);
                const farmOraclePriceData = await priceOracle.getPrice(farmToken.address, baseToken.address);
                const baseFromLiquiditySource = receivedFarmToken
                  .mul(farmOraclePriceData.price)
                  .mul(DISCOUNT_FACTOR)
                  .div(10000)
                  .div(ethers.constants.WeiPerEther);
                receivedBaseToken = receivedBaseToken.add(baseFromLiquiditySource);

                expect(workerLpAfter).to.be.eq(0);
                expect(aliceBaseAfter.sub(aliceBaseBefore)).to.be.eq(receivedBaseToken.sub(borrowAmount));
                expect(aliceFarmAfter.sub(aliceFarmBefore)).to.be.eq(0);
                expect(liquidityBaseBefore.sub(liquidityBaseAfter)).to.be.eq(baseFromLiquiditySource);
                expect(liquidityFarmAfter.sub(liquidityFarmBefore)).to.be.eq(receivedFarmToken);
                expect(positionInfo.debtShare).to.be.eq(0);
              });
            });

            context("when position is underwater", async () => {
              it("should work", async () => {
                await farmToken.mint(deployerAddress, ethers.utils.parseEther("100"));
                await farmToken.approve(router.address, ethers.utils.parseEther("100"));

                // Price swing 95%
                // Add more token to the pool equals to sqrt(100*((0.1)**2) / 5) - 0.1 = 0.347214,
                // (0.1 is the balance of token in the pool)
                await router.swapExactTokensForTokens(
                  ethers.utils.parseEther("0.347214"),
                  "0",
                  [farmToken.address, baseToken.address],
                  deployerAddress,
                  FOREVER
                );

                const [path, reinvestPath] = await Promise.all([
                  waultSwapWorker.getPath(),
                  waultSwapWorker.getReinvestPath(),
                ]);
                await swapHelper.loadReserves(path);
                await swapHelper.loadReserves(reinvestPath);

                const [workerLpBefore] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
                const aliceBaseBefore = await baseToken.balanceOf(aliceAddress);
                const aliceFarmBefore = await farmToken.balanceOf(aliceAddress);
                const liquidityBaseBefore = await baseToken.balanceOf(deployerAddress);
                const liquidityFarmBefore = await farmToken.balanceOf(deployerAddress);

                await vault.forceClose(
                  "1",
                  ethers.utils.defaultAbiCoder.encode(
                    ["address", "bytes"],
                    [oracleLiquidateStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                  )
                );

                const aliceBaseAfter = await baseToken.balanceOf(aliceAddress);
                const aliceFarmAfter = await farmToken.balanceOf(aliceAddress);
                const liquidityBaseAfter = await baseToken.balanceOf(deployerAddress);
                const liquidityFarmAfter = await farmToken.balanceOf(deployerAddress);

                stages["afterForceCloseAlicePosition"] = await TimeHelpers.latestBlockNumber();
                const [workerLpAfter] = await wexMaster.userInfo(POOL_ID, waultSwapWorker.address);
                let totalRewards = swapHelper.computeTotalRewards(
                  workerLpBefore,
                  WEX_REWARD_PER_BLOCK,
                  stages["afterForceCloseAlicePosition"].sub(stages["aliceOpenPosition"])
                );
                let reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
                let reinvestLeft = totalRewards.sub(reinvestFees);

                let reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
                let reinvestBtoken = reinvestAmts[reinvestAmts.length - 1];
                let [reinvestLp] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
                accumLp = accumLp.add(reinvestLp);

                let [receivedBaseToken, receivedFarmToken] = await swapHelper.computeRemoveLiquidiy(
                  baseToken.address,
                  farmToken.address,
                  accumLp
                );

                const positionInfo = await vault.positions(1);
                const farmOraclePriceData = await priceOracle.getPrice(farmToken.address, baseToken.address);
                const baseFromLiquiditySource = receivedFarmToken
                  .mul(farmOraclePriceData.price)
                  .mul(DISCOUNT_FACTOR)
                  .div(10000)
                  .div(ethers.constants.WeiPerEther);
                receivedBaseToken = receivedBaseToken.add(baseFromLiquiditySource);

                expect(workerLpAfter).to.be.eq(0);
                expect(aliceBaseAfter.sub(aliceBaseBefore)).to.be.eq(0);
                expect(aliceFarmAfter.sub(aliceFarmBefore)).to.be.eq(0);
                expect(liquidityBaseBefore.sub(liquidityBaseAfter)).to.be.eq(baseFromLiquiditySource);
                expect(liquidityFarmAfter.sub(liquidityFarmBefore)).to.be.eq(receivedFarmToken);
                expect(positionInfo.debtShare).to.be.eq(0);
              });
            });
          });
        });
      });
    });
  });
});
