import { ethers, waffle } from "hardhat";
import { Signer, BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import {
  AlpacaToken,
  FairLaunch,
  FairLaunch__factory,
  MockContractContext,
  MockContractContext__factory,
  MockERC20,
  MockERC20__factory,
  MockWBNB,
  PancakePair,
  PancakePair__factory,
  MdexWorker02__factory,
  SimpleVaultConfig,
  Vault,
  Vault__factory,
  WNativeRelayer,
  MdexWorker02,
  MdexFactory,
  MdexRouter,
  BSCPool,
  MdxToken,
  MdexRestrictedStrategyAddBaseTokenOnly,
  MdexRestrictedStrategyAddTwoSidesOptimal,
  MdexRestrictedStrategyWithdrawMinimizeTrading,
  MdexRestrictedStrategyLiquidate,
  MdexRestrictedStrategyPartialCloseLiquidate,
  MdexRestrictedStrategyPartialCloseMinimizeTrading,
  BSCPool__factory,
  SwapMining,
  Oracle,
  MdxToken__factory,
} from "../../../../../typechain";
import * as TimeHelpers from "../../../../helpers/time";
import * as AssertHelpers from "../../../../helpers/assert";
import { DeployHelper } from "../../../../helpers/deploy";
import { SwapHelper } from "../../../../helpers/swap";
import { Worker02Helper } from "../../../../helpers/worker";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
const { expect } = chai;

describe("Vault - MdexWorker02", () => {
  const FOREVER = "2000000000";
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther("5000");
  const MDX_REWARD_PER_BLOCK = ethers.utils.parseEther("0.076");
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
  const REINVEST_THRESHOLD = ethers.utils.parseEther("1"); // If pendingCake > 1 $MDX, then reinvest
  const KILL_TREASURY_BPS = "100";
  const POOL_IDX = 0;

  /// Mdex-related instance(s)
  let mdexFactory: MdexFactory;
  let mdexRouter: MdexRouter;
  let swapMining: SwapMining;
  let oracle: Oracle;

  let wbnb: MockWBNB;
  let lp: PancakePair;
  let mdxBnbLp: PancakePair;

  /// Token-related instance(s)
  let baseToken: MockERC20;
  let farmToken: MockERC20;
  let mdx: MdxToken;

  /// Strategy-ralted instance(s)
  let addStrat: MdexRestrictedStrategyAddBaseTokenOnly;
  let twoSidesStrat: MdexRestrictedStrategyAddTwoSidesOptimal;
  let liqStrat: MdexRestrictedStrategyLiquidate;
  let minimizeStrat: MdexRestrictedStrategyWithdrawMinimizeTrading;
  let partialCloseStrat: MdexRestrictedStrategyPartialCloseLiquidate;
  let partialCloseMinimizeStrat: MdexRestrictedStrategyPartialCloseMinimizeTrading;

  /// Vault-related instance(s)
  let simpleVaultConfig: SimpleVaultConfig;
  let wNativeRelayer: WNativeRelayer;
  let vault: Vault;

  /// FairLaunch-related instance(s)
  let fairLaunch: FairLaunch;
  let alpacaToken: AlpacaToken;

  /// MdexBSCPool-related instance(s)
  let bscPool: BSCPool;
  let mdexWorker: MdexWorker02;

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
  let mdxTokenAsDeployer: MdxToken;

  let farmTokenAsAlice: MockERC20;

  let fairLaunchAsAlice: FairLaunch;

  let lpAsAlice: PancakePair;
  let lpAsBob: PancakePair;

  let bscPoolAsAlice: BSCPool;
  let bscPoolAsBob: BSCPool;

  let mdexWorkerAsEve: MdexWorker02;
  let mdexWorkerAsDeployer: MdexWorker02;

  let vaultAsAlice: Vault;
  let vaultAsBob: Vault;
  let vaultAsEve: Vault;

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

    [mdexFactory, mdexRouter, mdx, bscPool, swapMining] = await deployHelper.deployMdex(
      wbnb,
      MDX_REWARD_PER_BLOCK,
      [{ address: deployerAddress, amount: ethers.utils.parseEther("100") }],
      farmToken.address
    );

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
      await deployHelper.deployMdexStrategies(mdexRouter, vault, wbnb, wNativeRelayer, mdx);

    // whitelisted contract to be able to call work
    await simpleVaultConfig.setWhitelistedCallers([whitelistedContract.address], true);

    // whitelisted to be able to call kill
    await simpleVaultConfig.setWhitelistedLiquidators([await alice.getAddress(), await eve.getAddress()], true);

    // Set approved add strategies
    await simpleVaultConfig.setApprovedAddStrategy([addStrat.address, twoSidesStrat.address], true);

    // Setup BTOKEN-FTOKEN pair on Pancakeswap
    // Add lp to bscPool's pool
    await mdexFactory.createPair(baseToken.address, farmToken.address);
    await mdexFactory.createPair(mdx.address, wbnb.address);
    lp = PancakePair__factory.connect(await mdexFactory.getPair(farmToken.address, baseToken.address), deployer);
    mdxBnbLp = PancakePair__factory.connect(await mdexFactory.getPair(mdx.address, wbnb.address), deployer);
    await bscPool.add(1, lp.address, true);

    // set swapMining to router
    await mdexRouter.setSwapMining(swapMining.address);

    // Add lp to bscPool's pool
    await swapMining.addPair(0, lp.address, false);
    await swapMining.addPair(100, mdxBnbLp.address, false);
    await swapMining.addWhitelist(baseToken.address);
    await swapMining.addWhitelist(farmToken.address);
    await swapMining.addWhitelist(mdx.address);
    await swapMining.addWhitelist(wbnb.address);

    /// Setup MdexWorker02
    mdexWorker = await deployHelper.deployMdexWorker02(
      vault,
      baseToken,
      bscPool,
      mdexRouter,
      POOL_IDX,
      WORK_FACTOR,
      KILL_FACTOR,
      addStrat,
      liqStrat,
      REINVEST_BOUNTY_BPS,
      [eveAddress],
      DEPLOYER,
      [mdx.address, wbnb.address, baseToken.address],
      [twoSidesStrat.address, minimizeStrat.address, partialCloseStrat.address, partialCloseMinimizeStrat.address],
      simpleVaultConfig
    );

    swapHelper = new SwapHelper(
      mdexFactory.address,
      mdexRouter.address,
      BigNumber.from(9975),
      BigNumber.from(10000),
      deployer
    );

    await swapHelper.addMdexLiquidities([
      {
        token0: baseToken,
        token1: farmToken,
        amount0desired: ethers.utils.parseEther("1"),
        amount1desired: ethers.utils.parseEther("0.1"),
      },
      {
        token0: mdx,
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
    mdxTokenAsDeployer = MdxToken__factory.connect(mdx.address, deployer);

    farmTokenAsAlice = MockERC20__factory.connect(farmToken.address, alice);

    lpAsAlice = PancakePair__factory.connect(lp.address, alice);
    lpAsBob = PancakePair__factory.connect(lp.address, bob);

    fairLaunchAsAlice = FairLaunch__factory.connect(fairLaunch.address, alice);

    bscPoolAsAlice = BSCPool__factory.connect(bscPool.address, alice);
    bscPoolAsBob = BSCPool__factory.connect(bscPool.address, bob);

    vaultAsAlice = Vault__factory.connect(vault.address, alice);
    vaultAsBob = Vault__factory.connect(vault.address, bob);
    vaultAsEve = Vault__factory.connect(vault.address, eve);

    mdexWorkerAsEve = MdexWorker02__factory.connect(mdexWorker.address, eve);
    mdexWorkerAsDeployer = MdexWorker02__factory.connect(mdexWorker.address, deployer);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);

    // reassign SwapHelper here due to provider will be different for each test-case
    workerHelper = new Worker02Helper(mdexWorker.address, bscPool.address);
  });

  context("when worker is initialized", async () => {
    it("should has FTOKEN as a farmingToken in MdexWorker02", async () => {
      expect(farmToken.address).to.be.equal(await mdexWorker.farmingToken());
    });

    it("should initialized the correct feeDenom", async () => {
      expect("10000").to.be.eq(await mdexWorker.feeDenom());
    });

    it("should give rewards out when you stake LP tokens", async () => {
      // Deployer sends some LP tokens to Alice and Bob
      await lp.transfer(aliceAddress, ethers.utils.parseEther("0.05"));
      await lp.transfer(bobAddress, ethers.utils.parseEther("0.05"));

      // Alice and Bob stake 0.01 LP tokens and waits for 1 day
      await lpAsAlice.approve(bscPool.address, ethers.utils.parseEther("0.01"));
      await lpAsBob.approve(bscPool.address, ethers.utils.parseEther("0.02"));

      await bscPoolAsAlice.deposit(POOL_IDX, ethers.utils.parseEther("0.01"));
      await bscPoolAsBob.deposit(POOL_IDX, ethers.utils.parseEther("0.02")); // alice +1 Reward

      // Alice and Bob withdraw stake from the pool
      await bscPoolAsBob.withdraw(POOL_IDX, ethers.utils.parseEther("0.02")); // alice +1/3 Reward  Bob + 2/3 Reward
      await bscPoolAsAlice.withdraw(POOL_IDX, ethers.utils.parseEther("0.01")); // alice +1 Reward

      AssertHelpers.assertAlmostEqual(
        (await mdx.balanceOf(aliceAddress)).toString(),
        MDX_REWARD_PER_BLOCK.mul(BigNumber.from(7)).div(BigNumber.from(3)).toString()
      );
      AssertHelpers.assertAlmostEqual(
        (await mdx.balanceOf(bobAddress)).toString(),
        MDX_REWARD_PER_BLOCK.mul(2).div(3).toString()
      );
    });
  });

  context("when owner is setting worker", async () => {
    describe("#reinvestConfig", async () => {
      it("should set reinvest config correctly", async () => {
        await expect(mdexWorker.setReinvestConfig(250, ethers.utils.parseEther("1"), [mdx.address, baseToken.address]))
          .to.be.emit(mdexWorker, "SetReinvestConfig")
          .withArgs(deployerAddress, 250, ethers.utils.parseEther("1"), [mdx.address, baseToken.address]);
        expect(await mdexWorker.reinvestBountyBps()).to.be.eq(250);
        expect(await mdexWorker.reinvestThreshold()).to.be.eq(ethers.utils.parseEther("1"));
        expect(await mdexWorker.getReinvestPath()).to.deep.eq([mdx.address, baseToken.address]);
      });

      it("should revert when owner set reinvestBountyBps > max", async () => {
        await expect(mdexWorker.setReinvestConfig(1000, "0", [mdx.address, baseToken.address])).to.be.revertedWith(
          "MdexWorker02::setReinvestConfig:: _reinvestBountyBps exceeded maxReinvestBountyBps"
        );
        expect(await mdexWorker.reinvestBountyBps()).to.be.eq(100);
      });

      it("should revert when owner set reinvest path that doesn't start with $MDX and end with $BTOKN", async () => {
        await expect(mdexWorker.setReinvestConfig(200, "0", [baseToken.address, mdx.address])).to.be.revertedWith(
          "MdexWorker02::setReinvestConfig:: _reinvestPath must start with MDX, end with BTOKEN"
        );
      });
    });

    describe("#setMaxReinvestBountyBps", async () => {
      it("should set max reinvest bounty", async () => {
        await mdexWorker.setMaxReinvestBountyBps(200);
        expect(await mdexWorker.maxReinvestBountyBps()).to.be.eq(200);
      });

      it("should revert when new max reinvest bounty over 30%", async () => {
        await expect(mdexWorker.setMaxReinvestBountyBps("3001")).to.be.revertedWith(
          "MdexWorker02::setMaxReinvestBountyBps:: _maxReinvestBountyBps exceeded 30%"
        );
        expect(await mdexWorker.maxReinvestBountyBps()).to.be.eq("500");
      });
    });

    describe("#setTreasuryConfig", async () => {
      it("should successfully set a treasury account", async () => {
        const aliceAddr = aliceAddress;
        await mdexWorker.setTreasuryConfig(aliceAddr, REINVEST_BOUNTY_BPS);
        expect(await mdexWorker.treasuryAccount()).to.eq(aliceAddr);
      });

      it("should successfully set a treasury bounty", async () => {
        await mdexWorker.setTreasuryConfig(DEPLOYER, 499);
        expect(await mdexWorker.treasuryBountyBps()).to.eq(499);
      });

      it("should revert when a new treasury bounty > max reinvest bounty bps", async () => {
        await expect(mdexWorker.setTreasuryConfig(DEPLOYER, parseInt(MAX_REINVEST_BOUNTY) + 1)).to.revertedWith(
          "MdexWorker02::setTreasuryConfig:: _treasuryBountyBps exceeded maxReinvestBountyBps"
        );
        expect(await mdexWorker.treasuryBountyBps()).to.eq(REINVEST_BOUNTY_BPS);
      });
    });

    describe("#setStrategyOk", async () => {
      it("should set strat ok", async () => {
        await mdexWorker.setStrategyOk([aliceAddress], true);
        expect(await mdexWorker.okStrats(aliceAddress)).to.be.eq(true);
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
                mdexWorker.address,
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
              mdexWorker.address,
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
        expect(worker).to.be.eq(mdexWorker.address);
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
            mdexWorker.address,
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
              mdexWorker.address,
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
              mdexWorker.address,
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
              mdexWorker.address,
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
          // Deployer deposits 3 BTOKEN to the bank
          const deposit = ethers.utils.parseEther("3");
          await baseToken.approve(vault.address, deposit);
          await vault.deposit(deposit);

          // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
          const loan = ethers.utils.parseEther("1");
          await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
          await vaultAsAlice.work(
            0,
            mdexWorker.address,
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
          await mdexWorkerAsEve.reinvest();
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
            mdexWorker.address,
            ethers.utils.parseEther("1"),
            loan,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          // Her position should have ~2 NATIVE health (minus some small trading fee)
          expect(await mdexWorker.health(1)).to.be.eq(ethers.utils.parseEther("1.997883397660681282"));

          // Eve comes and trigger reinvest
          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
          await mdexWorkerAsEve.reinvest();
          AssertHelpers.assertAlmostEqual(
            MDX_REWARD_PER_BLOCK.mul("2").mul(REINVEST_BOUNTY_BPS).div("10000").toString(),
            (await mdx.balanceOf(eveAddress)).toString()
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

        it("should work when worker fee has changed to 20", async () => {
          // Deployer deposits 3 BTOKEN to the bank
          await mdexFactory.setFeeRateNumerator(20);

          const deposit = ethers.utils.parseEther("3");
          await baseToken.approve(vault.address, deposit);
          await vault.deposit(deposit);

          // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
          const loan = ethers.utils.parseEther("1");
          await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
          await vaultAsAlice.work(
            0,
            mdexWorker.address,
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

          expect(await mdexWorker.health(1)).to.be.eq(ethers.utils.parseEther("1.998307255271658491"));

          // Eve comes and trigger reinvest
          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
          await mdexWorkerAsEve.reinvest();
          AssertHelpers.assertAlmostEqual(
            MDX_REWARD_PER_BLOCK.mul("2").mul(REINVEST_BOUNTY_BPS).div("10000").toString(),
            (await mdx.balanceOf(eveAddress)).toString()
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
            mdexWorker.address,
            ethers.utils.parseEther("1"),
            loan,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
          await mdexWorkerAsEve.reinvest();
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
            ethers.utils.parseEther("1"), // 1 BTOKEN min debt size,close position correctly when user holds
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
          await mdexWorker.setReinvestConfig("100", "0", [mdx.address, wbnb.address, baseToken.address]);

          const [path, reinvestPath] = await Promise.all([mdexWorker.getPath(), mdexWorker.getReinvestPath()]);

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
            mdexWorker.address,
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
          let [workerLpAfter] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
          expect(await mdexWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
          expect(
            await mdexWorker.shareToBalance(await mdexWorker.shares(1)),
            `expect Pos#1 LPs = ${expectedLp}`
          ).to.be.eq(expectedLp);
          expect(await mdexWorker.totalShare(), `expect totalShare = ${totalShare}`).to.be.eq(totalShare);
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
          [workerLpBefore] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
          let eveCakeBefore = await mdx.balanceOf(eveAddress);
          let deployerCakeBefore = await mdx.balanceOf(DEPLOYER);
          await swapHelper.loadReserves(path);
          await swapHelper.loadReserves(reinvestPath);
          await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("1"));
          await vaultAsBob.work(
            0,
            mdexWorker.address,
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("2"),
            "0", // max return = 0, don't return BTOKEN to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );
          [workerLpAfter] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
          let eveCakeAfter = await mdx.balanceOf(eveAddress);
          let deployerCakeAfter = await mdx.balanceOf(DEPLOYER);
          let totalRewards = swapHelper.computeTotalRewards(workerLpBefore, MDX_REWARD_PER_BLOCK, BigNumber.from(2));
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

          expect(await mdexWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
          expect(
            await mdexWorker.shareToBalance(await mdexWorker.shares(1)),
            `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
          ).to.be.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

          expect(await mdexWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.eq(shares[1]);
          expect(
            await mdexWorker.shareToBalance(await mdexWorker.shares(2)),
            `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
          ).to.be.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

          expect(
            deployerCakeAfter.sub(deployerCakeBefore),
            `expect DEPLOYER to get ${reinvestFees} MDX as treasury fees`
          ).to.be.eq(reinvestFees);
          expect(eveCakeAfter.sub(eveCakeBefore), `expect eve's MDX to remain the same`).to.be.eq("0");
          expect(workerLpAfter, `expect Worker to stake ${accumLp} LP`).to.be.eq(accumLp);
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

          let [workerLPBefore] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
          deployerCakeBefore = await mdx.balanceOf(DEPLOYER);
          eveCakeBefore = await mdx.balanceOf(eveAddress);
          await swapHelper.loadReserves(path);
          await swapHelper.loadReserves(reinvestPath);

          await mdexWorkerAsEve.reinvest();

          deployerCakeAfter = await mdx.balanceOf(DEPLOYER);
          eveCakeAfter = await mdx.balanceOf(eveAddress);
          [workerLpAfter] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
          totalRewards = swapHelper.computeTotalRewards(workerLPBefore, MDX_REWARD_PER_BLOCK, BigNumber.from(2));
          reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
          reinvestLeft = totalRewards.sub(reinvestFees);

          reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
          reinvestBtoken = reinvestAmts[reinvestAmts.length - 1].add(debrisBtoken);
          [reinvestLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
          accumLp = accumLp.add(reinvestLp);

          expect(await mdexWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
          expect(
            await mdexWorker.shareToBalance(await mdexWorker.shares(1)),
            `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
          ).to.be.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

          expect(await mdexWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.eq(shares[1]);
          expect(
            await mdexWorker.shareToBalance(await mdexWorker.shares(2)),
            `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
          ).to.be.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

          expect(deployerCakeAfter.sub(deployerCakeBefore), `expect DEPLOYER's MDX to remain the same`).to.be.eq("0");
          expect(eveCakeAfter.sub(eveCakeBefore), `expect eve to get ${reinvestFees}`).to.be.eq(reinvestFees);
          expect(workerLpAfter).to.be.eq(accumLp);

          // Check Position#1 info
          let [bob1Health, bob1DebtToShare] = await vault.positionInfo("1");
          const bob1ExpectedHealth = await swapHelper.computeLpHealth(
            await mdexWorker.shareToBalance(await mdexWorker.shares(1)),
            baseToken.address,
            farmToken.address
          );
          expect(bob1Health, `expect Pos#1 health = ${bob1ExpectedHealth}`).to.be.eq(bob1ExpectedHealth);
          expect(bob1Health).to.be.gt(ethers.utils.parseEther("20"));
          AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bob1DebtToShare.toString());

          // Check Position#2 info
          let [bob2Health, bob2DebtToShare] = await vault.positionInfo("2");
          const bob2ExpectedHealth = await swapHelper.computeLpHealth(
            await mdexWorker.shareToBalance(await mdexWorker.shares(2)),
            baseToken.address,
            farmToken.address
          );
          expect(bob2Health, `expect Pos#2 health = ${bob2ExpectedHealth}`).to.be.eq(bob2ExpectedHealth);
          expect(bob2Health).to.be.gt(ethers.utils.parseEther("3"));
          AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("2").toString(), bob2DebtToShare.toString());

          let bobBefore = await baseToken.balanceOf(bobAddress);
          let bobAlpacaBefore = await alpacaToken.balanceOf(bobAddress);
          // Bob close position#1
          await vaultAsBob.work(
            1,
            mdexWorker.address,
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
            mdexWorker.address,
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
            mdexWorker.address,
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

          const [path, reinvestPath] = await Promise.all([mdexWorker.getPath(), mdexWorker.getReinvestPath()]);
          // Set Reinvest bounty to 10% of the reward
          await mdexWorker.setReinvestConfig("100", "0", [mdx.address, wbnb.address, baseToken.address]);

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
            mdexWorker.address,
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
          let [workerLpAfter] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
          expect(await mdexWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
          expect(
            await mdexWorker.shareToBalance(await mdexWorker.shares(1)),
            `expect Pos#1 LPs = ${expectedLp}`
          ).to.be.eq(expectedLp);
          expect(await mdexWorker.totalShare(), `expect totalShare = ${totalShare}`).to.be.eq(totalShare);
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
          [workerLpBefore] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
          let eveCakeBefore = await mdx.balanceOf(eveAddress);
          let deployerCakeBefore = await mdx.balanceOf(DEPLOYER);

          // Position#2: Bob open 1x position with 3 BTOKEN
          await swapHelper.loadReserves(path);
          await swapHelper.loadReserves(reinvestPath);
          await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("3"));
          await vaultAsBob.work(
            0,
            mdexWorker.address,
            ethers.utils.parseEther("3"),
            "0",
            "0", // max return = 0, don't return BTOKEN to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );
          [workerLpAfter] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
          let eveCakeAfter = await mdx.balanceOf(eveAddress);
          let deployerCakeAfter = await mdx.balanceOf(DEPLOYER);
          let totalRewards = swapHelper.computeTotalRewards(workerLpBefore, MDX_REWARD_PER_BLOCK, BigNumber.from(2));
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

          expect(await mdexWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
          expect(
            await mdexWorker.shareToBalance(await mdexWorker.shares(1)),
            `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
          ).to.be.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

          expect(await mdexWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.eq(shares[1]);
          expect(
            await mdexWorker.shareToBalance(await mdexWorker.shares(2)),
            `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
          ).to.be.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

          expect(
            deployerCakeAfter.sub(deployerCakeBefore),
            `expect DEPLOYER to get ${reinvestFees} MDX as treasury fees`
          ).to.be.eq(reinvestFees);
          expect(eveCakeAfter.sub(eveCakeBefore), `expect eve's MDX to remain the same`).to.be.eq("0");
          expect(workerLpAfter, `expect Worker to stake ${accumLp} LP`).to.be.eq(accumLp);
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

          let [workerLPBefore] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
          deployerCakeBefore = await mdx.balanceOf(DEPLOYER);
          eveCakeBefore = await mdx.balanceOf(eveAddress);
          await swapHelper.loadReserves(path);
          await swapHelper.loadReserves(reinvestPath);

          await mdexWorkerAsEve.reinvest();

          deployerCakeAfter = await mdx.balanceOf(DEPLOYER);
          eveCakeAfter = await mdx.balanceOf(eveAddress);
          [workerLpAfter] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
          totalRewards = swapHelper.computeTotalRewards(workerLPBefore, MDX_REWARD_PER_BLOCK, BigNumber.from(2));
          reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
          reinvestLeft = totalRewards.sub(reinvestFees);

          reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
          reinvestBtoken = reinvestAmts[reinvestAmts.length - 1].add(debrisBtoken);
          [reinvestLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
          accumLp = accumLp.add(reinvestLp);

          expect(await mdexWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
          expect(
            await mdexWorker.shareToBalance(await mdexWorker.shares(1)),
            `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
          ).to.be.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

          expect(await mdexWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.eq(shares[1]);
          expect(
            await mdexWorker.shareToBalance(await mdexWorker.shares(2)),
            `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
          ).to.be.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

          expect(deployerCakeAfter.sub(deployerCakeBefore), `expect DEPLOYER's MDX to remain the same`).to.be.eq("0");
          expect(eveCakeAfter.sub(eveCakeBefore), `expect eve to get ${reinvestFees}`).to.be.eq(reinvestFees);
          expect(workerLpAfter).to.be.eq(accumLp);

          // Check Position#1 info
          let [bob1Health, bob1DebtToShare] = await vault.positionInfo("1");
          const bob1ExpectedHealth = await swapHelper.computeLpHealth(
            await mdexWorker.shareToBalance(await mdexWorker.shares(1)),
            baseToken.address,
            farmToken.address
          );
          expect(bob1Health, `expect Pos#1 health = ${bob1ExpectedHealth}`).to.be.eq(bob1ExpectedHealth);
          expect(bob1Health).to.be.gt(ethers.utils.parseEther("20"));
          AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bob1DebtToShare.toString());

          // Check Position#2 info
          let [bob2Health, bob2DebtToShare] = await vault.positionInfo("2");
          const bob2ExpectedHealth = await swapHelper.computeLpHealth(
            await mdexWorker.shareToBalance(await mdexWorker.shares(2)),
            baseToken.address,
            farmToken.address
          );
          expect(bob2Health, `expect Pos#2 health = ${bob2ExpectedHealth}`).to.be.eq(bob2ExpectedHealth);
          expect(bob2Health).to.be.gt(ethers.utils.parseEther("3"));
          AssertHelpers.assertAlmostEqual("0", bob2DebtToShare.toString());

          let bobBefore = await baseToken.balanceOf(bobAddress);
          let bobAlpacaBefore = await alpacaToken.balanceOf(bobAddress);
          // Bob close position#1
          await vaultAsBob.work(
            1,
            mdexWorker.address,
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
            mdexWorker.address,
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
            mdexWorker.address,
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
            mdexWorker.address,
            ethers.utils.parseEther("1"),
            loan,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
          await mdexWorkerAsEve.reinvest();
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
          const toBeLiquidatedValue = await mdexWorker.health(1);
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
            mdexWorker.address,
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
            mdexWorker.address,
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
            mdexWorker.address,
            ethers.utils.parseEther("10"),
            ethers.utils.parseEther("10"),
            "0", // max return = 0, don't return BTOKEN to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          await farmToken.mint(deployerAddress, ethers.utils.parseEther("100"));
          await farmToken.approve(mdexRouter.address, ethers.utils.parseEther("100"));

          // Price swing 10%
          // Add more token to the pool equals to sqrt(10*((0.1)**2) / 9) - 0.1 = 0.005409255338945984, (0.1 is the balance of token in the pool)
          await mdexRouter.swapExactTokensForTokens(
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
          await mdexRouter.swapExactTokensForTokens(
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
          await mdexRouter.swapExactTokensForTokens(
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
          await mdexRouter.swapExactTokensForTokens(
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
            mdexWorker.address,
            ethers.utils.parseEther("1"),
            loan,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );

          await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from("1")));
          await mdexWorkerAsEve.reinvest();
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
            mdexWorker.address,
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
            mdexWorker.address,
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

      context("#deposit-#withdraw", async () => {
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
            mdexWorker.address,
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
          await farmToken.approve(mdexRouter.address, ethers.utils.parseEther("100"));
          await mdexRouter.swapExactTokensForTokens(
            ethers.utils.parseEther("100"),
            "0",
            [farmToken.address, baseToken.address],
            deployerAddress,
            FOREVER
          );

          // Alice liquidates Bob position#1
          let aliceBefore = await baseToken.balanceOf(aliceAddress);

          await expect(vaultAsAlice.kill("1")).to.emit(vaultAsAlice, "Kill");

          let aliceAfter = await baseToken.balanceOf(aliceAddress);

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
          await mdexWorker.setReinvestConfig("100", "0", [mdx.address, wbnb.address, baseToken.address]);

          const [path, reinvestPath] = await Promise.all([mdexWorker.getPath(), mdexWorker.getReinvestPath()]);

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
            mdexWorker.address,
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
          let [workerLpAfter] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
          expect(await mdexWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
          expect(
            await mdexWorker.shareToBalance(await mdexWorker.shares(1)),
            `expect Pos#1 LPs = ${expectedLp}`
          ).to.be.eq(expectedLp);
          expect(await mdexWorker.totalShare(), `expect totalShare = ${totalShare}`).to.be.eq(totalShare);
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
          [workerLpBefore] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
          let eveCakeBefore = await mdx.balanceOf(eveAddress);
          let deployerCakeBefore = await mdx.balanceOf(DEPLOYER);
          await swapHelper.loadReserves(path);
          await swapHelper.loadReserves(reinvestPath);
          await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
          await vaultAsAlice.work(
            0,
            mdexWorker.address,
            ethers.utils.parseEther("1"),
            ethers.utils.parseEther("2"),
            "0", // max return = 0, don't return BTOKEN to the debt
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );
          [workerLpAfter] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
          let eveCakeAfter = await mdx.balanceOf(eveAddress);
          let deployerCakeAfter = await mdx.balanceOf(DEPLOYER);
          let totalRewards = swapHelper.computeTotalRewards(workerLpBefore, MDX_REWARD_PER_BLOCK, BigNumber.from(2));
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

          expect(await mdexWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
          expect(
            await mdexWorker.shareToBalance(await mdexWorker.shares(1)),
            `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
          ).to.be.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

          expect(await mdexWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.eq(shares[1]);
          expect(
            await mdexWorker.shareToBalance(await mdexWorker.shares(2)),
            `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
          ).to.be.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

          expect(
            deployerCakeAfter.sub(deployerCakeBefore),
            `expect DEPLOYER to get ${reinvestFees} MDX as treasury fees`
          ).to.be.eq(reinvestFees);
          expect(eveCakeAfter.sub(eveCakeBefore), `expect eve's MDX to remain the same`).to.be.eq("0");
          expect(workerLpAfter, `expect Worker to stake ${accumLp} LP`).to.be.eq(accumLp);
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

          let [workerLPBefore] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
          deployerCakeBefore = await mdx.balanceOf(DEPLOYER);
          eveCakeBefore = await mdx.balanceOf(eveAddress);
          await swapHelper.loadReserves(path);
          await swapHelper.loadReserves(reinvestPath);

          await mdexWorkerAsEve.reinvest();

          deployerCakeAfter = await mdx.balanceOf(DEPLOYER);
          eveCakeAfter = await mdx.balanceOf(eveAddress);
          [workerLpAfter] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
          totalRewards = swapHelper.computeTotalRewards(workerLPBefore, MDX_REWARD_PER_BLOCK, BigNumber.from(2));
          reinvestFees = totalRewards.mul(REINVEST_BOUNTY_BPS).div(10000);
          reinvestLeft = totalRewards.sub(reinvestFees);

          reinvestAmts = await swapHelper.computeSwapExactTokensForTokens(reinvestLeft, reinvestPath, true);
          reinvestBtoken = reinvestAmts[reinvestAmts.length - 1].add(debrisBtoken);
          [reinvestLp, debrisBtoken, debrisFtoken] = await swapHelper.computeOneSidedOptimalLp(reinvestBtoken, path);
          accumLp = accumLp.add(reinvestLp);

          expect(await mdexWorker.shares(1), `expect Pos#1 has ${shares[0]} shares`).to.be.eq(shares[0]);
          expect(
            await mdexWorker.shareToBalance(await mdexWorker.shares(1)),
            `expect Pos#1 LPs = ${workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter)}`
          ).to.be.eq(workerHelper.computeShareToBalance(shares[0], totalShare, workerLpAfter));

          expect(await mdexWorker.shares(2), `expect Pos#2 has ${shares[1]} shares`).to.be.eq(shares[1]);
          expect(
            await mdexWorker.shareToBalance(await mdexWorker.shares(2)),
            `expect Pos#2 LPs = ${workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter)}`
          ).to.be.eq(workerHelper.computeShareToBalance(shares[1], totalShare, workerLpAfter));

          expect(deployerCakeAfter.sub(deployerCakeBefore), `expect DEPLOYER's MDX to remain the same`).to.be.eq("0");
          expect(eveCakeAfter.sub(eveCakeBefore), `expect eve to get ${reinvestFees}`).to.be.eq(reinvestFees);
          expect(workerLpAfter).to.be.eq(accumLp);

          // Check Position#1 info
          let [bob1Health, bob1DebtToShare] = await vault.positionInfo("1");
          const bob1ExpectedHealth = await swapHelper.computeLpHealth(
            await mdexWorker.shareToBalance(await mdexWorker.shares(1)),
            baseToken.address,
            farmToken.address
          );
          expect(bob1Health, `expect Pos#1 health = ${bob1ExpectedHealth}`).to.be.eq(bob1ExpectedHealth);
          expect(bob1Health).to.be.gt(ethers.utils.parseEther("20"));
          AssertHelpers.assertAlmostEqual(ethers.utils.parseEther("10").toString(), bob1DebtToShare.toString());

          // Check Position#2 info
          let [alice2Health, alice2DebtToShare] = await vault.positionInfo("2");
          const alice2ExpectedHealth = await swapHelper.computeLpHealth(
            await mdexWorker.shareToBalance(await mdexWorker.shares(2)),
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
            mdexWorker.address,
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
            mdexWorker.address,
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
            mdexWorker.address,
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

              const [path, reinvestPath] = await Promise.all([mdexWorker.getPath(), mdexWorker.getReinvestPath()]);

              // Set Reinvest bounty to 1% of the reward
              await mdexWorker.setReinvestConfig("100", "0", [mdx.address, wbnb.address, baseToken.address]);

              // Bob deposits 10 BTOKEN
              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.deposit(ethers.utils.parseEther("10"));

              // Position#1: Bob borrows 10 BTOKEN loan and supply another 10 BToken
              // Thus, Bob's position value will be worth 20 BTOKEN
              // After calling `work()`
              // 20 BTOKEN needs to swap 3.587061715703192586 BTOKEN to FTOKEN
              // new reserve after swap will be 4.587061715703192586 0.021843151027158060
              // based on optimal swap formula, BTOKEN-FTOKEN to be added into the LP will be 16.412938284296807414 BTOKEN - 0.078156848972841940 FTOKEN
              // new reserve after adding liquidity 21.000000000000000000 BTOKEN - 0.100000000000000000 FTOKEN
              // lp amount from adding liquidity will be 1.131492691639043045 LP
              const borrowedAmount = ethers.utils.parseEther("10");
              const principalAmount = ethers.utils.parseEther("10");
              let [workerLpBefore] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
              await swapHelper.loadReserves(path);
              await swapHelper.loadReserves(reinvestPath);

              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.work(
                0,
                mdexWorker.address,
                principalAmount,
                borrowedAmount,
                "0", // max return = 0, don't return NATIVE to the debt
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                )
              );

              let [workerLpAfter] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);

              const [expectedLp, debrisBtoken] = await swapHelper.computeOneSidedOptimalLp(
                borrowedAmount.add(principalAmount),
                path
              );

              expect(workerLpAfter.sub(workerLpBefore)).to.eq(expectedLp);

              const deployerCakeBefore = await mdx.balanceOf(DEPLOYER);
              const bobBefore = await baseToken.balanceOf(bobAddress);
              const [bobHealthBefore] = await vault.positionInfo("1");
              const lpUnderBobPosition = await mdexWorker.shareToBalance(await mdexWorker.shares(1));
              const liquidatedLp = lpUnderBobPosition.div(2);
              const returnDebt = ethers.utils.parseEther("6");
              [workerLpBefore] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);

              // Pre-compute
              await swapHelper.loadReserves(path);
              await swapHelper.loadReserves(reinvestPath);

              // Compute reinvest
              const [reinvestFees, reinvestLp] = await swapHelper.computeReinvestLp(
                workerLpBefore,
                debrisBtoken,
                MDX_REWARD_PER_BLOCK,
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
                await mdexWorker.getReversedPath(),
                true
              );
              const liquidatedBtoken = sellFtokenAmounts[sellFtokenAmounts.length - 1]
                .add(btokenAmount)
                .sub(returnDebt);

              await vaultAsBob.work(
                1,
                mdexWorker.address,
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
              const deployerCakeAfter = await mdx.balanceOf(DEPLOYER);

              expect(deployerCakeAfter.sub(deployerCakeBefore), `expect Deployer to get ${reinvestFees}`).to.be.eq(
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
              [workerLpAfter] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
              // LP tokens + 0.000207570473714694 LP from reinvest of worker should be decreased by lpUnderBobPosition/2
              // due to Bob execute StrategyClosePartialLiquidate
              expect(workerLpAfter).to.be.eq(workerLpBefore.add(reinvestLp).sub(lpUnderBobPosition.div(2)));
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

              // Bob deposits 10 BTOKEN
              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.deposit(ethers.utils.parseEther("10"));

              // Position#1: Bob borrows 10 BTOKEN loan and supply another 10 BToken
              // Thus, Bob's position value will be worth 20 BTOKEN
              // After calling `work()`
              // 20 BTOKEN needs to swap 3.587061715703192586 BTOKEN to FTOKEN
              // new reserve after swap will be 4.587061715703192586 0.021843151027158060
              // based on optimal swap formula, BTOKEN-FTOKEN to be added into the LP will be 16.412938284296807414 BTOKEN - 0.078156848972841940 FTOKEN
              // new reserve after adding liquidity 21.000000000000000000 BTOKEN - 0.100000000000000000 FTOKEN
              // lp amount from adding liquidity will be 1.131492691639043045 LP
              let [workerLPBefore] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.work(
                0,
                mdexWorker.address,
                ethers.utils.parseEther("10"),
                ethers.utils.parseEther("10"),
                "0", // max return = 0, don't return BTOKEN to the debt
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
                )
              );

              let [workerLPAfter] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
              expect(workerLPAfter.sub(workerLPBefore)).to.eq(ethers.utils.parseEther("1.131492691639043045"));

              // Bob think he made enough. He now wants to close position partially.
              // He close 50% of his position and return all debt
              const bobBefore = await baseToken.balanceOf(bobAddress);
              const [bobHealthBefore] = await vault.positionInfo("1");
              const lpUnderBobPosition = await mdexWorker.shareToBalance(await mdexWorker.shares(1));
              [workerLPBefore] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);

              // Bob think he made enough. He now wants to close position partially.
              // After calling `work()`, the `_reinvest()` is invoked
              // since 1 blocks have passed since approve and work now reward will be 0.076 * 1 =~ 0.075999999998831803 ~   MDX
              // reward without bounty will be 0.075999999998831803 - 0.000759999999988318 =~ 0.0752399999988435 MDX
              // 0.0752399999988435 MDX can be converted into:
              // (0.0752399999988435 * 0.9975 * 1) / (0.1 + 0.0752399999988435 * 0.9975) = 0.428740847712892766 WBNB
              // 0.428740847712892766 WBNB can be converted into (0.428740847712892766 * 0.9975 * 1) / (1 + 0.428740847712892766 * 0.9975) = 0.299557528330150526 BTOKEN
              // based on optimal swap formula, 0.299557528330150526 BTOKEN needs to swap 0.149435199790075736 BTOKEN
              // new reserve after swap will be 21.149435199790075736 BTOKEN - 0.099295185694161018 FTOKEN
              // based on optimal swap formula, BTOKEN-FTOKEN to be added into the LP will be 0.150122328540074790 BTOKEN - 0.000704814305838982 FTOKEN
              // new reserve after adding liquidity receiving from `_reinvest()` is 21.299557528330150526 BTOKEN - 0.100000000000000000 FTOKEN
              // more LP amount after executing add strategy will be 0.010276168801924356 LP
              // accumulated LP of the worker will be 1.131492691639043045 + 0.010276168801924356 = 1.1417688604409675 LP

              // bob close 50% of his position, thus he will close 1.131492691639043045 * (1.131492691639043045 / (1.131492691639043045)) =~ 1.131492691639043045 / 2 = 0.5657463458195215 LP
              // 0.5657463458195215 LP will be converted into 8.264866063854500749 BTOKEN - 0.038802994160144191 FTOKEN
              // 0.038802994160144191 FTOKEN will be converted into (0.038802994160144191 * 0.9975 * 13.034691464475649777) / (0.061197005839855809 + 0.038802994160144191 * 0.9975) = 5.050104921127982573 BTOKEN
              // thus, Bob will receive 8.264866063854500749 + 5.050104921127982573 = 13.314970984982483322 BTOKEN
              await vaultAsBob.work(
                1,
                mdexWorker.address,
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
                        ethers.utils.parseEther("3.314970984982483322"),
                      ]
                    ),
                  ]
                )
              );
              const bobAfter = await baseToken.balanceOf(bobAddress);

              // After Bob liquidate half of his position which worth
              // 13.314970984982483322 BTOKEN (price impact+trading fee included)
              // Bob wish to return 5,000,000,000 BTOKEN (when maxReturn > debt, return all debt)
              // The following criteria must be stratified:
              // - Bob should get 13.314970984982483322 - 10 = 3.314970984982483322 BTOKEN back.
              // - Bob's position debt must be 0
              expect(
                bobBefore.add(ethers.utils.parseEther("3.314970984982483322")),
                "Expect BTOKEN in Bob's account after close position to increase by ~3.32 BTOKEN"
              ).to.be.eq(bobAfter);
              // Check Bob position info
              const [bobHealth, bobDebtVal] = await vault.positionInfo("1");
              // Bob's health after partial close position must be 50% less than before
              // due to he exit half of lp under his position
              expect(bobHealth).to.be.lt(bobHealthBefore.div(2));
              // Bob's debt should be 0 BTOKEN due he said he wants to return at max 5,000,000,000 BTOKEN (> debt, return all debt)
              expect(bobDebtVal).to.be.eq("0");
              // Check LP deposited by Worker on MasterChef
              [workerLPAfter] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
              // LP tokens + LP tokens from reinvest of worker should be decreased by lpUnderBobPosition/2
              // due to Bob execute StrategyClosePartialLiquidate
              expect(workerLPAfter).to.be.eq(
                workerLPBefore.add(ethers.utils.parseEther("0.010276168801924356")).sub(lpUnderBobPosition.div(2))
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

              // Bob deposits 10 BTOKEN
              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.deposit(ethers.utils.parseEther("10"));

              // Position#1: Bob borrows 10 BTOKEN
              await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther("10"));
              await vaultAsBob.work(
                0,
                mdexWorker.address,
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
              const lpUnderBobPosition = await mdexWorker.shareToBalance(await mdexWorker.shares(1));
              // Bob closes position with maxReturn 0 and liquidate all of his position
              // Expect that Bob will not be able to close his position as he liquidate all underlying assets but not paydebt
              // which made his position debt ratio higher than allow work factor
              await expect(
                vaultAsBob.work(
                  1,
                  mdexWorker.address,
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
      });

      context("#addCollateral", async () => {
        const deposit = ethers.utils.parseEther("3");
        const borrowedAmount = ethers.utils.parseEther("1");
        let snapedTimestampAfterWork: BigNumber = ethers.constants.Zero;

        beforeEach(async () => {
          // Deployer deposits 3 BTOKEN to the bank
          await baseToken.approve(vault.address, deposit);
          await vault.deposit(deposit);

          // Now Alice can borrow 1 BTOKEN + 1 BTOKEN of her to create a new position
          await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
          // Position#1: Alice borrows 1 BTOKEN and supply another 1 BTOKEN
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
          await swapHelper.loadReserves(await mdexWorker.getPath());
          await vaultAsAlice.work(
            0,
            mdexWorker.address,
            ethers.utils.parseEther("1"),
            borrowedAmount,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
            )
          );
          snapedTimestampAfterWork = await TimeHelpers.latest();
          const [expectedLp] = await swapHelper.computeOneSidedOptimalLp(
            ethers.utils.parseEther("1").add(borrowedAmount),
            await mdexWorker.getPath()
          );
          const expectedHealth = await swapHelper.computeLpHealth(expectedLp, baseToken.address, farmToken.address);

          expect(await mdexWorker.health(1)).to.be.eq(expectedHealth);
          expect(await mdexWorker.shares(1)).to.eq(expectedLp);
          expect(await mdexWorker.shareToBalance(await mdexWorker.shares(1))).to.eq(expectedLp);
        });

        async function successBtokenOnly(lastWorkBlock: BigNumber, goRouge: boolean) {
          let accumLp = await mdexWorker.shareToBalance(await mdexWorker.shares(1));
          const [workerLpBefore] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
          const debris = await baseToken.balanceOf(addStrat.address);

          const reinvestPath = await mdexWorker.getReinvestPath();
          const path = await mdexWorker.getPath();

          let reserves = await swapHelper.loadReserves(reinvestPath);
          reserves.push(...(await swapHelper.loadReserves(path)));

          await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));

          const targetTestTimeStamp = snapedTimestampAfterWork.add(
            TimeHelpers.duration.days(ethers.BigNumber.from("1"))
          );
          await TimeHelpers.set(targetTestTimeStamp);
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
            .mul(MDX_REWARD_PER_BLOCK.mul(blockDiff).mul(1e12).div(workerLpBefore))
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
          expect(health).to.be.above(ethers.utils.parseEther("3"));

          const interest = ethers.utils.parseEther("0.3"); // 30% interest rate
          AssertHelpers.assertAlmostEqual(debt.toString(), interest.add(borrowedAmount).toString());
          const baseAmount = (await baseToken.balanceOf(vault.address)).toString();
          AssertHelpers.assertAlmostEqual(baseAmount, deposit.sub(borrowedAmount).toString());
          AssertHelpers.assertAlmostEqual(
            (await vault.vaultDebtVal()).toString(),
            interest.add(borrowedAmount).toString()
          );
          const reservePool = interest.mul(RESERVE_POOL_BPS).div("10000");
          const vaultReservePool = (await vault.reservePool()).toString();
          AssertHelpers.assertAlmostEqual(reservePool.toString(), vaultReservePool);
          AssertHelpers.assertAlmostEqual(
            deposit.add(interest).sub(reservePool).toString(),
            (await vault.totalToken()).toString()
          );
          const deployerMdxBalance = await mdx.balanceOf(DEPLOYER);
          expect(await mdexWorker.shares(1), `expect Alice's shares = ${accumLp}`).to.be.eq(accumLp);
          expect(
            await mdexWorker.shareToBalance(await mdexWorker.shares(1)),
            `expect Alice's staked LPs = ${accumLp}`
          ).to.be.eq(accumLp);
          expect(
            deployerMdxBalance,
            `expect Deployer gets ${ethers.utils.formatEther(totalReinvestFees)} MDX`
          ).to.be.eq(totalReinvestFees);

          // Check reward
          // withdraw trading reward to deployer
          const withDrawTx = await mdexWorker.withdrawTradingRewards(DEPLOYER);
          const mdxAfter = await mdx.balanceOf(DEPLOYER);
          // get trading reward of the previos block
          const pIds = [0, 1];
          const totalRewardPrev = await mdexWorker.getMiningRewards(pIds, {
            blockTag: Number(withDrawTx.blockNumber) - 1,
          });
          const withDrawBlockReward = await swapMining["reward()"]({ blockTag: withDrawTx.blockNumber });

          const totalReward = totalRewardPrev.add(withDrawBlockReward);
          expect(mdxAfter.sub(deployerMdxBalance)).to.eq(totalReward);
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

          let accumLp = await mdexWorker.shareToBalance(await mdexWorker.shares(1));
          const [workerLpBefore] = await bscPool.userInfo(POOL_IDX, mdexWorker.address);
          const debris = await baseToken.balanceOf(addStrat.address);

          const reinvestPath = await mdexWorker.getReinvestPath();
          const path = await mdexWorker.getPath();

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
            .mul(MDX_REWARD_PER_BLOCK.mul(blockDiff).mul(1e12).div(workerLpBefore))
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
          expect(await mdexWorker.shares(1), `expect Alice's shares = ${accumLp}`).to.be.eq(accumLp);
          expect(
            await mdexWorker.shareToBalance(await mdexWorker.shares(1)),
            `expect Alice's staked LPs = ${accumLp}`
          ).to.be.eq(accumLp);
          expect(await mdx.balanceOf(DEPLOYER), `expect Deployer gets ${totalReinvestFees} MDX`).to.be.eq(
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
          await farmToken.approve(mdexRouter.address, ethers.utils.parseEther("888"));
          await mdexRouter.swapExactTokensForTokens(
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
              simpleVaultConfig.setWorker(mdexWorker.address, true, true, WORK_FACTOR, KILL_FACTOR, false, true);

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
              await simpleVaultConfig.setWorker(mdexWorker.address, true, true, WORK_FACTOR, KILL_FACTOR, false, true);
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
              await simpleVaultConfig.setWorker(mdexWorker.address, true, true, WORK_FACTOR, KILL_FACTOR, false, false);
            });

            it("should revert", async () => {
              await revertReserveNotConsistent(true, addStrat.address);
            });
          });
        });
      });

      context("#setRewardPath", async () => {
        beforeEach(async () => {
          const rewardPath = [mdx.address, wbnb.address, baseToken.address];
          // set beneficialVaultConfig
          await mdexWorkerAsDeployer.setBeneficialVaultConfig(BENEFICIALVAULT_BOUNTY_BPS, vault.address, rewardPath);
        });
        it("should revert", async () => {
          const rewardPath = [mdx.address, farmToken.address, farmToken.address];
          await expect(mdexWorkerAsDeployer.setRewardPath(rewardPath)).to.revertedWith(
            "MdexWorker02::setRewardPath:: rewardPath must start with MDX and end with beneficialVault token"
          );
        });

        it("should be able to set new rewardpath", async () => {
          const rewardPath = [mdx.address, farmToken.address, baseToken.address];
          await expect(mdexWorkerAsDeployer.setRewardPath(rewardPath))
            .to.emit(mdexWorker, "SetRewardPath")
            .withArgs(deployerAddress, rewardPath);
        });
      });

      context("#withdrawTradingRewards", async () => {
        it("should only withdraw mdx tradingReward from swapMining", async () => {
          // simulate there are some mdx tokens left in workers
          await mdxTokenAsDeployer.transfer(mdexWorker.address, ethers.utils.parseEther("0.1"));

          const deployerMdxBalanceBefore = await mdx.balanceOf(DEPLOYER);
          const workerMdxBalanceBefore = await mdx.balanceOf(mdexWorker.address);
          // withdraw mdx reward from swapMining and send to deployer
          const withDrawTx = await mdexWorkerAsDeployer.withdrawTradingRewards(deployerAddress);

          const deployerMdxBalanceAfter = await mdx.balanceOf(DEPLOYER);
          const workerMdxBalanceAfter = await mdx.balanceOf(mdexWorker.address);

          // there should be no change in worker's mdx amount
          expect(workerMdxBalanceAfter).to.eq(workerMdxBalanceBefore);
          expect(deployerMdxBalanceAfter.sub(deployerMdxBalanceBefore)).to.eq(0);
        });
      });
    });
  });

  describe("restricted test", async () => {
    context("When the withdrawTradingRewards caller is not an owner", async () => {
      it("should be reverted", async () => {
        await expect(mdexWorkerAsEve.withdrawTradingRewards(await eve.getAddress())).to.reverted;
      });
    });
  });
});
