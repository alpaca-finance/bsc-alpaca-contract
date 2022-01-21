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
  PancakeFactory,
  PancakeFactory__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouter,
  PancakeRouterV2__factory,
  PriceHelper,
  PriceHelper__factory,
  SimplePriceOracle,
  SimplePriceOracle__factory,
  WETH,
  WETH__factory,
} from "../../../typechain";
import * as TimeHelpers from "../../helpers/time";
import { deploy } from "@openzeppelin/hardhat-upgrades/dist/utils";

chai.use(solidity);
const { expect } = chai;

const FOREVER = "2000000000";
const ADDRESS0 = "0x0000000000000000000000000000000000000000";

// Accounts
let deployer: Signer;

/// Pancakeswap-related instance(s)
let factoryV2: PancakeFactory;
let routerV2: PancakeRouter;
let lpV2Token0Stable0: PancakePair;
let lpV2Stable0Stable1: PancakePair;

/// Token-related instance(s)
let wbnb: WETH;
let token0: MockERC20;
let token1: MockERC20;
let usdToken: MockERC20;
let stableToken0: MockERC20;
let stableToken1: MockERC20;

let chainLinkOracle: ChainLinkPriceOracle;
let chainLinkOracleAsDeployer: ChainLinkPriceOracle;

let mockAggregatorV3T0UsdToken: MockAggregatorV3;

let mockAggregatorV3T1UsdToken: MockAggregatorV3;
let mockAggregatorV3StableToken: MockAggregatorV3;

let mockAggregatorV3T0T1Token: MockAggregatorV3;

let priceHelper: PriceHelper;

async function fixture() {
  [deployer] = await ethers.getSigners();

  const deployerAddress = await deployer.getAddress();

  // PREPARE ORACLE
  const ERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
  token0 = (await upgrades.deployProxy(ERC20, ["token0", "token0", "18"])) as MockERC20;
  await token0.deployed();
  token1 = (await upgrades.deployProxy(ERC20, ["token1", "token1", "8"])) as MockERC20;
  await token1.deployed();
  usdToken = (await upgrades.deployProxy(ERC20, ["usdToken", "usdToken", "18"])) as MockERC20;
  await usdToken.deployed();

  stableToken0 = (await upgrades.deployProxy(ERC20, ["busd", "busd", "18"])) as MockERC20;
  await stableToken0.deployed();

  stableToken1 = (await upgrades.deployProxy(ERC20, ["usdt", "usdt", "18"])) as MockERC20;
  await stableToken1.deployed();

  const MockAggregatorV3 = (await ethers.getContractFactory("MockAggregatorV3", deployer)) as MockAggregatorV3__factory;

  mockAggregatorV3T0UsdToken = await MockAggregatorV3.deploy(BigNumber.from("468290000000000000000"), 18);
  await mockAggregatorV3T0UsdToken.deployed();

  mockAggregatorV3T1UsdToken = await MockAggregatorV3.deploy(BigNumber.from("10000000000000000000"), 18);
  await mockAggregatorV3T1UsdToken.deployed();

  mockAggregatorV3StableToken = await MockAggregatorV3.deploy(BigNumber.from("1000000000000000000"), 18);
  await mockAggregatorV3StableToken.deployed();

  const ChainLinkPriceOracle = (await ethers.getContractFactory(
    "ChainLinkPriceOracle",
    deployer
  )) as ChainLinkPriceOracle__factory;
  chainLinkOracle = (await upgrades.deployProxy(ChainLinkPriceOracle)) as ChainLinkPriceOracle;
  await chainLinkOracle.deployed();

  chainLinkOracleAsDeployer = ChainLinkPriceOracle__factory.connect(chainLinkOracle.address, deployer);

  // feed price on oracle
  await chainLinkOracleAsDeployer.setPriceFeeds(
    [token0.address, token1.address, stableToken0.address, stableToken1.address],
    [usdToken.address, usdToken.address, usdToken.address, usdToken.address],
    [
      mockAggregatorV3T0UsdToken.address,
      mockAggregatorV3T1UsdToken.address,
      mockAggregatorV3StableToken.address,
      mockAggregatorV3StableToken.address,
    ]
  );

  // PREPARE PCS
  const PancakeFactory = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
  factoryV2 = await PancakeFactory.deploy(await deployer.getAddress());
  await factoryV2.deployed();

  const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
  wbnb = await WBNB.deploy();

  const PancakeRouterV2 = (await ethers.getContractFactory("PancakeRouterV2", deployer)) as PancakeRouterV2__factory;
  routerV2 = await PancakeRouterV2.deploy(factoryV2.address, wbnb.address);
  await routerV2.deployed();

  await factoryV2.createPair(token0.address, stableToken0.address);
  const lpAddress = await factoryV2.getPair(token0.address, stableToken0.address);

  await factoryV2.createPair(stableToken0.address, stableToken1.address);
  const stableLPAddress = await factoryV2.getPair(stableToken0.address, stableToken1.address);

  lpV2Token0Stable0 = PancakePair__factory.connect(lpAddress, deployer);
  lpV2Stable0Stable1 = PancakePair__factory.connect(stableLPAddress, deployer);

  //ADD LIQUIDITY TOKEN0 STABLE0
  await token0.mint(deployerAddress, BigNumber.from("409514710336210000000000"));
  await stableToken0.mint(deployerAddress, BigNumber.from("192119364726297000000000000"));

  await token0.approve(routerV2.address, BigNumber.from("409514710336210000000000"));
  await stableToken0.approve(routerV2.address, BigNumber.from("192119364726297000000000000"));

  await routerV2.addLiquidity(
    token0.address,
    stableToken0.address,
    BigNumber.from("409514710336210000000000"),
    BigNumber.from("192119364726297000000000000"),
    "0",
    "0",
    deployerAddress,
    FOREVER
  );

  // ADD LIQUIDITY STABLE0 STABLE1
  await stableToken0.mint(deployerAddress, ethers.utils.parseEther("100"));
  await stableToken1.mint(deployerAddress, ethers.utils.parseEther("100"));

  await stableToken0.approve(routerV2.address, ethers.utils.parseEther("100"));
  await stableToken1.approve(routerV2.address, ethers.utils.parseEther("100"));

  await routerV2.addLiquidity(
    stableToken0.address,
    stableToken1.address,
    ethers.utils.parseEther("100"),
    ethers.utils.parseEther("100"),
    "0",
    "0",
    deployerAddress,
    FOREVER
  );

  // PREPARE TEST CLASS
  const PriceHelper = (await ethers.getContractFactory("PriceHelper", deployer)) as PriceHelper__factory;
  priceHelper = (await upgrades.deployProxy(PriceHelper, [chainLinkOracle.address, usdToken.address])) as PriceHelper;
  await priceHelper.deployed();
}

