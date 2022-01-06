import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  PancakeFactory,
  PancakeFactory__factory,
  PancakeRouterV2__factory,
  PancakeRouterV2,
  MockVaultForRestrictedCakeMaxiAddBaseWithFarm,
  MockVaultForRestrictedCakeMaxiAddBaseWithFarm__factory,
  WETH,
  WETH__factory,
  CakeToken,
  CakeToken__factory,
  SimplePriceOracle,
  SimplePriceOracle__factory,
  MockPancakeswapV2CakeMaxiWorker,
  MockPancakeswapV2CakeMaxiWorker__factory,
  PancakePair__factory,
  IERC20__factory,
  IERC20,
} from "../../../../typechain";
import * as TimeHelpers from "../../../helpers/time";
import { SingleAssetWorkerConfig__factory } from "../../../../typechain/factories/SingleAssetWorkerConfig__factory";
import { SingleAssetWorkerConfig } from "../../../../typechain/SingleAssetWorkerConfig";

chai.use(solidity);
const { expect } = chai;

describe("SingleAssetWorkerConfig", () => {
  const FOREVER = "2000000000";

  /// PancakeswapV2-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouterV2;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let cake: CakeToken;

  /// Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let eve: Signer;

  /// SingleAssetWorkerConfig
  let singleAssetWorkerConfig: SingleAssetWorkerConfig;

  /// Workers
  let cakeMaxiWorkerNative: MockPancakeswapV2CakeMaxiWorker;
  let cakeMaxiWorkerNonNative: MockPancakeswapV2CakeMaxiWorker;

  /// Vault
  let mockedVault: MockVaultForRestrictedCakeMaxiAddBaseWithFarm;

  /// Contract Signer
  let baseTokenAsAlice: MockERC20;

  let cakeAsAlice: MockERC20;

  let wbnbTokenAsAlice: WETH;
  let wbnbTokenAsBob: WETH;

  let routerV2AsAlice: PancakeRouterV2;
  let simplePriceOracleAsAlice: SimplePriceOracle;
  let singleAssetWorkerConfigAsAlice: SingleAssetWorkerConfig;

  /// SimpleOracle-related instance(s)
  let simplePriceOracle: SimplePriceOracle;

  /// LP Prices
  let lpPriceBaseBnb: BigNumber;
  let lpPriceFarmBNB: BigNumber;
  let lpPriceBNBFarm: BigNumber;
  let lpPriceBNBBase: BigNumber;

  async function fixture() {
    [deployer, alice, bob, eve] = await ethers.getSigners();
    /// Deploy SimpleOracle
    const SimplePriceOracle = (await ethers.getContractFactory(
      "SimplePriceOracle",
      deployer
    )) as SimplePriceOracle__factory;
    simplePriceOracle = (await upgrades.deployProxy(SimplePriceOracle, [
      await alice.getAddress(),
    ])) as SimplePriceOracle;
    await simplePriceOracle.deployed();

    // Setup Vault
    const MockVault = (await ethers.getContractFactory(
      "MockVaultForRestrictedCakeMaxiAddBaseWithFarm",
      deployer
    )) as MockVaultForRestrictedCakeMaxiAddBaseWithFarm__factory;
    mockedVault = (await upgrades.deployProxy(MockVault)) as MockVaultForRestrictedCakeMaxiAddBaseWithFarm;
    await mockedVault.deployed();

    await mockedVault.setMockOwner(await alice.getAddress());
    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
    factoryV2 = await PancakeFactory.deploy(await deployer.getAddress());
    await factoryV2.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();
    await wbnb.deployed();

    const PancakeRouterV2 = (await ethers.getContractFactory("PancakeRouterV2", deployer)) as PancakeRouterV2__factory;
    routerV2 = await PancakeRouterV2.deploy(factoryV2.address, wbnb.address);
    await routerV2.deployed();

    /// Deploy SingleAssetWorkerConfig
    const SingleAssetWorkerConfig = (await ethers.getContractFactory(
      "SingleAssetWorkerConfig",
      deployer
    )) as SingleAssetWorkerConfig__factory;
    singleAssetWorkerConfig = (await upgrades.deployProxy(SingleAssetWorkerConfig, [
      simplePriceOracle.address,
      routerV2.address,
    ])) as SingleAssetWorkerConfig;
    await singleAssetWorkerConfig.deployed();

    /// Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    baseToken = (await upgrades.deployProxy(MockERC20, ["BTOKEN", "BTOKEN", 18])) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(await deployer.getAddress(), ethers.utils.parseEther("1000"));
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther("1000"));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther("1000"));
    const CakeToken = (await ethers.getContractFactory("CakeToken", deployer)) as CakeToken__factory;
    cake = await CakeToken.deploy();
    await cake.deployed();
    await cake["mint(address,uint256)"](await deployer.getAddress(), ethers.utils.parseEther("1000"));
    await cake["mint(address,uint256)"](await alice.getAddress(), ethers.utils.parseEther("1000"));
    await cake["mint(address,uint256)"](await bob.getAddress(), ethers.utils.parseEther("1000"));
    await factoryV2.createPair(baseToken.address, wbnb.address);
    await factoryV2.createPair(cake.address, wbnb.address);

    /// Setup Cake Maxi Worker
    const CakeMaxiWorker = (await ethers.getContractFactory(
      "MockPancakeswapV2CakeMaxiWorker",
      deployer
    )) as MockPancakeswapV2CakeMaxiWorker__factory;
    cakeMaxiWorkerNative = (await CakeMaxiWorker.deploy(
      wbnb.address,
      cake.address,
      [wbnb.address, cake.address],
      [cake.address, wbnb.address]
    )) as MockPancakeswapV2CakeMaxiWorker;
    await cakeMaxiWorkerNative.deployed();
    cakeMaxiWorkerNonNative = (await CakeMaxiWorker.deploy(
      baseToken.address,
      cake.address,
      [baseToken.address, wbnb.address, cake.address],
      [cake.address, baseToken.address]
    )) as MockPancakeswapV2CakeMaxiWorker;
    await cakeMaxiWorkerNonNative.deployed();

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    cakeAsAlice = MockERC20__factory.connect(cake.address, alice);
    wbnbTokenAsAlice = WETH__factory.connect(wbnb.address, alice);
    wbnbTokenAsBob = WETH__factory.connect(wbnb.address, bob);
    routerV2AsAlice = PancakeRouterV2__factory.connect(routerV2.address, alice);
    singleAssetWorkerConfigAsAlice = SingleAssetWorkerConfig__factory.connect(singleAssetWorkerConfig.address, alice);
    simplePriceOracleAsAlice = SimplePriceOracle__factory.connect(simplePriceOracle.address, alice);
    await simplePriceOracle.setFeeder(await alice.getAddress());

    // Adding liquidity to the pool
    await wbnbTokenAsAlice.deposit({
      value: ethers.utils.parseEther("52"),
    });
    await wbnbTokenAsBob.deposit({
      value: ethers.utils.parseEther("50"),
    });
    await cakeAsAlice.approve(routerV2.address, ethers.utils.parseEther("0.1"));
    await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("1"));
    await wbnbTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("11"));
    // Add liquidity to the BTOKEN-WBNB pool on Pancakeswap
    await routerV2AsAlice.addLiquidity(
      baseToken.address,
      wbnb.address,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("10"),
      "0",
      "0",
      await alice.getAddress(),
      FOREVER
    );
    // Add liquidity to the CAKE-WBNB pool on Pancakeswap
    await routerV2AsAlice.addLiquidity(
      cake.address,
      wbnb.address,
      ethers.utils.parseEther("0.1"),
      ethers.utils.parseEther("1"),
      "0",
      "0",
      await alice.getAddress(),
      FOREVER
    );
    lpPriceBaseBnb = ethers.utils.parseEther("10").mul(ethers.utils.parseEther("1")).div(ethers.utils.parseEther("1"));
    lpPriceBNBBase = ethers.utils.parseEther("1").mul(ethers.utils.parseEther("1")).div(ethers.utils.parseEther("10"));
    lpPriceFarmBNB = ethers.utils.parseEther("1").mul(ethers.utils.parseEther("1")).div(ethers.utils.parseEther("0.1"));
    lpPriceBNBFarm = ethers.utils.parseEther("0.1").mul(ethers.utils.parseEther("1")).div(ethers.utils.parseEther("1"));
    await singleAssetWorkerConfig.setConfigs(
      [cakeMaxiWorkerNative.address, cakeMaxiWorkerNonNative.address],
      [
        { acceptDebt: true, workFactor: 1, killFactor: 1, maxPriceDiff: 11000 },
        { acceptDebt: true, workFactor: 1, killFactor: 1, maxPriceDiff: 11000 },
      ]
    );
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  describe("#emergencySetAcceptDebt", async () => {
    context("when non owner try to set governor", async () => {
      it("should be reverted", async () => {
        await expect(singleAssetWorkerConfigAsAlice.setGovernor(await deployer.getAddress())).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    context("when an owner set governor", async () => {
      it("should work", async () => {
        await singleAssetWorkerConfig.setGovernor(await deployer.getAddress());
        expect(await singleAssetWorkerConfig.governor()).to.be.eq(await deployer.getAddress());
      });
    });

    context("when non governor try to use emergencySetAcceptDebt", async () => {
      it("should revert", async () => {
        await expect(
          singleAssetWorkerConfigAsAlice.emergencySetAcceptDebt([cakeMaxiWorkerNative.address], false)
        ).to.be.revertedWith("SingleAssetWorkerConfig::onlyGovernor:: msg.sender not governor");
      });
    });

    context("when governor uses emergencySetAcceptDebt", async () => {
      it("should work", async () => {
        await singleAssetWorkerConfig.setGovernor(await deployer.getAddress());
        await singleAssetWorkerConfig.emergencySetAcceptDebt(
          [cakeMaxiWorkerNative.address, cakeMaxiWorkerNonNative.address],
          false
        );
        expect((await singleAssetWorkerConfig.workers(cakeMaxiWorkerNative.address)).acceptDebt).to.be.eq(false);
        expect((await singleAssetWorkerConfig.workers(cakeMaxiWorkerNative.address)).workFactor).to.be.eq(1);
        expect((await singleAssetWorkerConfig.workers(cakeMaxiWorkerNative.address)).killFactor).to.be.eq(1);
        expect((await singleAssetWorkerConfig.workers(cakeMaxiWorkerNative.address)).maxPriceDiff).to.be.eq(11000);

        expect((await singleAssetWorkerConfig.workers(cakeMaxiWorkerNonNative.address)).acceptDebt).to.be.eq(false);
        expect((await singleAssetWorkerConfig.workers(cakeMaxiWorkerNonNative.address)).workFactor).to.be.eq(1);
        expect((await singleAssetWorkerConfig.workers(cakeMaxiWorkerNonNative.address)).killFactor).to.be.eq(1);
        expect((await singleAssetWorkerConfig.workers(cakeMaxiWorkerNonNative.address)).maxPriceDiff).to.be.eq(11000);
      });
    });
  });

  describe("#isStable()", async () => {
    context("When the baseToken is not a wrap native", async () => {
      context("When the oracle hasn't updated any prices", async () => {
        it("should be reverted", async () => {
          await simplePriceOracleAsAlice.setPrices(
            [wbnb.address, cake.address, baseToken.address, wbnb.address],
            [baseToken.address, wbnb.address, wbnb.address, cake.address],
            [1, 1, 1, 1]
          );
          await TimeHelpers.increase(BigNumber.from("86401")); // 1 day and 1 second have passed
          await expect(singleAssetWorkerConfigAsAlice.isStable(cakeMaxiWorkerNonNative.address)).to.revertedWith(
            "SingleAssetWorkerConfig::isStable:: price too stale"
          );
        });
      });
      context("When the price on PCS is higher than oracle price with 10% threshold", async () => {
        it("should be reverted", async () => {
          // feed the price with price too low on the first hop
          await simplePriceOracleAsAlice.setPrices(
            [baseToken.address, wbnb.address],
            [wbnb.address, baseToken.address],
            [lpPriceFarmBNB.mul(10000).div(11001), lpPriceBNBFarm.mul(10000).div(11001)]
          );
          await expect(
            singleAssetWorkerConfigAsAlice.isStable(cakeMaxiWorkerNonNative.address),
            "BTOKEN -> WBNB is not too high"
          ).to.revertedWith("SingleAssetWorkerConfig::isStable:: price too high");
          // when price from oracle and PCS is within the range, but price from oracle is lower than the price on PCS on the second hop
          await simplePriceOracleAsAlice.setPrices(
            [baseToken.address, wbnb.address, cake.address, wbnb.address],
            [wbnb.address, baseToken.address, wbnb.address, cake.address],
            [lpPriceFarmBNB, lpPriceBNBFarm, lpPriceBaseBnb.mul(10000).div(11001), lpPriceBNBBase.mul(10000).div(11001)]
          );
          await expect(
            singleAssetWorkerConfigAsAlice.isStable(cakeMaxiWorkerNonNative.address),
            "WBNB -> CAKE is not too high"
          ).to.revertedWith("SingleAssetWorkerConfig::isStable:: price too high");
        });
      });

      context("When the price on PCS is lower than oracle price with 10% threshold", async () => {
        it("should be reverted", async () => {
          // feed the price with price too low on the first hop
          await simplePriceOracleAsAlice.setPrices(
            [baseToken.address, wbnb.address],
            [wbnb.address, baseToken.address],
            [lpPriceFarmBNB.mul(11001).div(10000), lpPriceBNBFarm.mul(11001).div(10000)]
          );
          await expect(singleAssetWorkerConfigAsAlice.isStable(cakeMaxiWorkerNonNative.address)).to.revertedWith(
            "SingleAssetWorkerConfig::isStable:: price too low"
          );
          // when price from oracle and PCS is within the range, but price from oracle is higher than the price on PCS on the second hop
          await simplePriceOracleAsAlice.setPrices(
            [baseToken.address, wbnb.address, cake.address, wbnb.address],
            [wbnb.address, baseToken.address, wbnb.address, cake.address],
            [lpPriceFarmBNB, lpPriceBNBFarm, lpPriceBaseBnb.mul(11001).div(10000), lpPriceBNBBase.mul(11001).div(10000)]
          );
          await expect(singleAssetWorkerConfigAsAlice.isStable(cakeMaxiWorkerNonNative.address)).to.revertedWith(
            "SingleAssetWorkerConfig::isStable:: price too low"
          );
        });
      });

      context("when price is stable", async () => {
        it("should return true", async () => {
          // feed the correct price on both hops
          await simplePriceOracleAsAlice.setPrices(
            [cake.address, wbnb.address, baseToken.address, wbnb.address],
            [wbnb.address, cake.address, wbnb.address, baseToken.address],
            [lpPriceFarmBNB, lpPriceBNBFarm, lpPriceBaseBnb, lpPriceBNBBase]
          );
          const isStable = await singleAssetWorkerConfigAsAlice.isStable(cakeMaxiWorkerNonNative.address);
          expect(isStable).to.true;
        });
      });
    });

    context("When the baseToken is a wrap native", async () => {
      context("When the oracle hasn't updated any prices", async () => {
        it("should be reverted", async () => {
          await simplePriceOracleAsAlice.setPrices([wbnb.address, cake.address], [cake.address, wbnb.address], [1, 1]);
          await TimeHelpers.increase(BigNumber.from("86401")); // 1 day and 1 second have passed
          await expect(singleAssetWorkerConfigAsAlice.isStable(cakeMaxiWorkerNative.address)).to.revertedWith(
            "SingleAssetWorkerConfig::isStable:: price too stale"
          );
        });
      });
      context("When price is too high", async () => {
        it("should be reverted", async () => {
          // feed the price with price too low on the first hop
          await simplePriceOracleAsAlice.setPrices(
            [wbnb.address, cake.address],
            [cake.address, wbnb.address],
            [lpPriceBNBFarm.mul(10000).div(11001), lpPriceFarmBNB.mul(10000).div(11001)]
          );
          await expect(singleAssetWorkerConfigAsAlice.isStable(cakeMaxiWorkerNative.address)).to.revertedWith(
            "SingleAssetWorkerConfig::isStable:: price too high"
          );
        });
      });

      context("When price is too low", async () => {
        it("should be reverted", async () => {
          // feed the price with price too low on the first hop
          await simplePriceOracleAsAlice.setPrices(
            [wbnb.address, cake.address],
            [cake.address, wbnb.address],
            [lpPriceBNBFarm.mul(11001).div(10000), lpPriceFarmBNB.mul(11001).div(10000)]
          );
          await expect(singleAssetWorkerConfigAsAlice.isStable(cakeMaxiWorkerNative.address)).to.revertedWith(
            "SingleAssetWorkerConfig::isStable:: price too low"
          );
        });
      });

      context("when price is stable", async () => {
        it("should return true", async () => {
          // feed the price with price too low on the first hop
          await simplePriceOracleAsAlice.setPrices(
            [wbnb.address, cake.address],
            [cake.address, wbnb.address],
            [lpPriceBNBFarm, lpPriceFarmBNB]
          );
          const isStable = await singleAssetWorkerConfigAsAlice.isStable(cakeMaxiWorkerNative.address);
          expect(isStable).to.true;
        });
      });
    });
  });

  describe("#isReserveConsistent", async () => {
    context("when reserve is consistent", async () => {
      it("should return true", async () => {
        expect(await singleAssetWorkerConfig.isReserveConsistent(cakeMaxiWorkerNonNative.address)).to.be.eq(true);
      });
    });

    context("when reserve is inconsistent", async () => {
      it("should revert", async () => {
        const path = [baseToken.address, wbnb.address, cake.address];
        for (let i = 1; i < path.length; i++) {
          const lp = PancakePair__factory.connect(await factoryV2.getPair(path[i - 1], path[i]), deployer);
          const [t0Address, t1Address] = await Promise.all([lp.token0(), lp.token1()]);
          const [token0, token1] = [
            IERC20__factory.connect(t0Address, deployer),
            IERC20__factory.connect(t1Address, deployer),
          ];

          if (token0.address === wbnb.address) await wbnb.deposit({ value: ethers.utils.parseEther("10") });
          await token0.transfer(lp.address, ethers.utils.parseEther("10"));
          await expect(singleAssetWorkerConfig.isReserveConsistent(cakeMaxiWorkerNonNative.address)).to.be.revertedWith(
            "SingleAssetWorkerConfig::isReserveConsistent:: bad t0 balance"
          );

          await lp.skim(await deployer.getAddress());

          if (token1.address === wbnb.address) await wbnb.deposit({ value: ethers.utils.parseEther("10") });
          await token1.transfer(lp.address, ethers.utils.parseEther("10"));
          await expect(singleAssetWorkerConfig.isReserveConsistent(cakeMaxiWorkerNonNative.address)).to.be.revertedWith(
            "SingleAssetWorkerConfig::isReserveConsistent:: bad t1 balance"
          );

          await lp.skim(await deployer.getAddress());
        }
      });
    });
  });
});
