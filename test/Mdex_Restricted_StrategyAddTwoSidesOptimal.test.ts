import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet, BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  AlpacaToken,
  AlpacaToken__factory,
  CakeToken,
  CakeToken__factory,
  DebtToken,
  DebtToken__factory,
  FairLaunch,
  FairLaunch__factory,
  MockERC20,
  MockERC20__factory,
  PancakeFactory,
  PancakeFactory__factory,
  PancakeMasterChef,
  PancakeMasterChef__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouter,
  PancakeRouter__factory,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory,
  PancakeswapV2StrategyLiquidate,
  PancakeswapV2StrategyLiquidate__factory,
  PancakeswapWorker,
  PancakeswapWorker__factory,
  SimpleVaultConfig,
  SimpleVaultConfig__factory,
  SyrupBar,
  SyrupBar__factory,
  Vault,
  Vault__factory,
  WETH,
  WETH__factory,
  WNativeRelayer,
  WNativeRelayer__factory,
  MockVaultForRestrictedAddTwosideOptimalStrat,
  MockVaultForRestrictedAddTwosideOptimalStrat__factory,
  MockPancakeswapV2Worker,
  MockPancakeswapV2Worker__factory,
  PancakeswapV2StrategyAddTwoSidesOptimal__factory,
  PancakeswapV2StrategyAddTwoSidesOptimal,
  PancakeswapV2Worker,
  MdexFactory__factory,
  MdexFactory,
  MdexRouter,
  MdexRouter__factory,
  MdexPair__factory,
  MdexPair,
  MdexRestrictedStrategyAddTwosidesOptimal__factory,
  MdexRestrictedStrategyAddTwosidesOptimal,
  MockMdexWorker__factory,
  MockMdexWorker,
} from "../typechain";
import * as Assert from "./helpers/assert";
import { parseEther } from "@ethersproject/units";
import { MdxToken } from "../typechain/MdxToken";

chai.use(solidity);
const { expect } = chai;

