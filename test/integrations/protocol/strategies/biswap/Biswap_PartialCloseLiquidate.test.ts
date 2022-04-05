import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  BiswapFactory,
  BiswapFactory__factory,
  BiswapPair,
  BiswapPair__factory,
  BiswapRouter02,
  BiswapRouter02__factory,
  WETH,
  WETH__factory,
  MockWaultSwapWorker,
  MockWaultSwapWorker__factory,
  BiswapStrategyPartialCloseLiquidate__factory,
  BiswapStrategyPartialCloseLiquidate,
} from "../../../../../typechain";
import { assertAlmostEqual } from "../../../../helpers/assert";

chai.use(solidity);
const { expect } = chai;

describe("BiswapStrategyPartialCloseLiquidate", () => {
  const FOREVER = "2000000000";

  /// DEX-related instance(s)
  /// note: Use WaultSwap here because they have the same fee-structure
  let factory: BiswapFactory;
  let router: BiswapRouter02;
  let lp: BiswapPair;

  /// MockWaultSwapWorker-related instance(s)
  let mockWorker: MockWaultSwapWorker;
  let mockEvilWorker: MockWaultSwapWorker;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let strat: BiswapStrategyPartialCloseLiquidate;

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

  let lpAsAlice: BiswapPair;
  let lpAsBob: BiswapPair;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerAsAlice: BiswapRouter02;
  let routerAsBob: BiswapRouter02;

  let stratAsAlice: BiswapStrategyPartialCloseLiquidate;
  let stratAsBob: BiswapStrategyPartialCloseLiquidate;

  let mockWorkerAsBob: MockWaultSwapWorker;
  let mockEvilWorkerAsBob: MockWaultSwapWorker;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();
    [deployerAddress, aliceAddress, bobAddress] = await Promise.all([
      deployer.getAddress(),
      alice.getAddress(),
      bob.getAddress(),
    ]);

    // Setup DEX
    const BiswapFactory = (await ethers.getContractFactory(
      "BiswapFactory",
      deployer
    )) as BiswapFactory__factory;
    factory = await BiswapFactory.deploy(deployerAddress);
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();
    await factory.deployed();

    const BiswapRouter02 = (await ethers.getContractFactory("BiswapRouter02", deployer)) as BiswapRouter02__factory;
    router = await BiswapRouter02.deploy(factory.address, wbnb.address);
    await router.deployed();

    /// Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    baseToken = (await upgrades.deployProxy(MockERC20, ["BTOKEN", "BTOKEN", 18])) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(aliceAddress, ethers.utils.parseEther("100"));
    await baseToken.mint(bobAddress, ethers.utils.parseEther("100"));
    farmingToken = (await upgrades.deployProxy(MockERC20, ["FTOKEN", "FTOKEN", 18])) as MockERC20;
    await farmingToken.deployed();
    await farmingToken.mint(aliceAddress, ethers.utils.parseEther("10"));
    await farmingToken.mint(bobAddress, ethers.utils.parseEther("10"));

    await factory.createPair(baseToken.address, farmingToken.address);

    lp = BiswapPair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);
    // Set swap fee to 0.2 % for ease of test
    factory.setSwapFee(lp.address, 2);

    /// Setup MockWaultSwapWorker
    const MockWaultSwapWorker = (await ethers.getContractFactory(
      "MockWaultSwapWorker",
      deployer
    )) as MockWaultSwapWorker__factory;
    mockWorker = (await MockWaultSwapWorker.deploy(
      lp.address,
      baseToken.address,
      farmingToken.address
    )) as MockWaultSwapWorker;
    await mockWorker.deployed();
    mockEvilWorker = (await MockWaultSwapWorker.deploy(
      lp.address,
      baseToken.address,
      farmingToken.address
    )) as MockWaultSwapWorker;
    await mockEvilWorker.deployed();

    const BiswapStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "BiswapStrategyPartialCloseLiquidate",
      deployer
    )) as BiswapStrategyPartialCloseLiquidate__factory;
    strat = (await upgrades.deployProxy(BiswapStrategyPartialCloseLiquidate, [
      router.address,
    ])) as BiswapStrategyPartialCloseLiquidate;
    await strat.deployed();
    await strat.setWorkersOk([mockWorker.address], true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerAsAlice = BiswapRouter02__factory.connect(router.address, alice);
    routerAsBob = BiswapRouter02__factory.connect(router.address, bob);

    lpAsAlice = BiswapPair__factory.connect(lp.address, alice);
    lpAsBob = BiswapPair__factory.connect(lp.address, bob);

    stratAsAlice = BiswapStrategyPartialCloseLiquidate__factory.connect(strat.address, alice);
    stratAsBob = BiswapStrategyPartialCloseLiquidate__factory.connect(strat.address, bob);

    mockWorkerAsBob = MockWaultSwapWorker__factory.connect(mockWorker.address, bob);
    mockEvilWorkerAsBob = MockWaultSwapWorker__factory.connect(mockEvilWorker.address, bob);

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
      await expect(stratAsBob.setWorkersOk([mockEvilWorkerAsBob.address], true)).to.reverted;
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
      await baseTokenAsBob.transfer(mockEvilWorkerAsBob.address, ethers.utils.parseEther("0.05"));
      await expect(
        mockEvilWorkerAsBob.work(
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
      ).to.be.revertedWith("bad worker");
    });
  });

  context("when revoking whitelist workers", async () => {
    it("should revert as bad worker", async () => {
      await strat.setWorkersOk([mockWorker.address], false);
      await expect(
        mockWorkerAsBob.work(
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
      ).to.be.revertedWith("bad worker");
    });
  });

  context("when maxLpToLiquidate >= LPs from worker", async () => {
    it("should use all LP", async () => {
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
        mockWorkerAsBob.work(
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
        .to.emit(strat, "LogBiswapStrategyPartialCloseLiquidate")
        .withArgs(baseToken.address, farmingToken.address, ethers.utils.parseEther("0.316227766016837933"), "0");

      expect(await lp.balanceOf(strat.address), "Strategy should has 0 LP").to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(mockWorkerAsBob.address), "Worker should has 0 LP as all LP is liquidated").to.be.eq(
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
  });

  context("when maxLpToLiquidate < LPs from worker", async () => {
    it("should liquidate portion LPs back to BTOKEN", async () => {
      // Bob transfer LP to strategy first
      const bobLpBefore = await lp.balanceOf(bobAddress);
      const bobBTokenBefore = await baseToken.balanceOf(bobAddress);
      await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));

      // Bob uses partial close liquidate strategy to turn the 50% LPs back to BTOKEN with the same minimum value and the same maxReturn
      const returnLp = bobLpBefore.div(2);
      await expect(
        mockWorkerAsBob.work(
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
        .to.emit(strat, "LogBiswapStrategyPartialCloseLiquidate")
        .withArgs(baseToken.address, farmingToken.address, returnLp, "0");

      // After execute strategy successfully. The following conditions must be satisfied
      // - LPs in Strategy contract must be 0
      // - Bob should have bobLpBefore - returnLp left in his account
      // - Bob should have bobBtokenBefore + 0.5 BTOKEN + [((0.05*998)*1.5)/(0.15*1000+(0.05*998))] = 0.374437218609304652 BTOKEN] (from swap 0.05 FTOKEN to BTOKEN) in his account
      // - BTOKEN in reserve should be 1.5-0.374437218609304652 = 1.125562781390695348 BTOKEN
      // - FTOKEN in reserve should be 0.15+0.05 = 0.2 FTOKEN
      expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(mockWorker.address)).to.be.eq(bobLpBefore.sub(returnLp));
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
  });

  context("when maxDebtRepayment >= debt", async () => {
    it("should compare slippage by taking convertingPostionValue - debt", async () => {
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
        mockWorkerAsBob.work(
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
      ).to.be.revertedWith("insufficient baseToken received");

      await expect(
        mockWorkerAsBob.work(
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
        .to.emit(strat, "LogBiswapStrategyPartialCloseLiquidate")
        .withArgs(
          baseToken.address,
          farmingToken.address,
          ethers.utils.parseEther("0.316227766016837933"),
          ethers.utils.parseEther("1")
        );

      expect(await lp.balanceOf(strat.address), "Strategy should has 0 LP").to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(mockWorker.address), "Worker should has 0 LP as all LP is liquidated").to.be.eq("0");
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
  });

  context("when maxDebtRepayment < debt", async () => {
    it("should compare slippage by taking convertingPostionValue - maxDebtRepayment", async () => {
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
        mockWorkerAsBob.work(
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
      ).to.be.revertedWith("insufficient baseToken received");

      await expect(
        mockWorkerAsBob.work(
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
        .to.emit(strat, "LogBiswapStrategyPartialCloseLiquidate")
        .withArgs(
          baseToken.address,
          farmingToken.address,
          ethers.utils.parseEther("0.316227766016837933"),
          ethers.utils.parseEther("0.1")
        );

      expect(await lp.balanceOf(strat.address), "Strategy should has 0 LP").to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(mockWorker.address), "Worker should has 0 LP as all LP is liquidated").to.be.eq("0");
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
  });
});
