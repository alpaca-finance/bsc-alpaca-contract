import { ethers, network, upgrades, waffle } from "hardhat";
import { Signer } from "ethers";
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
  MdexRouter,
  MdexRouter__factory,
  MdexRestrictedStrategyAddBaseTokenOnly,
  MdexRestrictedStrategyAddBaseTokenOnly__factory,
  WETH,
  WETH__factory,
  MockMdexWorker,
  MockMdexWorker__factory,
  MdxToken,
  MdxToken__factory,
  SwapMining,
  SwapMining__factory,
  Oracle,
  Oracle__factory,
} from "../../../../../typechain";

import { assertAlmostEqual } from "../../../../helpers/assert";
import { formatEther } from "ethers/lib/utils";
import * as TimeHelpers from "../../../../helpers/time";

chai.use(solidity);
const { expect } = chai;

describe("MdexRestrictedStrategyAddBaseTokenOnly", () => {
  const FOREVER = "2000000000";
  const mdxPerBlock = "51600000000000000000";

  /// Mdex-related instance(s)
  let factory: MdexFactory;
  let router: MdexRouter;
  let lp: MdexPair;
  let oracle: Oracle;
  let swapMining: SwapMining;

  /// MockMdexWorker-related instance(s)
  let mockMdexWorker: MockMdexWorker;
  let mockMdexEvilWorker: MockMdexWorker;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;
  let mdxToken: MdxToken;

  /// Strategy instance(s)
  let strat: MdexRestrictedStrategyAddBaseTokenOnly;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let farmingTokenAsAlice: MockERC20;

  let routerAsAlice: MdexRouter;

  let stratAsBob: MdexRestrictedStrategyAddBaseTokenOnly;

  let mockMdexWorkerAsBob: MockMdexWorker;
  let mockMdexEvilWorkerAsBob: MockMdexWorker;

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();

    // Setup Mdex
    const MdexFactory = (await ethers.getContractFactory("MdexFactory", deployer)) as MdexFactory__factory;
    factory = await MdexFactory.deploy(await deployer.getAddress());
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();
    await wbnb.deployed();

    const MdxToken = (await ethers.getContractFactory("MdxToken", deployer)) as MdxToken__factory;
    mdxToken = await MdxToken.deploy();
    await mdxToken.deployed();
    await mdxToken.addMinter(await deployer.getAddress());
    await mdxToken.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));

    const MdexRouter = (await ethers.getContractFactory("MdexRouter", deployer)) as MdexRouter__factory;
    router = await MdexRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

    const Oracle = (await ethers.getContractFactory("Oracle", deployer)) as Oracle__factory;
    oracle = await Oracle.deploy(factory.address);
    await oracle.deployed();

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

    lp = MdexPair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);
    await factory.addPair(lp.address);

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

    const MdexRestrictedStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "MdexRestrictedStrategyAddBaseTokenOnly",
      deployer
    )) as MdexRestrictedStrategyAddBaseTokenOnly__factory;
    strat = (await upgrades.deployProxy(MdexRestrictedStrategyAddBaseTokenOnly, [
      router.address,
      mdxToken.address,
    ])) as MdexRestrictedStrategyAddBaseTokenOnly;
    await strat.deployed();
    await strat.setWorkersOk([mockMdexWorker.address], true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);

    routerAsAlice = MdexRouter__factory.connect(router.address, alice);

    stratAsBob = MdexRestrictedStrategyAddBaseTokenOnly__factory.connect(strat.address, bob);

    mockMdexWorkerAsBob = MockMdexWorker__factory.connect(mockMdexWorker.address, bob);
    mockMdexEvilWorkerAsBob = MockMdexWorker__factory.connect(mockMdexEvilWorker.address, bob);

    // Adding liquidity to the pool
    // Alice adds 0.1 FTOKEN + 1 BTOKEN
    await farmingTokenAsAlice.approve(router.address, ethers.utils.parseEther("0.1"));
    await baseTokenAsAlice.approve(router.address, ethers.utils.parseEther("1"));

    // // Add liquidity to the BTOKEN-FTOKEN pool on Mdex
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
    // refer to MdexFactory line: 842
    // totalSupply =  sqrt(amount0 * amount1) - 0.000000000000001000
    // totalSupply =  sqrt(1 * 0.1) - 0.000000000000001000 = 0.316227766016836933
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
        stratAsBob.execute(await bob.getAddress(), "0", ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"]))
      ).to.be.reverted;
    });
  });

  context("When contract get LP < minLP", async () => {
    it("should revert", async () => {
      // Bob uses AddBaseTokenOnly strategy yet again, but now with an unreasonable min LP request
      await baseTokenAsBob.transfer(mockMdexWorker.address, ethers.utils.parseEther("0.1"));
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
      ).to.be.revertedWith("MdexRestrictedStrategyAddBaseTokenOnly::execute:: insufficient LP tokens received");
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
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.utils.parseEther("0.05")])]
          )
        )
      ).to.be.revertedWith("MdexRestrictedStrategyAddBaseTokenOnly::onlyWhitelistedWorkers:: bad worker");
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
      ).to.be.revertedWith("MdexRestrictedStrategyAddBaseTokenOnly::onlyWhitelistedWorkers:: bad worker");
    });
  });

  it("should convert all BTOKEN to LP tokens at best rate (trading fee 25)", async () => {
    await factory.setPairFees(lp.address, 25);
    // Bob transfer 0.1 BTOKEN to StrategyAddBaseTokenOnly first
    await baseTokenAsBob.transfer(mockMdexWorker.address, ethers.utils.parseEther("0.1"));
    // Bob uses AddBaseTokenOnly strategy to add 0.1 BTOKEN
    await mockMdexWorkerAsBob.work(
      0,
      await bob.getAddress(),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
      )
    );

    // // actualLpAmount = 0.015415396042372718
    expect(await lp.balanceOf(mockMdexWorker.address)).to.be.eq(ethers.utils.parseEther("0.015415396042372718"));
    expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.BigNumber.from("0"));

    // // Bob uses AddBaseTokenOnly strategy to add another 0.1 BTOKEN
    await baseTokenAsBob.transfer(mockMdexWorker.address, ethers.utils.parseEther("0.1"));
    await mockMdexWorkerAsBob.work(
      0,
      await bob.getAddress(),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
      )
    );

    expect(await lp.balanceOf(mockMdexWorker.address)).to.be.eq(ethers.utils.parseEther("0.030143763464109982"));
    expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
  });
  it("should convert all BTOKEN to LP tokens at best rate (trading fee 20)", async () => {
    await factory.setPairFees(lp.address, 20);
    // Bob transfer 0.1 BTOKEN to StrategyAddBaseTokenOnly first
    await baseTokenAsBob.transfer(mockMdexWorker.address, ethers.utils.parseEther("0.1"));
    // Bob uses AddBaseTokenOnly strategy to add 0.1 BTOKEN
    await mockMdexWorkerAsBob.work(
      0,
      await bob.getAddress(),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
      )
    );

    // Adding 0.1 BTOKEN
    // amountIn of BTOKEN that will be swapped
    // amountIn = [ sqrt(reserveIn * (amountBTOKEN * 3992000 + (reserveIn * 3992004))) - (reserveIn * 1998) ] / 1996
    // amountIn = [ sqrt(1 * ((0.1 * 3992000) + (1 * 3992004))) - (1 * 1998) ] / 1996
    // amountIn = 0.048857707015160316... BTOKEN
    // amountOut = (amountIn * fee * reserveOut) / ((reserveIn * feeDenom) + (amountIn * fee))
    // amountOut = (0.048857707015160316 * 998 * 0.1) / ((1 * 1000) + (0.048857707015160316 * 998 ))
    // amountOut = 0.004649299362258152... FTOKEN

    // after swap
    // reserveIn = 1 + 0.048857707015160316 = 1.048857707015160316 BTOKEN
    // reserveOut = 0.1 - 0.004649299362258152 = 0.095350700637741848 FTOKEN
    // totalSupply = 0.316227766016836933 (from first adding liquidity in the setup)

    // so adding both BTOKEN and FTOKEN as liquidity will result in an amount of lp
    // amountBTOKEN = 0.1 - 0.048857707015160316 = 0.051142292984839684
    // amountFTOKEN = 0.004649299362258152
    // refer to MdexFactory line: 846
    // lpAmount = min of [ totalSupply * (amountF / reserveF) or totalSupply * (amountB / reserveB) ]
    // lpAmount = 0.316227766016837933 * (0.004649299362258152 / 0.095350700637741848) ~= 0.015419263215025115...
    // lpAmount = 0.316227766016837933 * (0.051142292984839684 / 1.048857707015160316) ~= 0.015419263215025119...

    // actualLpAmount = 0.015419263215025115
    expect(await lp.balanceOf(mockMdexWorker.address)).to.be.eq(ethers.utils.parseEther("0.015419263215025115"));
    expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    // there is a very small remaining amount of base token left
    expect(await baseToken.balanceOf(strat.address)).to.be.lte(ethers.BigNumber.from("13"));

    // Bob uses AddBaseTokenOnly strategy to add another 0.1 BTOKEN
    await baseTokenAsBob.transfer(mockMdexWorker.address, ethers.utils.parseEther("0.1"));
    await mockMdexWorkerAsBob.work(
      0,
      await bob.getAddress(),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
      )
    );

    expect(await lp.balanceOf(mockMdexWorker.address)).to.be.eq(ethers.utils.parseEther("0.030151497260262730"));
    expect(await lp.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await farmingToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
    expect(await baseToken.balanceOf(strat.address)).to.be.eq(ethers.utils.parseEther("0"));
  });

  describe("#withdrawTradingRewards", async () => {
    context("When the withdrawTradingRewards caller is not an owner", async () => {
      it("should be reverted", async () => {
        await expect(stratAsBob.withdrawTradingRewards(await bob.getAddress())).to.reverted;
      });
    });

    context("When withdrawTradingRewards caller is the owner", async () => {
      it("should be able to withdraw trading rewards", async () => {
        // set lp pair fee
        await factory.setPairFees(lp.address, 25);
        // Bob transfer 0.1 BTOKEN to StrategyAddBaseTokenOnly first
        await baseTokenAsBob.transfer(mockMdexWorker.address, ethers.utils.parseEther("0.1"));
        // Bob uses AddBaseTokenOnly strategy to add 0.1 BTOKEN
        await mockMdexWorkerAsBob.work(
          0,
          await bob.getAddress(),
          "0",
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [strat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"])]
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
