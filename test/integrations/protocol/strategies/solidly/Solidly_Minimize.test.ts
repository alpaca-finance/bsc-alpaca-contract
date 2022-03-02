import { ethers, upgrades, waffle, network } from "hardhat";
import { Signer, BigNumberish, utils, Wallet } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  BaseV1Factory,
  BaseV1Factory__factory,
  BaseV1Pair,
  BaseV1Pair__factory,
  BaseV1Router01,
  BaseV1Router01__factory,
  WrappedFtm,
  WrappedFtm__factory,
  WNativeRelayer__factory,
  MockWaultSwapWorker,
  MockWaultSwapWorker__factory,
  SolidlyStrategyWithdrawMinimizeTrading,
  SolidlyStrategyWithdrawMinimizeTrading__factory,
} from "../../../../../typechain";
import * as TestHelpers from "../../../../helpers/assert";

chai.use(solidity);
const { expect } = chai;

describe("SolidlyStrategyWithdrawMinimizeTrading", () => {
  const FOREVER = "2000000000";

  /// DEX-related instance(s)
  /// note: Use WaultSwap here because they have the same fee-structure
  let factory: BaseV1Factory;
  let router: BaseV1Router01;
  let lp: BaseV1Pair;
  let baseTokenWbnbLp: BaseV1Pair;

  /// MockWaultSwapWorker-related instance(s)
  let mockWorker: MockWaultSwapWorker;
  let mockEvilWorker: MockWaultSwapWorker;
  let mockBaseTokenWbnbV2Worker: MockWaultSwapWorker;

  /// Token-related instance(s)
  let wbnb: WrappedFtm;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let strat: SolidlyStrategyWithdrawMinimizeTrading;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;
  let baseTokenWbnbLpV2AsBob: BaseV1Pair;

  let lpAsAlice: BaseV1Pair;
  let lpAsBob: BaseV1Pair;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerAsAlice: BaseV1Router01;
  let routerAsBob: BaseV1Router01;

  let stratAsAlice: SolidlyStrategyWithdrawMinimizeTrading;
  let stratAsBob: SolidlyStrategyWithdrawMinimizeTrading;

  let mockWorkerAsBob: MockWaultSwapWorker;
  let mockV2EvilWorkerAsBob: MockWaultSwapWorker;
  let mockBaseTokenWbnbV2WorkerAsBob: MockWaultSwapWorker;

  let wbnbAsAlice: WrappedFtm;
  let wbnbAsBob: WrappedFtm;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();

    // Setup WaultSwap
    const BaseV1Factory = (await ethers.getContractFactory("BaseV1Factory", deployer)) as BaseV1Factory__factory;
    factory = await BaseV1Factory.deploy();
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory("WrappedFtm", deployer)) as WrappedFtm__factory;
    wbnb = await WBNB.deploy();

    const BaseV1Router01 = (await ethers.getContractFactory("BaseV1Router01", deployer)) as BaseV1Router01__factory;
    router = await BaseV1Router01.deploy(factory.address, wbnb.address);
    await router.deployed();

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

    await factory.createPair(baseToken.address, farmingToken.address, false);
    await factory.createPair(baseToken.address, wbnb.address, false);

    lp = BaseV1Pair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address, false), deployer);
    baseTokenWbnbLp = BaseV1Pair__factory.connect(
      await factory.getPair(wbnb.address, baseToken.address, false),
      deployer
    );

    /// Setup MockWaultSwapWorker
    const MockWaultSwapWorker = (await ethers.getContractFactory(
      "MockWaultSwapWorker",
      deployer
    )) as MockWaultSwapWorker__factory;
    mockWorker = (await MockWaultSwapWorker.deploy(
      lp.address,
      baseToken.address,
      farmingToken.address
    )) as MockWaultSwapWorker;
    await mockWorker.deployed();
    mockEvilWorker = (await MockWaultSwapWorker.deploy(
      lp.address,
      baseToken.address,
      farmingToken.address
    )) as MockWaultSwapWorker;
    await mockEvilWorker.deployed();
    mockBaseTokenWbnbV2Worker = (await MockWaultSwapWorker.deploy(
      baseTokenWbnbLp.address,
      baseToken.address,
      wbnb.address
    )) as MockWaultSwapWorker;
    await mockBaseTokenWbnbV2Worker.deployed();

    /// Setup WNativeRelayer
    const WNativeRelayer = (await ethers.getContractFactory("WNativeRelayer", deployer)) as WNativeRelayer__factory;
    const wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
    await wNativeRelayer.deployed();

    const SolidlyStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "SolidlyStrategyWithdrawMinimizeTrading",
      deployer
    )) as SolidlyStrategyWithdrawMinimizeTrading__factory;
    strat = (await upgrades.deployProxy(SolidlyStrategyWithdrawMinimizeTrading, [
      router.address,
      wNativeRelayer.address,
    ])) as SolidlyStrategyWithdrawMinimizeTrading;
    await strat.deployed();
    await strat.setWorkersOk([mockWorker.address, mockBaseTokenWbnbV2Worker.address], true);
    await wNativeRelayer.setCallerOk([strat.address], true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);
    baseTokenWbnbLpV2AsBob = BaseV1Pair__factory.connect(baseTokenWbnbLp.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerAsAlice = BaseV1Router01__factory.connect(router.address, alice);
    routerAsBob = BaseV1Router01__factory.connect(router.address, bob);

    lpAsAlice = BaseV1Pair__factory.connect(lp.address, alice);
    lpAsBob = BaseV1Pair__factory.connect(lp.address, bob);

    stratAsAlice = SolidlyStrategyWithdrawMinimizeTrading__factory.connect(strat.address, alice);
    stratAsBob = SolidlyStrategyWithdrawMinimizeTrading__factory.connect(strat.address, bob);

    mockWorkerAsBob = MockWaultSwapWorker__factory.connect(mockWorker.address, bob);
    mockV2EvilWorkerAsBob = MockWaultSwapWorker__factory.connect(mockEvilWorker.address, bob);
    mockBaseTokenWbnbV2WorkerAsBob = MockWaultSwapWorker__factory.connect(mockBaseTokenWbnbV2Worker.address, bob);

    wbnbAsAlice = WrappedFtm__factory.connect(wbnb.address, alice);
    wbnbAsBob = WrappedFtm__factory.connect(wbnb.address, bob);

    await network.provider.send("hardhat_setNextBlockBaseFeePerGas", ["0x0"]);
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
      await expect(stratAsBob.setWorkersOk([mockV2EvilWorkerAsBob.address], true)).to.reverted;
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
      await baseTokenAsBob.transfer(mockV2EvilWorkerAsBob.address, ethers.utils.parseEther("0.05"));
      await expect(
        mockV2EvilWorkerAsBob.work(
          0,
          await bob.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.5")])]
          )
        )
      ).to.be.revertedWith("bad worker");
    });
  });

  context("when revoking whitelist workers", async () => {
    it("should revert as bad worker", async () => {
      await strat.setWorkersOk([mockWorker.address], false);
      await expect(
        mockWorkerAsBob.work(
          0,
          await bob.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
          )
        )
      ).to.be.revertedWith("bad worker");
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
        false,
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
        false,
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
        mockWorkerAsBob.work(
          0,
          await bob.getAddress(),
          ethers.utils.parseEther("1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("2")])]
          )
        )
      ).to.be.revertedWith("insufficient farming tokens received");
    });

    it("should convert all LP tokens back to BaseToken and FTOKEN, while debt == received BaseToken", async () => {
      const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFTOKENBefore = await farmingToken.balanceOf(await bob.getAddress());

      // Bob uses minimize trading strategy to turn LPs back to BaseToken and FTOKEN
      await mockWorkerAsBob.work(
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
      await mockWorkerAsBob.work(
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
      await mockWorkerAsBob.work(
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
      TestHelpers.assertAlmostEqual(
        bobBtokenAfter.sub(bobBtokenBefore).toString(),
        ethers.utils.parseEther("1.2").toString()
      );
      TestHelpers.assertAlmostEqual(
        bobFtokenAfter.sub(bobFtokenBefore).toString(),
        ethers.utils.parseEther("0.074997499749974997").toString()
      ); // 0.1 - 0.025 = 0.075 farming token
    });

    it("should revert when debt > received BaseToken, farming token is not enough to cover the debt", async () => {
      await expect(
        mockWorkerAsBob.work(
          0,
          await bob.getAddress(),
          ethers.utils.parseEther("3"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.001")])]
          )
        )
      ).to.be.revertedWith(
        "panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)"
      );
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
        false,
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
        false,
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
      await baseTokenWbnbLpV2AsBob.transfer(
        mockBaseTokenWbnbV2Worker.address,
        ethers.utils.parseEther("0.316227766016837933")
      );
    });

    it("should revert, Bob uses withdraw minimize trading strategy to turn LPs back to farming with an unreasonable expectation", async () => {
      // Bob uses withdraw minimize trading strategy to turn LPs back to farming with an unreasonable expectation
      await expect(
        mockBaseTokenWbnbV2WorkerAsBob.work(
          0,
          await bob.getAddress(),
          ethers.utils.parseEther("1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("2")])]
          )
        )
      ).to.be.revertedWith("insufficient farming tokens received");
    });

    it("should convert all LP tokens back to BaseToken and BNB, while debt == received BaseToken", async () => {
      const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbBefore = await ethers.provider.getBalance(await bob.getAddress());

      // Bob uses minimize trading strategy to turn LPs back to BaseToken and BNB
      // set gasPrice = 0 in order to assert native balance movement easier
      await mockBaseTokenWbnbV2WorkerAsBob.work(
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
      await mockBaseTokenWbnbV2WorkerAsBob.work(
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
      await mockBaseTokenWbnbV2WorkerAsBob.work(
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
      TestHelpers.assertAlmostEqual(
        bobBtokenAfter.sub(bobBtokenBefore).toString(),
        ethers.utils.parseEther("1.2").toString()
      );
      TestHelpers.assertAlmostEqual(
        bobBnbAfter.sub(bobBnbBefore).toString(),
        ethers.utils.parseEther("0.074997499749974997").toString()
      ); // 0.1 - 0.025 = 0.075 farming token
    });

    it("should revert when debt > received BaseToken, BNB is not enough to cover the debt", async () => {
      await expect(
        mockBaseTokenWbnbV2WorkerAsBob.work(
          0,
          await bob.getAddress(),
          ethers.utils.parseEther("3"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.001")])]
          ),
          { gasPrice: 0 }
        )
      ).to.be.revertedWith(
        "panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)"
      );
    });
  });
});
