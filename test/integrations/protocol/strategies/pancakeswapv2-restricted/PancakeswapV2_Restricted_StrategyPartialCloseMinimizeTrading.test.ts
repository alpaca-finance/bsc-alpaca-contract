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
  PancakePair,
  PancakePair__factory,
  PancakeRouterV2__factory,
  PancakeRouterV2,
  WETH,
  WETH__factory,
  WNativeRelayer__factory,
  PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading,
  PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading__factory,
} from "../../../../../typechain";
import { MockPancakeswapV2Worker__factory } from "../../../../../typechain/factories/MockPancakeswapV2Worker__factory";
import { MockPancakeswapV2Worker } from "../../../../../typechain/MockPancakeswapV2Worker";
import * as TestHelpers from "../../../../helpers/assert";

chai.use(solidity);
const { expect } = chai;

describe("PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading", () => {
  const FOREVER = "2000000000";

  /// Pancakeswap-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouterV2;
  let lpV2: PancakePair;
  let baseTokenWbnbLpV2: PancakePair;

  /// MockPancakeswapV2Worker-related instance(s)
  let mockPancakeswapV2Worker: MockPancakeswapV2Worker;
  let mockPancakeswapV2EvilWorker: MockPancakeswapV2Worker;
  let mockPancakeswapBaseTokenWbnbV2Worker: MockPancakeswapV2Worker;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let strat: PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading;

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
  let baseTokenWbnbLpV2AsBob: PancakePair;

  let lpAsAlice: PancakePair;
  let lpAsBob: PancakePair;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerV2AsAlice: PancakeRouterV2;
  let routerV2AsBob: PancakeRouterV2;

  let stratAsAlice: PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading;
  let stratAsBob: PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading;

  let mockPancakeswapV2WorkerAsBob: MockPancakeswapV2Worker;
  let mockPancakeswapV2EvilWorkerAsBob: MockPancakeswapV2Worker;
  let mockPancakeswapBaseTokenWbnbV2WorkerAsBob: MockPancakeswapV2Worker;

  let wbnbAsAlice: WETH;
  let wbnbAsBob: WETH;

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
    await baseToken.mint(aliceAddress, ethers.utils.parseEther("2"));
    await baseToken.mint(bobAddress, ethers.utils.parseEther("2"));
    farmingToken = (await upgrades.deployProxy(MockERC20, ["FTOKEN", "FTOKEN", 18])) as MockERC20;
    await farmingToken.deployed();
    await farmingToken.mint(aliceAddress, ethers.utils.parseEther("40"));
    await farmingToken.mint(bobAddress, ethers.utils.parseEther("40"));

    await factoryV2.createPair(baseToken.address, farmingToken.address);
    await factoryV2.createPair(baseToken.address, wbnb.address);

    lpV2 = PancakePair__factory.connect(await factoryV2.getPair(farmingToken.address, baseToken.address), deployer);
    baseTokenWbnbLpV2 = PancakePair__factory.connect(
      await factoryV2.getPair(wbnb.address, baseToken.address),
      deployer
    );

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
    mockPancakeswapBaseTokenWbnbV2Worker = (await MockPancakeswapV2Worker.deploy(
      baseTokenWbnbLpV2.address,
      baseToken.address,
      wbnb.address
    )) as MockPancakeswapV2Worker;
    await mockPancakeswapBaseTokenWbnbV2Worker.deployed();

    /// Setup WNativeRelayer
    const WNativeRelayer = (await ethers.getContractFactory("WNativeRelayer", deployer)) as WNativeRelayer__factory;
    const wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
    await wNativeRelayer.deployed();

    const PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading",
      deployer
    )) as PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading__factory;
    strat = (await upgrades.deployProxy(PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading, [
      routerV2.address,
      wbnb.address,
      wNativeRelayer.address,
    ])) as PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading;
    await strat.deployed();
    await strat.setWorkersOk([mockPancakeswapV2Worker.address, mockPancakeswapBaseTokenWbnbV2Worker.address], true);
    await wNativeRelayer.setCallerOk([strat.address], true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);
    baseTokenWbnbLpV2AsBob = PancakePair__factory.connect(baseTokenWbnbLpV2.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerV2AsAlice = PancakeRouterV2__factory.connect(routerV2.address, alice);
    routerV2AsBob = PancakeRouterV2__factory.connect(routerV2.address, bob);

    lpAsAlice = PancakePair__factory.connect(lpV2.address, alice);
    lpAsBob = PancakePair__factory.connect(lpV2.address, bob);

    stratAsAlice = PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading__factory.connect(strat.address, alice);
    stratAsBob = PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading__factory.connect(strat.address, bob);

    mockPancakeswapV2WorkerAsBob = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker.address, bob);
    mockPancakeswapV2EvilWorkerAsBob = MockPancakeswapV2Worker__factory.connect(
      mockPancakeswapV2EvilWorker.address,
      bob
    );
    mockPancakeswapBaseTokenWbnbV2WorkerAsBob = MockPancakeswapV2Worker__factory.connect(
      mockPancakeswapBaseTokenWbnbV2Worker.address,
      bob
    );

    wbnbAsAlice = WETH__factory.connect(wbnb.address, alice);
    wbnbAsBob = WETH__factory.connect(wbnb.address, bob);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("when the setOkWorkers caller is not an owner", async () => {
    it("should be reverted", async () => {
      await expect(stratAsBob.setWorkersOk([mockPancakeswapV2EvilWorkerAsBob.address], true)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
  });

  context("when non-worker call the strat", async () => {
    it("should revert", async () => {
      await expect(
        stratAsBob.execute(
          bobAddress,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["uint256", "uint256", "uint256"],
            [ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.5")]
          )
        )
      ).to.revertedWith(
        "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading::onlyWhitelistedWorkers:: bad worker"
      );
    });
  });

  context("when caller worker hasn't been whitelisted", async () => {
    it("should revert as bad worker", async () => {
      await expect(
        mockPancakeswapV2EvilWorkerAsBob.work(
          0,
          bobAddress,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.5")]
              ),
            ]
          )
        )
      ).to.revertedWith(
        "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading::onlyWhitelistedWorkers:: bad worker"
      );
    });
  });

  context("when revoking whitelist workers", async () => {
    it("should revert as bad worker", async () => {
      await strat.setWorkersOk([mockPancakeswapV2Worker.address], false);
      await expect(
        mockPancakeswapV2WorkerAsBob.work(
          0,
          bobAddress,
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256", "uint256"],
                [ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.5")]
              ),
            ]
          )
        )
      ).to.revertedWith(
        "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading::onlyWhitelistedWorkers:: bad worker"
      );
    });
  });

  context("when bad calldata", async () => {
    it("should revert", async () => {
      await expect(mockPancakeswapV2WorkerAsBob.work(0, bobAddress, "0", "0x1234")).to.reverted;
    });
  });

  context("when farming token is NOT WBNB", async () => {
    beforeEach(async () => {
      // Alice adds 40 FTOKEN + 2 BaseToken
      await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("2"));
      await farmingTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("40"));
      await routerV2AsAlice.addLiquidity(
        baseToken.address,
        farmingToken.address,
        ethers.utils.parseEther("2"),
        ethers.utils.parseEther("40"),
        "0",
        "0",
        aliceAddress,
        FOREVER
      );

      // Bob adds 40 FTOKEN + 2 BaseToken
      await baseTokenAsBob.approve(routerV2.address, ethers.utils.parseEther("2"));
      await farmingTokenAsBob.approve(routerV2.address, ethers.utils.parseEther("40"));
      await routerV2AsBob.addLiquidity(
        baseToken.address,
        farmingToken.address,
        ethers.utils.parseEther("2"),
        ethers.utils.parseEther("40"),
        "0",
        "0",
        bobAddress,
        FOREVER
      );

      await lpAsBob.transfer(strat.address, ethers.utils.parseEther("8.944271909999158785"));
    });

    context("when maxLpTokenToLiquidate > LP from worker", async () => {
      it("should use all LP", async () => {
        // debt: 1 BTOKEN
        // LP token to liquidate:
        // Math.min(888, 8.944271909999158785) = 8.944271909999158785 LP (40 FTOKEN + 2 BTOKEN)
        // maxReturnDebt: 888 base token
        const bobBaseTokenBefore = await baseToken.balanceOf(bobAddress);
        const bobFTOKENBefore = await farmingToken.balanceOf(bobAddress);

        await expect(
          mockPancakeswapV2WorkerAsBob.work(
            0,
            bobAddress,
            ethers.utils.parseEther("1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [ethers.utils.parseEther("888"), ethers.utils.parseEther("888"), ethers.utils.parseEther("40")]
                ),
              ]
            )
          )
        )
          .to.emit(strat, "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTradingEvent")
          .withArgs(
            baseToken.address,
            farmingToken.address,
            ethers.utils.parseEther("8.944271909999158785"),
            ethers.utils.parseEther("1")
          );

        const bobBaseTokenAfter = await baseToken.balanceOf(bobAddress);
        const bobFTOKENAfter = await farmingToken.balanceOf(bobAddress);

        expect(await lpV2.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await lpV2.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
        expect(bobBaseTokenAfter.sub(bobBaseTokenBefore), "Bob (as Vault) should get 2 BTOKEN back").to.be.eq(
          ethers.utils.parseEther("2")
        );
        expect(bobFTOKENAfter.sub(bobFTOKENBefore), "Bob should get 40 FTOKEN back").to.be.eq(
          ethers.utils.parseEther("40")
        );
      });
    });

    context("when maxReturnDebt > debt", async () => {
      it("should return all debt", async () => {
        // debt: 1 BTOKEN
        // LP token to liquidate: 4.472135954999579392 LP (20 FTOKEN + 1 BTOKEN)
        // maxReturnDebt: 888 base token
        const bobBaseTokenBefore = await baseToken.balanceOf(bobAddress);
        const bobFTOKENBefore = await farmingToken.balanceOf(bobAddress);

        await expect(
          mockPancakeswapV2WorkerAsBob.work(
            0,
            bobAddress,
            ethers.utils.parseEther("1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [
                    ethers.utils.parseEther("4.472135954999579393"),
                    ethers.utils.parseEther("888"),
                    ethers.utils.parseEther("19.2"),
                  ]
                ),
              ]
            )
          )
        )
          .to.emit(strat, "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTradingEvent")
          .withArgs(
            baseToken.address,
            farmingToken.address,
            ethers.utils.parseEther("4.472135954999579393"),
            ethers.utils.parseEther("1")
          );

        // remove liquidity 50%: 4.472135954999579393 LP token (20 FTOKEN + 1 BTOKEN)
        // no trade
        const bobBaseTokenAfter = await baseToken.balanceOf(bobAddress);
        const bobFTOKENAfter = await farmingToken.balanceOf(bobAddress);
        expect(await lpV2.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await lpV2.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
        expect(bobBaseTokenAfter.sub(bobBaseTokenBefore), "Bob (as Vault) should get 1 BTOKEN back").to.be.eq(
          ethers.utils.parseEther("1")
        );
        expect(bobFTOKENAfter.sub(bobFTOKENBefore), "Bob should get 20.000000000000000002 FTOKEN back").to.be.eq(
          ethers.utils.parseEther("20.000000000000000002")
        );
      });
    });

    context("when no trade (maxReturnDebt <= received BTOKEN from LP token)", async () => {
      context("when farming tokens received < slippage", async () => {
        it("should revert", async () => {
          // LP token to liquidate: 4.472135954999579392 Lp token (20 farming token + 1 base token)
          // maxReturnDebt: 0.8 base token
          await expect(
            mockPancakeswapV2WorkerAsBob.work(
              0,
              bobAddress,
              ethers.utils.parseEther("2"),
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ["uint256", "uint256", "uint256"],
                    [
                      ethers.utils.parseEther("4.472135954999579393"),
                      ethers.utils.parseEther("0.8"),
                      ethers.utils.parseEther("25"),
                    ]
                  ),
                ]
              )
            )
          ).to.revertedWith(
            "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received"
          );
        });
      });

      context("when farming tokens received >= slippage", async () => {
        it("should success", async () => {
          // LP token to liquidate: 4.472135954999579392 Lp token (20 farming token + 1 base token)
          // maxReturnDebt: 0.8 base token
          const bobBaseTokenBefore = await baseToken.balanceOf(bobAddress);
          const bobFTOKENBefore = await farmingToken.balanceOf(bobAddress);

          await expect(
            mockPancakeswapV2WorkerAsBob.work(
              0,
              bobAddress,
              ethers.utils.parseEther("2"),
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ["uint256", "uint256", "uint256"],
                    [
                      ethers.utils.parseEther("4.472135954999579393"),
                      ethers.utils.parseEther("0.8"),
                      ethers.utils.parseEther("19.2"),
                    ]
                  ),
                ]
              )
            )
          )
            .to.emit(strat, "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTradingEvent")
            .withArgs(
              baseToken.address,
              farmingToken.address,
              ethers.utils.parseEther("4.472135954999579393"),
              ethers.utils.parseEther("0.8")
            );

          // remove liquidity 50%: 4.472135954999579393 LP token (20 farming token + 1 base token)
          // no trade
          const bobBaseTokenAfter = await baseToken.balanceOf(bobAddress);
          const bobFTOKENAfter = await farmingToken.balanceOf(bobAddress);
          expect(await lpV2.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
          expect(await lpV2.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther("1").toString(),
            bobBaseTokenAfter.sub(bobBaseTokenBefore).toString()
          );
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther("20").toString(),
            bobFTOKENAfter.sub(bobFTOKENBefore).toString()
          );
        });
      });
    });

    context("when some trade (maxReturnDebt > received BTOKEN from LP)", async () => {
      context(
        "when FTOKEN not enough to cover maxReturnDebt (maxReturnDebt > (BtokenFromLp + BtokenFromSellFtoken))",
        async () => {
          // LP token to liquidate: 0.894427190999915878 Lp token (4 FTOKEN + 0.2 BTOKEN) ~ 0.4 BTOKEN
          // maxReturnDebt: 0.5 BTOKEN
          it("should revert", async () => {
            await expect(
              mockPancakeswapV2WorkerAsBob.work(
                0,
                bobAddress,
                ethers.utils.parseEther("2"),
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [
                    strat.address,
                    ethers.utils.defaultAbiCoder.encode(
                      ["uint256", "uint256", "uint256"],
                      [
                        ethers.utils.parseEther("0.894427190999915878"),
                        ethers.utils.parseEther("0.5"),
                        ethers.utils.parseEther("0"),
                      ]
                    ),
                  ]
                )
              )
            ).to.revertedWith("PancakeRouter: EXCESSIVE_INPUT_AMOUNT");
          });
        }
      );

      context("when farming tokens received < slippage", async () => {
        // LP token to liquidate: 0.894427190999915878 Lp token (4 farming token + 0.2 base token)
        // maxReturnDebt: 0.24 base token
        it("should revert", async () => {
          await expect(
            mockPancakeswapV2WorkerAsBob.work(
              0,
              bobAddress,
              ethers.utils.parseEther("2"),
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ["uint256", "uint256", "uint256"],
                    [
                      ethers.utils.parseEther("0.894427190999915878"),
                      ethers.utils.parseEther("0.24"),
                      ethers.utils.parseEther("3.2"),
                    ]
                  ),
                ]
              )
            )
          ).to.revertedWith(
            "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received"
          );
        });
      });

      context("when farming tokens received >= slippage", async () => {
        // LP token to liquidate: 0.894427190999915878 Lp token (4 FTOKEN + 0.2 BTOKEN)
        // maxReturnDebt: 0.24 BTOKEN
        it("should be successfully", async () => {
          const bobBaseTokenBefore = await baseToken.balanceOf(bobAddress);
          const bobFTOKENBefore = await farmingToken.balanceOf(bobAddress);

          await expect(
            mockPancakeswapV2WorkerAsBob.work(
              0,
              bobAddress,
              ethers.utils.parseEther("2"),
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ["uint256", "uint256", "uint256"],
                    [
                      ethers.utils.parseEther("0.894427190999915878"),
                      ethers.utils.parseEther("0.24"),
                      ethers.utils.parseEther("3.168"),
                    ]
                  ),
                ]
              )
            )
          )
            .to.emit(strat, "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTradingEvent")
            .withArgs(
              baseToken.address,
              farmingToken.address,
              ethers.utils.parseEther("0.894427190999915878"),
              ethers.utils.parseEther("0.24")
            );

          // remove liquidity 10%: 0.894427190999915878 LP token (4 farming token + 0.2 base token)
          // trade
          // exactIn = (exactOut * reserveIn * 10000) / (tradingFee * (reserveOut - exactOut))
          // exactIn = (0.04 * 76 * 10000) / (9975 * (3.8 - 0.04))
          // exactIn = 0.810536980749747
          // remainingFarmingToken = 4 - 0.810536980749747 = 3.189463019250253
          const bobBaseTokenAfter = await baseToken.balanceOf(bobAddress);
          const bobFTOKENAfter = await farmingToken.balanceOf(bobAddress);
          expect(await lpV2.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
          expect(await lpV2.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.24").toString(),
            bobBaseTokenAfter.sub(bobBaseTokenBefore).toString()
          );
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther("3.189463019250253").toString(),
            bobFTOKENAfter.sub(bobFTOKENBefore).toString()
          );
        });
      });
    });
  });

  context("when the farming token is WBNB", () => {
    beforeEach(async () => {
      // Alice wrap BNB
      await wbnbAsAlice.deposit({ value: ethers.utils.parseEther("0.1") });
      // Alice adds 0.1 WBNB + 1 BaseToken
      await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("1"));
      await wbnbAsAlice.approve(routerV2.address, ethers.utils.parseEther("0.1"));
      await routerV2AsAlice.addLiquidity(
        baseToken.address,
        wbnb.address,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("0.1"),
        "0",
        "0",
        aliceAddress,
        FOREVER
      );

      // Bob wrap BNB
      await wbnbAsBob.deposit({ value: ethers.utils.parseEther("1") });
      // Bob tries to add 1 WBNB + 1 BaseToken (but obviously can only add 0.1 WBNB)
      await baseTokenAsBob.approve(routerV2.address, ethers.utils.parseEther("1"));
      await wbnbAsBob.approve(routerV2.address, ethers.utils.parseEther("1"));
      await routerV2AsBob.addLiquidity(
        baseToken.address,
        wbnb.address,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1"),
        "0",
        "0",
        bobAddress,
        FOREVER
      );
      expect(await wbnb.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0.9"));
      expect(await baseTokenWbnbLpV2.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0.316227766016837933"));
      await baseTokenWbnbLpV2AsBob.transfer(
        mockPancakeswapBaseTokenWbnbV2Worker.address,
        ethers.utils.parseEther("0.316227766016837933")
      );
    });

    context("when maxLpTokenToLiquiate > LP from worker", async () => {
      it("should use all LP", async () => {
        // debt: 0.5 BTOKEN
        // LP token to liquidate:
        // Math.min(888, 0.316227766016837933) = 0.316227766016837933 LP (0.1 BNB + 1 BTOKEN)
        // maxReturnDebt: 888 base token
        const bobBaseTokenBefore = await baseToken.balanceOf(bobAddress);
        const bobBnbBefore = await bob.getBalance();

        await expect(
          mockPancakeswapBaseTokenWbnbV2WorkerAsBob.work(
            0,
            bobAddress,
            ethers.utils.parseEther("0.5"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [ethers.utils.parseEther("888"), ethers.utils.parseEther("888"), ethers.utils.parseEther("0.1")]
                ),
              ]
            ),
            { gasPrice: 0 }
          )
        )
          .to.emit(strat, "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTradingEvent")
          .withArgs(
            baseToken.address,
            wbnb.address,
            ethers.utils.parseEther("0.316227766016837933"),
            ethers.utils.parseEther("0.5")
          );

        // no trade
        const bobBaseTokenAfter = await baseToken.balanceOf(bobAddress);
        const bobBnbAfter = await bob.getBalance();

        expect(await lpV2.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await lpV2.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
        expect(bobBaseTokenAfter.sub(bobBaseTokenBefore), "Bob (as Vault) should get 1 BTOKEN back.").to.be.eq(
          ethers.utils.parseEther("1")
        );
        expect(bobBnbAfter.sub(bobBnbBefore), "Bob should get 0.1 BNB back.").to.be.eq(ethers.utils.parseEther("0.1"));
      });
    });

    context("when maxReturnDebt > debt", async () => {
      it("should return all debt", async () => {
        // debt: 0.5 BTOKEN
        // LP token to liquidate: 0.158113883008418966 LP (0.05 BNB + 0.5 BTOKEN)
        // maxReturnDebt: 888 base token
        const bobBaseTokenBefore = await baseToken.balanceOf(bobAddress);
        const bobBnbBefore = await bob.getBalance();

        await expect(
          mockPancakeswapBaseTokenWbnbV2WorkerAsBob.work(
            0,
            bobAddress,
            ethers.utils.parseEther("0.5"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256", "uint256"],
                  [
                    ethers.utils.parseEther("0.158113883008418966"),
                    ethers.utils.parseEther("888"),
                    ethers.utils.parseEther("0.0495"),
                  ]
                ),
              ]
            ),
            { gasPrice: 0 }
          )
        )
          .to.emit(strat, "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTradingEvent")
          .withArgs(
            baseToken.address,
            wbnb.address,
            ethers.utils.parseEther("0.158113883008418966"),
            ethers.utils.parseEther("0.5")
          );

        // no trade
        const bobBaseTokenAfter = await baseToken.balanceOf(bobAddress);
        const bobBnbAfter = await bob.getBalance();

        expect(await lpV2.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await lpV2.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
        expect(bobBaseTokenAfter.sub(bobBaseTokenBefore), "Bob (as Vault) should get 0.5 BTOKEN back.").to.be.eq(
          ethers.utils.parseEther("0.5")
        );
        expect(bobBnbAfter.sub(bobBnbBefore), "Bob should get 0.049999999999999998 BNB back.").to.be.eq(
          ethers.utils.parseEther("0.049999999999999998")
        );
      });
    });

    context("when no trade (maxReturnDebt <= received BTOKEN from LP token)", async () => {
      context("when farming tokens received < slippage", async () => {
        it("should revert", async () => {
          // LP token to liquidate: 0.158113883008418966 Lp token (0.05 FTOKEN + 0.5 BTOKEN)
          // maxReturnDebt: 0.1 base token
          await expect(
            mockPancakeswapBaseTokenWbnbV2WorkerAsBob.work(
              0,
              bobAddress,
              ethers.utils.parseEther("1"),
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ["uint256", "uint256", "uint256"],
                    [
                      ethers.utils.parseEther("0.158113883008418966"),
                      ethers.utils.parseEther("0.1"),
                      ethers.utils.parseEther("0.5"),
                    ]
                  ),
                ]
              )
            )
          ).to.revertedWith(
            "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received"
          );
        });
      });

      context("when farming tokens received >= slippage", async () => {
        it("should success", async () => {
          // LP token to liquidate: 0.158113883008418966 Lp token (0.05 FTOKEN + 0.5 BTOKEN)
          // maxReturnDebt: 0.1 BTOKEN
          const bobBaseTokenBefore = await baseToken.balanceOf(bobAddress);
          const bobBnbBefore = await ethers.provider.getBalance(bobAddress);

          await expect(
            mockPancakeswapBaseTokenWbnbV2WorkerAsBob.work(
              0,
              bobAddress,
              ethers.utils.parseEther("1"),
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ["uint256", "uint256", "uint256"],
                    [
                      ethers.utils.parseEther("0.158113883008418966"),
                      ethers.utils.parseEther("0.1"),
                      ethers.utils.parseEther("0.0495"),
                    ]
                  ),
                ]
              ),
              { gasPrice: 0 }
            )
          )
            .to.emit(strat, "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTradingEvent")
            .withArgs(
              baseToken.address,
              wbnb.address,
              ethers.utils.parseEther("0.158113883008418966"),
              ethers.utils.parseEther("0.1")
            );

          // remove liquidity 50%: 0.158113883008418966 LP token (0.05 farming token + 0.5 base token)
          // no trade
          const bobBaseTokenAfter = await baseToken.balanceOf(bobAddress);
          const bobBnbAfter = await ethers.provider.getBalance(bobAddress);
          expect(await lpV2.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
          expect(await lpV2.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.5").toString(),
            bobBaseTokenAfter.sub(bobBaseTokenBefore).toString()
          );
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.05").toString(),
            bobBnbAfter.sub(bobBnbBefore).toString()
          );
        });
      });
    });

    context("when some trade (maxReturnDebt > received BTOKEN from LP)", async () => {
      context(
        "when FTOKEN not enough to cover maxReturnDebt (maxReturnDebt > (BtokenFromLp + BtokenFromSellFtoken))",
        async () => {
          // LP token to liquidate: 0.158113883008418966 Lp token (0.05 FTOKEN + 0.5 BTOKEN)
          // maxReturnDebt: 1 BTOKEN
          it("should be revert", async () => {
            await expect(
              mockPancakeswapBaseTokenWbnbV2WorkerAsBob.work(
                0,
                bobAddress,
                ethers.utils.parseEther("1"),
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [
                    strat.address,
                    ethers.utils.defaultAbiCoder.encode(
                      ["uint256", "uint256", "uint256"],
                      [
                        ethers.utils.parseEther("0.158113883008418966"),
                        ethers.utils.parseEther("1"),
                        ethers.utils.parseEther("0.0495"),
                      ]
                    ),
                  ]
                ),
                { gasPrice: 0 }
              )
            ).to.revertedWith("PancakeRouter: EXCESSIVE_INPUT_AMOUNT");
          });
        }
      );

      context("when farming tokens received < slippage", async () => {
        it("should revert", async () => {
          // LP token to liquidate: 0.158113883008418966 Lp token (0.05 FTOKEN + 0.5 BTOKEN)
          // maxReturnDebt: 1 BTOKEN
          await expect(
            mockPancakeswapBaseTokenWbnbV2WorkerAsBob.work(
              0,
              bobAddress,
              ethers.utils.parseEther("1"),
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ["uint256", "uint256", "uint256"],
                    [
                      ethers.utils.parseEther("0.158113883008418966"),
                      ethers.utils.parseEther("0.6"),
                      ethers.utils.parseEther("0.4"),
                    ]
                  ),
                ]
              ),
              { gasPrice: 0 }
            )
          ).to.revertedWith(
            "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received"
          );
        });
      });

      context("when farming tokens received >= slippage", async () => {
        it("should be successfully", async () => {
          // LP token to liquidate: 0.158113883008418966 Lp token (0.05 FTOKEN + 0.5 BTOKEN)
          // maxReturnDebt: 1 BTOKEN
          const bobBaseTokenBefore = await baseToken.balanceOf(bobAddress);
          const bobBnbBefore = await ethers.provider.getBalance(bobAddress);

          await expect(
            mockPancakeswapBaseTokenWbnbV2WorkerAsBob.work(
              0,
              bobAddress,
              ethers.utils.parseEther("1"),
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ["uint256", "uint256", "uint256"],
                    [
                      ethers.utils.parseEther("0.158113883008418966"),
                      ethers.utils.parseEther("0.6"),
                      ethers.utils.parseEther("0.037"),
                    ]
                  ),
                ]
              ),
              { gasPrice: 0 }
            )
          )
            .to.emit(strat, "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTradingEvent")
            .withArgs(
              baseToken.address,
              wbnb.address,
              ethers.utils.parseEther("0.158113883008418966"),
              ethers.utils.parseEther("0.6")
            );

          // remove liquidity 50%: 0.158113883008418966 LP token (0.05 farming token + 0.5 base token)
          // trade
          // exactIn = (exactOut * reserveIn * 10000) / (tradingFee * (reserveOut - exactOut))
          // exactIn = (0.1 * 0.15 * 10000) / (9975 * (1.5 - 0.1))
          // exactIn = 0.010741138560687433
          // remainingFarmingToken = 0.05 - 0.010741138560687433 = 0.03925886143931257
          const bobBaseTokenAfter = await baseToken.balanceOf(bobAddress);
          const bobBnbAfter = await ethers.provider.getBalance(bobAddress);
          expect(await lpV2.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
          expect(await lpV2.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.6").toString(),
            bobBaseTokenAfter.sub(bobBaseTokenBefore).toString()
          );
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.03925886143931257").toString(),
            bobBnbAfter.sub(bobBnbBefore).toString()
          );
        });
      });
    });
  });
});
