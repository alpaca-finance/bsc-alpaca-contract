import { ethers, network, upgrades, waffle } from "hardhat";
import { constants, BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  AlpacaToken,
  CakeToken,
  DebtToken,
  FairLaunch,
  FairLaunch__factory,
  MockContractContext,
  MockContractContext__factory,
  MockERC20,
  MockERC20__factory,
  MockWBNB,
  PancakeFactory,
  PancakeMasterChef,
  PancakeMasterChef__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouterV2,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedStrategyLiquidate,
  PancakeswapV2RestrictedStrategyPartialCloseLiquidate,
  SimpleVaultConfig,
  SyrupBar,
  Vault,
  Vault__factory,
  WNativeRelayer,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal,
  PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading,
  PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading,
  MasterChef,
  DeltaNeutralVault,
  DeltaNeutralVault__factory,
  MockWBNB__factory,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory,
  DeltaNeutralVaultConfig,
  DeltaNeutralPancakeWorker02,
  DeltaNeutralPancakeWorker02__factory,
  IERC20,
  DeltaNeutralOracle,
} from "../../../../typechain";
import * as Assert from "../../../helpers/assert";
import * as TimeHelpers from "../../../helpers/time";
import { DeployHelper, IDeltaNeutralVaultConfig } from "../../../helpers/deploy";
import { SwapHelper } from "../../../helpers/swap";
import { Worker02Helper } from "../../../helpers/worker";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
const { expect } = chai;

