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
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
  PancakeswapV2Worker02,
  StrategyAddStableOptimal,
  StrategyAddStableOptimal__factory,
  StrategyLiquidate,
  SyrupBar,
  Vault,
  WNativeRelayer,
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
} from "../typechain";
import { DeployHelper } from "./helpers/deploy";

chai.use(solidity);
const { expect } = chai;

describe("EPS - StrategyAddStableOptimal", () => {
  const FOREVER = "2000000000";
  const MAX_ROUNDING_ERROR = Number("15");
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther("0.076");
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther("5000");
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const REINVEST_BOUNTY_BPS = "100"; // 1% reinvest bounty
  const RESERVE_POOL_BPS = "1000"; // 10% reserve pool
  const KILL_PRIZE_BPS = "1000"; // 10% Kill prize
  const INTEREST_RATE = "3472222222222"; // 30% per year
  const MIN_DEBT_SIZE = "1";
  const WORK_FACTOR = "7000";
  const KILL_FACTOR = "8000";
  const MAX_REINVEST_BOUNTY: string = "500";
  const DEPLOYER = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";
  const BENEFICIALVAULT_BOUNTY_BPS = "1000";
  const REINVEST_THRESHOLD = ethers.utils.parseEther("1"); // If pendingCake > 1 $CAKE, then reinvest
  const KILL_TREASURY_BPS = "100";
  const POOL_ID = 1;

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
  let mockPancakeswapV2Worker_USDT_BUSD_AsBob: MockPancakeswapV2Worker;
  let mockPancakeswapV2Worker_USDC_USDT_AsBob: MockPancakeswapV2Worker;
  let mockPancakeswapV2Worker_USDC_BUSD_AsBob: MockPancakeswapV2Worker;

  /// StableSwap related instance(s)
  let stableLPToken: Token;
  let stableFeeConverter: FeeConverter;
  let stableSwap: StableSwap;

  /// Strategy-related instance(s)
  let addStrat: PancakeswapV2RestrictedStrategyAddBaseTokenOnly;
  let addStableStrat: StrategyAddStableOptimal;
  let liqStrat: StrategyLiquidate;

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
  let addStratAsAlice: StrategyAddStableOptimal;
  let addStratAsBob: StrategyAddStableOptimal;

  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let vaultAsAlice: Vault;
  let vaultAsBob: Vault;

  beforeEach(async () => {
    [deployer, alice, bob, eve] = await ethers.getSigners();
    const deployHelper = new DeployHelper(deployer);

  // █▀█ ▄▀█ █▄░█ █▀▀ ▄▀█ █▄▀ █▀▀ █▀ █░█░█ ▄▀█ █▀█
  // █▀▀ █▀█ █░▀█ █▄▄ █▀█ █░█ ██▄ ▄█ ▀▄▀▄▀ █▀█ █▀▀

    // Setup Pancakeswap
    wbnb = await deployHelper.deployWBNB();
    [factoryV2, routerV2, cake, syrup, masterChef] = await deployHelper.deployPancakeV2(wbnb, CAKE_REWARD_PER_BLOCK, [
      { address: deployerAddress, amount: ethers.utils.parseEther("100") },
    ]);

    /// Setup token stuffs
    [BUSD, USDC, USDT] = await deployHelper.deployBEP20([
      {
        name: "BUSD",
        symbol: "BUSD",
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("1000") },
          { address: aliceAddress, amount: ethers.utils.parseEther("1000") },
          { address: bobAddress, amount: ethers.utils.parseEther("1000") },
        ],
      },
      {
        name: "USDC",
        symbol: "USDC",
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("1000") },
          { address: aliceAddress, amount: ethers.utils.parseEther("1000") },
          { address: bobAddress, amount: ethers.utils.parseEther("1000") },
        ],
      },
      {
        name: "USDT",
        symbol: "USDT",
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("1000") },
          { address: aliceAddress, amount: ethers.utils.parseEther("1000") },
          { address: bobAddress, amount: ethers.utils.parseEther("1000") },
        ],
      },
    ]);

    /// Setup all stable pool pairs on Pancakeswap
    await factoryV2.createPair(BUSD.address, USDT.address);
    USDT_BUSD = PancakePair__factory.connect(await factoryV2.getPair(USDT.address, BUSD.address), deployer);
    await USDT_BUSD.deployed();

    await factoryV2.createPair(USDC.address, USDT.address);
    USDC_USDT = PancakePair__factory.connect(await factoryV2.getPair(USDC.address, USDT.address), deployer);
    await USDC_USDT.deployed();

    await factoryV2.createPair(BUSD.address, USDT.address);
    USDC_BUSD = PancakePair__factory.connect(await factoryV2.getPair(BUSD.address, USDC.address), deployer);
    await USDC_BUSD.deployed();

    // Add LPs on PancakeSwap
    await masterChef.add(1, USDT_BUSD.address, false);
    await masterChef.add(1, USDC_USDT.address, false);
    await masterChef.add(1, USDC_BUSD.address, false);

    // Setup Vault
    const MockVaultForStrategy =  (await ethers.getContractFactory(
      "MockVaultForStrategy",
      deployer
    )) as MockVaultForStrategy__factory;
    mockedVault_BUSD = await upgrades.deployProxy(MockVaultForStrategy) as MockVaultForStrategy;
    await mockedVault_BUSD.deployed();
    mockedVault_USDT = await upgrades.deployProxy(MockVaultForStrategy) as MockVaultForStrategy;
    await mockedVault_USDT.deployed();

    // Setup Strategy
    const StrategyAddStableOptimal = (await ethers.getContractFactory(
      "StrategyAddStableOptimal",
      deployer
    )) as StrategyAddStableOptimal__factory;
    addStableStrat = (await upgrades.deployProxy(StrategyAddStableOptimal, [
      routerV2.address,
      mockedVault_BUSD.address,
    ])) as StrategyAddStableOptimal;
    await addStableStrat.deployed();
    // TODO: Should another addStableStrat for mockedVault_USDT follows here?
    // ...

    /// Setup MockPancakeswapV2Worker
    const MockPancakeswapV2Worker = (await ethers.getContractFactory(
      "MockPancakeswapV2Worker",
      deployer,
    )) as MockPancakeswapV2Worker__factory;
    mockPancakeswapV2Worker_USDT_BUSD = await MockPancakeswapV2Worker.deploy(USDT_BUSD.address, USDT.address, BUSD.address) as MockPancakeswapV2Worker
    await mockPancakeswapV2Worker_USDT_BUSD.deployed();
    mockPancakeswapV2Worker_USDC_USDT = await MockPancakeswapV2Worker.deploy(USDC_USDT.address, USDC.address, USDT.address) as MockPancakeswapV2Worker
    await mockPancakeswapV2Worker_USDC_USDT.deployed();
    mockPancakeswapV2Worker_USDC_BUSD = await MockPancakeswapV2Worker.deploy(USDT_BUSD.address, USDT.address, BUSD.address) as MockPancakeswapV2Worker
    await mockPancakeswapV2Worker_USDC_BUSD.deployed();

    await BUSD.approve(routerV2.address, ethers.utils.parseEther("-1"));
    await USDC.approve(routerV2.address, ethers.utils.parseEther("-1"));
    await USDT.approve(routerV2.address, ethers.utils.parseEther("-1"));

    // Deployer adds 1,000 USDT + 1,000 BUSD
    await routerV2.addLiquidity(
      USDT.address,
      BUSD.address,
      ethers.utils.parseEther("1000"),
      ethers.utils.parseEther("1000"),
      "0",
      "0",
      await deployer.getAddress(),
      FOREVER
    );

    // Deployer adds 1,000 USDC + 1,000 USDT
    await routerV2.addLiquidity(
      USDC.address,
      USDT.address,
      ethers.utils.parseEther("1000"),
      ethers.utils.parseEther("1000"),
      "0",
      "0",
      await deployer.getAddress(),
      FOREVER
    );

    // Deployer adds 1,000 USDT + 1,000 BUSD
    await routerV2.addLiquidity(
      USDT.address,
      BUSD.address,
      ethers.utils.parseEther("1000"),
      ethers.utils.parseEther("1000"),
      "0",
      "0",
      await deployer.getAddress(),
      FOREVER
    );
    
    /// Contract signer
    mockPancakeswapV2Worker_USDT_BUSD_AsBob = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker_USDT_BUSD.address, bob);
    mockPancakeswapV2Worker_USDC_USDT_AsBob = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker_USDC_USDT.address, bob);
    mockPancakeswapV2Worker_USDC_BUSD_AsBob = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker_USDC_BUSD.address, bob);

    // █▀ ▀█▀ ▄▀█ █▄▄ █░░ █▀▀ █▀ █░█░█ ▄▀█ █▀█
    // ▄█ ░█░ █▀█ █▄█ █▄▄ ██▄ ▄█ ▀▄▀▄▀ █▀█ █▀▀

    // deploy StableToken (EPS)
    const StableLPToken = (await ethers.getContractFactory(
      "Token",
      deployer
    )) as Token__factory;
    stableLPToken = await StableLPToken.deploy("Ellipsis.finance BUSD/USDC/USDT", "3EPS", 0);

    // deploy StableFeeConverter (EPS)
    const StableFeeConverter = (await ethers.getContractFactory(
      "FeeConverter",
      deployer
    )) as FeeConverter__factory;
    stableFeeConverter = await StableFeeConverter.deploy();

    // deploy StableSwap (EPS)
    const StableSwap = (await ethers.getContractFactory(
      "StableSwap",
      deployer
    )) as StableSwap__factory;
    stableSwap = await StableSwap.deploy(
      deployerAddress,
      [
        BUSD.address,
        USDC.address,
        USDT.address
      ], 
      stableLPToken.address,
      1500, // A
      4000000, // fee
      5000000000, // admin fee
      stableFeeConverter.address
    )

    // const StableSwap = await ethers.getContractFactory("StableSwap");
    // const stableSwap = await StableSwap.deploy(deployerAddress,
    //   [
    //     BUSD.address,
    //     USDC.address,
    //     USDT.address
    //   ], 
    //   stableLPToken.address,
    //   1500, // A
    //   4000000, // fee
    //   5000000000, // admin fee
    //   stableFeeConverter.address
    // );
  });

  // test cases go here...
  // it("should ...", async () => {
  //   await expect(
  //     addStra.execute(
  //       await bob.getAddress(),
  //       "0",
  //       ethers.utils.defaultAbiCoder.encode(
  //         ["address", "address", "uint256", "uint256"],
  //         [baseToken.address, farmingToken.address, "0", "0"]
  //       )
  //     )
  //   ).to.be.revertedWith("not within execution scope");
  // });

  // expect(await lp.balanceOf(masterChef.address)).to.be.bignumber.above(stakingLPBalanceRound1);
  // expect(await lp.balanceOf(addStrat.address)).to.be.bignumber.equal("0");
  // expect(await farmingToken.balanceOf(addStrat.address)).to.be.bignumber.below(MAX_ROUNDING_ERROR * 2);
});