beforeEach(async () => {
  await waffle.loadFixture(fixture);
});

context("chainlink get price should work properly", async () => {
  it("chainlink get price should work properly", async () => {
    const [priceT0UsdToken] = await chainLinkOracleAsDeployer.getPrice(token0.address, usdToken.address);
    // result should be (priceT0UsdToken * 1e18) / (10**decimals) = (468290000000000000000 * 1e18) / (10**18) = 468290000000000000000
    expect(priceT0UsdToken).to.eq(BigNumber.from("468290000000000000000"));

    // result should be (priceT0UsdToken * 1e18) / (10**decimals) = (10000000000000000000 * 1e18) / (10**18) = 468290000000000000000
    const [priceT1UsdToken] = await chainLinkOracleAsDeployer.getPrice(token1.address, usdToken.address);
    expect(priceT1UsdToken).to.eq(BigNumber.from("10000000000000000000"));

    const priceT0T1 = priceT0UsdToken.mul(ethers.utils.parseEther("1")).div(priceT1UsdToken);
    expect(priceT0T1).to.eq(BigNumber.from("46829000000000000000"));

    const priceT1T0 = priceT1UsdToken.mul(ethers.utils.parseEther("1")).div(priceT0UsdToken);
    expect(priceT1T0).to.eq(BigNumber.from("21354289008947447"));
  });
});

