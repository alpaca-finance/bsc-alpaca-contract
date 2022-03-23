import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import * as TestHelpers from "../../../../helpers/assert";
import {
  MockERC20,
  MockERC20__factory,
  PancakeFactory,
  PancakeFactory__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouterV2,
  PancakeRouterV2__factory,
  PancakeswapV2StrategyWithdrawMinimizeTrading,
  PancakeswapV2StrategyWithdrawMinimizeTrading__factory,
  WETH,
  WETH__factory,
  WNativeRelayer__factory,
} from "../../../../../typechain";

chai.use(solidity);
const { expect } = chai;

describe("PancakeswapV2 - StrategyWithdrawMinimizeTrading", () => {
  const FOREVER = "2000000000";

  /// Pancake-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouterV2;
  let lp: PancakePair;
  let baseTokenWbnbLp: PancakePair;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy-ralted instance(s)
  let strat: PancakeswapV2StrategyWithdrawMinimizeTrading;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let baseTokenWbnbLpAsBob: PancakePair;

  let lpAsAlice: PancakePair;
  let lpAsBob: PancakePair;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerAsAlice: PancakeRouterV2;
  let routerAsBob: PancakeRouterV2;

  let stratAsAlice: PancakeswapV2StrategyWithdrawMinimizeTrading;
  let stratAsBob: PancakeswapV2StrategyWithdrawMinimizeTrading;

  let wbnbAsAlice: WETH;
  let wbnbAsBob: WETH;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();

    // Setup Pancake
    const PancakeFactoryV2 = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
    factoryV2 = await PancakeFactoryV2.deploy(await deployer.getAddress());
    await factoryV2.deployed();

    const WETH = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WETH.deploy();
    await wbnb.deployed();

    const PancakeRouterV2 = (await ethers.getContractFactory("PancakeRouterV2", deployer)) as PancakeRouterV2__factory;
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
    await farmingToken.mint(await alice.getAddress(), ethers.utils.parseEther("1"));
    await farmingToken.mint(await bob.getAddress(), ethers.utils.parseEther("1"));

    await factoryV2.createPair(baseToken.address, farmingToken.address);
    await factoryV2.createPair(baseToken.address, wbnb.address);

    lp = PancakePair__factory.connect(await factoryV2.getPair(farmingToken.address, baseToken.address), deployer);
    baseTokenWbnbLp = PancakePair__factory.connect(await factoryV2.getPair(wbnb.address, baseToken.address), deployer);

    /// Setup WNativeRelayer
    const WNativeRelayer = (await ethers.getContractFactory("WNativeRelayer", deployer)) as WNativeRelayer__factory;
    const wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
    await wNativeRelayer.deployed();

    /// Setup StrategyWithdrawMinimizeTrading
    const PancakeswapV2StrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "PancakeswapV2StrategyWithdrawMinimizeTrading",
      deployer
    )) as PancakeswapV2StrategyWithdrawMinimizeTrading__factory;
    strat = (await upgrades.deployProxy(PancakeswapV2StrategyWithdrawMinimizeTrading, [
      routerV2.address,
      wbnb.address,
      wNativeRelayer.address,
    ])) as PancakeswapV2StrategyWithdrawMinimizeTrading;
    await strat.deployed();

    await wNativeRelayer.setCallerOk([strat.address], true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    baseTokenWbnbLpAsBob = PancakePair__factory.connect(baseTokenWbnbLp.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerAsAlice = PancakeRouterV2__factory.connect(routerV2.address, alice);
    routerAsBob = PancakeRouterV2__factory.connect(routerV2.address, bob);

    lpAsAlice = PancakePair__factory.connect(lp.address, alice);
    lpAsBob = PancakePair__factory.connect(lp.address, bob);

    stratAsAlice = PancakeswapV2StrategyWithdrawMinimizeTrading__factory.connect(strat.address, alice);
    stratAsBob = PancakeswapV2StrategyWithdrawMinimizeTrading__factory.connect(strat.address, bob);

    wbnbAsAlice = WETH__factory.connect(wbnb.address, alice);
    wbnbAsBob = WETH__factory.connect(wbnb.address, bob);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("It should convert LP tokens and farming token", () => {
    beforeEach(async () => {
      // Alice adds 0.1 FTOKEN + 1 BaseToken
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

      // Bob tries to add 1 FTOKEN + 1 BaseToken (but obviously can only add 0.1 FTOKEN)
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

      expect(await farmingToken.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0.9"));
      expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0.316227766016837933"));

      await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));
    });

    it("should revert, Bob uses withdraw minimize trading strategy to turn LPs back to farming with an unreasonable expectation", async () => {
      // Bob uses withdraw minimize trading strategy to turn LPs back to farming with an unreasonable expectation
      await expect(
        stratAsBob.execute(
          await bob.getAddress(),
          ethers.utils.parseEther("1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "address", "uint256"],
            [baseToken.address, farmingToken.address, ethers.utils.parseEther("2")]
          )
        )
      ).to.be.revertedWith("StrategyWithdrawMinimizeTrading::execute:: insufficient farming tokens received");
    });

    it("should convert all LP tokens back to BaseToken and FTOKEN, while debt == received BaseToken", async () => {
      const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFTOKENBefore = await farmingToken.balanceOf(await bob.getAddress());

      // Bob uses minimize trading strategy to turn LPs back to BaseToken and FTOKEN
      await stratAsBob.execute(
        await bob.getAddress(),
        ethers.utils.parseEther("1"), // debt 1 BaseToken
        ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint256"],
          [baseToken.address, farmingToken.address, ethers.utils.parseEther("0.001")]
        )
      );

      const bobBaseTokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobFTOKENAfter = await farmingToken.balanceOf(await bob.getAddress());

      // After execute strategy successfully. The following conditions must be statified
      // - LPs in Strategy contract must be 0
      // - Bob should have 0 LP
      // - Bob should have 1 BTOKEN from contract return debt to Bob (Bob is msg.sender)
      // - Bob should have 0.1 FTOKEN as no swap is needed
      expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
      expect(bobBaseTokenAfter.sub(bobBaseTokenBefore)).to.be.eq(ethers.utils.parseEther("1"));
      expect(bobFTOKENAfter.sub(bobFTOKENBefore)).to.be.eq(ethers.utils.parseEther("0.1"));
    });

    it("should convert all LP tokens back to BaseToken and FTOKEN when debt < received BaseToken", async () => {
      const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFtokenBefore = await farmingToken.balanceOf(await bob.getAddress());

      // Bob uses liquidate strategy to turn LPs back to BTOKEN and farming token
      await stratAsBob.execute(
        await bob.getAddress(),
        ethers.utils.parseEther("0.5"), // debt 0.5 BTOKEN
        ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint256"],
          [baseToken.address, farmingToken.address, ethers.utils.parseEther("0.001")]
        )
      );

      const bobBtokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobFtokenAfter = await farmingToken.balanceOf(await bob.getAddress());

      // After execute strategy successfully. The following conditions must be statified
      // - LPs in Strategy contract must be 0
      // - Bob should have 0 LP
      // - Bob should have 1 BTOKEN from contract return 0.5 BTOKEN debt to Bob (Bob is msg.sender) and another 0.5 leftover BTOKEN
      // - Bob should have 0.1 - [(0.1*0.2*10000)/(1-0.2*9975)] = 0.074937343358395989
      expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
      expect(bobBtokenAfter.sub(bobBtokenBefore)).to.be.eq(ethers.utils.parseEther("1"));
      expect(bobFtokenAfter.sub(bobFtokenBefore)).to.be.eq(ethers.utils.parseEther("0.1"));
    });

    it("should convert all LP tokens back to BaseToken and farming token (debt > received BaseToken, farming token is enough to cover debt)", async () => {
      const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFtokenBefore = await farmingToken.balanceOf(await bob.getAddress());

      // Bob uses withdraw minimize trading strategy to turn LPs back to BaseToken and farming token
      await stratAsBob.execute(
        await bob.getAddress(),
        ethers.utils.parseEther("1.2"), // debt 1.2 BaseToken
        ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint256"],
          [baseToken.address, farmingToken.address, ethers.utils.parseEther("0.001")]
        )
      );

      const bobBtokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobFtokenAfter = await farmingToken.balanceOf(await bob.getAddress());

      // After execute strategy successfully. The following conditions must be statified
      // - LPs in Strategy contract must be 0
      // - Bob should have 0 LP
      // - Bob should have 1.2 BTOKEN from contract return debt to Bob (Bob is msg.sender)
      // - Bob should have 0.1 - [(0.1*0.2*10000)/((1-0.2)*9975)] = 0.074937343358395989
      expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
      expect(bobBtokenAfter.sub(bobBtokenBefore)).to.be.eq(ethers.utils.parseEther("1.2"));
      expect(bobFtokenAfter.sub(bobFtokenBefore)).to.be.eq(ethers.utils.parseEther("0.074937343358395989")); // 0.1 - 0.025 = 0.075 farming token
    });

    it("should revert when debt > received BaseToken, farming token is not enough to cover the debt", async () => {
      await expect(
        stratAsBob.execute(
          await bob.getAddress(),
          ethers.utils.parseEther("3"), // debt 2 BaseToken
          ethers.utils.defaultAbiCoder.encode(
            ["address", "address", "uint256"],
            [baseToken.address, farmingToken.address, ethers.utils.parseEther("0.001")]
          )
        )
      ).to.be.revertedWith("subtraction overflow");
    });
  });

  context("It should handle properly when the farming token is WBNB", () => {
    beforeEach(async () => {
      // Alice wrap BNB
      await wbnbAsAlice.deposit({ value: ethers.utils.parseEther("0.1") });
      // Alice adds 0.1 WBNB + 1 BaseToken
      await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("1"));
      await wbnbAsAlice.approve(routerV2.address, ethers.utils.parseEther("0.1"));
      await routerAsAlice.addLiquidity(
        baseToken.address,
        wbnb.address,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("0.1"),
        "0",
        "0",
        await alice.getAddress(),
        FOREVER
      );

      // Bob wrap BNB
      await wbnbAsBob.deposit({ value: ethers.utils.parseEther("1") });
      // Bob tries to add 1 WBNB + 1 BaseToken (but obviously can only add 0.1 WBNB)
      await baseTokenAsBob.approve(routerV2.address, ethers.utils.parseEther("1"));
      await wbnbAsBob.approve(routerV2.address, ethers.utils.parseEther("1"));
      await routerAsBob.addLiquidity(
        baseToken.address,
        wbnb.address,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1"),
        "0",
        "0",
        await bob.getAddress(),
        FOREVER
      );

      expect(await wbnb.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0.9"));
      expect(await baseTokenWbnbLp.balanceOf(await bob.getAddress())).to.be.eq(
        ethers.utils.parseEther("0.316227766016837933")
      );

      await baseTokenWbnbLpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));
    });

    it("should revert, Bob uses withdraw minimize trading strategy to turn LPs back to farming with an unreasonable expectation", async () => {
      // Bob uses withdraw minimize trading strategy to turn LPs back to farming with an unreasonable expectation
      await expect(
        stratAsBob.execute(
          await bob.getAddress(),
          ethers.utils.parseEther("1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "address", "uint256"],
            [baseToken.address, wbnb.address, ethers.utils.parseEther("2")]
          )
        )
      ).to.be.revertedWith("StrategyWithdrawMinimizeTrading::execute:: insufficient farming tokens received");
    });

    it("should convert all LP tokens back to BaseToken and BNB, while debt == received BaseToken", async () => {
      const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbBefore = await ethers.provider.getBalance(await bob.getAddress());

      // Bob uses minimize trading strategy to turn LPs back to BaseToken and BNB
      // set gasPrice = 0 in order to assert native balance movement easier
      await stratAsBob.execute(
        await bob.getAddress(),
        ethers.utils.parseEther("1"), // debt 1 BaseToken
        ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint256"],
          [baseToken.address, wbnb.address, ethers.utils.parseEther("0.001")]
        ),
        { gasPrice: 0 }
      );

      const bobBaseTokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbAfter = await ethers.provider.getBalance(await bob.getAddress());

      // After execute strategy successfully. The following conditions must be statified
      // - LPs in Strategy contract must be 0
      // - Bob should have 0 LP
      // - Bob should have 1 BTOKEN from contract return debt to Bob (Bob is msg.sender)
      // - Bob should have 0.1 FTOKEN
      expect(await baseTokenWbnbLp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await baseTokenWbnbLp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
      expect(bobBaseTokenAfter.sub(bobBaseTokenBefore)).to.be.eq(ethers.utils.parseEther("1"));
      expect(bobBnbAfter.sub(bobBnbBefore)).to.be.eq(ethers.utils.parseEther("0.1"));
    });

    it("should convert all LP tokens back to BaseToken and FTOKEN when debt < received BaseToken", async () => {
      const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbBefore = await ethers.provider.getBalance(await bob.getAddress());

      // Bob uses liquidate strategy to turn LPs back to ETH and farming token
      // set gasPrice = 0 in order to assert native balance movement easier
      await stratAsBob.execute(
        await bob.getAddress(),
        ethers.utils.parseEther("0.5"), // debt 0.5 ETH
        ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint256"],
          [baseToken.address, wbnb.address, ethers.utils.parseEther("0.001")]
        ),
        { gasPrice: 0 }
      );

      const bobBtokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbAfter = await ethers.provider.getBalance(await bob.getAddress());

      // After execute strategy successfully. The following conditions must be statified
      // - LPs in Strategy contract must be 0
      // - Bob should have 0 LP
      // - Bob should have 1 BTOKEN from contract return 0.5 BTOKEN debt to Bob (Bob is msg.sender) + 0.5 BTOKEN leftover
      // - Bob should have 0.1 FTOKEN as no swap needed
      expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
      expect(bobBtokenAfter.sub(bobBtokenBefore)).to.be.eq(ethers.utils.parseEther("1"));
      TestHelpers.assertAlmostEqual(
        ethers.utils.parseEther("0.1").toString(),
        bobBnbAfter.sub(bobBnbBefore).toString()
      );
    });

    it("should convert all LP tokens back to BaseToken and BNB (debt > received BaseToken, BNB is enough to cover debt)", async () => {
      const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbBefore = await ethers.provider.getBalance(await bob.getAddress());

      // Bob uses withdraw minimize trading strategy to turn LPs back to BaseToken and BNB
      // set gasPrice = 0 in order to assert native balance movement easier
      await stratAsBob.execute(
        await bob.getAddress(),
        ethers.utils.parseEther("1.2"), // debt 1.2 BaseToken
        ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint256"],
          [baseToken.address, wbnb.address, ethers.utils.parseEther("0.001")]
        ),
        { gasPrice: 0 }
      );

      const bobBtokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbAfter = await ethers.provider.getBalance(await bob.getAddress());

      // After execute strategy successfully. The following conditions must be statified
      // - LPs in Strategy contract must be 0
      // - Bob should have 0 LP
      // - Bob should have 1.2 BTOKEN from contract return debt to Bob (Bob is msg.sender)
      // - Bob should have 0.1 - [(0.1*0.2*10000)/((1-0.2)*9975)] = 0.074937343358395989
      expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
      expect(bobBtokenAfter.sub(bobBtokenBefore)).to.be.eq(ethers.utils.parseEther("1.2"));
      expect(bobBnbAfter.sub(bobBnbBefore)).to.be.eq(ethers.utils.parseEther("0.074937343358395989"));
    });

    it("should revert when debt > received BaseToken, BNB is not enough to cover the debt", async () => {
      await expect(
        stratAsBob.execute(
          await bob.getAddress(),
          ethers.utils.parseEther("3"), // debt 3 BTOKEN
          ethers.utils.defaultAbiCoder.encode(
            ["address", "address", "uint256"],
            [baseToken.address, wbnb.address, ethers.utils.parseEther("0.001")]
          )
        )
      ).to.be.revertedWith("subtraction overflow");
    });
  });
});
