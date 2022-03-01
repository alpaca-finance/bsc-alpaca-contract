import { ethers, upgrades, waffle } from "hardhat";
import { Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  BaseV1Factory,
  BaseV1Factory__factory,
  BaseV1Pair,
  BaseV1Pair__factory,
  BaseV1Router01,
  BaseV1Router01__factory,
  WrappedFtm,
  WrappedFtm__factory,
  MockVaultForRestrictedAddTwosideOptimalStrat,
  MockVaultForRestrictedAddTwosideOptimalStrat__factory,
  MockWaultSwapWorker,
  MockWaultSwapWorker__factory,
  SolidlyStrategyAddBaseTokenOnly,
  SolidlyStrategyAddBaseTokenOnly__factory,
} from "../../../../../typechain";
import { assertAlmostEqual } from "../../../../helpers/assert";

chai.use(solidity);
const { expect } = chai;

describe("SolidlyStrategyAddBaseTokenOnly", () => {
  const FOREVER = "2000000000";

  /// DEX-related instance(s)
  /// note: Use WaultSwap here because they have the same fee-structure
  let factory: BaseV1Factory;
  let router: BaseV1Router01;
  let lp: BaseV1Pair;

  /// MockPancakeswapV2Worker-related instance(s)
  let mockWorker: MockWaultSwapWorker;
  let mockEvilWorker: MockWaultSwapWorker;

  /// Token-related instance(s)
  let wftm: WrappedFtm;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let strat: SolidlyStrategyAddBaseTokenOnly;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let farmingTokenAsAlice: MockERC20;

  let routerAsAlice: BaseV1Router01;

  let stratAsBob: SolidlyStrategyAddBaseTokenOnly;

  let mockWorkerAsBob: MockWaultSwapWorker;
  let mockEvilWorkerAsBob: MockWaultSwapWorker;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();

    // Setup DEX
    const BaseV1Factory = (await ethers.getContractFactory("BaseV1Factory", deployer)) as BaseV1Factory__factory;
    factory = await BaseV1Factory.deploy();
    await factory.deployed();

    const WFTM = (await ethers.getContractFactory("WrappedFtm", deployer)) as WrappedFtm__factory;
    wftm = await WFTM.deploy();
    await wftm.deployed();

    const BaseV1Router01 = (await ethers.getContractFactory("BaseV1Router01", deployer)) as BaseV1Router01__factory;
    router = await BaseV1Router01.deploy(factory.address, wftm.address);
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

    await factory.createPair(baseToken.address, farmingToken.address, false);

    lp = BaseV1Pair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address, false), deployer);
    await lp.deployed();

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

    const SolidlyStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "SolidlyStrategyAddBaseTokenOnly",
      deployer
    )) as SolidlyStrategyAddBaseTokenOnly__factory;
    strat = (await upgrades.deployProxy(SolidlyStrategyAddBaseTokenOnly, [
      router.address,
    ])) as SolidlyStrategyAddBaseTokenOnly;
    await strat.deployed();
    await strat.setWorkersOk([mockWorker.address], true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);

    routerAsAlice = BaseV1Router01__factory.connect(router.address, alice);

    stratAsBob = SolidlyStrategyAddBaseTokenOnly__factory.connect(strat.address, bob);

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
      false,
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

    // TODO: Change math
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
    expect(await lp.balanceOf(mockWorker.address)).to.be.eq(ethers.utils.parseEther("0.015433977158308579"));
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

    expect(await lp.balanceOf(mockWorker.address)).to.be.eq(ethers.utils.parseEther("0.030180984933872348"));
    expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
  });
});
