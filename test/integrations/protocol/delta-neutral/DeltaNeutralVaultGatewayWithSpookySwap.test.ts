import { ethers, network, upgrades, waffle } from "hardhat";
import { constants, BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  AlpacaToken,
  DebtToken,
  FairLaunch,
  FairLaunch__factory,
  MockContractContext,
  MockContractContext__factory,
  MockERC20,
  MockERC20__factory,
  MockWBNB,
  PancakeMasterChef__factory,
  PancakePair,
  PancakePair__factory,
  SimpleVaultConfig,
  SyrupBar,
  Vault,
  WNativeRelayer,
  DeltaNeutralVault,
  DeltaNeutralVault__factory,
  MockWBNB__factory,
  DeltaNeutralVaultConfig,
  DeltaNeutralPancakeWorker02__factory,
  DeltaNeutralVaultGateway,
  DeltaNeutralVaultGateway__factory,
  DeltaNeutralOracle,
  IERC20,
  WaultSwapRouter,
  WaultSwapFactory,
  SpookyToken,
  SpookyMasterChef,
  MiniFL,
  AlpacaToken__factory,
  SpookySwapStrategyAddBaseTokenOnly,
  SpookySwapStrategyAddTwoSidesOptimal,
  SpookySwapStrategyLiquidate,
  SpookySwapStrategyPartialCloseLiquidate,
  SpookySwapStrategyPartialCloseMinimizeTrading,
  SpookySwapStrategyWithdrawMinimizeTrading,
  SpookySwapStrategyAddTwoSidesOptimal__factory,
  SpookyMasterChef__factory,
  Rewarder1,
  MockMiniFL,
} from "../../../../typechain";
import * as Assert from "../../../helpers/assert";
import * as TimeHelpers from "../../../helpers/time";
import { DeployHelper, IDeltaNeutralVaultConfig } from "../../../helpers/deploy";
import { SwapHelper } from "../../../helpers/swap";
import { Worker02Helper } from "../../../helpers/worker";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { DeltaNeutralSpookyWorker03 } from "../../../../typechain/DeltaNeutralSpookyWorker03";
import { DeltaNeutralSpookyWorker03__factory } from "../../../../typechain/factories/DeltaNeutralSpookyWorker03__factory";

chai.use(solidity);
const { expect } = chai;

interface SimpleWithdrawReturns {
  tx: any;
  shareToWithdraw: BigNumber;
  expectStableEquity: BigNumber;
  expectStableDebt: BigNumber;
  expectAssetEquity: BigNumber;
  expectAssetDebt: BigNumber;
}

