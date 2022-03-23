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
  PancakeRouter,
  PancakeRouterV2__factory,
  PancakeRouter__factory,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory,
  WETH,
  WETH__factory,
} from "../../../../../typechain";
import { MockPancakeswapV2Worker__factory } from "../../../../../typechain/factories/MockPancakeswapV2Worker__factory";
import { MockPancakeswapV2Worker } from "../../../../../typechain/MockPancakeswapV2Worker";

chai.use(solidity);
const { expect } = chai;

describe("Pancakeswapv2RestrictedStrategyAddBaseTokenOnly", () => {
  const FOREVER = "2000000000";
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther("0.076");

  /// Pancakeswap-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouter;
  let lpV2: PancakePair;

  /// MockPancakeswapV2Worker-related instance(s)
  let mockPancakeswapV2Worker: MockPancakeswapV2Worker;
  let mockPancakeswapV2EvilWorker: MockPancakeswapV2Worker;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let strat: PancakeswapV2RestrictedStrategyAddBaseTokenOnly;

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

  let routerV2AsAlice: PancakeRouter;
  let routerV2AsBob: PancakeRouter;

  let stratAsAlice: PancakeswapV2RestrictedStrategyAddBaseTokenOnly;
  let stratAsBob: PancakeswapV2RestrictedStrategyAddBaseTokenOnly;

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

    const PancakeswapV2RestrictedStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyAddBaseTokenOnly",
      deployer
    )) as PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory;
    strat = (await upgrades.deployProxy(PancakeswapV2RestrictedStrategyAddBaseTokenOnly, [
      routerV2.address,
    ])) as PancakeswapV2RestrictedStrategyAddBaseTokenOnly;
    await strat.deployed();
    await strat.setWorkersOk([mockPancakeswapV2Worker.address], true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerV2AsAlice = PancakeRouter__factory.connect(routerV2.address, alice);
    routerV2AsBob = PancakeRouter__factory.connect(routerV2.address, bob);

    lpAsAlice = PancakePair__factory.connect(lpV2.address, alice);
    lpAsBob = PancakePair__factory.connect(lpV2.address, bob);

    stratAsAlice = PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory.connect(strat.address, alice);
    stratAsBob = PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory.connect(strat.address, bob);

    mockPancakeswapV2WorkerAsBob = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker.address, bob);
    mockPancakeswapV2EvilWorkerAsBob = MockPancakeswapV2Worker__factory.connect(
      mockPancakeswapV2EvilWorker.address,
      bob
    );

    // Adding liquidity to the pool
    // Alice adds 0.1 FTOKEN + 1 WBTC
    await farmingTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("0.1"));
    await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("1"));

    // Add liquidity to the WBTC-FTOKEN pool on Pancakeswap
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

  context("When contract get LP < minLP", async () => {
    it("should revert", async () => {
      // Bob uses AddBaseTokenOnly strategy yet again, but now with an unreasonable min LP request
      await baseTokenAsBob.transfer(mockPancakeswapV2Worker.address, ethers.utils.parseEther("0.1"));
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
      ).to.be.revertedWith(
        "PancakeswapV2RestrictedStrategyAddBaseTokenOnly::execute:: insufficient LP tokens received"
      );
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
      ).to.be.revertedWith("PancakeswapV2RestrictedStrategyAddBaseTokenOnly::onlyWhitelistedWorkers:: bad worker");
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
      ).to.be.revertedWith("PancakeswapV2RestrictedStrategyAddBaseTokenOnly::onlyWhitelistedWorkers:: bad worker");
    });
  });

  it("should convert all BTOKEN to LP tokens at best rate", async () => {
    // Bob transfer 0.1 WBTC to StrategyAddBaseTokenOnly first
    await baseTokenAsBob.transfer(mockPancakeswapV2Worker.address, ethers.utils.parseEther("0.1"));
    // Bob uses AddBaseTokenOnly strategy to add 0.1 WBTC
    await mockPancakeswapV2WorkerAsBob.work(
      0,
      await bob.getAddress(),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
      )
    );

    expect(await lpV2.balanceOf(mockPancakeswapV2Worker.address)).to.be.eq(
      ethers.utils.parseEther("0.015415396042372718")
    );
    expect(await lpV2.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));

    // Bob uses AddBaseTokenOnly strategy to add another 0.1 WBTC
    await baseTokenAsBob.transfer(mockPancakeswapV2Worker.address, ethers.utils.parseEther("0.1"));
    await mockPancakeswapV2WorkerAsBob.work(
      0,
      await bob.getAddress(),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
      )
    );

    expect(await lpV2.balanceOf(mockPancakeswapV2Worker.address)).to.be.eq(
      ethers.utils.parseEther("0.030143763464109982")
    );
    expect(await lpV2.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
  });
});
