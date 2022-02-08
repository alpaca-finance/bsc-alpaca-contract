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
  WETH,
  WETH__factory,
  CakeToken,
  CakeToken__factory,
  SimplePriceOracle,
  SimplePriceOracle__factory,
  MockPancakeswapV2Worker,
  WorkerConfig__factory,
  WorkerConfig,
  MockPancakeswapV2Worker__factory,
  PancakePair__factory,
  IERC20__factory,
} from "../../../../typechain";
import * as TimeHelpers from "../../../helpers/time";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
const { expect } = chai;

describe("WokerConfig", () => {
  const FOREVER = "2000000000";

  /// PancakeswapV2-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouterV2;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let decimal6: MockERC20;
  let decimal8: MockERC20;
  let cake: CakeToken;

  // Accounts
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let eve: SignerWithAddress;

  // WorkerConfig instance
  let workerConfig: WorkerConfig;

  // Workers
  let mockWorker1: MockPancakeswapV2Worker;
  let mockWorker2: MockPancakeswapV2Worker;
  let mockWorker3: MockPancakeswapV2Worker;
  let mockWorker4: MockPancakeswapV2Worker;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;

  let cakeAsAlice: MockERC20;

  let wbnbTokenAsAlice: WETH;
  let wbnbTokenAsBob: WETH;

  let routerV2AsAlice: PancakeRouterV2;
  let simplePriceOracleAsAlice: SimplePriceOracle;
  let workerConfigAsAlice: WorkerConfig;

  /// SimpleOracle-related instance(s)
  let simplePriceOracle: SimplePriceOracle;
  let lpPriceFarmBNB: BigNumber;
  let lpPriceBNBFarm: BigNumber;

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

    /// Deploy WorkerConfig
    const WorkerConfig = (await ethers.getContractFactory("WorkerConfig", deployer)) as WorkerConfig__factory;
    workerConfig = (await upgrades.deployProxy(WorkerConfig, [simplePriceOracle.address])) as WorkerConfig;
    await workerConfig.deployed();

    /// Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    baseToken = (await upgrades.deployProxy(MockERC20, ["BTOKEN", "BTOKEN", 18])) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther("100"));

    const CakeToken = (await ethers.getContractFactory("CakeToken", deployer)) as CakeToken__factory;
    cake = await CakeToken.deploy();
    await cake.deployed();
    await cake["mint(address,uint256)"](await deployer.getAddress(), ethers.utils.parseEther("100"));
    await cake["mint(address,uint256)"](await alice.getAddress(), ethers.utils.parseEther("10"));
    await cake["mint(address,uint256)"](await bob.getAddress(), ethers.utils.parseEther("10"));

    decimal6 = (await upgrades.deployProxy(MockERC20, ["DEC6", "DEC6", 6])) as MockERC20;
    await decimal6.deployed();
    await decimal6.mint(deployer.address, ethers.utils.parseUnits("88888888", 6));

    decimal8 = (await upgrades.deployProxy(MockERC20, ["DEC8", "DEC8", 8])) as MockERC20;
    await decimal8.deployed();
    await decimal8.mint(deployer.address, ethers.utils.parseUnits("88888888", 8));

    await Promise.all([
      factoryV2.createPair(cake.address, wbnb.address),
      factoryV2.createPair(decimal6.address, wbnb.address),
      factoryV2.createPair(decimal8.address, wbnb.address),
      factoryV2.createPair(decimal6.address, decimal8.address),
    ]);

    const [cakewbnbLp, dec6wbnbLp, dec8wbnbLp, dec8dec6Lp] = await Promise.all([
      PancakePair__factory.connect(await factoryV2.getPair(wbnb.address, cake.address), deployer),
      PancakePair__factory.connect(await factoryV2.getPair(wbnb.address, decimal6.address), deployer),
      PancakePair__factory.connect(await factoryV2.getPair(wbnb.address, decimal8.address), deployer),
      PancakePair__factory.connect(await factoryV2.getPair(decimal8.address, decimal6.address), deployer),
    ]);

    /// Setup MockWorker
    const MockWorker = (await ethers.getContractFactory(
      "MockPancakeswapV2Worker",
      deployer
    )) as MockPancakeswapV2Worker__factory;
    mockWorker1 = (await MockWorker.deploy(cakewbnbLp.address, wbnb.address, cake.address)) as MockPancakeswapV2Worker;
    await mockWorker1.deployed();

    mockWorker2 = (await MockWorker.deploy(
      dec6wbnbLp.address,
      decimal6.address,
      wbnb.address
    )) as MockPancakeswapV2Worker;
    await mockWorker2.deployed();

    mockWorker3 = (await MockWorker.deploy(
      dec8wbnbLp.address,
      decimal8.address,
      wbnb.address
    )) as MockPancakeswapV2Worker;
    await mockWorker3.deployed();

    mockWorker4 = (await MockWorker.deploy(
      dec8dec6Lp.address,
      decimal6.address,
      decimal8.address
    )) as MockPancakeswapV2Worker;
    await mockWorker4.deployed();

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    cakeAsAlice = MockERC20__factory.connect(cake.address, alice);
    wbnbTokenAsAlice = WETH__factory.connect(wbnb.address, alice);
    wbnbTokenAsBob = WETH__factory.connect(wbnb.address, bob);
    routerV2AsAlice = PancakeRouterV2__factory.connect(routerV2.address, alice);
    workerConfigAsAlice = WorkerConfig__factory.connect(workerConfig.address, alice);
    simplePriceOracleAsAlice = SimplePriceOracle__factory.connect(simplePriceOracle.address, alice);
    await simplePriceOracle.setFeeder(await alice.getAddress());

    // Adding liquidity to the pool
    // Alice adds 0.1 FTOKEN + 1 WBTC + 1 WBNB
    await wbnbTokenAsAlice.deposit({
      value: ethers.utils.parseEther("8888"),
    });
    await wbnb.deposit({
      value: ethers.utils.parseEther("8888"),
    });
    await Promise.all([
      cakeAsAlice.approve(routerV2.address, ethers.constants.MaxUint256),
      baseTokenAsAlice.approve(routerV2.address, ethers.constants.MaxUint256),
      wbnbTokenAsAlice.approve(routerV2.address, ethers.constants.MaxUint256),
      wbnb.approve(routerV2.address, ethers.constants.MaxUint256),
      decimal6.approve(routerV2.address, ethers.constants.MaxUint256),
      decimal8.approve(routerV2.address, ethers.constants.MaxUint256),
    ]);
    // Add liquidity to the WBNB-FTOKEN pool on Pancakeswap
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
    // Add liquidity to DEC6-WBNB pool
    await routerV2.addLiquidity(
      decimal6.address,
      wbnb.address,
      ethers.utils.parseUnits("0.1", 6),
      ethers.utils.parseUnits("1", 18),
      "0",
      "0",
      deployer.address,
      FOREVER
    );
    // Add liquidity to DEC8-WBNB pool
    await routerV2.addLiquidity(
      decimal8.address,
      wbnb.address,
      ethers.utils.parseUnits("0.1", 8),
      ethers.utils.parseUnits("1", 18),
      "0",
      "0",
      deployer.address,
      FOREVER
    );
    // Add liquidity to DEC6-DEC8 pool
    await routerV2.addLiquidity(
      decimal6.address,
      decimal8.address,
      ethers.utils.parseUnits("0.1", 6),
      ethers.utils.parseUnits("1", 8),
      "0",
      "0",
      deployer.address,
      FOREVER
    );

    lpPriceFarmBNB = ethers.utils.parseEther("1").mul(ethers.utils.parseEther("1")).div(ethers.utils.parseEther("0.1"));
    lpPriceBNBFarm = ethers.utils.parseEther("0.1").mul(ethers.utils.parseEther("1")).div(ethers.utils.parseEther("1"));

    await workerConfig.setConfigs(
      [mockWorker1.address, mockWorker2.address, mockWorker3.address, mockWorker4.address],
      [
        { acceptDebt: true, workFactor: 1, killFactor: 1, maxPriceDiff: 11000 },
        { acceptDebt: true, workFactor: 1, killFactor: 1, maxPriceDiff: 11000 },
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
        await expect(workerConfigAsAlice.setGovernor(await deployer.getAddress())).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    context("when an owner set governor", async () => {
      it("should work", async () => {
        await workerConfig.setGovernor(await deployer.getAddress());
        expect(await workerConfig.governor()).to.be.eq(await deployer.getAddress());
      });
    });

    context("when non governor try to use emergencySetAcceptDebt", async () => {
      it("should revert", async () => {
        await expect(workerConfigAsAlice.emergencySetAcceptDebt([mockWorker1.address], false)).to.be.revertedWith(
          "WorkerConfig::onlyGovernor:: msg.sender not governor"
        );
      });
    });

    context("when governor uses emergencySetAcceptDebt", async () => {
      it("should work", async () => {
        await workerConfig.setGovernor(await deployer.getAddress());
        await workerConfig.emergencySetAcceptDebt([mockWorker1.address, mockWorker2.address], false);
        expect((await workerConfig.workers(mockWorker1.address)).acceptDebt).to.be.eq(false);
        expect((await workerConfig.workers(mockWorker1.address)).workFactor).to.be.eq(1);
        expect((await workerConfig.workers(mockWorker1.address)).killFactor).to.be.eq(1);
        expect((await workerConfig.workers(mockWorker1.address)).maxPriceDiff).to.be.eq(11000);

        expect((await workerConfig.workers(mockWorker2.address)).acceptDebt).to.be.eq(false);
        expect((await workerConfig.workers(mockWorker2.address)).workFactor).to.be.eq(1);
        expect((await workerConfig.workers(mockWorker2.address)).killFactor).to.be.eq(1);
        expect((await workerConfig.workers(mockWorker2.address)).maxPriceDiff).to.be.eq(11000);
      });
    });
  });

  describe("#isStable", async () => {
    context("when both tokens are 18 decimals", async () => {
      context("when the oracle hasn't updated any prices", async () => {
        it("should be reverted", async () => {
          await simplePriceOracleAsAlice.setPrices([wbnb.address, cake.address], [cake.address, wbnb.address], [1, 1]);
          await TimeHelpers.increase(BigNumber.from("86401")); // 1 day and 1 second have passed
          await expect(workerConfigAsAlice.isStable(mockWorker1.address)).to.revertedWith(
            "WorkerConfig::isStable:: price too stale"
          );
        });
      });

      context("when price is too high", async () => {
        it("should be reverted", async () => {
          // feed the price with price too low on the first hop
          await simplePriceOracleAsAlice.setPrices(
            [wbnb.address, cake.address],
            [cake.address, wbnb.address],
            [lpPriceBNBFarm.mul(10000).div(11001), lpPriceFarmBNB.mul(10000).div(11001)]
          );
          await expect(workerConfigAsAlice.isStable(mockWorker1.address)).to.revertedWith(
            "WorkerConfig::isStable:: price too high"
          );
        });
      });

      context("when price is too low", async () => {
        it("should be reverted", async () => {
          // feed the price with price too low on the first hop
          await simplePriceOracleAsAlice.setPrices(
            [wbnb.address, cake.address],
            [cake.address, wbnb.address],
            [lpPriceBNBFarm.mul(11001).div(10000), lpPriceFarmBNB.mul(11001).div(10000)]
          );
          await expect(workerConfigAsAlice.isStable(mockWorker1.address)).to.revertedWith(
            "WorkerConfig::isStable:: price too low"
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
          const isStable = await workerConfigAsAlice.isStable(mockWorker1.address);
          expect(isStable).to.true;
        });
      });
    });

    context("when 6 decimals and 18 decimals", async () => {
      context("when the oracle hasn't updated any prices", async () => {
        it("should be reverted", async () => {
          await simplePriceOracleAsAlice.setPrices(
            [decimal6.address, wbnb.address],
            [wbnb.address, decimal6.address],
            [1, 1]
          );
          await TimeHelpers.increase(BigNumber.from("86401")); // 1 day and 1 second have passed
          await expect(workerConfigAsAlice.isStable(mockWorker2.address)).to.revertedWith(
            "WorkerConfig::isStable:: price too stale"
          );
        });
      });

      context("when price is too high", async () => {
        it("should be reverted", async () => {
          // feed the price with price too low on the first hop
          await simplePriceOracleAsAlice.setPrices(
            [wbnb.address, decimal6.address],
            [decimal6.address, wbnb.address],
            [lpPriceBNBFarm.mul(10000).div(11001), lpPriceFarmBNB.mul(10000).div(11001)]
          );
          await expect(workerConfigAsAlice.isStable(mockWorker2.address)).to.revertedWith(
            "WorkerConfig::isStable:: price too high"
          );
        });
      });

      context("when price is too low", async () => {
        it("should be reverted", async () => {
          // feed the price with price too low on the first hop
          await simplePriceOracleAsAlice.setPrices(
            [wbnb.address, decimal6.address],
            [decimal6.address, wbnb.address],
            [lpPriceBNBFarm.mul(11001).div(10000), lpPriceFarmBNB.mul(11001).div(10000)]
          );
          await expect(workerConfigAsAlice.isStable(mockWorker2.address)).to.revertedWith(
            "WorkerConfig::isStable:: price too low"
          );
        });
      });

      context("when price is stable", async () => {
        it("should return true", async () => {
          // feed the price with price too low on the first hop
          await simplePriceOracleAsAlice.setPrices(
            [wbnb.address, decimal6.address],
            [decimal6.address, wbnb.address],
            [lpPriceBNBFarm, lpPriceFarmBNB]
          );
          const isStable = await workerConfigAsAlice.isStable(mockWorker2.address);
          expect(isStable).to.true;
        });
      });
    });

    context("when 8 decimals and 18 decimals", async () => {
      context("when the oracle hasn't updated any prices", async () => {
        it("should be reverted", async () => {
          await simplePriceOracleAsAlice.setPrices(
            [decimal8.address, wbnb.address],
            [wbnb.address, decimal8.address],
            [1, 1]
          );
          await TimeHelpers.increase(BigNumber.from("86401")); // 1 day and 1 second have passed
          await expect(workerConfigAsAlice.isStable(mockWorker3.address)).to.revertedWith(
            "WorkerConfig::isStable:: price too stale"
          );
        });
      });

      context("when price is too high", async () => {
        it("should be reverted", async () => {
          // feed the price with price too low on the first hop
          await simplePriceOracleAsAlice.setPrices(
            [wbnb.address, decimal8.address],
            [decimal8.address, wbnb.address],
            [lpPriceBNBFarm.mul(10000).div(11001), lpPriceFarmBNB.mul(10000).div(11001)]
          );
          await expect(workerConfigAsAlice.isStable(mockWorker3.address)).to.revertedWith(
            "WorkerConfig::isStable:: price too high"
          );
        });
      });

      context("when price is too low", async () => {
        it("should be reverted", async () => {
          // feed the price with price too low on the first hop
          await simplePriceOracleAsAlice.setPrices(
            [wbnb.address, decimal8.address],
            [decimal8.address, wbnb.address],
            [lpPriceBNBFarm.mul(11001).div(10000), lpPriceFarmBNB.mul(11001).div(10000)]
          );
          await expect(workerConfigAsAlice.isStable(mockWorker3.address)).to.revertedWith(
            "WorkerConfig::isStable:: price too low"
          );
        });
      });

      context("when price is stable", async () => {
        it("should return true", async () => {
          // feed the price with price too low on the first hop
          await simplePriceOracleAsAlice.setPrices(
            [wbnb.address, decimal8.address],
            [decimal8.address, wbnb.address],
            [lpPriceBNBFarm, lpPriceFarmBNB]
          );
          const isStable = await workerConfigAsAlice.isStable(mockWorker3.address);
          expect(isStable).to.true;
        });
      });
    });

    context("when 8 decimals and 6 decimals", async () => {
      context("when the oracle hasn't updated any prices", async () => {
        it("should be reverted", async () => {
          await simplePriceOracleAsAlice.setPrices(
            [decimal6.address, decimal8.address],
            [decimal8.address, decimal6.address],
            [1, 1]
          );
          await TimeHelpers.increase(BigNumber.from("86401")); // 1 day and 1 second have passed
          await expect(workerConfigAsAlice.isStable(mockWorker4.address)).to.revertedWith(
            "WorkerConfig::isStable:: price too stale"
          );
        });
      });

      context("when price is too high", async () => {
        it("should be reverted", async () => {
          // feed the price with price too low on the first hop
          await simplePriceOracleAsAlice.setPrices(
            [decimal8.address, decimal6.address],
            [decimal6.address, decimal8.address],
            [lpPriceBNBFarm.mul(10000).div(11001), lpPriceFarmBNB.mul(10000).div(11001)]
          );
          await expect(workerConfigAsAlice.isStable(mockWorker4.address)).to.revertedWith(
            "WorkerConfig::isStable:: price too high"
          );
        });
      });

      context("when price is too low", async () => {
        it("should be reverted", async () => {
          // feed the price with price too low on the first hop
          await simplePriceOracleAsAlice.setPrices(
            [decimal8.address, decimal6.address],
            [decimal6.address, decimal8.address],
            [lpPriceBNBFarm.mul(11001).div(10000), lpPriceFarmBNB.mul(11001).div(10000)]
          );
          await expect(workerConfigAsAlice.isStable(mockWorker4.address)).to.revertedWith(
            "WorkerConfig::isStable:: price too low"
          );
        });
      });

      context("when price is stable", async () => {
        it("should return true", async () => {
          // feed the price with price too low on the first hop
          await simplePriceOracleAsAlice.setPrices(
            [decimal8.address, decimal6.address],
            [decimal6.address, decimal8.address],
            [lpPriceBNBFarm, lpPriceFarmBNB]
          );
          const isStable = await workerConfigAsAlice.isStable(mockWorker4.address);
          expect(isStable).to.true;
        });
      });
    });
  });

  describe("#isReserveConsistent", async () => {
    context("when reserve is consistent", async () => {
      it("should return true", async () => {
        expect(await workerConfig.isReserveConsistent(mockWorker1.address)).to.be.eq(true);
      });
    });

    context("when reserve is inconsistent", async () => {
      it("should revert", async () => {
        const lp = PancakePair__factory.connect(await factoryV2.getPair(cake.address, wbnb.address), deployer);
        const [t0Address, t1Address] = await Promise.all([lp.token0(), lp.token1()]);
        const [token0, token1] = [
          IERC20__factory.connect(t0Address, deployer),
          IERC20__factory.connect(t1Address, deployer),
        ];

        if (token0.address === wbnb.address) await wbnb.deposit({ value: ethers.utils.parseEther("10") });
        await token0.transfer(lp.address, ethers.utils.parseEther("10"));
        await expect(workerConfig.isReserveConsistent(mockWorker1.address)).to.be.revertedWith(
          "WorkerConfig::isReserveConsistent:: bad t0 balance"
        );

        await lp.skim(await deployer.getAddress());

        if (token1.address === wbnb.address) await wbnb.deposit({ value: ethers.utils.parseEther("10") });
        await token1.transfer(lp.address, ethers.utils.parseEther("10"));
        await expect(workerConfig.isReserveConsistent(mockWorker1.address)).to.be.revertedWith(
          "WorkerConfig::isReserveConsistent:: bad t1 balance"
        );

        await lp.skim(await deployer.getAddress());
      });
    });
  });
});
