import { ethers, upgrades, waffle } from "hardhat";
import { Signer } from "ethers";
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
  PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate,
  PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate__factory,
  WETH,
  WETH__factory,
} from "../../../../../typechain";
import { MockPancakeswapV2CakeMaxiWorker__factory } from "../../../../../typechain/factories/MockPancakeswapV2CakeMaxiWorker__factory";
import { MockPancakeswapV2CakeMaxiWorker } from "../../../../../typechain/MockPancakeswapV2CakeMaxiWorker";

chai.use(solidity);
const { expect } = chai;

describe("PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate", () => {
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
  let strat: PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate;

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

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let wbnbTokenAsAlice: WETH;

  let routerV2AsAlice: PancakeRouter;
  let routerV2AsBob: PancakeRouter;

  let stratAsAlice: PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate;
  let stratAsBob: PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate;

  let mockPancakeswapV2WorkerBaseFTokenPairAsAlice: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2WorkerBNBFtokenPairAsAlice: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2EvilWorkerAsAlice: MockPancakeswapV2CakeMaxiWorker;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();
    [deployerAddress, aliceAddress, bobAddress] = await Promise.all([
      deployer.getAddress(),
      alice.getAddress(),
      bob.getAddress(),
    ]);

    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
    factoryV2 = await PancakeFactory.deploy(deployerAddress);
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
    await baseToken.mint(aliceAddress, ethers.utils.parseEther("100"));
    await baseToken.mint(bobAddress, ethers.utils.parseEther("100"));
    farmingToken = (await upgrades.deployProxy(MockERC20, ["FTOKEN", "FTOKEN", 18])) as MockERC20;
    await farmingToken.deployed();
    await farmingToken.mint(aliceAddress, ethers.utils.parseEther("10"));
    await farmingToken.mint(bobAddress, ethers.utils.parseEther("10"));
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
      [baseToken.address, wbnb.address, farmingToken.address],
      [farmingToken.address, wbnb.address]
    )) as MockPancakeswapV2CakeMaxiWorker;
    await mockPancakeswapV2EvilWorker.deployed();
    const PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate",
      deployer
    )) as PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate__factory;
    strat = (await upgrades.deployProxy(PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate, [
      routerV2.address,
    ])) as PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate;
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

    stratAsAlice = PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate__factory.connect(
      strat.address,
      alice
    );
    stratAsBob = PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate__factory.connect(strat.address, bob);

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
      value: ethers.utils.parseEther("52"),
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
      aliceAddress,
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
      aliceAddress,
      FOREVER
    );
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("when bad calldata", async () => {
    it("should revert", async () => {
      // Bob passes some bad calldata that can't be decoded
      await expect(stratAsBob.execute(bobAddress, "0", "0x1234")).to.be.reverted;
    });
  });

  context("when the setOkWorkers caller is not an owner", async () => {
    it("should be reverted", async () => {
      await expect(stratAsBob.setWorkersOk([mockPancakeswapV2EvilWorkerAsAlice.address], true)).to.reverted;
    });
  });

  context("when non-worker call the strat", async () => {
    it("should revert", async () => {
      await expect(stratAsBob.execute(bobAddress, "0", ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"]))).to.be
        .reverted;
    });
  });

  context("when BTOKEN is a WBNB", async () => {
    context("maxDebtRepayment >= debt", async () => {
      it("should compare slippage by taking convertingPostionValue - debt", async () => {
        // Alice's position: 0.1 FTOKEN
        // lpTokenToLiquidate: Math.min(888, 0.1) = 0.1 FTOKEN
        // maxDebtRepayment = Math.min(888, 0.1) = 0.1 WBNB
        // After execute strategy. The following conditions must be satisfied:
        // - FTOKEN in strat must be 0
        // - Worker should has 0 FTOKEN left as Alice liquidate her whole position
        // - Alice's BTOKEN should increase by [((0.1*9975)*1)/(0.1*10000+(0.1*9975))]
        // = 0.499374217772215269 WBNB
        // - minBaseToken <= 0.499374217772215269 - 0.1 = 0.399374217772215269 must pass slippage check
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBNBFtokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        await expect(
          mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
            0,
            aliceAddress,
            ethers.utils.parseEther("0.1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [
                    ethers.utils.parseEther("888"),
                    ethers.utils.parseEther("888"),
                    ethers.utils.parseEther("0.399374217772215269").add(1),
                  ]
                ),
              ]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate::execute:: insufficient baseToken amount received"
        );

        const aliceBalanceBefore = await wbnb.balanceOf(aliceAddress);
        await expect(
          mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
            0,
            aliceAddress,
            ethers.utils.parseEther("0.1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [
                    ethers.utils.parseEther("888"),
                    ethers.utils.parseEther("888"),
                    ethers.utils.parseEther("0.399374217772215269"),
                  ]
                ),
              ]
            )
          )
        )
          .to.emit(strat, "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidateEvent")
          .withArgs(wbnb.address, farmingToken.address, ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.1"));
        const aliceBalanceAfter = await wbnb.balanceOf(aliceAddress);

        expect(
          aliceBalanceAfter.sub(aliceBalanceBefore),
          "Alice's WBNB should increase by 0.499374217772215269"
        ).to.be.eq(ethers.utils.parseEther("0.499374217772215269"));
        expect(
          await farmingToken.balanceOf(strat.address),
          "There shouldn't be any FTOKEN left in strategy contract"
        ).to.be.eq(ethers.utils.parseEther("0"));
        expect(await wbnb.balanceOf(strat.address), "There shouldn't be any WBNB left in strategy contract").to.be.eq(
          ethers.utils.parseEther("0")
        );
        expect(
          await farmingToken.balanceOf(mockPancakeswapV2WorkerBNBFtokenPair.address),
          "Worker should has 0 FTOKEN left as all FTOKEN is liquidated"
        ).to.be.eq(ethers.utils.parseEther("0"));
      });
    });

    context("maxDebtRepayment < debt", async () => {
      it("should compare slippage by taking convertingPostionValue - maxDebtRepayment", async () => {
        // Alice's position: 0.1 FTOKEN
        // lpTokenToLiquidate: Math.min(888, 0.1) = 0.1 FTOKEN
        // maxDebtRepayment = Math.min(0.05, 0.1) = 0.05 WBNB
        // After execute strategy. The following conditions must be satisfied:
        // - FTOKEN in strat must be 0
        // - Worker should has 0 FTOKEN left as Alice liquidate her whole position
        // - Alice's BTOKEN should increase by [((0.1*9975)*1)/(0.1*10000+(0.1*9975))]
        // = 0.499374217772215269 WBNB
        // - minBaseToken <= 0.499374217772215269 - 0.05 = 0.449374217772215269 must pass slippage check
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBNBFtokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        await expect(
          mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
            0,
            aliceAddress,
            ethers.utils.parseEther("0.1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [
                    ethers.utils.parseEther("888"),
                    ethers.utils.parseEther("0.05"),
                    ethers.utils.parseEther("0.449374217772215269").add(1),
                  ]
                ),
              ]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate::execute:: insufficient baseToken amount received"
        );

        const aliceBalanceBefore = await wbnb.balanceOf(aliceAddress);
        await expect(
          mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
            0,
            aliceAddress,
            ethers.utils.parseEther("0.1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [
                    ethers.utils.parseEther("888"),
                    ethers.utils.parseEther("0.05"),
                    ethers.utils.parseEther("0.449374217772215269"),
                  ]
                ),
              ]
            )
          )
        )
          .to.emit(strat, "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidateEvent")
          .withArgs(
            wbnb.address,
            farmingToken.address,
            ethers.utils.parseEther("0.1"),
            ethers.utils.parseEther("0.05")
          );
        const aliceBalanceAfter = await wbnb.balanceOf(aliceAddress);

        expect(
          aliceBalanceAfter.sub(aliceBalanceBefore),
          "Alice's WBNB should increase by 0.499374217772215269"
        ).to.be.eq(ethers.utils.parseEther("0.499374217772215269"));
        expect(
          await farmingToken.balanceOf(strat.address),
          "There shouldn't be any FTOKEN left in strategy contract"
        ).to.be.eq(ethers.utils.parseEther("0"));
        expect(await wbnb.balanceOf(strat.address), "There shouldn't be any WBNB left in strategy contract").to.be.eq(
          ethers.utils.parseEther("0")
        );
        expect(
          await farmingToken.balanceOf(mockPancakeswapV2WorkerBNBFtokenPair.address),
          "Worker should has 0 FTOKEN left as all FTOKEN is liquidated"
        ).to.be.eq(ethers.utils.parseEther("0"));
      });
    });

    context("when caller worker hasn't been whitelisted", async () => {
      it("should revert as bad worker", async () => {
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2EvilWorkerAsAlice.address, ethers.utils.parseEther("0.05"));
        await expect(
          mockPancakeswapV2EvilWorkerAsAlice.work(
            0,
            aliceAddress,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256"],
                  [ethers.utils.parseEther("0.04"), ethers.utils.parseEther("0.285203716940671908").add(1)]
                ),
              ]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate::onlyWhitelistedWorkers:: bad worker"
        );
      });
    });

    context("when revoking whitelist workers", async () => {
      it("should revert as bad worker", async () => {
        await strat.setWorkersOk([mockPancakeswapV2WorkerBNBFtokenPair.address], false);
        await expect(
          mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
            0,
            aliceAddress,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256"],
                  [ethers.utils.parseEther("0.04"), ethers.utils.parseEther("0.285203716940671908").add(1)]
                ),
              ]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate::onlyWhitelistedWorkers:: bad worker"
        );
      });
    });

    context("when maxFarmingTokenToLiquidate >= FTOKEN from worker", async () => {
      it("should convert all farmingToken to baseToken (WBNB)", async () => {
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBNBFtokenPair.address,
          ethers.utils.parseEther("0.1")
        );

        // Alice's position: 0.1 FTOKEN
        // lpTokenToLiquidate: Math.min(888, 0.1) = 0.1 FTOKEN
        // After execute strategy. The following conditions must be satisfied:
        // - FTOKEN in strat must be 0
        // - Worker should has 0 FTOKEN left as Alice liquidate her whole position
        // - Alice's BTOKEN should increase by [((0.1*9975)*1)/(0.1*10000+(0.1*9975))]
        // = 0.499374217772215269 WBNB
        const aliceBalanceBefore = await wbnb.balanceOf(aliceAddress);
        await expect(
          mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
            0,
            aliceAddress,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [ethers.utils.parseEther("888"), "0", ethers.utils.parseEther("0.499374217772215269")]
                ),
              ]
            )
          )
        )
          .to.emit(strat, "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidateEvent")
          .withArgs(wbnb.address, farmingToken.address, ethers.utils.parseEther("0.1"), "0");
        const aliceBalanceAfter = await wbnb.balanceOf(aliceAddress);

        expect(
          aliceBalanceAfter.sub(aliceBalanceBefore),
          "Alice's WBNB should increase by 0.499374217772215269"
        ).to.be.eq(ethers.utils.parseEther("0.499374217772215269"));
        expect(
          await farmingToken.balanceOf(strat.address),
          "There shouldn't be any FTOKEN left in strategy contract"
        ).to.be.eq(ethers.utils.parseEther("0"));
        expect(await wbnb.balanceOf(strat.address), "There shouldn't be any WBNB left in strategy contract").to.be.eq(
          ethers.utils.parseEther("0")
        );
        expect(
          await farmingToken.balanceOf(mockPancakeswapV2WorkerBNBFtokenPair.address),
          "Worker should has 0 FTOKEN left as all FTOKEN is liquidated"
        ).to.be.eq(ethers.utils.parseEther("0"));
      });
    });

    context("when maxFarmingTokenToLiquidate < FTOKEN from worker", async () => {
      it("should convert SOME farmingToken to baseToken (WBNB)", async () => {
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBNBFtokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        const farmingTokenToLiquidate = ethers.utils.parseEther("0.04");
        // amountOut of 0.04 will be
        // if 0.1 FToken = 1 WBNB
        // 0.04 FToken will be (0.04 * 0.9975) * (1 / (0.1 + 0.04 * 0.9975)) = 0.285203716940671908 WBNB

        const aliceBalanceBefore = await wbnb.balanceOf(aliceAddress);
        await expect(
          mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
            0,
            aliceAddress,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [farmingTokenToLiquidate, "0", "0"]
                ),
              ]
            )
          )
        )
          .to.emit(strat, "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidateEvent")
          .withArgs(wbnb.address, farmingToken.address, farmingTokenToLiquidate, "0");
        const aliceBalanceAfter = await wbnb.balanceOf(aliceAddress);

        // the worker will send 0.285203716940671908 wbnb back to alice
        expect(aliceBalanceAfter.sub(aliceBalanceBefore)).to.be.eq(ethers.utils.parseEther("0.285203716940671908"));
        // there should be no baseToken or farmingToken left in strategy
        expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await wbnb.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        // the strategy should send 0.06 farmingToken back to worker
        expect(await farmingToken.balanceOf(mockPancakeswapV2WorkerBNBFtokenPair.address)).to.be.eq(
          ethers.utils.parseEther("0.06")
        );
      });
    });
  });

  context("when the base token is not a wrap native", async () => {
    context("maxDebtRepayment >= debt", async () => {
      it("should compare slippage by taking convertingPostionValue - debt", async () => {
        // Alice's position: 0.1 FTOKEN
        // Debt: 0.1 BTOKEN
        // lpTokenToLiquidate: Math.min(888, 0.1) = 0.1 FTOKEN
        // maxDebtRepayment = Math.min(888, 0.1) = 0.1 BTOKEN
        // After execute strategy. The following conditions must be satisfied:
        // - FTOKEN in strat must be 0
        // - Worker should has 0 FTOKEN left as Alice liquidate her whole position
        // - Alice's 0.1 FTOKEN will get swap through FTOKEN->WBNB->WBTC
        // [((0.1*9975)*1)/(0.1*10000+(0.1*9975))] = 0.499374217772215269 WBNB
        // [((0.499374217772215269*9975)*1)/(1*10000+(0.499374217772215269*9975))] = 0.332499305557005937 WBTC
        // - minBaseToken <= 0.332499305557005937 - 0.1 = 0.232499305557005937 must pass slippage check
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBaseFTokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        await expect(
          mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
            0,
            aliceAddress,
            ethers.utils.parseEther("0.1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [
                    ethers.utils.parseEther("888"),
                    ethers.utils.parseEther("888"),
                    ethers.utils.parseEther("0.232499305557005937").add(1),
                  ]
                ),
              ]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate::execute:: insufficient baseToken amount received"
        );

        await expect(
          mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
            0,
            aliceAddress,
            ethers.utils.parseEther("0.1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [
                    ethers.utils.parseEther("888"),
                    ethers.utils.parseEther("888"),
                    ethers.utils.parseEther("0.232499305557005937"),
                  ]
                ),
              ]
            )
          )
        )
          .to.emit(strat, "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidateEvent")
          .withArgs(
            baseToken.address,
            farmingToken.address,
            ethers.utils.parseEther("0.1"),
            ethers.utils.parseEther("0.1")
          );
      });
    });

    context("maxDebtRepayment < debt", async () => {
      it("should compare slippage by taking convertingPostionValue - maxDebtRepayment", async () => {
        // Alice's position: 0.1 FTOKEN
        // Debt: 0.1 BTOKEN
        // lpTokenToLiquidate: Math.min(888, 0.1) = 0.1 FTOKEN
        // maxDebtRepayment = Math.min(0.05, 0.1) = 0.05 BTOKEN
        // After execute strategy. The following conditions must be satisfied:
        // - FTOKEN in strat must be 0
        // - Worker should has 0 FTOKEN left as Alice liquidate her whole position
        // - Alice's 0.1 FTOKEN will get swap through FTOKEN->WBNB->WBTC
        // [((0.1*9975)*1)/(0.1*10000+(0.1*9975))] = 0.499374217772215269 WBNB
        // [((0.499374217772215269*9975)*1)/(1*10000+(0.499374217772215269*9975))] = 0.332499305557005937 WBTC
        // - minBaseToken <= 0.332499305557005937 - 0.05 = 0.282499305557005937 must pass slippage check
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBaseFTokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        await expect(
          mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
            0,
            aliceAddress,
            ethers.utils.parseEther("0.1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [
                    ethers.utils.parseEther("888"),
                    ethers.utils.parseEther("0.05"),
                    ethers.utils.parseEther("0.282499305557005937").add(1),
                  ]
                ),
              ]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate::execute:: insufficient baseToken amount received"
        );

        await expect(
          mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
            0,
            aliceAddress,
            ethers.utils.parseEther("0.1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [
                    ethers.utils.parseEther("888"),
                    ethers.utils.parseEther("0.05"),
                    ethers.utils.parseEther("0.282499305557005937"),
                  ]
                ),
              ]
            )
          )
        )
          .to.emit(strat, "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidateEvent")
          .withArgs(
            baseToken.address,
            farmingToken.address,
            ethers.utils.parseEther("0.1"),
            ethers.utils.parseEther("0.05")
          );
      });
    });

    context("when caller worker hasn't been whitelisted", async () => {
      it("should revert as bad worker", async () => {
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2EvilWorkerAsAlice.address, ethers.utils.parseEther("0.05"));
        await expect(
          mockPancakeswapV2EvilWorkerAsAlice.work(
            0,
            aliceAddress,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256"],
                  [ethers.utils.parseEther("0.04"), ethers.utils.parseEther("0.221481327933600537").add(1)]
                ),
              ]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate::onlyWhitelistedWorkers:: bad worker"
        );
      });
    });

    context("when revoking whitelist workers", async () => {
      it("should revert as bad worker", async () => {
        await strat.setWorkersOk([mockPancakeswapV2WorkerBaseFTokenPair.address], false);
        await expect(
          mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
            0,
            aliceAddress,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256"],
                  [ethers.utils.parseEther("0.04"), ethers.utils.parseEther("0.221481327933600537").add(1)]
                ),
              ]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate::onlyWhitelistedWorkers:: bad worker"
        );
      });
    });

    context("when maxFarmingTokenToLiquidate >= FTOKEN from worker", async () => {
      it("should all farmingToken to baseToken (WBTC)", async () => {
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBaseFTokenPair.address,
          ethers.utils.parseEther("0.1")
        );

        // Alice's position: 0.1 FTOKEN
        // lpTokenToLiquidate: Math.min(888, 0.1) = 0.1 FTOKEN
        // After execute strategy. The following conditions must be satisfied:
        // - FTOKEN in strat must be 0
        // - Worker should has 0 FTOKEN left as Alice liquidate her whole position
        // - Alice's 0.1 FTOKEN will get swap through FTOKEN->WBNB->WBTC
        // [((0.1*9975)*1)/(0.1*10000+(0.1*9975))] = 0.499374217772215269 WBNB
        // [((0.499374217772215269*9975)*1)/(1*10000+(0.499374217772215269*9975))] = 0.332499305557005937 WBTC
        const aliceBalanceBefore = await baseToken.balanceOf(aliceAddress);
        await expect(
          mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
            0,
            aliceAddress,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [ethers.utils.parseEther("888"), "0", ethers.utils.parseEther("0.332499305557005937")]
                ),
              ]
            )
          )
        )
          .to.emit(strat, "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidateEvent")
          .withArgs(baseToken.address, farmingToken.address, ethers.utils.parseEther("0.1"), "0");

        const aliceBalanceAfter = await baseToken.balanceOf(aliceAddress);

        expect(
          aliceBalanceAfter.sub(aliceBalanceBefore),
          "Alice's BTOKEN should increased by 0.332499305557005937"
        ).to.be.eq(ethers.utils.parseEther("0.332499305557005937"));
        expect(await farmingToken.balanceOf(strat.address), "There shouldn't be any FTOKEN left in strategy").to.be.eq(
          ethers.utils.parseEther("0")
        );
        expect(await baseToken.balanceOf(strat.address), "There shouldn't be any BTOKEN left in strategy").to.be.eq(
          ethers.utils.parseEther("0")
        );
        expect(
          await farmingToken.balanceOf(mockPancakeswapV2WorkerBaseFTokenPair.address),
          "Worker should has 0 FTOKEN left as all FTOKEN is liquidated"
        ).to.be.eq(ethers.utils.parseEther("0"));
      });
    });

    context("when maxFarmingTokenToLiquidate < FTOKEN from worker", async () => {
      it("should convert SOME farmingToken to baseToken (WBTC)", async () => {
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBaseFTokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        // amountOut of 0.4 will be
        // if 0.1 FToken = 1 WBNB
        // 0.1 FToken will be (0.04 * 0.9975) * (1 / (0.1 + 0.04 * 0.9975)) = 0.2852037169406719 WBNB
        // if 1 WBNB = 1 BaseToken
        // 0.2852037169406719 WBNB = (0.2852037169406719* 0.9975) * (1 / (1 + 0.2852037169406719 * 0.9975)) = 0.221481327933600537 BaseToken
        const aliceBalanceBefore = await baseToken.balanceOf(aliceAddress);
        const farmingTokenToLiquidate = ethers.utils.parseEther("0.04");
        await expect(
          mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
            0,
            aliceAddress,
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [farmingTokenToLiquidate, "0", "0"]
                ),
              ]
            )
          )
        )
          .to.emit(strat, "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidateEvent")
          .withArgs(baseToken.address, farmingToken.address, farmingTokenToLiquidate, "0");

        const aliceBalanceAfter = await baseToken.balanceOf(aliceAddress);

        // the worker will send 0.221481327933600537 baseToken back to alice
        expect(aliceBalanceAfter.sub(aliceBalanceBefore)).to.be.eq(ethers.utils.parseEther("0.221481327933600537"));
        // there should be no baseToken or farmingToken left in strategy
        expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        // the strategy should send 0.06 farmingToken back to worker
        expect(await farmingToken.balanceOf(mockPancakeswapV2WorkerBaseFTokenPair.address)).to.be.eq(
          ethers.utils.parseEther("0.06")
        );
      });
    });
  });
});
