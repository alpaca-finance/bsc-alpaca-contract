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
  OracleMedianizer,
  OracleMedianizer__factory,
  SimplePriceOracle,
  SimplePriceOracle__factory,
} from "../../../typechain";
import * as TimeHelpers from "../../helpers/time";

chai.use(solidity);
const { expect } = chai;

// Accounts
let deployer: Signer;
let feeder: Signer;
let alice: Signer;

let token0: MockERC20;
let token1: MockERC20;
let token2: MockERC20;
let token3: MockERC20;

let simplePriceOracle: SimplePriceOracle;
let simplePriceOracleAsFeeder: SimplePriceOracle;

let mockAggregatorV3T0T1: MockAggregatorV3;
let mockAggregatorV3T0T1AsDeployer: MockAggregatorV3;

let chainLinkPriceOracle: ChainLinkPriceOracle;

let bobPriceOracle: SimplePriceOracle;
let bobPriceOracleAsFeeder: SimplePriceOracle;

let evePriceOracle: SimplePriceOracle;
let evePriceOracleAsFeeder: SimplePriceOracle;

let oracleMedianizer: OracleMedianizer;
let oracleMedianizerAsDeployer: OracleMedianizer;
let oracleMedianizerAsAlice: OracleMedianizer;

describe("OracleMedianizer", () => {
  async function fixture() {
    [deployer, feeder, alice] = await ethers.getSigners();

    const ERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    token0 = (await upgrades.deployProxy(ERC20, ["token0", "token0", "18"])) as MockERC20;
    await token0.deployed();
    token1 = (await upgrades.deployProxy(ERC20, ["token1", "token1", "18"])) as MockERC20;
    await token1.deployed();
    token2 = (await upgrades.deployProxy(ERC20, ["token2", "token2", "18"])) as MockERC20;
    await token0.deployed();
    token3 = (await upgrades.deployProxy(ERC20, ["token3", "token3", "18"])) as MockERC20;
    await token1.deployed();

    const SimplePriceOracle = (await ethers.getContractFactory(
      "SimplePriceOracle",
      deployer
    )) as SimplePriceOracle__factory;
    simplePriceOracle = (await upgrades.deployProxy(SimplePriceOracle, [
      await feeder.getAddress(),
    ])) as SimplePriceOracle;
    await simplePriceOracle.deployed();
    simplePriceOracleAsFeeder = SimplePriceOracle__factory.connect(simplePriceOracle.address, feeder);

    const MockAggregatorV3 = (await ethers.getContractFactory(
      "MockAggregatorV3",
      deployer
    )) as MockAggregatorV3__factory;
    mockAggregatorV3T0T1 = await MockAggregatorV3.deploy(BigNumber.from("900000000000000000"), 18);
    await mockAggregatorV3T0T1.deployed();
    mockAggregatorV3T0T1AsDeployer = MockAggregatorV3__factory.connect(mockAggregatorV3T0T1.address, deployer);

    const ChainLinkPriceOracle = (await ethers.getContractFactory(
      "ChainLinkPriceOracle",
      deployer
    )) as ChainLinkPriceOracle__factory;
    chainLinkPriceOracle = (await upgrades.deployProxy(ChainLinkPriceOracle)) as ChainLinkPriceOracle;
    chainLinkPriceOracle.deployed();

    const BobPriceOracle = (await ethers.getContractFactory(
      "SimplePriceOracle",
      deployer
    )) as SimplePriceOracle__factory;
    bobPriceOracle = (await upgrades.deployProxy(BobPriceOracle, [await feeder.getAddress()])) as SimplePriceOracle;
    await bobPriceOracle.deployed();
    bobPriceOracleAsFeeder = SimplePriceOracle__factory.connect(bobPriceOracle.address, feeder);

    const EvePriceOracle = (await ethers.getContractFactory(
      "SimplePriceOracle",
      deployer
    )) as SimplePriceOracle__factory;
    evePriceOracle = (await upgrades.deployProxy(EvePriceOracle, [await feeder.getAddress()])) as SimplePriceOracle;
    await evePriceOracle.deployed();
    evePriceOracleAsFeeder = SimplePriceOracle__factory.connect(evePriceOracle.address, feeder);

    const OracleMedianizer = (await ethers.getContractFactory(
      "OracleMedianizer",
      deployer
    )) as OracleMedianizer__factory;
    oracleMedianizer = (await upgrades.deployProxy(OracleMedianizer)) as OracleMedianizer;
    await oracleMedianizer.deployed();
    oracleMedianizerAsDeployer = OracleMedianizer__factory.connect(oracleMedianizer.address, deployer);
    oracleMedianizerAsAlice = OracleMedianizer__factory.connect(oracleMedianizer.address, alice);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  describe("#setPrimarySources", async () => {
    context("when the caller is not the owner", async () => {
      it("should be reverted", async () => {
        await expect(
          oracleMedianizerAsAlice.setPrimarySources(
            token0.address,
            token1.address,
            BigNumber.from("1000000000000000000"),
            60,
            [simplePriceOracle.address]
          )
        ).to.revertedWith("Ownable: caller is not the owner");
      });
    });
    context("when the caller is the owner", async () => {
      context("when bad max deviation value", async () => {
        it("should be reverted", async () => {
          await expect(
            oracleMedianizerAsDeployer.setPrimarySources(token0.address, token1.address, BigNumber.from("0"), 60, [
              simplePriceOracle.address,
            ])
          ).to.revertedWith("OracleMedianizer::setPrimarySources:: bad max deviation value");
        });
        it("should be reverted", async () => {
          await expect(
            oracleMedianizerAsDeployer.setPrimarySources(
              token0.address,
              token1.address,
              BigNumber.from("2000000000000000000"),
              60,
              [simplePriceOracle.address]
            )
          ).to.revertedWith("OracleMedianizer::setPrimarySources:: bad max deviation value");
        });
      });
      context("when sources length exceed 3", async () => {
        it("should be reverted", async () => {
          await expect(
            oracleMedianizerAsDeployer.setPrimarySources(
              token0.address,
              token1.address,
              BigNumber.from("1000000000000000000"),
              60,
              [
                simplePriceOracle.address,
                simplePriceOracle.address,
                simplePriceOracle.address,
                simplePriceOracle.address,
              ]
            )
          ).to.revertedWith("OracleMedianizer::setPrimarySources:: sources length exceed 3");
        });
      });
      context("when set SimplePriceOracle source", async () => {
        it("should successfully", async () => {
          await expect(
            oracleMedianizerAsDeployer.setPrimarySources(
              token0.address,
              token1.address,
              BigNumber.from("1000000000000000000"),
              60,
              [simplePriceOracle.address]
            )
          ).to.emit(oracleMedianizerAsDeployer, "SetPrimarySources");

          // T0T1 pair
          const sourceT0T1 = await oracleMedianizerAsDeployer.primarySources(token0.address, token1.address, 0);
          const sourceCountT0T1 = await oracleMedianizerAsDeployer.primarySourceCount(token0.address, token1.address);
          const maxPriceDeviationT0T1 = await oracleMedianizerAsDeployer.maxPriceDeviations(
            token0.address,
            token1.address
          );
          const maxPriceStaleT0T1 = await oracleMedianizerAsDeployer.maxPriceStales(token0.address, token1.address);

          expect(sourceT0T1).to.eq(simplePriceOracle.address);
          expect(sourceCountT0T1).to.eq(BigNumber.from(1));
          expect(maxPriceDeviationT0T1).to.eq(BigNumber.from("1000000000000000000"));
          expect(maxPriceStaleT0T1).to.eq(60);

          // T1T0 pair
          const sourceT1T0 = await oracleMedianizerAsDeployer.primarySources(token1.address, token0.address, 0);
          const sourceCountT1T0 = await oracleMedianizerAsDeployer.primarySourceCount(token1.address, token0.address);
          const maxPriceDeviationT1T0 = await oracleMedianizerAsDeployer.maxPriceDeviations(
            token1.address,
            token0.address
          );
          const maxPriceStaleT1T0 = await oracleMedianizerAsDeployer.maxPriceStales(token1.address, token0.address);

          expect(sourceT1T0).to.eq(simplePriceOracle.address);
          expect(sourceCountT1T0).to.eq(BigNumber.from(1));
          expect(maxPriceDeviationT1T0).to.eq(BigNumber.from("1000000000000000000"));
          expect(maxPriceStaleT1T0).to.eq(60);
        });
      });
      context("when set ChainLinkPriceOracle source", async () => {
        it("should successfully", async () => {
          await expect(
            oracleMedianizerAsDeployer.setPrimarySources(
              token0.address,
              token1.address,
              BigNumber.from("1000000000000000000"),
              60,
              [chainLinkPriceOracle.address]
            )
          ).to.emit(oracleMedianizerAsDeployer, "SetPrimarySources");

          // T0T1 pair
          const sourceT0T1 = await oracleMedianizerAsDeployer.primarySources(token0.address, token1.address, 0);
          const sourceCountT0T1 = await oracleMedianizerAsDeployer.primarySourceCount(token0.address, token1.address);
          const maxPriceDeviationT0T1 = await oracleMedianizerAsDeployer.maxPriceDeviations(
            token0.address,
            token1.address
          );
          const maxPriceStaleT0T1 = await oracleMedianizerAsDeployer.maxPriceStales(token0.address, token1.address);

          expect(sourceT0T1).to.eq(chainLinkPriceOracle.address);
          expect(sourceCountT0T1).to.eq(BigNumber.from(1));
          expect(maxPriceDeviationT0T1).to.eq(BigNumber.from("1000000000000000000"));
          expect(maxPriceStaleT0T1).to.eq(60);

          // T1T0 pair
          const sourceT1T0 = await oracleMedianizerAsDeployer.primarySources(token1.address, token0.address, 0);
          const sourceCountT1T0 = await oracleMedianizerAsDeployer.primarySourceCount(token1.address, token0.address);
          const maxPriceDeviationT1T0 = await oracleMedianizerAsDeployer.maxPriceDeviations(
            token1.address,
            token0.address
          );
          const maxPriceStaleT1T0 = await oracleMedianizerAsDeployer.maxPriceStales(token1.address, token0.address);

          expect(sourceT1T0).to.eq(chainLinkPriceOracle.address);
          expect(sourceCountT1T0).to.eq(BigNumber.from(1));
          expect(maxPriceDeviationT1T0).to.eq(BigNumber.from("1000000000000000000"));
          expect(maxPriceStaleT1T0).to.eq(60);
        });
      });
    });
  });

  describe("#setMultiPrimarySources", async () => {
    context("when inconsistent length", async () => {
      it("should be reverted", async () => {
        await expect(
          oracleMedianizerAsDeployer.setMultiPrimarySources(
            [token0.address, token2.address],
            [token1.address],
            [BigNumber.from("1000000000000000000")],
            [60],
            [[simplePriceOracle.address]]
          )
        ).to.revertedWith("OracleMedianizer::setMultiPrimarySources:: inconsistent length");
      });
      it("should be reverted", async () => {
        await expect(
          oracleMedianizerAsDeployer.setMultiPrimarySources(
            [token0.address, token2.address],
            [token1.address, token3.address],
            [BigNumber.from("1000000000000000000")],
            [60],
            [[simplePriceOracle.address]]
          )
        ).to.revertedWith("OracleMedianizer::setMultiPrimarySources:: inconsistent length");
      });
      it("should be reverted", async () => {
        await expect(
          oracleMedianizerAsDeployer.setMultiPrimarySources(
            [token0.address, token2.address],
            [token1.address, token3.address],
            [BigNumber.from("1000000000000000000"), BigNumber.from("900000000000000000")],
            [60],
            [[simplePriceOracle.address]]
          )
        ).to.revertedWith("OracleMedianizer::setMultiPrimarySources:: inconsistent length");
      });
      it("should be reverted", async () => {
        await expect(
          oracleMedianizerAsDeployer.setMultiPrimarySources(
            [token0.address, token2.address],
            [token1.address, token3.address],
            [BigNumber.from("1000000000000000000"), BigNumber.from("900000000000000000")],
            [60, 60],
            [[simplePriceOracle.address]]
          )
        ).to.revertedWith("OracleMedianizer::setMultiPrimarySources:: inconsistent length");
      });
    });
    context("when successfully", async () => {
      it("should successfully", async () => {
        await expect(
          oracleMedianizerAsDeployer.setMultiPrimarySources(
            [token0.address, token2.address],
            [token1.address, token3.address],
            [BigNumber.from("1000000000000000000"), BigNumber.from("1100000000000000000")],
            [60, 900],
            [
              [simplePriceOracle.address],
              [simplePriceOracle.address, bobPriceOracle.address, chainLinkPriceOracle.address],
            ]
          )
        ).to.emit(oracleMedianizerAsDeployer, "SetPrimarySources");
        // T0T1 pair
        const sourceT0T1 = await oracleMedianizerAsDeployer.primarySources(token0.address, token1.address, 0);
        const sourceCountT0T1 = await oracleMedianizerAsDeployer.primarySourceCount(token0.address, token1.address);
        const maxPriceDeviationT0T1 = await oracleMedianizerAsDeployer.maxPriceDeviations(
          token0.address,
          token1.address
        );
        const maxPriceStaleT0T1 = await oracleMedianizerAsDeployer.maxPriceStales(token0.address, token1.address);

        expect(sourceT0T1).to.eq(simplePriceOracle.address);
        expect(sourceCountT0T1).to.eq(BigNumber.from(1));
        expect(maxPriceDeviationT0T1).to.eq(BigNumber.from("1000000000000000000"));
        expect(maxPriceStaleT0T1).to.eq(60);

        // T1T0 pair
        const sourceT1T0 = await oracleMedianizerAsDeployer.primarySources(token1.address, token0.address, 0);
        const sourceCountT1T0 = await oracleMedianizerAsDeployer.primarySourceCount(token1.address, token0.address);
        const maxPriceDeviationT1T0 = await oracleMedianizerAsDeployer.maxPriceDeviations(
          token1.address,
          token0.address
        );
        const maxPriceStaleT1T0 = await oracleMedianizerAsDeployer.maxPriceStales(token1.address, token0.address);

        expect(sourceT1T0).to.eq(simplePriceOracle.address);
        expect(sourceCountT1T0).to.eq(BigNumber.from(1));
        expect(maxPriceDeviationT1T0).to.eq(BigNumber.from("1000000000000000000"));
        expect(maxPriceStaleT1T0).to.eq(60);

        // T2T3 pair
        // source 0
        const sourceT2T3 = await oracleMedianizerAsDeployer.primarySources(token2.address, token3.address, 0);
        // source 1
        const source1T2T3 = await oracleMedianizerAsDeployer.primarySources(token2.address, token3.address, 1);
        // source 2
        const source2T2T3 = await oracleMedianizerAsDeployer.primarySources(token2.address, token3.address, 2);

        const sourceCountT2T3 = await oracleMedianizerAsDeployer.primarySourceCount(token2.address, token3.address);
        const maxPriceDeviationT2T3 = await oracleMedianizerAsDeployer.maxPriceDeviations(
          token2.address,
          token3.address
        );
        const maxPriceStaleT2T3 = await oracleMedianizerAsDeployer.maxPriceStales(token2.address, token3.address);

        expect(sourceT2T3).to.eq(simplePriceOracle.address);
        expect(source1T2T3).to.eq(bobPriceOracle.address);
        expect(source2T2T3).to.eq(chainLinkPriceOracle.address);
        expect(sourceCountT2T3).to.eq(BigNumber.from(3));
        expect(maxPriceDeviationT2T3).to.eq(BigNumber.from("1100000000000000000"));
        expect(maxPriceStaleT2T3).to.eq(900);

        // T3T2 pair
        // source 0
        const sourceT3T2 = await oracleMedianizerAsDeployer.primarySources(token3.address, token2.address, 0);
        // source 1
        const source1T3T2 = await oracleMedianizerAsDeployer.primarySources(token3.address, token2.address, 1);
        // source 2
        const source2T3T2 = await oracleMedianizerAsDeployer.primarySources(token3.address, token2.address, 2);

        const sourceCountT3T2 = await oracleMedianizerAsDeployer.primarySourceCount(token3.address, token2.address);
        const maxPriceDeviationT3T2 = await oracleMedianizerAsDeployer.maxPriceDeviations(
          token3.address,
          token2.address
        );
        const maxPriceStaleT3T2 = await oracleMedianizerAsDeployer.maxPriceStales(token3.address, token2.address);

        expect(sourceT3T2).to.eq(simplePriceOracle.address);
        expect(source1T3T2).to.eq(bobPriceOracle.address);
        expect(source2T3T2).to.eq(chainLinkPriceOracle.address);
        expect(sourceCountT3T2).to.eq(BigNumber.from(3));
        expect(maxPriceDeviationT3T2).to.eq(BigNumber.from("1100000000000000000"));
        expect(maxPriceStaleT3T2).to.eq(900);
      });
    });
  });

  describe("#getPrice", async () => {
    context("when no primary source", async () => {
      it("should be reverted", async () => {
        await expect(oracleMedianizerAsAlice.getPrice(token0.address, token1.address)).to.revertedWith(
          "OracleMedianizer::getPrice:: no primary source"
        );
      });
    });
    context("when no valid source", async () => {
      context("when has SimplePriceOracle source", async () => {
        it("should be reverted", async () => {
          await oracleMedianizerAsDeployer.setPrimarySources(
            token0.address,
            token1.address,
            BigNumber.from("1000000000000000000"),
            60,
            [simplePriceOracle.address]
          );

          await expect(oracleMedianizerAsAlice.getPrice(token0.address, token1.address)).to.revertedWith(
            "OracleMedianizer::getPrice:: no valid source"
          );
        });
      });
      context("when has ChainLinkOracle source", async () => {
        it("should be reverted", async () => {
          await oracleMedianizerAsDeployer.setPrimarySources(
            token0.address,
            token1.address,
            BigNumber.from("1000000000000000000"),
            60,
            [chainLinkPriceOracle.address]
          );

          await expect(oracleMedianizerAsAlice.getPrice(token0.address, token1.address)).to.revertedWith(
            "OracleMedianizer::getPrice:: no valid source"
          );
        });
      });
    });
    context("when has 1 sources", async () => {
      context("when has 1 source price too stale", async () => {
        it("should be reverted", async () => {
          await simplePriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from("1000000000000000000"), BigNumber.from("1000000000000000000").div(10)]
          );
          await oracleMedianizerAsDeployer.setPrimarySources(
            token0.address,
            token1.address,
            BigNumber.from("1000000000000000000"),
            900,
            [simplePriceOracle.address]
          );

          await TimeHelpers.increase(BigNumber.from("3600")); // 1 hour have passed
          await expect(oracleMedianizerAsAlice.getPrice(token0.address, token1.address)).to.revertedWith(
            "OracleMedianizer::getPrice:: no valid source"
          );
        });
      });
    });
    context("when has 1 valid sources", async () => {
      context("when has SimplePriceOracle source", async () => {
        context("when successfully", async () => {
          it("should successfully", async () => {
            await simplePriceOracleAsFeeder.setPrices(
              [token0.address, token1.address],
              [token1.address, token0.address],
              [BigNumber.from("1000000000000000000"), BigNumber.from("1000000000000000000").div(10)]
            );
            await oracleMedianizerAsDeployer.setPrimarySources(
              token0.address,
              token1.address,
              BigNumber.from("1000000000000000000"),
              900,
              [simplePriceOracle.address]
            );

            await TimeHelpers.increase(BigNumber.from("60")); // 1 minutes have passed
            const [price, lastTime] = await oracleMedianizerAsAlice.getPrice(token0.address, token1.address);
            // result should be Med(price0) => price0 = 1000000000000000000
            expect(price).to.eq(BigNumber.from("1000000000000000000"));
          });
        });
      });
      context("when has ChainLinkPriceOracle source", async () => {
        context("when successfully", async () => {
          it("should successfully", async () => {
            await chainLinkPriceOracle.setPriceFeeds(
              [token0.address],
              [token1.address],
              [mockAggregatorV3T0T1.address]
            );
            await oracleMedianizerAsDeployer.setPrimarySources(
              token0.address,
              token1.address,
              BigNumber.from("1000000000000000000"),
              900,
              [chainLinkPriceOracle.address]
            );

            await TimeHelpers.increase(BigNumber.from("60")); // 1 minutes have passed
            const [price, lastTime] = await oracleMedianizerAsAlice.getPrice(token0.address, token1.address);
            // result should be Med(price0) => price0 = 900000000000000000
            expect(price).to.eq(BigNumber.from("900000000000000000"));
          });
        });
      });
    });
    context("when has 2 valid sources", async () => {
      context("when too much deviation (2 valid sources)", async () => {
        context("when has only SimplePriceOracle source", async () => {
          it("should be reverted", async () => {
            await simplePriceOracleAsFeeder.setPrices(
              [token0.address, token1.address],
              [token1.address, token0.address],
              [BigNumber.from("1000000000000000000"), BigNumber.from("1000000000000000000").div(10)]
            );
            await bobPriceOracleAsFeeder.setPrices(
              [token0.address, token1.address],
              [token1.address, token0.address],
              [BigNumber.from("900000000000000000"), BigNumber.from("1000000000000000000").div(9)]
            );

            await oracleMedianizerAsDeployer.setPrimarySources(
              token0.address,
              token1.address,
              BigNumber.from("1100000000000000000"),
              900,
              [simplePriceOracle.address, bobPriceOracle.address]
            );
            await TimeHelpers.increase(BigNumber.from("60")); // 1 minutes have passed

            await expect(oracleMedianizerAsAlice.getPrice(token0.address, token1.address)).to.revertedWith(
              "OracleMedianizer::getPrice:: too much deviation 2 valid sources"
            );
          });
        });
        context("when has SimplePriceOracle and ChainLinkPriceOracle source", async () => {
          it("should be reverted", async () => {
            await simplePriceOracleAsFeeder.setPrices(
              [token0.address, token1.address],
              [token1.address, token0.address],
              [BigNumber.from("1000000000000000000"), BigNumber.from("1000000000000000000").div(10)]
            );
            await chainLinkPriceOracle.setPriceFeeds(
              [token0.address],
              [token1.address],
              [mockAggregatorV3T0T1.address]
            );

            await oracleMedianizerAsDeployer.setPrimarySources(
              token0.address,
              token1.address,
              BigNumber.from("1100000000000000000"),
              900,
              [simplePriceOracle.address, chainLinkPriceOracle.address]
            );
            await TimeHelpers.increase(BigNumber.from("60")); // 1 minutes have passed

            await expect(oracleMedianizerAsAlice.getPrice(token0.address, token1.address)).to.revertedWith(
              "OracleMedianizer::getPrice:: too much deviation 2 valid sources"
            );
          });
        });
      });
      context("when successfully", async () => {
        context("when has only SimplePriceOracle source", async () => {
          it("should successfully", async () => {
            await simplePriceOracleAsFeeder.setPrices(
              [token0.address, token1.address],
              [token1.address, token0.address],
              [BigNumber.from("1000000000000000000"), BigNumber.from("1000000000000000000").div(10)]
            );
            await bobPriceOracleAsFeeder.setPrices(
              [token0.address, token1.address],
              [token1.address, token0.address],
              [BigNumber.from("900000000000000000"), BigNumber.from("1000000000000000000").div(9)]
            );

            await oracleMedianizerAsDeployer.setPrimarySources(
              token0.address,
              token1.address,
              BigNumber.from("1200000000000000000"),
              900,
              [simplePriceOracle.address, bobPriceOracle.address]
            );
            await TimeHelpers.increase(BigNumber.from("60")); // 1 minutes have passed

            const [price, lastTime] = await oracleMedianizerAsAlice.getPrice(token0.address, token1.address);
            // result should be Med(price0, price1) => (price0 + price1) / 2 = (1000000000000000000 + 900000000000000000) / 2 = 950000000000000000
            expect(price).to.eq(BigNumber.from("950000000000000000"));
          });
        });
        context("when has SimplePriceOracle and ChainLinkPriceOracle source", async () => {
          it("should successfully", async () => {
            await simplePriceOracleAsFeeder.setPrices(
              [token0.address, token1.address],
              [token1.address, token0.address],
              [BigNumber.from("1000000000000000000"), BigNumber.from("1000000000000000000").div(10)]
            );
            await chainLinkPriceOracle.setPriceFeeds(
              [token0.address],
              [token1.address],
              [mockAggregatorV3T0T1.address]
            );

            await oracleMedianizerAsDeployer.setPrimarySources(
              token0.address,
              token1.address,
              BigNumber.from("1200000000000000000"),
              900,
              [simplePriceOracle.address, chainLinkPriceOracle.address]
            );
            await TimeHelpers.increase(BigNumber.from("60")); // 1 minutes have passed

            const [price, lastTime] = await oracleMedianizerAsAlice.getPrice(token0.address, token1.address);
            // result should be Med(price0, price1) => (price0 + price1) / 2 = (1000000000000000000 + 900000000000000000) / 2 = 950000000000000000
            expect(price).to.eq(BigNumber.from("950000000000000000"));
          });
        });
      });
    });
    context("when has 3 valid sources", async () => {
      context("when too much deviation", async () => {
        context("when has only SimplePriceOracle source", async () => {
          it("should be reverted", async () => {
            await simplePriceOracleAsFeeder.setPrices(
              [token0.address, token1.address],
              [token1.address, token0.address],
              [BigNumber.from("1000000000000000000"), BigNumber.from("1000000000000000000").div(10)]
            );
            await bobPriceOracleAsFeeder.setPrices(
              [token0.address, token1.address],
              [token1.address, token0.address],
              [BigNumber.from("900000000000000000"), BigNumber.from("1000000000000000000").div(9)]
            );
            await evePriceOracleAsFeeder.setPrices(
              [token0.address, token1.address],
              [token1.address, token0.address],
              [BigNumber.from("800000000000000000"), BigNumber.from("1000000000000000000").div(8)]
            );

            await oracleMedianizerAsDeployer.setPrimarySources(
              token0.address,
              token1.address,
              BigNumber.from("1100000000000000000"),
              900,
              [simplePriceOracle.address, bobPriceOracle.address, evePriceOracleAsFeeder.address]
            );
            await TimeHelpers.increase(BigNumber.from("60")); // 1 minutes have passed

            await expect(oracleMedianizerAsAlice.getPrice(token0.address, token1.address)).to.revertedWith(
              "OracleMedianizer::getPrice:: too much deviation 3 valid sources"
            );
          });
        });
        context("when has SimplePriceOracle and ChainLinkPriceOracle source", async () => {
          it("should be reverted", async () => {
            await simplePriceOracleAsFeeder.setPrices(
              [token0.address, token1.address],
              [token1.address, token0.address],
              [BigNumber.from("1000000000000000000"), BigNumber.from("1000000000000000000").div(10)]
            );
            await chainLinkPriceOracle.setPriceFeeds(
              [token0.address],
              [token1.address],
              [mockAggregatorV3T0T1.address]
            );
            await evePriceOracleAsFeeder.setPrices(
              [token0.address, token1.address],
              [token1.address, token0.address],
              [BigNumber.from("800000000000000000"), BigNumber.from("1000000000000000000").div(8)]
            );

            await oracleMedianizerAsDeployer.setPrimarySources(
              token0.address,
              token1.address,
              BigNumber.from("1100000000000000000"),
              900,
              [simplePriceOracle.address, chainLinkPriceOracle.address, evePriceOracleAsFeeder.address]
            );
            await TimeHelpers.increase(BigNumber.from("60")); // 1 minutes have passed

            await expect(oracleMedianizerAsAlice.getPrice(token0.address, token1.address)).to.revertedWith(
              "OracleMedianizer::getPrice:: too much deviation 3 valid sources"
            );
          });
        });
      });
      context(`when price0 and price1 are within max deviation, but price2 doesn't`, async () => {
        it("should be successfully", async () => {
          await simplePriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from("1100000000000000000"), BigNumber.from("1000000000000000000").div(11)]
          );
          await chainLinkPriceOracle.setPriceFeeds([token0.address], [token1.address], [mockAggregatorV3T0T1.address]);
          await evePriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from("800000000000000000"), BigNumber.from("1000000000000000000").div(8)]
          );

          await oracleMedianizerAsDeployer.setPrimarySources(
            token0.address,
            token1.address,
            BigNumber.from("1200000000000000000"),
            900,
            [simplePriceOracle.address, chainLinkPriceOracle.address, evePriceOracleAsFeeder.address]
          );
          await TimeHelpers.increase(BigNumber.from("60")); // 1 minutes have passed

          const [price, lastTime] = await oracleMedianizerAsAlice.getPrice(token0.address, token1.address);
          // result should be Med(price1, price2) => (price1 + price2) / 2 = (900000000000000000 + 800000000000000000) / 2 = 850000000000000000
          expect(price).to.eq(BigNumber.from("850000000000000000"));
        });
      });
      context(`when price1 and price2 are within max deviation, but price0 doesn't`, async () => {
        it("should be successfully", async () => {
          await simplePriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from("1000000000000000000"), BigNumber.from("1000000000000000000").div(10)]
          );
          await chainLinkPriceOracle.setPriceFeeds([token0.address], [token1.address], [mockAggregatorV3T0T1.address]);
          await evePriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from("700000000000000000"), BigNumber.from("1000000000000000000").div(7)]
          );

          await oracleMedianizerAsDeployer.setPrimarySources(
            token0.address,
            token1.address,
            BigNumber.from("1200000000000000000"),
            900,
            [simplePriceOracle.address, chainLinkPriceOracle.address, evePriceOracleAsFeeder.address]
          );
          await TimeHelpers.increase(BigNumber.from("60")); // 1 minutes have passed

          const [price, lastTime] = await oracleMedianizerAsAlice.getPrice(token0.address, token1.address);
          // result should be Med(price0, price1) => (price0 + price1) / 2 = (1000000000000000000 + 900000000000000000) / 2 = 950000000000000000
          expect(price).to.eq(BigNumber.from("950000000000000000"));
        });
      });
      context("when price0, price1 and price2 are ok", async () => {
        it("should be successfully", async () => {
          await simplePriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from("1000000000000000000"), BigNumber.from("1000000000000000000").div(10)]
          );
          await chainLinkPriceOracle.setPriceFeeds([token0.address], [token1.address], [mockAggregatorV3T0T1.address]);
          await evePriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from("800000000000000000"), BigNumber.from("1000000000000000000").div(8)]
          );

          await oracleMedianizerAsDeployer.setPrimarySources(
            token0.address,
            token1.address,
            BigNumber.from("1200000000000000000"),
            900,
            [simplePriceOracle.address, chainLinkPriceOracle.address, evePriceOracleAsFeeder.address]
          );
          await TimeHelpers.increase(BigNumber.from("60")); // 1 minutes have passed

          const [price, lastTime] = await oracleMedianizerAsAlice.getPrice(token0.address, token1.address);
          // result should be Med(price0, price1, price2) => price1 = 900000000000000000
          expect(price).to.eq(BigNumber.from("900000000000000000"));
        });
      });
    });
  });
});
