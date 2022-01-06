import chai from "chai";
import "@openzeppelin/test-helpers";
import { solidity } from "ethereum-waffle";
import { BigNumber, Signer } from "ethers";
import { ethers, upgrades, waffle } from "hardhat";
import {
  ChainLinkPriceOracle,
  ChainLinkPriceOracle__factory,
  MockAggregatorV3,
  MockAggregatorV3__factory,
  MockERC20,
  MockERC20__factory,
} from "../../../../typechain";

chai.use(solidity);
const { expect } = chai;

// Accounts
let deployer: Signer;
let alice: Signer;

let token0: MockERC20;
let token1: MockERC20;
let token2: MockERC20;
let token3: MockERC20;

let mockAggregatorV3T0T1: MockAggregatorV3;
let mockAggregatorV3T1T0: MockAggregatorV3;
let mockAggregatorV3T2T3: MockAggregatorV3;
let mockAggregatorV3T0T2: MockAggregatorV3;

let chainLinkOracle: ChainLinkPriceOracle;
let chainLinkOracleAsDeployer: ChainLinkPriceOracle;
let chainLinkOracleAsAlice: ChainLinkPriceOracle;

describe("ChainLinkPriceOracle", () => {
  async function fixture() {
    [deployer, alice] = await ethers.getSigners();

    const ERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    token0 = (await upgrades.deployProxy(ERC20, ["token0", "token0", "18"])) as MockERC20;
    await token0.deployed();
    token1 = (await upgrades.deployProxy(ERC20, ["token1", "token1", "18"])) as MockERC20;
    await token1.deployed();
    token2 = (await upgrades.deployProxy(ERC20, ["token2", "token2", "18"])) as MockERC20;
    await token2.deployed();
    token3 = (await upgrades.deployProxy(ERC20, ["token3", "token3", "18"])) as MockERC20;
    await token3.deployed();

    const MockAggregatorV3 = (await ethers.getContractFactory(
      "MockAggregatorV3",
      deployer
    )) as MockAggregatorV3__factory;
    mockAggregatorV3T0T1 = await MockAggregatorV3.deploy(BigNumber.from("36500000000"), 8);
    await mockAggregatorV3T0T1.deployed();
    mockAggregatorV3T1T0 = await MockAggregatorV3.deploy(BigNumber.from("273972"), 8);
    await mockAggregatorV3T1T0.deployed();
    mockAggregatorV3T2T3 = await MockAggregatorV3.deploy(BigNumber.from("100000000"), 8);
    await mockAggregatorV3T2T3.deployed();
    mockAggregatorV3T0T2 = await MockAggregatorV3.deploy(BigNumber.from("10000000000000000000"), 19);
    await mockAggregatorV3T0T2.deployed();

    const ChainLinkPriceOracle = (await ethers.getContractFactory(
      "ChainLinkPriceOracle",
      deployer
    )) as ChainLinkPriceOracle__factory;
    chainLinkOracle = (await upgrades.deployProxy(ChainLinkPriceOracle)) as ChainLinkPriceOracle;
    await chainLinkOracle.deployed();
    chainLinkOracleAsDeployer = ChainLinkPriceOracle__factory.connect(chainLinkOracle.address, deployer);
    chainLinkOracleAsAlice = ChainLinkPriceOracle__factory.connect(chainLinkOracle.address, alice);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  describe("#setPriceFeeds", async () => {
    context("when the caller is not the owner", async () => {
      it("should be reverted", async () => {
        await expect(
          chainLinkOracleAsAlice.setPriceFeeds([token0.address], [token1.address], [mockAggregatorV3T0T1.address])
        ).to.revertedWith("Ownable: caller is not the owner");
      });
    });
    context("when the caller is the owner", async () => {
      context("when inconsistent length", async () => {
        it("should be reverted", async () => {
          await chainLinkOracleAsDeployer.setPriceFeeds(
            [token0.address],
            [token1.address],
            [mockAggregatorV3T0T1.address]
          );
          await expect(
            chainLinkOracleAsDeployer.setPriceFeeds(
              [token1.address, token2.address],
              [token0.address],
              [mockAggregatorV3T1T0.address]
            )
          ).to.revertedWith("ChainLinkPriceOracle::setPriceFeeds:: inconsistent length");
          await expect(
            chainLinkOracleAsDeployer.setPriceFeeds(
              [token1.address, token2.address],
              [token0.address, token3.address],
              [mockAggregatorV3T1T0.address]
            )
          ).to.revertedWith("ChainLinkPriceOracle::setPriceFeeds:: inconsistent length");
        });
      });
      context("when source on existed pair", async () => {
        it("should be reverted", async () => {
          await chainLinkOracleAsDeployer.setPriceFeeds(
            [token0.address],
            [token1.address],
            [mockAggregatorV3T0T1.address]
          );
          await expect(
            chainLinkOracleAsDeployer.setPriceFeeds([token1.address], [token0.address], [mockAggregatorV3T1T0.address])
          ).to.revertedWith("ChainLinkPriceOracle::setPriceFeed:: source on existed pair");
        });
      });
      context("when successfully", async () => {
        it("should successfully", async () => {
          await expect(
            chainLinkOracleAsDeployer.setPriceFeeds(
              [token0.address, token2.address],
              [token1.address, token3.address],
              [mockAggregatorV3T0T1.address, mockAggregatorV3T2T3.address]
            )
          ).to.emit(chainLinkOracleAsDeployer, "SetPriceFeed");

          const sourceT0T1 = await chainLinkOracleAsDeployer.priceFeeds(token0.address, token1.address);
          expect(sourceT0T1).to.eq(mockAggregatorV3T0T1.address);

          const sourceT2T3 = await chainLinkOracleAsDeployer.priceFeeds(token2.address, token3.address);
          expect(sourceT2T3).to.eq(mockAggregatorV3T2T3.address);
        });
      });
    });
  });

  describe("#getPrice", async () => {
    context("when no source", async () => {
      it("should be reverted", async () => {
        await expect(chainLinkOracleAsDeployer.getPrice(token1.address, token0.address)).to.revertedWith(
          "ChainLinkPriceOracle::getPrice:: no source"
        );
        await expect(chainLinkOracleAsDeployer.getPrice(token0.address, token1.address)).to.revertedWith(
          "ChainLinkPriceOracle::getPrice:: no source"
        );
      });
    });
    context("when successfully", async () => {
      it("should successfully", async () => {
        await chainLinkOracleAsDeployer.setPriceFeeds(
          [token0.address, token2.address, token0.address],
          [token1.address, token3.address, token2.address],
          [mockAggregatorV3T0T1.address, mockAggregatorV3T2T3.address, mockAggregatorV3T0T2.address]
        );

        const [priceT0T1] = await chainLinkOracleAsAlice.getPrice(token0.address, token1.address);
        // result should be (priceT0T1 * 1e18) / (10**decimals) = (36500000000 * 1e18) / (10**8) = 365000000000000000000
        expect(priceT0T1).to.eq(BigNumber.from("365000000000000000000"));

        const [priceT1T0] = await chainLinkOracleAsDeployer.getPrice(token1.address, token0.address);
        // result should be (1e18 * 10**decimals) / (priceT0T1) = (1e18 * 10**8) / (36500000000) = 2739726027397260
        expect(priceT1T0).to.eq(BigNumber.from("2739726027397260"));

        const [priceT2T3] = await chainLinkOracleAsAlice.getPrice(token2.address, token3.address);
        // result should be (priceT2T3 * 1e18) / (10**decimals) = (100000000 * 1e18) / (10**8) = 1000000000000000000
        expect(priceT2T3).to.eq(BigNumber.from("1000000000000000000"));

        const [priceT3T2] = await chainLinkOracleAsDeployer.getPrice(token3.address, token2.address);
        // result should be (1e18 * 10**decimals) / (priceT2T3) = (1e18 * 10**8) / (100000000) = 1000000000000000000
        expect(priceT3T2).to.eq(BigNumber.from("1000000000000000000"));

        const [priceT0T2] = await chainLinkOracleAsDeployer.getPrice(token0.address, token2.address);
        // result should be (priceT0T2 * 1e18) / (10**decimals) = (10000000000000000000 * 1e18) / (10**19) = 1000000000000000000
        expect(priceT0T2).to.eq("1000000000000000000");

        const [priceT2T0] = await chainLinkOracleAsDeployer.getPrice(token2.address, token0.address);
        // result should be (1e18 * 10**decimals) / (priceT2T0) = (1e18 * 10**19) / (10000000000000000000) = 1000000000000000000
        expect(priceT2T0).to.eq("1000000000000000000");
      });
    });
  });
});