describe("DeltaNeutralVaultNon18Decimals", () => {
  const FOREVER = "2000000000";
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther("1");
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther("0");
  const REINVEST_BOUNTY_BPS = "100"; // 1% reinvest bounty
  const RESERVE_POOL_BPS = "1000"; // 10% reserve pool
  const KILL_PRIZE_BPS = "1000"; // 10% Kill prize
  const INTEREST_RATE = "0"; // 0% per year

  const WORK_FACTOR = "999999"; // delta neutral worker should have no cap workfactor
  const KILL_FACTOR = "8000";
  const MAX_REINVEST_BOUNTY: string = "900";
  const DEPLOYER = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";
  const BENEFICIALVAULT_BOUNTY_BPS = "1000";
  const REINVEST_THRESHOLD = ethers.utils.parseEther("1"); // If pendingCake > 1 $CAKE, then reinvest
  const KILL_TREASURY_BPS = "100";
  const POOL_ID = 1;
  const EMPTY_BYTE = ethers.utils.defaultAbiCoder.encode(["uint256"], [0]);

  const STABLE_MIN_DEBT_SIZE = ethers.utils.parseEther("0.1").div(1e9); // 1 BTOKEN min debt size
  const ASSET_MIN_DEBT_SIZE = ethers.utils.parseEther("0.1"); // 1 BTOKEN min debt size
  // Delta Vault Config
  const REBALANCE_FACTOR = "6800";
  const POSITION_VALUE_TOLERANCE_BPS = "200";
  const DEBT_RATIO_TOLERANCE_BPS = "30";
  const MAX_VAULT_POSITION_VALUE = ethers.utils.parseEther("100000");
  const DEPOSIT_FEE_BPS = "0"; // 0%

  // Delta Vault Actions
  const ACTION_WORK = 1;
  const ACTION_WRAP = 2;

  // Deimals
  const stableTokenDecimal = 9;
  const assetTokenDecimal = 18;
  const stableTokenConversionFactor = 18 - stableTokenDecimal;
  const assetTokenConversionFactor = 18 - assetTokenDecimal;

  /// Pancakeswap-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouterV2;

  let wbnb: MockWBNB;
  let lp: PancakePair;

  /// Token-related instance(s)
  let baseToken: MockERC20;
  let cake: CakeToken;
  let syrup: SyrupBar;
  let debtToken: DebtToken;

  /// Strategy-ralted instance(s)
  let addStrat: PancakeswapV2RestrictedStrategyAddBaseTokenOnly;
  let stableTwoSidesStrat: PancakeswapV2RestrictedStrategyAddTwoSidesOptimal;
  let assetTwoSidesStrat: PancakeswapV2RestrictedStrategyAddTwoSidesOptimal;
  let liqStrat: PancakeswapV2RestrictedStrategyLiquidate;
  let minimizeStrat: PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading;
  let partialCloseStrat: PancakeswapV2RestrictedStrategyPartialCloseLiquidate;
  let partialCloseMinimizeStrat: PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading;

  /// Vault-related instance(s)
  let stableSimpleVaultConfig: SimpleVaultConfig;
  let assetSimpleVaultConfig: SimpleVaultConfig;
  let wNativeRelayer: WNativeRelayer;
  let stableVault: Vault;
  let assetVault: Vault;
  let deltaVault: DeltaNeutralVault;
  let deltaVaultConfig: DeltaNeutralVaultConfig;

  /// DeltaNeutralOracle instance
  let mockPriceOracle: FakeContract<DeltaNeutralOracle>;

  /// FairLaunch-related instance(s)
  let fairLaunch: FairLaunch;
  let alpacaToken: AlpacaToken;

  /// PancakeswapMasterChef-related instance(s)
  let masterChef: PancakeMasterChef;
  let stableVaultWorker: DeltaNeutralPancakeWorker02;
  let assetVaultWorker: DeltaNeutralPancakeWorker02;

  /// Timelock instance(s)
  let whitelistedContract: MockContractContext;
  let evilContract: MockContractContext;

  // Accounts
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let eve: SignerWithAddress;

  let deployerAddress: string;
  let aliceAddress: string;
  let bobAddress: string;
  let eveAddress: string;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;
  let baseTokenAsDeployer: MockERC20;

  let wbnbTokenAsAlice: MockWBNB;
  let wbnbTokenAsDeployer: MockWBNB;

  let fairLaunchAsAlice: FairLaunch;

  let lpAsAlice: PancakePair;
  let lpAsBob: PancakePair;

  let pancakeMasterChefAsAlice: PancakeMasterChef;
  let pancakeMasterChefAsBob: PancakeMasterChef;

  let pancakeswapV2WorkerAsEve: DeltaNeutralPancakeWorker02__factory;
  let pancakeswapV2Worker01AsEve: DeltaNeutralPancakeWorker02__factory;

  let deltaVaultAsAlice: DeltaNeutralVault;
  let deltaVaultAsBob: DeltaNeutralVault;
  let deltaVaultAsEve: DeltaNeutralVault;

  // Test Helper
  let swapHelper: SwapHelper;
  let workerHelper: Worker02Helper;

  async function fixture() {
    [deployer, alice, bob, eve] = await ethers.getSigners();
    [deployerAddress, aliceAddress, bobAddress, eveAddress] = await Promise.all([
      deployer.getAddress(),
      alice.getAddress(),
      bob.getAddress(),
      eve.getAddress(),
    ]);
    const deployHelper = new DeployHelper(deployer);
    // Setup MockContractContext
    const MockContractContext = (await ethers.getContractFactory(
      "MockContractContext",
      deployer
    )) as MockContractContext__factory;
    whitelistedContract = await MockContractContext.deploy();
    await whitelistedContract.deployed();
    evilContract = await MockContractContext.deploy();
    await evilContract.deployed();

    // Setup IDeltaNeutralOracle
    mockPriceOracle = await smock.fake("DeltaNeutralOracle");

    /// Setup token stuffs
    [baseToken] = await deployHelper.deployBEP20([
      {
        name: "BTOKEN",
        symbol: "BTOKEN",
        decimals: stableTokenDecimal,
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("100000000") },
          { address: aliceAddress, amount: ethers.utils.parseEther("100000000") },
          { address: bobAddress, amount: ethers.utils.parseEther("100000000") },
        ],
      },
    ]);
    wbnb = await deployHelper.deployWBNB();

    await wbnb.mint(deployerAddress, ethers.utils.parseEther("100000000"));
    await wbnb.mint(aliceAddress, ethers.utils.parseEther("100000000"));
    await wbnb.mint(bobAddress, ethers.utils.parseEther("100000000"));

    [factoryV2, routerV2, cake, syrup, masterChef] = await deployHelper.deployPancakeV2(wbnb, CAKE_REWARD_PER_BLOCK, [
      { address: deployerAddress, amount: ethers.utils.parseEther("100") },
    ]);

    [alpacaToken, fairLaunch] = await deployHelper.deployAlpacaFairLaunch(
      ALPACA_REWARD_PER_BLOCK,
      ALPACA_BONUS_LOCK_UP_BPS,
      2000,
      2500
    );

    [stableVault, stableSimpleVaultConfig, wNativeRelayer] = await deployHelper.deployVault(
      wbnb,
      {
        minDebtSize: STABLE_MIN_DEBT_SIZE,
        interestRate: INTEREST_RATE,
        reservePoolBps: RESERVE_POOL_BPS,
        killPrizeBps: KILL_PRIZE_BPS,
        killTreasuryBps: KILL_TREASURY_BPS,
        killTreasuryAddress: DEPLOYER,
      },
      fairLaunch,
      baseToken
    );

    [assetVault, assetSimpleVaultConfig] = await deployHelper.deployVault(
      wbnb,
      {
        minDebtSize: ASSET_MIN_DEBT_SIZE,
        interestRate: INTEREST_RATE,
        reservePoolBps: RESERVE_POOL_BPS,
        killPrizeBps: KILL_PRIZE_BPS,
        killTreasuryBps: KILL_TREASURY_BPS,
        killTreasuryAddress: DEPLOYER,
      },
      fairLaunch,
      wbnb as unknown as MockERC20
    );
    await assetVault.setFairLaunchPoolId(1);

    // Setup strategies
    [addStrat, liqStrat, stableTwoSidesStrat, minimizeStrat, partialCloseStrat, partialCloseMinimizeStrat] =
      await deployHelper.deployPancakeV2Strategies(routerV2, stableVault, wbnb, wNativeRelayer);

    const PancakeswapV2RestrictedStrategyAddTwoSidesOptimal = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyAddTwoSidesOptimal",
      deployer
    )) as PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory;
    assetTwoSidesStrat = (await upgrades.deployProxy(PancakeswapV2RestrictedStrategyAddTwoSidesOptimal, [
      routerV2.address,
      assetVault.address,
    ])) as PancakeswapV2RestrictedStrategyAddTwoSidesOptimal;

    // Setup BTOKEN-WBNB pair on Pancakeswap
    // Add lp to masterChef's pool
    await factoryV2.createPair(baseToken.address, wbnb.address);
    lp = PancakePair__factory.connect(await factoryV2.getPair(wbnb.address, baseToken.address), deployer);
    await masterChef.add(1, lp.address, true);

    /// Setup DeltaNeutralPancakeWorker02
    stableVaultWorker = await deployHelper.deployDeltaNeutralPancakeWorker02(
      stableVault,
      baseToken,
      masterChef,
      routerV2,
      POOL_ID,
      WORK_FACTOR,
      KILL_FACTOR,
      addStrat,
      REINVEST_BOUNTY_BPS,
      [eveAddress],
      DEPLOYER,
      [cake.address, wbnb.address, baseToken.address],
      [
        stableTwoSidesStrat.address,
        minimizeStrat.address,
        partialCloseStrat.address,
        partialCloseMinimizeStrat.address,
      ],
      stableSimpleVaultConfig,
      mockPriceOracle.address
    );

    /// Setup DeltaNeutralPancakeWorker02
    assetVaultWorker = await deployHelper.deployDeltaNeutralPancakeWorker02(
      assetVault,
      wbnb as unknown as MockERC20,
      masterChef,
      routerV2,
      POOL_ID,
      WORK_FACTOR,
      KILL_FACTOR,
      addStrat,
      REINVEST_BOUNTY_BPS,
      [eveAddress],
      DEPLOYER,
      [cake.address, wbnb.address],
      [assetTwoSidesStrat.address, minimizeStrat.address, partialCloseStrat.address, partialCloseMinimizeStrat.address],
      assetSimpleVaultConfig,
      mockPriceOracle.address
    );

    swapHelper = new SwapHelper(
      factoryV2.address,
      routerV2.address,
      BigNumber.from(9975),
      BigNumber.from(10000),
      deployer
    );

    await swapHelper.addLiquidities([
      {
        token0: cake as unknown as IERC20,
        token1: wbnb as unknown as IERC20,
        amount0desired: ethers.utils.parseEther("100"),
        amount1desired: ethers.utils.parseEther("1000"),
      },
    ]);

    // Set up Delta Neutral Vault Config
    const deltaNeutralConfig = {
      wNativeAddr: wbnb.address,
      wNativeRelayer: wNativeRelayer.address,
      fairlaunchAddr: fairLaunch.address,
      rebalanceFactor: REBALANCE_FACTOR,
      positionValueTolerance: POSITION_VALUE_TOLERANCE_BPS,
      debtRatioTolerance: DEBT_RATIO_TOLERANCE_BPS,
      depositFeeTreasury: eveAddress,
      managementFeeTreasury: eveAddress,
      withdrawFeeTreasury: eveAddress,
      alpacaTokenAddress: alpacaToken.address,
    } as IDeltaNeutralVaultConfig;

    deltaVaultConfig = await deployHelper.deployDeltaNeutralVaultConfig(deltaNeutralConfig);
    // allow deployer to call rebalance
    await deltaVaultConfig.setValueLimit(MAX_VAULT_POSITION_VALUE);
    await deltaVaultConfig.setWhitelistedRebalancer([deployerAddress], true);
    await deltaVaultConfig.setLeverageLevel(3);
    await deltaVaultConfig.setwhitelistedReinvestors([deployerAddress], true);
    const reinvestStablePath = [alpacaToken.address, baseToken.address];
    await deltaVaultConfig.setSwapRouter(routerV2.address);
    await deltaVaultConfig.setReinvestPath(reinvestStablePath);

    // Setup Delta Neutral Vault
    const deltaNeutral = {
      name: "DELTA_NEUTRAL_VAULT",
      symbol: "DELTA_NEUTRAL_VAULT",
      vaultStable: stableVault.address,
      vaultAsset: assetVault.address,
      stableVaultWorker: stableVaultWorker.address,
      assetVaultWorker: assetVaultWorker.address,
      lpToken: lp.address,
      alpacaToken: alpacaToken.address, // change this to alpaca token address
      deltaNeutralOracle: mockPriceOracle.address,
      deltaVaultConfig: deltaVaultConfig.address,
    };
    deltaVault = await deployHelper.deployDeltaNeutralVault(deltaNeutral);

    //whitelisted delta neutral vault contract to call work function
    await stableVaultWorker.setWhitelistedCallers([deltaVault.address], true);
    await assetVaultWorker.setWhitelistedCallers([deltaVault.address], true);

    // whitelisted contract to be able to call work
    await stableSimpleVaultConfig.setWhitelistedCallers([whitelistedContract.address, deltaVault.address], true);
    await assetSimpleVaultConfig.setWhitelistedCallers([whitelistedContract.address, deltaVault.address], true);

    // Set approved add strategies
    await stableSimpleVaultConfig.setApprovedAddStrategy([addStrat.address, stableTwoSidesStrat.address], true);
    await assetSimpleVaultConfig.setApprovedAddStrategy([addStrat.address, assetTwoSidesStrat.address], true);

    // set ok caller to wNativeRelayer
    await wNativeRelayer.setCallerOk([stableVault.address, assetVault.address, deltaVault.address], true);

    // Contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);
    baseTokenAsDeployer = MockERC20__factory.connect(baseToken.address, deployer);

    wbnbTokenAsAlice = MockWBNB__factory.connect(wbnb.address, alice);
    wbnbTokenAsDeployer = MockWBNB__factory.connect(wbnb.address, deployer);

    lpAsAlice = PancakePair__factory.connect(lp.address, alice);
    lpAsBob = PancakePair__factory.connect(lp.address, bob);

    fairLaunchAsAlice = FairLaunch__factory.connect(fairLaunch.address, alice);

    pancakeMasterChefAsAlice = PancakeMasterChef__factory.connect(masterChef.address, alice);
    pancakeMasterChefAsBob = PancakeMasterChef__factory.connect(masterChef.address, bob);

    deltaVaultAsAlice = DeltaNeutralVault__factory.connect(deltaVault.address, alice);
    deltaVaultAsBob = DeltaNeutralVault__factory.connect(deltaVault.address, bob);
    deltaVaultAsEve = DeltaNeutralVault__factory.connect(deltaVault.address, eve);
  }

  interface IDepositWorkByte {
    posId: number;
    vaultAddress: string;
    workerAddress: string;
    twoSidesStrat: string;
    principalAmount: BigNumber;
    borrowAmount: BigNumber;
    maxReturn: BigNumber;
    farmingTokenAmount: BigNumber;
    minLpReceive: BigNumber;
  }

  interface IWithdrawWorkByte {
    posId: number;
    vaultAddress: string;
    workerAddress: string;
    partialCloseMinimizeStrat: string;
    debt: BigNumber;
    maxLpTokenToLiquidate: BigNumber;
    maxDebtRepayment: BigNumber;
    minFarmingToken: BigNumber;
  }

  function buildDepositWorkByte(input: IDepositWorkByte): string {
    const workByte = ethers.utils.defaultAbiCoder.encode(
      ["address", "uint256", "address", "uint256", "uint256", "uint256", "bytes"],
      [
        input.vaultAddress,
        input.posId,
        input.workerAddress,
        input.principalAmount,
        input.borrowAmount,
        input.maxReturn,
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [
            input.twoSidesStrat,
            ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [input.farmingTokenAmount, input.minLpReceive]),
          ]
        ),
      ]
    );
    return workByte;
  }

  function buildWithdrawWorkByte(input: IWithdrawWorkByte): string {
    const withdrawWorkByte = ethers.utils.defaultAbiCoder.encode(
      ["address", "uint256", "address", "uint256", "uint256", "uint256", "bytes"],
      [
        input.vaultAddress,
        input.posId,
        input.workerAddress,
        "0",
        "0",
        input.debt,
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [
            input.partialCloseMinimizeStrat,
            ethers.utils.defaultAbiCoder.encode(
              ["uint256", "uint256", "uint256"],
              [input.maxLpTokenToLiquidate, input.maxDebtRepayment, input.minFarmingToken]
            ),
          ]
        ),
      ]
    );
    return withdrawWorkByte;
  }

  async function setMockTokenPrice(stableTokenPrice: BigNumber, assetTokenPrice: BigNumber, lastUpdate?: BigNumber) {
    const latest = lastUpdate ? lastUpdate : await TimeHelpers.latest();
    mockPriceOracle.getTokenPrice.whenCalledWith(baseToken.address).returns([stableTokenPrice, latest]);
    mockPriceOracle.getTokenPrice.whenCalledWith(wbnb.address).returns([assetTokenPrice, latest]);
  }

  async function setMockLpPrice(lpPrice: BigNumber, lastUpdate?: BigNumber) {
    const latest = lastUpdate ? lastUpdate : await TimeHelpers.latest();

    mockPriceOracle.lpToDollar.returns((args: any) => {
      const lpAmount: BigNumber = args[0];
      const lpValue = lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1"));
      return [lpValue, latest];
    });
  }

  function parseStable(unit: string): BigNumber {
    return ethers.utils.parseEther(unit).div(10 ** stableTokenConversionFactor);
  }

  function parseAsset(unit: string): BigNumber {
    return ethers.utils.parseEther(unit).div(10 ** assetTokenConversionFactor);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
    // depsit fund into vaults
    await baseTokenAsDeployer.approve(stableVault.address, ethers.utils.parseEther("10000"));
    await stableVault.deposit(ethers.utils.parseEther("10000"));

    await wbnbTokenAsDeployer.approve(assetVault.address, ethers.utils.parseEther("10000"));
    await assetVault.deposit(ethers.utils.parseEther("10000"));
  });

  describe("#initPositions", async () => {
    context("when owner call initPositions", async () => {
      it("should initilize positions", async () => {
        await deltaVaultConfig.setLeverageLevel(3);
        // add liquidity
        await swapHelper.addLiquidities([
          {
            token0: baseToken as unknown as IERC20,
            token1: wbnb as unknown as IERC20,
            amount0desired: parseStable("10000000000"),
            amount1desired: parseAsset("10000000000"),
          },
        ]);

        // stable token reserve = 10000000000, asset token reserve = 10000000000
        // deployer deposit 500 stable token, 500 asset token
        const depositStableTokenAmt = parseStable("500");
        const depositAssetTokenAmt = parseAsset("500");

        await baseTokenAsDeployer.approve(deltaVault.address, depositStableTokenAmt);

        const stableWorkbyteInput: IDepositWorkByte = {
          posId: 0,
          vaultAddress: stableVault.address,
          workerAddress: stableVaultWorker.address,
          twoSidesStrat: stableTwoSidesStrat.address,
          principalAmount: parseStable("125"),
          borrowAmount: parseStable("500"),
          farmingTokenAmount: parseAsset("125"),
          maxReturn: BigNumber.from(0),
          minLpReceive: BigNumber.from(0),
        };

        const assetWorkbyteInput: IDepositWorkByte = {
          posId: 0,
          vaultAddress: assetVault.address,
          workerAddress: assetVaultWorker.address,
          twoSidesStrat: assetTwoSidesStrat.address,
          principalAmount: parseAsset("375"),
          borrowAmount: parseAsset("1500"),
          farmingTokenAmount: parseStable("370"),
          maxReturn: BigNumber.from(0),
          minLpReceive: BigNumber.from(0),
        };

        const stableWorkByte = buildDepositWorkByte(stableWorkbyteInput);
        const assetWorkByte = buildDepositWorkByte(assetWorkbyteInput);

        const data = ethers.utils.defaultAbiCoder.encode(
          ["uint8[]", "uint256[]", "bytes[]"],
          [
            [ACTION_WORK, ACTION_WORK],
            [0, 0],
            [stableWorkByte, assetWorkByte],
          ]
        );

        const stableTokenPrice = ethers.utils.parseEther("1");
        const assetTokenPrice = ethers.utils.parseEther("1");
        // lp price = 2 * sqrt(r0 * r1) * (p0 * p1) / totalSupply
        // 2  * (Math.sqrt(10000000000000000000000000000 * 10000000000000000000  ) * Math.sqrt(1e18*1e9))/(316227766016837933199889 * 1e9 )
        const lpPrice = ethers.utils.parseEther("63245.553203367585");

        await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
        await setMockLpPrice(lpPrice);

        // shareReceive  = depositValue * totalSupply / Equity
        // stableLpAmount = 0.011848646641109569, assetLpAmount = 0.035466784031603639
        // positionValue = ((0.011848646641109569 + 0.035466784031603639) * 63245.553203367585) = 2992.490587951334
        // debt =(1500 + 500) = 2000
        // since totalSupply = 0, shareReceive = depositValue = 2992.490587951334 - (1500 + 500) = 992.490587951334
        const minSharesReceive = ethers.utils.parseEther("992.49058795133");
        const initTx = await deltaVault.initPositions(
          depositStableTokenAmt,
          depositAssetTokenAmt,
          minSharesReceive,
          data,
          {
            value: depositAssetTokenAmt,
          }
        );

        const stablePosId = await deltaVault.stableVaultPosId();
        const assetPostId = await deltaVault.assetVaultPosId();
        const deployerShare = await deltaVault.balanceOf(deployerAddress);
        expect(stablePosId).to.not.eq(0);
        expect(assetPostId).to.not.eq(0);
        expect(deployerShare).to.be.at.least(minSharesReceive.toBigInt());

        expect(initTx)
          .to.emit(deltaVault, "LogInitializePositions")
          .withArgs(deployerAddress, stablePosId, assetPostId);

        // when deployer try to initialize positions again
        await expect(
          deltaVault.initPositions(depositStableTokenAmt, depositAssetTokenAmt, ethers.utils.parseEther("1"), data, {
            value: depositAssetTokenAmt,
          })
        ).to.revertedWith("DeltaNeutralVault_PositionsAlreadyInitialized()");
      });
    });

    context("when leverage level is not 3x", async () => {
      it("should still work", async () => {
        await deltaVaultConfig.setLeverageLevel(5);
        // add liquidity
        await swapHelper.addLiquidities([
          {
            token0: baseToken as unknown as IERC20,
            token1: wbnb as unknown as IERC20,
            amount0desired: parseStable("10000000000"),
            amount1desired: parseAsset("10000000000"),
          },
        ]);

        // stable token reserve = 10000000000, asset token reserve = 10000000000
        // deployer deposit 500 stable token, 500 asset token
        const stableTokenAmount = parseStable("500");
        const assetTokenAmount = parseAsset("500");

        await baseTokenAsDeployer.approve(deltaVault.address, stableTokenAmount);

        // with 5x leverage, eq long side should be (lev - 2) / (2 lev - 2)
        // = 5 - 2 / (2*5) - 2
        // = 3 / 8
        // borrow amount should be (lev - 1) * 3/8
        // = 4 * 3 / 8 = 3/2 of total eq supply
        const stableWorkbyteInput: IDepositWorkByte = {
          posId: 0,
          vaultAddress: stableVault.address,
          workerAddress: stableVaultWorker.address,
          twoSidesStrat: stableTwoSidesStrat.address,
          principalAmount: parseStable("200"),
          borrowAmount: parseStable("1500"),
          farmingTokenAmount: parseAsset("175"), // farming + pricipal = eqitty to supply
          maxReturn: BigNumber.from(0),
          minLpReceive: BigNumber.from(0),
        };

        // with 5x leverage, long side should be (lev) / (2 lev - 2)
        // = 5 / (2*5) - 2
        // = 5 / 8
        // borrow amount should be (lev - 1) * 5/8
        // = 4 * 5 / 8 = 5/2 of total eq supply
        const assetWorkbyteInput: IDepositWorkByte = {
          posId: 0,
          vaultAddress: assetVault.address,
          workerAddress: assetVaultWorker.address,
          twoSidesStrat: assetTwoSidesStrat.address,
          principalAmount: parseAsset("325"),
          borrowAmount: parseAsset("2500"),
          farmingTokenAmount: parseStable("300"),
          maxReturn: BigNumber.from(0),
          minLpReceive: BigNumber.from(0),
        };

        const stableWorkByte = buildDepositWorkByte(stableWorkbyteInput);
        const assetWorkByte = buildDepositWorkByte(assetWorkbyteInput);

        const data = ethers.utils.defaultAbiCoder.encode(
          ["uint8[]", "uint256[]", "bytes[]"],
          [
            [ACTION_WORK, ACTION_WORK],
            [0, 0],
            [stableWorkByte, assetWorkByte],
          ]
        );

        const stableTokenPrice = ethers.utils.parseEther("1");
        const assetTokenPrice = ethers.utils.parseEther("1");
        const lpPrice = ethers.utils.parseEther("63245.553203367585");

        await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
        await setMockLpPrice(lpPrice);

        // shareReceive  = depositValue * totalSupply / Equity
        // stableLpAmount = 0.029607002160303329, assetLpAmount = 0.049365799917528781
        // positionValue = ((0.029607002160303329 + 0.049365799917528781) * 63245.553203367585) = 4994.678555432548877358
        // debt =(2500 + 1500) = 4000
        // since totalSupply = 0, shareReceive = depositValue = 4994.678555432548877358 - 400 = 994.678555432548877358

        const minSharesReceive = ethers.utils.parseEther("994.678555432549272222");
        const initTx = await deltaVault.initPositions(stableTokenAmount, assetTokenAmount, minSharesReceive, data, {
          value: assetTokenAmount,
        });

        const stablePosId = await deltaVault.stableVaultPosId();
        const assetPostId = await deltaVault.stableVaultPosId();
        const deployerShare = await deltaVault.balanceOf(deployerAddress);
        expect(stablePosId).to.not.eq(0);
        expect(assetPostId).to.not.eq(0);
        expect(deployerShare).to.be.at.least(minSharesReceive.toBigInt());
        expect(initTx)
          .to.emit(deltaVault, "LogInitializePositions")
          .withArgs(deployerAddress, stablePosId, assetPostId);
      });
    });
  });

  describe("#deposit", async () => {
    describe("when positions initialized", async () => {
      beforeEach(async () => {
        // add liquidity
        await swapHelper.addLiquidities([
          {
            token0: baseToken as unknown as IERC20,
            token1: wbnb as unknown as IERC20,
            amount0desired: parseStable("10000000000"),
            amount1desired: parseAsset("10000000000"),
          },
        ]);

        const stableTokenAmount = parseStable("500");
        const assetTokenAmount = parseAsset("500");

        await baseTokenAsDeployer.approve(deltaVault.address, stableTokenAmount);

        const stableWorkbyteInput: IDepositWorkByte = {
          posId: 0,
          vaultAddress: stableVault.address,
          workerAddress: stableVaultWorker.address,
          twoSidesStrat: stableTwoSidesStrat.address,
          principalAmount: parseStable("125"),
          borrowAmount: parseStable("500"),
          farmingTokenAmount: parseAsset("125"),
          maxReturn: BigNumber.from(0),
          minLpReceive: BigNumber.from(0),
        };

        const assetWorkbyteInput: IDepositWorkByte = {
          posId: 0,
          vaultAddress: assetVault.address,
          workerAddress: assetVaultWorker.address,
          twoSidesStrat: assetTwoSidesStrat.address,
          principalAmount: parseAsset("375"),
          borrowAmount: parseAsset("1500"),
          farmingTokenAmount: parseStable("375"),
          maxReturn: BigNumber.from(0),
          minLpReceive: BigNumber.from(0),
        };

        const stableWorkByte = buildDepositWorkByte(stableWorkbyteInput);
        const assetWorkByte = buildDepositWorkByte(assetWorkbyteInput);

        const data = ethers.utils.defaultAbiCoder.encode(
          ["uint8[]", "uint256[]", "bytes[]"],
          [
            [ACTION_WORK, ACTION_WORK],
            [0, 0],
            [stableWorkByte, assetWorkByte],
          ]
        );
        const stableTokenPrice = ethers.utils.parseEther("1");
        const assetTokenPrice = ethers.utils.parseEther("1");
        const lpPrice = ethers.utils.parseEther("63245.553203367585");
        await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
        await setMockLpPrice(lpPrice);

        const initTx = await deltaVault.initPositions(stableTokenAmount, assetTokenAmount, 0, data, {
          value: assetTokenAmount,
        });
      });

      context("when alice deposit to delta neutral vault", async () => {
        it("should be able to deposit", async () => {
          const depositStableTokenAmount = parseStable("500");
          const depositAssetTokenAmount = parseAsset("500");

          await baseTokenAsAlice.approve(deltaVault.address, depositStableTokenAmount);

          const stableWorkbyteInput: IDepositWorkByte = {
            posId: 1,
            vaultAddress: stableVault.address,
            workerAddress: stableVaultWorker.address,
            twoSidesStrat: stableTwoSidesStrat.address,
            principalAmount: parseStable("125"),
            borrowAmount: parseStable("500"),
            farmingTokenAmount: parseAsset("125"),
            maxReturn: BigNumber.from(0),
            minLpReceive: BigNumber.from(0),
          };

          const assetWorkbyteInput: IDepositWorkByte = {
            posId: 1,
            vaultAddress: assetVault.address,
            workerAddress: assetVaultWorker.address,
            twoSidesStrat: assetTwoSidesStrat.address,
            principalAmount: parseAsset("375"),
            borrowAmount: parseAsset("1500"),
            farmingTokenAmount: parseStable("375"),
            maxReturn: BigNumber.from(0),
            minLpReceive: BigNumber.from(0),
          };

          const stableWorkByte = buildDepositWorkByte(stableWorkbyteInput);
          const assetWorkByte = buildDepositWorkByte(assetWorkbyteInput);

          const data = ethers.utils.defaultAbiCoder.encode(
            ["uint8[]", "uint256[]", "bytes[]"],
            [
              [ACTION_WORK, ACTION_WORK],
              [0, 0],
              [stableWorkByte, assetWorkByte],
            ]
          );

          const stableTokenPrice = ethers.utils.parseEther("1");
          const assetTokenPrice = ethers.utils.parseEther("1");
          const lpPrice = ethers.utils.parseEther("63245.55320336759");

          await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
          await setMockLpPrice(lpPrice);

          const stableWorkerLpBefore = await stableVaultWorker.totalLpBalance();
          const assetWorkerLpBefore = await assetVaultWorker.totalLpBalance();
          const positionInfoBefore = await deltaVault.positionInfo();
          const positionValueBefore = positionInfoBefore.stablePositionEquity
            .add(positionInfoBefore.stablePositionDebtValue)
            .add(positionInfoBefore.assetPositionEquity)
            .add(positionInfoBefore.assetPositionDebtValue);

          // call deposit Delta Neutral Vault
          const depositTx = await deltaVaultAsAlice.deposit(
            depositStableTokenAmount,
            depositAssetTokenAmount,
            aliceAddress,
            0,
            data,
            {
              value: depositAssetTokenAmount,
            }
          );

          const stableWorkerLpAfter = await stableVaultWorker.totalLpBalance();
          const assetWorkerLpAfter = await assetVaultWorker.totalLpBalance();
          const positionInfoAfter = await deltaVault.positionInfo();
          const positionValueAfter = positionInfoAfter.stablePositionEquity
            .add(positionInfoAfter.stablePositionDebtValue)
            .add(positionInfoAfter.assetPositionEquity)
            .add(positionInfoAfter.assetPositionDebtValue);
          const stableLpDiff = stableWorkerLpAfter.sub(stableWorkerLpBefore);
          const assetLpDiff = assetWorkerLpAfter.sub(assetWorkerLpBefore);

          // newStableLpAmount = 11848647034195200, newAssetLpAmount = 35545938733851396
          // newPositionValue = (11848647034195200 + 35545938733851396) * 63245.55320336759 = 2997.496795744559380483
          // new debt = 1500 + 500 = 2000
          // deposit value = 2997.496795744559380483 - 2000 = 997.496795744559380483
          // shareSupply = 997.496846022942854931
          // equity = 997.496846022943091904
          // expect alice share = depositValue * shareSupply / totalEquity = 997.496795744559380483 * (997.496846022942854931 / 997.496846022943091904) = 997.496795744559143511

          const expectAliceShare = ethers.utils.parseEther("997.496795744559143511");
          const expectPositionValueDiff = stableLpDiff.add(assetLpDiff).mul(lpPrice).div(ethers.utils.parseEther("1"));
          const aliceShare = await deltaVault.balanceOf(aliceAddress);

          expect(expectAliceShare).to.eq(aliceShare);
          Assert.assertAlmostEqual(
            expectPositionValueDiff.toString(),
            positionValueAfter.sub(positionValueBefore).toString()
          );
          expect(positionInfoAfter.stablePositionDebtValue.sub(positionInfoBefore.stablePositionDebtValue)).to.eq(
            ethers.utils.parseEther("500")
          );
          expect(positionInfoAfter.assetPositionDebtValue.sub(positionInfoBefore.assetPositionDebtValue)).to.eq(
            ethers.utils.parseEther("1500")
          );
          expect(depositTx)
            .to.emit(deltaVault, "LogDeposit")
            .withArgs(aliceAddress, aliceAddress, aliceShare, depositStableTokenAmount, depositAssetTokenAmount);
        });
      });
    });
  });

  describe("#withdraw", async () => {
    describe("when positions initialized", async () => {
      beforeEach(async () => {
        // add liquidity
        await swapHelper.addLiquidities([
          {
            token0: baseToken as unknown as IERC20,
            token1: wbnb as unknown as IERC20,
            amount0desired: parseStable("90000000"),
            amount1desired: parseAsset("90000000"),
          },
        ]);
        const stableTokenAmount = parseStable("500");
        const assetTokenAmount = parseAsset("500");
        await baseTokenAsDeployer.approve(deltaVault.address, stableTokenAmount);

        const stableWorkbyteInput: IDepositWorkByte = {
          posId: 0,
          vaultAddress: stableVault.address,
          workerAddress: stableVaultWorker.address,
          twoSidesStrat: stableTwoSidesStrat.address,
          principalAmount: parseStable("125"),
          borrowAmount: parseStable("500"),
          farmingTokenAmount: parseAsset("125"),
          maxReturn: BigNumber.from(0),
          minLpReceive: BigNumber.from(0),
        };

        const assetWorkbyteInput: IDepositWorkByte = {
          posId: 0,
          vaultAddress: assetVault.address,
          workerAddress: assetVaultWorker.address,
          twoSidesStrat: assetTwoSidesStrat.address,
          principalAmount: parseAsset("375"),
          borrowAmount: parseAsset("1500"),
          farmingTokenAmount: parseStable("375"),
          maxReturn: BigNumber.from(0),
          minLpReceive: BigNumber.from(0),
        };

        const stableWorkByte = buildDepositWorkByte(stableWorkbyteInput);
        const assetWorkByte = buildDepositWorkByte(assetWorkbyteInput);

        const data = ethers.utils.defaultAbiCoder.encode(
          ["uint8[]", "uint256[]", "bytes[]"],
          [
            [ACTION_WORK, ACTION_WORK],
            [0, 0],
            [stableWorkByte, assetWorkByte],
          ]
        );
        const stableTokenPrice = ethers.utils.parseEther("1");
        const assetTokenPrice = ethers.utils.parseEther("1");
        const lpPrice = ethers.utils.parseEther("63245.55320336759");

        await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
        await setMockLpPrice(lpPrice);

        const minSharesReceive = ethers.utils.parseEther("992.49058795133");

        const initTx = await deltaVault.initPositions(stableTokenAmount, assetTokenAmount, minSharesReceive, data, {
          value: assetTokenAmount,
        });

        const depositStableTokenAmount = parseStable("500");
        const depositAssetTokenAmount = parseAsset("500");

        await baseTokenAsAlice.approve(deltaVault.address, depositStableTokenAmount);

        const depositStableWorkbyteInput: IDepositWorkByte = {
          posId: 1,
          vaultAddress: stableVault.address,
          workerAddress: stableVaultWorker.address,
          twoSidesStrat: stableTwoSidesStrat.address,
          principalAmount: parseStable("125"),
          borrowAmount: parseStable("500"),
          farmingTokenAmount: parseAsset("125"),
          maxReturn: BigNumber.from(0),
          minLpReceive: BigNumber.from(0),
        };

        const depositAssetWorkbyteInput: IDepositWorkByte = {
          posId: 1,
          vaultAddress: assetVault.address,
          workerAddress: assetVaultWorker.address,
          twoSidesStrat: assetTwoSidesStrat.address,
          principalAmount: parseAsset("375"),
          borrowAmount: parseAsset("1500"),
          farmingTokenAmount: parseStable("375"),
          maxReturn: BigNumber.from(0),
          minLpReceive: BigNumber.from(0),
        };

        const depositStableWorkByte = buildDepositWorkByte(depositStableWorkbyteInput);
        const depositAssetWorkByte = buildDepositWorkByte(depositAssetWorkbyteInput);

        const depositData = ethers.utils.defaultAbiCoder.encode(
          ["uint8[]", "uint256[]", "bytes[]"],
          [
            [ACTION_WORK, ACTION_WORK],
            [0, 0],
            [depositStableWorkByte, depositAssetWorkByte],
          ]
        );

        const depositTx = await deltaVaultAsAlice.deposit(
          depositStableTokenAmount,
          depositAssetTokenAmount,
          aliceAddress,
          0,
          depositData,
          {
            value: depositAssetTokenAmount,
          }
        );
      });

      context("when alice withdraw from delta neutral vault", async () => {
        it("should be able to withdraw", async () => {
          // lpPrice = 2  * (Math.sqrt(90004000000000000000000000 * 90001999999999998  ) * Math.sqrt(1e18*1e9))/(2846144683149070253709 * 1e9 )
          // lpPrice = 63245.55496234456
          const lpPrice = ethers.utils.parseEther("63245.55496234456");
          await setMockLpPrice(lpPrice);

          // Current Delta Neutral Position
          // Stable Position:
          // Equity=498.749852188918090270, PositionValue=1498.749852188918090270 Debt=1000.00
          // Asset Position:
          // Equity=1496.232900847817798046, PositionValue=4496.232900847817798046, Debt=3000.00
          // totalEquity=498.749852188918090270 + 1496.232900847817798046 = 1994.982753036735888316

          // ***** Target: Delta Neutral Position After Withdraw 200 Equity *****
          // totalEquity = 1994.982753036735888316 - 200 = 1794.982753036735888316
          // - % equity to withdraw
          // % stableEquity = 498.749852188918090270/1994.982753036735888316 = 0.250002087200868167
          // % assetEquity = 1496.232900847817798046/1994.982753036735888316 = 0.749997912799131832

          // Target Stable Position:
          // Equity = 1794.982753036735888316*0.250002087200868167 = 448.749434748744455145
          // PositionValue = 448.749434748744455145 * Lerverage = 448.749434748744455145*3 = 1346.248304246233365435
          // Debt = 1346.248304246233365435 - 448.749434748744455145 = 897.49886949748891029
          // deltaEquity = 448.749434748744455145 - 498.749852188918090270 = -50.000417440173635125
          // debtaDebt = 897.49886949748891029 - 1000.00 = -102.50113050251108971

          // deltaEquityWithSlippage = -50.000417440173635125 * 9970/10000 = -49.850416187853114219
          // deltaDebtWithSlippage = -102.50113050251108971 * 9970/10000 = -102.193627111003556440

          // expectStableEquity = 448.749434748744455145 + (50.000417440173635125 - 49.850416187853114219) = 448.899436001064976051
          // expectStableDebt = 897.49886949748891029 + (102.50113050251108971 - 102.50113050251108971) = 897.49886949748891029

          // Target Asset Position:
          // Equity = 1794.982753036735888316 * 0.749997912799131832 = 1346.233318287991431375
          // PositionValue = 1346.233318287991431375 * 3 = 4038.699954863974294125
          // Debt = 4038.699954863974294125 - 1346.233318287991431375 = 2692.46663657598286275
          // deltaEquity = 1346.233318287991431375 - 1496.232900847817798046 = -149.999582559826366671
          // debtaDebt = 2692.46663657598286275 - 3000  = -307.53336342401713725

          // deltaEquityWithSlippage = -149.999582559826366671 * 9970/10000 = -149.549583812146887570
          // deltaDebtWithSlippage = -307.53336342401713725 * 9970/10000 = -306.61076333374508583825

          // expectAssetEquity = 1346.233318287991431375 + (149.999582559826366671 - 149.549583812146887570) = 1346.683317035670910476
          // expectAssetDebt = 2692.46663657598286275 + (307.53336342401713725 - 306.61076333374508583825) = 2693.389236666254914161

          const expectStableEquity = ethers.utils.parseEther("448.899436001064976051");
          // const expectStableDebt = ethers.utils.parseEther("897.498869497000000000");
          const expectStableDebt = ethers.utils.parseEther("897.806372889000000000");
          const expectAssetEquity = ethers.utils.parseEther("1346.683317035670910476");
          const expectAssetDebt = ethers.utils.parseEther("2693.389236666254914161");

          // Action1: partialCloseMinimize lp = 0.002404027340567750
          // return stableToken = 102.193627111, repay debt -102.193627111, remaining = 0
          // return assetToken = 49.784230399138691733
          const stableDebtToRepay = parseStable("102.193627111");
          const stableValueToWithDraw = ethers.utils
            .parseEther("49.850416187853114219")
            .add(ethers.utils.parseEther("102.193627111"));

          const lpStableToLiquidate = stableValueToWithDraw.mul(ethers.utils.parseEther("1")).div(lpPrice);

          const stableWithdrawInput: IWithdrawWorkByte = {
            posId: 1,
            vaultAddress: stableVault.address,
            workerAddress: stableVaultWorker.address,
            partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
            debt: stableDebtToRepay,
            maxLpTokenToLiquidate: lpStableToLiquidate, // lp amount to withdraw consists of both equity and debt
            maxDebtRepayment: stableDebtToRepay,
            minFarmingToken: BigNumber.from(0),
          };

          // Action2: partialCloseMinimize lp = 0,007212528175576653
          // return stableToken = 228.077573122 - 78.723074599 =  149.354498523
          // return assetToken = 306.610763333745085838, repay debt -306.610763333745085838, remaining = 0

          const assetDebtToRepay = parseAsset("306.610763333745085838");
          const assetValueToWithDraw = ethers.utils
            .parseEther("149.549583812146887570")
            .add(ethers.utils.parseEther("306.610763333745085838"));
          const lpAssetToLiquidate = assetValueToWithDraw.mul(ethers.utils.parseEther("1")).div(lpPrice);

          const assetWithdrawInput: IWithdrawWorkByte = {
            posId: 1,
            vaultAddress: assetVault.address,
            workerAddress: assetVaultWorker.address,
            partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
            debt: assetDebtToRepay,
            maxLpTokenToLiquidate: lpAssetToLiquidate,
            maxDebtRepayment: assetDebtToRepay,
            minFarmingToken: BigNumber.from(0),
          };

          const stableWithdrawWorkByte = buildWithdrawWorkByte(stableWithdrawInput);
          const assetWithdrawWorkByte = buildWithdrawWorkByte(assetWithdrawInput);

          const withdrawData = ethers.utils.defaultAbiCoder.encode(
            ["uint8[]", "uint256[]", "bytes[]"],
            [
              [ACTION_WORK, ACTION_WORK],
              [0, 0],
              [stableWithdrawWorkByte, assetWithdrawWorkByte],
            ]
          );

          const withdrawValue = ethers.utils.parseEther("200");
          const shareToWithdraw = await deltaVault.valueToShare(withdrawValue);
          const aliceShareBefore = await deltaVault.balanceOf(aliceAddress);
          const alicebaseTokenBefore = await baseToken.balanceOf(aliceAddress);
          const aliceNativeBefore = await alice.getBalance();

          // ======== withdraw ======
          const minStableTokenReceive = parseStable("149.354498523");
          const minAssetTokenReceive = parseAsset("49.784230399136889214");

          const withdrawTx = await deltaVaultAsAlice.withdraw(
            shareToWithdraw,
            minStableTokenReceive,
            minAssetTokenReceive,
            withdrawData,
            { gasPrice: 0 }
          );

          const aliceShareAfter = await deltaVault.balanceOf(aliceAddress);
          const alicebaseTokenAfter = await baseToken.balanceOf(aliceAddress);
          const aliceNativeAfter = await alice.getBalance();
          const positionInfoAfter = await deltaVault.positionInfo();
          const baseTokenDiff = alicebaseTokenAfter.sub(alicebaseTokenBefore);
          const nativeTokenDiff = aliceNativeAfter.sub(aliceNativeBefore);
          expect(aliceShareBefore.sub(aliceShareAfter)).to.eq(shareToWithdraw);
          Assert.assertAlmostEqual(positionInfoAfter.stablePositionEquity.toString(), expectStableEquity.toString());
          Assert.assertAlmostEqual(positionInfoAfter.stablePositionDebtValue.toString(), expectStableDebt.toString());
          Assert.assertAlmostEqual(positionInfoAfter.assetPositionEquity.toString(), expectAssetEquity.toString());
          Assert.assertAlmostEqual(positionInfoAfter.assetPositionDebtValue.toString(), expectAssetDebt.toString());

          expect(withdrawTx).to.emit(deltaVault, "LogWithdraw").withArgs(aliceAddress, baseTokenDiff, nativeTokenDiff);
        });
      });
    });
  });
});
