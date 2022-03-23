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
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly__factory,
  WETH,
  WETH__factory,
} from "../../../../../typechain";
import { MockPancakeswapV2CakeMaxiWorker__factory } from "../../../../../typechain/factories/MockPancakeswapV2CakeMaxiWorker__factory";
import { MockPancakeswapV2CakeMaxiWorker } from "../../../../../typechain/MockPancakeswapV2CakeMaxiWorker";

chai.use(solidity);
const { expect } = chai;

describe("PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly", () => {
  const FOREVER = "2000000000";

  /// Pancakeswap-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouter;

  /// MockPancakeswapV2CakeMaxiWorker-related instance(s)
  let mockPancakeswapV2WorkerBaseFTokenPair: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2WorkerBNBFtokenPair: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2EvilWorker: MockPancakeswapV2CakeMaxiWorker;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let strat: PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly;

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

  let stratAsAlice: PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly;
  let stratAsBob: PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly;

  let mockPancakeswapV2WorkerBaseFTokenPairAsAlice: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2WorkerBNBFtokenPairAsAlice: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2EvilWorkerAsAlice: MockPancakeswapV2CakeMaxiWorker;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();
    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
    factoryV2 = await PancakeFactory.deploy(await deployer.getAddress());
    await factoryV2.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();

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

    mockPancakeswapV2EvilWorker = (await MockPancakeswapV2CakeMaxiWorker.deploy(
      baseToken.address,
      farmingToken.address,
      [baseToken.address, farmingToken.address],
      [farmingToken.address, wbnb.address]
    )) as MockPancakeswapV2CakeMaxiWorker;
    await mockPancakeswapV2EvilWorker.deployed();
    const PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly",
      deployer
    )) as PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly__factory;
    strat = (await upgrades.deployProxy(PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly, [
      routerV2.address,
    ])) as PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly;
    await strat.deployed();
    await strat.setWorkersOk(
      [mockPancakeswapV2WorkerBaseFTokenPair.address, mockPancakeswapV2WorkerBNBFtokenPair.address],
      true
    );

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    wbnbTokenAsAlice = WETH__factory.connect(wbnb.address, alice);

    routerV2AsAlice = PancakeRouter__factory.connect(routerV2.address, alice);
    routerV2AsBob = PancakeRouter__factory.connect(routerV2.address, bob);

    stratAsAlice = PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly__factory.connect(strat.address, alice);
    stratAsBob = PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly__factory.connect(strat.address, bob);

    mockPancakeswapV2WorkerBaseFTokenPairAsAlice = MockPancakeswapV2CakeMaxiWorker__factory.connect(
      mockPancakeswapV2WorkerBaseFTokenPair.address,
      alice
    );
    mockPancakeswapV2WorkerBNBFtokenPairAsAlice = MockPancakeswapV2CakeMaxiWorker__factory.connect(
      mockPancakeswapV2WorkerBNBFtokenPair.address,
      alice
    );
    mockPancakeswapV2EvilWorkerAsAlice = MockPancakeswapV2CakeMaxiWorker__factory.connect(
      mockPancakeswapV2EvilWorker.address,
      alice
    );

    // Adding liquidity to the pool
    // Alice adds 0.1 FTOKEN + 1 WBTC + 1 WBNB
    await wbnbTokenAsAlice.deposit({
      value: ethers.utils.parseEther("50"),
    });
    await farmingTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("0.1"));
    await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("1"));
    await wbnbTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("2"));
    // Add liquidity to the WBTC-WBNB pool on Pancakeswap
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

  context("when the base token is a wrap native", async () => {
    context("When contract get farmingToken amount < minFarmingTokenAmount", async () => {
      it("should revert", async () => {
        // Alice uses AddBaseTokenOnly with an unreasonable minFarmingTokenamount
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2WorkerBNBFtokenPair.address, ethers.utils.parseEther("0.1"));
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
          "PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly::execute:: insufficient farmingToken amount received"
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
          "PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly::onlyWhitelistedWorkers:: bad worker"
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
          "PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly::onlyWhitelistedWorkers:: bad worker"
        );
      });
    });

    it("should convert ALL baseToken (BNB) to farmingToken", async () => {
      // Alice transfer 0.1 WBNB to StrategyAddBaseTokenOnly first
      await wbnbTokenAsAlice.transfer(mockPancakeswapV2WorkerBNBFtokenPair.address, ethers.utils.parseEther("0.1"));
      // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB
      // amountOut of 0.1 will be
      // if 1WBNB = 0.1 FToken
      // 0.1WBNB will be (0.1*0.9975) * (0.1/(1+0.1*0.9975)) = 0.00907024323709934
      await mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
        0,
        await alice.getAddress(),
        "0",
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
        )
      );

      expect(await farmingToken.balanceOf(mockPancakeswapV2WorkerBNBFtokenPair.address)).to.be.eq(
        ethers.utils.parseEther("0.00907024323709934")
      );
      expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await wbnb.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await wbnb.balanceOf(mockPancakeswapV2WorkerBNBFtokenPair.address)).to.be.eq(ethers.utils.parseEther("0"));

      // Alice uses AddBaseTokenOnly strategy to add another 0.1 WBNB
      // amountOut of 0.1 will be
      // if 1.1 WBNB = (0.1 - 0.00907024323709934) FToken
      // if 1.1 WBNB = 0.09092975676290066 FToken
      // 0.1 WBNB will be (0.1*0.9975) * (0.09092975676290066/(1.1+0.1*0.9975)) = 0.0075601110540523785
      // thus, the current amount accumulated with the previous one will be 0.0075601110540523785 + 0.00907024323709934 = 0.01663035429115172
      await wbnbTokenAsAlice.transfer(mockPancakeswapV2WorkerBNBFtokenPair.address, ethers.utils.parseEther("0.1"));
      await mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
        0,
        await alice.getAddress(),
        "0",
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
        )
      );

      expect(await farmingToken.balanceOf(mockPancakeswapV2WorkerBNBFtokenPair.address)).to.be.eq(
        ethers.utils.parseEther("0.016630354291151718")
      );
      expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await wbnb.balanceOf(mockPancakeswapV2WorkerBNBFtokenPair.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await wbnb.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    });
  });

  context("when the base token is not a wrap native", async () => {
    context("When contract get farmingToken amount < minFarmingTokenAmount", async () => {
      it("should revert", async () => {
        // Alice uses AddBaseTokenOnly with an unreasonable minFarmingTokenamount
        await baseTokenAsAlice.transfer(mockPancakeswapV2WorkerBaseFTokenPair.address, ethers.utils.parseEther("0.1"));
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
          "PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly::execute:: insufficient farmingToken amount received"
        );
      });
    });

    context("When caller worker hasn't been whitelisted", async () => {
      it("should revert as bad worker", async () => {
        await baseTokenAsAlice.transfer(mockPancakeswapV2EvilWorker.address, ethers.utils.parseEther("0.05"));
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
          "PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly::onlyWhitelistedWorkers:: bad worker"
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
          "PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly::onlyWhitelistedWorkers:: bad worker"
        );
      });
    });

    it("should convert ALL baseToken (WBTC) to farmingToken", async () => {
      // Alice transfer 0.1 BASE to StrategyAddBaseTokenOnly first
      await baseTokenAsAlice.transfer(mockPancakeswapV2WorkerBaseFTokenPair.address, ethers.utils.parseEther("0.1"));
      // Alice uses AddBaseTokenOnly strategy to add 0.1 BASE
      // amountOut of 0.1 will be
      // if 1 BASE = 1 BNB
      // 0.1 BASE will be (0.1 * 0.9975) * (1 / (1 + 0.1 * 0.9975)) = 0.09070243237099342 BNB
      // if 1 BNB = 0.1 FTOKEN
      // 0.09070243237099342 BNB = (0.09070243237099342 * 0.9975) * (0.1 / (1 + 0.09070243237099342 * 0.9975)) = 0.008296899991192416 FTOKEN
      await mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
        0,
        await alice.getAddress(),
        "0",
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
        )
      );

      expect(await farmingToken.balanceOf(mockPancakeswapV2WorkerBaseFTokenPair.address)).to.be.eq(
        ethers.utils.parseEther("0.008296899991192416")
      );
      expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await baseToken.balanceOf(mockPancakeswapV2WorkerBaseFTokenPair.address)).to.be.eq(
        ethers.utils.parseEther("0")
      );

      // Alice uses AddBaseTokenOnly strategy to add another 0.1 BASE
      // amountOut of 0.1 will be
      // if 1.1 BASE = (1 - 0.09070243237099342) = 0.9092975676290066 BNB
      // 0.1 BASE = (0.1 * 0.9975) * (0.9092975676290066 / (1.1 + 0.1 * 0.9975)) = 0.07560111054052378 BNB
      // if (1 + 0.09070243237099342) = (0.1 - 0.008296899991192416) FTOKEN
      // 0.07560111054052378 BNB = (0.07560111054052378 * 0.9975) * ((0.1 - 0.008296899991192416) /((1 + 0.09070243237099342) + 0.07560111054052378 * 0.9975)) = 0.005930398620508835
      // total of farmingToken will be 0.005930398620508835 + 0.008296899991192416 = 0.014227298611701251
      await baseTokenAsAlice.transfer(mockPancakeswapV2WorkerBaseFTokenPair.address, ethers.utils.parseEther("0.1"));
      await mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
        0,
        await alice.getAddress(),
        "0",
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
        )
      );

      expect(await farmingToken.balanceOf(mockPancakeswapV2WorkerBaseFTokenPair.address)).to.be.eq(
        ethers.utils.parseEther("0.014227298611701251")
      );
      expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await baseToken.balanceOf(mockPancakeswapV2WorkerBaseFTokenPair.address)).to.be.eq(
        ethers.utils.parseEther("0")
      );
    });
  });
});
