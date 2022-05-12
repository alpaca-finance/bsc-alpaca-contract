import chai from "chai";
import "@openzeppelin/test-helpers";
import { solidity } from "ethereum-waffle";
import { BigNumber, Signer } from "ethers";
import { ethers, upgrades, waffle } from "hardhat";
import {
  ChainLinkPriceOracle,
  ChainLinkPriceOracle__factory,
  MdexFactory,
  MdexFactory__factory,
  MdexPair,
  MdexPair__factory,
  MdexRouter,
  MdexRouter__factory,
  MockAggregatorV3,
  MockAggregatorV3__factory,
  MockERC20,
  MockERC20__factory,
  WETH,
  WETH__factory,
  DeltaNeutralOracle,
  DeltaNeutralOracle__factory,
} from "../../../typechain";
import { assertAlmostEqual, assertBigNumberClosePercent } from "../../helpers/assert";

chai.use(solidity);
const { expect } = chai;

const FOREVER = "2000000000";

// Accounts
let deployer: Signer;
let alice: Signer;

/// Mdex-related instance(s)
let factoryV2: MdexFactory;
let routerV2: MdexRouter;
let lpV2Token0Stable0: MdexPair;
let lpV2Stable0Stable1: MdexPair;
let lpV2BtcbStable0: MdexPair;
let lpV2BtcbToken0: MdexPair;
let lpV2Decimals8Stable0: MdexPair;
let lpV2Decimals8Decimal9: MdexPair;

/// Token-related instance(s)
let wbnb: WETH;
let token0: MockERC20;
let btcbToken: MockERC20;
let usdToken: MockERC20;
let stableToken0: MockERC20;
let stableToken1: MockERC20;
let decimals8Token: MockERC20;
let decimals9Token: MockERC20;

let chainLinkOracle: ChainLinkPriceOracle;
let chainLinkOracleAsDeployer: ChainLinkPriceOracle;
let chainLinkOracleAsAlice: ChainLinkPriceOracle;

let mockAggregatorV3T0UsdToken: MockAggregatorV3;
let mockAggregatorV3BtcbUsdToken: MockAggregatorV3;
let mockAggregatorV3StableToken: MockAggregatorV3;
let mockAggregatorV3Decimals8Token: MockAggregatorV3;
let mockAggregatorV3Decimals9Token: MockAggregatorV3;

let priceOracle: DeltaNeutralOracle;
let priceOracleAsAlice: DeltaNeutralOracle;