describe("DeltaNeutralVaultGatewayWithSpookySwap", () => {
  const ALPACA_MAX_PER_SEC = ethers.utils.parseEther("1");
  const BOO_PER_SEC = ethers.utils.parseEther("0");
  const REINVEST_BOUNTY_BPS = "100"; // 1% reinvest bounty
  const RESERVE_POOL_BPS = "1000"; // 10% reserve pool
  const KILL_PRIZE_BPS = "1000"; // 10% Kill prize
  const INTEREST_RATE = "0"; // 0% per year
  const MIN_DEBT_SIZE = ethers.utils.parseEther("0.1"); // 1 BTOKEN min debt size
  const WORK_FACTOR = "999999"; // delta neutral worker should have no cap workfactor
  const KILL_FACTOR = "8000";
  const DEPLOYER = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";
  const KILL_TREASURY_BPS = "100";
  const POOL_ID = 0;

  // Delta Vault Config
  const REBALANCE_FACTOR = "6800";
  const POSITION_VALUE_TOLERANCE_BPS = "200";
  const MAX_VAULT_POSITION_VALUE = ethers.utils.parseEther("100000");
  const DEBT_RATIO_TOLERANCE_BPS = "30";

  // Delta Vault Actions
  const ACTION_WORK = 1;
  const ACTION_WRAP = 2;

  /// Spookyswap-related instance(s)
  let factory: WaultSwapFactory;
  let router: WaultSwapRouter;

  let wbnb: MockWBNB;
  let lp: PancakePair;

  /// Token-related instance(s)
  let baseToken: MockERC20;
  let boo: SpookyToken;
  let syrup: SyrupBar;
  let debtToken: DebtToken;

  /// Strategy-ralted instance(s)
  let addStrat: SpookySwapStrategyAddBaseTokenOnly;
  let stableTwoSidesStrat: SpookySwapStrategyAddTwoSidesOptimal;
  let assetTwoSidesStrat: SpookySwapStrategyAddTwoSidesOptimal;
  let liqStrat: SpookySwapStrategyLiquidate;
  let minimizeStrat: SpookySwapStrategyWithdrawMinimizeTrading;
  let partialCloseStrat: SpookySwapStrategyPartialCloseLiquidate;
  let partialCloseMinimizeStrat: SpookySwapStrategyPartialCloseMinimizeTrading;

  /// Vault-related instance(s)
  let stableSimpleVaultConfig: SimpleVaultConfig;
  let assetSimpleVaultConfig: SimpleVaultConfig;
  let wNativeRelayer: WNativeRelayer;
  let stableVault: Vault;
  let assetVault: Vault;
  let deltaVault: DeltaNeutralVault;
  let deltaVaultConfig: DeltaNeutralVaultConfig;
  let deltaVaultGateway: DeltaNeutralVaultGateway;

  /// DeltaNeutralOracle instance
  let mockPriceOracle: FakeContract<DeltaNeutralOracle>;

  /// MiniFairLaunch-related instance(s)
  let miniFL: MockMiniFL;

  let alpacaToken: AlpacaToken;
  let extraToken: MockERC20;

  /// SpookyMasterChef-related instance(s)
  let masterChef: SpookyMasterChef;
  let stableVaultWorker: DeltaNeutralSpookyWorker03;
  let assetVaultWorker: DeltaNeutralSpookyWorker03;

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

  let pancakeMasterChefAsAlice: SpookyMasterChef;
  let pancakeMasterChefAsBob: SpookyMasterChef;

  let pancakeswapV2WorkerAsEve: DeltaNeutralSpookyWorker03__factory;
  let pancakeswapV2Worker01AsEve: DeltaNeutralSpookyWorker03__factory;

  let deltaVaultAsAlice: DeltaNeutralVault;
  let deltaVaultAsBob: DeltaNeutralVault;
  let deltaVaultAsEve: DeltaNeutralVault;

  let deltaVaultGatewayAsDeployer: DeltaNeutralVaultGateway;
  let deltaVaultGatewayAsAlice: DeltaNeutralVaultGateway;

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
        decimals: "18",
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

    [factory, router, boo, masterChef] = await deployHelper.deploySpookySwap(wbnb, BOO_PER_SEC, [
      { address: deployerAddress, amount: ethers.utils.parseEther("100") },
    ]);

    [alpacaToken, miniFL] = await deployHelper.deployAlpacaMockMiniFL(ALPACA_MAX_PER_SEC);

    [stableVault, stableSimpleVaultConfig, wNativeRelayer] = await deployHelper.deployMiniFLVault(
      wbnb,
      {
        minDebtSize: MIN_DEBT_SIZE,
        interestRate: INTEREST_RATE,
        reservePoolBps: RESERVE_POOL_BPS,
        killPrizeBps: KILL_PRIZE_BPS,
        killTreasuryBps: KILL_TREASURY_BPS,
        killTreasuryAddress: DEPLOYER,
      },
      miniFL,
      ethers.constants.AddressZero,
      baseToken
    );

    [assetVault, assetSimpleVaultConfig] = await deployHelper.deployMiniFLVault(
      wbnb,
      {
        minDebtSize: MIN_DEBT_SIZE,
        interestRate: INTEREST_RATE,
        reservePoolBps: RESERVE_POOL_BPS,
        killPrizeBps: KILL_PRIZE_BPS,
        killTreasuryBps: KILL_TREASURY_BPS,
        killTreasuryAddress: DEPLOYER,
      },
      miniFL,
      ethers.constants.AddressZero,
      wbnb as unknown as MockERC20
    );

    await assetVault.setFairLaunchPoolId(1);
    await miniFL.approveStakeDebtToken([1], [assetVault.address], true);

    /// Set reward per second on both MiniFL and Rewarder
    await miniFL.setAlpacaPerSecond(ALPACA_MAX_PER_SEC, true);

    //transfer alpacaToken to miniFl
    await alpacaToken.transferOwnership(miniFL.address);

    // Setup strategies
    [addStrat, liqStrat, stableTwoSidesStrat, minimizeStrat, partialCloseStrat, partialCloseMinimizeStrat] =
      await deployHelper.deploySpookySwapStrategies(router, stableVault, wNativeRelayer);

    const SpookySwapStrategyAddTwoSidesOptimal = (await ethers.getContractFactory(
      "SpookySwapStrategyAddTwoSidesOptimal",
      deployer
    )) as SpookySwapStrategyAddTwoSidesOptimal__factory;
    assetTwoSidesStrat = (await upgrades.deployProxy(SpookySwapStrategyAddTwoSidesOptimal, [
      router.address,
      assetVault.address,
    ])) as SpookySwapStrategyAddTwoSidesOptimal;

    // Setup BTOKEN-WBNB pair on Pancakeswap
    // Add lp to masterChef's pool
    await factory.createPair(baseToken.address, wbnb.address);
    lp = PancakePair__factory.connect(await factory.getPair(wbnb.address, baseToken.address), deployer);
    await masterChef.add(1, lp.address);

    /// Setup DeltaNeutralSpookyWorker03
    stableVaultWorker = await deployHelper.deployDeltaNeutralSpookyWorker03(
      stableVault,
      baseToken,
      masterChef,
      router,
      POOL_ID,
      WORK_FACTOR,
      KILL_FACTOR,
      addStrat,
      REINVEST_BOUNTY_BPS,
      [eveAddress],
      DEPLOYER,
      [boo.address, wbnb.address, baseToken.address],
      [
        stableTwoSidesStrat.address,
        minimizeStrat.address,
        partialCloseStrat.address,
        partialCloseMinimizeStrat.address,
      ],
      stableSimpleVaultConfig,
      mockPriceOracle.address
    );

    /// Setup DeltaNeutralSpookyWorker03
    assetVaultWorker = await deployHelper.deployDeltaNeutralSpookyWorker03(
      assetVault,
      wbnb as unknown as MockERC20,
      masterChef,
      router,
      POOL_ID,
      WORK_FACTOR,
      KILL_FACTOR,
      addStrat,
      REINVEST_BOUNTY_BPS,
      [eveAddress],
      DEPLOYER,
      [boo.address, wbnb.address],
      [assetTwoSidesStrat.address, minimizeStrat.address, partialCloseStrat.address, partialCloseMinimizeStrat.address],
      assetSimpleVaultConfig,
      mockPriceOracle.address
    );

    swapHelper = new SwapHelper(factory.address, router.address, BigNumber.from(9980), BigNumber.from(10000), deployer);

    await swapHelper.addLiquidities([
      {
        token0: boo as unknown as IERC20,
        token1: wbnb as unknown as IERC20,
        amount0desired: ethers.utils.parseEther("100"),
        amount1desired: ethers.utils.parseEther("1000"),
      },
    ]);

    // Set up Delta Neutral Vault Config
    const deltaNeutralConfig = {
      wNativeAddr: wbnb.address,
      wNativeRelayer: wNativeRelayer.address,
      fairlaunchAddr: miniFL.address,
      rebalanceFactor: REBALANCE_FACTOR,
      positionValueTolerance: POSITION_VALUE_TOLERANCE_BPS,
      depositFeeTreasury: eveAddress,
      managementFeeTreasury: eveAddress,
      withdrawFeeTreasury: eveAddress,
      alpacaTokenAddress: alpacaToken.address,
      debtRatioTolerance: DEBT_RATIO_TOLERANCE_BPS,
    } as IDeltaNeutralVaultConfig;

    deltaVaultConfig = await deployHelper.deployDeltaNeutralVaultConfig(deltaNeutralConfig);
    // allow deployer to call rebalance
    await deltaVaultConfig.setValueLimit(MAX_VAULT_POSITION_VALUE);
    await deltaVaultConfig.setWhitelistedRebalancer([deployerAddress], true);
    await deltaVaultConfig.setLeverageLevel(3);
    await deltaVaultConfig.setwhitelistedReinvestors([deployerAddress], true);
    const reinvestStablePath = [alpacaToken.address, baseToken.address];
    await deltaVaultConfig.setSwapRouter(router.address);
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

    // Setup Delta Neutral Gateway
    deltaVaultGateway = await deployHelper.deployDeltaNeutralGateway({
      deltaVault: deltaVault.address,
      router: router.address,
    });

    // allow deltaVaultGateway as whitelisted to call delta neutral vault
    await deltaVaultConfig.setWhitelistedCallers([deltaVaultGateway.address], true);

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

    fairLaunchAsAlice = FairLaunch__factory.connect(miniFL.address, alice);

    pancakeMasterChefAsAlice = SpookyMasterChef__factory.connect(masterChef.address, alice);
    pancakeMasterChefAsBob = SpookyMasterChef__factory.connect(masterChef.address, bob);

    deltaVaultAsAlice = DeltaNeutralVault__factory.connect(deltaVault.address, alice);
    deltaVaultAsBob = DeltaNeutralVault__factory.connect(deltaVault.address, bob);
    deltaVaultAsEve = DeltaNeutralVault__factory.connect(deltaVault.address, eve);

    deltaVaultGatewayAsDeployer = DeltaNeutralVaultGateway__factory.connect(deltaVaultGateway.address, deployer);
    deltaVaultGatewayAsAlice = DeltaNeutralVaultGateway__factory.connect(deltaVaultGateway.address, alice);
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

  async function simpleWithdrawFromGateWay(
    withdrawValue: BigNumber,
    minWithdrawStableAmount: BigNumber,
    minWithdrawAssetTokenAmount: BigNumber,
    minSwapStableAmount: BigNumber,
    minSwapAssetTokenAmount: BigNumber,
    returnsBps: number
  ): Promise<SimpleWithdrawReturns> {
    await swapHelper.loadReserves([baseToken.address, wbnb.address]);
    const lpPrice = await swapHelper.computeLpHealth(ethers.utils.parseEther("1"), baseToken.address, wbnb.address);
    await setMockLpPrice(lpPrice);

    // Current Delta Neutral Position
    // Stable Position:
    // Equity=497.484763125748942067, PositionValue=1497.484763125748942067 Debt=1000.00
    // Asset Position:
    // Equity=1492.437648397226931363, PositionValue=4492.437648397226931363, Debt=3000.00
    // totalEquity=497.484763125748942067 + 1492.437648397226931363 = 1989.92241152297587343

    // ***** Target: Delta Neutral Position After Withdraw 200 Equity *****
    // totalEquity = 1989.92241152297587343 - 200 = 1789.92241152297587343
    // - % equity to withdraw
    // % stableEquity = 497.484763125748942067/1989.92241152297587343 = 0.250002090656892390
    // % assetEquity = 1492.437648397226931363/1989.92241152297587343 = 0.749997909343107609

    // Target Stable Position:
    // Equity = 1789.92241152297587343*0.250002090656892390 = 447.484344994370462196
    // PositionValue = 447.484344994370462196 * Lerverage = 447.484344994370462196*3 = 1342.453034983111386588
    // Debt = 1342.453034983111386588 - 447.484344994370462196 = 894.968689988740924392
    // deltaEquity = 447.484344994370462196 - 497.484763125748942067 = -50.000418131378479871
    // debtaDebt = 894.968689988740924392 - 1000.00 = -105.031310011259075608

    // deltaEquityWithSlippage = -50.000418131378479871 * 9970/10000 = -49.850416876984344431
    // deltaDebtWithSlippage = -105.031310011259075608 * 9970/10000 = -104.716216081225298381

    // expectStableEquity = 447.484344994370462196 + (50.000418131378479871 - 49.850417244373105111) = 447.634345881375836956
    // expectStableDebt = 894.968689988740924392 + (105.031310011259075608 - 104.716216081225298381) = 895.283783918774701619

    // Target Asset Position:
    // Equity = 1789.92241152297587343 * 0.749997909343107609 = 1342.438066528605409443
    // PositionValue = 1342.438066528605409443 * 3 = 4027.314199585816228329
    // Debt = 4027.314199585816228329 - 1342.438066528605409443 = 2684.876133057210818886
    // deltaEquity = 1342.438066528605409443 - 1492.437648397226931363 = -149.99958186862152192
    // debtaDebt = 2684.876133057210818886 - 3000  = -315.123866942789181114

    // deltaEquityWithSlippage = -149.99958186862152192 * 9970/10000 = -149.549583123015657354
    // deltaDebtWithSlippage = -315.123866942789181114 * 9970/10000 = -314.178495341960813570

    // expectAssetEquity = 1342.438066528605409443 + (149.99958186862152192 - 149.549583123015657354) = 1342.888065274211274009
    // expectAssetDebt = 2684.876133057210818886 + (315.123866942789181114 - 314.178495341960813570) = 2685.821504658039186429

    const expectStableEquity = ethers.utils.parseEther("447.634345881375836956");
    const expectStableDebt = ethers.utils.parseEther("895.283783918774701619");
    const expectAssetEquity = ethers.utils.parseEther("1342.888065274211274009");
    const expectAssetDebt = ethers.utils.parseEther("2685.821504658039186429");

    // Action1: partialCloseMinimize lp = 78.004799780378508254
    // return stableToken = 104.716216081225298381, repay debt -104.716216081225298381, remaining = 0
    // return assetToken = 49.951420020832256712 // log from contract

    const stableDebtToRepay = ethers.utils.parseEther("104.716216081225298381");
    const stableValueToWithDraw = ethers.utils.parseEther("49.850416876984344431").add(stableDebtToRepay);
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

    // Action2: partialCloseMinimize lp = 234.028498471773286624
    // return stableToken = 149.856255013609029091 // log from contract
    // return assetToken = 314.178495341960813570, repay debt -314.178495341960813570, remaining = 0

    const assetDebtToRepay = ethers.utils.parseEther("314.178495341960813570");
    const assetValueToWithDraw = ethers.utils.parseEther("149.549583123015657354").add(assetDebtToRepay);
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

    const shareToWithdraw = await deltaVault.valueToShare(withdrawValue);

    const tx = await deltaVaultGatewayAsAlice.withdraw(
      shareToWithdraw,
      minWithdrawStableAmount,
      minWithdrawAssetTokenAmount,
      minSwapStableAmount,
      minSwapAssetTokenAmount,
      withdrawData,
      returnsBps,
      { gasPrice: 0 }
    );

    return {
      tx,
      shareToWithdraw,
      expectStableEquity,
      expectStableDebt,
      expectAssetEquity,
      expectAssetDebt,
    };
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
    // depsit fund into vaults
    await baseTokenAsDeployer.approve(stableVault.address, ethers.utils.parseEther("10000"));
    await stableVault.deposit(ethers.utils.parseEther("10000"));

    await wbnbTokenAsDeployer.approve(assetVault.address, ethers.utils.parseEther("10000"));
    await assetVault.deposit(ethers.utils.parseEther("10000"));
  });

  describe("#withdraw", async () => {
    beforeEach(async () => {
      // add liquidity
      await swapHelper.addLiquidities([
        {
          token0: baseToken as unknown as IERC20,
          token1: wbnb as unknown as IERC20,
          amount0desired: ethers.utils.parseEther("90000000"),
          amount1desired: ethers.utils.parseEther("90000000"),
        },
      ]);
      const stableTokenAmount = ethers.utils.parseEther("500");
      const assetTokenAmount = ethers.utils.parseEther("500");
      await baseTokenAsDeployer.approve(deltaVault.address, stableTokenAmount);

      const stableWorkbyteInput: IDepositWorkByte = {
        posId: 0,
        vaultAddress: stableVault.address,
        workerAddress: stableVaultWorker.address,
        twoSidesStrat: stableTwoSidesStrat.address,
        principalAmount: ethers.utils.parseEther("125"),
        borrowAmount: ethers.utils.parseEther("500"),
        farmingTokenAmount: ethers.utils.parseEther("125"),
        maxReturn: BigNumber.from(0),
        minLpReceive: BigNumber.from(0),
      };

      const assetWorkbyteInput: IDepositWorkByte = {
        posId: 0,
        vaultAddress: assetVault.address,
        workerAddress: assetVaultWorker.address,
        twoSidesStrat: assetTwoSidesStrat.address,
        principalAmount: ethers.utils.parseEther("375"),
        borrowAmount: ethers.utils.parseEther("1500"),
        farmingTokenAmount: ethers.utils.parseEther("375"),
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
      let lpPrice = ethers.utils.parseEther("2");

      await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
      await setMockLpPrice(lpPrice);

      const initTx = await deltaVault.initPositions(
        stableTokenAmount,
        assetTokenAmount,
        ethers.utils.parseEther("997.995214716531122224"),
        data,
        {
          value: assetTokenAmount,
        }
      );

      const depositStableTokenAmount = ethers.utils.parseEther("500");
      const depositAssetTokenAmount = ethers.utils.parseEther("500");

      await baseTokenAsAlice.approve(deltaVault.address, depositStableTokenAmount);

      const depositStableWorkbyteInput: IDepositWorkByte = {
        posId: 1,
        vaultAddress: stableVault.address,
        workerAddress: stableVaultWorker.address,
        twoSidesStrat: stableTwoSidesStrat.address,
        principalAmount: ethers.utils.parseEther("125"),
        borrowAmount: ethers.utils.parseEther("500"),
        farmingTokenAmount: ethers.utils.parseEther("125"),
        maxReturn: BigNumber.from(0),
        minLpReceive: BigNumber.from(0),
      };

      const depositAssetWorkbyteInput: IDepositWorkByte = {
        posId: 1,
        vaultAddress: assetVault.address,
        workerAddress: assetVaultWorker.address,
        twoSidesStrat: assetTwoSidesStrat.address,
        principalAmount: ethers.utils.parseEther("375"),
        borrowAmount: ethers.utils.parseEther("1500"),
        farmingTokenAmount: ethers.utils.parseEther("375"),
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

    context("when alice withdraw and expect returns stable amount 100%", async () => {
      it("should work", async () => {
        // ======== prepare for withdraw ======
        const withdrawValue = ethers.utils.parseEther("200");

        const minWithdrawStableAmount = ethers.utils.parseEther("149.856255013609029091");
        const minWithdrawAssetTokenAmount = ethers.utils.parseEther("49.951420020832256712");

        const minWithdrawStableAmountAfterSwap = ethers.utils.parseEther("0");
        const minWithdrawAssetAfterSwap = ethers.utils.parseEther("0");

        await deltaVaultAsAlice.approve(deltaVaultGateway.address, await deltaVault.balanceOf(aliceAddress));
        const aliceBaseTokenBefore = await baseToken.balanceOf(aliceAddress);
        const aliceShareBefore = await deltaVault.balanceOf(aliceAddress);

        // ======== withdraw ======
        const { tx, shareToWithdraw, expectStableEquity, expectStableDebt, expectAssetEquity, expectAssetDebt } =
          await simpleWithdrawFromGateWay(
            withdrawValue,
            minWithdrawStableAmount,
            minWithdrawAssetTokenAmount,
            minWithdrawStableAmountAfterSwap,
            minWithdrawAssetAfterSwap,
            10000
          );

        const aliceShareAfter = await deltaVault.balanceOf(aliceAddress);
        const aliceBaseTokenAfter = await baseToken.balanceOf(aliceAddress);
        const positionInfoAfter = await deltaVault.positionInfo();

        const baseTokenDiff = aliceBaseTokenAfter.sub(aliceBaseTokenBefore);
        const gatewayShare = await deltaVault.balanceOf(deltaVaultGatewayAsAlice.address);

        // check event
        expect(tx).to.emit(deltaVaultGateway, "LogWithdraw").withArgs(aliceAddress, baseTokenDiff, 0);

        // check user
        expect(aliceShareBefore.sub(aliceShareAfter)).to.eq(shareToWithdraw);

        // check gateway
        expect(gatewayShare).to.be.eq(BigNumber.from(0));
        expect(await baseToken.balanceOf(deltaVaultGateway.address)).to.be.eq(BigNumber.from(0));
        expect(await wbnb.balanceOf(deltaVaultGateway.address)).to.be.eq(BigNumber.from(0));

        // check position info
        Assert.assertAlmostEqual(positionInfoAfter.stablePositionEquity.toString(), expectStableEquity.toString());
        Assert.assertAlmostEqual(positionInfoAfter.stablePositionDebtValue.toString(), expectStableDebt.toString());
        Assert.assertAlmostEqual(positionInfoAfter.assetPositionEquity.toString(), expectAssetEquity.toString());
        Assert.assertAlmostEqual(positionInfoAfter.assetPositionDebtValue.toString(), expectAssetDebt.toString());
      });
    });

    context("when alice withdraw and expect returns native amount 100%", async () => {
      it("should work", async () => {
        // ======== prepare for withdraw ======
        const withdrawValue = ethers.utils.parseEther("200");

        const minWithdrawStableAmount = ethers.utils.parseEther("149.856255013609029091");
        const minWithdrawAssetTokenAmount = ethers.utils.parseEther("49.951420020832256712");

        const minWithdrawStableAmountAfterSwap = ethers.utils.parseEther("0");
        const minWithdrawAssetAfterSwap = ethers.utils.parseEther("0");

        await deltaVaultAsAlice.approve(deltaVaultGateway.address, await deltaVault.balanceOf(aliceAddress));
        const aliceNativeBefore = await alice.getBalance();
        const aliceShareBefore = await deltaVault.balanceOf(aliceAddress);

        // ======== withdraw ======
        const { tx, shareToWithdraw, expectStableEquity, expectStableDebt, expectAssetEquity, expectAssetDebt } =
          await simpleWithdrawFromGateWay(
            withdrawValue,
            minWithdrawStableAmount,
            minWithdrawAssetTokenAmount,
            minWithdrawStableAmountAfterSwap,
            minWithdrawAssetAfterSwap,
            0
          );

        const aliceShareAfter = await deltaVault.balanceOf(aliceAddress);
        const aliceNativeAfter = await alice.getBalance();
        const positionInfoAfter = await deltaVault.positionInfo();

        const nativeTokenDiff = aliceNativeAfter.sub(aliceNativeBefore);
        const gatewayShare = await deltaVault.balanceOf(deltaVaultGatewayAsAlice.address);

        // check event
        expect(tx).to.emit(deltaVaultGateway, "LogWithdraw").withArgs(aliceAddress, 0, nativeTokenDiff);

        // check user
        expect(aliceShareBefore.sub(aliceShareAfter)).to.eq(shareToWithdraw);

        // check gateway
        expect(gatewayShare).to.be.eq(BigNumber.from(0));
        expect(await baseToken.balanceOf(deltaVaultGateway.address)).to.be.eq(BigNumber.from(0));
        expect(await wbnb.balanceOf(deltaVaultGateway.address)).to.be.eq(BigNumber.from(0));

        // check position info
        Assert.assertAlmostEqual(positionInfoAfter.stablePositionEquity.toString(), expectStableEquity.toString());
        Assert.assertAlmostEqual(positionInfoAfter.stablePositionDebtValue.toString(), expectStableDebt.toString());
        Assert.assertAlmostEqual(positionInfoAfter.assetPositionEquity.toString(), expectAssetEquity.toString());
        Assert.assertAlmostEqual(positionInfoAfter.assetPositionDebtValue.toString(), expectAssetDebt.toString());
      });
    });

    context("when alice withdraw and expect returns stable amount 50% and native amount 50%", async () => {
      it("should work", async () => {
        // ======== prepare for withdraw ======
        const withdrawValue = ethers.utils.parseEther("200");

        const minWithdrawStableAmount = ethers.utils.parseEther("149.856255013609029091");
        const minWithdrawAssetTokenAmount = ethers.utils.parseEther("49.951420020832256712");
        // in normal case user will receive stable: 149.856255013609029091 asset: 49.951420020832256712
        // but user provide return bsp of stable token as 50% and asset token 50%
        // stable price = 1, asset price = 1
        // stable value = 149.856255013609029091 * 1 = 149.856255013609029091
        // asset value = 49.951420020832256712 * 1 = 49.951420020832256712
        // total value = 149.856255013609029091 + 49.951420020832256712 = 199.807675034441285803
        // expected stable bps is 5000 = 0.5
        // expected stable value = 199.807675034441285803 * 0.5 = 99.903837517220642901
        // bps calculation
        // current stable value 149.856255013609029091 that grater then expected value
        // have to swap out (149.856255013609029091 - 99.903837517220642901) / 1 = 49.952417496388386190
        // after swap will got asset amount 49853532174819104048 // get from log in contract
        // expected
        // stable amount = 149.856255013609029091 - 49.952417496388386190 = 99.903837517220642901
        // asset amount = 49.951420020832256712 + 49853532174819104048 = 99.804952195651360760

        const minWithdrawStableAmountAfterSwap = ethers.utils.parseEther("99.903837517220642901");
        const minWithdrawAssetAfterSwap = ethers.utils.parseEther("99.804952195651360760");

        await deltaVaultAsAlice.approve(deltaVaultGateway.address, await deltaVault.balanceOf(aliceAddress));
        const aliceShareBefore = await deltaVault.balanceOf(aliceAddress);

        // ======== withdraw ======
        const { tx, shareToWithdraw, expectStableEquity, expectStableDebt, expectAssetEquity, expectAssetDebt } =
          await simpleWithdrawFromGateWay(
            withdrawValue,
            minWithdrawStableAmount,
            minWithdrawAssetTokenAmount,
            minWithdrawStableAmountAfterSwap,
            minWithdrawAssetAfterSwap,
            5000
          );

        const aliceShareAfter = await deltaVault.balanceOf(aliceAddress);
        const positionInfoAfter = await deltaVault.positionInfo();

        const gatewayShare = await deltaVault.balanceOf(deltaVaultGatewayAsAlice.address);

        // check event
        expect(tx)
          .to.emit(deltaVaultGateway, "LogWithdraw")
          .withArgs(aliceAddress, minWithdrawStableAmountAfterSwap, minWithdrawAssetAfterSwap);

        // check user
        expect(aliceShareBefore.sub(aliceShareAfter)).to.eq(shareToWithdraw);

        // check gateway
        expect(gatewayShare).to.be.eq(BigNumber.from(0));
        expect(await baseToken.balanceOf(deltaVaultGateway.address)).to.be.eq(BigNumber.from(0));
        expect(await wbnb.balanceOf(deltaVaultGateway.address)).to.be.eq(BigNumber.from(0));

        // check position info
        Assert.assertAlmostEqual(positionInfoAfter.stablePositionEquity.toString(), expectStableEquity.toString());
        Assert.assertAlmostEqual(positionInfoAfter.stablePositionDebtValue.toString(), expectStableDebt.toString());
        Assert.assertAlmostEqual(positionInfoAfter.assetPositionEquity.toString(), expectAssetEquity.toString());
        Assert.assertAlmostEqual(positionInfoAfter.assetPositionDebtValue.toString(), expectAssetDebt.toString());
      });

      context("someone transfer token in delta vault gateway", () => {
        it("should still return correct amount", async () => {
          // deployer transfer token in delta vault gateway
          // 10 for stable token and 5 for asset token
          const depositedStableAmount = ethers.utils.parseEther("10");
          const depositedAssetAmount = ethers.utils.parseEther("5");

          await baseTokenAsDeployer.transfer(deltaVaultGateway.address, depositedStableAmount);
          await wbnbTokenAsDeployer.transfer(deltaVaultGateway.address, depositedAssetAmount);

          // ======== prepare for withdraw ======
          const withdrawValue = ethers.utils.parseEther("200");

          const minWithdrawStableAmount = ethers.utils.parseEther("149.856255013609029091");
          const minWithdrawAssetTokenAmount = ethers.utils.parseEther("49.951420020832256712");
          // in normal case user will receive stable: 149.856255013609029091 asset: 49.951420020832256712
          // but user provide return bsp of stable token as 50% and asset token 50%
          // stable price = 1, asset price = 1
          // stable value = 149.856255013609029091 * 1 = 149.856255013609029091
          // asset value = 49.951420020832256712 * 1 = 49.951420020832256712
          // total value = 149.856255013609029091 + 49.951420020832256712 = 199.807675034441285803
          // expected stable bps is 5000 = 0.5
          // expected stable value = 199.807675034441285803 * 0.5 = 99.903837517220642901
          // bps calculation
          // current stable value 149.856255013609029091 that grater then expected value
          // have to swap out (149.856255013609029091 - 99.903837517220642901) / 1 = 49.952417496388386190
          // after swap will got asset amount 49853532174819104048 // get from log in contract
          // expected
          // stable amount = 149.856255013609029091 - 49.952417496388386190 = 99.903837517220642901
          // asset amount = 49.951420020832256712 + 49853532174819104048 = 99.804952195651360760

          const minWithdrawStableAmountAfterSwap = ethers.utils.parseEther("99.903837517220642901");
          const minWithdrawAssetAfterSwap = ethers.utils.parseEther("99.804952195651360760");

          await deltaVaultAsAlice.approve(deltaVaultGateway.address, await deltaVault.balanceOf(aliceAddress));
          const aliceShareBefore = await deltaVault.balanceOf(aliceAddress);

          // ======== withdraw ======
          const { tx, shareToWithdraw, expectStableEquity, expectStableDebt, expectAssetEquity, expectAssetDebt } =
            await simpleWithdrawFromGateWay(
              withdrawValue,
              minWithdrawStableAmount,
              minWithdrawAssetTokenAmount,
              minWithdrawStableAmountAfterSwap,
              minWithdrawAssetAfterSwap,
              5000
            );

          const aliceShareAfter = await deltaVault.balanceOf(aliceAddress);
          const positionInfoAfter = await deltaVault.positionInfo();

          const gatewayShare = await deltaVault.balanceOf(deltaVaultGatewayAsAlice.address);

          // check event
          expect(tx)
            .to.emit(deltaVaultGateway, "LogWithdraw")
            .withArgs(aliceAddress, minWithdrawStableAmountAfterSwap, minWithdrawAssetAfterSwap);

          // check user
          expect(aliceShareBefore.sub(aliceShareAfter)).to.eq(shareToWithdraw);

          // check gateway
          // stable token amount should have 10 in delta vault gateway
          // asset token amount should have 5 in delta vault gateway
          expect(gatewayShare).to.be.eq(BigNumber.from(0));
          expect(await baseToken.balanceOf(deltaVaultGateway.address)).to.be.eq(depositedStableAmount);
          expect(await wbnb.balanceOf(deltaVaultGateway.address)).to.be.eq(depositedAssetAmount);

          // check position info
          Assert.assertAlmostEqual(positionInfoAfter.stablePositionEquity.toString(), expectStableEquity.toString());
          Assert.assertAlmostEqual(positionInfoAfter.stablePositionDebtValue.toString(), expectStableDebt.toString());
          Assert.assertAlmostEqual(positionInfoAfter.assetPositionEquity.toString(), expectAssetEquity.toString());
          Assert.assertAlmostEqual(positionInfoAfter.assetPositionDebtValue.toString(), expectAssetDebt.toString());
        });
      });

      context("but alice expect return amount too much on stable side", async () => {
        it("should revert", async () => {
          // ======== prepare for withdraw ======
          const withdrawValue = ethers.utils.parseEther("200");

          const minWithdrawStableAmount = ethers.utils.parseEther("149.856255013609029091");
          const minWithdrawAssetTokenAmount = ethers.utils.parseEther("49.951420020832256712");
          // in normal case user will receive stable: 149.856255013609029091 asset: 49.951420020832256712
          // but user provide return bsp of stable token as 50% and asset token 50%
          // stable price = 1, asset price = 1
          // stable value = 149.856255013609029091 * 1 = 149.856255013609029091
          // asset value = 49.951420020832256712 * 1 = 49.951420020832256712
          // total value = 149.856255013609029091 + 49.951420020832256712 = 199.807675034441285803
          // expected stable bps is 5000 = 0.5
          // expected stable value = 199.807675034441285803 * 0.5 = 99.903837517220642901
          // bps calculation
          // current stable value 149.856255013609029091 that grater then expected value
          // have to swap out (149.856255013609029091 - 99.903837517220642901) / 1 = 49.952417496388386190
          // after swap will got asset amount 49853532174819104048 // get from log in contract
          // expected
          // stable amount = 149.856255013609029091 - 49.952417496388386190 = 99.903837517220642901
          // asset amount = 49.951420020832256712 + 49853532174819104048 = 99.804952195651360760

          const minWithdrawStableAmountAfterSwap = ethers.utils.parseEther("99.903837517220642901");
          const minWithdrawAssetAfterSwap = ethers.utils.parseEther("99.804952195651360760");
          const expectedMinWithdrawStableAmountAfterSwap = ethers.utils.parseEther("100");

          await deltaVaultAsAlice.approve(deltaVaultGateway.address, await deltaVault.balanceOf(aliceAddress));

          // ======== withdraw ======
          await expect(
            simpleWithdrawFromGateWay(
              withdrawValue,
              minWithdrawStableAmount,
              minWithdrawAssetTokenAmount,
              expectedMinWithdrawStableAmountAfterSwap,
              minWithdrawAssetAfterSwap,
              5000
            )
          ).to.be.revertedWith(
            `DeltaNeutralVaultGateway_InsufficientReceive(${minWithdrawStableAmountAfterSwap}, ${minWithdrawAssetAfterSwap}, ${expectedMinWithdrawStableAmountAfterSwap}, ${minWithdrawAssetAfterSwap})`
          );
        });
      });

      context("but alice expect return amount too much on asset side", async () => {
        it("should revert", async () => {
          // ======== prepare for withdraw ======
          const withdrawValue = ethers.utils.parseEther("200");

          const minWithdrawStableAmount = ethers.utils.parseEther("149.856255013609029091");
          const minWithdrawAssetTokenAmount = ethers.utils.parseEther("49.951420020832256712");
          // in normal case user will receive stable: 149.856255013609029091 asset: 49.951420020832256712
          // but user provide return bsp of stable token as 50% and asset token 50%
          // stable price = 1, asset price = 1
          // stable value = 149.856255013609029091 * 1 = 149.856255013609029091
          // asset value = 49.951420020832256712 * 1 = 49.951420020832256712
          // total value = 149.856255013609029091 + 49.951420020832256712 = 199.807675034441285803
          // expected stable bps is 5000 = 0.5
          // expected stable value = 199.807675034441285803 * 0.5 = 99.903837517220642901
          // bps calculation
          // current stable value 149.856255013609029091 that grater then expected value
          // have to swap out (149.856255013609029091 - 99.903837517220642901) / 1 = 49.952417496388386190
          // after swap will got asset amount 49853532174819104048 // get from log in contract
          // expected
          // stable amount = 149.856255013609029091 - 49.952417496388386190 = 99.903837517220642901
          // asset amount = 49.951420020832256712 + 49853532174819104048 = 99.804952195651360760

          const minWithdrawStableAmountAfterSwap = ethers.utils.parseEther("99.903837517220642901");
          const minWithdrawAssetAfterSwap = ethers.utils.parseEther("99.804952195651360760");
          const expectMinWithdrawAssetAmountAfterSwap = ethers.utils.parseEther("100");

          await deltaVaultAsAlice.approve(deltaVaultGateway.address, await deltaVault.balanceOf(aliceAddress));

          // ======== withdraw ======
          await expect(
            simpleWithdrawFromGateWay(
              withdrawValue,
              minWithdrawStableAmount,
              minWithdrawAssetTokenAmount,
              minWithdrawStableAmountAfterSwap,
              expectMinWithdrawAssetAmountAfterSwap,
              5000
            )
          ).to.be.revertedWith(
            `DeltaNeutralVaultGateway_InsufficientReceive(${minWithdrawStableAmountAfterSwap}, ${minWithdrawAssetAfterSwap}, ${minWithdrawStableAmountAfterSwap}, ${expectMinWithdrawAssetAmountAfterSwap})`
          );
        });
      });
    });

    context("when alice withdraw and when user expected stable return bps more than 10000 (100%)", async () => {
      it("should not be able to withdraw", async () => {
        const withdrawData = ethers.utils.defaultAbiCoder.encode(["uint8[]", "uint256[]", "bytes[]"], [[], [], []]);

        await expect(
          deltaVaultGatewayAsAlice.withdraw(
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("0"),
            ethers.utils.parseEther("0"),
            withdrawData,
            1000000,
            { gasPrice: 0 }
          )
        ).to.be.revertedWith("ReturnBpsExceed(1000000)");
      });
    });
  });

  describe("#transfer", async () => {
    context("when alice transfer tokens into delta vault gateway", async () => {
      context("alice and try call .transfer() from delta vault gateway by herself", async () => {
        it("should revert", async () => {
          await baseTokenAsAlice.transfer(deltaVaultGateway.address, ethers.utils.parseEther("1"));
          await expect(
            deltaVaultGatewayAsAlice.transfer(baseToken.address, aliceAddress, ethers.utils.parseEther("1"))
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });
      });

      context("deployer call .transfer() back stable to alice", async () => {
        it("should work", async () => {
          const depositedAmount = ethers.utils.parseEther("1");
          await baseTokenAsAlice.transfer(deltaVaultGateway.address, depositedAmount);
          const aliceStableBefore = await baseToken.balanceOf(aliceAddress);

          expect(await baseToken.balanceOf(deltaVaultGateway.address)).to.be.eq(depositedAmount);

          await expect(deltaVaultGatewayAsDeployer.transfer(baseToken.address, aliceAddress, depositedAmount))
            .to.be.emit(deltaVaultGateway, "LogTransfer")
            .withArgs(baseToken.address, aliceAddress, depositedAmount);

          const aliceStableAfter = await baseToken.balanceOf(aliceAddress);
          expect(aliceStableAfter.sub(aliceStableBefore)).to.be.eq(depositedAmount);
        });
      });

      context("deployer call .transfer() native back to alice", async () => {
        it("should work", async () => {
          const depositedAmount = ethers.utils.parseEther("1");
          let tx = {
            to: deltaVaultGateway.address,
            // Convert currency unit from ether to wei
            value: depositedAmount,
          };
          await alice.sendTransaction(tx);

          const aliceNativeBefore = await alice.getBalance();

          await expect(deltaVaultGatewayAsDeployer.transfer(wbnb.address, aliceAddress, depositedAmount))
            .to.be.emit(deltaVaultGateway, "LogTransfer")
            .withArgs(wbnb.address, aliceAddress, depositedAmount);

          const aliceNativeAfter = await alice.getBalance();
          expect(aliceNativeAfter.sub(aliceNativeBefore)).to.be.eq(depositedAmount);
        });
      });
    });
  });
});