describe("MdexRestrictedStrategyAddTwoSideOptimal", () => {
  const FOREVER = "2000000000";
  const MAX_ROUNDING_ERROR = Number("15");

  /// Mdex-related instance(s)
  let factory: MdexFactory;
  let router: MdexRouter;

  /// Token-related instance(s)
  // let mdx: MdxToken
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

  let addRestrictedStrat: MdexRestrictedStrategyAddTwosidesOptimal;
  let addRestrictedStratAsDeployer: MdexRestrictedStrategyAddTwosidesOptimal;

  // Contract Signer
  let addRestrictedStratAsBob: MdexRestrictedStrategyAddTwosidesOptimal;
  let baseTokenAsBob: MockERC20;

  let farmingTokenAsAlice: MockERC20;

  let lp: MdexPair;

  const setupFullFlowTest  = async () => {
    // Setup Mdex
    const MdexFactory = (await ethers.getContractFactory("MdexFactory", deployer)) as MdexFactory__factory;
    factory = await MdexFactory.deploy(await deployer.getAddress());
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();
    await wbnb.deployed();

    // const MDX = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    // mdx = await MDX.deploy();
    // await wbnb.deployed();

    const MdexRouter = (await ethers.getContractFactory("PancakeRouterV2", deployer)) as MdexRouter__factory;
    router = await MdexRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

    /// Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    baseToken = (await upgrades.deployProxy(MockERC20, ["BTOKEN", "BTOKEN"])) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
    farmingToken = (await upgrades.deployProxy(MockERC20, ["FTOKEN", "FTOKEN"])) as MockERC20;
    await farmingToken.deployed();
    await farmingToken.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));
    await farmingToken.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
    await farmingToken.mint(await bob.getAddress(), ethers.utils.parseEther("100"));

    /// Setup BTOKEN-FTOKEN pair on Mdex
    await factory.createPair(farmingToken.address, baseToken.address);
    lp = MdexPair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);
    await lp.deployed();

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

    const MdexRestrictedStrategyAddTwosidesOptimal = (await ethers.getContractFactory(
      "MdexRestrictedStrategyAddTwosidesOptimal",
      deployer
    )) as MdexRestrictedStrategyAddTwosidesOptimal__factory;
    addRestrictedStrat = (await upgrades.deployProxy(MdexRestrictedStrategyAddTwosidesOptimal, [
      router.address,
      mockedVault.address,
      wbnb.address, // TODO: maybe change this to mdx
    ])) as MdexRestrictedStrategyAddTwosidesOptimal;
    await addRestrictedStrat.deployed();

    // / Setup MockMdexWorker
    const MockMdexWorker = (await ethers.getContractFactory(
      "MockMdexWorker",
      deployer
    )) as MockMdexWorker__factory;
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
    addRestrictedStratAsBob = MdexRestrictedStrategyAddTwosidesOptimal__factory.connect(
      addRestrictedStrat.address,
      bob
    );
    addRestrictedStratAsDeployer = MdexRestrictedStrategyAddTwosidesOptimal__factory.connect(
      addRestrictedStrat.address,
      deployer
    );

    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);

    mockMdexWorkerAsBob = MockMdexWorker__factory.connect(mockMdexWorker.address, bob);
    mockMdexWorkerAsAlice = MockMdexWorker__factory.connect(mockMdexWorker.address, alice);
    mockMdexEvilWorkerAsBob = MockMdexWorker__factory.connect(
      mockMdexEvilWorker.address,
      bob
    );
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

  describe("test set up", async () => {
    it("should pass", async () => {
      expect(true)
    })
  })
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

      // // the calculation is ratio between balance and reserve * total supply
      // // let total supply = sqrt(1 * 0.1) = 0.31622776601683794
      // // current reserve after swap is 1732967258967755614
      // // ths lp will be (1267032741032244386 (optimal swap amount) / 1732967258967755614 (reserve)) *  0.31622776601683794
      // // lp will be 0.23120513736969137
      // const stratLPBalance = await lp.balanceOf(mockMdexWorker.address);
      // Assert.assertAlmostEqual(stratLPBalance.toString(), ethers.utils.parseEther("0.23120513736969137").toString());
      // expect(stratLPBalance).to.above(ethers.utils.parseEther("0"));
      // expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.bignumber.below(MAX_ROUNDING_ERROR);

      // // Now Alice leverage 2x on her 0.1 BTOKEN.
      // // So totally Alice will take 0.1 BTOKEN from the pool and 0.1 BTOKEN from her pocket to
      // // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
      // await baseToken.mint(mockMdexWorker.address, ethers.utils.parseEther("0.1"));
      // await mockMdexWorkerAsAlice.work(
      //   0,
      //   await alice.getAddress(),
      //   ethers.utils.parseEther("0.1"),
      //   ethers.utils.defaultAbiCoder.encode(
      //     ["address", "bytes"],
      //     [
      //       addRestrictedStrat.address,
      //       ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], ["0", ethers.utils.parseEther("0")]),
      //     ]
      //   )
      // );
      // // the calculation is ratio between balance and reserve * total supply
      // // let total supply = 0.556470668763341270 coming from 0.31622776601683794 + 0.23120513736969137
      // // current reserve after swap is 3049652202279806938
      // // ths lp will be (50347797720193062 (optimal swap amount) / 3049652202279806938 (reserve)) *  0.556470668763341270
      // // lp will be 0.009037765376812014
      // // thus the accum lp will  be 0.009037765376812014 + 0.23120513736969137 = 0.240242902746503337
      // Assert.assertAlmostEqual(
      //   (await lp.balanceOf(mockMdexWorker.address)).toString(),
      //   ethers.utils.parseEther("0.240242902746503337").toString()
      // );
      // expect(await lp.balanceOf(mockMdexWorker.address)).to.above(stratLPBalance);
      // expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.bignumber.below(MAX_ROUNDING_ERROR);
    });

    // it("should convert some BTOKEN and some FTOKEN to LP tokens at best rate", async () => {
    //   // Now Alice leverage 2x on her 1 BTOKEN.
    //   // So totally Alice will take 1 BTOKEN from the pool and 1 BTOKEN from her pocket to
    //   // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
    //   await mockedVault.setMockOwner(await alice.getAddress());
    //   await baseToken.mint(mockMdexWorker.address, ethers.utils.parseEther("2"));
    //   await farmingTokenAsAlice.approve(mockedVault.address, ethers.utils.parseEther("1"));
    //   await mockMdexWorkerAsAlice.work(
    //     0,
    //     await alice.getAddress(),
    //     ethers.utils.parseEther("0"),
    //     ethers.utils.defaultAbiCoder.encode(
    //       ["address", "bytes"],
    //       [
    //         addRestrictedStrat.address,
    //         ethers.utils.defaultAbiCoder.encode(
    //           ["uint256", "uint256"],
    //           [ethers.utils.parseEther("0.05"), ethers.utils.parseEther("0")]
    //         ),
    //       ]
    //     )
    //   );

    //   // the calculation is ratio between balance and reserve * total supply
    //   // let total supply = sqrt(1 * 0.1) = 0.31622776601683794
    //   // current reserve after swap is 1414732072482656002
    //   // ths lp will be (1585267927517343998 (optimal swap amount) / 1414732072482656002 (reserve)) *  0.31622776601683794
    //   // lp will be 0.354346766435591663
    //   const stratLPBalance = await lp.balanceOf(mockMdexWorker.address);
    //   Assert.assertAlmostEqual(stratLPBalance.toString(), ethers.utils.parseEther("0.354346766435591663").toString());
    //   expect(stratLPBalance).to.above(ethers.utils.parseEther("0"));
    //   expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.bignumber.below(MAX_ROUNDING_ERROR);

    //   // Now Alice leverage 2x on her 0.1 BTOKEN.
    //   // So totally Alice will take 0.1 BTOKEN from the pool and 0.1 BTOKEN from her pocket to
    //   // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
    //   await baseToken.mint(mockMdexWorker.address, ethers.utils.parseEther("1"));
    //   await farmingTokenAsAlice.approve(mockedVault.address, ethers.utils.parseEther("1"));
    //   await mockMdexWorkerAsAlice.work(
    //     0,
    //     await alice.getAddress(),
    //     ethers.utils.parseEther("1"),
    //     ethers.utils.defaultAbiCoder.encode(
    //       ["address", "bytes"],
    //       [
    //         addRestrictedStrat.address,
    //         ethers.utils.defaultAbiCoder.encode(
    //           ["uint256", "uint256"],
    //           [ethers.utils.parseEther("1"), ethers.utils.parseEther("0.1")]
    //         ),
    //       ]
    //     )
    //   );

    //   // the calculation is ratio between balance and reserve * total supply
    //   // let total supply = 0.31622776601683794 + 0.354346766435591663 = 0.6705745324524296
    //   // current reserve after swap is 1251999642993914466
    //   // ths lp will be (2748000357006085534 (optimal swap amount) / 1251999642993914466 (reserve)) *  0.6705745324524296
    //   // lp will be 0.1471836725266080870
    //   // thus, the accum lp will be 1.471836725266080870 + 0.354346766435591663 = 1.8261834917016726
    //   Assert.assertAlmostEqual(
    //     (await lp.balanceOf(mockMdexWorker.address)).toString(),
    //     ethers.utils.parseEther("1.8261834917016726").toString()
    //   );
    //   expect(await lp.balanceOf(mockMdexWorker.address)).to.above(stratLPBalance);
    //   expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.bignumber.below(MAX_ROUNDING_ERROR);
    // });
 
  });

  // describe("restricted test", async () => {
  //   context("When the setOkWorkers caller is not an owner", async () => {
  //     it("should be reverted", async () => {
  //       await expect(addRestrictedStratAsBob.setWorkersOk([mockMdexEvilWorkerAsBob.address], true)).to
  //         .reverted;
  //     });
  //   });

  //   context("When the caller worker is not whitelisted", async () => {
  //     it("should revert", async () => {
  //       await baseTokenAsBob.transfer(mockMdexEvilWorkerAsBob.address, ethers.utils.parseEther("0.01"));
  //       await expect(
  //         mockMdexEvilWorkerAsBob.work(
  //           0,
  //           await bob.getAddress(),
  //           0,
  //           ethers.utils.defaultAbiCoder.encode(
  //             ["address", "bytes"],
  //             [
  //               addRestrictedStrat.address,
  //               ethers.utils.defaultAbiCoder.encode(
  //                 ["uint256", "uint256"],
  //                 [ethers.utils.parseEther("0"), ethers.utils.parseEther("0.01")]
  //               ),
  //             ]
  //           )
  //         )
  //       ).to.revertedWith("MdexRestrictedStrategyAddTwoSidesOptimal::onlyWhitelistedWorkers:: bad worker");
  //     });
  //   });

  //   context("When the caller worker has been revoked from callable", async () => {
  //     it("should revert", async () => {
  //       await baseTokenAsBob.transfer(mockMdexEvilWorkerAsBob.address, ethers.utils.parseEther("0.01"));
  //       await addRestrictedStratAsDeployer.setWorkersOk([mockMdexWorker.address], false);
  //       await expect(
  //         mockMdexWorkerAsBob.work(
  //           0,
  //           await bob.getAddress(),
  //           0,
  //           ethers.utils.defaultAbiCoder.encode(
  //             ["address", "bytes"],
  //             [
  //               addRestrictedStrat.address,
  //               ethers.utils.defaultAbiCoder.encode(
  //                 ["uint256", "uint256"],
  //                 [ethers.utils.parseEther("0"), ethers.utils.parseEther("0.01")]
  //               ),
  //             ]
  //           )
  //         )
  //       ).to.revertedWith("MdexRestrictedStrategyAddTwoSidesOptimal::onlyWhitelistedWorkers:: bad worker");
  //     });
  //   });
  // });

});
