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
  BiswapStrategyLiquidate,
  BiswapStrategyLiquidate__factory,
  WETH,
  WETH__factory,
  MockWaultSwapWorker,
  MockWaultSwapWorker__factory,
} from "../../../../../typechain";
import { assertAlmostEqual } from "../../../../helpers/assert";

chai.use(solidity);
const { expect } = chai;

describe("BiswapStrategyLiquidate", () => {
  const FOREVER = "2000000000";

  /// DEX-related instance(s)
  /// note: Use WaultSwap here because they have the same fee-structure
  let factory: BiswapFactory;
  let router: BiswapRouter02;
  let lp: BiswapPair;

  /// MockWaultSwapV2Worker-related instance(s)
  let mockWorker: MockWaultSwapWorker;
  let mockEvilWorker: MockWaultSwapWorker;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let liqStrat: BiswapStrategyLiquidate;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let lpAsAlice: BiswapPair;
  let lpAsBob: BiswapPair;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerV2AsAlice: BiswapRouter02;
  let routerV2AsBob: BiswapRouter02;

  let liqStratAsAlice: BiswapStrategyLiquidate;
  let liqStratAsBob: BiswapStrategyLiquidate;

  let mockWorkerAsBob: MockWaultSwapWorker;
  let mockWorkerEvilAsBob: MockWaultSwapWorker;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();

    // Setup WaultSwap
    const BiswapFactory = (await ethers.getContractFactory(
      "BiswapFactory",
      deployer
    )) as BiswapFactory__factory;
    factory = await BiswapFactory.deploy(await deployer.getAddress());
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
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
    farmingToken = (await upgrades.deployProxy(MockERC20, ["FTOKEN", "FTOKEN", 18])) as MockERC20;
    await farmingToken.deployed();
    await farmingToken.mint(await alice.getAddress(), ethers.utils.parseEther("10"));
    await farmingToken.mint(await bob.getAddress(), ethers.utils.parseEther("10"));

    await factory.createPair(baseToken.address, farmingToken.address);

    lp = BiswapPair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);

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

    const BiswapStrategyLiquidate = (await ethers.getContractFactory(
      "BiswapStrategyLiquidate",
      deployer
    )) as BiswapStrategyLiquidate__factory;
    liqStrat = (await upgrades.deployProxy(BiswapStrategyLiquidate, [
      router.address,
    ])) as BiswapStrategyLiquidate;
    await liqStrat.deployed();
    await liqStrat.setWorkersOk([mockWorker.address], true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerV2AsAlice = BiswapRouter02__factory.connect(router.address, alice);
    routerV2AsBob = BiswapRouter02__factory.connect(router.address, bob);

    lpAsAlice = BiswapPair__factory.connect(lp.address, alice);
    lpAsBob = BiswapPair__factory.connect(lp.address, bob);

    liqStratAsAlice = BiswapStrategyLiquidate__factory.connect(liqStrat.address, alice);
    liqStratAsBob = BiswapStrategyLiquidate__factory.connect(liqStrat.address, bob);

    mockWorkerAsBob = MockWaultSwapWorker__factory.connect(mockWorker.address, bob);
    mockWorkerEvilAsBob = MockWaultSwapWorker__factory.connect(mockEvilWorker.address, bob);

    // Set fee to 0.2 percent for ease of testing
    factory.setSwapFee(lp.address, 2);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("When bad calldata", async () => {
    it("should revert", async () => {
      // Bob passes some bad calldata that can't be decoded
      await expect(liqStratAsBob.execute(await bob.getAddress(), "0", "0x1234")).to.be.reverted;
    });
  });

  context("When the setOkWorkers caller is not an owner", async () => {
    it("should be reverted", async () => {
      await expect(liqStratAsBob.setWorkersOk([mockWorkerEvilAsBob.address], true)).to.reverted;
    });
  });

  context("When non-worker call the liqStrat", async () => {
    it("should revert", async () => {
      await expect(
        liqStratAsBob.execute(await bob.getAddress(), "0", ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"]))
      ).to.be.reverted;
    });
  });

  context("When caller worker hasn't been whitelisted", async () => {
    it("should revert as bad worker", async () => {
      await baseTokenAsBob.transfer(mockWorkerEvilAsBob.address, ethers.utils.parseEther("0.05"));
      await expect(
        mockWorkerEvilAsBob.work(
          0,
          await bob.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
          )
        )
      ).to.be.revertedWith("bad worker");
    });
  });

  context("when revoking whitelist workers", async () => {
    it("should revert as bad worker", async () => {
      await liqStrat.setWorkersOk([mockWorker.address], false);
      await expect(
        mockWorkerAsBob.work(
          0,
          await bob.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [liqStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
          )
        )
      ).to.be.revertedWith("bad worker");
    });
  });

  it("should convert all LP tokens back to baseToken", async () => {
    // Alice adds 0.1 FTOKEN + 1 BTOKEN
    await baseTokenAsAlice.approve(router.address, ethers.utils.parseEther("1"));
    await farmingTokenAsAlice.approve(router.address, ethers.utils.parseEther("0.1"));
    await routerV2AsAlice.addLiquidity(
      baseToken.address,
      farmingToken.address,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("0.1"),
      "0",
      "0",
      await alice.getAddress(),
      FOREVER
    );

    // Bob tries to add 1 FTOKEN + 1 BTOKEN (but obviously can only add 0.1 FTOKEN)
    await baseTokenAsBob.approve(router.address, ethers.utils.parseEther("1"));
    await farmingTokenAsBob.approve(router.address, ethers.utils.parseEther("1"));
    await routerV2AsBob.addLiquidity(
      baseToken.address,
      farmingToken.address,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("1"),
      "0",
      "0",
      await bob.getAddress(),
      FOREVER
    );

    expect(await baseToken.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("99"));
    expect(await farmingToken.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("9.9"));
    expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0.316227766016837933"));

    expect(await baseToken.balanceOf(lp.address)).to.be.eq(ethers.utils.parseEther("2"));
    expect(await farmingToken.balanceOf(lp.address)).to.be.eq(ethers.utils.parseEther("0.2"));

    // Bob's position: 0.316227766016837933 LP
    // lpToLiquidate: Math.min(888, 0.316227766016837933) = 0.316227766016837933 LP (0.1 FTOKEN + 1 FTOKEN)
    // After execute strategy. The following conditions must be satisfied
    // - LPs in Strategy contract must be 0
    // - Worker should have 0 LP left as all LP is liquidated
    // - Bob should have:
    // bobBtokenBefore + 1 BTOKEN + [((0.1*998)*1)/(0.1*1000+(0.1*998))] = 0.499499499499499499 BTOKEN] (from swap 0.1 FTOKEN to BTOKEN) in his account
    // - BTOKEN in reserve should be 1-0.499499499499499499 = 0.500500500500500501 BTOKEN
    // - FTOKEN in reserve should be 0.1+0.1 = 0.2 FTOKEN
    // - minBaseToken >= 1.499499499499499499 - 1 = 0.499499499499499499 should pass slippage check

    // Bob uses liquidate strategy to turn all LPs back to BTOKEN but with an unreasonable expectation
    await lpAsBob.transfer(liqStrat.address, ethers.utils.parseEther("0.316227766016837933"));
    await expect(
      mockWorkerAsBob.work(
        0,
        await bob.getAddress(),
        ethers.utils.parseEther("1"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [
            liqStrat.address,
            ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.499499499499499499").add(1)]),
          ]
        )
      )
    ).to.be.revertedWith("insufficient baseToken received");

    // Bob uses liquidate strategy to turn all LPs back to BTOKEN with a same minimum value
    await mockWorkerAsBob.work(
      0,
      await bob.getAddress(),
      ethers.utils.parseEther("1"),
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [
          liqStrat.address,
          ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.499499499499499499")]),
        ]
      )
    );

    // lp removed -> got BTOKEN + FTOKEN -> convert FTOKEN to BTOKEN
    // After lp removed:
    // baseToken 1
    // baseTokenReserve 1
    // farmingToken 0.1
    // farmingTokenReserve 0.1
    //
    // receivingBToken
    // = [(farmingToken * 9980) * (baseTokenReserve)] / [((farmingTokenReserve) * 10000) + (farmingToken * 9980)]
    // = [(0.1 * 9980) * (1)] / [((0.1) * 10000) + (0.1 * 9980)]
    // = 0.499499499499499499
    //
    // Hence, after swap, lp should be as following
    // baseTokenReserve = 1 - 0.499499499499499499 = 0.500500500500500501
    // farmingTokenReserve = 0.1 + 0.1 = 2

    expect(await lp.balanceOf(liqStrat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
    expect(await baseToken.balanceOf(lp.address)).to.be.eq(ethers.utils.parseEther("0.500500500500500501"));
    expect(await farmingToken.balanceOf(lp.address)).to.be.eq(ethers.utils.parseEther("0.2"));
    assertAlmostEqual(
      ethers.utils.parseEther("100.5").toString(),
      (await baseToken.balanceOf(await bob.getAddress())).toString()
    );
  });
});