context("when incorrect input", async () => {
  it("#lpToDollar", async () => {
    await expect(priceHelper.lpToDollar(BigNumber.from("0"), lpV2Token0Stable0.address)).to.be.revertedWith(
      "InvalidLPAmount()"
    );

    await expect(priceHelper.lpToDollar("1", ADDRESS0)).to.be.revertedWith("InvalidLPAddress()");
  });

  it("#dollarToLP", async () => {
    await expect(priceHelper.dollarToLP(BigNumber.from("0"), lpV2Token0Stable0.address)).to.be.revertedWith(
      "InvalidDollarAmount()"
    );
    await expect(priceHelper.dollarToLP("1", ADDRESS0)).to.be.revertedWith("InvalidLPAddress()");
  });
});

context("lpToDollar-success", async () => {
  it("token-to-stable", async () => {
    // totalSupply = 8869932693987378670153083
    // r0 = 409514710336210000000000
    // r1 = 192119364726297000000000000
    // p0 = 468290000000000000000
    // p1 =   1000000000000000000
    // fairPrice = 2* sqrt(r0 * r1) * sqrt(p0 * p1) / totalSupply
    // fairPrice      = 2* sqrt(409514710336210000000000 * 192119364726297000000000000) * sqrt(468290000000000000000 * 1000000000000000000) / 8869932693987378670153083
    //                = 2 * (8869932693987378670153083.52417769176678540559) * (21640009242142203854.14703646049084548679)/8869932693987378670153083
    //                = 2 * 21640009242142203854.14703646049084548679
    // fairPrice(1LP) = 43280018484284407708.29407292098169097358
    expect(await priceHelper.lpToDollar(ethers.utils.parseEther("1"), lpV2Token0Stable0.address)).to.be.eq(
      "43280018484284407708"
    );
    expect(await priceHelper.lpToDollar(ethers.utils.parseEther("1000000"), lpV2Token0Stable0.address)).to.be.eq(
      "43280018484284407708000000"
    );
  });

  it("stable-to-stable", async () => {
    // totalSupply = 100
    // r0 = 100
    // r1 = 100
    // p0 = 1000000000000000000
    // p1 = 1000000000000000000
    expect(await priceHelper.lpToDollar(ethers.utils.parseEther("1"), lpV2Stable0Stable1.address)).to.be.eq(
      "2000000000000000000"
    );
    expect(await priceHelper.lpToDollar(ethers.utils.parseEther("100"), lpV2Stable0Stable1.address)).to.be.eq(
      "200000000000000000000"
    );
  });
});

context("dollarToLp-success", async () => {
  it("token-to-stable", async () => {
    // totalSupply = 8869932693987378670153083
    // r0 = 409514710336210000000000
    // r1 = 192119364726297000000000000
    // p0 = 468290000000000000000
    // p1 =   1000000000000000000
    // fairPrice = 2* sqrt(r0 * r1) * sqrt(p0 * p1) / totalSupply
    // fairPrice      = 2* sqrt(409514710336210000000000 * 192119364726297000000000000) * sqrt(468290000000000000000 * 1000000000000000000) / 8869932693987378670153083
    //                = 2 * (8869932693987378670153083.52417769176678540559) * (21640009242142203854.14703646049084548679)/8869932693987378670153083
    //                = 2 * 21640009242142203854.14703646049084548679
    // fairPrice(1LP) = 43280018484284407708.29407292098169097358
    expect(await priceHelper.dollarToLP(BigNumber.from("43280018484284407708"), lpV2Token0Stable0.address)).to.be.eq(
      ethers.utils.parseEther("1")
    );

    expect(await priceHelper.dollarToLP(BigNumber.from("108200046210711019270"), lpV2Token0Stable0.address)).to.be.eq(
      BigNumber.from("2500000000000000000")
    );

    expect(
      await priceHelper.dollarToLP(BigNumber.from("43280018484284407708000000000"), lpV2Token0Stable0.address)
    ).to.be.eq(ethers.utils.parseEther("1000000000"));
  });

  it("stable-to-stable", async () => {
    // totalSupply = 100
    // r0 = 100
    // r1 = 100
    // p0 = 1000000000000000000
    // p1 = 1000000000000000000
    expect(await priceHelper.dollarToLP(ethers.utils.parseEther("1"), lpV2Stable0Stable1.address)).to.be.eq(
      BigNumber.from("500000000000000000")
    );
    expect(await priceHelper.dollarToLP(ethers.utils.parseEther("5"), lpV2Stable0Stable1.address)).to.be.eq(
      "2500000000000000000"
    );
  });
});
