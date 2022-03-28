import chai from "chai";
import { solidity } from "ethereum-waffle";
import { smock } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";
import { ethers, upgrades, waffle } from "hardhat";
import {
  IERC20,
  IERC20__factory,
  MockWaultSwapWorker,
  MockWaultSwapWorker__factory,
  MockWBNB,
  SimplePriceOracle,
  SimplePriceOracle__factory,
  StrategyOracleLiquidate,
  StrategyOracleLiquidate__factory,
  WaultSwapFactory,
  WaultSwapRouter,
} from "../../../../../typechain";
import { DeployHelper } from "../../../../helpers/deploy";
import { SwapHelper } from "../../../../helpers/swap";
import * as timeHelper from "../../../../helpers/time";

chai.should();
chai.use(smock.matchers);
chai.use(solidity);
const { expect } = chai;

describe("Waultswap - StrategyOracleLiquidate", () => {
  const DEFAULT_DISCOUNT_FACTOR = "9800";

  let deployer: SignerWithAddress;
  let liquiditySource: SignerWithAddress;

  let baseToken: IERC20;
  let farmingToken: IERC20;

  let mockWorker: MockWaultSwapWorker;

  let wbnb: MockWBNB;
  let factory: WaultSwapFactory;
  let router: WaultSwapRouter;
  let farmBasePair: IERC20;

  let priceOracle: SimplePriceOracle;

  let strategyOracleLiquidate: StrategyOracleLiquidate;

  async function fixture() {
    [deployer, liquiditySource] = await ethers.getSigners();

    const deployHelper = new DeployHelper(deployer);

    wbnb = await deployHelper.deployWBNB();
    [factory, router] = await deployHelper.deployWaultSwap(wbnb, 0);

    [farmingToken, baseToken] = await deployHelper.deployBEP20([
      {
        name: "MATIC",
        symbol: "MATIC",
        decimals: 7,
        holders: [
          { address: deployer.address, amount: ethers.utils.parseUnits("888888888888", 7) },
          { address: liquiditySource.address, amount: ethers.utils.parseUnits("1000000", 7) },
        ],
      },
      {
        name: "USDT",
        symbol: "USDT",
        decimals: 6,
        holders: [
          { address: deployer.address, amount: ethers.utils.parseUnits("888888888888", 6) },
          { address: liquiditySource.address, amount: ethers.utils.parseUnits("1000000", 6) },
        ],
      },
    ]);

    const swapHelper = new SwapHelper(
      factory.address,
      router.address,
      BigNumber.from(998),
      BigNumber.from(1000),
      deployer
    );

    await swapHelper.addLiquidities([
      {
        token0: farmingToken,
        token1: baseToken,
        amount0desired: ethers.utils.parseUnits("10000", 7),
        amount1desired: ethers.utils.parseUnits("6896.551724", 6),
      },
    ]);
    farmBasePair = IERC20__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);

    const SimplePriceOracle = new SimplePriceOracle__factory(deployer);
    priceOracle = (await upgrades.deployProxy(SimplePriceOracle, [deployer.address])) as SimplePriceOracle;

    const StrategyOracleLiquidate = new StrategyOracleLiquidate__factory(deployer);
    strategyOracleLiquidate = (await upgrades.deployProxy(StrategyOracleLiquidate, [
      "Some Oracle Liquidate",
      router.address,
      priceOracle.address,
      liquiditySource.address,
      DEFAULT_DISCOUNT_FACTOR,
    ])) as StrategyOracleLiquidate;

    const MockWaultSwapWorker = new MockWaultSwapWorker__factory(deployer);
    mockWorker = await MockWaultSwapWorker.deploy(farmBasePair.address, baseToken.address, farmingToken.address);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("#setWorkers", async () => {
    context("when caller is not the owner", async () => {
      it("should revert", async () => {
        await expect(
          StrategyOracleLiquidate__factory.connect(strategyOracleLiquidate.address, liquiditySource).setWorkersOk(
            [ethers.constants.AddressZero],
            true
          )
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });

    context("when caller is the owner", async () => {
      it("should work", async () => {
        await strategyOracleLiquidate.setWorkersOk([mockWorker.address], true);
        expect(await strategyOracleLiquidate.okWorkers(mockWorker.address)).to.be.eq(true);
      });
    });
  });

  context("#setDiscountFactor", async () => {
    context("when caller is not the owner", async () => {
      it("should revert", async () => {
        await expect(
          StrategyOracleLiquidate__factory.connect(strategyOracleLiquidate.address, liquiditySource).setDiscountFactor(
            farmingToken.address,
            baseToken.address,
            "9500"
          )
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });

    context("when caller is the owner", async () => {
      it("should work", async () => {
        await strategyOracleLiquidate.setDiscountFactor(farmingToken.address, baseToken.address, "9300");
        expect(await strategyOracleLiquidate.discountFactors(farmingToken.address, baseToken.address)).to.be.eq("9300");
        expect(await strategyOracleLiquidate.discountFactors(baseToken.address, farmingToken.address)).to.be.eq("9300");
      });
    });
  });

  context("#getDiscountFactor", async () => {
    context("when discount factor for t0t1 not set", async () => {
      it("should return default discount factor", async () => {
        expect(await strategyOracleLiquidate.getDiscountFactor(farmingToken.address, baseToken.address)).to.be.eq(
          DEFAULT_DISCOUNT_FACTOR
        );
      });
    });

    context("when query discount factor for t0t1 is set", async () => {
      it("should return correct discount factor", async () => {
        await strategyOracleLiquidate.setDiscountFactor(farmingToken.address, baseToken.address, "9500");
        expect(await strategyOracleLiquidate.getDiscountFactor(farmingToken.address, baseToken.address)).to.be.eq(
          "9500"
        );
        expect(await strategyOracleLiquidate.getDiscountFactor(baseToken.address, farmingToken.address)).to.be.eq(
          "9500"
        );
      });
    });
  });

  context("#execute", async () => {
    beforeEach(async () => {
      await priceOracle.setPrices([farmingToken.address], [baseToken.address], [ethers.utils.parseEther("1.45")]);
      await strategyOracleLiquidate.setWorkersOk([mockWorker.address], true);
    });

    context("when caller is not a whitelisted worker", async () => {
      it("should revert", async () => {
        await expect(
          strategyOracleLiquidate.execute(
            deployer.address,
            ethers.utils.parseUnits("7000", 6),
            ethers.utils.defaultAbiCoder.encode(["uint256"], [0])
          )
        ).to.be.revertedWith("StrategyOracleLiquidate_NotWhitelistedWorker()");
      });
    });

    context("when caller is a whitelisted worker", async () => {
      beforeEach(async () => {
        await strategyOracleLiquidate.setWorkersOk([mockWorker.address], true);
        await baseToken.connect(liquiditySource).approve(strategyOracleLiquidate.address, ethers.constants.MaxUint256);
      });

      context("when price stale", async () => {
        it("should revert", async () => {
          await timeHelper.increase(timeHelper.duration.days(1));
          await expect(
            mockWorker.work(
              0,
              deployer.address,
              ethers.utils.parseUnits("7000", 6),
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [strategyOracleLiquidate.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [0])]
              )
            )
          ).to.be.revertedWith("StrategyOracleLiquidate_PriceStale()");
        });
      });

      context("when received base token < _minBaseToken", async () => {
        it("should revert", async () => {
          await farmBasePair.transfer(mockWorker.address, await farmBasePair.balanceOf(deployer.address));
          await expect(
            mockWorker.work(
              0,
              deployer.address,
              ethers.utils.parseUnits("7000", 6),
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [
                  strategyOracleLiquidate.address,
                  ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.constants.MaxUint256]),
                ]
              )
            )
          ).to.be.revertedWith("StrategyOracleLiquidate_Slippage()");
        });
      });

      context("when every params are correct", async () => {
        it("should work", async () => {
          await farmBasePair.transfer(mockWorker.address, await farmBasePair.balanceOf(deployer.address));

          const deployerBaseTokenBefore = await baseToken.balanceOf(deployer.address);
          const deployerFarmingTokenBefore = await farmingToken.balanceOf(deployer.address);

          const liquiditySourceBaseTokenBefore = await baseToken.balanceOf(liquiditySource.address);
          const liquiditySourceFarmingTokenBefore = await farmingToken.balanceOf(liquiditySource.address);

          await mockWorker.work(
            0,
            deployer.address,
            ethers.utils.parseUnits("7000", 6),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strategyOracleLiquidate.address,
                ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseUnits("14106.550919", 6)]),
              ]
            )
          );

          const deployerBaseTokenAfter = await baseToken.balanceOf(deployer.address);
          const deployerFarmingTokenAfter = await farmingToken.balanceOf(deployer.address);

          const liquiditySourceBaseTokenAfter = await baseToken.balanceOf(liquiditySource.address);
          const liquiditySourceFarmingTokenAfter = await farmingToken.balanceOf(liquiditySource.address);

          expect(deployerBaseTokenAfter.sub(deployerBaseTokenBefore)).to.be.eq(
            ethers.utils.parseUnits("21106.550919", 6)
          );
          expect(deployerFarmingTokenAfter).to.be.eq(deployerFarmingTokenBefore);
          expect(liquiditySourceBaseTokenBefore.sub(liquiditySourceBaseTokenAfter)).to.be.eq(
            ethers.utils.parseUnits("14209.999458", 6)
          );
          expect(liquiditySourceFarmingTokenAfter.sub(liquiditySourceFarmingTokenBefore)).to.be.eq(
            ethers.utils.parseUnits("9999.9996192", 7)
          );
        });
      });
    });
  });
});