let casesData: any[] = [];
describe("DeltaNeutralOracle", () => {
  async function fixture() {
    [deployer, alice] = await ethers.getSigners();

    const [deployerAddress] = await Promise.all([deployer.getAddress()]);

    // PREPARE ORACLE
    const ERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    token0 = (await upgrades.deployProxy(ERC20, ["token0", "token0", "18"])) as MockERC20;
    await token0.deployed();
    btcbToken = (await upgrades.deployProxy(ERC20, ["btcb", "btcb", "18"])) as MockERC20;
    await btcbToken.deployed();
    usdToken = (await upgrades.deployProxy(ERC20, ["usdToken", "usdToken", "18"])) as MockERC20;
    await usdToken.deployed();

    stableToken0 = (await upgrades.deployProxy(ERC20, ["busd", "busd", "18"])) as MockERC20;
    await stableToken0.deployed();

    stableToken1 = (await upgrades.deployProxy(ERC20, ["usdt", "usdt", "18"])) as MockERC20;
    await stableToken1.deployed();

    stableToken1 = (await upgrades.deployProxy(ERC20, ["usdt", "usdt", "18"])) as MockERC20;
    await stableToken1.deployed();

    decimals8Token = (await upgrades.deployProxy(ERC20, ["decimals8Token", "decimals8", "8"])) as MockERC20;
    await decimals8Token.deployed();

    decimals9Token = (await upgrades.deployProxy(ERC20, ["decimals9Token", "decimals9", "9"])) as MockERC20;
    await decimals9Token.deployed();

    const MockAggregatorV3 = (await ethers.getContractFactory(
      "MockAggregatorV3",
      deployer
    )) as MockAggregatorV3__factory;

    mockAggregatorV3T0UsdToken = await MockAggregatorV3.deploy(BigNumber.from("427840000000000000000"), 18);
    await mockAggregatorV3T0UsdToken.deployed();

    mockAggregatorV3BtcbUsdToken = await MockAggregatorV3.deploy(BigNumber.from("42300713817358000000000"), 18);
    await mockAggregatorV3BtcbUsdToken.deployed();

    mockAggregatorV3StableToken = await MockAggregatorV3.deploy(BigNumber.from("1000000000000000000"), 18);
    await mockAggregatorV3StableToken.deployed();

    mockAggregatorV3Decimals8Token = await MockAggregatorV3.deploy(BigNumber.from("100000000"), 8);
    await mockAggregatorV3Decimals8Token.deployed();

    mockAggregatorV3Decimals9Token = await MockAggregatorV3.deploy(BigNumber.from("1000000000"), 9);
    await mockAggregatorV3Decimals9Token.deployed();

    const ChainLinkPriceOracle = (await ethers.getContractFactory(
      "ChainLinkPriceOracle",
      deployer
    )) as ChainLinkPriceOracle__factory;
    chainLinkOracle = (await upgrades.deployProxy(ChainLinkPriceOracle)) as ChainLinkPriceOracle;
    await chainLinkOracle.deployed();

    chainLinkOracleAsDeployer = ChainLinkPriceOracle__factory.connect(chainLinkOracle.address, deployer);

    // feed price on oracle
    await chainLinkOracleAsDeployer.setPriceFeeds(
      [
        token0.address,
        btcbToken.address,
        stableToken0.address,
        stableToken1.address,
        decimals8Token.address,
        decimals9Token.address,
      ],
      [usdToken.address, usdToken.address, usdToken.address, usdToken.address, usdToken.address, usdToken.address],
      [
        mockAggregatorV3T0UsdToken.address,
        mockAggregatorV3BtcbUsdToken.address,
        mockAggregatorV3StableToken.address,
        mockAggregatorV3StableToken.address,
        mockAggregatorV3Decimals8Token.address,
        mockAggregatorV3Decimals9Token.address,
      ]
    );

    // PREPARE MDEX
    const MdexFactory = (await ethers.getContractFactory("MdexFactory", deployer)) as MdexFactory__factory;
    factoryV2 = await MdexFactory.deploy(await deployer.getAddress());
    await factoryV2.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();

    const MdexRouter = (await ethers.getContractFactory("MdexRouter", deployer)) as MdexRouter__factory;
    routerV2 = await MdexRouter.deploy(factoryV2.address, wbnb.address);
    await routerV2.deployed();

    // CREATE PAIR
    await factoryV2.createPair(token0.address, stableToken0.address);
    const lpAddress = await factoryV2.getPair(token0.address, stableToken0.address);

    await factoryV2.createPair(stableToken0.address, stableToken1.address);
    const stableLPAddress = await factoryV2.getPair(stableToken0.address, stableToken1.address);

    await factoryV2.createPair(btcbToken.address, stableToken0.address);
    const btcbStable0Address = await factoryV2.getPair(btcbToken.address, stableToken0.address);

    await factoryV2.createPair(btcbToken.address, token0.address);
    const btcbToken0Address = await factoryV2.getPair(btcbToken.address, token0.address);

    await factoryV2.createPair(decimals8Token.address, stableToken0.address);
    const decimal8Stable0Address = await factoryV2.getPair(decimals8Token.address, stableToken0.address);

    await factoryV2.createPair(decimals8Token.address, decimals9Token.address);
    const decimal8Decimal9Address = await factoryV2.getPair(decimals8Token.address, decimals9Token.address);

    lpV2Token0Stable0 = MdexPair__factory.connect(lpAddress, deployer);
    lpV2Stable0Stable1 = MdexPair__factory.connect(stableLPAddress, deployer);
    lpV2BtcbStable0 = MdexPair__factory.connect(btcbStable0Address, deployer);
    lpV2BtcbToken0 = MdexPair__factory.connect(btcbToken0Address, deployer);
    lpV2Decimals8Stable0 = MdexPair__factory.connect(decimal8Stable0Address, deployer);
    lpV2Decimals8Decimal9 = MdexPair__factory.connect(decimal8Decimal9Address, deployer);

    //ADD LIQUIDITY TOKEN0 STABLE0
    await token0.mint(deployerAddress, BigNumber.from("466712574325720000000000"));
    await stableToken0.mint(deployerAddress, BigNumber.from("199675089295813000000000000"));

    await token0.approve(routerV2.address, BigNumber.from("466712574325720000000000"));
    await stableToken0.approve(routerV2.address, BigNumber.from("199675089295813000000000000"));

    await routerV2.addLiquidity(
      token0.address,
      stableToken0.address,
      BigNumber.from("466712574325720000000000"),
      BigNumber.from("199675089295813000000000000"),
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

    // ADD LIQUIDITY BTCB - BUSD
    await btcbToken.mint(deployerAddress, BigNumber.from("904717988720000000000"));
    await stableToken0.mint(deployerAddress, BigNumber.from("38285596932068700000000000"));

    await btcbToken.approve(routerV2.address, BigNumber.from("904717988720000000000"));
    await stableToken0.approve(routerV2.address, BigNumber.from("38285596932068700000000000"));

    await routerV2.addLiquidity(
      btcbToken.address,
      stableToken0.address,
      BigNumber.from("904717988720000000000"),
      BigNumber.from("38285596932068700000000000"),
      "0",
      "0",
      deployerAddress,
      FOREVER
    );

    // ADD LIQUIDITY BTCB - WBNB
    await btcbToken.mint(deployerAddress, BigNumber.from("965510000000000000000"));
    await token0.mint(deployerAddress, BigNumber.from("91512193227770000000000"));

    await btcbToken.approve(routerV2.address, BigNumber.from("965510000000000000000"));
    await token0.approve(routerV2.address, BigNumber.from("91512193227770000000000"));

    await routerV2.addLiquidity(
      btcbToken.address,
      token0.address,
      BigNumber.from("965510000000000000000"),
      BigNumber.from("91512193227770000000000"),
      "0",
      "0",
      deployerAddress,
      FOREVER
    );

    // ADD LIQUIDITY Decimals8 - STABLE0
    const decimal8Liquidity = ethers.utils.parseEther("100").div(10 ** (18 - 8));
    await decimals8Token.mint(deployerAddress, decimal8Liquidity);
    await stableToken0.mint(deployerAddress, ethers.utils.parseEther("100"));

    await decimals8Token.approve(routerV2.address, decimal8Liquidity);
    await stableToken0.approve(routerV2.address, ethers.utils.parseEther("100"));

    await routerV2.addLiquidity(
      decimals8Token.address,
      stableToken0.address,
      decimal8Liquidity,
      ethers.utils.parseEther("100"),
      "0",
      "0",
      deployerAddress,
      FOREVER
    );

    // ADD LIQUIDITY Decimals8 - Decimals9
    const decimal9Liquidity = ethers.utils.parseEther("100").div(10 ** (18 - 9));
    await decimals8Token.mint(deployerAddress, decimal8Liquidity);
    await decimals9Token.mint(deployerAddress, decimal9Liquidity);

    await decimals8Token.approve(routerV2.address, decimal8Liquidity);
    await decimals9Token.approve(routerV2.address, decimal9Liquidity);

    await routerV2.addLiquidity(
      decimals8Token.address,
      decimals9Token.address,
      decimal8Liquidity,
      decimal9Liquidity,
      "0",
      "0",
      deployerAddress,
      FOREVER
    );

    // PREPARE TEST CLASS
    const DeltaNeutralOracle = (await ethers.getContractFactory(
      "DeltaNeutralOracle",
      deployer
    )) as DeltaNeutralOracle__factory;
    priceOracle = (await upgrades.deployProxy(DeltaNeutralOracle, [
      chainLinkOracle.address,
      usdToken.address,
    ])) as DeltaNeutralOracle;
    await priceOracle.deployed();

    priceOracleAsAlice = DeltaNeutralOracle__factory.connect(priceOracle.address, alice);

    casesData = [
      //fairPrice= 2* sqrt(r0 * r1) * sqrt(p0 * p1) / totalSupply
      //  (bnb-busd)
      {
        //fairPrice = 2* 9653542093654893404247640.49294092286780056392 * 20684293558156633356.07295450258677195686  / 9653542093654893404247640
        //fairPrice = 41368587116313266712.14591111758671961799
        token0Reserve: BigNumber.from("466712574325720000000000"),
        token1Reserve: BigNumber.from("199675089295813000000000000"),
        timestamp: "1642761186",
        totalSupply: BigNumber.from("9653542093654893404247640"),
        p0: BigNumber.from("427840000000000000000"),
        p1: BigNumber.from("1000000000000000000"),
        totalUSD: BigNumber.from("199675089295813000000000000").mul(2),
        lpAddress: lpV2Token0Stable0.address,
        fairPrice: BigNumber.from("41368587116313266712"),
        hasUSD: true,
      },
      // //  (busd-usdt)
      {
        token0Reserve: BigNumber.from("100000000000000000000"),
        token1Reserve: BigNumber.from("100000000000000000000"),
        timestamp: "1642759546",
        totalSupply: BigNumber.from("100000000000000000000"),
        p0: BigNumber.from("1000000000000000000"),
        p1: BigNumber.from("1000000000000000000"),
        totalUSD: BigNumber.from("100000000000000000000").mul(2),
        lpAddress: lpV2Stable0Stable1.address,
        fairPrice: BigNumber.from("2000000000000000000"),
        hasUSD: true,
      },
      // // btcb-busd
      {
        // fairPrice= 2 * 186111977726651963954050.05901829180428826807 * 205671373354091259153.06497271109524120409 /186111977726651963954050
        // fairPrice= 411342746708182518306.13007586380178190719
        token0Reserve: BigNumber.from("904717988720000000000"),
        token1Reserve: BigNumber.from("38285596932068700000000000"),
        timestamp: "1642759546",
        totalSupply: BigNumber.from("186111977726651963954050"),
        p0: BigNumber.from("42300713817358000000000"),
        p1: BigNumber.from("1000000000000000000"),
        totalUSD: BigNumber.from("38285596932068700000000000").mul(2),
        lpAddress: lpV2BtcbStable0.address,
        fairPrice: BigNumber.from("411342746708182518306"),
        hasUSD: true,
      },
      // // btcb-bnb
      {
        //fairPrice= 2 * 9399783916843206492029.37500865629023998066 * 4254167062965257682100.43529399434936881258 /9399783916843206492029
        //fairPrice= 8508334125930515364200.87058798869873762516
        token0Reserve: BigNumber.from("965510000000000000000"),
        token1Reserve: BigNumber.from("91512193227770000000000"),
        timestamp: "1642761962",
        totalSupply: BigNumber.from("9399783916843206492029"),
        p0: BigNumber.from("42300713817358000000000"),
        p1: BigNumber.from("427840000000000000000"),
        totalUSD: ethers.constants.Zero, // do no need to use in this case
        lpAddress: lpV2BtcbToken0.address,
        fairPrice: BigNumber.from("8508334125930515364200"),
        hasUSD: false,
      },
      // decimal8 - busd
      {
        //fairPrice= 2 * Math.sqrt(10000000000 * 100000000000000000000) * Math.sqrt(100000000 * 1000000000000000000)/ 1000000000000000
        //fairPrice= 20000000000000
        //fair price per Ether = 200000000000000000000000
        token0Reserve: BigNumber.from("10000000000"),
        token1Reserve: BigNumber.from("100000000000000000000"),
        timestamp: "1642761962",
        totalSupply: BigNumber.from("1000000000000000"),
        p0: BigNumber.from("1000000000000000000"),
        p1: BigNumber.from("1000000000000000000"),
        totalUSD: BigNumber.from("100000000000000000000").mul(2),
        lpAddress: lpV2Decimals8Stable0.address,
        fairPrice: BigNumber.from("200000000000000000000000"),
        hasUSD: true,
      },
      // decimal8 - decimal9
      {
        //fairPrice= 2 * Math.sqrt(10000000000 * 100000000000) * Math.sqrt(100000000 * 1000000000)/ 31622776601
        //fairPrice= 632455532.0473517
        //fair price per Ether = 6324555320000000000000000000
        token0Reserve: BigNumber.from("10000000000"),
        token1Reserve: BigNumber.from("100000000000"),
        timestamp: "1642761962",
        totalSupply: BigNumber.from("31622776601"),
        p0: BigNumber.from("1000000000000000000"),
        p1: BigNumber.from("1000000000000000000"),
        totalUSD: BigNumber.from("100000000000000000000").mul(2),
        lpAddress: lpV2Decimals8Decimal9.address,
        fairPrice: BigNumber.from("6324555320000000000000000000"),
        hasUSD: true,
      },
    ];
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("chainlink get price should work properly", async () => {
    it("chainlink get price should work properly", async () => {
      const [priceT0UsdToken] = await chainLinkOracleAsDeployer.getPrice(token0.address, usdToken.address);
      // result should be (priceT0UsdToken * 1e18) / (10**decimals) = (427840000000000000000 * 1e18) / (10**18) = 427840000000000000000
      expect(priceT0UsdToken).to.eq(BigNumber.from("427840000000000000000"));

      const [priceBtcbUsdToken] = await chainLinkOracleAsDeployer.getPrice(btcbToken.address, usdToken.address);
      expect(priceBtcbUsdToken).to.eq(BigNumber.from("42300713817358000000000"));

      const priceT0Btcb = priceT0UsdToken.mul(ethers.constants.WeiPerEther).div(priceBtcbUsdToken);
      expect(priceT0Btcb).to.eq(BigNumber.from("010114250124650067"));

      const priceBtcbT0 = priceBtcbUsdToken.mul(ethers.constants.WeiPerEther).div(priceT0UsdToken);
      expect(priceBtcbT0).to.eq(BigNumber.from("98870404397340127150"));

      await expect(chainLinkOracleAsDeployer.getPrice(token0.address, btcbToken.address)).to.be.revertedWith(
        "ChainLinkPriceOracle::getPrice:: no source"
      );

      const [priceStableCoin0] = await chainLinkOracleAsDeployer.getPrice(stableToken0.address, usdToken.address);
      expect(priceStableCoin0).to.be.eq(ethers.constants.WeiPerEther);
      const [priceStableCoin1] = await chainLinkOracleAsDeployer.getPrice(stableToken1.address, usdToken.address);
      expect(priceStableCoin1).to.be.eq(ethers.constants.WeiPerEther);
    });
  });

  describe("#LPtoDollar", async () => {
    context("when invalid input", async () => {
      it("should revert when no address", async () => {
        await expect(priceOracle.lpToDollar(ethers.constants.One, ethers.constants.AddressZero)).to.be.revertedWith(
          "DeltaNeutralOracle_InvalidLPAddress()"
        );
      });
    });

    context("when correct input", async () => {
      it("should convert LPtoDollar with LP fairPrice correctly", async () => {
        for (const _case of casesData) {
          const fairPrice = _case.fairPrice as BigNumber;
          let [lpToDollarResult] = await priceOracle.lpToDollar(ethers.constants.WeiPerEther, _case.lpAddress);
          expect(lpToDollarResult).to.be.eq(fairPrice);

          [lpToDollarResult] = await priceOracle.lpToDollar(ethers.utils.parseEther("2.5"), _case.lpAddress);
          expect(lpToDollarResult).to.be.eq(
            fairPrice.mul(ethers.utils.parseEther("2.5")).div(ethers.constants.WeiPerEther)
          );

          [lpToDollarResult] = await priceOracle.lpToDollar(ethers.utils.parseEther("9999999.123123"), _case.lpAddress);
          expect(lpToDollarResult).to.be.eq(
            fairPrice.mul(ethers.utils.parseEther("9999999.123123")).div(ethers.constants.WeiPerEther)
          );
        }
      });
      it("should convert LPtoDollar with fairPrice LP and LP normal, value should not different over 0.03 percent", async () => {
        for (const _case of casesData) {
          const expectedValue = _case.hasUSD
            ? _case.totalUSD.mul(ethers.constants.WeiPerEther).div(_case.totalSupply)
            : _case.token0Reserve.mul(_case.p0).add(_case.token1Reserve.mul(_case.p1)).div(_case.totalSupply);

          assertBigNumberClosePercent(
            expectedValue,
            (await priceOracle.lpToDollar(ethers.constants.WeiPerEther, _case.lpAddress))[0],
            "0.03"
          );
        }
      });
      it("should return 0 when no LP amount", async () => {
        const [dollarAmount] = await priceOracle.lpToDollar(ethers.constants.Zero, lpV2Token0Stable0.address);
        expect(dollarAmount).to.be.eq(ethers.constants.Zero);
      });
    });
  });

  describe("#dollarToLp", async () => {
    context("when incorrect input", async () => {
      it("should revert when no address", async () => {
        await expect(priceOracle.dollarToLp(ethers.constants.One, ethers.constants.AddressZero)).to.be.revertedWith(
          "DeltaNeutralOracle_InvalidLPAddress()"
        );
      });
    });
    context("when correct input", async () => {
      it("should convert dollarToLp with LP fairPrice correctly", async () => {
        for (const _case of casesData) {
          const fairPrice = _case.fairPrice as BigNumber;
          let [dollarToLPResult] = await priceOracle.dollarToLp(fairPrice, _case.lpAddress);
          expect(dollarToLPResult).to.be.eq(ethers.constants.WeiPerEther);

          let dollarInput = ethers.utils.parseEther("2.5").mul(fairPrice).div(ethers.constants.WeiPerEther);
          [dollarToLPResult] = await priceOracle.dollarToLp(dollarInput, _case.lpAddress);
          expect(dollarToLPResult).to.be.eq(ethers.utils.parseEther("2.5"));

          dollarInput = ethers.utils.parseEther("9999999.123123").mul(fairPrice).div(ethers.constants.WeiPerEther);
          const [lpPrice] = await priceOracle.dollarToLp(dollarInput, _case.lpAddress);
          // can't use to.be.eq because it's diff at decimal digits 6
          assertAlmostEqual(lpPrice.toString(), ethers.utils.parseEther("9999999.123123").toString());
        }
      });

      it("should convert dollarToLp with LP fairPrice and LP normal, value should not different over 0.03 percent", async () => {
        for (const _case of casesData) {
          const lpValue = _case.hasUSD
            ? _case.totalUSD.mul(ethers.constants.WeiPerEther).div(_case.totalSupply)
            : _case.token0Reserve.mul(_case.p0).add(_case.token1Reserve.mul(_case.p1)).div(_case.totalSupply);

          const dollarInput = ethers.constants.WeiPerEther;
          const expectedValue = dollarInput.mul(ethers.constants.WeiPerEther).div(lpValue);
          assertBigNumberClosePercent(
            expectedValue,
            (await priceOracle.dollarToLp(dollarInput, _case.lpAddress))[0],
            "0.03"
          );
        }
      });

      it("should return 0 when no LP amount", async () => {
        const [lpResult] = await priceOracle.dollarToLp(ethers.constants.Zero, lpV2Token0Stable0.address);
        expect(lpResult).to.be.eq(ethers.constants.Zero);
      });
    });
  });

  describe("#setOracle", async () => {
    context("when owner try set new price oracle", async () => {
      it("should correct", async () => {
        await expect(priceOracle.setOracle("0x166f56F2EDa9817cAB77118AE4FCAA0002A17eC7"))
          .to.be.emit(priceOracle, "LogSetOracle")
          .withArgs(await deployer.getAddress(), "0x166f56F2EDa9817cAB77118AE4FCAA0002A17eC7");
      });

      it("should revert when set zero address", async () => {
        await expect(priceOracle.setOracle(ethers.constants.AddressZero)).to.be.revertedWith(
          "DeltaNeutralOracle_InvalidOracleAddress()"
        );
      });
    });

    context("when other try set new price oracle address", async () => {
      it("should revert", async () => {
        await expect(priceOracleAsAlice.setOracle("0x166f56F2EDa9817cAB77118AE4FCAA0002A17eC7")).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });
  });
});
