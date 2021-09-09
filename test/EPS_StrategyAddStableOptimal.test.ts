import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet, BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  AlpacaToken,
  CakeToken,
  FairLaunch,
  MockERC20,
  MockWBNB,
  PancakeFactory,
  PancakeMasterChef,
  PancakePair,
  PancakePair__factory,
  PancakeRouterV2,
  PancakeRouterV2__factory,
  PancakeswapV2Worker02,
  StrategyAddStableOptimal,
  StrategyAddStableOptimal__factory,
  SyrupBar,
  MockPancakeswapV2Worker,
  MockPancakeswapV2Worker__factory,
  MockVaultForStrategy,
  MockVaultForStrategy__factory,
  StableSwap,
  StableSwap__factory,
  Token,
  Token__factory,
  FeeConverter,
  FeeConverter__factory,
  MockERC20__factory,
  PancakeswapV2StrategyAddTwoSidesOptimal__factory,
  PancakeswapV2StrategyAddTwoSidesOptimal,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory,
} from "../typechain";
import { DeployHelper } from "./helpers/deploy";
import { SwapHelper } from "./helpers/swap";
import * as TestHelpers from "./helpers/assert";

chai.use(solidity);
const { expect } = chai;

import * as fs from "fs";

describe("EPS - StrategyAddStableOptimal", () => {
  const FOREVER = "2000000000";
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther("0.076");

  /// Pancakeswap-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouterV2;
  let USDT_BUSD: PancakePair;
  let USDC_USDT: PancakePair;
  let USDC_BUSD: PancakePair;

  /// Token-related instance(s)
  let wbnb: MockWBNB;
  let BUSD: MockERC20;
  let USDC: MockERC20;
  let USDT: MockERC20;
  let cake: CakeToken;
  let syrup: SyrupBar;

  /// Vault-related instance(s)
  let mockedVault: MockVaultForStrategy;

  // V2
  let mockPancakeswapV2Worker_USDT_BUSD: MockPancakeswapV2Worker;
  let mockPancakeswapV2Worker_USDC_USDT: MockPancakeswapV2Worker;
  let mockPancakeswapV2Worker_USDC_BUSD: MockPancakeswapV2Worker;
  let mockPancakeswapV2Worker_USDT_BUSD_asAlice: MockPancakeswapV2Worker;
  let mockPancakeswapV2Worker_USDC_USDT_asAlice: MockPancakeswapV2Worker;
  let mockPancakeswapV2Worker_USDC_BUSD_asAlice: MockPancakeswapV2Worker;
  let mockPancakeswapV2Worker_USDT_BUSD_asBob: MockPancakeswapV2Worker;
  let mockPancakeswapV2Worker_USDC_USDT_asBob: MockPancakeswapV2Worker;
  let mockPancakeswapV2Worker_USDC_BUSD_asBob: MockPancakeswapV2Worker;

  /// StableSwap related instance(s)
  let stableLPToken: Token;
  let stableFeeConverter: FeeConverter;
  let stableSwap: StableSwap;
  const idx_BUSD: BigNumberish = 0;
  const idx_USDC: BigNumberish = 1;
  const idx_USDT: BigNumberish = 2;
  const stableSwapFee: BigNumberish = 4000000;
  const stableSwapA: BigNumberish = 1500;

  /// Strategy-related instance(s)
  let addStableStrat: StrategyAddStableOptimal;
  let addStrat: PancakeswapV2RestrictedStrategyAddTwoSidesOptimal;

  /// FairLaunch-related instance(s)
  let fairLaunch: FairLaunch;
  let alpacaToken: AlpacaToken;

  /// PancakeswapMasterChef-related instance(s)
  let masterChef: PancakeMasterChef;
  let poolId: number;
  let pancakeswapV2Worker: PancakeswapV2Worker02;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let eve: Signer;

  let deployerAddress: string;
  let aliceAddress: string;
  let bobAddress: string;
  let eveAddress: string;
  const DEAD_ADDRESS: string = "0x000000000000000000000000000000000000dead";

  // Contract Signer
  let addStableStratAsDeployer: StrategyAddStableOptimal;
  let addStableStratAsAlice: StrategyAddStableOptimal;
  let addStableStratAsBob: StrategyAddStableOptimal;
  let addStratAsDeployer: PancakeswapV2StrategyAddTwoSidesOptimal;
  let addStratAsAlice: PancakeswapV2StrategyAddTwoSidesOptimal;
  let addStratAsBob: PancakeswapV2StrategyAddTwoSidesOptimal;

  let baseTokenAsAlice: MockERC20;
  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerV2AsDeployer: PancakeRouterV2;
  let routerV2AsAlice: PancakeRouterV2;
  let routerV2AsBob: PancakeRouterV2;

  let stableSwapAsDeployer: StableSwap;
  let stableSwapAsBob: StableSwap;
  let stableSwapAsAlice: StableSwap;

  let BUSD_asDeployer: MockERC20;
  let USDC_asDeployer: MockERC20;
  let USDT_asDeployer: MockERC20;
  let BUSD_asBob: MockERC20;
  let USDC_asBob: MockERC20;
  let USDT_asBob: MockERC20;
  let BUSD_asAlice: MockERC20;
  let USDC_asAlice: MockERC20;
  let USDT_asAlice: MockERC20;

  let swapHelper: SwapHelper;

  async function fixture() {
    [deployer, alice, bob, eve] = await ethers.getSigners();
    [deployerAddress, aliceAddress, bobAddress, eveAddress] = await Promise.all([
      deployer.getAddress(),
      alice.getAddress(),
      bob.getAddress(),
      eve.getAddress(),
    ]);
    const deployHelper = new DeployHelper(deployer);

    // █▀█ ▄▀█ █▄░█ █▀▀ ▄▀█ █▄▀ █▀▀ █▀ █░█░█ ▄▀█ █▀█
    // █▀▀ █▀█ █░▀█ █▄▄ █▀█ █░█ ██▄ ▄█ ▀▄▀▄▀ █▀█ █▀▀
    // Setup Pancakeswap
    wbnb = await deployHelper.deployWBNB();
    [factoryV2, routerV2, cake, syrup, masterChef] = await deployHelper.deployPancakeV2(wbnb, CAKE_REWARD_PER_BLOCK, [
      { address: deployerAddress, amount: ethers.utils.parseEther("100") },
    ]);
    routerV2AsDeployer = PancakeRouterV2__factory.connect(routerV2.address, deployer);
    routerV2AsAlice = PancakeRouterV2__factory.connect(routerV2.address, alice);
    routerV2AsBob = PancakeRouterV2__factory.connect(routerV2.address, bob);

    /// Setup token stuffs
    [BUSD, USDC, USDT] = await deployHelper.deployBEP20([
      {
        name: "BUSD",
        symbol: "BUSD",
        holders: [{ address: deployerAddress, amount: ethers.utils.parseEther("1000000000000000") }],
      },
      {
        name: "USDC",
        symbol: "USDC",
        holders: [{ address: deployerAddress, amount: ethers.utils.parseEther("1000000000000000") }],
      },
      {
        name: "USDT",
        symbol: "USDT",
        holders: [{ address: deployerAddress, amount: ethers.utils.parseEther("1000000000000000") }],
      },
    ]);

    // sign stable tokens to users
    BUSD_asDeployer = MockERC20__factory.connect(BUSD.address, deployer);
    USDC_asDeployer = MockERC20__factory.connect(USDC.address, deployer);
    USDT_asDeployer = MockERC20__factory.connect(USDT.address, deployer);
    BUSD_asAlice = MockERC20__factory.connect(BUSD.address, alice);
    USDC_asAlice = MockERC20__factory.connect(USDC.address, alice);
    USDT_asAlice = MockERC20__factory.connect(USDT.address, alice);
    BUSD_asBob = MockERC20__factory.connect(BUSD.address, bob);
    USDC_asBob = MockERC20__factory.connect(USDC.address, bob);
    USDT_asBob = MockERC20__factory.connect(USDT.address, bob);

    /// Setup all stable pool pairs on Pancakeswap
    swapHelper = new SwapHelper(
      factoryV2.address,
      routerV2.address,
      ethers.BigNumber.from(9975),
      ethers.BigNumber.from(10000),
      deployer
    );
    await swapHelper.addLiquidities([
      {
        token0: USDT,
        token1: BUSD,
        amount0desired: ethers.utils.parseEther("1"),
        amount1desired: ethers.utils.parseEther("1"),
      },
      {
        token0: USDC,
        token1: USDT,
        amount0desired: ethers.utils.parseEther("1"),
        amount1desired: ethers.utils.parseEther("1"),
      },
      {
        token0: USDC,
        token1: BUSD,
        amount0desired: ethers.utils.parseEther("1"),
        amount1desired: ethers.utils.parseEther("1"),
      },
    ]);
    USDT_BUSD = PancakePair__factory.connect(await factoryV2.getPair(USDT.address, BUSD.address), deployer);
    USDC_USDT = PancakePair__factory.connect(await factoryV2.getPair(USDT.address, USDC.address), deployer);
    USDC_BUSD = PancakePair__factory.connect(await factoryV2.getPair(BUSD.address, USDC.address), deployer);

    // █▀ ▀█▀ ▄▀█ █▄▄ █░░ █▀▀ █▀ █░█░█ ▄▀█ █▀█
    // ▄█ ░█░ █▀█ █▄█ █▄▄ ██▄ ▄█ ▀▄▀▄▀ █▀█ █▀▀
    // deploy StableToken (EPS)
    const StableLPToken = (await ethers.getContractFactory("Token", deployer)) as Token__factory;
    stableLPToken = await StableLPToken.deploy("Ellipsis.finance BUSD/USDC/USDT", "3EPS", 0);

    // deploy StableFeeConverter (EPS)
    const StableFeeConverter = (await ethers.getContractFactory("FeeConverter", deployer)) as FeeConverter__factory;
    stableFeeConverter = await StableFeeConverter.deploy();

    // deploy StableSwap (EPS)
    const StableSwap = (await ethers.getContractFactory("StableSwap", deployer)) as StableSwap__factory;
    stableSwap = await StableSwap.deploy(
      deployerAddress,
      [BUSD.address, USDC.address, USDT.address],
      stableLPToken.address,
      stableSwapA, // A
      stableSwapFee, // fee
      5000000000, // admin fee
      stableFeeConverter.address
    );
    await stableLPToken.set_minter(stableSwap.address);
    // Setup Vault
    const MockVaultForStrategy = (await ethers.getContractFactory(
      "MockVaultForStrategy",
      deployer
    )) as MockVaultForStrategy__factory;
    mockedVault = (await upgrades.deployProxy(MockVaultForStrategy)) as MockVaultForStrategy;
    await mockedVault.deployed();

    // Setup StrategyAddStableOptimal strategy
    const StrategyAddStableOptimal = (await ethers.getContractFactory(
      "StrategyAddStableOptimal",
      deployer
    )) as StrategyAddStableOptimal__factory;
    addStableStrat = (await upgrades.deployProxy(StrategyAddStableOptimal, [
      stableSwap.address,
      routerV2.address,
      mockedVault.address,
      [BUSD.address, USDC.address, USDT.address],
    ])) as StrategyAddStableOptimal;
    await addStableStrat.deployed();

    // Setup PancakeswapV2RestrictedStrategyAddTwoSidesOptimal strategy
    const PancakeswapV2StrategyAddTwoSidesOptimal = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyAddTwoSidesOptimal",
      deployer
    )) as PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory;
    addStrat = (await upgrades.deployProxy(PancakeswapV2StrategyAddTwoSidesOptimal, [
      routerV2.address,
      mockedVault.address,
    ])) as PancakeswapV2RestrictedStrategyAddTwoSidesOptimal;
    await addStrat.deployed();

    /// Setup MockPancakeswapV2Worker
    const MockPancakeswapV2Worker = (await ethers.getContractFactory(
      "MockPancakeswapV2Worker",
      deployer
    )) as MockPancakeswapV2Worker__factory;
    mockPancakeswapV2Worker_USDT_BUSD = (await MockPancakeswapV2Worker.deploy(
      USDT_BUSD.address,
      BUSD.address,
      USDT.address
    )) as MockPancakeswapV2Worker;
    await mockPancakeswapV2Worker_USDT_BUSD.deployed();
    mockPancakeswapV2Worker_USDC_USDT = (await MockPancakeswapV2Worker.deploy(
      USDC_USDT.address,
      USDT.address,
      USDC.address
    )) as MockPancakeswapV2Worker;
    await mockPancakeswapV2Worker_USDC_USDT.deployed();
    mockPancakeswapV2Worker_USDC_BUSD = (await MockPancakeswapV2Worker.deploy(
      USDC_BUSD.address,
      BUSD.address,
      USDC.address
    )) as MockPancakeswapV2Worker;
    await mockPancakeswapV2Worker_USDC_BUSD.deployed();

    await addStrat.setWorkersOk(
      [
        mockPancakeswapV2Worker_USDT_BUSD.address,
        mockPancakeswapV2Worker_USDC_USDT.address,
        mockPancakeswapV2Worker_USDC_BUSD.address,
      ],
      true
    );

    /// Contract signer (workers)
    mockPancakeswapV2Worker_USDT_BUSD_asAlice = MockPancakeswapV2Worker__factory.connect(
      mockPancakeswapV2Worker_USDT_BUSD.address,
      alice
    );
    mockPancakeswapV2Worker_USDC_USDT_asAlice = MockPancakeswapV2Worker__factory.connect(
      mockPancakeswapV2Worker_USDC_USDT.address,
      alice
    );
    mockPancakeswapV2Worker_USDC_BUSD_asAlice = MockPancakeswapV2Worker__factory.connect(
      mockPancakeswapV2Worker_USDC_BUSD.address,
      alice
    );
    mockPancakeswapV2Worker_USDT_BUSD_asBob = MockPancakeswapV2Worker__factory.connect(
      mockPancakeswapV2Worker_USDT_BUSD.address,
      bob
    );
    mockPancakeswapV2Worker_USDC_USDT_asBob = MockPancakeswapV2Worker__factory.connect(
      mockPancakeswapV2Worker_USDC_USDT.address,
      bob
    );
    mockPancakeswapV2Worker_USDC_BUSD_asBob = MockPancakeswapV2Worker__factory.connect(
      mockPancakeswapV2Worker_USDC_BUSD.address,
      bob
    );

    // Contract signer (Strategies)
    addStableStratAsDeployer = StrategyAddStableOptimal__factory.connect(addStableStrat.address, deployer);
    addStableStratAsAlice = StrategyAddStableOptimal__factory.connect(addStableStrat.address, alice);
    addStableStratAsBob = StrategyAddStableOptimal__factory.connect(addStableStrat.address, bob);
    addStratAsDeployer = PancakeswapV2StrategyAddTwoSidesOptimal__factory.connect(addStrat.address, deployer);
    addStratAsAlice = PancakeswapV2StrategyAddTwoSidesOptimal__factory.connect(addStrat.address, alice);
    addStratAsBob = PancakeswapV2StrategyAddTwoSidesOptimal__factory.connect(addStrat.address, bob);

    /// Contract signer (EPS)
    stableSwapAsDeployer = StableSwap__factory.connect(stableSwap.address, deployer);
    stableSwapAsBob = StableSwap__factory.connect(stableSwap.address, bob);
    stableSwapAsAlice = StableSwap__factory.connect(stableSwap.address, alice);
    for (let address of [routerV2.address, stableSwap.address, mockedVault.address]) {
      await BUSD_asDeployer.approve(address, ethers.constants.MaxUint256);
      await USDC_asDeployer.approve(address, ethers.constants.MaxUint256);
      await USDT_asDeployer.approve(address, ethers.constants.MaxUint256);
      await BUSD_asAlice.approve(address, ethers.constants.MaxUint256);
      await USDC_asAlice.approve(address, ethers.constants.MaxUint256);
      await USDT_asAlice.approve(address, ethers.constants.MaxUint256);
      await BUSD_asBob.approve(address, ethers.constants.MaxUint256);
      await USDC_asBob.approve(address, ethers.constants.MaxUint256);
      await USDT_asBob.approve(address, ethers.constants.MaxUint256);
    }
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  function getFractionOfBigNumber(input: BigNumber, nom: Number, denom: Number) {
    return input.mul(ethers.utils.parseEther(nom.toString())).div(ethers.utils.parseEther(denom.toString()));
  }

  it("should swap stable coins at StableSwap a fairly good ratio (slippageTolerance < 0.1%)", async () => {
    /// add liquidities to StableSwap
    await stableSwapAsDeployer.add_liquidity(
      [
        ethers.utils.parseEther("200000000"),
        ethers.utils.parseEther("200000000"),
        ethers.utils.parseEther("200000000"),
      ],
      ethers.BigNumber.from("1")
    );

    let amount_BUSD = 1000;
    let amount_USDC = 1000;

    // mint to Bob
    BUSD.mint(bobAddress, ethers.utils.parseEther(amount_BUSD.toString()));
    USDC.mint(bobAddress, ethers.utils.parseEther(amount_USDC.toString()));

    /// Bob has 1000 BUSD, 1000 USDC
    const preSwapBal_BUSD = await BUSD.balanceOf(bobAddress);
    const preSwapBal_USDC = await USDC.balanceOf(bobAddress);

    /// Preswap
    let amountIn_BUSD: BigNumber = ethers.utils.parseEther("700");
    let expectedPostSwapBal_BUSD: BigNumber = ethers.utils.parseEther("300");
    let expectedMinAmountOut_USDC: BigNumber = getFractionOfBigNumber(amountIn_BUSD, 999, 1000); // slippageTolerance < 0.1% (999/1000 of expected amt.)
    /// Swap (700 BUSD) to (~700 USDC) on StableSwap
    await stableSwapAsBob.exchange(idx_BUSD, idx_USDC, amountIn_BUSD, expectedMinAmountOut_USDC);
    /// Postswap
    const postSwapBal_BUSD: BigNumber = await BUSD.balanceOf(bobAddress);
    const postSwapBal_USDC: BigNumber = await USDC.balanceOf(bobAddress);
    let actualAmountOut_USDC: BigNumber = postSwapBal_USDC.sub(preSwapBal_USDC);

    /// assert
    expect(postSwapBal_BUSD).to.be.eq(expectedPostSwapBal_BUSD);
    expect(actualAmountOut_USDC).to.be.lte(amountIn_BUSD);
    expect(actualAmountOut_USDC).to.be.gte(expectedMinAmountOut_USDC);
  });

  it("should show StableSwap gives a better rate than PancakeSwap", async () => {
    /// add liquidities to PancakeSwap
    await swapHelper.addLiquidities([
      {
        token0: USDC,
        token1: BUSD,
        amount0desired: ethers.utils.parseEther("200000000"),
        amount1desired: ethers.utils.parseEther("200000000"),
      },
    ]);

    /// add liquidities to StableSwap
    await stableSwapAsDeployer.add_liquidity(
      [
        ethers.utils.parseEther("200000000"), // BUSD
        ethers.utils.parseEther("200000000"), // USDC
        ethers.utils.parseEther("200000000"), // USDT
      ],
      ethers.BigNumber.from("1")
    );

    let amount_BUSD = 1000;
    let amount_USDC = 1000;

    // mint to Bob
    BUSD.mint(bobAddress, ethers.utils.parseEther(amount_BUSD.toString()));
    USDC.mint(aliceAddress, ethers.utils.parseEther(amount_USDC.toString()));

    /// Bob has 1000 BUSD, 1000 USDC
    let preSwapBal_USDC = await USDC.balanceOf(bobAddress);

    /// Preswap
    let amountIn_BUSD: BigNumber = ethers.utils.parseEther("500");
    let expectedMinAmountOut_USDC: BigNumber = getFractionOfBigNumber(amountIn_BUSD, 999, 1000); // slippageTolerance = 0.1%
    /// Swap (500 BUSD) to (500 USDC) on StableSwap
    await stableSwapAsBob.exchange(idx_BUSD, idx_USDC, amountIn_BUSD, expectedMinAmountOut_USDC);
    let stableSwapAmountOut_USDC: BigNumber = (await USDC.balanceOf(bobAddress)).sub(preSwapBal_USDC);
    let prePancakeSwapBal_USDC = await USDC.balanceOf(bobAddress);
    /// Swap (500 BUSD) to (500 USDC) on PancakeSwap
    await routerV2AsBob.swapExactTokensForTokens(amountIn_BUSD, 0, [BUSD.address, USDC.address], bobAddress, FOREVER);
    let pancakeSwapAmountOut_USDC: BigNumber = (await USDC.balanceOf(bobAddress)).sub(prePancakeSwapBal_USDC);
    /// Postswap
    const postSwapBal_BUSD: BigNumber = await BUSD.balanceOf(bobAddress);
    const postSwapBal_USDC: BigNumber = await USDC.balanceOf(bobAddress);

    /// assert
    expect(postSwapBal_BUSD).to.be.eq(0);
    expect(stableSwapAmountOut_USDC).to.be.gt(pancakeSwapAmountOut_USDC);
  });

  it("should gives a larger LP to Alice when use StrategyAddStableOptimal (base to farm) than PancakeswapV2StrategyAddTwoSidesOptimal", async () => {
    /// add liquidities to PancakeSwap
    await swapHelper.addLiquidities([
      {
        token0: USDT,
        token1: BUSD,
        amount0desired: ethers.utils.parseEther("200000000"),
        amount1desired: ethers.utils.parseEther("200000000"),
      },
      {
        token0: USDC,
        token1: BUSD,
        amount0desired: ethers.utils.parseEther("200000000"),
        amount1desired: ethers.utils.parseEther("200000000"),
      },
    ]);
    /// add liquidities to StableSwap
    await stableSwapAsDeployer.add_liquidity(
      [
        ethers.utils.parseEther("197500000"), // BUSD
        ethers.utils.parseEther("200000000"), // USDC
        ethers.utils.parseEther("202500000"), // USDT
      ],
      ethers.BigNumber.from("1")
    );

    let amountIn_BUSD = 30000;
    let amountIn_USDT = 20000;

    // mint to Alice
    await BUSD.mint(aliceAddress, ethers.utils.parseEther(amountIn_BUSD.toString()));
    await USDT.mint(aliceAddress, ethers.utils.parseEther(amountIn_USDT.toString()));

    // Alice use StrategyAddStableOptimal to find the largest LP amount through StableSwap
    await mockedVault.setMockOwner(aliceAddress);
    await BUSD_asAlice.transfer(mockPancakeswapV2Worker_USDT_BUSD_asAlice.address, await BUSD.balanceOf(aliceAddress));
    const aliceStratTx = await mockPancakeswapV2Worker_USDT_BUSD_asAlice.work(
      0,
      aliceAddress,
      0,
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [
          addStableStrat.address,
          ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [await USDT.balanceOf(aliceAddress), "0"]),
        ]
      )
    );
    const alice_USDT_BUSD = await USDT_BUSD.balanceOf(mockPancakeswapV2Worker_USDT_BUSD.address);
    /// alice's debris after strategy
    const alice_strat_BUSD = await BUSD.balanceOf(addStableStrat.address);
    const alice_strat_USDT = await USDT.balanceOf(addStableStrat.address);

    /// Bob use simple maths to balance through StableSwap and then add LP to PancakeSwap
    let amountIn_USDC = 20000;
    // mint to Bob
    await BUSD.mint(bobAddress, ethers.utils.parseEther(amountIn_BUSD.toString()));
    await USDC.mint(bobAddress, ethers.utils.parseEther(amountIn_USDC.toString()));
    // Bob think he should swap (BUSD + USDC)/2 BUSD to USDC so he would have around balance assets for LP
    await mockedVault.setMockOwner(bobAddress);
    await BUSD_asBob.transfer(mockPancakeswapV2Worker_USDC_BUSD_asBob.address, await BUSD.balanceOf(bobAddress));
    const bobStratTx = await mockPancakeswapV2Worker_USDC_BUSD_asBob.work(
      0,
      bobAddress,
      0,
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [
          addStratAsBob.address,
          ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [await USDC.balanceOf(bobAddress), 0]),
        ]
      )
    );
    const bob_USDC_BUSD = await USDC_BUSD.balanceOf(mockPancakeswapV2Worker_USDC_BUSD.address);

    /// assert
    expect(alice_USDT_BUSD).to.be.gt(0);
    expect(bob_USDC_BUSD).to.be.gt(0);
    expect(alice_USDT_BUSD).to.be.gt(bob_USDC_BUSD);
    // assert no debris left (less than 10 * 10^-18 on both sides)
    expect(alice_strat_BUSD).to.be.lt(10);
    expect(alice_strat_USDT).to.be.lt(10);
  });

  it("should gives a larger LP to Alice when use StrategyAddStableOptimal (farm to base) than PancakeswapV2StrategyAddTwoSidesOptimal", async () => {
    /// add liquidities to PancakeSwap
    await swapHelper.addLiquidities([
      {
        token0: USDT,
        token1: BUSD,
        amount0desired: ethers.utils.parseEther("200000000"),
        amount1desired: ethers.utils.parseEther("200000000"),
      },
      {
        token0: USDC,
        token1: BUSD,
        amount0desired: ethers.utils.parseEther("200000000"),
        amount1desired: ethers.utils.parseEther("200000000"),
      },
    ]);
    /// add liquidities to StableSwap
    await stableSwapAsDeployer.add_liquidity(
      [
        ethers.utils.parseEther("197500000"), // BUSD
        ethers.utils.parseEther("200000000"), // USDC
        ethers.utils.parseEther("202500000"), // USDT
      ],
      ethers.BigNumber.from("1")
    );

    let amountIn_BUSD = 20000;
    let amountIn_USDT = 30000;

    // mint to Alice
    await BUSD.mint(aliceAddress, ethers.utils.parseEther(amountIn_BUSD.toString()));
    await USDT.mint(aliceAddress, ethers.utils.parseEther(amountIn_USDT.toString()));

    // Alice use StrategyAddStableOptimal to find the largest LP amount through StableSwap
    await mockedVault.setMockOwner(aliceAddress);
    await BUSD_asAlice.transfer(mockPancakeswapV2Worker_USDT_BUSD_asAlice.address, await BUSD.balanceOf(aliceAddress));
    const aliceStratTx = await mockPancakeswapV2Worker_USDT_BUSD_asAlice.work(
      0,
      aliceAddress,
      0,
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [
          addStableStrat.address,
          ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [await USDT.balanceOf(aliceAddress), "0"]),
        ]
      )
    );
    const alice_USDT_BUSD = await USDT_BUSD.balanceOf(mockPancakeswapV2Worker_USDT_BUSD.address);
    /// alice's debris after strategy
    const alice_strat_BUSD = await BUSD.balanceOf(addStableStrat.address);
    const alice_strat_USDT = await USDT.balanceOf(addStableStrat.address);

    /// Bob use simple maths to balance through StableSwap and then add LP to PancakeSwap
    let amountIn_USDC = 30000;
    // mint to Bob
    await BUSD.mint(bobAddress, ethers.utils.parseEther(amountIn_BUSD.toString()));
    await USDC.mint(bobAddress, ethers.utils.parseEther(amountIn_USDC.toString()));
    // Bob think he should swap (BUSD + USDC)/2 BUSD to USDC so he would have around balance assets for LP
    await mockedVault.setMockOwner(bobAddress);
    await BUSD_asBob.transfer(mockPancakeswapV2Worker_USDC_BUSD_asBob.address, await BUSD.balanceOf(bobAddress));
    const bobStratTx = await mockPancakeswapV2Worker_USDC_BUSD_asBob.work(
      0,
      bobAddress,
      0,
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [
          addStratAsBob.address,
          ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [await USDC.balanceOf(bobAddress), 0]),
        ]
      )
    );
    const bob_USDC_BUSD = await USDC_BUSD.balanceOf(mockPancakeswapV2Worker_USDC_BUSD.address);

    /// assert
    expect(alice_USDT_BUSD).to.be.gt(0);
    expect(bob_USDC_BUSD).to.be.gt(0);
    expect(alice_USDT_BUSD).to.be.gt(bob_USDC_BUSD);
    // assert no debris left (less than 10 * 10^-18 on both sides)
    expect(alice_strat_BUSD).to.be.lt(10);
    expect(alice_strat_USDT).to.be.lt(10);
  });

  const testCaseUserBalancesIn = [
    [ethers.utils.parseEther("1"), ethers.utils.parseEther("1")],
    [ethers.utils.parseEther("0"), ethers.utils.parseEther("1")],
    [ethers.utils.parseEther("2"), ethers.utils.parseEther("0")],
    [ethers.utils.parseEther("450"), ethers.utils.parseEther("450")],
    [ethers.utils.parseEther("1731"), ethers.utils.parseEther("158")],
    [ethers.utils.parseEther("2000"), ethers.utils.parseEther("1")],
    [ethers.utils.parseEther("3000"), ethers.utils.parseEther("900")],
    [ethers.utils.parseEther("4598"), ethers.utils.parseEther("0")],
    [ethers.utils.parseEther("9999"), ethers.utils.parseEther("9999")],
    [ethers.utils.parseEther("0"), ethers.utils.parseEther("9511")],
    [ethers.utils.parseEther("39850"), ethers.utils.parseEther("7510")],
    [ethers.utils.parseEther("1000000"), ethers.utils.parseEther("1000000")],
    [ethers.utils.parseEther("1524652"), ethers.utils.parseEther("99")],
    [ethers.utils.parseEther("5000000"), ethers.utils.parseEther("0")],
    [ethers.utils.parseEther("1"), ethers.utils.parseEther("5000000")],
    [ethers.utils.parseEther("123"), ethers.utils.parseEther("89754282")],
    [ethers.utils.parseEther("89754282"), ethers.utils.parseEther("321")],
  ];

  const testCaseStableSwapAmountInit = [
    [ethers.utils.parseEther("100000000"), ethers.utils.parseEther("100000000"), ethers.utils.parseEther("100000000")],
    [
      ethers.utils.parseEther("1990000000"),
      ethers.utils.parseEther("1990000000"),
      ethers.utils.parseEther("1990000000"),
    ],
    [ethers.utils.parseEther("190000000"), ethers.utils.parseEther("200000000"), ethers.utils.parseEther("210000000")],
    [ethers.utils.parseEther("400000000"), ethers.utils.parseEther("500000000"), ethers.utils.parseEther("600000000")],
    [ethers.utils.parseEther("273467835"), ethers.utils.parseEther("222959862"), ethers.utils.parseEther("155968065")],
    [
      ethers.utils.parseEther("1005060070"),
      ethers.utils.parseEther("1260005504"),
      ethers.utils.parseEther("2125000450"),
    ],
  ];

  const testCasePancakeSwapAmountInit = [
    {
      USDT: ethers.utils.parseEther("9999999"),
      BUSD: ethers.utils.parseEther("9999999"),
      USDT_to_BUSD_swapAmount: ethers.utils.parseEther("0"),
    },
    {
      USDT: ethers.utils.parseEther("75000000"),
      BUSD: ethers.utils.parseEther("75000000"),
      USDT_to_BUSD_swapAmount: ethers.utils.parseEther("4200"),
    },
    {
      USDT: ethers.utils.parseEther("75000000"),
      BUSD: ethers.utils.parseEther("75000000"),
      USDT_to_BUSD_swapAmount: ethers.utils.parseEther("94000"),
    },
    {
      USDT: ethers.utils.parseEther("150000000"),
      BUSD: ethers.utils.parseEther("150000000"),
      USDT_to_BUSD_swapAmount: ethers.utils.parseEther("123456"),
    },
    {
      USDT: ethers.utils.parseEther("147400000"),
      BUSD: ethers.utils.parseEther("147400000"),
      USDT_to_BUSD_swapAmount: ethers.utils.parseEther("78921"),
    },
    {
      USDT: ethers.utils.parseEther("147400000"),
      BUSD: ethers.utils.parseEther("147400000"),
      USDT_to_BUSD_swapAmount: ethers.utils.parseEther("235104"),
    },
    {
      USDT: ethers.utils.parseEther("9999999999"),
      BUSD: ethers.utils.parseEther("9999999999"),
      USDT_to_BUSD_swapAmount: ethers.utils.parseEther("0"),
    },
  ];

  const outputEpsCsvFile = "./test/csv/EPS_EPSStrategyAddStableOptimal.csv";
  const outputPcsCsvFile = "./test/csv/PCS_PCSStrategyTwoSidesOptimal.csv";
  const header = ["test_id,user_x,user_y,eps_x,eps_y,eps_z,pcs_x,pcs_y,gas,obtained_LP,debris_x,debris_y\n"];
  let csv = header.map((e) => {
    return e.replace(/;/g, ",");
  });
  fs.writeFile(outputEpsCsvFile, csv.join("\r\n"), (err) => {});
  fs.writeFile(outputPcsCsvFile, csv.join("\r\n"), (err) => {});

  let testCaseId = 1;
  let epsTestCaseId = 1;
  let pcsTestCaseId = 1;
  const allTestCases =
    testCaseUserBalancesIn.length * testCaseStableSwapAmountInit.length * testCasePancakeSwapAmountInit.length;
  for (let stableSwapAmountInit of testCaseStableSwapAmountInit) {
    for (let pancakeSwapAmountInit of testCasePancakeSwapAmountInit) {
      for (let userBalancesIn of testCaseUserBalancesIn) {
        it(`[EPS] should run test case PCS (${testCaseId}/${allTestCases}): ${pancakeSwapAmountInit.USDT}/${pancakeSwapAmountInit.BUSD}/${pancakeSwapAmountInit.USDT_to_BUSD_swapAmount} | EPS: ${stableSwapAmountInit[0]}/${stableSwapAmountInit[1]}/${stableSwapAmountInit[2]} | user: ${userBalancesIn[0]}/${userBalancesIn[1]} smoothly`, async () => {
          /// add liquidities to PancakeSwap
          await swapHelper.addLiquidities([
            {
              token0: USDT,
              token1: BUSD,
              amount0desired: pancakeSwapAmountInit.USDT,
              amount1desired: pancakeSwapAmountInit.BUSD,
            },
          ]);

          let reserved_ = await USDT_BUSD.getReserves();
          /// swap to make PCS somewhat unbalanced in order to facilitate variety of test cases
          if (pancakeSwapAmountInit.USDT_to_BUSD_swapAmount > ethers.utils.parseEther("0")) {
            USDT.mint(bobAddress, pancakeSwapAmountInit.USDT_to_BUSD_swapAmount);
            await routerV2AsBob.swapExactTokensForTokens(
              pancakeSwapAmountInit.USDT_to_BUSD_swapAmount,
              0,
              [USDT.address, BUSD.address],
              bobAddress,
              FOREVER
            );
          }
          let reserved = await USDT_BUSD.getReserves();
          let pancakeSwapAmountInit0 = reserved["_reserve0"].toString();
          let pancakeSwapAmountInit1 = reserved["_reserve1"].toString();

          // add liquidities to StableSwap
          await stableSwapAsDeployer.add_liquidity(
            [stableSwapAmountInit[0], stableSwapAmountInit[1], stableSwapAmountInit[2]],
            ethers.BigNumber.from("1")
          );

          /// Mint to Alice
          await USDT.mint(aliceAddress, userBalancesIn[0]);
          await BUSD.mint(aliceAddress, userBalancesIn[1]);

          /// Alice use StrategyAddStableOptimal to find the largest LP amount through StableSwap
          await mockedVault.setMockOwner(aliceAddress);
          await BUSD_asAlice.transfer(
            mockPancakeswapV2Worker_USDT_BUSD_asAlice.address,
            await BUSD.balanceOf(aliceAddress)
          );
          const aliceStratTx = await mockPancakeswapV2Worker_USDT_BUSD_asAlice.work(
            0,
            aliceAddress,
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                addStableStrat.address,
                ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [await USDT.balanceOf(aliceAddress), "0"]),
              ]
            )
          );
          const alice_USDT_BUSD = await USDT_BUSD.balanceOf(mockPancakeswapV2Worker_USDT_BUSD.address);
          /// alice's debris after strategy
          const alice_strat_BUSD = await BUSD.balanceOf(addStableStrat.address);
          const alice_strat_USDT = await USDT.balanceOf(addStableStrat.address);

          const gasUsed = (await aliceStratTx.wait()).gasUsed;

          /// user_x | user_y | eps_x | eps_y | eps_z | pcs_x | pcs_y | gas | optained_LP | debris_x | debris_y
          let data = [
            `[EPS] ${epsTestCaseId},${userBalancesIn[1]},${userBalancesIn[0]},${stableSwapAmountInit[0]},${
              stableSwapAmountInit[2]
            },${
              stableSwapAmountInit[1]
            },${pancakeSwapAmountInit1},${pancakeSwapAmountInit0},${gasUsed},${alice_USDT_BUSD.toString()},${alice_strat_BUSD.toString()},${alice_strat_USDT.toString()}\n`,
          ];
          let csv = data.map((e) => {
            return e.replace(/;/g, ",");
          });
          fs.appendFile(outputEpsCsvFile, csv.join("\r\n"), (err) => {
            console.log(err || "csv appended");
          });

          /// assert
          expect(alice_USDT_BUSD).to.be.gt(0);
          /// assert no debris left (less than 10 * 10^-18 on both sides)
          expect(alice_strat_BUSD).to.be.lt(10);
          expect(alice_strat_USDT).to.be.lt(10);

          epsTestCaseId = epsTestCaseId + 1;
          return;
        }).timeout(200000);

        it(`[PCS] should run test case PCS (${testCaseId}/${allTestCases}): ${pancakeSwapAmountInit.USDT}/${pancakeSwapAmountInit.BUSD}/${pancakeSwapAmountInit.USDT_to_BUSD_swapAmount} | EPS: ${stableSwapAmountInit[0]}/${stableSwapAmountInit[1]}/${stableSwapAmountInit[2]} | user: ${userBalancesIn[0]}/${userBalancesIn[1]} smoothly`, async () => {
          /// add liquidities to PancakeSwap
          await swapHelper.addLiquidities([
            {
              token0: USDT,
              token1: BUSD,
              amount0desired: pancakeSwapAmountInit.USDT,
              amount1desired: pancakeSwapAmountInit.BUSD,
            },
          ]);

          let reserved_ = await USDT_BUSD.getReserves();
          /// swap to make PCS somewhat unbalanced in order to facilitate variety of test cases
          if (pancakeSwapAmountInit.USDT_to_BUSD_swapAmount > ethers.utils.parseEther("0")) {
            USDT.mint(bobAddress, pancakeSwapAmountInit.USDT_to_BUSD_swapAmount);
            await routerV2AsBob.swapExactTokensForTokens(
              pancakeSwapAmountInit.USDT_to_BUSD_swapAmount,
              0,
              [USDT.address, BUSD.address],
              bobAddress,
              FOREVER
            );
          }
          let reserved = await USDT_BUSD.getReserves();
          let pancakeSwapAmountInit0 = reserved["_reserve0"].toString();
          let pancakeSwapAmountInit1 = reserved["_reserve1"].toString();

          // add liquidities to StableSwap
          await stableSwapAsDeployer.add_liquidity(
            [stableSwapAmountInit[0], stableSwapAmountInit[1], stableSwapAmountInit[2]],
            ethers.BigNumber.from("1")
          );

          /// Mint to Alice
          await USDT.mint(aliceAddress, userBalancesIn[0]);
          await BUSD.mint(aliceAddress, userBalancesIn[1]);

          /// Alice use StrategyAddStableOptimal to find the largest LP amount through StableSwap
          await mockedVault.setMockOwner(aliceAddress);
          await BUSD_asAlice.transfer(
            mockPancakeswapV2Worker_USDT_BUSD_asAlice.address,
            await BUSD.balanceOf(aliceAddress)
          );
          const aliceStratTx = await mockPancakeswapV2Worker_USDT_BUSD_asAlice.work(
            0,
            aliceAddress,
            0,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                addStrat.address,
                ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [await USDT.balanceOf(aliceAddress), "0"]),
              ]
            )
          );
          const alice_USDT_BUSD = await USDT_BUSD.balanceOf(mockPancakeswapV2Worker_USDT_BUSD.address);
          /// alice's debris after strategy
          const alice_strat_BUSD = await BUSD.balanceOf(addStableStrat.address);
          const alice_strat_USDT = await USDT.balanceOf(addStableStrat.address);

          const gasUsed = (await aliceStratTx.wait()).gasUsed;

          /// user_x | user_y | eps_x | eps_y | eps_z | pcs_x | pcs_y | gas | optained_LP | debris_x | debris_y
          let data = [
            `[PCS] ${pcsTestCaseId},${userBalancesIn[1]},${userBalancesIn[0]},${stableSwapAmountInit[0]},${
              stableSwapAmountInit[2]
            },${
              stableSwapAmountInit[1]
            },${pancakeSwapAmountInit1},${pancakeSwapAmountInit0},${gasUsed},${alice_USDT_BUSD.toString()},${alice_strat_BUSD.toString()},${alice_strat_USDT.toString()}\n`,
          ];
          let csv = data.map((e) => {
            return e.replace(/;/g, ",");
          });
          fs.appendFile(outputPcsCsvFile, csv.join("\r\n"), (err) => {
            console.log(err || "csv appended");
          });

          pcsTestCaseId = pcsTestCaseId + 1;

          /// assert
          // expect(alice_USDT_BUSD).to.be.gt(0);
          // /// assert no debris left (less than 10 * 10^-18 on both sides)
          // expect(alice_strat_BUSD).to.be.lt(10);
          // expect(alice_strat_USDT).to.be.lt(10);
          return;
        }).timeout(200000);

        testCaseId = testCaseId + 1;
      }
    }
  }
});
