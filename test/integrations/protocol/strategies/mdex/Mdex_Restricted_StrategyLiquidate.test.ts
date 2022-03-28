import { ethers, network, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MdexFactory,
  MdexFactory__factory,
  MdexPair,
  MdexPair__factory,
  MdexRestrictedStrategyLiquidate,
  MdexRestrictedStrategyLiquidate__factory,
  MdexRouter,
  MdexRouter__factory,
  MdxToken,
  MdxToken__factory,
  MockERC20,
  MockERC20__factory,
  MockMdexWorker,
  MockMdexWorker__factory,
  Oracle,
  Oracle__factory,
  PancakePair,
  PancakePair__factory,
  StrategyAddBaseTokenOnly,
  SwapMining,
  SwapMining__factory,
  WETH,
  WETH__factory,
} from "../../../../../typechain";
import * as TimeHelpers from "../../../../helpers/time";
import { deploy } from "@openzeppelin/hardhat-upgrades/dist/utils";
chai.use(solidity);
const { expect } = chai;

const FOREVER = "2000000000";
const MDX_PER_BLOCK = "51600000000000000000";

describe("MdexRestricted_StrategyLiquidate", () => {
  let factory: MdexFactory;
  let router: MdexRouter;
  let lp: MdexPair;

  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;
  let mdxToken: MdxToken;

  let swapMining: SwapMining;

  let oracle: Oracle;

  let mockMdexWorker: MockMdexWorker;
  let mockMdexEvilWorker: MockMdexWorker;

  let strat: MdexRestrictedStrategyLiquidate;

  // initial Contract Signer part
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let wbnbTokenAsAlice: WETH;

  let routerAsAlice: MdexRouter;
  let routerAsBob: MdexRouter;

  let lpAsAlice: PancakePair;
  let lpAsBob: PancakePair;

  let stratAsAlice: MdexRestrictedStrategyLiquidate;
  let stratAsBob: MdexRestrictedStrategyLiquidate;

  let mockMdexWorkerAsBob: MockMdexWorker;
  let mockMdexEvilWorkerAsBob: MockMdexWorker;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();

    const MdexFactory = (await ethers.getContractFactory("MdexFactory", deployer)) as MdexFactory__factory;
    factory = await MdexFactory.deploy(await deployer.getAddress());
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();
    await wbnb.deployed();

    const MdexRouter = (await ethers.getContractFactory("MdexRouter", deployer)) as MdexRouter__factory;
    router = await MdexRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

    const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    baseToken = (await upgrades.deployProxy(MockERC20, ["BTOKEN", "BTOKEN", 18])) as MockERC20;
    await baseToken.deployed();

    farmingToken = (await upgrades.deployProxy(MockERC20, ["FTOKEN", "FTOKEN", 18])) as MockERC20;
    await farmingToken.deployed();

    const MDexToken = (await ethers.getContractFactory("MdxToken", deployer)) as MdxToken__factory;
    mdxToken = await MDexToken.deploy();
    await mdxToken.deployed();

    const Oracle = (await ethers.getContractFactory("Oracle", deployer)) as Oracle__factory;
    oracle = await Oracle.deploy(factory.address);
    await oracle.deployed();

    // mint to alice and bob 100 BToken
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
    //farming token 10 token
    await farmingToken.mint(await alice.getAddress(), ethers.utils.parseEther("10"));
    await farmingToken.mint(await bob.getAddress(), ethers.utils.parseEther("10"));

    await mdxToken.addMinter(await deployer.getAddress());

    //create pair
    await factory.createPair(baseToken.address, farmingToken.address);

    // create LP for using at worker
    lp = MdexPair__factory.connect(await factory.getPair(baseToken.address, farmingToken.address), deployer);
    await factory.addPair(lp.address);
    const MockMdexWorker = (await ethers.getContractFactory("MockMdexWorker", deployer)) as MockMdexWorker__factory;
    mockMdexWorker = (await MockMdexWorker.deploy(
      lp.address,
      baseToken.address,
      farmingToken.address
    )) as MockMdexWorker;

    await mockMdexWorker.deployed();

    // MDEX REWARD SETTING
    const blockNumber = await TimeHelpers.latestBlockNumber();
    const SwapMining = (await ethers.getContractFactory("SwapMining", deployer)) as SwapMining__factory;
    swapMining = await SwapMining.deploy(
      mdxToken.address,
      factory.address,
      oracle.address,
      router.address,
      farmingToken.address,
      MDX_PER_BLOCK,
      blockNumber
    );
    await swapMining.deployed();

    // swapMining
    router.setSwapMining(swapMining.address);
    await swapMining.addPair(100, lp.address, false);
    await swapMining.addWhitelist(baseToken.address);
    await swapMining.addWhitelist(farmingToken.address);
    await mdxToken.addMinter(swapMining.address);

    mockMdexEvilWorker = (await MockMdexWorker.deploy(
      lp.address,
      baseToken.address,
      farmingToken.address
    )) as MockMdexWorker;

    await mockMdexEvilWorker.deployed();

    const MdexRestrictedStrategyLiquidate = (await ethers.getContractFactory(
      "MdexRestrictedStrategyLiquidate",
      deployer
    )) as MdexRestrictedStrategyLiquidate__factory;
    strat = (await upgrades.deployProxy(MdexRestrictedStrategyLiquidate, [
      router.address,
      mdxToken.address,
    ])) as MdexRestrictedStrategyLiquidate;

    await strat.deployed();
    await strat.setWorkersOk([mockMdexWorker.address], true);

    // Signer part
    lpAsAlice = PancakePair__factory.connect(lp.address, alice);
    lpAsBob = PancakePair__factory.connect(lp.address, bob);

    stratAsAlice = MdexRestrictedStrategyLiquidate__factory.connect(strat.address, alice);
    stratAsBob = MdexRestrictedStrategyLiquidate__factory.connect(strat.address, bob);

    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerAsAlice = MdexRouter__factory.connect(router.address, alice);
    routerAsBob = MdexRouter__factory.connect(router.address, bob);

    mockMdexWorkerAsBob = MockMdexWorker__factory.connect(mockMdexWorker.address, bob);
    mockMdexEvilWorkerAsBob = MockMdexWorker__factory.connect(mockMdexEvilWorker.address, bob);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("When bad calldata", async () => {
    it("should revert", async () => {
      await expect(stratAsBob.execute(await bob.getAddress(), "0", "0x1234")).to.be.reverted;
    });
  });

  context("When the setOkWorkers caller is not an owner", async () => {
    it("should be reverted", async () => {
      await expect(stratAsBob.setWorkersOk([mockMdexEvilWorkerAsBob.address], true)).to.reverted;
    });
  });

  context("When non-workers call strat", async () => {
    it("should revert", async () => {
      await expect(
        stratAsBob.execute(await bob.getAddress(), "0", ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"]))
      ).to.be.reverted;
    });
  });

  context("When caller worker hasn't been whitelisted", async () => {
    it("should revert as bad worker", async () => {
      // transfer to evil contract and use evilContract to work
      await baseTokenAsBob.transfer(mockMdexEvilWorkerAsBob.address, ethers.utils.parseEther("0.05"));

      await expect(
        mockMdexEvilWorkerAsBob.work(
          0,
          await bob.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
          )
        )
      ).to.be.revertedWith("MdexRestrictedStrategyLiquidate::onlyWhitelistedWorkers:: bad worker");
    });
  });

  context("When revoke whitelist worker", async () => {
    it("should revertas bad worker", async () => {
      await strat.setWorkersOk([mockMdexWorker.address], false);
      await expect(
        mockMdexWorkerAsBob.work(
          0,
          await bob.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
          )
        )
      ).to.be.revertedWith("MdexRestrictedStrategyLiquidate::onlyWhitelistedWorkers:: bad worker");
    });
  });

  context("When apply liquite strategy", async () => {
    it("should convert all LP token back to ", async () => {
      await factory.setPairFees(lp.address, 25);

      // approve for add liquidity as alice
      await baseTokenAsAlice.approve(router.address, ethers.utils.parseEther("1"));
      await farmingTokenAsAlice.approve(router.address, ethers.utils.parseEther("0.1"));
      await routerAsAlice.addLiquidity(
        baseToken.address,
        farmingToken.address,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("0.1"),
        "0",
        "0",
        await alice.getAddress(),
        FOREVER
      );

      // approve for add liquidity as bob
      await baseTokenAsBob.approve(router.address, ethers.utils.parseEther("1"));
      await farmingTokenAsBob.approve(router.address, ethers.utils.parseEther("0.1"));

      await routerAsBob.addLiquidity(
        baseToken.address,
        farmingToken.address,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("0.1"),
        "0",
        "0",
        await bob.getAddress(),
        FOREVER
      );

      expect(await baseToken.balanceOf(await alice.getAddress())).to.be.eq(ethers.utils.parseEther("99"));
      expect(await baseToken.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("99"));
      expect(await farmingToken.balanceOf(await alice.getAddress())).to.be.eq(ethers.utils.parseEther("9.9"));
      expect(await farmingToken.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("9.9"));

      expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0.316227766016837933"));

      // Bob's position: 0.316227766016837933 LP
      // The following conditions must be satisfied if strategy executed successfully
      // - LPs in Strategy contract must be 0
      // - Worker should have 0 LP left as all LP is liquidated
      // - Bob should have:
      // bobBtokenBefore + 1 BTOKEN + [((0.1*9975)*1)/(0.1*10000+(0.1*9975))] = 0.499374217772215269 BTOKEN] (from swap 0.1 FTOKEN to BTOKEN) in his account
      // - BTOKEN in reserve should be 1-0.499374217772215269 = 0.500625782227784731 BTOKEN
      // - FTOKEN in reserve should be 0.1+0.1 = 0.2 FTOKEN
      // - minBaseToken >= 1.499374217772215269 1 (debt) = 0.499374217772215269 BTOKEN must pass slippage check

      // Bob uses liquidate strategy to turn all LPs back to BTOKEN but with an unreasonable expectation

      await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));

      await expect(
        mockMdexWorkerAsBob.work(
          0,
          await bob.getAddress(),
          ethers.utils.parseEther("1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.499374217772215270")]),
            ]
          )
        )
      ).to.be.revertedWith("insufficient baseToken received");

      const mdexTokenBefore = await mdxToken.balanceOf(await deployer.getAddress());
      const bobBTokenBefore = await baseToken.balanceOf(await bob.getAddress());
      await mockMdexWorkerAsBob.work(
        0,
        await bob.getAddress(),
        ethers.utils.parseEther("1"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [
            strat.address,
            ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.499374217772215269")]),
          ]
        )
      );

      const prevBlockRewardMining = await strat.getMiningRewards([0]);

      const withdrawTx = await strat.withdrawTradingRewards(await deployer.getAddress());

      const currentBlockRewardMining = await swapMining["reward()"]({ blockTag: withdrawTx.blockNumber });

      const totalMiningRewards = prevBlockRewardMining.add(currentBlockRewardMining);

      const mdexTokenAfter = await mdxToken.balanceOf(await deployer.getAddress());

      const bobBTokenAfter = await baseToken.balanceOf(await bob.getAddress());
      expect(
        bobBTokenAfter.sub(bobBTokenBefore),
        "Bob's balance should increase by 1.499374217772215269 BTOKEN"
      ).to.be.eq(ethers.utils.parseEther("1").add(ethers.utils.parseEther("0.499374217772215269")));
      expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
      expect(await baseToken.balanceOf(lp.address)).to.be.eq(ethers.utils.parseEther("0.500625782227784731"));
      expect(await farmingToken.balanceOf(lp.address)).to.be.eq(ethers.utils.parseEther("0.2"));
      // formula is blockReward*poolAlloc/totalAlloc = (825600000000000000000 *100/100 )+ (51600000000000000000 *100/100) = 877200000000000000000
      expect(prevBlockRewardMining).to.be.eq("825600000000000000000");
      expect(totalMiningRewards).to.be.eq("877200000000000000000");
      expect(mdexTokenAfter.sub(mdexTokenBefore)).to.be.eq(totalMiningRewards);
    });
  });

  context("When the withdrawTradingRewards caller is not an owner", async () => {
    it("should be reverted", async () => {
      await expect(stratAsBob.withdrawTradingRewards(await bob.getAddress())).to.reverted;
    });
  });
});
