import { ethers, network, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  MdexFactory,
  MdexFactory__factory,
  MdexPair,
  MdexPair__factory,
  MdexRouter__factory,
  MdexRouter,
  MdexRestrictedStrategyWithdrawMinimizeTrading,
  MdexRestrictedStrategyWithdrawMinimizeTrading__factory,
  WETH,
  WETH__factory,
  WNativeRelayer__factory,
  MdxToken,
  MdxToken__factory,
  SwapMining,
  SwapMining__factory,
  Oracle,
  Oracle__factory,
} from "../../../../../typechain";
import { MockMdexWorker__factory } from "../../../../../typechain/factories/MockMdexWorker__factory";
import { MockMdexWorker } from "../../../../../typechain/MockMdexWorker";
import { assertAlmostEqual } from "../../../../helpers/assert";
import * as TestHelpers from "../../../../helpers/assert";
import * as TimeHelpers from "../../../../helpers/time";

chai.use(solidity);
const { expect } = chai;

describe("MdexRestrictedStrategyWithdrawMinimizeTrading", () => {
  const FOREVER = "2000000000";
  const mdxPerBlock = "51600000000000000000";

  /// Mdex-related instance(s)
  let factory: MdexFactory;
  let router: MdexRouter;
  let lp: MdexPair;
  let baseTokenWbnbLp: MdexPair;
  let oracle: Oracle;
  let swapMining: SwapMining;

  /// MockMdexWorker-related instance(s)
  let mockMdexWorker: MockMdexWorker;
  let mockMdexEvilWorker: MockMdexWorker;
  let mockMdexBaseTokenWbnbWorker: MockMdexWorker;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;
  let mdxToken: MdxToken;

  /// Strategy instance(s)
  let strat: MdexRestrictedStrategyWithdrawMinimizeTrading;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;
  let baseTokenWbnbLpAsBob: MdexPair;

  let lpAsAlice: MdexPair;
  let lpAsBob: MdexPair;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerAsAlice: MdexRouter;
  let routerAsBob: MdexRouter;

  let stratAsAlice: MdexRestrictedStrategyWithdrawMinimizeTrading;
  let stratAsBob: MdexRestrictedStrategyWithdrawMinimizeTrading;

  let mockMdexWorkerAsBob: MockMdexWorker;
  let mockMdexEvilWorkerAsBob: MockMdexWorker;
  let mockMdexBaseTokenWbnbWorkerAsBob: MockMdexWorker;

  let wbnbAsAlice: WETH;
  let wbnbAsBob: WETH;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();

    // Setup Mdex
    const MdexFactory = (await ethers.getContractFactory("MdexFactory", deployer)) as MdexFactory__factory;
    factory = await MdexFactory.deploy(await deployer.getAddress());
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();

    const MdexRouter = (await ethers.getContractFactory("MdexRouter", deployer)) as MdexRouter__factory;
    router = await MdexRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

    const Oracle = (await ethers.getContractFactory("Oracle", deployer)) as Oracle__factory;
    oracle = await Oracle.deploy(factory.address);
    await oracle.deployed();

    /// Setup token stuffs
    const MdxToken = (await ethers.getContractFactory("MdxToken", deployer)) as MdxToken__factory;
    mdxToken = await MdxToken.deploy();
    await mdxToken.deployed();
    await mdxToken.addMinter(await deployer.getAddress());
    await mdxToken.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));

    const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    baseToken = (await upgrades.deployProxy(MockERC20, ["BTOKEN", "BTOKEN", 18])) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
    farmingToken = (await upgrades.deployProxy(MockERC20, ["FTOKEN", "FTOKEN", 18])) as MockERC20;
    await farmingToken.deployed();
    await farmingToken.mint(await alice.getAddress(), ethers.utils.parseEther("1"));
    await farmingToken.mint(await bob.getAddress(), ethers.utils.parseEther("1"));

    await factory.createPair(baseToken.address, farmingToken.address);
    await factory.createPair(baseToken.address, wbnb.address);

    lp = MdexPair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);
    baseTokenWbnbLp = MdexPair__factory.connect(await factory.getPair(wbnb.address, baseToken.address), deployer);

    await factory.addPair(lp.address);
    await factory.addPair(baseTokenWbnbLp.address);

    // Mdex SwapMinig
    const blockNumber = await TimeHelpers.latestBlockNumber();
    const SwapMining = (await ethers.getContractFactory("SwapMining", deployer)) as SwapMining__factory;
    swapMining = await SwapMining.deploy(
      mdxToken.address,
      factory.address,
      oracle.address,
      router.address,
      farmingToken.address,
      mdxPerBlock,
      blockNumber
    );
    await swapMining.deployed();

    // set swapMining to router
    await router.setSwapMining(swapMining.address);

    await mdxToken.addMinter(swapMining.address);
    await swapMining.addPair(100, lp.address, false);
    await swapMining.addWhitelist(baseToken.address);
    await swapMining.addWhitelist(farmingToken.address);

    /// Setup MockMdexWorker
    const MockMdexWorker = (await ethers.getContractFactory("MockMdexWorker", deployer)) as MockMdexWorker__factory;
    mockMdexWorker = (await MockMdexWorker.deploy(
      lp.address,
      baseToken.address,
      farmingToken.address
    )) as MockMdexWorker;
    await mockMdexWorker.deployed();
    mockMdexEvilWorker = (await MockMdexWorker.deploy(
      lp.address,
      baseToken.address,
      farmingToken.address
    )) as MockMdexWorker;
    await mockMdexEvilWorker.deployed();
    mockMdexBaseTokenWbnbWorker = (await MockMdexWorker.deploy(
      baseTokenWbnbLp.address,
      baseToken.address,
      wbnb.address
    )) as MockMdexWorker;
    await mockMdexBaseTokenWbnbWorker.deployed();

    /// Setup WNativeRelayer
    const WNativeRelayer = (await ethers.getContractFactory("WNativeRelayer", deployer)) as WNativeRelayer__factory;
    const wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
    await wNativeRelayer.deployed();

    const MdexRestrictedStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "MdexRestrictedStrategyWithdrawMinimizeTrading",
      deployer
    )) as MdexRestrictedStrategyWithdrawMinimizeTrading__factory;
    strat = (await upgrades.deployProxy(MdexRestrictedStrategyWithdrawMinimizeTrading, [
      router.address,
      wbnb.address,
      wNativeRelayer.address,
      mdxToken.address,
    ])) as MdexRestrictedStrategyWithdrawMinimizeTrading;
    await strat.deployed();
    await strat.setWorkersOk([mockMdexWorker.address, mockMdexBaseTokenWbnbWorker.address], true);
    await wNativeRelayer.setCallerOk([strat.address], true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);
    baseTokenWbnbLpAsBob = MdexPair__factory.connect(baseTokenWbnbLp.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerAsAlice = MdexRouter__factory.connect(router.address, alice);
    routerAsBob = MdexRouter__factory.connect(router.address, bob);

    lpAsAlice = MdexPair__factory.connect(lp.address, alice);
    lpAsBob = MdexPair__factory.connect(lp.address, bob);

    stratAsAlice = MdexRestrictedStrategyWithdrawMinimizeTrading__factory.connect(strat.address, alice);
    stratAsBob = MdexRestrictedStrategyWithdrawMinimizeTrading__factory.connect(strat.address, bob);

    mockMdexWorkerAsBob = MockMdexWorker__factory.connect(mockMdexWorker.address, bob);
    mockMdexEvilWorkerAsBob = MockMdexWorker__factory.connect(mockMdexEvilWorker.address, bob);
    mockMdexBaseTokenWbnbWorkerAsBob = MockMdexWorker__factory.connect(mockMdexBaseTokenWbnbWorker.address, bob);

    wbnbAsAlice = WETH__factory.connect(wbnb.address, alice);
    wbnbAsBob = WETH__factory.connect(wbnb.address, bob);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("When bad calldata", async () => {
    it("should revert", async () => {
      // Bob passes some bad calldata that can't be decoded
      await expect(stratAsBob.execute(await bob.getAddress(), "0", "0x1234")).to.be.reverted;
    });
  });

  context("When the setOkWorkers caller is not an owner", async () => {
    it("should be reverted", async () => {
      await expect(stratAsBob.setWorkersOk([mockMdexEvilWorkerAsBob.address], true)).to.reverted;
    });
  });

  context("When non-worker call the strat", async () => {
    it("should revert", async () => {
      await expect(
        stratAsBob.execute(
          await bob.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.5")])
        )
      ).to.be.reverted;
    });
  });

  context("When caller worker hasn't been whitelisted", async () => {
    it("should revert as bad worker", async () => {
      await baseTokenAsBob.transfer(mockMdexEvilWorkerAsBob.address, ethers.utils.parseEther("0.05"));
      await expect(
        mockMdexEvilWorkerAsBob.work(
          0,
          await bob.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.5")])]
          )
        )
      ).to.be.revertedWith("MdexRestrictedStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker");
    });
  });

  context("when revoking whitelist workers", async () => {
    it("should revert as bad worker", async () => {
      await strat.setWorkersOk([mockMdexWorker.address], false);
      await expect(
        mockMdexWorkerAsBob.work(
          0,
          await bob.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
          )
        )
      ).to.be.revertedWith("MdexRestrictedStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker");
    });
  });

  context("It should convert LP tokens and farming token", () => {
    beforeEach(async () => {
      // Alice adds 0.1 FTOKEN + 1 BaseToken
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

      // Bob tries to add 1 FTOKEN + 1 BaseToken (but obviously can only add 0.1 FTOKEN)
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
      expect(await farmingToken.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0.9"));
      expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0.316227766016837933"));

      await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));
    });

    it("should revert, Bob uses withdraw minimize trading strategy to turn LPs back to farming with an unreasonable expectation", async () => {
      await factory.setPairFees(lp.address, 25);
      // Bob uses withdraw minimize trading strategy to turn LPs back to farming with an unreasonable expectation
      await expect(
        mockMdexWorkerAsBob.work(
          0,
          await bob.getAddress(),
          ethers.utils.parseEther("1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("2")])]
          )
        )
      ).to.be.revertedWith(
        "MdexRestrictedStrategyWithdrawMinimizeTrading::execute:: insufficient farming tokens received"
      );
    });

    it("should convert all LP tokens back to BaseToken and FTOKEN, while debt == received BaseToken", async () => {
      const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFTOKENBefore = await farmingToken.balanceOf(await bob.getAddress());

      // Bob uses minimize trading strategy to turn LPs back to BaseToken and FTOKEN
      await mockMdexWorkerAsBob.work(
        0,
        await bob.getAddress(),
        ethers.utils.parseEther("1"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.001")])]
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
      await mockMdexWorkerAsBob.work(
        0,
        await bob.getAddress(),
        ethers.utils.parseEther("0.5"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.001")])]
        )
      );

      const bobBtokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobFtokenAfter = await farmingToken.balanceOf(await bob.getAddress());

      // After execute strategy successfully. The following conditions must be statified
      // - LPs in Strategy contract must be 0
      // - Bob should have 0 LP
      // - Bob should have 1 BTOKEN from contract return debt to Bob (Bob is msg.sender)
      // - Bob should have 0.1 FTOKEN as no swap is needed
      expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
      expect(bobBtokenAfter.sub(bobBtokenBefore)).to.be.eq(ethers.utils.parseEther("1"));
      expect(bobFtokenAfter.sub(bobFtokenBefore)).to.be.eq(ethers.utils.parseEther("0.1"));
    });

    it("should convert all LP tokens back to BaseToken and farming token (debt > received BaseToken, farming token is enough to cover debt, tradingFee = 25)", async () => {
      await factory.setPairFees(lp.address, 25);
      const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFtokenBefore = await farmingToken.balanceOf(await bob.getAddress());

      // Bob uses withdraw minimize trading strategy to turn LPs back to BaseToken and farming token
      await mockMdexWorkerAsBob.work(
        0,
        await bob.getAddress(),
        ethers.utils.parseEther("1.2"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.001")])]
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

    it("should convert all LP tokens back to BaseToken and farming token (debt > received BaseToken, farming token is enough to cover debt, tradingFee = 20)", async () => {
      await factory.setPairFees(lp.address, 20);
      const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFtokenBefore = await farmingToken.balanceOf(await bob.getAddress());

      // Bob uses withdraw minimize trading strategy to turn LPs back to BaseToken and farming token
      await mockMdexWorkerAsBob.work(
        0,
        await bob.getAddress(),
        ethers.utils.parseEther("1.2"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.001")])]
        )
      );

      const bobBtokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobFtokenAfter = await farmingToken.balanceOf(await bob.getAddress());

      // After execute strategy successfully. The following conditions must be statified
      // - LPs in Strategy contract must be 0
      // - Bob should have 0 LP
      // - Bob should have 1.2 BTOKEN from contract return debt to Bob (Bob is msg.sender)
      // - Bob should have 0.1 - [(0.1*0.2*1000)/((1-0.2)*998)] = 0.074949899799599198
      expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
      expect(bobBtokenAfter.sub(bobBtokenBefore)).to.be.eq(ethers.utils.parseEther("1.2"));
      expect(bobFtokenAfter.sub(bobFtokenBefore)).to.be.eq(ethers.utils.parseEther("0.074949899799599198")); // 0.1 - 0.025 = 0.075 farming token
    });

    it("should revert when debt > received BaseToken, farming token is not enough to cover the debt", async () => {
      await expect(
        mockMdexWorkerAsBob.work(
          0,
          await bob.getAddress(),
          ethers.utils.parseEther("3"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.001")])]
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
      await baseTokenAsAlice.approve(router.address, ethers.utils.parseEther("1"));
      await wbnbAsAlice.approve(router.address, ethers.utils.parseEther("0.1"));
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
      await baseTokenAsBob.approve(router.address, ethers.utils.parseEther("1"));
      await wbnbAsBob.approve(router.address, ethers.utils.parseEther("1"));
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
      await baseTokenWbnbLpAsBob.transfer(
        mockMdexBaseTokenWbnbWorker.address,
        ethers.utils.parseEther("0.316227766016837933")
      );
    });

    it("should revert, Bob uses withdraw minimize trading strategy to turn LPs back to farming with an unreasonable expectation", async () => {
      // Bob uses withdraw minimize trading strategy to turn LPs back to farming with an unreasonable expectation
      await expect(
        mockMdexBaseTokenWbnbWorkerAsBob.work(
          0,
          await bob.getAddress(),
          ethers.utils.parseEther("1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("2")])]
          )
        )
      ).to.be.revertedWith(
        "MdexRestrictedStrategyWithdrawMinimizeTrading::execute:: insufficient farming tokens received"
      );
    });

    it("should convert all LP tokens back to BaseToken and BNB, while debt == received BaseToken", async () => {
      const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbBefore = await ethers.provider.getBalance(await bob.getAddress());

      // Bob uses minimize trading strategy to turn LPs back to BaseToken and BNB
      // set gasPrice = 0 in order to assert native balance movement easier
      await mockMdexBaseTokenWbnbWorkerAsBob.work(
        0,
        await bob.getAddress(),
        ethers.utils.parseEther("1"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.001")])]
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
      await mockMdexBaseTokenWbnbWorkerAsBob.work(
        0,
        await bob.getAddress(),
        ethers.utils.parseEther("0.5"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.001")])]
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
      expect(ethers.utils.parseEther("0.1").toString(), bobBnbAfter.sub(bobBnbBefore).toString());
    });

    it("should convert all LP tokens back to BaseToken and BNB (debt > received BaseToken, BNB is enough to cover debt, tradingFee = 25)", async () => {
      await factory.setPairFees(baseTokenWbnbLp.address, 25);
      const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbBefore = await ethers.provider.getBalance(await bob.getAddress());

      // Bob uses withdraw minimize trading strategy to turn LPs back to BaseToken and BNB
      // set gasPrice = 0 in order to assert native balance movement easier
      await mockMdexBaseTokenWbnbWorkerAsBob.work(
        0,
        await bob.getAddress(),
        ethers.utils.parseEther("1.2"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.001")])]
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

    it("should convert all LP tokens back to BaseToken and BNB (debt > received BaseToken, BNB is enough to cover debt, tradingFee = 20)", async () => {
      await factory.setPairFees(baseTokenWbnbLp.address, 20);
      const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbBefore = await ethers.provider.getBalance(await bob.getAddress());

      // Bob uses withdraw minimize trading strategy to turn LPs back to BaseToken and BNB
      // set gasPrice = 0 in order to assert native balance movement easier
      await mockMdexBaseTokenWbnbWorkerAsBob.work(
        0,
        await bob.getAddress(),
        ethers.utils.parseEther("1.2"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.001")])]
        ),
        { gasPrice: 0 }
      );

      const bobBtokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbAfter = await ethers.provider.getBalance(await bob.getAddress());

      // After execute strategy successfully. The following conditions must be statified
      // - LPs in Strategy contract must be 0
      // - Bob should have 0 LP
      // - Bob should have 1.2 BTOKEN from contract return debt to Bob (Bob is msg.sender)
      // - Bob should have 0.1 - [(0.1*0.2*1000)/((1-0.2)*998)] = 0.074949899799599198
      expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
      expect(bobBtokenAfter.sub(bobBtokenBefore)).to.be.eq(ethers.utils.parseEther("1.2"));
      expect(bobBnbAfter.sub(bobBnbBefore)).to.be.eq(ethers.utils.parseEther("0.074949899799599198"));
    });

    it("should revert when debt > received BaseToken, BNB is not enough to cover the debt", async () => {
      await expect(
        mockMdexBaseTokenWbnbWorkerAsBob.work(
          0,
          await bob.getAddress(),
          ethers.utils.parseEther("3"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.001")])]
          ),
          { gasPrice: 0 }
        )
      ).to.be.revertedWith("subtraction overflow");
    });
  });

  describe("#withdrawTradingReward", async () => {
    context("when caller is not an owner", async () => {
      it("should revert", async () => {
        await expect(stratAsBob.withdrawTradingRewards(await bob.getAddress())).to.reverted;
      });
    });
    context("When withdrawTradingRewards caller is the owner", async () => {
      it("should be able to withdraw trading rewards", async () => {
        // Alice adds 0.1 FTOKEN + 1 BaseToken
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

        // Bob tries to add 1 FTOKEN + 1 BaseToken (but obviously can only add 0.1 FTOKEN)
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
        expect(await farmingToken.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0.9"));
        expect(await lp.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0.316227766016837933"));

        await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));

        // set lp pair fee
        await factory.setPairFees(lp.address, 20);
        // Bob uses withdraw minimize trading strategy to turn LPs back to BaseToken and farming token
        await mockMdexWorkerAsBob.work(
          0,
          await bob.getAddress(),
          ethers.utils.parseEther("1.2"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.001")])]
          )
        );

        const deployerAddress = await deployer.getAddress();
        const mdxBefore = await mdxToken.balanceOf(deployerAddress);
        // withdraw trading reward to deployer
        const withDrawTx = await strat.withdrawTradingRewards(deployerAddress);
        const mdxAfter = await mdxToken.balanceOf(deployerAddress);
        // get trading reward of the previos block
        const pIds = [0];
        const totalRewardPrev = await strat.getMiningRewards(pIds, { blockTag: Number(withDrawTx.blockNumber) - 1 });
        const withDrawBlockReward = await swapMining["reward()"]({ blockTag: withDrawTx.blockNumber });
        const totalReward = totalRewardPrev.add(withDrawBlockReward);
        expect(mdxAfter.sub(mdxBefore)).to.eq(totalReward);
      });
    });
  });
});
