import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet } from "ethers";
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
  PancakeRouterV2__factory,
  PancakeRouterV2,
  PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading,
  PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading__factory,
  WETH,
  WETH__factory,
  WNativeRelayer__factory,
} from "../../../../../typechain";
import { MockPancakeswapV2Worker__factory } from "../../../../../typechain/factories/MockPancakeswapV2Worker__factory";
import { MockPancakeswapV2Worker } from "../../../../../typechain/MockPancakeswapV2Worker";
import { assertAlmostEqual } from "../../../../helpers/assert";
import * as TestHelpers from "../../../../helpers/assert";

chai.use(solidity);
const { expect } = chai;

describe("PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading", () => {
  const FOREVER = "2000000000";

  /// Pancakeswap-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouterV2;
  let lpV2: PancakePair;
  let baseTokenWbnbLpV2: PancakePair;

  /// MockPancakeswapV2Worker-related instance(s)
  let mockPancakeswapV2Worker: MockPancakeswapV2Worker;
  let mockPancakeswapV2EvilWorker: MockPancakeswapV2Worker;
  let mockPancakeswapBaseTokenWbnbV2Worker: MockPancakeswapV2Worker;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let strat: PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;
  let baseTokenWbnbLpV2AsBob: PancakePair;

  let lpAsAlice: PancakePair;
  let lpAsBob: PancakePair;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerV2AsAlice: PancakeRouterV2;
  let routerV2AsBob: PancakeRouterV2;

  let stratAsAlice: PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading;
  let stratAsBob: PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading;

  let mockPancakeswapV2WorkerAsBob: MockPancakeswapV2Worker;
  let mockPancakeswapV2EvilWorkerAsBob: MockPancakeswapV2Worker;
  let mockPancakeswapBaseTokenWbnbV2WorkerAsBob: MockPancakeswapV2Worker;

  let wbnbAsAlice: WETH;
  let wbnbAsBob: WETH;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();

    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
    factoryV2 = await PancakeFactory.deploy(await deployer.getAddress());
    await factoryV2.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();

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

    lpV2 = PancakePair__factory.connect(await factoryV2.getPair(farmingToken.address, baseToken.address), deployer);
    baseTokenWbnbLpV2 = PancakePair__factory.connect(
      await factoryV2.getPair(wbnb.address, baseToken.address),
      deployer
    );

    /// Setup MockPancakeswapV2Worker
    const MockPancakeswapV2Worker = (await ethers.getContractFactory(
      "MockPancakeswapV2Worker",
      deployer
    )) as MockPancakeswapV2Worker__factory;
    mockPancakeswapV2Worker = (await MockPancakeswapV2Worker.deploy(
      lpV2.address,
      baseToken.address,
      farmingToken.address
    )) as MockPancakeswapV2Worker;
    await mockPancakeswapV2Worker.deployed();
    mockPancakeswapV2EvilWorker = (await MockPancakeswapV2Worker.deploy(
      lpV2.address,
      baseToken.address,
      farmingToken.address
    )) as MockPancakeswapV2Worker;
    await mockPancakeswapV2EvilWorker.deployed();
    mockPancakeswapBaseTokenWbnbV2Worker = (await MockPancakeswapV2Worker.deploy(
      baseTokenWbnbLpV2.address,
      baseToken.address,
      wbnb.address
    )) as MockPancakeswapV2Worker;
    await mockPancakeswapBaseTokenWbnbV2Worker.deployed();

    /// Setup WNativeRelayer
    const WNativeRelayer = (await ethers.getContractFactory("WNativeRelayer", deployer)) as WNativeRelayer__factory;
    const wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
    await wNativeRelayer.deployed();

    const PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading",
      deployer
    )) as PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading__factory;
    strat = (await upgrades.deployProxy(PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading, [
      routerV2.address,
      wbnb.address,
      wNativeRelayer.address,
    ])) as PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading;
    await strat.deployed();
    await strat.setWorkersOk([mockPancakeswapV2Worker.address, mockPancakeswapBaseTokenWbnbV2Worker.address], true);
    await wNativeRelayer.setCallerOk([strat.address], true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);
    baseTokenWbnbLpV2AsBob = PancakePair__factory.connect(baseTokenWbnbLpV2.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerV2AsAlice = PancakeRouterV2__factory.connect(routerV2.address, alice);
    routerV2AsBob = PancakeRouterV2__factory.connect(routerV2.address, bob);

    lpAsAlice = PancakePair__factory.connect(lpV2.address, alice);
    lpAsBob = PancakePair__factory.connect(lpV2.address, bob);

    stratAsAlice = PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading__factory.connect(strat.address, alice);
    stratAsBob = PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading__factory.connect(strat.address, bob);

    mockPancakeswapV2WorkerAsBob = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker.address, bob);
    mockPancakeswapV2EvilWorkerAsBob = MockPancakeswapV2Worker__factory.connect(
      mockPancakeswapV2EvilWorker.address,
      bob
    );
    mockPancakeswapBaseTokenWbnbV2WorkerAsBob = MockPancakeswapV2Worker__factory.connect(
      mockPancakeswapBaseTokenWbnbV2Worker.address,
      bob
    );

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
      await expect(stratAsBob.setWorkersOk([mockPancakeswapV2EvilWorkerAsBob.address], true)).to.reverted;
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
      await baseTokenAsBob.transfer(mockPancakeswapV2EvilWorkerAsBob.address, ethers.utils.parseEther("0.05"));
      await expect(
        mockPancakeswapV2EvilWorkerAsBob.work(
          0,
          await bob.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.5")])]
          )
        )
      ).to.be.revertedWith(
        "PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker"
      );
    });
  });

  context("when revoking whitelist workers", async () => {
    it("should revert as bad worker", async () => {
      await strat.setWorkersOk([mockPancakeswapV2Worker.address], false);
      await expect(
        mockPancakeswapV2WorkerAsBob.work(
          0,
          await bob.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
          )
        )
      ).to.be.revertedWith(
        "PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker"
      );
    });
  });

  context("It should convert LP tokens and farming token", () => {
    beforeEach(async () => {
      // Alice adds 0.1 FTOKEN + 1 BaseToken
      await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("1"));
      await farmingTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("0.1"));
      await routerV2AsAlice.addLiquidity(
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
      await routerV2AsBob.addLiquidity(
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
      expect(await lpV2.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0.316227766016837933"));

      await lpAsBob.transfer(strat.address, ethers.utils.parseEther("0.316227766016837933"));
    });

    it("should revert, Bob uses withdraw minimize trading strategy to turn LPs back to farming with an unreasonable expectation", async () => {
      // Bob uses withdraw minimize trading strategy to turn LPs back to farming with an unreasonable expectation
      await expect(
        mockPancakeswapV2WorkerAsBob.work(
          0,
          await bob.getAddress(),
          ethers.utils.parseEther("1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("2")])]
          )
        )
      ).to.be.revertedWith(
        "PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading::execute:: insufficient farming tokens received"
      );
    });

    it("should convert all LP tokens back to BaseToken and FTOKEN, while debt == received BaseToken", async () => {
      const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFTOKENBefore = await farmingToken.balanceOf(await bob.getAddress());

      // Bob uses minimize trading strategy to turn LPs back to BaseToken and FTOKEN
      await mockPancakeswapV2WorkerAsBob.work(
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
      expect(await lpV2.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await lpV2.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
      expect(bobBaseTokenAfter.sub(bobBaseTokenBefore)).to.be.eq(ethers.utils.parseEther("1"));
      expect(bobFTOKENAfter.sub(bobFTOKENBefore)).to.be.eq(ethers.utils.parseEther("0.1"));
    });

    it("should convert all LP tokens back to BaseToken and FTOKEN when debt < received BaseToken", async () => {
      const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFtokenBefore = await farmingToken.balanceOf(await bob.getAddress());

      // Bob uses liquidate strategy to turn LPs back to BTOKEN and farming token
      await mockPancakeswapV2WorkerAsBob.work(
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
      expect(await lpV2.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await lpV2.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
      expect(bobBtokenAfter.sub(bobBtokenBefore)).to.be.eq(ethers.utils.parseEther("1"));
      expect(bobFtokenAfter.sub(bobFtokenBefore)).to.be.eq(ethers.utils.parseEther("0.1"));
    });

    it("should convert all LP tokens back to BaseToken and farming token (debt > received BaseToken, farming token is enough to cover debt)", async () => {
      const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFtokenBefore = await farmingToken.balanceOf(await bob.getAddress());

      // Bob uses withdraw minimize trading strategy to turn LPs back to BaseToken and farming token
      await mockPancakeswapV2WorkerAsBob.work(
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
      expect(await lpV2.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await lpV2.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
      expect(bobBtokenAfter.sub(bobBtokenBefore)).to.be.eq(ethers.utils.parseEther("1.2"));
      expect(bobFtokenAfter.sub(bobFtokenBefore)).to.be.eq(ethers.utils.parseEther("0.074937343358395989")); // 0.1 - 0.025 = 0.075 farming token
    });

    it("should revert when debt > received BaseToken, farming token is not enough to cover the debt", async () => {
      await expect(
        mockPancakeswapV2WorkerAsBob.work(
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
      await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("1"));
      await wbnbAsAlice.approve(routerV2.address, ethers.utils.parseEther("0.1"));
      await routerV2AsAlice.addLiquidity(
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
      await routerV2AsBob.addLiquidity(
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
      expect(await baseTokenWbnbLpV2.balanceOf(await bob.getAddress())).to.be.eq(
        ethers.utils.parseEther("0.316227766016837933")
      );
      await baseTokenWbnbLpV2AsBob.transfer(
        mockPancakeswapBaseTokenWbnbV2Worker.address,
        ethers.utils.parseEther("0.316227766016837933")
      );
    });

    it("should revert, Bob uses withdraw minimize trading strategy to turn LPs back to farming with an unreasonable expectation", async () => {
      // Bob uses withdraw minimize trading strategy to turn LPs back to farming with an unreasonable expectation
      await expect(
        mockPancakeswapBaseTokenWbnbV2WorkerAsBob.work(
          0,
          await bob.getAddress(),
          ethers.utils.parseEther("1"),
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("2")])]
          )
        )
      ).to.be.revertedWith(
        "PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading::execute:: insufficient farming tokens received"
      );
    });

    it("should convert all LP tokens back to BaseToken and BNB, while debt == received BaseToken", async () => {
      const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbBefore = await ethers.provider.getBalance(await bob.getAddress());

      // Bob uses minimize trading strategy to turn LPs back to BaseToken and BNB
      // set gasPrice = 0 in order to assert native balance movement easier
      await mockPancakeswapBaseTokenWbnbV2WorkerAsBob.work(
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
      expect(await baseTokenWbnbLpV2.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await baseTokenWbnbLpV2.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
      expect(bobBaseTokenAfter.sub(bobBaseTokenBefore)).to.be.eq(ethers.utils.parseEther("1"));
      expect(bobBnbAfter.sub(bobBnbBefore)).to.be.eq(ethers.utils.parseEther("0.1"));
    });

    it("should convert all LP tokens back to BaseToken and FTOKEN when debt < received BaseToken", async () => {
      const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbBefore = await ethers.provider.getBalance(await bob.getAddress());

      // Bob uses liquidate strategy to turn LPs back to ETH and farming token
      // set gasPrice = 0 in order to assert native balance movement easier
      await mockPancakeswapBaseTokenWbnbV2WorkerAsBob.work(
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
      expect(await lpV2.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await lpV2.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
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
      await mockPancakeswapBaseTokenWbnbV2WorkerAsBob.work(
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
      expect(await lpV2.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await lpV2.balanceOf(await bob.getAddress())).to.be.eq(ethers.utils.parseEther("0"));
      expect(bobBtokenAfter.sub(bobBtokenBefore)).to.be.eq(ethers.utils.parseEther("1.2"));
      expect(bobBnbAfter.sub(bobBnbBefore)).to.be.eq(ethers.utils.parseEther("0.074937343358395989"));
    });

    it("should revert when debt > received BaseToken, BNB is not enough to cover the debt", async () => {
      await expect(
        mockPancakeswapBaseTokenWbnbV2WorkerAsBob.work(
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
});
