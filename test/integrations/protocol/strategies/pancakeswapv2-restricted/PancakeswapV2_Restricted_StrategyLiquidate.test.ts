import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  PancakeFactory,
  PancakeFactory__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouterV2__factory,
  PancakeRouterV2,
  PancakeswapV2RestrictedStrategyLiquidate,
  PancakeswapV2RestrictedStrategyLiquidate__factory,
  WETH,
  WETH__factory,
} from "../../../../../typechain";
import { MockPancakeswapV2Worker__factory } from "../../../../../typechain/factories/MockPancakeswapV2Worker__factory";
import { MockPancakeswapV2Worker } from "../../../../../typechain/MockPancakeswapV2Worker";

chai.use(solidity);
const { expect } = chai;

describe("PancakeswapV2RestrictedStrategyLiquidate", () => {
  const FOREVER = "2000000000";
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther("0.076");

  /// Pancakeswap-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouterV2;
  let lpV2: PancakePair;

  /// MockPancakeswapV2Worker-related instance(s)
  let mockPancakeswapV2Worker: MockPancakeswapV2Worker;
  let mockPancakeswapV2EvilWorker: MockPancakeswapV2Worker;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let strat: PancakeswapV2RestrictedStrategyLiquidate;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let lpAsAlice: PancakePair;
  let lpAsBob: PancakePair;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerV2AsAlice: PancakeRouterV2;
  let routerV2AsBob: PancakeRouterV2;

  let stratAsAlice: PancakeswapV2RestrictedStrategyLiquidate;
  let stratAsBob: PancakeswapV2RestrictedStrategyLiquidate;

  let mockPancakeswapV2WorkerAsBob: MockPancakeswapV2Worker;
  let mockPancakeswapV2EvilWorkerAsBob: MockPancakeswapV2Worker;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();

    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
    factoryV2 = await PancakeFactory.deploy(await deployer.getAddress());
    await factoryV2.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();
    await factoryV2.deployed();

    const PancakeRouterV2 = (await ethers.getContractFactory("PancakeRouterV2", deployer)) as PancakeRouterV2__factory;
    routerV2 = await PancakeRouterV2.deploy(factoryV2.address, wbnb.address);
    await routerV2.deployed();

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

    await factoryV2.createPair(baseToken.address, farmingToken.address);

    lpV2 = PancakePair__factory.connect(await factoryV2.getPair(farmingToken.address, baseToken.address), deployer);

    /// Setup MockPancakeswapV2Worker
    const MockPancakeswapV2Worker = (await ethers.getContractFactory(
      "MockPancakeswapV2Worker",
      deployer
    )) as MockPancakeswapV2Worker__factory;
    mockPancakeswapV2Worker = (await MockPancakeswapV2Worker.deploy(
      lpV2.address,
      baseToken.address,
      farmingToken.address
    )) as MockPancakeswapV2Worker;
    await mockPancakeswapV2Worker.deployed();
    mockPancakeswapV2EvilWorker = (await MockPancakeswapV2Worker.deploy(
      lpV2.address,
      baseToken.address,
      farmingToken.address
    )) as MockPancakeswapV2Worker;
    await mockPancakeswapV2EvilWorker.deployed();

    const PancakeswapV2RestrictedStrategyLiquidate = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyLiquidate",
      deployer
    )) as PancakeswapV2RestrictedStrategyLiquidate__factory;
    strat = (await upgrades.deployProxy(PancakeswapV2RestrictedStrategyLiquidate, [
      routerV2.address,
    ])) as PancakeswapV2RestrictedStrategyLiquidate;
    await strat.deployed();
    await strat.setWorkersOk([mockPancakeswapV2Worker.address], true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerV2AsAlice = PancakeRouterV2__factory.connect(routerV2.address, alice);
    routerV2AsBob = PancakeRouterV2__factory.connect(routerV2.address, bob);

    lpAsAlice = PancakePair__factory.connect(lpV2.address, alice);
    lpAsBob = PancakePair__factory.connect(lpV2.address, bob);

    stratAsAlice = PancakeswapV2RestrictedStrategyLiquidate__factory.connect(strat.address, alice);
    stratAsBob = PancakeswapV2RestrictedStrategyLiquidate__factory.connect(strat.address, bob);

    mockPancakeswapV2WorkerAsBob = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker.address, bob);
    mockPancakeswapV2EvilWorkerAsBob = MockPancakeswapV2Worker__factory.connect(
      mockPancakeswapV2EvilWorker.address,
      bob
    );
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("When bad calldata", async () => {
    it("should revert", async () => {
      // Bob passes some bad calldata that can't be decoded
      await expect(stratAsBob.execute(await bob.getAddress(), "0", "0x1234")).to.be.reverted;
    });
  });

  context("When the setOkWorkers caller is not an owner", async () => {
    it("should be reverted", async () => {
      await expect(stratAsBob.setWorkersOk([mockPancakeswapV2EvilWorkerAsBob.address], true)).to.reverted;
    });
  });

  context("When non-worker call the strat", async () => {
    it("should revert", async () => {
      await expect(
        stratAsBob.execute(await bob.getAddress(), "0", ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"]))
      ).to.be.reverted;
    });
  });

  context("When caller worker hasn't been whitelisted", async () => {
    it("should revert as bad worker", async () => {
      await baseTokenAsBob.transfer(mockPancakeswapV2EvilWorkerAsBob.address, ethers.utils.parseEther("0.05"));
      await expect(
        mockPancakeswapV2EvilWorkerAsBob.work(
          0,
          await bob.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
          )
        )
      ).to.be.revertedWith("PancakeswapV2RestrictedStrategyLiquidate::onlyWhitelistedWorkers:: bad worker");
    });
  });

  context("when revoking whitelist workers", async () => {
    it("should revert as bad worker", async () => {
      await strat.setWorkersOk([mockPancakeswapV2Worker.address], false);
      await expect(
        mockPancakeswapV2WorkerAsBob.work(
          0,
          await bob.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
          )
        )
      ).to.be.revertedWith("PancakeswapV2RestrictedStrategyLiquidate::onlyWhitelistedWorkers:: bad worker");
    });
  });

  it("should convert all LP tokens back to baseToken", async () => {
    // Alice adds 0.1 FTOKEN + 1 BTOKEN
    await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("1"));
    await farmingTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("0.1"));
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
    await baseTokenAsBob.approve(routerV2.address, ethers.utils.parseEther("1"));
    await farmingTokenAsBob.approve(routerV2.address, ethers.utils.parseEther("1"));
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
    expect(await lpV2.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0.316227766016837933"));

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
      mockPancakeswapV2WorkerAsBob.work(
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

    const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());

    await mockPancakeswapV2WorkerAsBob.work(
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

    const bobBtokenAfter = await baseToken.balanceOf(await bob.getAddress());

    expect(
      bobBtokenAfter.sub(bobBtokenBefore),
      "Bob's balance should increase by 1.499374217772215269 BTOKEN"
    ).to.be.eq(ethers.utils.parseEther("1").add(ethers.utils.parseEther("0.499374217772215269")));
    expect(await lpV2.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await lpV2.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
    expect(await baseToken.balanceOf(lpV2.address)).to.be.eq(ethers.utils.parseEther("0.500625782227784731"));
    expect(await farmingToken.balanceOf(lpV2.address)).to.be.eq(ethers.utils.parseEther("0.2"));
  });
});
