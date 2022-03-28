import { ethers, network, upgrades, waffle } from "hardhat";
import { Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  WETH,
  WETH__factory,
  MockVaultForRestrictedAddTwosideOptimalStrat,
  MockVaultForRestrictedAddTwosideOptimalStrat__factory,
  MdexFactory__factory,
  MdexFactory,
  MdexRouter,
  MdexRouter__factory,
  MdexPair__factory,
  MdexPair,
  MdexRestrictedStrategyAddTwoSidesOptimal__factory,
  MdexRestrictedStrategyAddTwoSidesOptimal,
  MockMdexWorker__factory,
  MockMdexWorker,
  SwapMining,
  SwapMining__factory,
  Oracle,
  Oracle__factory,
} from "../../../../../typechain";
import * as Assert from "../../../../helpers/assert";
import { MdxToken } from "../../../../../typechain/MdxToken";
import { formatEther } from "ethers/lib/utils";
import { MdxToken__factory } from "../../../../../typechain/factories/MdxToken__factory";
import * as TimeHelpers from "../../../../helpers/time";

chai.use(solidity);
const { expect } = chai;

describe("MdexRestrictedStrategyAddTwoSideOptimal", () => {
  const FOREVER = "2000000000";
  const MAX_ROUNDING_ERROR = Number("15");
  const mdxPerBlock = "51600000000000000000";

  /// Mdex-related instance(s)
  let factory: MdexFactory;
  let router: MdexRouter;
  let swapMining: SwapMining;
  let oracle: Oracle;

  /// Token-related instance(s)
  let mdxToken: MdxToken;
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;
  let mockedVault: MockVaultForRestrictedAddTwosideOptimalStrat;

  // Mdex
  let mockMdexWorkerAsBob: MockMdexWorker;
  let mockMdexWorkerAsAlice: MockMdexWorker;
  let mockMdexEvilWorkerAsBob: MockMdexWorker;
  let mockMdexWorker: MockMdexWorker;
  let mockMdexEvilWorker: MockMdexWorker;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  let addRestrictedStrat: MdexRestrictedStrategyAddTwoSidesOptimal;
  let addRestrictedStratAsDeployer: MdexRestrictedStrategyAddTwoSidesOptimal;

  // Contract Signer
  let addRestrictedStratAsBob: MdexRestrictedStrategyAddTwoSidesOptimal;
  let baseTokenAsBob: MockERC20;

  let farmingTokenAsAlice: MockERC20;

  let lp: MdexPair;

  const setupFullFlowTest = async () => {
    /// Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    baseToken = (await upgrades.deployProxy(MockERC20, ["BTOKEN", "BTOKEN", 18])) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
    farmingToken = (await upgrades.deployProxy(MockERC20, ["FTOKEN", "FTOKEN", 18])) as MockERC20;
    await farmingToken.deployed();
    await farmingToken.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));
    await farmingToken.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
    await farmingToken.mint(await bob.getAddress(), ethers.utils.parseEther("100"));

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();
    await wbnb.deployed();

    const MdxToken = (await ethers.getContractFactory("MdxToken", deployer)) as MdxToken__factory;
    mdxToken = await MdxToken.deploy();
    await mdxToken.deployed();
    await mdxToken.addMinter(await deployer.getAddress());
    await mdxToken.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));

    // Setup Mdex
    const MdexFactory = (await ethers.getContractFactory("MdexFactory", deployer)) as MdexFactory__factory;
    factory = await MdexFactory.deploy(await deployer.getAddress());
    await factory.deployed();

    const MdexRouter = (await ethers.getContractFactory("MdexRouter", deployer)) as MdexRouter__factory;
    router = await MdexRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

    const Oracle = (await ethers.getContractFactory("Oracle", deployer)) as Oracle__factory;
    oracle = await Oracle.deploy(factory.address);
    await oracle.deployed();

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

    /// Setup BTOKEN-FTOKEN pair on Mdex
    await factory.createPair(farmingToken.address, baseToken.address);
    lp = MdexPair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);
    await lp.deployed();
    await factory.addPair(lp.address);
    await mdxToken.addMinter(swapMining.address);
    await swapMining.addPair(100, lp.address, false);
    await swapMining.addWhitelist(baseToken.address);
    await swapMining.addWhitelist(farmingToken.address);

    // Deployer adds 0.1 FTOKEN + 1 BTOKEN
    await baseToken.approve(router.address, ethers.utils.parseEther("1"));
    await farmingToken.approve(router.address, ethers.utils.parseEther("0.1"));
    await router.addLiquidity(
      baseToken.address,
      farmingToken.address,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("0.1"),
      "0",
      "0",
      await deployer.getAddress(),
      FOREVER
    );

    // Deployer adds 1 BTOKEN + 1 NATIVE
    await baseToken.approve(router.address, ethers.utils.parseEther("1"));
    await router.addLiquidityETH(
      baseToken.address,
      ethers.utils.parseEther("1"),
      "0",
      "0",
      await deployer.getAddress(),
      FOREVER,
      { value: ethers.utils.parseEther("1") }
    );
  };

  const setupRestrictedTest = async () => {
    const MockVaultForRestrictedAddTwosideOptimalStrat = (await ethers.getContractFactory(
      "MockVaultForRestrictedAddTwosideOptimalStrat",
      deployer
    )) as MockVaultForRestrictedAddTwosideOptimalStrat__factory;
    mockedVault = (await upgrades.deployProxy(
      MockVaultForRestrictedAddTwosideOptimalStrat
    )) as MockVaultForRestrictedAddTwosideOptimalStrat;
    await mockedVault.deployed();

    const MdexRestrictedStrategyAddTwoSidesOptimal = (await ethers.getContractFactory(
      "MdexRestrictedStrategyAddTwoSidesOptimal",
      deployer
    )) as MdexRestrictedStrategyAddTwoSidesOptimal__factory;
    addRestrictedStrat = (await upgrades.deployProxy(MdexRestrictedStrategyAddTwoSidesOptimal, [
      router.address,
      mockedVault.address,
      mdxToken.address,
    ])) as MdexRestrictedStrategyAddTwoSidesOptimal;
    await addRestrictedStrat.deployed();

    // / Setup MockMdexWorker
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
  };

  const setupContractSigner = async () => {
    // Contract signer
    addRestrictedStratAsBob = MdexRestrictedStrategyAddTwoSidesOptimal__factory.connect(
      addRestrictedStrat.address,
      bob
    );
    addRestrictedStratAsDeployer = MdexRestrictedStrategyAddTwoSidesOptimal__factory.connect(
      addRestrictedStrat.address,
      deployer
    );

    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);

    mockMdexWorkerAsBob = MockMdexWorker__factory.connect(mockMdexWorker.address, bob);
    mockMdexWorkerAsAlice = MockMdexWorker__factory.connect(mockMdexWorker.address, alice);
    mockMdexEvilWorkerAsBob = MockMdexWorker__factory.connect(mockMdexEvilWorker.address, bob);
  };

  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();
    await setupFullFlowTest();
    await setupRestrictedTest();
    await setupContractSigner();
    await addRestrictedStratAsDeployer.setWorkersOk([mockMdexWorker.address], true);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  describe("full flow test", async () => {
    context("when strategy execution is not in the scope", async () => {
      it("should revert", async () => {
        await expect(
          addRestrictedStratAsBob.execute(
            await bob.getAddress(),
            "0",
            ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], ["0", "0"])
          )
        ).to.be.reverted;
      });
    });

    context("when bad calldata", async () => {
      it("should revert", async () => {
        await mockedVault.setMockOwner(await alice.getAddress());
        await baseToken.mint(mockMdexWorker.address, ethers.utils.parseEther("1"));
        await expect(
          mockMdexWorkerAsAlice.work(
            0,
            await alice.getAddress(),
            ethers.utils.parseEther("1"),
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [addRestrictedStrat.address, ethers.utils.defaultAbiCoder.encode(["address"], [await bob.getAddress()])]
            )
          )
        ).to.reverted;
      });
    });

    it("should convert all BTOKEN to LP tokens at best rate", async () => {
      // set lp pair fee
      await factory.setPairFees(lp.address, 25);
      // Now Alice leverage 2x on her 1 BTOKEN.
      // So totally Alice will take 1 BTOKEN from the pool and 1 BTOKEN from her pocket to
      // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
      await mockedVault.setMockOwner(await alice.getAddress());
      await baseToken.mint(mockMdexWorker.address, ethers.utils.parseEther("2"));
      await mockMdexWorkerAsAlice.work(
        0,
        await alice.getAddress(),
        ethers.utils.parseEther("0"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [
            addRestrictedStrat.address,
            ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], ["0", ethers.utils.parseEther("0.01")]),
          ]
        )
      );

      // the calculation is ratio between balance and reserve * total supply
      // let total supply = sqrt(1 * 0.1) = 0.31622776601683794
      // current reserve after swap is 1732967258967755614
      // ths lp will be (1267032741032244386 (optimal swap amount) / 1732967258967755614 (reserve)) *  0.31622776601683794
      // lp will be 0.23120513736969137
      const stratLPBalance = await lp.balanceOf(mockMdexWorker.address);
      Assert.assertAlmostEqual(stratLPBalance.toString(), ethers.utils.parseEther("0.23120513736969137").toString());
      expect(stratLPBalance).to.above(ethers.utils.parseEther("0"));
      expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.below(MAX_ROUNDING_ERROR);

      // Now Alice leverage 2x on her 0.1 BTOKEN.
      // So totally Alice will take 0.1 BTOKEN from the pool and 0.1 BTOKEN from her pocket to
      // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
      await baseToken.mint(mockMdexWorker.address, ethers.utils.parseEther("0.1"));
      await mockMdexWorkerAsAlice.work(
        0,
        await alice.getAddress(),
        ethers.utils.parseEther("0.1"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [
            addRestrictedStrat.address,
            ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], ["0", ethers.utils.parseEther("0")]),
          ]
        )
      );
      // the calculation is ratio between balance and reserve * total supply
      // let total supply = 0.556470668763341270 coming from 0.31622776601683794 + 0.23120513736969137
      // current reserve after swap is 3049652202279806938
      // ths lp will be (50347797720193062 (optimal swap amount) / 3049652202279806938 (reserve)) *  0.556470668763341270
      // lp will be 0.009037765376812014
      // thus the accum lp will  be 0.009037765376812014 + 0.23120513736969137 = 0.240242902746503337
      Assert.assertAlmostEqual(
        (await lp.balanceOf(mockMdexWorker.address)).toString(),
        ethers.utils.parseEther("0.240242902746503337").toString()
      );
      expect(await lp.balanceOf(mockMdexWorker.address)).to.above(stratLPBalance);
      expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.below(MAX_ROUNDING_ERROR);
    });

    it("should convert some BTOKEN and some FTOKEN to LP tokens at best rate (fee 20)", async () => {
      // set lp pair fee
      await factory.setPairFees(lp.address, 20);
      // Now Alice leverage 2x on her 1 BTOKEN.
      // So totally Alice will take 1 BTOKEN from the pool and 1 BTOKEN from her pocket to
      // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
      await mockedVault.setMockOwner(await alice.getAddress());
      await baseToken.mint(mockMdexWorker.address, ethers.utils.parseEther("2"));
      await farmingTokenAsAlice.approve(mockedVault.address, ethers.utils.parseEther("1"));
      await mockMdexWorkerAsAlice.work(
        0,
        await alice.getAddress(),
        ethers.utils.parseEther("0"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [
            addRestrictedStrat.address,
            ethers.utils.defaultAbiCoder.encode(
              ["uint256", "uint256"],
              [ethers.utils.parseEther("0.05"), ethers.utils.parseEther("0")]
            ),
          ]
        )
      );

      // the calculation is ratio between balance and reserve * total supply
      // let total supply = sqrt(1 * 0.1) = 0.31622776601683793
      // current reserve after swap is 1414628251406192119
      // ths lp will be (1585371748593807881 (optimal swap amount) / 1414628251406192119 (reserve)) *  0.31622776601683794
      // lp will be 0.354395980615881993
      const stratLPBalance = await lp.balanceOf(mockMdexWorker.address);
      Assert.assertAlmostEqual(stratLPBalance.toString(), ethers.utils.parseEther("0.354395980615881993").toString());
      expect(stratLPBalance).to.above(ethers.utils.parseEther("0"));
      expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.below(MAX_ROUNDING_ERROR);

      // Now Alice leverage 2x on her 0.1 BTOKEN.
      // So totally Alice will take 0.1 BTOKEN from the pool and 0.1 BTOKEN from her pocket to
      // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
      await baseToken.mint(mockMdexWorker.address, ethers.utils.parseEther("1"));
      await farmingTokenAsAlice.approve(mockedVault.address, ethers.utils.parseEther("1"));
      await mockMdexWorkerAsAlice.work(
        0,
        await alice.getAddress(),
        ethers.utils.parseEther("1"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [
            addRestrictedStrat.address,
            ethers.utils.defaultAbiCoder.encode(
              ["uint256", "uint256"],
              [ethers.utils.parseEther("1"), ethers.utils.parseEther("0.1")]
            ),
          ]
        )
      );

      // the calculation is ratio between balance and reserve * total supply
      // let total supply = 0.31622776601683794 + 0.354346766435591663 = 0.6705745324524296
      // current reserve after swap is 1251999642993914466
      // ths lp will be (2748183224992804794 (optimal swap amount) / 1251816775007195206 (reserve)) *  0.6705745324524296
      // lp will be 1.472149693139052074
      // thus, the accum lp will be 1.472149693139052074 + 0.354346766435591663 = 1.8264964595746437379
      Assert.assertAlmostEqual(
        (await lp.balanceOf(mockMdexWorker.address)).toString(),
        ethers.utils.parseEther("1.826496459574643737").toString()
      );
      expect(await lp.balanceOf(mockMdexWorker.address)).to.above(stratLPBalance);
      expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.below(MAX_ROUNDING_ERROR);
    });

    it("should convert some BTOKEN and some FTOKEN to LP tokens at best rate (fee 25)", async () => {
      // set lp pair fee
      await factory.setPairFees(lp.address, 25);
      // Now Alice leverage 2x on her 1 BTOKEN.
      // So totally Alice will take 1 BTOKEN from the pool and 1 BTOKEN from her pocket to
      // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
      await mockedVault.setMockOwner(await alice.getAddress());
      await baseToken.mint(mockMdexWorker.address, ethers.utils.parseEther("2"));
      await farmingTokenAsAlice.approve(mockedVault.address, ethers.utils.parseEther("1"));
      await mockMdexWorkerAsAlice.work(
        0,
        await alice.getAddress(),
        ethers.utils.parseEther("0"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [
            addRestrictedStrat.address,
            ethers.utils.defaultAbiCoder.encode(
              ["uint256", "uint256"],
              [ethers.utils.parseEther("0.05"), ethers.utils.parseEther("0")]
            ),
          ]
        )
      );

      // the calculation is ratio between balance and reserve * total supply
      // let total supply = sqrt(1 * 0.1) = 0.31622776601683794
      // current reserve after swap is 1414732072482656002
      // ths lp will be (1585267927517343998 (optimal swap amount) / 1414732072482656002 (reserve)) *  0.31622776601683794
      // lp will be 0.354346766435591663
      const stratLPBalance = await lp.balanceOf(mockMdexWorker.address);
      Assert.assertAlmostEqual(stratLPBalance.toString(), ethers.utils.parseEther("0.354346766435591663").toString());
      expect(stratLPBalance).to.above(ethers.utils.parseEther("0"));
      expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.below(MAX_ROUNDING_ERROR);

      // Now Alice leverage 2x on her 0.1 BTOKEN.
      // So totally Alice will take 0.1 BTOKEN from the pool and 0.1 BTOKEN from her pocket to
      // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
      await baseToken.mint(mockMdexWorker.address, ethers.utils.parseEther("1"));
      await farmingTokenAsAlice.approve(mockedVault.address, ethers.utils.parseEther("1"));
      await mockMdexWorkerAsAlice.work(
        0,
        await alice.getAddress(),
        ethers.utils.parseEther("1"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [
            addRestrictedStrat.address,
            ethers.utils.defaultAbiCoder.encode(
              ["uint256", "uint256"],
              [ethers.utils.parseEther("1"), ethers.utils.parseEther("0.1")]
            ),
          ]
        )
      );

      // the calculation is ratio between balance and reserve * total supply
      // let total supply = 0.31622776601683794 + 0.354346766435591663 = 0.6705745324524296
      // current reserve after swap is 1251999642993914466
      // ths lp will be (2748000357006085534 (optimal swap amount) / 1251999642993914466 (reserve)) *  0.6705745324524296
      // lp will be 0.1471836725266080870
      // thus, the accum lp will be 1.471836725266080870 + 0.354346766435591663 = 1.8261834917016726
      Assert.assertAlmostEqual(
        (await lp.balanceOf(mockMdexWorker.address)).toString(),
        ethers.utils.parseEther("1.8261834917016726").toString()
      );
      expect(await lp.balanceOf(mockMdexWorker.address)).to.above(stratLPBalance);
      expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.below(MAX_ROUNDING_ERROR);
    });

    it("should be able to withdraw trading rewards", async () => {
      // set lp pair fee
      await factory.setPairFees(lp.address, 25);

      // Now Alice leverage 2x on her 1 BTOKEN.
      // So totally Alice will take 1 BTOKEN from the pool and 1 BTOKEN from her pocket to
      // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
      await mockedVault.setMockOwner(await alice.getAddress());
      await baseToken.mint(mockMdexWorker.address, ethers.utils.parseEther("2"));
      await farmingTokenAsAlice.approve(mockedVault.address, ethers.utils.parseEther("1"));
      await mockMdexWorkerAsAlice.work(
        0,
        await alice.getAddress(),
        ethers.utils.parseEther("0"),
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [
            addRestrictedStrat.address,
            ethers.utils.defaultAbiCoder.encode(
              ["uint256", "uint256"],
              [ethers.utils.parseEther("0.05"), ethers.utils.parseEther("0")]
            ),
          ]
        )
      );

      const mdxBefore = await mdxToken.balanceOf(await deployer.getAddress());
      // withdraw trading reward to deployer
      const withDrawTx = await addRestrictedStrat.withdrawTradingRewards(await deployer.getAddress());
      const mdxAfter = await mdxToken.balanceOf(await deployer.getAddress());
      // get trading reward of the previos block
      const pIds = [0];
      const totalRewardPrev = await addRestrictedStrat.getMiningRewards(pIds, {
        blockTag: Number(withDrawTx.blockNumber) - 1,
      });
      const withDrawBlockReward = await swapMining["reward()"]({ blockTag: withDrawTx.blockNumber });
      const totalReward = totalRewardPrev.add(withDrawBlockReward);
      expect(mdxAfter.sub(mdxBefore)).to.eq(totalReward);
    });
  });

  describe("restricted test", async () => {
    context("When the setOkWorkers caller is not an owner", async () => {
      it("should be reverted", async () => {
        await expect(addRestrictedStratAsBob.setWorkersOk([mockMdexEvilWorkerAsBob.address], true)).to.reverted;
      });
    });

    context("When the withdrawTradingRewards caller is not an owner", async () => {
      it("should be reverted", async () => {
        await expect(addRestrictedStratAsBob.withdrawTradingRewards(await bob.getAddress())).to.reverted;
      });
    });

    context("When the caller worker is not whitelisted", async () => {
      it("should revert", async () => {
        await baseTokenAsBob.transfer(mockMdexEvilWorkerAsBob.address, ethers.utils.parseEther("0.01"));
        await expect(
          mockMdexEvilWorkerAsBob.work(
            0,
            await bob.getAddress(),
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                addRestrictedStrat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256"],
                  [ethers.utils.parseEther("0"), ethers.utils.parseEther("0.01")]
                ),
              ]
            )
          )
        ).to.revertedWith("MdexRestrictedStrategyAddTwoSidesOptimal::onlyWhitelistedWorkers:: bad worker");
      });
    });

    context("When the caller worker has been revoked from callable", async () => {
      it("should revert", async () => {
        await baseTokenAsBob.transfer(mockMdexEvilWorkerAsBob.address, ethers.utils.parseEther("0.01"));
        await addRestrictedStratAsDeployer.setWorkersOk([mockMdexWorker.address], false);
        await expect(
          mockMdexWorkerAsBob.work(
            0,
            await bob.getAddress(),
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                addRestrictedStrat.address,
                ethers.utils.defaultAbiCoder.encode(
                  ["uint256", "uint256"],
                  [ethers.utils.parseEther("0"), ethers.utils.parseEther("0.01")]
                ),
              ]
            )
          )
        ).to.revertedWith("MdexRestrictedStrategyAddTwoSidesOptimal::onlyWhitelistedWorkers:: bad worker");
      });
    });
  });
});
