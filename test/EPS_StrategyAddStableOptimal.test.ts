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
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm,
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm__factory,
  PancakeswapV2Worker02,
  StrategyAddStableOptimal,
  StrategyAddStableOptimal__factory,
  StrategyLiquidate,
  SyrupBar,
  Vault,
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
  BEP20__factory,
  BEP20,
  MockERC20__factory,
} from "../typechain";
import { DeployHelper } from "./helpers/deploy";
import { SwapHelper } from "./helpers/swap";
import assert from 'assert';
import * as TestHelpers from "./helpers/assert";

chai.use(solidity);
const { expect } = chai;

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
  let mockedVault_BUSD: MockVaultForStrategy;
  let mockedVault_USDT: MockVaultForStrategy;

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

  /// Strategy-related instance(s)
  let addStableStrat: StrategyAddStableOptimal;
  let addStrat: PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm;

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

  // Contract Signer
  let addStableStratAsDeployer: StrategyAddStableOptimal;
  let addStableStratAsAlice: StrategyAddStableOptimal;
  let addStableStratAsBob: StrategyAddStableOptimal;
  let addStratAsDeployer: PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm;
  let addStratAsAlice: PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm;
  let addStratAsBob: PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm;

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

  beforeEach(async () => {
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
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("1000000000") },
        ],
      },
      {
        name: "USDC",
        symbol: "USDC",
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("1000000000") },
        ],
      },
      {
        name: "USDT",
        symbol: "USDT",
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("1000000000") },
        ],
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
        amount0desired: ethers.utils.parseEther("200000000"),
        amount1desired: ethers.utils.parseEther("200000000"),
      },
      {
        token0: USDC,
        token1: USDT,
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
      1500, // A
      4000000, // fee
      5000000000, // admin fee
      stableFeeConverter.address
    );
    await stableLPToken.set_minter(stableSwap.address);
    // Setup Vault
    const MockVaultForStrategy = (await ethers.getContractFactory(
      "MockVaultForStrategy",
      deployer
    )) as MockVaultForStrategy__factory;
    mockedVault_BUSD = (await upgrades.deployProxy(MockVaultForStrategy)) as MockVaultForStrategy;
    await mockedVault_BUSD.deployed();
    mockedVault_USDT = (await upgrades.deployProxy(MockVaultForStrategy)) as MockVaultForStrategy;
    await mockedVault_USDT.deployed();

    // Setup StrategyAddStableOptimal strategy
    const StrategyAddStableOptimal = (await ethers.getContractFactory(
      "StrategyAddStableOptimal",
      deployer
    )) as StrategyAddStableOptimal__factory;
    addStableStrat = (await upgrades.deployProxy(StrategyAddStableOptimal, [
      stableSwap.address,
      routerV2.address,
      mockedVault_BUSD.address,
      [BUSD.address, USDC.address, USDT.address],
    ])) as StrategyAddStableOptimal;
    await addStableStrat.deployed();

    // Setup PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm strategy
    const PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm",
      deployer
    )) as PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm__factory;
    addStrat = await upgrades.deployProxy(PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm, [routerV2.address, mockedVault_BUSD.address]) as PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm
    await addStrat.deployed();

    /// Setup MockPancakeswapV2Worker
    const MockPancakeswapV2Worker = (await ethers.getContractFactory(
      "MockPancakeswapV2Worker",
      deployer
    )) as MockPancakeswapV2Worker__factory;
    mockPancakeswapV2Worker_USDT_BUSD = (await MockPancakeswapV2Worker.deploy(
      USDT_BUSD.address,
      BUSD.address,
      USDT.address,
    )) as MockPancakeswapV2Worker;
    await mockPancakeswapV2Worker_USDT_BUSD.deployed();
    mockPancakeswapV2Worker_USDC_USDT = (await MockPancakeswapV2Worker.deploy(
      USDC_USDT.address,
      USDT.address,
      USDC.address,
    )) as MockPancakeswapV2Worker;
    await mockPancakeswapV2Worker_USDC_USDT.deployed();
    mockPancakeswapV2Worker_USDC_BUSD = (await MockPancakeswapV2Worker.deploy(
      USDC_BUSD.address,
      BUSD.address,
      USDT.address,
    )) as MockPancakeswapV2Worker;
    await mockPancakeswapV2Worker_USDC_BUSD.deployed();

    /// Contract signer (workers)
    mockPancakeswapV2Worker_USDT_BUSD_asAlice = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker_USDT_BUSD.address, alice);
    mockPancakeswapV2Worker_USDC_USDT_asAlice = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker_USDC_USDT.address, alice);  
    mockPancakeswapV2Worker_USDC_BUSD_asAlice = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker_USDC_BUSD.address, alice);
    mockPancakeswapV2Worker_USDT_BUSD_asBob = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker_USDT_BUSD.address, bob);
    mockPancakeswapV2Worker_USDC_USDT_asBob = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker_USDC_USDT.address, bob);  
    mockPancakeswapV2Worker_USDC_BUSD_asBob = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker_USDC_BUSD.address, bob);

    // Contract signer (Strategies)
    addStableStratAsDeployer = StrategyAddStableOptimal__factory.connect(addStableStrat.address, deployer);
    addStableStratAsAlice = StrategyAddStableOptimal__factory.connect(addStableStrat.address, alice);
    addStableStratAsBob = StrategyAddStableOptimal__factory.connect(addStableStrat.address, bob);
    addStratAsDeployer = PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm__factory.connect(addStrat.address, deployer);
    addStratAsAlice = PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm__factory.connect(addStrat.address, alice);
    addStratAsBob = PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm__factory.connect(addStrat.address, bob);

    // set worker Ok
    await addStratAsDeployer.setWorkersOk([mockPancakeswapV2Worker_USDT_BUSD.address], true);
    await addStratAsDeployer.setWorkersOk([mockPancakeswapV2Worker_USDC_BUSD.address], true);
    await addStratAsDeployer.setWorkersOk([mockPancakeswapV2Worker_USDC_USDT.address], true);

    /// Contract signer (EPS)
    stableSwapAsDeployer = StableSwap__factory.connect(stableSwap.address, deployer);
    stableSwapAsBob = StableSwap__factory.connect(stableSwap.address, bob);
    stableSwapAsAlice = StableSwap__factory.connect(stableSwap.address, alice);
    for (let address of [routerV2.address, stableSwap.address, mockedVault_BUSD.address]) {
      console.log('approving', address)
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

    /// deployer add LP to StableSwap pool $150M USD each
    await stableSwapAsDeployer.add_liquidity(
      [
        ethers.utils.parseEther("200000000"),
        ethers.utils.parseEther("200000000"),
        ethers.utils.parseEther("200000000"),
      ],
      ethers.BigNumber.from("1")
    );
  });

  function getFractionOfBigNumber(input: BigNumber, nom: Number, denom: Number) {
    return input.mul(ethers.utils.parseEther(nom.toString())).div(ethers.utils.parseEther(denom.toString()));
  }

  it("should swap stable coins at a fairly good ratio", async () => {
    let amount_BUSD = ethers.utils.parseEther("1000");
    let amount_USDT = ethers.utils.parseEther("1000");
    let amount_USDC = ethers.utils.parseEther("1000");

    // mint to Bob
    BUSD.mint(bobAddress, ethers.utils.parseEther(amount_BUSD.toString()));
    USDT.mint(aliceAddress, ethers.utils.parseEther(amount_USDT.toString()));
    USDC.mint(aliceAddress, ethers.utils.parseEther(amount_USDC.toString()));

    /// Bob has 1000 BUSD, 1000 USDC
    const preSwapBal_BUSD = await BUSD.balanceOf(bobAddress);
    const preSwapBal_USDC = await USDC.balanceOf(bobAddress);

    /// Preswap 
    let amountIn_BUSD: BigNumber = ethers.utils.parseEther("700")
    let expectedPostSwapBal_BUSD: BigNumber = ethers.utils.parseEther("300");
    let expectedMinAmountOut_USDC: BigNumber = getFractionOfBigNumber(amountIn_BUSD, 999, 1000); // slippageTolerance = 0.1%
    /// Swap (700 BUSD) to (700 USDC) on StableSwap
    await stableSwapAsBob.exchange(idx_BUSD, idx_USDC, amountIn_BUSD, expectedMinAmountOut_USDC);
    /// Postswap
    const postSwapBal_BUSD:BigNumber = await BUSD.balanceOf(bobAddress);
    const postSwapBal_USDC:BigNumber = await USDC.balanceOf(bobAddress);
    let actualAmountOut_USDC:BigNumber = postSwapBal_USDC.sub(preSwapBal_USDC);

    /// assert
    expect(postSwapBal_BUSD).to.be.eq(expectedPostSwapBal_BUSD)
    expect(actualAmountOut_USDC).to.be.lte(amountIn_BUSD)
    expect(actualAmountOut_USDC).to.be.gte(expectedMinAmountOut_USDC)
  }); 

  it("should show StableSwap gives a better rate than PancakeSwap", async () => {
    let amount_BUSD = ethers.utils.parseEther("1000");
    let amount_USDT = ethers.utils.parseEther("1000");
    let amount_USDC = ethers.utils.parseEther("1000");

    // mint to Bob
    BUSD.mint(bobAddress, ethers.utils.parseEther(amount_BUSD.toString()));
    USDT.mint(aliceAddress, ethers.utils.parseEther(amount_USDT.toString()));
    USDC.mint(aliceAddress, ethers.utils.parseEther(amount_USDC.toString()));

    /// Bob has 1000 BUSD, 1000 USDC
    let preSwapBal_USDC = await USDC.balanceOf(bobAddress);

    /// Preswap 
    let amountIn_BUSD: BigNumber = ethers.utils.parseEther("500")
    let expectedMinAmountOut_USDC: BigNumber = getFractionOfBigNumber(amountIn_BUSD, 999, 1000); // slippageTolerance = 0.1%
    /// Swap (500 BUSD) to (500 USDC) on StableSwap
    await stableSwapAsBob.exchange(idx_BUSD, idx_USDC, amountIn_BUSD, expectedMinAmountOut_USDC);
    let stableSwapAmountOut_USDC:BigNumber = (await USDC.balanceOf(bobAddress)).sub(preSwapBal_USDC);
    let prePancakeSwapBal_USDC = await USDC.balanceOf(bobAddress);
    /// Swap (500 BUSD) to (500 USDC) on PancakeSwap
    await routerV2AsBob.swapExactTokensForTokens(amountIn_BUSD, 0, [BUSD.address, USDC.address], bobAddress, FOREVER);
    let pancakeSwapAmountOut_USDC:BigNumber = (await USDC.balanceOf(bobAddress)).sub(prePancakeSwapBal_USDC);
    /// Postswap
    const postSwapBal_BUSD:BigNumber = await BUSD.balanceOf(bobAddress);
    const postSwapBal_USDC:BigNumber = await USDC.balanceOf(bobAddress);

    /// assert
    expect(postSwapBal_BUSD).to.be.eq(0)
    expect(stableSwapAmountOut_USDC).to.be.gt(pancakeSwapAmountOut_USDC)
  });

  it("should gives a larger LP to Alice when use StrategyAddStableOptimal than normal human can think of", async () => {
    let amountIn_BUSD = 300;
    let amountIn_USDT = 200;

    // mint to Alice
    await BUSD.mint(aliceAddress, ethers.utils.parseEther(amountIn_BUSD.toString()));
    await USDT.mint(aliceAddress, ethers.utils.parseEther(amountIn_USDT.toString()));

    // Alice use StrategyAddStableOptimal to find the largest LP amount through StableSwap
    await mockedVault_BUSD.setMockOwner(aliceAddress);
    await BUSD_asAlice.transfer(mockPancakeswapV2Worker_USDT_BUSD_asAlice.address, await BUSD.balanceOf(aliceAddress))
    await mockPancakeswapV2Worker_USDT_BUSD_asAlice.work(0, aliceAddress, 0, 
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes'],
        [addStableStrat.address, ethers.utils.defaultAbiCoder.encode(
          ['uint256','uint256'],
          [await USDT.balanceOf(aliceAddress), '0']
        )],
    ));
    // await mockPancakeswapV2Worker_USDT_BUSD.approve(aliceAddress, ethers.constants.MaxUint256);
    // USDT_BUSD.transferFrom(mockPancakeswapV2Worker_USDT_BUSD.address, aliceAddress, await USDT_BUSD.balanceOf(mockPancakeswapV2Worker_USDT_BUSD.address))
    console.log('USDT_BUSD', (await USDT_BUSD.totalSupply()).toString());
    console.log('Alice has USDT_BUSD =', (await USDT_BUSD.balanceOf(mockPancakeswapV2Worker_USDT_BUSD.address)).toString());
    // LP from swap = 249.989997995434363189
    // LP work has = 249.989997995434363189
    // LP total supp = 200000249.989997995434363189

    //factoryV2.getPair(await USDT.address, await BUSD.address)

    // USDT_BUSD = PancakePair__factory.connect(await factoryV2.getPair(USDT.address, BUSD.address), deployer);
    // USDC_USDT = PancakePair__factory.connect(await factoryV2.getPair(USDT.address, USDC.address), deployer);
    // USDC_BUSD = PancakePair__factory.connect(await factoryV2.getPair(BUSD.address, USDC.address), deployer);

    // const USDT_BUSD_total_supply = await USDT_BUSD.totalSupply();
    // const USDC_USDT_total_supply = await USDC_USDT.totalSupply();
    // const USDC_BUSD_total_supply = await USDC_BUSD.totalSupply();

    // const USDT_BUSD_reserve_PAIR = await USDT_BUSD.getReserves();
    // const USDC_USDT_reserve_PAIR = await USDC_USDT.getReserves();
    // const USDC_BUSD_reserve_PAIR = await USDC_BUSD.getReserves();

    // const USDT_token_amount_USDT_BUSD_PAIR = USDT_BUSD_reserve_PAIR["_reserve0"];
    // const BUSD_token_amount_USDT_BUSD_PAIR = USDT_BUSD_reserve_PAIR["_reserve1"];
  
    /// test simple pancake scenario 
    let amountIn_USDC = 200;
    // mint to Bob
    await BUSD.mint(bobAddress, ethers.utils.parseEther(amountIn_BUSD.toString()));
    await USDC.mint(bobAddress, ethers.utils.parseEther(amountIn_USDC.toString()));
    console.log('Before swap')
    console.log('Bob\'s BUSD', (await BUSD.balanceOf(bobAddress)).toString());
    console.log('Bob\'s USDC', (await USDC.balanceOf(bobAddress)).toString());
    // Bob think he should swap 50 BUSD to 50 USDC so he would have a balance assets for LP
    await routerV2AsBob.swapExactTokensForTokens(ethers.utils.parseEther('50'), 0, [BUSD.address, USDC.address], bobAddress, FOREVER);
    console.log('After swap')
    console.log('Bob\'s BUSD', (await BUSD.balanceOf(bobAddress)).toString());
    console.log('Bob\'s USDC', (await USDC.balanceOf(bobAddress)).toString());
    await mockedVault_BUSD.setMockOwner(bobAddress);
    await BUSD_asBob.transfer(mockPancakeswapV2Worker_USDC_BUSD_asBob.address, await BUSD.balanceOf(bobAddress));
    console.log('Transferred all...')
    await mockPancakeswapV2Worker_USDC_BUSD_asBob.work(0, bobAddress, 0, 
      ethers.utils.defaultAbiCoder.encode(
      ['address', 'bytes'],
      [addStrat.address, ethers.utils.defaultAbiCoder.encode(
        ['uint256'],
        ['0']
      )],
    ))
    console.log('USDC_BUSD', (await USDC_BUSD.totalSupply()).toString());
    console.log('Bob has USDC_BUSD =', (await USDC_BUSD.balanceOf(mockPancakeswapV2Worker_USDC_BUSD_asBob.address)).toString());
  });
});
