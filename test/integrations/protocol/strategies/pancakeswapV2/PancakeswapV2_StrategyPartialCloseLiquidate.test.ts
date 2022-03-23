import { ethers, upgrades, waffle } from "hardhat";
import { Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  PancakeFactory,
  PancakeFactory__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouter,
  PancakeRouterV2,
  PancakeRouterV2__factory,
  PancakeRouter__factory,
  PancakeswapV2StrategyPartialCloseLiquidate,
  StrategyPartialCloseLiquidate,
  StrategyPartialCloseLiquidate__factory,
  WETH,
  WETH__factory,
} from "../../../../../typechain";
import { assertAlmostEqual } from "../../../../helpers/assert";

chai.use(solidity);
const { expect } = chai;

describe("PancakeswapV2 - StrategyPartialLiquidate", () => {
  const FOREVER = "2000000000";

  /// Pancake-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouterV2;
  let lp: PancakePair;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy-ralted instance(s)
  let strat: PancakeswapV2StrategyPartialCloseLiquidate;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let lpAsBob: PancakePair;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerAsAlice: PancakeRouterV2;
  let routerAsBob: PancakeRouterV2;

  let stratAsBob: PancakeswapV2StrategyPartialCloseLiquidate;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();

    // Setup Pancakeswap
    const PancakeFactoryV2 = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
    factoryV2 = await PancakeFactoryV2.deploy(await deployer.getAddress());
    await factoryV2.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();
    await wbnb.deployed();

    const PancakeRouterV2 = (await ethers.getContractFactory("PancakeRouterV2", deployer)) as PancakeRouter__factory;
    routerV2 = await PancakeRouterV2.deploy(factoryV2.address, wbnb.address);
    await routerV2.deployed();

    /// Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    baseToken = (await upgrades.deployProxy(MockERC20, ["BTOKEN", "BTOKEN", 18])) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
    farmingToken = (await upgrades.deployProxy(MockERC20, ["FTOKEN", "FTOKEN", 18])) as MockERC20;
    await farmingToken.deployed();
    await farmingToken.mint(await alice.getAddress(), ethers.utils.parseEther("10"));
    await farmingToken.mint(await bob.getAddress(), ethers.utils.parseEther("10"));

    await factoryV2.createPair(baseToken.address, farmingToken.address);

    lp = PancakePair__factory.connect(await factoryV2.getPair(farmingToken.address, baseToken.address), deployer);

    const PancakewapV2StrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "PancakeswapV2StrategyPartialCloseLiquidate",
      deployer
    )) as StrategyPartialCloseLiquidate__factory;
    strat = (await upgrades.deployProxy(PancakewapV2StrategyPartialCloseLiquidate, [
      routerV2.address,
    ])) as PancakeswapV2StrategyPartialCloseLiquidate;
    await strat.deployed();

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerAsAlice = PancakeRouterV2__factory.connect(routerV2.address, alice);
    routerAsBob = PancakeRouterV2__factory.connect(routerV2.address, bob);

    lpAsBob = PancakePair__factory.connect(lp.address, bob);

    stratAsBob = StrategyPartialCloseLiquidate__factory.connect(strat.address, bob);

    // Setting up liquidity
    // Alice adds 0.1 FTOKEN + 1 BTOKEN
    await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("1"));
    await farmingTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("0.1"));
    await routerAsAlice.addLiquidity(
      baseToken.address,
      farmingToken.address,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("0.1"),
      "0",
      "0",
      await alice.getAddress(),
      FOREVER
    );

    // Bob tries to add 1 FTOKEN + 1 BTOKEN (but obviously can only add 0.1 FTOKEN)
    await baseTokenAsBob.approve(routerV2.address, ethers.utils.parseEther("1"));
    await farmingTokenAsBob.approve(routerV2.address, ethers.utils.parseEther("1"));
    await routerAsBob.addLiquidity(
      baseToken.address,
      farmingToken.address,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("1"),
      "0",
      "0",
      await bob.getAddress(),
      FOREVER
    );

    expect(await baseToken.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("99"));
    expect(await farmingToken.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("9.9"));
    expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0.316227766016837933"));
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  it("should revert on bad calldata", async () => {
    // Bob passes some bad calldata that can't be decoded
    await expect(stratAsBob.execute(await bob.getAddress(), "0", "0x1234")).to.be.reverted;
  });

  it("should revert when the given LPs > the actual LPs sent to strategy", async () => {
    // Bob transfer LP to strategy first
    await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));

    // Bob uses partial close liquidate strategy to with unrealistic returnLp to liquidate
    // Bob only transfer ~0.316227766016837933 LPs. However, he ask to liquidate 1000 LPs
    await expect(
      stratAsBob.execute(
        await bob.getAddress(),
        "0",
        ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint256", "uint256"],
          [baseToken.address, farmingToken.address, ethers.utils.parseEther("1000"), ethers.utils.parseEther("0.5")]
        )
      )
    ).revertedWith("StrategyPartialCloseLiquidate::execute:: insufficient LP amount recevied from worker");
  });

  it("should revert when the give LPs are liquidated but slippage > minBaseToken", async () => {
    // Bob transfer LP to strategy first
    const bobLpBefore = await lp.balanceOf(await bob.getAddress());
    await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));

    // Bob uses partial close liquidate strategy to turn the 50% LPs back to BTOKEN with invalid minBaseToken
    // 50% LPs is worth aroud ~0.87 BTOKEN. Bob enters minBaseToken 1000 BTOKEN which will obviously make tx fail.
    const returnLp = bobLpBefore.div(2);
    await expect(
      stratAsBob.execute(
        await bob.getAddress(),
        "0",
        ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint256", "uint256"],
          [baseToken.address, farmingToken.address, returnLp, ethers.utils.parseEther("1000")]
        )
      )
    ).revertedWith("StrategyPartialCloseLiquidate::execute:: insufficient baseToken received");
  });

  it("should convert the given LP tokens back to baseToken, when maxReturn >= liquidated amount", async () => {
    // Bob transfer LP to strategy first
    const bobLpBefore = await lp.balanceOf(await bob.getAddress());
    const bobBTokenBefore = await baseToken.balanceOf(await bob.getAddress());
    await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));

    // Bob uses partial close liquidate strategy to turn the 50% LPs back to BTOKEN with the same minimum value and the same maxReturn
    const returnLp = bobLpBefore.div(2);
    await stratAsBob.execute(
      await bob.getAddress(),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256", "uint256"],
        [baseToken.address, farmingToken.address, returnLp, ethers.utils.parseEther("0.5")]
      )
    );

    // After execute strategy successfully. The following conditions must be statified
    // - LPs in Strategy contract must be 0
    // - Bob should have bobLpBefore - returnLp left in his account
    // - Bob should have bobBtokenBefore + 0.5 BTOKEN + [((0.05*9975)*1.5)/(0.15*10000+(0.05*9975))] = ~0.374296435272045028 BTOKEN] (from swap 0.05 FTOKEN to BTOKEN) in his account
    // - BTOKEN in reserve should be 1.5-0.374296435272045028 = 1.12570356 BTOKEN
    // - FTOKEN in reserve should be 0.15+0.05 = 0.2 FTOKEN
    expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(bobLpBefore.sub(returnLp));
    assertAlmostEqual(
      bobBTokenBefore
        .add(ethers.utils.parseEther("0.5"))
        .add(ethers.utils.parseEther("0.374296435272045028"))
        .toString(),
      (await baseToken.balanceOf(await bob.getAddress())).toString()
    );
    assertAlmostEqual(
      ethers.utils.parseEther("1.12570356").toString(),
      (await baseToken.balanceOf(lp.address)).toString()
    );
    assertAlmostEqual(ethers.utils.parseEther("0.2").toString(), (await farmingToken.balanceOf(lp.address)).toString());
  });
});
