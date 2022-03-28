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
  StrategyOracleMinimize,
  StrategyOracleMinimize__factory,
  WaultSwapFactory,
  WaultSwapRouter,
  WNativeRelayer,
  WNativeRelayer__factory,
} from "../../../../../typechain";
import { DeployHelper } from "../../../../helpers/deploy";
import { SwapHelper } from "../../../../helpers/swap";
import * as timeHelper from "../../../../helpers/time";

chai.should();
chai.use(smock.matchers);
chai.use(solidity);
const { expect } = chai;

describe("Waultswap - StrategyOracleMinimize", () => {
  const DEFAULT_DISCOUNT_FACTOR = "9800";

  let deployer: SignerWithAddress;
  let liquiditySource: SignerWithAddress;

  let baseToken: IERC20;
  let farmingToken: IERC20;

  let mockWorker: MockWaultSwapWorker;
  let mockBnbBaseWorker: MockWaultSwapWorker;

  let wbnb: MockWBNB;
  let factory: WaultSwapFactory;
  let router: WaultSwapRouter;
  let farmBasePair: IERC20;
  let bnbBasePair: IERC20;

  let priceOracle: SimplePriceOracle;

  let wnativeRelayer: WNativeRelayer;

  let strategyOracleMinimize: StrategyOracleMinimize;

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
      {
        token0: wbnb,
        token1: baseToken,
        amount0desired: ethers.utils.parseUnits("10000", 18),
        amount1desired: ethers.utils.parseUnits("6896.551724", 6),
      },
    ]);
    farmBasePair = IERC20__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);
    bnbBasePair = IERC20__factory.connect(await factory.getPair(wbnb.address, baseToken.address), deployer);

    const SimplePriceOracle = new SimplePriceOracle__factory(deployer);
    priceOracle = (await upgrades.deployProxy(SimplePriceOracle, [deployer.address])) as SimplePriceOracle;

    const WNativeRelayer = (await ethers.getContractFactory("WNativeRelayer", deployer)) as WNativeRelayer__factory;
    wnativeRelayer = await WNativeRelayer.deploy(wbnb.address);

    const StrategyOracleMinimize = (await ethers.getContractFactory(
      "StrategyOracleMinimize",
      deployer
    )) as StrategyOracleMinimize__factory;
    strategyOracleMinimize = (await upgrades.deployProxy(StrategyOracleMinimize, [
      "Some Oracle Minimize",
      router.address,
      wnativeRelayer.address,
      priceOracle.address,
      liquiditySource.address,
      DEFAULT_DISCOUNT_FACTOR,
    ])) as StrategyOracleMinimize;

    await wnativeRelayer.setCallerOk([strategyOracleMinimize.address], true);

    const MockWaultSwapWorker = new MockWaultSwapWorker__factory(deployer);
    mockWorker = await MockWaultSwapWorker.deploy(farmBasePair.address, baseToken.address, farmingToken.address);
    mockBnbBaseWorker = await MockWaultSwapWorker.deploy(bnbBasePair.address, baseToken.address, wbnb.address);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("#setWorkers", async () => {
    context("when caller is not the owner", async () => {
      it("should revert", async () => {
        await expect(
          StrategyOracleMinimize__factory.connect(strategyOracleMinimize.address, liquiditySource).setWorkersOk(
            [ethers.constants.AddressZero],
            true
          )
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });

    context("when caller is the owner", async () => {
      it("should work", async () => {
        await strategyOracleMinimize.setWorkersOk([mockWorker.address], true);
        expect(await strategyOracleMinimize.okWorkers(mockWorker.address)).to.be.eq(true);
      });
    });
  });

  context("#setDiscountFactor", async () => {
    context("when caller is not the owner", async () => {
      it("should revert", async () => {
        await expect(
          StrategyOracleMinimize__factory.connect(strategyOracleMinimize.address, liquiditySource).setDiscountFactor(
            farmingToken.address,
            baseToken.address,
            "9500"
          )
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });

    context("when caller is the owner", async () => {
      it("should work", async () => {
        await strategyOracleMinimize.setDiscountFactor(farmingToken.address, baseToken.address, "9300");
        expect(await strategyOracleMinimize.discountFactors(farmingToken.address, baseToken.address)).to.be.eq("9300");
        expect(await strategyOracleMinimize.discountFactors(baseToken.address, farmingToken.address)).to.be.eq("9300");
      });
    });
  });

  context("#getDiscountFactor", async () => {
    context("when discount factor for t0t1 not set", async () => {
      it("should return default discount factor", async () => {
        expect(await strategyOracleMinimize.getDiscountFactor(farmingToken.address, baseToken.address)).to.be.eq(
          DEFAULT_DISCOUNT_FACTOR
        );
      });
    });

    context("when query discount factor for t0t1 is set", async () => {
      it("should return correct discount factor", async () => {
        await strategyOracleMinimize.setDiscountFactor(farmingToken.address, baseToken.address, "9500");
        expect(await strategyOracleMinimize.getDiscountFactor(farmingToken.address, baseToken.address)).to.be.eq(
          "9500"
        );
        expect(await strategyOracleMinimize.getDiscountFactor(baseToken.address, farmingToken.address)).to.be.eq(
          "9500"
        );
      });
    });
  });

  context("#execute", async () => {
    beforeEach(async () => {
      await priceOracle.setPrices(
        [farmingToken.address, wbnb.address],
        [baseToken.address, baseToken.address],
        [ethers.utils.parseEther("1.45"), ethers.utils.parseEther("1.45")]
      );
      await strategyOracleMinimize.setWorkersOk([mockWorker.address, mockBnbBaseWorker.address], true);
    });

    context("when caller is not a whitelisted worker", async () => {
      it("should revert", async () => {
        await expect(
          strategyOracleMinimize.execute(
            deployer.address,
            ethers.utils.parseUnits("7000", 6),
            ethers.utils.defaultAbiCoder.encode(["uint256"], [0])
          )
        ).to.be.revertedWith("StrategyOracleMinimize_NotWhitelistedWorker()");
      });
    });

    context("when caller is a whitelisted worker", async () => {
      beforeEach(async () => {
        await strategyOracleMinimize.setWorkersOk([mockWorker.address, mockBnbBaseWorker.address], true);
        await baseToken.connect(liquiditySource).approve(strategyOracleMinimize.address, ethers.constants.MaxUint256);
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
                [strategyOracleMinimize.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [0])]
              )
            )
          ).to.be.revertedWith("StrategyOracleMinimize_PriceStale()");
        });
      });

      context("when received farming token < _minFarmingToken", async () => {
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
                  strategyOracleMinimize.address,
                  ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.constants.MaxUint256]),
                ]
              )
            )
          ).to.be.revertedWith("StrategyOracleMinimize_Slippage()");
        });
      });

      context("when debt <= base token", async () => {
        it("should work", async () => {
          await farmBasePair.transfer(mockWorker.address, await farmBasePair.balanceOf(deployer.address));

          const deployerBaseTokenBefore = await baseToken.balanceOf(deployer.address);
          const deployerFarmingTokenBefore = await farmingToken.balanceOf(deployer.address);

          const liquiditySourceBaseTokenBefore = await baseToken.balanceOf(liquiditySource.address);
          const liquiditySourceFarmTokenBefore = await farmingToken.balanceOf(liquiditySource.address);

          await mockWorker.work(
            0,
            deployer.address,
            ethers.utils.parseUnits("5000", 6),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                strategyOracleMinimize.address,
                ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseUnits("72.799816", 7)]),
              ]
            )
          );

          const deployerBaseTokenAfter = await baseToken.balanceOf(deployer.address);
          const deployerFarmingTokenAfter = await farmingToken.balanceOf(deployer.address);

          const liquiditySourceBaseTokenAfter = await baseToken.balanceOf(liquiditySource.address);
          const liquiditySourceFarmTokenAfter = await farmingToken.balanceOf(liquiditySource.address);

          // Should received all base token back; assuming 5,000 base token is debt.
          expect(deployerBaseTokenAfter.sub(deployerBaseTokenBefore)).to.be.eq(
            ethers.utils.parseUnits("6896.551461", 6)
          );
          expect(deployerFarmingTokenAfter.sub(deployerFarmingTokenBefore)).to.be.eq(
            ethers.utils.parseUnits("9999.9996192", 7)
          );
          expect(liquiditySourceBaseTokenAfter).to.be.eq(liquiditySourceBaseTokenBefore);
          expect(liquiditySourceFarmTokenAfter).to.be.eq(liquiditySourceFarmTokenBefore);
        });
      });

      context("when debt > base token", async () => {
        context("when farming token cannot cover debt", async () => {
          it("should revert", async () => {
            await farmBasePair.transfer(mockWorker.address, await farmBasePair.balanceOf(deployer.address));
            await expect(
              mockWorker.work(
                0,
                deployer.address,
                ethers.utils.parseUnits("21200", 6),
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [
                    strategyOracleMinimize.address,
                    ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.constants.MaxUint256]),
                  ]
                )
              )
            ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
          });
        });

        context("when farming token can cover debt", async () => {
          it("should work", async () => {
            await farmBasePair.transfer(mockWorker.address, await farmBasePair.balanceOf(deployer.address));
            const deployerBaseTokenBefore = await baseToken.balanceOf(deployer.address);
            const deployerFarmTokenBefore = await farmingToken.balanceOf(deployer.address);
            const liquiditySourceBaseTokenBefore = await baseToken.balanceOf(liquiditySource.address);
            const liquiditySourceFarmTokenBefore = await farmingToken.balanceOf(liquiditySource.address);

            await mockWorker.work(
              0,
              deployer.address,
              ethers.utils.parseUnits("7000", 6),
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [
                  strategyOracleMinimize.address,
                  ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseUnits("9927.1998029", 7)]),
                ]
              )
            );

            const deployerBaseTokenAfter = await baseToken.balanceOf(deployer.address);
            const deployerFarmTokenAfter = await farmingToken.balanceOf(deployer.address);
            const liquiditySourceBaseTokenAfter = await baseToken.balanceOf(liquiditySource.address);
            const liquiditySourceFarmTokenAfter = await farmingToken.balanceOf(liquiditySource.address);

            expect(deployerBaseTokenAfter.sub(deployerBaseTokenBefore)).to.be.eq(ethers.utils.parseUnits("7000", 6));
            expect(deployerFarmTokenAfter.sub(deployerFarmTokenBefore)).to.be.eq(
              ethers.utils.parseUnits("9927.1998029", 7)
            );
            expect(liquiditySourceBaseTokenBefore.sub(liquiditySourceBaseTokenAfter)).to.be.eq(
              ethers.utils.parseUnits("103.448539", 6)
            );
            expect(liquiditySourceFarmTokenAfter.sub(liquiditySourceFarmTokenBefore)).to.be.eq(
              ethers.utils.parseUnits("72.7998163", 7)
            );
          });
        });
      });

      context("when worker's farming token is wrapped native", async () => {
        context("when debt <= base token", async () => {
          it("should unwrap wrapped native and send back to a user", async () => {
            await bnbBasePair.transfer(mockBnbBaseWorker.address, await bnbBasePair.balanceOf(deployer.address));

            const deployerBaseTokenBefore = await baseToken.balanceOf(deployer.address);
            const deployerBnbBefore = await deployer.getBalance();

            const liquiditySourceBaseTokenBefore = await baseToken.balanceOf(liquiditySource.address);
            const liquiditySourceWbnbBefore = await wbnb.balanceOf(liquiditySource.address);

            await mockBnbBaseWorker.work(
              0,
              deployer.address,
              ethers.utils.parseUnits("5000", 6),
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [
                  strategyOracleMinimize.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ["uint256"],
                    [ethers.utils.parseUnits("9999.999999998795840542", 18)]
                  ),
                ]
              ),
              { gasPrice: 0 }
            );

            const deployerBaseTokenAfter = await baseToken.balanceOf(deployer.address);
            const deployerBnbAfter = await deployer.getBalance();

            const liquiditySourceBaseTokenAfter = await baseToken.balanceOf(liquiditySource.address);
            const liquiditySourceWbnbAfter = await wbnb.balanceOf(liquiditySource.address);

            // Should received all base token back; assuming 5,000 base token is debt.
            expect(deployerBaseTokenAfter.sub(deployerBaseTokenBefore)).to.be.eq(
              ethers.utils.parseUnits("6896.551723", 6)
            );
            expect(deployerBnbAfter.sub(deployerBnbBefore)).to.be.eq(
              ethers.utils.parseUnits("9999.999999998795840542", 18)
            );
            expect(liquiditySourceBaseTokenAfter).to.be.eq(liquiditySourceBaseTokenBefore);
            expect(liquiditySourceWbnbAfter).to.be.eq(liquiditySourceWbnbBefore);
          });
        });

        context("when debt > base token", async () => {
          context("when farming token can conver debt", async () => {
            it("should work", async () => {
              await bnbBasePair.transfer(mockBnbBaseWorker.address, await bnbBasePair.balanceOf(deployer.address));

              const deployerBaseTokenBefore = await baseToken.balanceOf(deployer.address);
              const deployerBnbBefore = await deployer.getBalance();

              const liquiditySourceBaseTokenBefore = await baseToken.balanceOf(liquiditySource.address);
              const liquiditySourceWbnbBefore = await wbnb.balanceOf(liquiditySource.address);

              await mockBnbBaseWorker.work(
                0,
                deployer.address,
                ethers.utils.parseUnits("7000", 6),
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [
                    strategyOracleMinimize.address,
                    ethers.utils.defaultAbiCoder.encode(
                      ["uint256"],
                      [ethers.utils.parseUnits("9927.200368049460", 18)]
                    ),
                  ]
                ),
                { gasPrice: 0 }
              );

              const deployerBaseTokenAfter = await baseToken.balanceOf(deployer.address);
              const deployerBnbAfter = await deployer.getBalance();

              const liquiditySourceBaseTokenAfter = await baseToken.balanceOf(liquiditySource.address);
              const liquiditySourceWbnbAfter = await wbnb.balanceOf(liquiditySource.address);

              expect(deployerBaseTokenAfter.sub(deployerBaseTokenBefore)).to.be.eq(ethers.utils.parseUnits("7000", 6));
              expect(deployerBnbAfter.sub(deployerBnbBefore)).to.be.eq(
                ethers.utils.parseUnits("9927.200368049464383822", 18)
              );
              expect(liquiditySourceBaseTokenBefore.sub(liquiditySourceBaseTokenAfter)).to.be.eq(
                ethers.utils.parseUnits("103.448277", 6)
              );
              expect(liquiditySourceWbnbAfter.sub(liquiditySourceWbnbBefore)).to.be.eq(
                ethers.utils.parseUnits("72.799631949331456720", 18)
              );
            });
          });
        });
      });
    });
  });
});
