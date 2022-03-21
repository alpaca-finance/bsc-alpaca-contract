import { ethers, network, upgrades, waffle } from "hardhat";
import { Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  MdexFactory,
  MdexFactory__factory,
  MdexPair,
  MdexPair__factory,
  MdexRouter__factory,
  MdexRouter,
  WETH,
  WETH__factory,
  WNativeRelayer__factory,
  MdexRestrictedStrategyPartialCloseMinimizeTrading,
  MdexRestrictedStrategyPartialCloseMinimizeTrading__factory,
  SwapMining,
  Oracle,
  MockMdexWorker__factory,
  MockMdexWorker,
  Oracle__factory,
  SwapMining__factory,
} from "../../../../../typechain";
import * as TestHelpers from "../../../../helpers/assert";
import { MdxToken } from "../../../../../typechain/MdxToken";
import { MdxToken__factory } from "../../../../../typechain/factories/MdxToken__factory";
import * as TimeHelpers from "../../../../helpers/time";

chai.use(solidity);
const { expect } = chai;

describe("MdexRestrictedStrategyPartialCloseMinimizeTrading", () => {
  const FOREVER = "2000000000";
  const mdxPerBlock = "51600000000000000000";

  /// Mdex-related instance(s)
  let factory: MdexFactory;
  let router: MdexRouter;
  let lp: MdexPair;
  let baseTokenWbnbLp: MdexPair;
  let swapMining: SwapMining;
  let oracle: Oracle;

  /// MockMdexWorker-related instance(s)
  let mockMdexWorker: MockMdexWorker;
  let mockMdexEvilWorker: MockMdexWorker;
  let mockMdexBaseTokenWbnbWorker: MockMdexWorker;

  /// Token-related instance(s)
  let mdxToken: MdxToken;
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  // available pool Ids
  let pIds: number[];

  /// Strategy instance(s)
  let strat: MdexRestrictedStrategyPartialCloseMinimizeTrading;

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
  let baseTokenWbnbLpAsBob: MdexPair;

  let lpAsAlice: MdexPair;
  let lpAsBob: MdexPair;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerAsAlice: MdexRouter;
  let routerAsBob: MdexRouter;

  let stratAsAlice: MdexRestrictedStrategyPartialCloseMinimizeTrading;
  let stratAsBob: MdexRestrictedStrategyPartialCloseMinimizeTrading;

  let mockMdexWorkerAsBob: MockMdexWorker;
  let mockMdexEvilWorkerAsBob: MockMdexWorker;
  let mockMdexBaseTokenWbnbWorkerAsBob: MockMdexWorker;

  let wbnbAsAlice: WETH;
  let wbnbAsBob: WETH;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();
    [deployerAddress, aliceAddress, bobAddress] = await Promise.all([
      deployer.getAddress(),
      alice.getAddress(),
      bob.getAddress(),
    ]);

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

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();

    // Setup Mdex
    const MdxToken = (await ethers.getContractFactory("MdxToken", deployer)) as MdxToken__factory;
    mdxToken = await MdxToken.deploy();
    await mdxToken.addMinter(await deployer.getAddress());
    await mdxToken.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));

    const MdexFactory = (await ethers.getContractFactory("MdexFactory", deployer)) as MdexFactory__factory;
    factory = await MdexFactory.deploy(deployerAddress);
    await factory.deployed();
    const MdexRouter = (await ethers.getContractFactory("MdexRouter", deployer)) as MdexRouter__factory;
    router = await MdexRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

    const Oracle = (await ethers.getContractFactory("Oracle", deployer)) as Oracle__factory;
    oracle = await Oracle.deploy(factory.address);
    await oracle.deployed();

    const blockNumber = await TimeHelpers.latestBlockNumber();
    const SwapMining = (await ethers.getContractFactory("SwapMining", deployer)) as SwapMining__factory;
    swapMining = await SwapMining.deploy(
      mdxToken.address,
      factory.address,
      oracle.address,
      router.address,
      baseToken.address,
      mdxPerBlock,
      blockNumber
    );
    await swapMining.deployed();
    await router.setSwapMining(swapMining.address);
    await factory.createPair(baseToken.address, farmingToken.address);
    await factory.createPair(baseToken.address, wbnb.address);
    lp = MdexPair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);
    baseTokenWbnbLp = MdexPair__factory.connect(await factory.getPair(wbnb.address, baseToken.address), deployer);

    await factory.addPair(lp.address);
    await factory.addPair(baseTokenWbnbLp.address);
    await factory.setPairFees(lp.address, 25);
    await factory.setPairFees(baseTokenWbnbLp.address, 25);
    await mdxToken.addMinter(swapMining.address);
    await swapMining.addWhitelist(baseToken.address);
    await swapMining.addWhitelist(farmingToken.address);
    await swapMining.addWhitelist(wbnb.address);
    await swapMining.addPair(100, lp.address, false); // pid = 0
    await swapMining.addPair(0, baseTokenWbnbLp.address, false); // pid = 1 , no trading reward alloc point
    pIds = [0, 1];
    /// Setup MockMdexWorker
    const MockMdexWorker = (await ethers.getContractFactory("MockMdexWorker", deployer)) as MockMdexWorker__factory;
    mockMdexWorker = (await MockMdexWorker.deploy(
      lp.address,
      baseToken.address,
      farmingToken.address
    )) as MockMdexWorker;
    await mockMdexWorker.deployed();
    mockMdexEvilWorker = (await MockMdexWorker.deploy(
      lp.address,
      baseToken.address,
      farmingToken.address
    )) as MockMdexWorker;
    await mockMdexEvilWorker.deployed();
    mockMdexBaseTokenWbnbWorker = (await MockMdexWorker.deploy(
      baseTokenWbnbLp.address,
      baseToken.address,
      wbnb.address
    )) as MockMdexWorker;
    await mockMdexBaseTokenWbnbWorker.deployed();

    /// Setup WNativeRelayer
    const WNativeRelayer = (await ethers.getContractFactory("WNativeRelayer", deployer)) as WNativeRelayer__factory;
    const wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
    await wNativeRelayer.deployed();

    const MdexRestrictedStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "MdexRestrictedStrategyPartialCloseMinimizeTrading",
      deployer
    )) as MdexRestrictedStrategyPartialCloseMinimizeTrading__factory;
    strat = (await upgrades.deployProxy(MdexRestrictedStrategyPartialCloseMinimizeTrading, [
      router.address,
      wbnb.address,
      wNativeRelayer.address,
      mdxToken.address,
    ])) as MdexRestrictedStrategyPartialCloseMinimizeTrading;
    await strat.deployed();
    await strat.setWorkersOk([mockMdexWorker.address, mockMdexBaseTokenWbnbWorker.address], true);
    await wNativeRelayer.setCallerOk([strat.address], true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);
    baseTokenWbnbLpAsBob = MdexPair__factory.connect(baseTokenWbnbLp.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerAsAlice = MdexRouter__factory.connect(router.address, alice);
    routerAsBob = MdexRouter__factory.connect(router.address, bob);

    lpAsAlice = MdexPair__factory.connect(lp.address, alice);
    lpAsBob = MdexPair__factory.connect(lp.address, bob);

    stratAsAlice = MdexRestrictedStrategyPartialCloseMinimizeTrading__factory.connect(strat.address, alice);
    stratAsBob = MdexRestrictedStrategyPartialCloseMinimizeTrading__factory.connect(strat.address, bob);

    mockMdexWorkerAsBob = MockMdexWorker__factory.connect(mockMdexWorker.address, bob);
    mockMdexEvilWorkerAsBob = MockMdexWorker__factory.connect(mockMdexEvilWorker.address, bob);
    mockMdexBaseTokenWbnbWorkerAsBob = MockMdexWorker__factory.connect(mockMdexBaseTokenWbnbWorker.address, bob);

    wbnbAsAlice = WETH__factory.connect(wbnb.address, alice);
    wbnbAsBob = WETH__factory.connect(wbnb.address, bob);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("when the setOkWorkers caller is not an owner", async () => {
    it("should be reverted", async () => {
      await expect(stratAsBob.setWorkersOk([mockMdexEvilWorkerAsBob.address], true)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
  });

  context("when the withdrawTradingRewards caller is not an owner", async () => {
    it("should be reverted", async () => {
      await expect(stratAsBob.withdrawTradingRewards(bobAddress)).to.revertedWith("Ownable: caller is not the owner");
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
      ).to.revertedWith("MdexRestrictedStrategyPartialCloseMinimizeTrading::onlyWhitelistedWorkers:: bad worker");
    });
  });

  context("when caller worker hasn't been whitelisted", async () => {
    it("should revert as bad worker", async () => {
      await expect(
        mockMdexEvilWorkerAsBob.work(
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
      ).to.revertedWith("MdexRestrictedStrategyPartialCloseMinimizeTrading::onlyWhitelistedWorkers:: bad worker");
    });
  });

  context("when revoking whitelist workers", async () => {
    it("should revert as bad worker", async () => {
      await strat.setWorkersOk([mockMdexWorker.address], false);
      await expect(
        mockMdexWorkerAsBob.work(
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
      ).to.revertedWith("MdexRestrictedStrategyPartialCloseMinimizeTrading::onlyWhitelistedWorkers:: bad worker");
    });
  });

  context("when bad calldata", async () => {
    it("should revert", async () => {
      await expect(mockMdexWorkerAsBob.work(0, bobAddress, "0", "0x1234")).to.reverted;
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
          mockMdexWorkerAsBob.work(
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
          .to.emit(strat, "MdexRestrictedStrategyPartialCloseMinimizeTradingEvent")
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

        const mdxBefore = await mdxToken.balanceOf(deployerAddress);
        // withdraw trading reward to deployer
        const withDrawTx = await strat.withdrawTradingRewards(deployerAddress);
        const mdxAfter = await mdxToken.balanceOf(deployerAddress);
        // get trading reward of the previos block
        const totalRewardPrev = await strat.getMiningRewards(pIds, { blockTag: Number(withDrawTx.blockNumber) - 1 });
        const withDrawBlockReward = await swapMining["reward()"]({ blockTag: withDrawTx.blockNumber });
        const totalReward = !totalRewardPrev.isZero() ? totalRewardPrev.add(withDrawBlockReward) : 0;
        expect(mdxAfter.sub(mdxBefore)).to.eq(totalReward);
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
          mockMdexWorkerAsBob.work(
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
          .to.emit(strat, "MdexRestrictedStrategyPartialCloseMinimizeTradingEvent")
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

        const mdxBefore = await mdxToken.balanceOf(deployerAddress);
        // withdraw trading reward to deployer
        const withDrawTx = await strat.withdrawTradingRewards(deployerAddress);
        const mdxAfter = await mdxToken.balanceOf(deployerAddress);
        // get trading reward of the previos block
        const totalRewardPrev = await strat.getMiningRewards(pIds, { blockTag: Number(withDrawTx.blockNumber) - 1 });
        const withDrawBlockReward = await swapMining["reward()"]({ blockTag: withDrawTx.blockNumber });
        const totalReward = !totalRewardPrev.isZero() ? totalRewardPrev.add(withDrawBlockReward) : 0;
        expect(mdxAfter.sub(mdxBefore)).to.eq(totalReward);
      });
    });

    context("when no trade (maxReturnDebt <= received BTOKEN from LP token)", async () => {
      context("when farming tokens received < slippage", async () => {
        it("should revert", async () => {
          // LP token to liquidate: 4.472135954999579392 Lp token (20 farming token + 1 base token)
          // maxReturnDebt: 0.8 base token
          await expect(
            mockMdexWorkerAsBob.work(
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
            "MdexRestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received"
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
            mockMdexWorkerAsBob.work(
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
            .to.emit(strat, "MdexRestrictedStrategyPartialCloseMinimizeTradingEvent")
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

          const mdxBefore = await mdxToken.balanceOf(deployerAddress);
          // withdraw trading reward to deployer
          const withDrawTx = await strat.withdrawTradingRewards(deployerAddress);
          const mdxAfter = await mdxToken.balanceOf(deployerAddress);
          // get trading reward of the previos block
          const totalRewardPrev = await strat.getMiningRewards(pIds, { blockTag: Number(withDrawTx.blockNumber) - 1 });
          const withDrawBlockReward = await swapMining["reward()"]({ blockTag: withDrawTx.blockNumber });
          const totalReward = !totalRewardPrev.isZero() ? totalRewardPrev.add(withDrawBlockReward) : 0;
          expect(mdxAfter.sub(mdxBefore)).to.eq(totalReward);
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
              mockMdexWorkerAsBob.work(
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
            ).to.revertedWith("MdexRouter: EXCESSIVE_INPUT_AMOUNT");
          });
        }
      );

      context("when farming tokens received < slippage", async () => {
        // LP token to liquidate: 0.894427190999915878 Lp token (4 farming token + 0.2 base token)
        // maxReturnDebt: 0.24 base token
        it("should revert", async () => {
          await expect(
            mockMdexWorkerAsBob.work(
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
            "MdexRestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received"
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
            mockMdexWorkerAsBob.work(
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
            .to.emit(strat, "MdexRestrictedStrategyPartialCloseMinimizeTradingEvent")
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
          expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
          expect(await lp.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.24").toString(),
            bobBaseTokenAfter.sub(bobBaseTokenBefore).toString()
          );
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther("3.189463019250253").toString(),
            bobFTOKENAfter.sub(bobFTOKENBefore).toString()
          );

          const mdxBefore = await mdxToken.balanceOf(deployerAddress);
          // withdraw trading reward to deployer
          const withDrawTx = await strat.withdrawTradingRewards(deployerAddress);
          const mdxAfter = await mdxToken.balanceOf(deployerAddress);
          // get trading reward of the previos block
          const totalRewardPrev = await strat.getMiningRewards(pIds, { blockTag: Number(withDrawTx.blockNumber) - 1 });
          const withDrawBlockReward = await swapMining["reward()"]({ blockTag: withDrawTx.blockNumber });
          const totalReward = !totalRewardPrev.isZero() ? totalRewardPrev.add(withDrawBlockReward) : 0;
          expect(mdxAfter.sub(mdxBefore)).to.eq(totalReward);
        });
      });
    });
  });

  context("when the farming token is WBNB", () => {
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
      await baseTokenWbnbLpAsBob.transfer(
        mockMdexBaseTokenWbnbWorker.address,
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
          mockMdexBaseTokenWbnbWorkerAsBob.work(
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
          .to.emit(strat, "MdexRestrictedStrategyPartialCloseMinimizeTradingEvent")
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

        const mdxBefore = await mdxToken.balanceOf(deployerAddress);
        // withdraw trading reward to deployer
        const withDrawTx = await strat.withdrawTradingRewards(deployerAddress);
        const mdxAfter = await mdxToken.balanceOf(deployerAddress);
        // no alloc point for this pair
        expect(mdxAfter.sub(mdxBefore)).to.eq(0);
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
          mockMdexBaseTokenWbnbWorkerAsBob.work(
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
          .to.emit(strat, "MdexRestrictedStrategyPartialCloseMinimizeTradingEvent")
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

        const mdxBefore = await mdxToken.balanceOf(deployerAddress);
        // withdraw trading reward to deployer
        const withDrawTx = await strat.withdrawTradingRewards(deployerAddress);
        const mdxAfter = await mdxToken.balanceOf(deployerAddress);
        // no alloc point for this pair
        expect(mdxAfter.sub(mdxBefore)).to.eq(0);
      });
    });

    context("when no trade (maxReturnDebt <= received BTOKEN from LP token)", async () => {
      context("when farming tokens received < slippage", async () => {
        it("should revert", async () => {
          // LP token to liquidate: 0.158113883008418966 Lp token (0.05 FTOKEN + 0.5 BTOKEN)
          // maxReturnDebt: 0.1 base token
          await expect(
            mockMdexBaseTokenWbnbWorkerAsBob.work(
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
            "MdexRestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received"
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
            mockMdexBaseTokenWbnbWorkerAsBob.work(
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
            .to.emit(strat, "MdexRestrictedStrategyPartialCloseMinimizeTradingEvent")
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

          const mdxBefore = await mdxToken.balanceOf(deployerAddress);
          // withdraw trading reward to deployer
          const withDrawTx = await strat.withdrawTradingRewards(deployerAddress);
          const mdxAfter = await mdxToken.balanceOf(deployerAddress);
          // no alloc point for this pair
          expect(mdxAfter.sub(mdxBefore)).to.eq(0);
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
              mockMdexBaseTokenWbnbWorkerAsBob.work(
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
            ).to.revertedWith("MdexRouter: EXCESSIVE_INPUT_AMOUNT");
          });
        }
      );

      context("when farming tokens received < slippage", async () => {
        it("should revert", async () => {
          // LP token to liquidate: 0.158113883008418966 Lp token (0.05 FTOKEN + 0.5 BTOKEN)
          // maxReturnDebt: 1 BTOKEN
          await expect(
            mockMdexBaseTokenWbnbWorkerAsBob.work(
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
            "MdexRestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received"
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
            mockMdexBaseTokenWbnbWorkerAsBob.work(
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
            .to.emit(strat, "MdexRestrictedStrategyPartialCloseMinimizeTradingEvent")
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
          expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
          expect(await lp.balanceOf(bobAddress)).to.be.eq(ethers.utils.parseEther("0"));
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.6").toString(),
            bobBaseTokenAfter.sub(bobBaseTokenBefore).toString()
          );
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther("0.03925886143931257").toString(),
            bobBnbAfter.sub(bobBnbBefore).toString()
          );

          const mdxBefore = await mdxToken.balanceOf(deployerAddress);
          // withdraw trading reward to deployer
          const withDrawTx = await strat.withdrawTradingRewards(deployerAddress);
          const mdxAfter = await mdxToken.balanceOf(deployerAddress);
          // no alloc point for this pair
          expect(mdxAfter.sub(mdxBefore)).to.eq(0);
        });
      });
    });
  });
});
