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
  PancakeRouter,
  PancakeRouterV2__factory,
  PancakeRouter__factory,
  PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading,
  PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading__factory,
  WETH,
  WETH__factory,
  WNativeRelayer__factory,
  WNativeRelayer,
} from "../../../../../typechain";
import { MockPancakeswapV2CakeMaxiWorker__factory } from "../../../../../typechain/factories/MockPancakeswapV2CakeMaxiWorker__factory";
import { MockPancakeswapV2CakeMaxiWorker } from "../../../../../typechain/MockPancakeswapV2CakeMaxiWorker";

chai.use(solidity);
const { expect } = chai;

describe("PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading", () => {
  const FOREVER = "2000000000";

  /// Pancakeswap-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouter;

  /// MockPancakeswapV2CakeMaxiWorker-related instance(s)
  let mockPancakeswapV2WorkerBaseFTokenPair: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2WorkerBNBFtokenPair: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2WorkerBaseBNBTokenPair: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2EvilWorker: MockPancakeswapV2CakeMaxiWorker;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let strat: PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let wbnbTokenAsAlice: WETH;

  let routerV2AsAlice: PancakeRouter;
  let routerV2AsBob: PancakeRouter;

  let stratAsAlice: PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading;
  let stratAsBob: PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading;

  let mockPancakeswapV2WorkerBaseFTokenPairAsAlice: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2WorkerBNBFtokenPairAsAlice: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2WorkerBaseBNBTokenPairAsAlice: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2EvilWorkerAsAlice: MockPancakeswapV2CakeMaxiWorker;

  let wNativeRelayer: WNativeRelayer;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();
    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
    factoryV2 = await PancakeFactory.deploy(await deployer.getAddress());
    await factoryV2.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();

    /// Setup WNativeRelayer
    const WNativeRelayer = (await ethers.getContractFactory("WNativeRelayer", deployer)) as WNativeRelayer__factory;
    wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
    await wNativeRelayer.deployed();

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
    await factoryV2.createPair(baseToken.address, wbnb.address);
    await factoryV2.createPair(farmingToken.address, wbnb.address);

    /// Setup MockPancakeswapV2CakeMaxiWorker
    const MockPancakeswapV2CakeMaxiWorker = (await ethers.getContractFactory(
      "MockPancakeswapV2CakeMaxiWorker",
      deployer
    )) as MockPancakeswapV2CakeMaxiWorker__factory;
    mockPancakeswapV2WorkerBaseFTokenPair = (await MockPancakeswapV2CakeMaxiWorker.deploy(
      baseToken.address,
      farmingToken.address,
      [baseToken.address, wbnb.address, farmingToken.address],
      [farmingToken.address, wbnb.address]
    )) as MockPancakeswapV2CakeMaxiWorker;
    await mockPancakeswapV2WorkerBaseFTokenPair.deployed();

    mockPancakeswapV2WorkerBNBFtokenPair = (await MockPancakeswapV2CakeMaxiWorker.deploy(
      wbnb.address,
      farmingToken.address,
      [wbnb.address, farmingToken.address],
      [farmingToken.address, wbnb.address]
    )) as MockPancakeswapV2CakeMaxiWorker;
    await mockPancakeswapV2WorkerBNBFtokenPair.deployed();

    mockPancakeswapV2WorkerBaseBNBTokenPair = (await MockPancakeswapV2CakeMaxiWorker.deploy(
      baseToken.address,
      wbnb.address,
      [baseToken.address, wbnb.address],
      [farmingToken.address, wbnb.address]
    )) as MockPancakeswapV2CakeMaxiWorker;
    await mockPancakeswapV2WorkerBaseBNBTokenPair.deployed();

    mockPancakeswapV2EvilWorker = (await MockPancakeswapV2CakeMaxiWorker.deploy(
      baseToken.address,
      farmingToken.address,
      [baseToken.address, wbnb.address, farmingToken.address],
      [farmingToken.address, wbnb.address]
    )) as MockPancakeswapV2CakeMaxiWorker;
    await mockPancakeswapV2EvilWorker.deployed();

    const PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading",
      deployer
    )) as PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading__factory;
    strat = (await upgrades.deployProxy(PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading, [
      routerV2.address,
      wNativeRelayer.address,
    ])) as PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading;
    await strat.deployed();
    await strat.setWorkersOk(
      [
        mockPancakeswapV2WorkerBaseFTokenPair.address,
        mockPancakeswapV2WorkerBNBFtokenPair.address,
        mockPancakeswapV2WorkerBaseBNBTokenPair.address,
      ],
      true
    );
    await wNativeRelayer.setCallerOk([strat.address], true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    wbnbTokenAsAlice = WETH__factory.connect(wbnb.address, alice);

    routerV2AsAlice = PancakeRouter__factory.connect(routerV2.address, alice);
    routerV2AsBob = PancakeRouter__factory.connect(routerV2.address, bob);

    stratAsAlice = PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading__factory.connect(
      strat.address,
      alice
    );
    stratAsBob = PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading__factory.connect(strat.address, bob);

    mockPancakeswapV2WorkerBaseFTokenPairAsAlice = MockPancakeswapV2CakeMaxiWorker__factory.connect(
      mockPancakeswapV2WorkerBaseFTokenPair.address,
      alice
    );
    mockPancakeswapV2WorkerBNBFtokenPairAsAlice = MockPancakeswapV2CakeMaxiWorker__factory.connect(
      mockPancakeswapV2WorkerBNBFtokenPair.address,
      alice
    );
    mockPancakeswapV2WorkerBaseBNBTokenPairAsAlice = MockPancakeswapV2CakeMaxiWorker__factory.connect(
      mockPancakeswapV2WorkerBaseBNBTokenPair.address,
      alice
    );
    mockPancakeswapV2EvilWorkerAsAlice = MockPancakeswapV2CakeMaxiWorker__factory.connect(
      mockPancakeswapV2EvilWorker.address,
      alice
    );

    // Adding liquidity to the pool
    // Alice adds 0.1 FTOKEN + 1 BTOKEN + 1 WBNB
    await wbnbTokenAsAlice.deposit({
      value: ethers.utils.parseEther("52"),
    });
    await farmingTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("0.1"));
    await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("1"));
    await wbnbTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("2"));
    // Add liquidity to the BTOKEN-WBNB pool on Pancakeswap
    await routerV2AsAlice.addLiquidity(
      baseToken.address,
      wbnb.address,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("1"),
      "0",
      "0",
      await alice.getAddress(),
      FOREVER
    );
    // Add liquidity to the WBNB-FTOKEN pool on Pancakeswap
    await routerV2AsAlice.addLiquidity(
      farmingToken.address,
      wbnb.address,
      ethers.utils.parseEther("0.1"),
      ethers.utils.parseEther("1"),
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
      await expect(stratAsBob.setWorkersOk([mockPancakeswapV2EvilWorkerAsAlice.address], true)).to.reverted;
    });
  });

  context("When non-worker call the strat", async () => {
    it("should revert", async () => {
      await expect(
        stratAsBob.execute(await bob.getAddress(), "0", ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"]))
      ).to.be.reverted;
    });
  });

  context("When the base token is a wrap native", async () => {
    context("When contract get farmingAmount amount < minFarmingAmount", async () => {
      it("should revert", async () => {
        // if 0.1 Ftoken = 1 WBNB
        // x FToken = (x * 0.9975) * (1 / (0.1 + x*0.9975)) = 0.1
        // x = ~ 0.011138958507379568
        // thus, the return farming token will be 0.088861041492620439
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBNBFtokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        await expect(
          mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
            0,
            await alice.getAddress(),
            ethers.utils.parseEther("0.1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256"],
                  [ethers.utils.parseEther("0.088861041492620439").add(1)]
                ),
              ]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading::execute:: insufficient farmingToken amount received"
        );
      });
    });

    context("When caller worker hasn't been whitelisted", async () => {
      it("should revert as bad worker", async () => {
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2EvilWorkerAsAlice.address, ethers.utils.parseEther("0.05"));
        await expect(
          mockPancakeswapV2EvilWorkerAsAlice.work(
            0,
            await alice.getAddress(),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker"
        );
      });
    });

    context("when revoking whitelist workers", async () => {
      it("should revert as bad worker", async () => {
        await strat.setWorkersOk([mockPancakeswapV2WorkerBNBFtokenPair.address], false);
        await expect(
          mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
            0,
            await alice.getAddress(),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker"
        );
      });
    });
    context("when debt > 0", async () => {
      it("should convert to WBNB to be enough for repaying the debt, and return farmingToken to the user", async () => {
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBNBFtokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        const aliceWbnbBefore = await wbnb.balanceOf(await alice.getAddress());
        const aliceFarmingTokenBefore = await farmingToken.balanceOf(await alice.getAddress());
        await mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
          0,
          await alice.getAddress(),
          ethers.utils.parseEther("0.1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const aliceWbnbAfter = await wbnb.balanceOf(await alice.getAddress());
        const aliceFarmingTokenAfter = await farmingToken.balanceOf(await alice.getAddress());
        // if 0.1 Ftoken = 1 WBNB
        // x FToken = (x * 0.9975 * 1) / (0.1 + x*0.9975) = 0.1
        // x = ~ 0.011138958507379568
        // thus, 0.1 - 0.011138958507379568 = 0.088861041492620439 FToken will be returned to ALICE
        // and the worker will return 0.1 WBNB to ALICE as a repaying debt
        expect(aliceWbnbAfter.sub(aliceWbnbBefore)).to.be.eq(ethers.utils.parseEther("0.1"));
        expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await wbnb.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await farmingToken.balanceOf(mockPancakeswapV2WorkerBNBFtokenPair.address)).to.be.eq(
          ethers.utils.parseEther("0")
        );
        expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.be.eq(
          ethers.utils.parseEther("0.088861041492620439")
        );
      });
    });
    context("when debt = 0", async () => {
      it("should return all farmingToken to the user", async () => {
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBNBFtokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        const aliceWbnbBefore = await wbnb.balanceOf(await alice.getAddress());
        const aliceFarmingTokenBefore = await farmingToken.balanceOf(await alice.getAddress());
        await mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
          0,
          await alice.getAddress(),
          ethers.utils.parseEther("0"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const aliceWbnbAfter = await wbnb.balanceOf(await alice.getAddress());
        const aliceFarmingTokenAfter = await farmingToken.balanceOf(await alice.getAddress());
        // FToken, wbnb in a strategy contract MUST be 0
        expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await wbnb.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await farmingToken.balanceOf(mockPancakeswapV2WorkerBNBFtokenPair.address)).to.be.eq(
          ethers.utils.parseEther("0")
        );
        // Alice will have all farming token of 0.1 FToken back since she got no debt
        expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.be.eq(ethers.utils.parseEther("0.1"));
        expect(aliceWbnbAfter.sub(aliceWbnbBefore)).to.be.eq(ethers.utils.parseEther("0"));
      });
    });
  });

  context("When the base token is not a wrap native", async () => {
    context("When contract get farmingToken amount < minFarmingTokenAmount", async () => {
      it("should revert", async () => {
        // if 1 WBNB = 1 BaseToken
        // x WBNB = (x * 0.9975) * (1 / (1 + x * 0.9975)) = 0.1
        // x WBNB =~ ~ 0.11138958507379568

        // if 0.1 FToken = 1 WBNB
        // x FToken =  (x * 0.9975) * (1 / (0.1 + x * 0.9975)) = 0.11138958507379568
        // x = 0.012566672086044004
        // thus 0.1 - 0.012566672086044 = 0.087433327913955996
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBaseFTokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        await expect(
          mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
            0,
            await alice.getAddress(),
            ethers.utils.parseEther("0.1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256"],
                  [ethers.utils.parseEther("0.087433327913955996").add(1)]
                ),
              ]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading::execute:: insufficient farmingToken amount received"
        );
      });
    });

    context("When caller worker hasn't been whitelisted", async () => {
      it("should revert as bad worker", async () => {
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2EvilWorkerAsAlice.address, ethers.utils.parseEther("0.05"));
        await expect(
          mockPancakeswapV2EvilWorkerAsAlice.work(
            0,
            await alice.getAddress(),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker"
        );
      });
    });

    context("when revoking whitelist workers", async () => {
      it("should revert as bad worker", async () => {
        await strat.setWorkersOk([mockPancakeswapV2WorkerBaseFTokenPair.address], false);
        await expect(
          mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
            0,
            await alice.getAddress(),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker"
        );
      });
    });

    context("when debt > 0", async () => {
      it("should convert to BTOKEN to be enough for repaying the debt, and return farmingToken to the user", async () => {
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBaseFTokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        const aliceBaseTokenBefore = await baseToken.balanceOf(await alice.getAddress());
        const aliceFarmingTokenBefore = await farmingToken.balanceOf(await alice.getAddress());
        await mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
          0,
          await alice.getAddress(),
          ethers.utils.parseEther("0.1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const aliceBaseTokenAfter = await baseToken.balanceOf(await alice.getAddress());
        const aliceFarmingTokenAfter = await farmingToken.balanceOf(await alice.getAddress());
        // if 1 WBNB = 1 BTOKEN
        // x WBNB = (x * 0.9975 * 1) / (1 + x * 0.9975) = 0.1
        // x WBNB =~ ~ 0.11138958507379568

        // if 0.1 FToken = 1 WBNB
        // x FToken =  (x * 0.9975 * 1) / (0.1 + x * 0.9975) = 0.11138958507379568
        // x = 0.012566672086044004
        // thus 0.1 - 0.012566672086044 = 0.087433327913955996
        // Alice will have 0.087433327913955996 FTOKEN back and 0.1 BTOKEN as a repaying debt
        expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.be.eq(ethers.utils.parseEther("0.1"));
        expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await farmingToken.balanceOf(mockPancakeswapV2WorkerBaseFTokenPair.address)).to.be.eq(
          ethers.utils.parseEther("0")
        );
        expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.be.eq(
          ethers.utils.parseEther("0.087433327913955996")
        );
      });
    });

    context("when debt = 0", async () => {
      it("should return all farmingToken to the user", async () => {
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBaseFTokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        const aliceBaseTokenBefore = await baseToken.balanceOf(await alice.getAddress());
        const aliceFarmingTokenBefore = await farmingToken.balanceOf(await alice.getAddress());
        await mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
          0,
          await alice.getAddress(),
          ethers.utils.parseEther("0"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          )
        );
        const aliceBaseTokenAfter = await baseToken.balanceOf(await alice.getAddress());
        const aliceFarmingTokenAfter = await farmingToken.balanceOf(await alice.getAddress());
        // FToken, BToken in a strategy contract MUST be 0
        expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await farmingToken.balanceOf(mockPancakeswapV2WorkerBaseFTokenPair.address)).to.be.eq(
          ethers.utils.parseEther("0")
        );
        // Alice will have all farming token of 0.1 FToken back since she got no debt
        expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.be.eq(ethers.utils.parseEther("0"));
        expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.be.eq(ethers.utils.parseEther("0.1"));
      });
    });
  });

  context("When the farming token is a wrap native", async () => {
    context("When contract get farmingAmount amount < minFarmingAmount", async () => {
      it("should revert", async () => {
        // if 1 BNB = 1 BaseToken
        // x BNB = (x * 0.9975) * (1 / (1 + x * 0.9975)) = 0.1
        // x = ~ 0.11138958507379568
        // thus, the return farming token will be 0.888610414926204399
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2WorkerBaseBNBTokenPair.address, ethers.utils.parseEther("1"));
        await expect(
          mockPancakeswapV2WorkerBaseBNBTokenPairAsAlice.work(
            0,
            await alice.getAddress(),
            ethers.utils.parseEther("0.1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256"],
                  [ethers.utils.parseEther("0.888610414926204399").add(1)]
                ),
              ]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading::execute:: insufficient farmingToken amount received"
        );
      });
    });

    context("When caller worker hasn't been whitelisted", async () => {
      it("should revert as bad worker", async () => {
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2EvilWorkerAsAlice.address, ethers.utils.parseEther("0.05"));
        await expect(
          mockPancakeswapV2EvilWorkerAsAlice.work(
            0,
            await alice.getAddress(),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker"
        );
      });
    });

    context("when revoking whitelist workers", async () => {
      it("should revert as bad worker", async () => {
        await strat.setWorkersOk([mockPancakeswapV2WorkerBaseBNBTokenPair.address], false);
        await expect(
          mockPancakeswapV2WorkerBaseBNBTokenPairAsAlice.work(
            0,
            await alice.getAddress(),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker"
        );
      });
    });

    context("when debt > 0", async () => {
      it("should convert to WBNB to be enough for repaying the debt, and return farmingToken to the user", async () => {
        // mock farming token (WBNB)
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2WorkerBaseBNBTokenPair.address, ethers.utils.parseEther("1"));
        const aliceBaseTokenBefore = await baseToken.balanceOf(await alice.getAddress());
        const aliceNativeFarmingTokenBefore = await ethers.provider.getBalance(await alice.getAddress());
        await mockPancakeswapV2WorkerBaseBNBTokenPairAsAlice.work(
          0,
          await alice.getAddress(),
          ethers.utils.parseEther("0.1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          ),
          {
            gasPrice: 0,
          }
        );
        // if 1 BNB = 1 BaseToken
        // x BNB = (x * 0.9975 * 1) / (1 + x * 0.9975) = 0.1 baseToken
        // x = ~ 0.11138958507379568 BNB
        // thus, alice will receive 1 - 0.11138958507379568 =  0.888610414926204399 BNB as a return farming token and 0.1 BaseToken for repaying the debt
        const aliceBaseTokenAfter = await baseToken.balanceOf(await alice.getAddress());
        const aliceNativeFarmingTokenAfter = await ethers.provider.getBalance(await alice.getAddress());
        expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.eq(ethers.utils.parseEther("0.1"));
        expect(aliceNativeFarmingTokenAfter.sub(aliceNativeFarmingTokenBefore)).to.eq(
          ethers.utils.parseEther("0.888610414926204399")
        );
        expect(await wbnb.balanceOf(mockPancakeswapV2WorkerBaseBNBTokenPair.address)).to.be.eq(
          ethers.utils.parseEther("0")
        );
        expect(await wbnb.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      });
    });

    context("when debt = 0", async () => {
      it("should return all farmingToken to the user", async () => {
        // mock farming token (WBNB)
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2WorkerBaseBNBTokenPair.address, ethers.utils.parseEther("1"));
        const aliceBaseTokenBefore = await baseToken.balanceOf(await alice.getAddress());
        const aliceNativeFarmingTokenBefore = await ethers.provider.getBalance(await alice.getAddress());
        await mockPancakeswapV2WorkerBaseBNBTokenPairAsAlice.work(
          0,
          await alice.getAddress(),
          ethers.utils.parseEther("0"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
          ),
          {
            gasPrice: 0,
          }
        );
        const aliceBaseTokenAfter = await baseToken.balanceOf(await alice.getAddress());
        const aliceNativeFarmingTokenAfter = await ethers.provider.getBalance(await alice.getAddress());
        // Alice will have all farming token of 1 BNB (as a native farming token) back since she got no debt
        expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.eq(ethers.utils.parseEther("0"));
        expect(aliceNativeFarmingTokenAfter.sub(aliceNativeFarmingTokenBefore)).to.eq(ethers.utils.parseEther("1"));
        // wbnb, BToken in a strategy contract MUST be 0
        expect(await wbnb.balanceOf(mockPancakeswapV2WorkerBaseBNBTokenPair.address)).to.be.eq(
          ethers.utils.parseEther("0")
        );
        expect(await wbnb.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      });
    });
  });
});
