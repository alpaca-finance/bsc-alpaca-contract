import { ethers, network, upgrades, waffle } from "hardhat";
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
  PancakeswapWorker,
  PancakeswapWorker__factory,
  SimpleVaultConfig,
  SimpleVaultConfig__factory,
  StrategyAddTwoSidesOptimal,
  StrategyAddTwoSidesOptimal__factory,
  StrategyLiquidate,
  StrategyLiquidate__factory,
  SyrupBar,
  SyrupBar__factory,
  Vault,
  Vault__factory,
  WETH,
  WETH__factory,
  WNativeRelayer,
  WNativeRelayer__factory,
} from "../../../../../typechain";

chai.use(solidity);
const { expect } = chai;

describe("Pancakeswap - StrategyAddTwoSidesOptimal", () => {
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
  const KILL_TREASURY_BPS = "100";

  /// Pancakeswap-related instance(s)
  let factory: PancakeFactory;
  let router: PancakeRouter;
  let lp: PancakePair;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;
  let cake: CakeToken;
  let syrup: SyrupBar;

  /// Strategy-related instance(s)
  let addStrat: StrategyAddTwoSidesOptimal;
  let liqStrat: StrategyLiquidate;

  /// Vault-related instance(s)
  let config: SimpleVaultConfig;
  let wNativeRelayer: WNativeRelayer;
  let vault: Vault;

  /// FairLaunch-related instance(s)
  let fairLaunch: FairLaunch;
  let alpacaToken: AlpacaToken;

  /// PancakeswapMasterChef-related instance(s)
  let masterChef: PancakeMasterChef;
  let poolId: number;
  let pancakeswapWorker: PancakeswapWorker;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let eve: Signer;

  // Contract Signer
  let addStratAsAlice: StrategyAddTwoSidesOptimal;
  let addStratAsBob: StrategyAddTwoSidesOptimal;

  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let vaultAsAlice: Vault;
  let vaultAsBob: Vault;

  async function fixture() {
    [deployer, alice, bob, eve] = await ethers.getSigners();

    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory("PancakeFactory", deployer)) as PancakeFactory__factory;
    factory = await PancakeFactory.deploy(await deployer.getAddress());
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory("WETH", deployer)) as WETH__factory;
    wbnb = await WBNB.deploy();
    await factory.deployed();

    const PancakeRouter = (await ethers.getContractFactory("PancakeRouter", deployer)) as PancakeRouter__factory;
    router = await PancakeRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

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

    const CakeToken = (await ethers.getContractFactory("CakeToken", deployer)) as CakeToken__factory;
    cake = await CakeToken.deploy();
    await cake.deployed();
    await cake["mint(address,uint256)"](await deployer.getAddress(), ethers.utils.parseEther("100"));

    const SyrupBar = (await ethers.getContractFactory("SyrupBar", deployer)) as SyrupBar__factory;
    syrup = await SyrupBar.deploy(cake.address);
    await syrup.deployed();

    /// Setup BTOKEN-FTOKEN pair on Pancakeswap
    await factory.createPair(farmingToken.address, baseToken.address);
    lp = PancakePair__factory.connect(await factory.getPair(baseToken.address, farmingToken.address), deployer);
    await lp.deployed();

    /// Setup BTOKEN-UNI pair on Pancakeswap
    await factory.createPair(wbnb.address, farmingToken.address);

    // Setup FairLaunch contract
    // Deploy ALPACAs
    const AlpacaToken = (await ethers.getContractFactory("AlpacaToken", deployer)) as AlpacaToken__factory;
    alpacaToken = await AlpacaToken.deploy(132, 137);
    await alpacaToken.deployed();

    const FairLaunch = (await ethers.getContractFactory("FairLaunch", deployer)) as FairLaunch__factory;
    fairLaunch = await FairLaunch.deploy(
      alpacaToken.address,
      await alice.getAddress(),
      ALPACA_REWARD_PER_BLOCK,
      0,
      ALPACA_BONUS_LOCK_UP_BPS,
      0
    );
    await fairLaunch.deployed();

    await alpacaToken.transferOwnership(fairLaunch.address);

    // Config & Deploy Vault ibBTOKEN
    // Create a new instance of BankConfig & Vault
    const WNativeRelayer = (await ethers.getContractFactory("WNativeRelayer", deployer)) as WNativeRelayer__factory;
    wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
    await wNativeRelayer.deployed();

    const SimpleVaultConfig = (await ethers.getContractFactory(
      "SimpleVaultConfig",
      deployer
    )) as SimpleVaultConfig__factory;
    config = (await upgrades.deployProxy(SimpleVaultConfig, [
      MIN_DEBT_SIZE,
      INTEREST_RATE,
      RESERVE_POOL_BPS,
      KILL_PRIZE_BPS,
      wbnb.address,
      wNativeRelayer.address,
      fairLaunch.address,
      KILL_TREASURY_BPS,
      await eve.getAddress(),
    ])) as SimpleVaultConfig;
    await config.deployed();

    const DebtToken = (await ethers.getContractFactory("DebtToken", deployer)) as DebtToken__factory;
    const debtToken = (await upgrades.deployProxy(DebtToken, [
      "debtibBTOKEN_V2",
      "debtibBTOKEN_V2",
      18,
      await deployer.getAddress(),
    ])) as DebtToken;
    await debtToken.deployed();

    const Vault = (await ethers.getContractFactory("Vault", deployer)) as Vault__factory;
    vault = (await upgrades.deployProxy(Vault, [
      config.address,
      baseToken.address,
      "Interest Bearing BTOKEN",
      "ibBTOKEN",
      18,
      debtToken.address,
    ])) as Vault;
    await vault.deployed();

    await wNativeRelayer.setCallerOk([vault.address], true);

    // Transfer ownership to vault
    await debtToken.setOkHolders([vault.address, fairLaunch.address], true);
    await debtToken.transferOwnership(vault.address);

    // Set add FairLaunch poool and set fairLaunchPoolId for Vault
    await fairLaunch.addPool(1, await vault.debtToken(), false);
    await vault.setFairLaunchPoolId(0);

    /// Setup strategy
    const StrategyAddTwoSidesOptimal = (await ethers.getContractFactory(
      "StrategyAddTwoSidesOptimal",
      deployer
    )) as StrategyAddTwoSidesOptimal__factory;
    addStrat = (await upgrades.deployProxy(StrategyAddTwoSidesOptimal, [
      router.address,
      vault.address,
    ])) as StrategyAddTwoSidesOptimal;
    await addStrat.deployed();

    const StrategyLiquidate = (await ethers.getContractFactory(
      "StrategyLiquidate",
      deployer
    )) as StrategyLiquidate__factory;
    liqStrat = (await upgrades.deployProxy(StrategyLiquidate, [router.address])) as StrategyLiquidate;
    await liqStrat.deployed();

    /// Setup MasterChef
    const PancakeMasterChef = (await ethers.getContractFactory(
      "PancakeMasterChef",
      deployer
    )) as PancakeMasterChef__factory;
    masterChef = await PancakeMasterChef.deploy(
      cake.address,
      syrup.address,
      await deployer.getAddress(),
      CAKE_REWARD_PER_BLOCK,
      0
    );
    await masterChef.deployed();
    // Transfer ownership so masterChef can mint CAKE
    await cake.transferOwnership(masterChef.address);
    await syrup.transferOwnership(masterChef.address);
    // Add lp to masterChef's pool
    await masterChef.add(1, lp.address, false);

    /// Setup PancakeswapWorker
    poolId = 1;
    const PancakeswapWorker = (await ethers.getContractFactory(
      "PancakeswapWorker",
      deployer
    )) as PancakeswapWorker__factory;
    pancakeswapWorker = (await upgrades.deployProxy(PancakeswapWorker, [
      vault.address,
      baseToken.address,
      masterChef.address,
      router.address,
      poolId,
      addStrat.address,
      liqStrat.address,
      REINVEST_BOUNTY_BPS,
    ])) as PancakeswapWorker;
    await pancakeswapWorker.deployed();
    await config.setWorker(pancakeswapWorker.address, true, true, WORK_FACTOR, KILL_FACTOR, true, true);

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

    // Deployer adds 0.1 CAKE + 1 NATIVE
    await cake.approve(router.address, ethers.utils.parseEther("1"));
    await router.addLiquidityETH(
      cake.address,
      ethers.utils.parseEther("0.1"),
      "0",
      "0",
      await deployer.getAddress(),
      FOREVER,
      { value: ethers.utils.parseEther("1") }
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

    // Contract signer
    addStratAsAlice = StrategyAddTwoSidesOptimal__factory.connect(addStrat.address, alice);
    addStratAsBob = StrategyAddTwoSidesOptimal__factory.connect(addStrat.address, bob);

    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    vaultAsAlice = Vault__factory.connect(vault.address, alice);
    vaultAsBob = Vault__factory.connect(vault.address, bob);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  it("should revert when strategy execution is not in the scope", async () => {
    await expect(
      addStratAsBob.execute(
        await bob.getAddress(),
        "0",
        ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "uint256", "uint256"],
          [baseToken.address, farmingToken.address, "0", "0"]
        )
      )
    ).to.be.revertedWith("not within execution scope");
  });

  it("should revert on bad calldata", async () => {
    // Deployer deposits 3 BTOKEN to the vault
    await baseToken.approve(vault.address, ethers.utils.parseEther("3"));
    await vault.deposit(ethers.utils.parseEther("3"));

    // Now Alice leverage 2x on her 1 BTOKEN.
    // So totally Alice will take 1 BTOKEN from the pool and 1 BTOKEN from her pocket to
    // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
    await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
    await expect(
      vaultAsAlice.work(
        0,
        pancakeswapWorker.address,
        ethers.utils.parseEther("1"),
        ethers.utils.parseEther("1"),
        "0",
        ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [addStrat.address, "0x1234"])
      )
    ).to.be.reverted;
  });

  it("should convert all BTOKEN to LP tokens at best rate", async () => {
    // Deployer deposits 3 BTOKEN to the vault
    await baseToken.approve(vault.address, ethers.utils.parseEther("3"));
    await vault.deposit(ethers.utils.parseEther("3"));

    // Now Alice leverage 2x on her 0.05 BTOKEN.
    // So totally Alice will take 0.05 BTOKEN from the pool and 0.05 BTOKEN from her pocket to
    // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
    // However, this time Alice use StrategyAddTwoSides without providing farmingToken
    await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
    await vaultAsAlice.work(
      0,
      pancakeswapWorker.address,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("1"),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [
          addStrat.address,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "address", "uint256", "uint256"],
            [baseToken.address, farmingToken.address, ethers.utils.parseEther("0"), ethers.utils.parseEther("0.01")]
          ),
        ]
      )
    );

    const masterChefLPBalanceRound1 = await lp.balanceOf(masterChef.address);
    expect(masterChefLPBalanceRound1).to.be.above(ethers.utils.parseEther("0"));
    expect(await lp.balanceOf(addStrat.address)).to.be.eq("0");
    expect(await farmingToken.balanceOf(addStrat.address)).to.be.below(MAX_ROUNDING_ERROR);

    // Now Alice leverage 2x on her 0.1 BTOKEN.
    // So totally Alice will take 0.1 BTOKEN from the pool and 0.1 BTOKEN from her pocket to
    // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
    // However, this time Alice use StrategyAddTwoSides without providing any farmingToken
    await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
    await vaultAsAlice.work(
      0,
      pancakeswapWorker.address,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("1"),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [
          addStrat.address,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "address", "uint256", "uint256"],
            [baseToken.address, farmingToken.address, ethers.utils.parseEther("0"), ethers.utils.parseEther("0.1")]
          ),
        ]
      )
    );

    expect(await lp.balanceOf(masterChef.address)).to.be.above(masterChefLPBalanceRound1);
    expect(await lp.balanceOf(addStrat.address)).to.be.equal("0");
    expect(await farmingToken.balanceOf(addStrat.address)).to.be.below(MAX_ROUNDING_ERROR * 2);
  });

  it("should convert some BTOKEN and some FTOKEN to LP tokens at best rate", async () => {
    // Deployer deposits 3 BTOKEN to the vault
    await baseToken.approve(vault.address, ethers.utils.parseEther("3"));
    await vault.deposit(ethers.utils.parseEther("3"));

    // Now Alice leverage 2x on her 1 BTOKEN.
    // So totally Alice will take 1 BTOKEN from the pool and 1 BTOKEN from her pocket to
    // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
    // However, this time Alice use StrategyAddTwoSides + farmingToken
    await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
    await farmingTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
    await vaultAsAlice.work(
      0,
      pancakeswapWorker.address,
      ethers.utils.parseEther("0.1"),
      ethers.utils.parseEther("0"),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [
          addStrat.address,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "address", "uint256", "uint256"],
            [baseToken.address, farmingToken.address, ethers.utils.parseEther("0.05"), ethers.utils.parseEther("0.01")]
          ),
        ]
      )
    );

    const stakingLPBalanceRound1 = await lp.balanceOf(masterChef.address);
    expect(stakingLPBalanceRound1).to.be.above(ethers.utils.parseEther("0"));
    expect(await lp.balanceOf(addStrat.address)).to.be.eq("0");
    expect(await farmingToken.balanceOf(addStrat.address)).to.be.below(MAX_ROUNDING_ERROR);

    // Now Alice leverage 2x on her 1 BTOKEN.
    // So totally Alice will take 1 BTOKEN from the pool and 1 BTOKEN from her pocket to
    // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
    // However, this time Alice use StrategyAddTwoSides + farmingToken
    await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
    await farmingTokenAsAlice.approve(vault.address, ethers.utils.parseEther("1"));
    await vaultAsAlice.work(
      0,
      pancakeswapWorker.address,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("1"),
      "0",
      ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [
          addStrat.address,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "address", "uint256", "uint256"],
            [baseToken.address, farmingToken.address, ethers.utils.parseEther("1"), ethers.utils.parseEther("0.1")]
          ),
        ]
      )
    );

    expect(await lp.balanceOf(masterChef.address)).to.be.above(stakingLPBalanceRound1);
    expect(await lp.balanceOf(addStrat.address)).to.be.equal("0");
    expect(await farmingToken.balanceOf(addStrat.address)).to.be.below(MAX_ROUNDING_ERROR * 2);
  });
});
