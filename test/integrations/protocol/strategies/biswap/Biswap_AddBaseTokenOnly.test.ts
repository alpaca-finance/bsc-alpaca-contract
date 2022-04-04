import { ethers, network, upgrades, waffle } from "hardhat";
import { Signer } from "ethers";
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
  BiswapStrategyAddBaseTokenOnly,
  BiswapStrategyAddBaseTokenOnly__factory,
  WETH,
  WETH__factory,
  MockMdexWorker,
  MockMdexWorker__factory,
  Oracle,
  Oracle__factory,
} from "../../../../../typechain";

chai.use(solidity);
const { expect } = chai;

describe("BiswapStrategyAddBaseTokenOnly", () => {
  const FOREVER = "2000000000";

  /// Biswap-related instance(s)
  let factory: BiswapFactory;
  let router: BiswapRouter02;
  let lp: BiswapPair;
  let oracle: Oracle;

  /// MockBiswapWorker which has the MockMdexWorker implementation instance(s)
  let mockBiswapWorker: MockMdexWorker;
  let mockBiswapEvilWorker: MockMdexWorker;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let strat: BiswapStrategyAddBaseTokenOnly;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let farmingTokenAsAlice: MockERC20;

  let routerAsAlice: BiswapRouter02;

  let stratAsBob: BiswapStrategyAddBaseTokenOnly;

  let mockBiswapWorkerAsBob: MockMdexWorker;
  let mockBiswapEvilWorkerAsBob: MockMdexWorker;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();

    // Setup Mdex
    const BiswapFactory = (await ethers.getContractFactory("BiswapFactory", deployer)) as BiswapFactory__factory;
    factory = await BiswapFactory.deploy(await deployer.getAddress());
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();
    await wbnb.deployed();

    const BiswapRouter02 = (await ethers.getContractFactory("BiswapRouter02", deployer)) as BiswapRouter02__factory;
    router = await BiswapRouter02.deploy(factory.address, wbnb.address);
    await router.deployed();

    const Oracle = (await ethers.getContractFactory("Oracle", deployer)) as Oracle__factory;
    oracle = await Oracle.deploy(factory.address);
    await oracle.deployed();

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

    const createdPairAddress = await factory.createPair(baseToken.address, farmingToken.address);

    lp = BiswapPair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);

    /// Setup MockMdexWorker
    const MockMdexWorker = (await ethers.getContractFactory("MockMdexWorker", deployer)) as MockMdexWorker__factory;
    mockBiswapWorker = (await MockMdexWorker.deploy(
      lp.address,
      baseToken.address,
      farmingToken.address
    )) as MockMdexWorker;
    await mockBiswapWorker.deployed();
    mockBiswapEvilWorker = (await MockMdexWorker.deploy(
      lp.address,
      baseToken.address,
      farmingToken.address
    )) as MockMdexWorker;
    await mockBiswapEvilWorker.deployed();

    const BiswapStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "BiswapStrategyAddBaseTokenOnly",
      deployer
    )) as BiswapStrategyAddBaseTokenOnly__factory;
    strat = (await upgrades.deployProxy(BiswapStrategyAddBaseTokenOnly, [
      router.address,
    ])) as BiswapStrategyAddBaseTokenOnly;
    await strat.deployed();
    await strat.setWorkersOk([mockBiswapWorker.address], true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);

    routerAsAlice = BiswapRouter02__factory.connect(router.address, alice);

    stratAsBob = BiswapStrategyAddBaseTokenOnly__factory.connect(strat.address, bob);

    mockBiswapWorkerAsBob = MockMdexWorker__factory.connect(mockBiswapWorker.address, bob);
    mockBiswapEvilWorkerAsBob = MockMdexWorker__factory.connect(mockBiswapEvilWorker.address, bob);

    // Adding liquidity to the pool
    // Alice adds 0.1 FTOKEN + 1 BTOKEN
    await farmingTokenAsAlice.approve(router.address, ethers.utils.parseEther("0.1"));
    await baseTokenAsAlice.approve(router.address, ethers.utils.parseEther("1"));

    // // Add liquidity to the BTOKEN-FTOKEN pool on Biswap
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
    // refer to BiswapFactory line: 842
    // totalSupply =  sqrt(amount0 * amount1) - 0.000000000000001000
    // totalSupply =  sqrt(1 * 0.1) - 0.000000000000001000 = 0.316227766016836933
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
      await expect(stratAsBob.setWorkersOk([mockBiswapEvilWorkerAsBob.address], true)).to.reverted;
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
      await baseTokenAsBob.transfer(mockBiswapWorker.address, ethers.utils.parseEther("0.1"));
      await expect(
        mockBiswapWorkerAsBob.work(
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
      await baseTokenAsBob.transfer(mockBiswapEvilWorkerAsBob.address, ethers.utils.parseEther("0.05"));
      await expect(
        mockBiswapEvilWorkerAsBob.work(
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
      await strat.setWorkersOk([mockBiswapWorker.address], false);
      await expect(
        mockBiswapWorkerAsBob.work(
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

  it("should convert all BTOKEN to LP tokens at best rate (trading fee 10 bps)", async () => {
    await factory.setSwapFee(lp.address, 1);
    // Bob transfer 0.1 BTOKEN to StrategyAddBaseTokenOnly first
    await baseTokenAsBob.transfer(mockBiswapWorker.address, ethers.utils.parseEther("0.1"));
    // Bob uses AddBaseTokenOnly strategy to add 0.1 BTOKEN
    await mockBiswapWorkerAsBob.work(
      0,
      await bob.getAddress(),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
      )
    );

    // // actualLpAmount = 0.01542699189141548
    expect(await lp.balanceOf(mockBiswapWorker.address)).to.be.eq(ethers.utils.parseEther("0.015426991891415481"));
    expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.BigNumber.from("0"));

    // // Bob uses AddBaseTokenOnly strategy to add another 0.1 BTOKEN
    await baseTokenAsBob.transfer(mockBiswapWorker.address, ethers.utils.parseEther("0.1"));
    await mockBiswapWorkerAsBob.work(
      0,
      await bob.getAddress(),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
      )
    );

    expect(await lp.balanceOf(mockBiswapWorker.address)).to.be.eq(ethers.utils.parseEther("0.030166953762765411"));
    expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await baseToken.balanceOf(strat.address)).to.be.lte(ethers.BigNumber.from("13"));
  });
  it("should convert all BTOKEN to LP tokens at best rate (trading fee 20 bps)", async () => {
    await factory.setSwapFee(lp.address, 2);
    // Bob transfer 0.1 BTOKEN to StrategyAddBaseTokenOnly first
    await baseTokenAsBob.transfer(mockBiswapWorker.address, ethers.utils.parseEther("0.1"));
    // Bob uses AddBaseTokenOnly strategy to add 0.1 BTOKEN
    await mockBiswapWorkerAsBob.work(
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
    // totalSupply = 0.316227766016836933 (from first adding liquidity in the setup)

    // so adding both BTOKEN and FTOKEN as liquidity will result in an amount of lp
    // amountBTOKEN = 0.1 - 0.048857707015160316 = 0.051142292984839684
    // amountFTOKEN = 0.004649299362258152
    // refer to BiswapFactory line: 846
    // lpAmount = min of [ totalSupply * (amountF / reserveF) or totalSupply * (amountB / reserveB) ]
    // lpAmount = 0.316227766016837933 * (0.004649299362258152 / 0.095350700637741848) ~= 0.015419263215025115...
    // lpAmount = 0.316227766016837933 * (0.051142292984839684 / 1.048857707015160316) ~= 0.015419263215025119...

    // actualLpAmount = 0.015419263215025115
    expect(await lp.balanceOf(mockBiswapWorker.address)).to.be.eq(ethers.utils.parseEther("0.015419263215025115"));
    expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    // there is a very small remaining amount of base token left
    expect(await baseToken.balanceOf(strat.address)).to.be.lte(ethers.BigNumber.from("13"));

    // Bob uses AddBaseTokenOnly strategy to add another 0.1 BTOKEN
    await baseTokenAsBob.transfer(mockBiswapWorker.address, ethers.utils.parseEther("0.1"));
    await mockBiswapWorkerAsBob.work(
      0,
      await bob.getAddress(),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
      )
    );

    expect(await lp.balanceOf(mockBiswapWorker.address)).to.be.eq(ethers.utils.parseEther("0.030151497260262730"));
    expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
  });
});
