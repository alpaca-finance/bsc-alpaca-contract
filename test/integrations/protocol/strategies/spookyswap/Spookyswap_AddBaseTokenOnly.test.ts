import { ethers, upgrades, waffle } from "hardhat";
import { Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  WaultSwapFactory,
  WaultSwapFactory__factory,
  WaultSwapPair,
  WaultSwapPair__factory,
  WaultSwapRouter,
  WaultSwapRouter__factory,
  WETH,
  WETH__factory,
  MockWaultSwapWorker,
  MockWaultSwapWorker__factory,
  SpookySwapStrategyAddBaseTokenOnly,
  SpookySwapStrategyAddBaseTokenOnly__factory,
} from "../../../../../typechain";
import { assertAlmostEqual } from "../../../../helpers/assert";

chai.use(solidity);
const { expect } = chai;

describe("SpookSwapStrategyAddBaseTokenOnly", () => {
  const FOREVER = "2000000000";

  /// DEX-related instance(s)
  /// note: Use WaultSwap here because they have the same fee-structure
  let factory: WaultSwapFactory;
  let router: WaultSwapRouter;
  let lp: WaultSwapPair;

  /// MockPancakeswapV2Worker-related instance(s)
  let mockWorker: MockWaultSwapWorker;
  let mockEvilWorker: MockWaultSwapWorker;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let strat: SpookySwapStrategyAddBaseTokenOnly;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let farmingTokenAsAlice: MockERC20;

  let routerAsAlice: WaultSwapRouter;

  let stratAsBob: SpookySwapStrategyAddBaseTokenOnly;

  let mockWorkerAsBob: MockWaultSwapWorker;
  let mockEvilWorkerAsBob: MockWaultSwapWorker;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();

    // Setup DEX
    const WaultSwapFactory = (await ethers.getContractFactory(
      "WaultSwapFactory",
      deployer
    )) as WaultSwapFactory__factory;
    factory = await WaultSwapFactory.deploy(await deployer.getAddress());
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();
    await wbnb.deployed();

    const WaultSwapRouter = (await ethers.getContractFactory("WaultSwapRouter", deployer)) as WaultSwapRouter__factory;
    router = await WaultSwapRouter.deploy(factory.address, wbnb.address);
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

    lp = WaultSwapPair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);

    /// Setup MockPancakeswapV2Worker
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

    const SpookySwapStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "SpookySwapStrategyAddBaseTokenOnly",
      deployer
    )) as SpookySwapStrategyAddBaseTokenOnly__factory;
    strat = (await upgrades.deployProxy(SpookySwapStrategyAddBaseTokenOnly, [
      router.address,
    ])) as SpookySwapStrategyAddBaseTokenOnly;
    await strat.deployed();
    await strat.setWorkersOk([mockWorker.address], true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);

    routerAsAlice = WaultSwapRouter__factory.connect(router.address, alice);

    stratAsBob = SpookySwapStrategyAddBaseTokenOnly__factory.connect(strat.address, bob);

    mockWorkerAsBob = MockWaultSwapWorker__factory.connect(mockWorker.address, bob);
    mockEvilWorkerAsBob = MockWaultSwapWorker__factory.connect(mockEvilWorker.address, bob);

    // Adding liquidity to the pool
    // Alice adds 0.1 FTOKEN + 1 BTOKEN
    await farmingTokenAsAlice.approve(router.address, ethers.utils.parseEther("0.1"));
    await baseTokenAsAlice.approve(router.address, ethers.utils.parseEther("1"));

    // // Add liquidity to the BTOKEN-FTOKEN pool on Pancakeswap
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
      await expect(stratAsBob.setWorkersOk([mockEvilWorker.address], true)).to.reverted;
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
      await baseTokenAsBob.transfer(mockWorker.address, ethers.utils.parseEther("0.1"));
      await expect(
        mockWorker.work(
          0,
          await bob.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
          )
        )
      ).to.be.revertedWith("insufficient LP tokens received");
    });
  });

  context("When caller worker hasn't been whitelisted", async () => {
    it("should revert as bad worker", async () => {
      await baseTokenAsBob.transfer(mockEvilWorkerAsBob.address, ethers.utils.parseEther("0.05"));
      await expect(
        mockEvilWorkerAsBob.work(
          0,
          await bob.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
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
          await bob.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
          )
        )
      ).to.be.revertedWith("bad worker");
    });
  });

  it("should convert all BTOKEN to LP tokens at best rate", async () => {
    // Bob transfer 0.1 BTOKEN to StrategyAddBaseTokenOnly first
    await baseTokenAsBob.transfer(mockWorker.address, ethers.utils.parseEther("0.1"));
    // Bob uses AddBaseTokenOnly strategy to add 0.1 BTOKEN
    await mockWorkerAsBob.work(
      0,
      await bob.getAddress(),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
      )
    );

    // Adding 0.1 BTOKEN
    // amountIn of BTOKEN that will be swapped
    // amountIn = [ sqrt(reserveIn * (amountBTOKEN * 3992000 + (reserveIn * 3992004))) - (reserveIn * 1998) ] / 1996
    // amountIn = [ sqrt(1 * ((0.1 * 3992000) + (1 * 3992004))) - (1 * 1998) ] / 1996
    // amountIn = 0.048857707015160316... BTOKEN
    // amountOut = (amountIn * fee * reserveOut) / ((reserveIn * feeDenom) + (amountIn * fee))
    // amountOut = (0.048857707015160316 * 998 * 0.1) / ((1 * 1000) + (0.048857707015160316 * 998 ))
    // amountOut = 0.004649299362258152... FTOKEN
    // after swap
    // reserveIn = 1 + 0.048857707015160316 = 1.048857707015160316 BTOKEN
    // reserveOut = 0.1 - 0.004649299362258152 = 0.095350700637741848 FTOKEN
    // totalSupply = sqrt(reserveIn * reserveOut)
    // totalSupply = sqrt(1.048857707015160316 * 0.095350700637741848)
    // totalSupply = 0.316242497512891045... lpToken

    // so adding both BTOKEN and FTOKEN as liquidity will result in an amount of lp
    // amountBTOKEN = 0.1 - 0.048857707015160316 = 0.051142292984839684
    // amountFTOKEN = 0.004649299362258152
    // lpAmount = totalSupply * (amountF / reserveF) or totalSupply * (amountB / reserveB)
    // lpAmount = 0.316242497512891045 * (0.004649299362258152 / 0.095350700637741848) ~= 0.015419981522648937...
    // lpAmount = 0.316242497512891045 * (0.051142292984839684 / 1.048857707015160316) ~= 0.015419981522648941...

    // actualLpAmount = 0.015419263215025115
    expect(await lp.balanceOf(mockWorker.address)).to.be.eq(ethers.utils.parseEther("0.015419263215025115"));
    expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    // there is a very small remaining amount of base token left
    expect(await baseToken.balanceOf(strat.address)).to.be.lte(ethers.BigNumber.from("13"));

    // Bob uses AddBaseTokenOnly strategy to add another 0.1 BTOKEN
    await baseTokenAsBob.transfer(mockWorker.address, ethers.utils.parseEther("0.1"));
    await mockWorkerAsBob.work(
      0,
      await bob.getAddress(),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
      )
    );

    expect(await lp.balanceOf(mockWorker.address)).to.be.eq(ethers.utils.parseEther("0.030151497260262730"));
    expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
  });
});
