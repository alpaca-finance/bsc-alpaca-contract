import { ethers, network, upgrades, waffle } from "hardhat";
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
  PancakeRouter__factory,
  StrategyPartialCloseLiquidate,
  StrategyPartialCloseLiquidate__factory,
  WETH,
  WETH__factory,
} from "../../../../../typechain";
import { assertAlmostEqual } from "../../../../helpers/assert";

chai.use(solidity);
const { expect } = chai;

describe("Pancakeswap - StrategyPartialLiquidate", () => {
  const FOREVER = "2000000000";

  /// Pancake-related instance(s)
  let factory: PancakeFactory;
  let router: PancakeRouter;
  let lp: PancakePair;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy-ralted instance(s)
  let strat: StrategyPartialCloseLiquidate;

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

  let routerAsAlice: PancakeRouter;
  let routerAsBob: PancakeRouter;

  let stratAsBob: StrategyPartialCloseLiquidate;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();

    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
    factory = await PancakeFactory.deploy(await deployer.getAddress());
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();
    await factory.deployed();

    const PancakeRouter = (await ethers.getContractFactory("PancakeRouter", deployer)) as PancakeRouter__factory;
    router = await PancakeRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

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

    await factory.createPair(baseToken.address, farmingToken.address);

    lp = PancakePair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);

    const StrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "StrategyPartialCloseLiquidate",
      deployer
    )) as StrategyPartialCloseLiquidate__factory;
    strat = (await upgrades.deployProxy(StrategyPartialCloseLiquidate, [
      router.address,
    ])) as StrategyPartialCloseLiquidate;
    await strat.deployed();

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerAsAlice = PancakeRouter__factory.connect(router.address, alice);
    routerAsBob = PancakeRouter__factory.connect(router.address, bob);

    lpAsBob = PancakePair__factory.connect(lp.address, bob);

    stratAsBob = StrategyPartialCloseLiquidate__factory.connect(strat.address, bob);

    // Setting up liquidity
    // Alice adds 0.1 FTOKEN + 1 BTOKEN
    await baseTokenAsAlice.approve(router.address, ethers.utils.parseEther("1"));
    await farmingTokenAsAlice.approve(router.address, ethers.utils.parseEther("0.1"));
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
    await baseTokenAsBob.approve(router.address, ethers.utils.parseEther("1"));
    await farmingTokenAsBob.approve(router.address, ethers.utils.parseEther("1"));
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
    // - Bob should have bobBtokenBefore + 0.5 BTOKEN + [((0.05*998)*1.5)/(0.15*1000+(0.05*998)) = ~0.374437218609304645 BTOKEN] (from swap 0.05 FTOKEN to BTOKEN) in his account
    // - BTOKEN in reserve should be 1.5-0.374437218609304645 = 1.12556278 BTOKEN
    // - FTOKEN in reserve should be 0.15+(0.05*0.998) = 0.2 FTOKEN
    expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(bobLpBefore.sub(returnLp));
    assertAlmostEqual(
      bobBTokenBefore
        .add(ethers.utils.parseEther("0.5"))
        .add(ethers.utils.parseEther("0.374437218609304645"))
        .toString(),
      (await baseToken.balanceOf(await bob.getAddress())).toString()
    );
    assertAlmostEqual(
      ethers.utils.parseEther("1.12556278").toString(),
      (await baseToken.balanceOf(lp.address)).toString()
    );
    assertAlmostEqual(ethers.utils.parseEther("0.2").toString(), (await farmingToken.balanceOf(lp.address)).toString());
  });
});
