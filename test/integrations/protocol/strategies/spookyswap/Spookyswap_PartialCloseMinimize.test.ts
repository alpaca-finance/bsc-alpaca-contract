import { ethers, upgrades, waffle, network } from "hardhat";
import { Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  WETH,
  WETH__factory,
  WNativeRelayer__factory,
  WaultSwapFactory,
  WaultSwapRouter,
  WaultSwapPair,
  MockWaultSwapWorker,
  WaultSwapFactory__factory,
  WaultSwapRouter__factory,
  WaultSwapPair__factory,
  MockWaultSwapWorker__factory,
  SpookySwapStrategyPartialCloseMinimizeTrading,
  SpookySwapStrategyPartialCloseMinimizeTrading__factory,
} from "../../../../../typechain";
import * as TestHelpers from "../../../../helpers/assert";

chai.use(solidity);
const { expect } = chai;

describe("SpookySwapStrategyPartialCloseMinimizeTrading", () => {
  const FOREVER = "2000000000";

  /// DEX-related instance(s)
  /// note: Use WaultSwap here because they have the same fee-structure
  let factory: WaultSwapFactory;
  let router: WaultSwapRouter;
  let lp: WaultSwapPair;
  let baseTokenWbnbLp: WaultSwapPair;

  /// MockWaultSwapWorker-related instance(s)
  let mockWorker: MockWaultSwapWorker;
  let mockEvilWorker: MockWaultSwapWorker;
  let mockBaseTokenWbnbV2Worker: MockWaultSwapWorker;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let strat: SpookySwapStrategyPartialCloseMinimizeTrading;

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
  let baseTokenWbnbLpV2AsBob: WaultSwapPair;

  let lpAsAlice: WaultSwapPair;
  let lpAsBob: WaultSwapPair;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerAsAlice: WaultSwapRouter;
  let routerAsBob: WaultSwapRouter;

  let stratAsAlice: SpookySwapStrategyPartialCloseMinimizeTrading;
  let stratAsBob: SpookySwapStrategyPartialCloseMinimizeTrading;

  let mockWorkerAsBob: MockWaultSwapWorker;
  let mockV2EvilWorkerAsBob: MockWaultSwapWorker;
  let mockBaseTokenWbnbV2WorkerAsBob: MockWaultSwapWorker;

  let wbnbAsAlice: WETH;
  let wbnbAsBob: WETH;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();
    [deployerAddress, aliceAddress, bobAddress] = await Promise.all([
      deployer.getAddress(),
      alice.getAddress(),
      bob.getAddress(),
    ]);

    // Setup WaultSwap
    const WaultSwapFactory = (await ethers.getContractFactory(
      "WaultSwapFactory",
      deployer
    )) as WaultSwapFactory__factory;
    factory = await WaultSwapFactory.deploy(deployerAddress);
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();

    const WaultSwapRouter = (await ethers.getContractFactory("WaultSwapRouter", deployer)) as WaultSwapRouter__factory;
    router = await WaultSwapRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

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

    await factory.createPair(baseToken.address, farmingToken.address);
    await factory.createPair(baseToken.address, wbnb.address);

    lp = WaultSwapPair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);
    baseTokenWbnbLp = WaultSwapPair__factory.connect(await factory.getPair(wbnb.address, baseToken.address), deployer);

    /// Setup MockWaultSwapWorker
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
    mockBaseTokenWbnbV2Worker = (await MockWaultSwapWorker.deploy(
      baseTokenWbnbLp.address,
      baseToken.address,
      wbnb.address
    )) as MockWaultSwapWorker;
    await mockBaseTokenWbnbV2Worker.deployed();

    /// Setup WNativeRelayer
    const WNativeRelayer = (await ethers.getContractFactory("WNativeRelayer", deployer)) as WNativeRelayer__factory;
    const wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
    await wNativeRelayer.deployed();

    const SpookySwapStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "SpookySwapStrategyPartialCloseMinimizeTrading",
      deployer
    )) as SpookySwapStrategyPartialCloseMinimizeTrading__factory;
    strat = (await upgrades.deployProxy(SpookySwapStrategyPartialCloseMinimizeTrading, [
      router.address,
      wNativeRelayer.address,
    ])) as SpookySwapStrategyPartialCloseMinimizeTrading;
    await strat.deployed();
    await strat.setWorkersOk([mockWorker.address, mockBaseTokenWbnbV2Worker.address], true);
    await wNativeRelayer.setCallerOk([strat.address], true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);
    baseTokenWbnbLpV2AsBob = WaultSwapPair__factory.connect(baseTokenWbnbLp.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerAsAlice = WaultSwapRouter__factory.connect(router.address, alice);
    routerAsBob = WaultSwapRouter__factory.connect(router.address, bob);

    lpAsAlice = WaultSwapPair__factory.connect(lp.address, alice);
    lpAsBob = WaultSwapPair__factory.connect(lp.address, bob);

    stratAsAlice = SpookySwapStrategyPartialCloseMinimizeTrading__factory.connect(strat.address, alice);
    stratAsBob = SpookySwapStrategyPartialCloseMinimizeTrading__factory.connect(strat.address, bob);

    mockWorkerAsBob = MockWaultSwapWorker__factory.connect(mockWorker.address, bob);
    mockV2EvilWorkerAsBob = MockWaultSwapWorker__factory.connect(mockEvilWorker.address, bob);
    mockBaseTokenWbnbV2WorkerAsBob = MockWaultSwapWorker__factory.connect(mockBaseTokenWbnbV2Worker.address, bob);

    wbnbAsAlice = WETH__factory.connect(wbnb.address, alice);
    wbnbAsBob = WETH__factory.connect(wbnb.address, bob);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("when the setOkWorkers caller is not an owner", async () => {
    it("should be reverted", async () => {
      await expect(stratAsBob.setWorkersOk([mockV2EvilWorkerAsBob.address], true)).to.revertedWith(
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
      ).to.revertedWith("bad worker");
    });
  });

  context("when caller worker hasn't been whitelisted", async () => {
    it("should revert as bad worker", async () => {
      await expect(
        mockV2EvilWorkerAsBob.work(
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
      ).to.revertedWith("bad worker");
    });
  });

  context("when revoking whitelist workers", async () => {
    it("should revert as bad worker", async () => {
      await strat.setWorkersOk([mockWorker.address], false);
      await expect(
        mockWorkerAsBob.work(
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
      ).to.revertedWith("bad worker");
    });
  });

  context("when bad calldata", async () => {
    it("should revert", async () => {
      await expect(mockWorkerAsBob.work(0, bobAddress, "0", "0x1234")).to.reverted;
    });
  });

  context("when farming token is NOT WBNB", async () => {
    beforeEach(async () => {
      // Alice adds 40 FTOKEN + 2 BaseToken
      await baseTokenAsAlice.approve(router.address, ethers.utils.parseEther("2"));
      await farmingTokenAsAlice.approve(router.address, ethers.utils.parseEther("40"));
      await routerAsAlice.addLiquidity(
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
      await baseTokenAsBob.approve(router.address, ethers.utils.parseEther("2"));
      await farmingTokenAsBob.approve(router.address, ethers.utils.parseEther("40"));
      await routerAsBob.addLiquidity(
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
          mockWorkerAsBob.work(
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
          .to.emit(strat, "LogSpookySwapStrategyPartialCloseMinimizeTrading")
          .withArgs(
            baseToken.address,
            farmingToken.address,
            ethers.utils.parseEther("8.944271909999158785"),
            ethers.utils.parseEther("1")
          );

        const bobBaseTokenAfter = await baseToken.balanceOf(bobAddress);
        const bobFTOKENAfter = await farmingToken.balanceOf(bobAddress);

        expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await lp.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
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
          mockWorkerAsBob.work(
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
          .to.emit(strat, "LogSpookySwapStrategyPartialCloseMinimizeTrading")
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
        expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await lp.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
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
            mockWorkerAsBob.work(
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
          ).to.revertedWith("insufficient farming tokens received");
        });
      });

      context("when farming tokens received >= slippage", async () => {
        it("should success", async () => {
          // LP token to liquidate: 4.472135954999579392 Lp token (20 farming token + 1 base token)
          // maxReturnDebt: 0.8 base token
          const bobBaseTokenBefore = await baseToken.balanceOf(bobAddress);
          const bobFTOKENBefore = await farmingToken.balanceOf(bobAddress);

          await expect(
            mockWorkerAsBob.work(
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
            .to.emit(strat, "LogSpookySwapStrategyPartialCloseMinimizeTrading")
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
          expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
          expect(await lp.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
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
          // LP token to liquidate: 0.894427190999915878 Lp token (4 farming token + 0.2 base token) ~ 0.4 base token
          // maxReturnDebt: 0.5 base token
          it("should be revert", async () => {
            const bobBaseTokenBefore = await baseToken.balanceOf(bobAddress);
            const bobFTOKENBefore = await farmingToken.balanceOf(bobAddress);

            await expect(
              mockWorkerAsBob.work(
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
            ).to.revertedWith("WaultSwapRouter: EXCESSIVE_INPUT_AMOUNT");
          });
        }
      );

      context("when farming tokens received < slippage", async () => {
        // LP token to liquidate: 0.894427190999915878 Lp token (4 farming token + 0.2 base token)
        // maxReturnDebt: 0.24 base token
        it("should revert", async () => {
          await expect(
            mockWorkerAsBob.work(
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
          ).to.revertedWith("insufficient farming tokens received");
        });
      });

      context("when farming tokens received >= slippage", async () => {
        // LP token to liquidate: 0.894427190999915878 Lp token (4 farming token + 0.2 base token)
        // maxReturnDebt: 0.24 base token
        it("should be successfully", async () => {
          const bobBaseTokenBefore = await baseToken.balanceOf(bobAddress);
          const bobFTOKENBefore = await farmingToken.balanceOf(bobAddress);

          await expect(
            mockWorkerAsBob.work(
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
            .to.emit(strat, "LogSpookySwapStrategyPartialCloseMinimizeTrading")
            .withArgs(
              baseToken.address,
              farmingToken.address,
              ethers.utils.parseEther("0.894427190999915878"),
              ethers.utils.parseEther("0.24")
            );

          // remove liquidity 10%: 0.894427190999915878 LP token (4 farming token + 0.2 base token)
          // trade
          // exactIn = (exactOut * reserveIn * 10000) / (tradingFee * (reserveOut - exactOut))
          // exactIn = (0.04 * 76 * 10000) / (9980 * (3.8 - 0.04))
          // exactIn = 0.8101309000980685
          // remainingFarmingToken = 4 - 0.8101309000980685 = 3.1898690999019315
          const bobBaseTokenAfter = await baseToken.balanceOf(bobAddress);
          const bobFTOKENAfter = await farmingToken.balanceOf(bobAddress);
          expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
          expect(await lp.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.24").toString(),
            bobBaseTokenAfter.sub(bobBaseTokenBefore).toString()
          );
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther("3.1898690999019315").toString(),
            bobFTOKENAfter.sub(bobFTOKENBefore).toString()
          );
        });
      });
    });
  });

  context("when farming token is WBNB", () => {
    beforeEach(async () => {
      // Alice wrap BNB
      await wbnbAsAlice.deposit({ value: ethers.utils.parseEther("0.1") });
      // Alice adds 0.1 WBNB + 1 BaseToken
      await baseTokenAsAlice.approve(router.address, ethers.utils.parseEther("1"));
      await wbnbAsAlice.approve(router.address, ethers.utils.parseEther("0.1"));
      await routerAsAlice.addLiquidity(
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
      await baseTokenAsBob.approve(router.address, ethers.utils.parseEther("1"));
      await wbnbAsBob.approve(router.address, ethers.utils.parseEther("1"));
      await routerAsBob.addLiquidity(
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
      expect(await baseTokenWbnbLp.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0.316227766016837933"));
      await baseTokenWbnbLpV2AsBob.transfer(
        mockBaseTokenWbnbV2Worker.address,
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
          mockBaseTokenWbnbV2WorkerAsBob.work(
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
          .to.emit(strat, "LogSpookySwapStrategyPartialCloseMinimizeTrading")
          .withArgs(
            baseToken.address,
            wbnb.address,
            ethers.utils.parseEther("0.316227766016837933"),
            ethers.utils.parseEther("0.5")
          );

        // no trade
        const bobBaseTokenAfter = await baseToken.balanceOf(bobAddress);
        const bobBnbAfter = await bob.getBalance();

        expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await lp.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
        expect(bobBaseTokenAfter.sub(bobBaseTokenBefore), "Bob (as Vault) should get 1 BTOKEN back.").to.be.eq(
          ethers.utils.parseEther("1")
        );
        expect(bobBnbAfter.sub(bobBnbBefore), "Bob should get 0.1 BNB back.").to.be.eq(ethers.utils.parseEther("0.1"));
      });
    });

    context("when maxReturnDebt > debt", async () => {
      it("should return all debt", async () => {
        // debt: 1 BTOKEN
        // LP token to liquidate: 0.158113883008418966 LP (0.05 BNB + 0.5 BTOKEN)
        // maxReturnDebt: 888 base token
        const bobBaseTokenBefore = await baseToken.balanceOf(bobAddress);
        const bobBnbBefore = await bob.getBalance();

        await expect(
          mockBaseTokenWbnbV2WorkerAsBob.work(
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
          .to.emit(strat, "LogSpookySwapStrategyPartialCloseMinimizeTrading")
          .withArgs(
            baseToken.address,
            wbnb.address,
            ethers.utils.parseEther("0.158113883008418966"),
            ethers.utils.parseEther("0.5")
          );

        // no trade
        const bobBaseTokenAfter = await baseToken.balanceOf(bobAddress);
        const bobBnbAfter = await bob.getBalance();

        expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await lp.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
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
        // LP token to liquidate: 0.158113883008418966 Lp token (0.05 farming token + 0.5 base token)
        // maxReturnDebt: 0.1 base token
        it("should revert", async () => {
          await expect(
            mockBaseTokenWbnbV2WorkerAsBob.work(
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
          ).to.revertedWith("insufficient farming tokens received");
        });
      });

      context("when farming tokens received >= slippage", async () => {
        // LP token to liquidate: 0.158113883008418966 Lp token (0.05 farming token + 0.5 base token)
        // maxReturnDebt: 0.1 base token
        it("should be successfully", async () => {
          const bobBaseTokenBefore = await baseToken.balanceOf(bobAddress);
          const bobBnbBefore = await ethers.provider.getBalance(bobAddress);

          await expect(
            mockBaseTokenWbnbV2WorkerAsBob.work(
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
            .to.emit(strat, "LogSpookySwapStrategyPartialCloseMinimizeTrading")
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
          expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
          expect(await lp.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
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

    context("when some trade (maxReturnDebt > received Base token from LP)", async () => {
      context(
        "when FTOKEN not enough to cover maxReturnDebt (maxReturnDebt > (BtokenFromLp + BtokenFromSellFtoken))",
        async () => {
          // LP token to liquidate: 0.158113883008418966 Lp token (0.05 farming token + 0.5 base token)
          // maxReturnDebt: 1 base token
          it("should be revert", async () => {
            const bobBaseTokenBefore = await baseToken.balanceOf(bobAddress);
            const bobFTOKENBefore = await farmingToken.balanceOf(bobAddress);

            await expect(
              mockBaseTokenWbnbV2WorkerAsBob.work(
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
            ).to.revertedWith("WaultSwapRouter: EXCESSIVE_INPUT_AMOUNT");
          });
        }
      );

      context("when farming tokens received < slippage", async () => {
        // LP token to liquidate: 0.158113883008418966 Lp token (0.05 farming token + 0.5 base token)
        // maxReturnDebt: 1 base token
        it("should revert", async () => {
          await expect(
            mockBaseTokenWbnbV2WorkerAsBob.work(
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
          ).to.revertedWith("insufficient farming tokens received");
        });
      });

      context("when farming tokens received >= slippage", async () => {
        // LP token to liquidate: 0.158113883008418966 Lp token (0.05 farming token + 0.5 base token)
        // maxReturnDebt: 1 base token
        it("should be successfully", async () => {
          const bobBaseTokenBefore = await baseToken.balanceOf(bobAddress);
          const bobBnbBefore = await ethers.provider.getBalance(bobAddress);

          await expect(
            mockBaseTokenWbnbV2WorkerAsBob.work(
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
            .to.emit(strat, "LogSpookySwapStrategyPartialCloseMinimizeTrading")
            .withArgs(
              baseToken.address,
              wbnb.address,
              ethers.utils.parseEther("0.158113883008418966"),
              ethers.utils.parseEther("0.6")
            );

          // remove liquidity 50%: 0.158113883008418966 LP token (0.05 farming token + 0.5 base token)
          // trade
          // exactIn = (exactOut * reserveIn * 10000) / (tradingFee * (reserveOut - exactOut))
          // exactIn = (0.1 * 0.15 * 10000) / (9980 * (1.5 - 0.1))
          // exactIn = 0.0107357572287432
          // remainingFarmingToken = 0.05 - 0.0107357572287432 = 0.0392642427712568
          const bobBaseTokenAfter = await baseToken.balanceOf(bobAddress);
          const bobBnbAfter = await ethers.provider.getBalance(bobAddress);
          expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
          expect(await lp.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.6").toString(),
            bobBaseTokenAfter.sub(bobBaseTokenBefore).toString()
          );
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.0392642427712568").toString(),
            bobBnbAfter.sub(bobBnbBefore).toString()
          );
        });
      });
    });
  });
});
