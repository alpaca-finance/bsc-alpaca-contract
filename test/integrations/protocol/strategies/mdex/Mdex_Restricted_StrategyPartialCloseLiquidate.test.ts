import { ethers, network, upgrades, waffle } from "hardhat";
import { BigNumber, Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  MdexRestrictedStrategyPartialCloseLiquidate,
  MdexRestrictedStrategyPartialCloseLiquidate__factory,
  WETH,
  WETH__factory,
  MdexFactory,
  MdexRouter,
  MdexPair,
  MdexFactory__factory,
  MdexRouter__factory,
  Oracle__factory,
  SwapMining__factory,
  SwapMining,
  Oracle,
  MdexPair__factory,
} from "../../../../../typechain";
import { MockMdexWorker__factory } from "../../../../../typechain/factories/MockMdexWorker__factory";
import { MockMdexWorker } from "../../../../../typechain/MockMdexWorker";
import { assertAlmostEqual } from "../../../../helpers/assert";
import { MdxToken } from "../../../../../typechain/MdxToken";
import { MdxToken__factory } from "../../../../../typechain/factories/MdxToken__factory";
import * as TimeHelpers from "../../../../helpers/time";

chai.use(solidity);
const { expect } = chai;

describe("MdexRestrictedStrategyPartialCloseLiquidate", () => {
  const FOREVER = "2000000000";
  const mdxPerBlock = "51600000000000000000";

  /// Mdex-related instance(s)
  let factory: MdexFactory;
  let router: MdexRouter;
  let swapMining: SwapMining;
  let oracle: Oracle;

  /// MockMdexWorker-related instance(s)
  let mockMdexWorker: MockMdexWorker;
  let mockMdexEvilWorker: MockMdexWorker;

  /// Token-related instance(s)
  let mdxToken: MdxToken;
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let strat: MdexRestrictedStrategyPartialCloseLiquidate;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  let deployerAddress: string;
  let aliceAddress: string;
  let bobAddress: string;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let lpAsAlice: MdexPair;
  let lpAsBob: MdexPair;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerAsAlice: MdexRouter;
  let routerAsBob: MdexRouter;

  let stratAsAlice: MdexRestrictedStrategyPartialCloseLiquidate;
  let stratAsBob: MdexRestrictedStrategyPartialCloseLiquidate;

  let mockMdexWorkerAsBob: MockMdexWorker;
  let mockMdexEvilWorkerAsBob: MockMdexWorker;

  let lp: MdexPair;

  const setupFullFlowTest = async () => {
    /// Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    baseToken = (await upgrades.deployProxy(MockERC20, ["BTOKEN", "BTOKEN", 18])) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
    farmingToken = (await upgrades.deployProxy(MockERC20, ["FTOKEN", "FTOKEN", 18])) as MockERC20;
    await farmingToken.deployed();
    await farmingToken.mint(aliceAddress, ethers.utils.parseEther("10"));
    await farmingToken.mint(bobAddress, ethers.utils.parseEther("10"));

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();

    const MdxToken = (await ethers.getContractFactory("MdxToken", deployer)) as MdxToken__factory;
    mdxToken = await MdxToken.deploy();
    await mdxToken.deployed();
    await mdxToken.addMinter(await deployer.getAddress());
    await mdxToken.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));

    // Setup Mdex
    const MdexFactory = (await ethers.getContractFactory("MdexFactory", deployer)) as MdexFactory__factory;
    factory = await MdexFactory.deploy(await deployer.getAddress());
    await factory.deployed();

    const MdexRouter = (await ethers.getContractFactory("MdexRouter", deployer)) as MdexRouter__factory;
    router = await MdexRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

    const Oracle = (await ethers.getContractFactory("Oracle", deployer)) as Oracle__factory;
    oracle = await Oracle.deploy(factory.address);
    await oracle.deployed();

    // Mdex SwapMinig
    const blockNumber = await TimeHelpers.latestBlockNumber();
    const SwapMining = (await ethers.getContractFactory("SwapMining", deployer)) as SwapMining__factory;
    swapMining = await SwapMining.deploy(
      mdxToken.address,
      factory.address,
      oracle.address,
      router.address,
      farmingToken.address,
      mdxPerBlock,
      blockNumber
    );
    await swapMining.deployed();

    // set swapMining to router
    await router.setSwapMining(swapMining.address);

    /// Setup BTOKEN-FTOKEN pair on Mdex
    await factory.createPair(farmingToken.address, baseToken.address);
    lp = MdexPair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);
    await lp.deployed();
    await factory.addPair(lp.address);
    await mdxToken.addMinter(swapMining.address);
    await swapMining.addPair(100, lp.address, false);
    await swapMining.addWhitelist(baseToken.address);
    await swapMining.addWhitelist(farmingToken.address);
  };

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();
    [deployerAddress, aliceAddress, bobAddress] = await Promise.all([
      deployer.getAddress(),
      alice.getAddress(),
      bob.getAddress(),
    ]);
    await setupFullFlowTest();

    /// Setup MockMdexWorker
    const MockMdexWorker = (await ethers.getContractFactory("MockMdexWorker", deployer)) as MockMdexWorker__factory;
    mockMdexWorker = (await MockMdexWorker.deploy(
      lp.address,
      baseToken.address,
      farmingToken.address
    )) as MockMdexWorker;
    await mockMdexWorker.deployed();
    mockMdexEvilWorker = (await MockMdexWorker.deploy(
      lp.address,
      baseToken.address,
      farmingToken.address
    )) as MockMdexWorker;
    await mockMdexEvilWorker.deployed();

    const MdexRestrictedStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "MdexRestrictedStrategyPartialCloseLiquidate",
      deployer
    )) as MdexRestrictedStrategyPartialCloseLiquidate__factory;
    strat = (await upgrades.deployProxy(MdexRestrictedStrategyPartialCloseLiquidate, [
      router.address,
      mdxToken.address,
    ])) as MdexRestrictedStrategyPartialCloseLiquidate;
    await strat.deployed();
    await strat.setWorkersOk([mockMdexWorker.address], true);
    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerAsAlice = MdexRouter__factory.connect(router.address, alice);
    routerAsBob = MdexRouter__factory.connect(router.address, bob);

    lpAsAlice = MdexPair__factory.connect(lp.address, alice);
    lpAsBob = MdexPair__factory.connect(lp.address, bob);

    stratAsAlice = MdexRestrictedStrategyPartialCloseLiquidate__factory.connect(strat.address, alice);
    stratAsBob = MdexRestrictedStrategyPartialCloseLiquidate__factory.connect(strat.address, bob);

    mockMdexWorkerAsBob = MockMdexWorker__factory.connect(mockMdexWorker.address, bob);
    mockMdexEvilWorkerAsBob = MockMdexWorker__factory.connect(mockMdexEvilWorker.address, bob);

    // Setting up liquidity
    // Alice adds 0.1 FTOKEN + 1 BTOKEN
    await baseTokenAsAlice.approve(router.address, ethers.utils.parseEther("1"));
    await farmingTokenAsAlice.approve(router.address, ethers.utils.parseEther("0.1"));
    await routerAsAlice.addLiquidity(
      baseToken.address,
      farmingToken.address,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("0.1"),
      "0",
      "0",
      aliceAddress,
      FOREVER
    );

    // Bob tries to add 1 FTOKEN + 1 BTOKEN (but obviously can only add 0.1 FTOKEN)
    await baseTokenAsBob.approve(router.address, ethers.utils.parseEther("1"));
    await farmingTokenAsBob.approve(router.address, ethers.utils.parseEther("1"));
    await routerAsBob.addLiquidity(
      baseToken.address,
      farmingToken.address,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("1"),
      "0",
      "0",
      bobAddress,
      FOREVER
    );

    expect(await baseToken.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("99"));
    expect(await farmingToken.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("9.9"));
    expect(await lp.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0.316227766016837933"));
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("When bad calldata", async () => {
    it("should revert", async () => {
      // Bob passes some bad calldata that can't be decoded
      await expect(stratAsBob.execute(bobAddress, "0", "0x1234")).to.be.reverted;
    });
  });

  context("When the setOkWorkers caller is not an owner", async () => {
    it("should be reverted", async () => {
      await expect(stratAsBob.setWorkersOk([mockMdexEvilWorkerAsBob.address], true)).to.reverted;
    });
  });

  context("When non-worker call the strat", async () => {
    it("should revert", async () => {
      await expect(
        stratAsBob.execute(
          bobAddress,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["uint256", "uint256"],
            [ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.5")]
          )
        )
      ).to.be.reverted;
    });
  });

  context("When caller worker hasn't been whitelisted", async () => {
    it("should revert as bad worker", async () => {
      await baseTokenAsBob.transfer(mockMdexEvilWorkerAsBob.address, ethers.utils.parseEther("0.05"));
      await expect(
        mockMdexEvilWorkerAsBob.work(
          0,
          bobAddress,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256"],
                [ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.5")]
              ),
            ]
          )
        )
      ).to.be.revertedWith("MdexRestrictedStrategyPartialCloseLiquidate::onlyWhitelistedWorkers:: bad worker");
    });
  });

  context("when revoking whitelist workers", async () => {
    it("should revert as bad worker", async () => {
      await strat.setWorkersOk([mockMdexWorker.address], false);
      await expect(
        mockMdexWorkerAsBob.work(
          0,
          bobAddress,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256"],
                [ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.5")]
              ),
            ]
          )
        )
      ).to.be.revertedWith("MdexRestrictedStrategyPartialCloseLiquidate::onlyWhitelistedWorkers:: bad worker");
    });
  });

  context("when maxLpToLiquidate >= LPs from worker", async () => {
    it("should use all LP (fee 20)", async () => {
      // set lp pair fee
      await factory.setPairFees(lp.address, 20);
      // Bob transfer LP to strategy first
      const bobBTokenBefore = await baseToken.balanceOf(bobAddress);
      await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));

      // Bob's position: 0.316227766016837933 LP
      // lpToLiquidate: Math.min(888, 0.316227766016837933) = 0.316227766016837933 LP (0.1 FTOKEN + 1 FTOKEN)
      // After execute strategy. The following conditions must be satisfied
      // - LPs in Strategy contract must be 0
      // - Worker should have 0 LP left as all LP is liquidated
      // - Bob should have:
      // bobBtokenBefore + 1 BTOKEN + [((0.1*998)*1)/(0.1*1000+(0.1*998))] = 0.499499499499499499 BTOKEN] (from swap 0.1 FTOKEN to BTOKEN) in his account
      // - BTOKEN in reserve should be 1-0.499499499499499499 = 0.500500500500500501 BTOKEN
      // - FTOKEN in reserve should be 0.1+0.1 = 0.2 FTOKEN
      await expect(
        mockMdexWorkerAsBob.work(
          0,
          bobAddress,
          ethers.utils.parseEther("0"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [
                  ethers.utils.parseEther("8888"),
                  ethers.utils.parseEther("0"),
                  ethers.utils.parseEther("1.499499499499499499"),
                ]
              ),
            ]
          )
        )
      )
        .to.emit(strat, "MdexRestrictedStrategyPartialCloseLiquidateEvent")
        .withArgs(baseToken.address, farmingToken.address, ethers.utils.parseEther("0.316227766016837933"), "0");

      expect(await lp.balanceOf(strat.address), "Strategy should has 0 LP").to.be.eq(ethers.utils.parseEther("0"));
      expect(
        await lp.balanceOf(mockMdexWorkerAsBob.address),
        "Worker should has 0 LP as all LP is liquidated"
      ).to.be.eq("0");
      expect(
        await baseToken.balanceOf(bobAddress),
        "Bob's BTOKEN should increase by 1.499499499499499499 BTOKEN"
      ).to.be.eq(
        bobBTokenBefore.add(ethers.utils.parseEther("1")).add(ethers.utils.parseEther("0.499499499499499499"))
      );
      expect(await baseToken.balanceOf(lp.address), "FTOKEN-BTOKEN LP should has 0.500500500500500501 BTOKEN").to.be.eq(
        ethers.utils.parseEther("0.500500500500500501")
      );
      expect(await farmingToken.balanceOf(lp.address), "FTOKEN-BTOKEN LP should as 0.2 FTOKEN").to.be.eq(
        ethers.utils.parseEther("0.2")
      );
    });
    it("should use all LP (fee 25)", async () => {
      // set lp pair fee
      await factory.setPairFees(lp.address, 25);
      // Bob transfer LP to strategy first
      const bobBTokenBefore = await baseToken.balanceOf(bobAddress);
      await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));

      // Bob's position: 0.316227766016837933 LP
      // lpToLiquidate: Math.min(888, 0.316227766016837933) = 0.316227766016837933 LP (0.1 FTOKEN + 1 FTOKEN)
      // After execute strategy. The following conditions must be satisfied
      // - LPs in Strategy contract must be 0
      // - Worker should have 0 LP left as all LP is liquidated
      // - Bob should have:
      // bobBtokenBefore + 1 BTOKEN + [((0.1*9975)*1)/(0.1*10000+(0.1*9975))] = 0.499374217772215269 BTOKEN] (from swap 0.1 FTOKEN to BTOKEN) in his account
      // - BTOKEN in reserve should be 1-0.499374217772215269 = 0.500625782227784731 BTOKEN
      // - FTOKEN in reserve should be 0.1+0.1 = 0.2 FTOKEN
      await expect(
        mockMdexWorkerAsBob.work(
          0,
          bobAddress,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [
                  ethers.utils.parseEther("8888"),
                  ethers.utils.parseEther("0"),
                  ethers.utils.parseEther("1.499374217772215269"),
                ]
              ),
            ]
          )
        )
      )
        .to.emit(strat, "MdexRestrictedStrategyPartialCloseLiquidateEvent")
        .withArgs(baseToken.address, farmingToken.address, ethers.utils.parseEther("0.316227766016837933"), "0");

      expect(await lp.balanceOf(strat.address), "Strategy should has 0 LP").to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(mockMdexWorker.address), "Worker should has 0 LP as all LP is liquidated").to.be.eq(
        "0"
      );
      expect(
        await baseToken.balanceOf(bobAddress),
        "Bob's BTOKEN should increase by 1.499374217772215269 BTOKEN"
      ).to.be.eq(
        bobBTokenBefore.add(ethers.utils.parseEther("1")).add(ethers.utils.parseEther("0.499374217772215269"))
      );
      expect(await baseToken.balanceOf(lp.address), "FTOKEN-BTOKEN LP should has 0.500625782227784731 BTOKEN").to.be.eq(
        ethers.utils.parseEther("0.500625782227784731")
      );
      expect(await farmingToken.balanceOf(lp.address), "FTOKEN-BTOKEN LP should as 0.2 FTOKEN").to.be.eq(
        ethers.utils.parseEther("0.2")
      );
    });
  });

  context("when maxLpToLiquidate < LPs from worker", async () => {
    it("should liquidate portion LPs back to BTOKEN (fee 20)", async () => {
      // set lp pair fee
      await factory.setPairFees(lp.address, 20);
      // Bob transfer LP to strategy first
      const bobLpBefore = await lp.balanceOf(bobAddress);
      const bobBTokenBefore = await baseToken.balanceOf(bobAddress);
      await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));

      // Bob uses partial close liquidate strategy to turn the 50% LPs back to BTOKEN with the same minimum value and the same maxReturn
      const returnLp = bobLpBefore.div(2);
      await expect(
        mockMdexWorkerAsBob.work(
          0,
          bobAddress,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [returnLp, ethers.utils.parseEther("0"), ethers.utils.parseEther("0.5")]
              ),
            ]
          )
        )
      )
        .to.emit(strat, "MdexRestrictedStrategyPartialCloseLiquidateEvent")
        .withArgs(baseToken.address, farmingToken.address, returnLp, "0");

      // After execute strategy successfully. The following conditions must be satisfied
      // - LPs in Strategy contract must be 0
      // - Bob should have bobLpBefore - returnLp left in his account
      // - Bob should have bobBtokenBefore + 0.5 BTOKEN + [((0.05*998)*1.5)/(0.15*1000+(0.05*998))] = 0.374437218609304652 BTOKEN] (from swap 0.05 FTOKEN to BTOKEN) in his account
      // - BTOKEN in reserve should be 1.5-0.374437218609304652 = 1.125562781390695348 BTOKEN
      // - FTOKEN in reserve should be 0.15+0.05 = 0.2 FTOKEN
      expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(mockMdexWorkerAsBob.address)).to.be.eq(bobLpBefore.sub(returnLp));
      assertAlmostEqual(
        bobBTokenBefore
          .add(ethers.utils.parseEther("0.5"))
          .add(ethers.utils.parseEther("0.374437218609304652"))
          .toString(),
        (await baseToken.balanceOf(bobAddress)).toString()
      );
      assertAlmostEqual(
        ethers.utils.parseEther("1.125562781390695348").toString(),
        (await baseToken.balanceOf(lp.address)).toString()
      );
      assertAlmostEqual(
        ethers.utils.parseEther("0.2").toString(),
        (await farmingToken.balanceOf(lp.address)).toString()
      );
    });
    it("should liquidate portion LPs back to BTOKEN (fee 25)", async () => {
      // set lp pair fee
      await factory.setPairFees(lp.address, 25);
      // Bob transfer LP to strategy first
      const bobLpBefore = await lp.balanceOf(bobAddress);
      const bobBTokenBefore = await baseToken.balanceOf(bobAddress);
      await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));

      // Bob uses partial close liquidate strategy to turn the 50% LPs back to BTOKEN with the same minimum value and the same maxReturn
      const returnLp = bobLpBefore.div(2);
      await expect(
        mockMdexWorkerAsBob.work(
          0,
          bobAddress,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [returnLp, ethers.utils.parseEther("0"), ethers.utils.parseEther("0.5")]
              ),
            ]
          )
        )
      )
        .to.emit(strat, "MdexRestrictedStrategyPartialCloseLiquidateEvent")
        .withArgs(baseToken.address, farmingToken.address, returnLp, "0");

      // After execute strategy successfully. The following conditions must be satisfied
      // - LPs in Strategy contract must be 0
      // - Bob should have bobLpBefore - returnLp left in his account
      // - Bob should have bobBtokenBefore + 0.5 BTOKEN + [((0.05*9975)*1.5)/(0.15*10000+(0.05*9975))] = ~0.374296435272045028 BTOKEN] (from swap 0.05 FTOKEN to BTOKEN) in his account
      // - BTOKEN in reserve should be 1.5-0.374296435272045028 = 1.12570356 BTOKEN
      // - FTOKEN in reserve should be 0.15+0.05 = 0.2 FTOKEN
      expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(mockMdexWorker.address)).to.be.eq(bobLpBefore.sub(returnLp));
      assertAlmostEqual(
        bobBTokenBefore
          .add(ethers.utils.parseEther("0.5"))
          .add(ethers.utils.parseEther("0.374296435272045028"))
          .toString(),
        (await baseToken.balanceOf(bobAddress)).toString()
      );
      assertAlmostEqual(
        ethers.utils.parseEther("1.12570356").toString(),
        (await baseToken.balanceOf(lp.address)).toString()
      );
      assertAlmostEqual(
        ethers.utils.parseEther("0.2").toString(),
        (await farmingToken.balanceOf(lp.address)).toString()
      );
    });
  });

  context("when maxDebtRepayment >= debt", async () => {
    it("should compare slippage by taking convertingPostionValue - debt (fee 20)", async () => {
      // set lp pair fee
      await factory.setPairFees(lp.address, 20);
      // Bob transfer LP to strategy first
      const bobBTokenBefore = await baseToken.balanceOf(bobAddress);
      await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));

      // Bob's position: 0.316227766016837933 LP
      // Debt: 1 BTOKEN
      // lpToLiquidate: Math.min(888, 0.316227766016837933) = 0.316227766016837933 LP (0.1 FTOKEN + 1 FTOKEN)
      // maxDebtRepayment: Math.min(888, 1) = 1 BTOKEN
      // The following conditions are expected:
      // - LPs in Strategy contract must be 0
      // - Worker should have 0 LP left as all LP is liquidated
      // - Bob should have:
      // bobBtokenBefore + 1 BTOKEN + [((0.1*998)*1)/(0.1*10000+(0.1*998))] = 0.499499499499499499 BTOKEN] (from swap 0.1 FTOKEN to BTOKEN) in his account
      // - BTOKEN in reserve should be 1-0.499499499499499499 = 0.500500500500500501 BTOKEN
      // - FTOKEN in reserve should be 0.1+0.1 = 0.2 FTOKEN
      // - minBaseToken <= 1.499499499499499499 - 1 (debt) = 0.499499499499499499 BTOKEN must pass slippage check

      // Expect to be reverted if slippage is set at 0.499499499499499499 + 1 wei BTOKEN
      await expect(
        mockMdexWorkerAsBob.work(
          0,
          bobAddress,
          ethers.utils.parseEther("1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [
                  ethers.utils.parseEther("8888"),
                  ethers.utils.parseEther("8888"),
                  ethers.utils.parseEther("0.499499499499499499").add(1),
                ]
              ),
            ]
          )
        )
      ).to.be.revertedWith("MdexRestrictedStrategyPartialCloseLiquidate::execute:: insufficient baseToken received");

      await expect(
        mockMdexWorkerAsBob.work(
          0,
          bobAddress,
          ethers.utils.parseEther("1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [
                  ethers.utils.parseEther("8888"),
                  ethers.utils.parseEther("8888"),
                  ethers.utils.parseEther("0.499499499499499499"),
                ]
              ),
            ]
          )
        )
      )
        .to.emit(strat, "MdexRestrictedStrategyPartialCloseLiquidateEvent")
        .withArgs(
          baseToken.address,
          farmingToken.address,
          ethers.utils.parseEther("0.316227766016837933"),
          ethers.utils.parseEther("1")
        );

      expect(await lp.balanceOf(strat.address), "Strategy should has 0 LP").to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(mockMdexWorker.address), "Worker should has 0 LP as all LP is liquidated").to.be.eq(
        "0"
      );
      expect(
        await baseToken.balanceOf(bobAddress),
        "Bob's BTOKEN should increase by 1.499499499499499499 BTOKEN"
      ).to.be.eq(
        bobBTokenBefore.add(ethers.utils.parseEther("1")).add(ethers.utils.parseEther("0.499499499499499499"))
      );
      expect(await baseToken.balanceOf(lp.address), "FTOKEN-BTOKEN LP should has 0.500500500500500501 BTOKEN").to.be.eq(
        ethers.utils.parseEther("0.500500500500500501")
      );
      expect(await farmingToken.balanceOf(lp.address), "FTOKEN-BTOKEN LP should as 0.2 FTOKEN").to.be.eq(
        ethers.utils.parseEther("0.2")
      );
    });

    it("should compare slippage by taking convertingPostionValue - debt (fee 25)", async () => {
      // set lp pair fee
      await factory.setPairFees(lp.address, 25);
      // Bob transfer LP to strategy first
      const bobBTokenBefore = await baseToken.balanceOf(bobAddress);
      await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));

      // Bob's position: 0.316227766016837933 LP
      // Debt: 1 BTOKEN
      // lpToLiquidate: Math.min(888, 0.316227766016837933) = 0.316227766016837933 LP (0.1 FTOKEN + 1 FTOKEN)
      // maxDebtRepayment: Math.min(888, 1) = 1 BTOKEN
      // The following conditions are expected:
      // - LPs in Strategy contract must be 0
      // - Worker should have 0 LP left as all LP is liquidated
      // - Bob should have:
      // bobBtokenBefore + 1 BTOKEN + [((0.1*9975)*1)/(0.1*10000+(0.1*9975))] = 0.499374217772215269 BTOKEN] (from swap 0.1 FTOKEN to BTOKEN) in his account
      // - BTOKEN in reserve should be 1-0.499374217772215269 = 0.500625782227784731 BTOKEN
      // - FTOKEN in reserve should be 0.1+0.1 = 0.2 FTOKEN
      // - minBaseToken <= 1.499374217772215269 - 1 (debt) = 0.499374217772215269 BTOKEN must pass slippage check

      // Expect to be reverted if slippage is set at 0.499374217772215270 BTOKEN
      await expect(
        mockMdexWorkerAsBob.work(
          0,
          bobAddress,
          ethers.utils.parseEther("1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [
                  ethers.utils.parseEther("8888"),
                  ethers.utils.parseEther("8888"),
                  ethers.utils.parseEther("0.499374217772215270"),
                ]
              ),
            ]
          )
        )
      ).to.be.revertedWith("MdexRestrictedStrategyPartialCloseLiquidate::execute:: insufficient baseToken received");

      await expect(
        mockMdexWorkerAsBob.work(
          0,
          bobAddress,
          ethers.utils.parseEther("1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [
                  ethers.utils.parseEther("8888"),
                  ethers.utils.parseEther("8888"),
                  ethers.utils.parseEther("0.499374217772215269"),
                ]
              ),
            ]
          )
        )
      )
        .to.emit(strat, "MdexRestrictedStrategyPartialCloseLiquidateEvent")
        .withArgs(
          baseToken.address,
          farmingToken.address,
          ethers.utils.parseEther("0.316227766016837933"),
          ethers.utils.parseEther("1")
        );

      expect(await lp.balanceOf(strat.address), "Strategy should has 0 LP").to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(mockMdexWorker.address), "Worker should has 0 LP as all LP is liquidated").to.be.eq(
        "0"
      );
      expect(
        await baseToken.balanceOf(bobAddress),
        "Bob's BTOKEN should increase by 1.499374217772215269 BTOKEN"
      ).to.be.eq(
        bobBTokenBefore.add(ethers.utils.parseEther("1")).add(ethers.utils.parseEther("0.499374217772215269"))
      );
      expect(await baseToken.balanceOf(lp.address), "FTOKEN-BTOKEN LP should has 0.500625782227784731 BTOKEN").to.be.eq(
        ethers.utils.parseEther("0.500625782227784731")
      );
      expect(await farmingToken.balanceOf(lp.address), "FTOKEN-BTOKEN LP should as 0.2 FTOKEN").to.be.eq(
        ethers.utils.parseEther("0.2")
      );
    });
  });

  context("when maxDebtRepayment < debt", async () => {
    it("should compare slippage by taking convertingPostionValue - maxDebtRepayment (fee 20)", async () => {
      // set lp pair fee
      await factory.setPairFees(lp.address, 20);
      // Bob transfer LP to strategy first
      const bobBTokenBefore = await baseToken.balanceOf(bobAddress);
      await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));

      // Bob's position: 0.316227766016837933 LP
      // Debt: 1 BTOKEN
      // lpToLiquidate: Math.min(888, 0.316227766016837933) = 0.316227766016837933 LP (0.1 FTOKEN + 1 FTOKEN)
      // maxDebtRepayment: Math.min(888, 0.1) = 0.1 BTOKEN
      // The following conditions are expected:
      // - LPs in Strategy contract must be 0
      // - Worker should have 0 LP left as all LP is liquidated
      // - Bob should have:
      // bobBtokenBefore + 1 BTOKEN + [((0.1*998)*1)/(0.1*10000+(0.1*998))] = 0.499499499499499499 BTOKEN] (from swap 0.1 FTOKEN to BTOKEN) in his account
      // - BTOKEN in reserve should be 1-0.499499499499499499 = 0.500500500500500501 BTOKEN
      // - FTOKEN in reserve should be 0.1+0.1 = 0.2 FTOKEN
      // - minBaseToken <= 1.499499499499499499 - 0.1 (debt) = 1.399499499499499499 BTOKEN must pass slippage check

      // Expect to be reverted if slippage is set at 1.399499499499499499 + 1 wei BTOKEN
      await expect(
        mockMdexWorkerAsBob.work(
          0,
          bobAddress,
          ethers.utils.parseEther("1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [
                  ethers.utils.parseEther("8888"),
                  ethers.utils.parseEther("0.1"),
                  ethers.utils.parseEther("1.399499499499499499").add(1),
                ]
              ),
            ]
          )
        )
      ).to.be.revertedWith("MdexRestrictedStrategyPartialCloseLiquidate::execute:: insufficient baseToken received");

      await expect(
        mockMdexWorkerAsBob.work(
          0,
          bobAddress,
          ethers.utils.parseEther("1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [
                  ethers.utils.parseEther("8888"),
                  ethers.utils.parseEther("0.1"),
                  ethers.utils.parseEther("1.399499499499499499"),
                ]
              ),
            ]
          )
        )
      )
        .to.emit(strat, "MdexRestrictedStrategyPartialCloseLiquidateEvent")
        .withArgs(
          baseToken.address,
          farmingToken.address,
          ethers.utils.parseEther("0.316227766016837933"),
          ethers.utils.parseEther("0.1")
        );

      expect(await lp.balanceOf(strat.address), "Strategy should has 0 LP").to.be.eq(ethers.utils.parseEther("0"));
      expect(
        await lp.balanceOf(mockMdexWorkerAsBob.address),
        "Worker should has 0 LP as all LP is liquidated"
      ).to.be.eq("0");
      expect(
        await baseToken.balanceOf(bobAddress),
        "Bob's BTOKEN should increase by 1.499499499499499499 BTOKEN"
      ).to.be.eq(
        bobBTokenBefore.add(ethers.utils.parseEther("1")).add(ethers.utils.parseEther("0.499499499499499499"))
      );
      expect(await baseToken.balanceOf(lp.address), "FTOKEN-BTOKEN LP should has 0.500500500500500501 BTOKEN").to.be.eq(
        ethers.utils.parseEther("0.500500500500500501")
      );
      expect(await farmingToken.balanceOf(lp.address), "FTOKEN-BTOKEN LP should as 0.2 FTOKEN").to.be.eq(
        ethers.utils.parseEther("0.2")
      );
    });
    it("should compare slippage by taking convertingPostionValue - maxDebtRepayment (fee 25)", async () => {
      // set lp pair fee
      await factory.setPairFees(lp.address, 25);
      // Bob transfer LP to strategy first
      const bobBTokenBefore = await baseToken.balanceOf(bobAddress);
      await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));

      // Bob's position: 0.316227766016837933 LP
      // Debt: 1 BTOKEN
      // lpToLiquidate: Math.min(888, 0.316227766016837933) = 0.316227766016837933 LP (0.1 FTOKEN + 1 FTOKEN)
      // maxDebtRepayment: 0.1 BTOKEN
      // The following conditions are expected
      // - LPs in Strategy contract must be 0
      // - Worker should have 0 LP left as all LP is liquidated
      // - Bob should have:
      // bobBtokenBefore + 1 BTOKEN + [((0.1*9975)*1)/(0.1*10000+(0.1*9975))] = 0.499374217772215269 BTOKEN] (from swap 0.1 FTOKEN to BTOKEN) in his account
      // - BTOKEN in reserve should be 1-0.499374217772215269 = 0.500625782227784731 BTOKEN
      // - FTOKEN in reserve should be 0.1+0.1 = 0.2 FTOKEN
      // - minBaseToken <= 1.399374217772215269 BTOKEN should pass slippage check

      // Expect to be reverted if slippage is set at 1.399374217772215270 BTOKEN
      await expect(
        mockMdexWorkerAsBob.work(
          0,
          bobAddress,
          ethers.utils.parseEther("1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [
                  ethers.utils.parseEther("8888"),
                  ethers.utils.parseEther("0.1"),
                  ethers.utils.parseEther("1.399374217772215270"),
                ]
              ),
            ]
          )
        )
      ).to.be.revertedWith("MdexRestrictedStrategyPartialCloseLiquidate::execute:: insufficient baseToken received");

      await expect(
        mockMdexWorkerAsBob.work(
          0,
          bobAddress,
          ethers.utils.parseEther("1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [
                  ethers.utils.parseEther("8888"),
                  ethers.utils.parseEther("0.1"),
                  ethers.utils.parseEther("1.399374217772215269"),
                ]
              ),
            ]
          )
        )
      )
        .to.emit(strat, "MdexRestrictedStrategyPartialCloseLiquidateEvent")
        .withArgs(
          baseToken.address,
          farmingToken.address,
          ethers.utils.parseEther("0.316227766016837933"),
          ethers.utils.parseEther("0.1")
        );

      expect(await lp.balanceOf(strat.address), "Strategy should has 0 LP").to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(mockMdexWorker.address), "Worker should has 0 LP as all LP is liquidated").to.be.eq(
        "0"
      );
      expect(
        await baseToken.balanceOf(bobAddress),
        "Bob's BTOKEN should increase by 1.499374217772215269 BTOKEN"
      ).to.be.eq(
        bobBTokenBefore.add(ethers.utils.parseEther("1")).add(ethers.utils.parseEther("0.499374217772215269"))
      );
      expect(await baseToken.balanceOf(lp.address), "FTOKEN-BTOKEN LP should has 0.500625782227784731 BTOKEN").to.be.eq(
        ethers.utils.parseEther("0.500625782227784731")
      );
      expect(await farmingToken.balanceOf(lp.address), "FTOKEN-BTOKEN LP should as 0.2 FTOKEN").to.be.eq(
        ethers.utils.parseEther("0.2")
      );
    });
  });

  describe("#withdrawTradingRewards", async () => {
    context("When the withdrawTradingRewards caller is not an owner", async () => {
      it("should be reverted", async () => {
        await expect(stratAsBob.withdrawTradingRewards(bobAddress)).to.reverted;
      });
    });

    context("When withdrawTradingRewards caller is the owner", async () => {
      it("should be able to withdraw trading rewards", async () => {
        // set lp pair fee
        await factory.setPairFees(lp.address, 25);
        // Bob transfer LP to strategy first
        const bobLpBefore = await lp.balanceOf(bobAddress);

        await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));

        // Bob uses partial close liquidate strategy to turn the 50% LPs back to BTOKEN with the same minimum value and the same maxReturn
        const returnLp = bobLpBefore.div(2);
        await mockMdexWorkerAsBob.work(
          0,
          bobAddress,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [returnLp, ethers.utils.parseEther("0"), ethers.utils.parseEther("0.5")]
              ),
            ]
          )
        );

        const mdxBefore = await mdxToken.balanceOf(deployerAddress);
        // withdraw trading reward to deployer
        const withDrawTx = await strat.withdrawTradingRewards(deployerAddress);
        const mdxAfter = await mdxToken.balanceOf(deployerAddress);
        // get trading reward of the previos block
        const pIds = [0];
        const totalRewardPrev = await strat.getMiningRewards(pIds, { blockTag: Number(withDrawTx.blockNumber) - 1 });
        const withDrawBlockReward = await swapMining["reward()"]({ blockTag: withDrawTx.blockNumber });
        const totalReward = totalRewardPrev.add(withDrawBlockReward);
        expect(mdxAfter.sub(mdxBefore)).to.eq(totalReward);
      });
    });
  });
});
