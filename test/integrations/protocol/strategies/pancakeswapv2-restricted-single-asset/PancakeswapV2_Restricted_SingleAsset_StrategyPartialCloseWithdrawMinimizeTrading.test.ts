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
  PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading,
  PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading__factory,
  WETH,
  WETH__factory,
  WNativeRelayer__factory,
  WNativeRelayer,
} from "../../../../../typechain";
import { MockPancakeswapV2CakeMaxiWorker__factory } from "../../../../../typechain/factories/MockPancakeswapV2CakeMaxiWorker__factory";
import { MockPancakeswapV2CakeMaxiWorker } from "../../../../../typechain/MockPancakeswapV2CakeMaxiWorker";

chai.use(solidity);
const { expect } = chai;

describe("PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading", () => {
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
  let strat: PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading;

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

  let stratAsAlice: PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading;
  let stratAsBob: PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading;

  let mockPancakeswapV2WorkerBaseFTokenPairAsAlice: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2WorkerBNBFtokenPairAsAlice: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2WorkerBaseBNBTokenPairAsAlice: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2EvilWorkerAsAlice: MockPancakeswapV2CakeMaxiWorker;

  let wNativeRelayer: WNativeRelayer;

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

    const PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading",
      deployer
    )) as PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading__factory;
    strat = (await upgrades.deployProxy(PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading, [
      routerV2.address,
      wNativeRelayer.address,
    ])) as PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading;
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

    stratAsAlice = PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading__factory.connect(
      strat.address,
      alice
    );
    stratAsBob = PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading__factory.connect(
      strat.address,
      bob
    );

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
                ["uint256", "uint256", "uint256"],
                [ethers.utils.parseEther("0.02"), "0", ethers.utils.parseEther("0.05")]
              ),
            ]
          )
        )
      ).to.be.revertedWith(
        "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading::onlyWhitelistedWorkers:: bad worker"
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
                ["uint256", "uint256", "uint256"],
                [ethers.utils.parseEther("0.02"), "0", ethers.utils.parseEther("0.05")]
              ),
            ]
          )
        )
      ).to.be.revertedWith(
        "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading::onlyWhitelistedWorkers:: bad worker"
      );
    });
  });

  context("when BTOKEN is a wrap native", async () => {
    context("when liquidated FTOKEN not enough to cover maxReturnDebt", async () => {
      it("should revert", async () => {
        // if 0.1 Ftoken = 1 WBNB
        // x FToken = (x * 0.9975) * (1 / (0.1 + x*0.9975)) = 0.5
        // x = ~ 9.975
        // thus, 0.04 < 9.975 then retrun not enough to pay back debt
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBNBFtokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        await expect(
          mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
            0,
            aliceAddress,
            ethers.utils.parseEther("0.5"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [
                    ethers.utils.parseEther("0.04"),
                    ethers.utils.parseEther("0.5"),
                    ethers.utils.parseEther("0.088861041492620439"),
                  ]
                ),
              ]
            )
          )
        ).to.be.revertedWith("PancakeRouter: EXCESSIVE_INPUT_AMOUNT");
      });
    });

    context("when maxfarmingTokenToLiquidate > FTOKEN from worker", async () => {
      it("should use all FTOKEN", async () => {
        // Alice position: 0.1 FTOKEN
        // Alice liquidate: Math.min(888, 0.1) = 0.1 FTOKEN
        // Debt: 0.1 WBNB
        // maxReturn: 8888, hence Alice return 0.1 BNB (all debt)
        // (x * 0.9975) * (1 / (0.1 + x * 0.9975)) = 0.1 WBNB
        // x = 0.011138958507379561 FTOKEN needed to be swap to 0.1 WBNB to pay debt
        // -------
        // Deployer should get 0.1 BNB back. (Assuming Deployer is Vault)
        // Alice should get 0.1 - 0.011138958507379561 = 0.088861041492620439 FTOKEN back.
        // Worker should get 0.1 - 0.1 = 0 FTOKEN back as Alice liquidate 100% of her position.
        // -------
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBNBFtokenPair.address,
          ethers.utils.parseEther("0.1")
        );

        const aliceFarmingTokenBefore = await farmingToken.balanceOf(aliceAddress);
        const deployerWbnbBefore = await wbnb.balanceOf(deployerAddress);

        await expect(
          mockPancakeswapV2WorkerBNBFtokenPair.work(
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
                    ethers.utils.parseEther("0.5"),
                    ethers.utils.parseEther("0.088861041492620439"),
                  ]
                ),
              ]
            ),
            { gasPrice: 0 }
          )
        )
          .emit(strat, "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTradingEvent")
          .withArgs(wbnb.address, farmingToken.address, ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0.1"));

        const workerFarmingTokenAfter = await farmingToken.balanceOf(mockPancakeswapV2WorkerBNBFtokenPair.address);
        const aliceFarmingTokenAfter = await farmingToken.balanceOf(aliceAddress);
        const deployerWbnbAfter = await wbnb.balanceOf(deployerAddress);

        expect(
          aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore),
          "Alice should get 0.088861041492620439 FTOKEN back"
        ).to.be.eq(ethers.utils.parseEther("0.088861041492620439"));
        expect(deployerWbnbAfter.sub(deployerWbnbBefore), "Deployer (as Vault) should get 0.1 WBNB back").to.be.eq(
          ethers.utils.parseEther("0.1")
        );
        expect(workerFarmingTokenAfter, "Worker should get 0 FTOKEN back").to.be.eq(ethers.utils.parseEther("0"));
      });
    });

    context("when maxReturnDebt > debt", async () => {
      it("should return all debt", async () => {
        // Alice position: 0.1 FTOKEN
        // Alice liquidate: 0.05 FTOKEN
        // Debt: 0.1 WBNB
        // maxReturn: 8888, hence Alice return 0.1 BNB (all debt)
        // (x * 0.9975) * (1 / (0.1 + x * 0.9975)) = 0.1 WBNB
        // x = 0.011138958507379561 FTOKEN needed to be swap to 0.1 WBNB to pay debt
        // -------
        // Alice should get 0.1 BNB back. (Assuming Alice is Vault)
        // Alice should get 0.05 - 0.011138958507379561 = 0.038861041492620439 FTOKEN back.
        // Worker should get 0.1 - 0.05 = 0.05 FTOKEN back.
        // -------
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBNBFtokenPair.address,
          ethers.utils.parseEther("0.1")
        );

        const aliceFarmingTokenBefore = await farmingToken.balanceOf(aliceAddress);
        const deployerWbnbBefore = await wbnb.balanceOf(deployerAddress);

        await expect(
          mockPancakeswapV2WorkerBNBFtokenPair.work(
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
                    ethers.utils.parseEther("0.05"),
                    ethers.utils.parseEther("8888"),
                    ethers.utils.parseEther("0.038861041492620439"),
                  ]
                ),
              ]
            ),
            { gasPrice: "0" }
          )
        )
          .to.emit(strat, "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTradingEvent")
          .withArgs(
            wbnb.address,
            farmingToken.address,
            ethers.utils.parseEther("0.05"),
            ethers.utils.parseEther("0.1")
          );

        const workerFarmingTokenAfter = await farmingToken.balanceOf(mockPancakeswapV2WorkerBNBFtokenPair.address);
        const aliceFarmingTokenAfter = await farmingToken.balanceOf(aliceAddress);
        const deployerWbnbAfter = await wbnb.balanceOf(deployerAddress);

        expect(
          aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore),
          "Alice should get 0.038861041492620439 FTOKEN back"
        ).to.be.eq(ethers.utils.parseEther("0.038861041492620439"));
        expect(deployerWbnbAfter.sub(deployerWbnbBefore), "Deployer (as Vault) should get 0.1 WBNB back").to.be.eq(
          ethers.utils.parseEther("0.1")
        );
        expect(workerFarmingTokenAfter, "Worker should get 0.05 FTOKEN back").to.be.eq(ethers.utils.parseEther("0.05"));
      });
    });

    context("when FTOKEN from swap < slippage", async () => {
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
            aliceAddress,
            ethers.utils.parseEther("0.1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [ethers.utils.parseEther("0.04"), "0", ethers.utils.parseEther("0.088861041492620439").add(1)]
                ),
              ]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading::execute:: insufficient farmingToken amount received"
        );
      });
    });

    context("when debt > 0", async () => {
      it("should convert FTOKEN to WBNB enough for maxReturnDebt, and return farmingToken to the user", async () => {
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBNBFtokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        const aliceWbnbBefore = await wbnb.balanceOf(aliceAddress);
        const aliceFarmingTokenBefore = await farmingToken.balanceOf(aliceAddress);
        await mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
          0,
          aliceAddress,
          ethers.utils.parseEther("0.1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [ethers.utils.parseEther("0.04"), ethers.utils.parseEther("0.01"), "0"]
              ),
            ]
          )
        );
        const aliceWbnbAfter = await wbnb.balanceOf(aliceAddress);
        const aliceFarmingTokenAfter = await farmingToken.balanceOf(aliceAddress);
        // amountOut of 0.04 Ftoken
        // if 0.1 Ftoken = 1 WBNB
        // x FToken = (x * 0.9975 * 1) / (0.1 + x*0.9975) = 0.01
        // x = ~ 0.00101263259157996
        // thus, 0.04 - 0.00101263259157996 = 0.03898736740842004 FToken will be returned to ALICE
        // and the worker will return 0.01 WBNB to ALICE as a repaying debt
        expect(aliceWbnbAfter.sub(aliceWbnbBefore)).to.be.eq(ethers.utils.parseEther("0.01"));
        expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await wbnb.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await farmingToken.balanceOf(mockPancakeswapV2WorkerBNBFtokenPair.address)).to.be.eq(
          ethers.utils.parseEther("0.06")
        );
        expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.be.eq(
          ethers.utils.parseEther("0.038987367408420039")
        );
      });
    });

    context("when debt = 0", async () => {
      it("should return partial farmingToken to the user", async () => {
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBNBFtokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        const aliceWbnbBefore = await wbnb.balanceOf(aliceAddress);
        const aliceFarmingTokenBefore = await farmingToken.balanceOf(aliceAddress);
        await mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
          0,
          aliceAddress,
          ethers.utils.parseEther("0"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [ethers.utils.parseEther("0.04"), "0", "0"]
              ),
            ]
          )
        );
        const aliceWbnbAfter = await wbnb.balanceOf(aliceAddress);
        const aliceFarmingTokenAfter = await farmingToken.balanceOf(aliceAddress);
        // FToken, wbnb in a strategy contract MUST be 0
        expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await wbnb.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await farmingToken.balanceOf(mockPancakeswapV2WorkerBNBFtokenPair.address)).to.be.eq(
          ethers.utils.parseEther("0.06")
        );
        // Alice will have partial farming token of 0.04 FToken back since she got no debt
        expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.be.eq(ethers.utils.parseEther("0.04"));
        expect(aliceWbnbAfter.sub(aliceWbnbBefore)).to.be.eq(ethers.utils.parseEther("0"));
      });
    });
  });

  context("when BTOKEN is NOT a wrap native", async () => {
    context("when liquidated FTOKEN not enough to cover maxReturnDebt", async () => {
      it("should revert", async () => {
        // if 0.1 Ftoken = 1 WBNB
        // x FToken = (x * 0.9975) * (1 / (0.1 + x*0.9975)) = 0.2
        // x = ~ 0.02506265664160401
        // thus, 0.02 < 0.02506265664160401 then retrun not enough to pay back debt
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBaseFTokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        await expect(
          mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
            0,
            aliceAddress,
            ethers.utils.parseEther("0.2"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [
                    ethers.utils.parseEther("0.02"),
                    ethers.utils.parseEther("0.2"),
                    ethers.utils.parseEther("0.088861041492620439").add(1),
                  ]
                ),
              ]
            )
          )
        ).to.be.revertedWith("PancakeRouter: EXCESSIVE_INPUT_AMOUNT");
      });
    });

    context("when maxFarmingTokenToLiquidate > FTOKEN from worker", async () => {
      it("should use all FTOKEN", async () => {
        // Alice position: 0.1 FTOKEN
        // Alice liquidate: Math.min(8888, 0.1) = 0.1 FTOKEN
        // Debt: 0.1 BTOKEN
        // maxReturn: 8888, hence Alice return 0.1 BTOKEN (all debt)
        // (x * 0.9975) * (1 / (1 + x * 0.9975)) = 0.1 BTOKEN
        // x = 0.11138958507379568 WBNB needed to be swap to 0.1 BTOKEN to pay debt
        // (y * 0.9975) * (1 / (1 + y * 0.9975)) = 0.11138958507379568 WBNB
        // y = 0.012566672086044004 FTOKEN needed to be swapped to 0.11138958507379568 WBNB
        // -------
        // Deployer should get 0.1 BTOKEN back. (Assuming Deployer is Vault)
        // Alice should get 0.1 - 0.012566672086044004 = 0.087433327913955996 FTOKEN back.
        // Worker should get 0.1 - 0.1 = 0 FTOKEN back as Alice uses 100% of her position.
        // -------
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBaseFTokenPair.address,
          ethers.utils.parseEther("0.1")
        );

        const aliceFarmingTokenBefore = await farmingToken.balanceOf(aliceAddress);
        const deployerBtokenBefore = await baseToken.balanceOf(deployerAddress);

        await expect(
          mockPancakeswapV2WorkerBaseFTokenPair.work(
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
                    ethers.utils.parseEther("8888"),
                    ethers.utils.parseEther("8888"),
                    ethers.utils.parseEther("0.087433327913955996"),
                  ]
                ),
              ]
            ),
            { gasPrice: "0" }
          )
        )
          .to.emit(strat, "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTradingEvent")
          .withArgs(
            baseToken.address,
            farmingToken.address,
            ethers.utils.parseEther("0.1"),
            ethers.utils.parseEther("0.1")
          );

        const workerFarmingTokenAfter = await farmingToken.balanceOf(mockPancakeswapV2WorkerBaseFTokenPair.address);
        const aliceFarmingTokenAfter = await farmingToken.balanceOf(aliceAddress);
        const deployerBtokenAfter = await baseToken.balanceOf(deployerAddress);

        expect(
          aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore),
          "Alice should get 0.087433327913955996 FTOKEN back"
        ).to.be.eq(ethers.utils.parseEther("0.087433327913955996"));
        expect(
          deployerBtokenAfter.sub(deployerBtokenBefore),
          "Deployer (as Vault) should get 0.1 BTOKEN back"
        ).to.be.eq(ethers.utils.parseEther("0.1"));
        expect(workerFarmingTokenAfter, "Worker should get 0.05 FTOKEN back").to.be.eq(ethers.utils.parseEther("0"));
      });
    });

    context("when maxReturnDebt > debt", async () => {
      it("should return all debt", async () => {
        // Alice position: 0.1 FTOKEN
        // Alice liquidate: 0.05 FTOKEN
        // Debt: 0.1 BTOKEN
        // maxReturn: 8888, hence Alice return 0.1 BTOKEN (all debt)
        // (x * 0.9975) * (1 / (1 + x * 0.9975)) = 0.1 BTOKEN
        // x = 0.11138958507379568 WBNB needed to be swap to 0.1 BTOKEN to pay debt
        // (y * 0.9975) * (1 / (1 + y * 0.9975)) = 0.11138958507379568 WBNB
        // y = 0.012566672086044004 FTOKEN needed to be swapped to 0.11138958507379568 WBNB
        // -------
        // Deployer should get 0.1 BTOKEN back. (Assuming Deployer is Vault)
        // Alice should get 0.05 - 0.012566672086044004 = 0.037433327913955996 FTOKEN back.
        // Worker should get 0.1 - 0.05 = 0.05 FTOKEN back.
        // -------
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBaseFTokenPair.address,
          ethers.utils.parseEther("0.1")
        );

        const aliceFarmingTokenBefore = await farmingToken.balanceOf(aliceAddress);
        const deployerBtokenBefore = await baseToken.balanceOf(deployerAddress);

        await expect(
          mockPancakeswapV2WorkerBaseFTokenPair.work(
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
                    ethers.utils.parseEther("0.05"),
                    ethers.utils.parseEther("8888"),
                    ethers.utils.parseEther("0.037433327913955996"),
                  ]
                ),
              ]
            ),
            { gasPrice: "0" }
          )
        )
          .to.emit(strat, "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTradingEvent")
          .withArgs(
            baseToken.address,
            farmingToken.address,
            ethers.utils.parseEther("0.05"),
            ethers.utils.parseEther("0.1")
          );

        const workerFarmingTokenAfter = await farmingToken.balanceOf(mockPancakeswapV2WorkerBaseFTokenPair.address);
        const aliceFarmingTokenAfter = await farmingToken.balanceOf(aliceAddress);
        const deployerBtokenAfter = await baseToken.balanceOf(deployerAddress);

        expect(
          aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore),
          "Alice should get 0.037433327913955996 FTOKEN back"
        ).to.be.eq(ethers.utils.parseEther("0.037433327913955996"));
        expect(
          deployerBtokenAfter.sub(deployerBtokenBefore),
          "Deployer (as Vault) should get 0.1 BTOKEN back"
        ).to.be.eq(ethers.utils.parseEther("0.1"));
        expect(workerFarmingTokenAfter, "Worker should get 0.05 FTOKEN back").to.be.eq(ethers.utils.parseEther("0.05"));
      });
    });

    context("when FTOKEN from swap < slippage", async () => {
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
            aliceAddress,
            ethers.utils.parseEther("0.1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [
                    ethers.utils.parseEther("0.04"),
                    ethers.utils.parseEther("0.1"),
                    ethers.utils.parseEther("0.087433327913955996").add(1),
                  ]
                ),
              ]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading::execute:: insufficient farmingToken amount received"
        );
      });
    });

    context("when debt > 0", async () => {
      it("should convert to BTOKEN to be enough for repaying the debt, and return farmingToken to the user", async () => {
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBaseFTokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        const aliceBaseTokenBefore = await baseToken.balanceOf(aliceAddress);
        const aliceFarmingTokenBefore = await farmingToken.balanceOf(aliceAddress);
        await mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
          0,
          aliceAddress,
          ethers.utils.parseEther("0.1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [ethers.utils.parseEther("0.05"), ethers.utils.parseEther("0.1"), "0"]
              ),
            ]
          )
        );
        const aliceBaseTokenAfter = await baseToken.balanceOf(aliceAddress);
        const aliceFarmingTokenAfter = await farmingToken.balanceOf(aliceAddress);
        // if 1 WBNB = 1 BTOKEN
        // x WBNB = (x * 0.9975 * 1) / (1 + x * 0.9975) = 0.1
        // x WBNB =~ ~ 0.11138958507379568

        // if 0.1 FToken = 1 WBNB
        // x FToken =  (x * 0.9975 * 1) / (0.1 + x * 0.9975) = 0.11138958507379568
        // x = 0.012566672086044004
        // thus 0.05 - 0.012566672086044004 = 0.037433327913955996 FToken will be returned to ALICE
        // Alice will have 0.037433327913955996 FTOKEN back and 0.1 BTOKEN as a repaying debt
        expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.be.eq(ethers.utils.parseEther("0.1"));
        expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await farmingToken.balanceOf(mockPancakeswapV2WorkerBaseFTokenPair.address)).to.be.eq(
          ethers.utils.parseEther("0.05")
        );
        expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.be.eq(
          ethers.utils.parseEther("0.037433327913955996")
        );
      });
    });

    context("when debt = 0", async () => {
      it("should return partial farmingToken to the user", async () => {
        await farmingTokenAsAlice.transfer(
          mockPancakeswapV2WorkerBaseFTokenPair.address,
          ethers.utils.parseEther("0.1")
        );
        const aliceBaseTokenBefore = await baseToken.balanceOf(aliceAddress);
        const aliceFarmingTokenBefore = await farmingToken.balanceOf(aliceAddress);
        await mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
          0,
          aliceAddress,
          ethers.utils.parseEther("0"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [ethers.utils.parseEther("0.04"), "0", "0"]
              ),
            ]
          )
        );
        const aliceBaseTokenAfter = await baseToken.balanceOf(aliceAddress);
        const aliceFarmingTokenAfter = await farmingToken.balanceOf(aliceAddress);
        // FToken, BToken in a strategy contract MUST be 0
        expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await farmingToken.balanceOf(mockPancakeswapV2WorkerBaseFTokenPair.address)).to.be.eq(
          ethers.utils.parseEther("0.06")
        );
        // Alice will have partial farming token of 0.04 FToken back since she got no debt
        expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.be.eq(ethers.utils.parseEther("0"));
        expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.be.eq(ethers.utils.parseEther("0.04"));
      });
    });
  });

  context("when the farming token is a wrap native", async () => {
    context("when liquidated WBNB not enough to cover maxReturnDebt", async () => {
      it("should revert", async () => {
        // if 0.1 Ftoken = 1 WBNB
        // x FToken = (x * 0.9975) * (1 / (0.1 + x*0.9975)) = 0.5
        // x = ~ 9.975
        // thus, 0.04 < 9.975 then retrun not enough to pay back debt
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2WorkerBaseBNBTokenPair.address, ethers.utils.parseEther("1"));
        await expect(
          mockPancakeswapV2WorkerBaseBNBTokenPairAsAlice.work(
            0,
            aliceAddress,
            ethers.utils.parseEther("0.5"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [
                    ethers.utils.parseEther("0.04"),
                    ethers.utils.parseEther("0.5"),
                    ethers.utils.parseEther("0.088861041492620439"),
                  ]
                ),
              ]
            )
          )
        ).to.be.revertedWith("PancakeRouter: EXCESSIVE_INPUT_AMOUNT");
      });
    });

    context("when maxFarmingTokenToLiquidate > WBNB from worker", async () => {
      it("should use all WBNB", async () => {
        // Alice position: 1 WBNB
        // Alice liquidate: Math.min(8888, 1) = 1 WBNB
        // Debt: 0.1 BTOKEN
        // maxReturn: 8888, hence Alice return 0.1 BTOKEN (all debt)
        // (x * 9975 * 1) / (1 * 1000 + (x * 9975)) = 0.1 BTOKEN
        // x = 0.111389585073795601 WBNB needed to be swap to 0.1 BTOKEN to pay debt
        // -------
        // Deployer should get 0.1 BTOKEN back. (Assuming Deployer is Vault)
        // Alice should get 1 - 0.111389585073795601 = 0.888610414926204399 BNB back.
        // Worker should get 1 - 1 = 0 WBNB back.
        // -------
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2WorkerBaseBNBTokenPair.address, ethers.utils.parseEther("1"));

        const aliceBnbBefore = await alice.getBalance();
        const deployerBtokenBefore = await baseToken.balanceOf(deployerAddress);

        await expect(
          mockPancakeswapV2WorkerBaseBNBTokenPair.work(
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
                    ethers.utils.parseEther("8888"),
                    ethers.utils.parseEther("8888"),
                    ethers.utils.parseEther("0.888610414926204399"),
                  ]
                ),
              ]
            ),
            { gasPrice: "0" }
          )
        )
          .to.emit(strat, "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTradingEvent")
          .withArgs(baseToken.address, wbnb.address, ethers.utils.parseEther("1"), ethers.utils.parseEther("0.1"));

        const workerWbnbAfter = await wbnb.balanceOf(mockPancakeswapV2WorkerBaseBNBTokenPair.address);
        const aliceBnbAfter = await alice.getBalance();
        const deployerBtokenAfter = await baseToken.balanceOf(deployerAddress);

        expect(aliceBnbAfter.sub(aliceBnbBefore), "Alice should get 0.888610414926204399 BNB back").to.be.eq(
          ethers.utils.parseEther("0.888610414926204399")
        );
        expect(
          deployerBtokenAfter.sub(deployerBtokenBefore),
          "Deployer (as Vault) should get 0.1 BTOKEN back"
        ).to.be.eq(ethers.utils.parseEther("0.1"));
        expect(workerWbnbAfter, "Worker should get 0 WBNB back").to.be.eq(ethers.utils.parseEther("0"));
      });
    });

    context("when maxReturnDebt > debt", async () => {
      it("should return all debt", async () => {
        // Alice position: 1 WBNB
        // Alice liquidate: 0.5 WBNB
        // Debt: 0.1 BTOKEN
        // maxReturn: 8888, hence Alice return 0.1 BTOKEN (all debt)
        // (x * 9975 * 1) / (1 * 1000 + (x * 9975)) = 0.1 BTOKEN
        // x = 0.111389585073795601 WBNB needed to be swap to 0.1 BTOKEN to pay debt
        // -------
        // Deployer should get 0.1 BTOKEN back. (Assuming Deployer is Vault)
        // Alice should get 0.5 - 0.111389585073795601 = 0.388610414926204399 BNB back.
        // Worker should get 1 - 0.5 = 0.5 WBNB back.
        // -------
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2WorkerBaseBNBTokenPair.address, ethers.utils.parseEther("1"));

        const aliceBnbBefore = await alice.getBalance();
        const deployerBtokenBefore = await baseToken.balanceOf(deployerAddress);

        await expect(
          mockPancakeswapV2WorkerBaseBNBTokenPair.work(
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
                    ethers.utils.parseEther("0.5"),
                    ethers.utils.parseEther("8888"),
                    ethers.utils.parseEther("0.038861041492620439"),
                  ]
                ),
              ]
            ),
            { gasPrice: "0" }
          )
        )
          .to.emit(strat, "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTradingEvent")
          .withArgs(baseToken.address, wbnb.address, ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.1"));

        const workerWbnbAfter = await wbnb.balanceOf(mockPancakeswapV2WorkerBaseBNBTokenPair.address);
        const aliceBnbAfter = await alice.getBalance();
        const deployerBtokenAfter = await baseToken.balanceOf(deployerAddress);

        expect(aliceBnbAfter.sub(aliceBnbBefore), "Alice should get 0.388610414926204399 BNB back").to.be.eq(
          ethers.utils.parseEther("0.388610414926204399")
        );
        expect(
          deployerBtokenAfter.sub(deployerBtokenBefore),
          "Deployer (as Vault) should get 0.1 BTOKEN back"
        ).to.be.eq(ethers.utils.parseEther("0.1"));
        expect(workerWbnbAfter, "Worker should get 0.5 WBNB back").to.be.eq(ethers.utils.parseEther("0.5"));
      });
    });

    context("when FTOKEN from swap < slippage", async () => {
      it("should revert", async () => {
        // if 1 BNB = 1 BaseToken
        // x BNB = (x * 0.9975) * (1 / (1 + x * 0.9975)) = 0.1
        // x = ~ 0.11138958507379568
        // thus, the return farming token will be 0.888610414926204399
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2WorkerBaseBNBTokenPair.address, ethers.utils.parseEther("1"));
        await expect(
          mockPancakeswapV2WorkerBaseBNBTokenPairAsAlice.work(
            0,
            aliceAddress,
            ethers.utils.parseEther("0.1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  ["0", "0", ethers.utils.parseEther("0.888610414926204399").add(1)]
                ),
              ]
            )
          )
        ).to.be.revertedWith(
          "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading::execute:: insufficient farmingToken amount received"
        );
      });
    });

    context("when debt > 0", async () => {
      it("should convert to WBNB to be enough for repaying the debt, and return farmingToken to the user", async () => {
        // mock farming token (WBNB)
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2WorkerBaseBNBTokenPair.address, ethers.utils.parseEther("1"));
        const aliceBaseTokenBefore = await baseToken.balanceOf(aliceAddress);
        const aliceNativeFarmingTokenBefore = await ethers.provider.getBalance(aliceAddress);
        await mockPancakeswapV2WorkerBaseBNBTokenPairAsAlice.work(
          0,
          aliceAddress,
          ethers.utils.parseEther("0.1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [ethers.utils.parseEther("0.4"), ethers.utils.parseEther("0.1"), "0"]
              ),
            ]
          ),
          {
            gasPrice: 0,
          }
        );
        // if 1 BNB = 1 BaseToken
        // x BNB = (x * 0.9975 * 1) / (1 + x * 0.9975) = 0.1 baseToken
        // x = ~ 0.11138958507379568 BNB
        // thus, alice will receive 0.4 - 0.11138958507379568 =  0.288610414926204399 BNB as a return farming token and 0.1 BaseToken for repaying the debt
        const aliceBaseTokenAfter = await baseToken.balanceOf(aliceAddress);
        const aliceNativeFarmingTokenAfter = await ethers.provider.getBalance(aliceAddress);
        expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.eq(ethers.utils.parseEther("0.1"));
        expect(aliceNativeFarmingTokenAfter.sub(aliceNativeFarmingTokenBefore)).to.eq(
          ethers.utils.parseEther("0.288610414926204399")
        );
        expect(await wbnb.balanceOf(mockPancakeswapV2WorkerBaseBNBTokenPair.address)).to.be.eq(
          ethers.utils.parseEther("0.6")
        );
        expect(await wbnb.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      });
    });

    context("when debt = 0", async () => {
      it("should return all farmingToken to the user", async () => {
        // mock farming token (WBNB)
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2WorkerBaseBNBTokenPair.address, ethers.utils.parseEther("1"));
        const aliceBaseTokenBefore = await baseToken.balanceOf(aliceAddress);
        const aliceNativeFarmingTokenBefore = await ethers.provider.getBalance(aliceAddress);
        await mockPancakeswapV2WorkerBaseBNBTokenPairAsAlice.work(
          0,
          aliceAddress,
          ethers.utils.parseEther("0"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [ethers.utils.parseEther("0.1"), ethers.utils.parseEther("0"), ethers.utils.parseEther("0")]
              ),
            ]
          ),
          {
            gasPrice: 0,
          }
        );
        const aliceBaseTokenAfter = await baseToken.balanceOf(aliceAddress);
        const aliceNativeFarmingTokenAfter = await ethers.provider.getBalance(aliceAddress);
        // Alice will have partial farming token of 0.1 BNB (as a native farming token) back since she got no debt
        expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.eq(ethers.utils.parseEther("0"));
        expect(aliceNativeFarmingTokenAfter.sub(aliceNativeFarmingTokenBefore)).to.eq(ethers.utils.parseEther("0.1"));
        // wbnb, BToken in a strategy contract MUST be 0
        expect(await wbnb.balanceOf(mockPancakeswapV2WorkerBaseBNBTokenPair.address)).to.be.eq(
          ethers.utils.parseEther("0.9")
        );
        expect(await wbnb.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      });
    });
  });
});
