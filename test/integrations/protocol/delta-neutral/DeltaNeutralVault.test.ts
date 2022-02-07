import { ethers, upgrades, waffle } from "hardhat";
import { Signer, constants, BigNumber } from "ethers";
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
} from "../../../../typechain";
import * as Assert from "../../../helpers/assert";
import * as TimeHelpers from "../../../helpers/time";
import { parseEther } from "ethers/lib/utils";
import { DeployHelper, IDeltaNeutralVaultConfig } from "../../../helpers/deploy";
import { SwapHelper } from "../../../helpers/swap";
import { Worker02Helper } from "../../../helpers/worker";
import { MockContract, smockit } from "@eth-optimism/smock";
import { zeroAddress } from "ethereumjs-util";

chai.use(solidity);
const { expect } = chai;

describe("DeltaNeutralVault", () => {
  const FOREVER = "2000000000";
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther("1");
  // const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther("0.076");
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther("0");
  const REINVEST_BOUNTY_BPS = "100"; // 1% reinvest bounty
  const RESERVE_POOL_BPS = "1000"; // 10% reserve pool
  const KILL_PRIZE_BPS = "1000"; // 10% Kill prize
  const INTEREST_RATE = "3472222222222"; // 30% per year
  const MIN_DEBT_SIZE = ethers.utils.parseEther("0.1"); // 1 BTOKEN min debt size
  const WORK_FACTOR = "999999"; // delta neutral worker should have no cap workfactor
  const KILL_FACTOR = "8000";
  const MAX_REINVEST_BOUNTY: string = "900";
  const DEPLOYER = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";
  const BENEFICIALVAULT_BOUNTY_BPS = "1000";
  const REINVEST_THRESHOLD = ethers.utils.parseEther("1"); // If pendingCake > 1 $CAKE, then reinvest
  const KILL_TREASURY_BPS = "100";
  const POOL_ID = 1;
  const EMPTY_BYTE = ethers.utils.defaultAbiCoder.encode(["uint256"], [0]);

  // Delta Vault Config
  const REBALANCE_FACTOR = "6500";
  const POSITION_VALUE_TOLERANCE_BPS = "200";
  const MAX_VAULT_POSITION_VALUE = ethers.utils.parseEther("100000");
  const DEPOSIT_FEE_BPS = "0"; // 0%

  // Delta Vault
  const ACTION_WORK = 1;
  const ACTION_WRAP = 2;
  const ACTION_CONVERT_ASSET = 3;

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
  let mockPriceOracle: MockContract;

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
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let eve: Signer;

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
    mockPriceOracle = await smockit(await ethers.getContractFactory("DeltaNeutralOracle", deployer));

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
        minDebtSize: MIN_DEBT_SIZE,
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
        minDebtSize: MIN_DEBT_SIZE,
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
        token0: cake,
        token1: wbnb,
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
      treasuryAddr: eveAddress,
      alpacaBountyBps: BigNumber.from("100"),
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
    mockPriceOracle.smocked.getTokenPrice.will.return.with((token: string) => {
      if (token === baseToken.address) {
        return [stableTokenPrice, latest];
      }
      if (token === wbnb.address) {
        return [assetTokenPrice, latest];
      }
      return [0, latest];
    });
  }

  async function setMockLpPrice(lpPrice: BigNumber, lastUpdate?: BigNumber) {
    const latest = lastUpdate ? lastUpdate : await TimeHelpers.latest();
    mockPriceOracle.smocked.lpToDollar.will.return.with((lpAmount: BigNumber) => {
      return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
    });
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
            token0: baseToken,
            token1: wbnb,
            amount0desired: ethers.utils.parseEther("100000"),
            amount1desired: ethers.utils.parseEther("100000"),
          },
        ]);

        // stable token reserve = 100000, asset token reserve = 100000
        // deployer deposit 500 stable token, 500 asset token
        const depositStableTokenAmt = ethers.utils.parseEther("500");
        const depositAssetTokenAmt = ethers.utils.parseEther("500");

        await baseTokenAsDeployer.approve(deltaVault.address, depositStableTokenAmt);

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

        // Action 1:
        // stableToken = 625, assetToken = 125, stableReserve = 100000, assetReserve = 100000
        // swap stableToken 249.689057639671804928 to assetToken
        // [(swapAmt1*swapFee)*r0/(r1*10000+(swapAmt1*swapFee))
        // [((249.689057639671804928*9975)*100000)/(100000*10000+(249.689057639671804928*9975))] = 248.446043267854514597 assetToken]
        // - After Swap
        // stableReserve = 100000 + 249.689057639671804928 = 100249.689057639671804928
        // assetReserve = 100000 - 248.446043267854514597 = 99751.553956732145485403
        // lp supply = sqrt(100249.689057639671804928 * 99751.553956732145485403) = 100000.31133540917068154
        // stableToken = 625 - 249.689057639671804928 = 375.310942360328195072, assetToken = 125 + 248.446043267854514597 = 373.446043267854514597
        // amountB = amountA.mul(reserveB) / reserveA;
        // SafeMath.min(amount0.mul(_totalSupply) / _reserve0, amount1.mul(_totalSupply) / _reserve1);
        // 375.310942360328195072 * 100000.31133540917068154 / 100249.689057639671804928 = 374.377331604885467217
        // 373.446043267854514597 * 100000.31133540917068154 / 99751.553956732145485403 =  374.377331604885467214
        // stableWorker lp = 374.377331604885467214 , actual lp = 374.376166039317091196
        // - After add liquidity
        // stableReserve = 100249.689057639673 + 375.3109423603282 = 100625
        // assetReserve = 99751.55395673214 + 373.4460432678545 = 100125
        // lp supply = sqrt(100625 * 100125) = 100374.68866701405

        // Action 2: stableToken = 375, assetToken = 1875, stableReserve = 100625, assetReserve = 100125
        // swap 746.302038330887106153 assetToken to stableToken
        // [((746.302038330887106153*9975)*100625)/(100125*10000+(746.302038330887106153*9975))] = 742.6322953782392 stableToken]
        // - After Swap
        // stableReserve = 100625 - 742.6322953782392 = 99882.36770462176
        // assetReserve = 100125 + 746.302038330887106153 = 100871.30203833089
        // lp supply = sqrt(99882.36770462176 * 100871.30203833089) = 100375.61696466194
        // - Add liquidity
        // add liquidity stableToken = 375 + 742.6322953782392 = 1117.6117772394427, assetToken = 1875 - 746.302038330887106153 = 1128.6979616691128
        // 1117.6117772394427 * 100375.61696466194 / 99882.36770462176 = 1123.1308813096002
        // 1128.6979616691128 * 100375.61696466194 / 100871.30203833089 = 1123.151500773155
        // assetWorker lp = 1123.1308813096002, actual lp = 1123.137616875080116978
        // - After add liquidity
        // stableReserve = 99882.36770462176 + 1117.6117772394427 = 100999.9794818612
        // assetReserve = 100871.30203833089 + 1128.6979616691128 = 102000

        // positionValue = 2 * (374.376166039317091196 + 1123.137616875080116978) = 2995.027565828794
        // debtValue = (1 * 500) + (1 * 1500) = 2000
        // equityValue = 2995.027565828794 - 2000 = 995.0275658287942
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
        const lpPrice = ethers.utils.parseEther("2");

        await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
        await setMockLpPrice(lpPrice);

        // shareReceive  = depositValue * totalSupply / Equity
        // since totalSupply = 0, shareReceive = depositValue = (1*500 + 1*500) = 1000
        const minSharesReceive = ethers.utils.parseEther("1000");
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
        const assetPostId = await deltaVault.stableVaultPosId();
        const totalPositionEquity = await deltaVault.totalEquityValue();
        const deployerShare = await deltaVault.balanceOf(deployerAddress);
        expect(stablePosId).to.not.eq(0);
        expect(assetPostId).to.not.eq(0);
        expect(deployerShare).to.eq(minSharesReceive);

        expect(initTx)
          .to.emit(deltaVault, "LogInitializePositions")
          .withArgs(deployerAddress, stablePosId, assetPostId);

        // when deployer try to initialize positions again
        await expect(
          deltaVault.initPositions(depositStableTokenAmt, depositAssetTokenAmt, ethers.utils.parseEther("1"), data, {
            value: depositAssetTokenAmt,
          })
        ).to.revertedWith("PositionsAlreadyInitialized()");
      });
    });

    context("when leverage level is not 3x", async () => {
      it("should still work", async () => {
        await deltaVaultConfig.setLeverageLevel(5);
        // add liquidity
        await swapHelper.addLiquidities([
          {
            token0: baseToken,
            token1: wbnb,
            amount0desired: ethers.utils.parseEther("1000000"),
            amount1desired: ethers.utils.parseEther("1000000"),
          },
        ]);

        // stable token reserve = 100000, asset token reserve = 100000
        // deployer deposit 500 stable token, 500 asset token
        const stableTokenAmount = ethers.utils.parseEther("500");
        const assetTokenAmount = ethers.utils.parseEther("500");

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
          principalAmount: ethers.utils.parseEther("200"),
          borrowAmount: ethers.utils.parseEther("1500"),
          farmingTokenAmount: ethers.utils.parseEther("175"), // farming + pricipal = eqitty to supply
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
          principalAmount: ethers.utils.parseEther("325"),
          borrowAmount: ethers.utils.parseEther("2500"),
          farmingTokenAmount: ethers.utils.parseEther("300"),
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
        const lpPrice = ethers.utils.parseEther("2");

        await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
        await setMockLpPrice(lpPrice);

        const initTx = await deltaVault.initPositions(
          stableTokenAmount,
          assetTokenAmount,
          ethers.utils.parseEther("1000"),
          data,
          {
            value: assetTokenAmount,
          }
        );

        const stablePosId = await deltaVault.stableVaultPosId();
        const assetPostId = await deltaVault.stableVaultPosId();
        const deployerShare = await deltaVault.balanceOf(deployerAddress);
        expect(stablePosId).to.not.eq(0);
        expect(assetPostId).to.not.eq(0);
        expect(deployerShare).to.eq(ethers.utils.parseEther("1000"));
        expect(initTx)
          .to.emit(deltaVault, "LogInitializePositions")
          .withArgs(deployerAddress, stablePosId, assetPostId);
      });
    });
  });

  describe("#deposit", async () => {
    context("when alice try deposit to delta neutral vault before positions initialized", async () => {
      it("should revert", async () => {
        await swapHelper.addLiquidities([
          {
            token0: baseToken,
            token1: wbnb,
            amount0desired: ethers.utils.parseEther("100000"),
            amount1desired: ethers.utils.parseEther("100000"),
          },
        ]);

        const stableTokenAmount = ethers.utils.parseEther("500");
        const assetTokenAmount = ethers.utils.parseEther("500");

        await baseTokenAsAlice.approve(deltaVault.address, stableTokenAmount);

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
        const lpPrice = ethers.utils.parseEther("2");

        await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
        await setMockLpPrice(lpPrice);

        await expect(
          deltaVaultAsAlice.deposit(stableTokenAmount, assetTokenAmount, aliceAddress, 0, data, {
            value: assetTokenAmount,
          })
        ).to.revertedWith("PositionsNotInitialized()");
      });
    });

    describe("when positions initialized", async () => {
      beforeEach(async () => {
        // add liquidity
        await swapHelper.addLiquidities([
          {
            token0: baseToken,
            token1: wbnb,
            amount0desired: ethers.utils.parseEther("100000"),
            amount1desired: ethers.utils.parseEther("100000"),
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
        const lpPrice = ethers.utils.parseEther("2");
        await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
        await setMockLpPrice(lpPrice);

        const initTx = await deltaVault.initPositions(stableTokenAmount, assetTokenAmount, 0, data, {
          value: assetTokenAmount,
        });
      });

      context("when alice deposit to delta neutral vault", async () => {
        it("should be able to deposit", async () => {
          const depositStableTokenAmount = ethers.utils.parseEther("500");
          const depositAssetTokenAmount = ethers.utils.parseEther("500");

          await baseTokenAsAlice.approve(deltaVault.address, depositStableTokenAmount);

          const stableWorkbyteInput: IDepositWorkByte = {
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

          const assetWorkbyteInput: IDepositWorkByte = {
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
          const lpPrice = ethers.utils.parseEther("2");

          await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
          await setMockLpPrice(lpPrice);

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

          // alice expect to get
          // share supply before alice deposit = 1
          // alice deposit another 1 to delta neutral
          // alice should get shares =
          const aliceShare = await deltaVault.balanceOf(aliceAddress);
        });

        context("when received shares is lower than minimum shares should user receive", async () => {
          it("should revert", async () => {
            const stableTokenAmount = ethers.utils.parseEther("500");
            const assetTokenAmount = ethers.utils.parseEther("500");

            await baseTokenAsAlice.approve(deltaVault.address, stableTokenAmount);

            const stableWorkbyteInput: IDepositWorkByte = {
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

            const assetWorkbyteInput: IDepositWorkByte = {
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

            let stableTokenPrice = ethers.utils.parseEther("1");
            let assetTokenPrice = ethers.utils.parseEther("1");
            let lpPrice = ethers.utils.parseEther("2");

            await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
            await setMockLpPrice(lpPrice);

            await expect(
              deltaVaultAsAlice.deposit(
                stableTokenAmount,
                assetTokenAmount,
                aliceAddress,
                ethers.utils.parseEther("1000000000000"),
                data,
                {
                  value: assetTokenAmount,
                }
              )
            ).to.be.revertedWith("InsufficientShareReceived(1000000000000000000000000000000, 1005011311076074408315)");
          });
        });

        describe("_mint", async () => {
          context("when alice pass zero address as receiver", async () => {
            it("should revert", async () => {
              const stableTokenAmount = ethers.utils.parseEther("500");
              const assetTokenAmount = ethers.utils.parseEther("500");

              await baseTokenAsAlice.approve(deltaVault.address, stableTokenAmount);

              const stableWorkbyteInput: IDepositWorkByte = {
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

              const assetWorkbyteInput: IDepositWorkByte = {
                posId: 1,
                vaultAddress: assetVault.address,
                workerAddress: assetVaultWorker.address,
                twoSidesStrat: assetTwoSidesStrat.address,
                principalAmount: ethers.utils.parseEther("375"),
                borrowAmount: ethers.utils.parseEther("150"),
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

              let stableTokenPrice = ethers.utils.parseEther("1");
              let assetTokenPrice = ethers.utils.parseEther("1");
              let lpPrice = ethers.utils.parseEther("2");

              await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
              await setMockLpPrice(lpPrice);

              await expect(
                deltaVaultAsAlice.deposit(stableTokenAmount, assetTokenAmount, zeroAddress(), 0, data, {
                  value: assetTokenAmount,
                })
              ).to.be.revertedWith("ERC20: mint to the zero address");
            });
          });
        });

        describe("_doWork", async () => {
          context("alice try open position with different position id", async () => {
            it("should revert", async () => {
              const stableTokenAmount = ethers.utils.parseEther("500");
              const assetTokenAmount = ethers.utils.parseEther("500");

              await baseTokenAsAlice.approve(deltaVault.address, stableTokenAmount);

              const stableWorkbyteInput: IDepositWorkByte = {
                posId: 2,
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
                posId: 2,
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

              let stableTokenPrice = ethers.utils.parseEther("1");
              let assetTokenPrice = ethers.utils.parseEther("1");
              let lpPrice = ethers.utils.parseEther("2");

              await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
              await setMockLpPrice(lpPrice);

              await expect(
                deltaVaultAsAlice.deposit(stableTokenAmount, assetTokenAmount, aliceAddress, 0, data, {
                  value: assetTokenAmount,
                })
              ).to.be.revertedWith(`InvalidPositions("${stableVault.address}", 2)`);
            });
          });
        });

        describe("_depositHealthCheck", async () => {
          context(
            "when alice deposit with actions that resulted in unsafe position equity on stable side",
            async () => {
              it("should revert", async () => {
                const stableTokenAmount = ethers.utils.parseEther("510");
                const assetTokenAmount = ethers.utils.parseEther("500");
                await baseTokenAsAlice.approve(deltaVault.address, stableTokenAmount);
                const stableWorkbyteInput: IDepositWorkByte = {
                  posId: 1,
                  vaultAddress: stableVault.address,
                  workerAddress: stableVaultWorker.address,
                  twoSidesStrat: stableTwoSidesStrat.address,
                  principalAmount: ethers.utils.parseEther("0.13"),
                  borrowAmount: ethers.utils.parseEther("500"),
                  farmingTokenAmount: ethers.utils.parseEther("125"),
                  maxReturn: BigNumber.from(0),
                  minLpReceive: BigNumber.from(0),
                };
                const assetWorkbyteInput: IDepositWorkByte = {
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
                let stableTokenPrice = ethers.utils.parseEther("1");
                let assetTokenPrice = ethers.utils.parseEther("1");
                let lpPrice = ethers.utils.parseEther("2");

                await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
                await setMockLpPrice(lpPrice);

                await expect(
                  deltaVaultAsAlice.deposit(stableTokenAmount, assetTokenAmount, aliceAddress, 0, data, {
                    value: assetTokenAmount,
                  })
                ).to.be.revertedWith("UnsafePositionEquity()");
              });
            }
          );

          context("when alice deposit with actions that resulted in unsafe position equity on asset side", async () => {
            it("should revert", async () => {
              const stableTokenAmount = ethers.utils.parseEther("500");
              const assetTokenAmount = ethers.utils.parseEther("550");
              await baseTokenAsAlice.approve(deltaVault.address, stableTokenAmount);
              const stableWorkbyteInput: IDepositWorkByte = {
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
              const assetWorkbyteInput: IDepositWorkByte = {
                posId: 1,
                vaultAddress: assetVault.address,
                workerAddress: assetVaultWorker.address,
                twoSidesStrat: assetTwoSidesStrat.address,
                principalAmount: ethers.utils.parseEther("425"),
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
              let stableTokenPrice = ethers.utils.parseEther("1");
              let assetTokenPrice = ethers.utils.parseEther("1");
              let lpPrice = ethers.utils.parseEther("2");

              await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
              await setMockLpPrice(lpPrice);

              await expect(
                deltaVaultAsAlice.deposit(stableTokenAmount, assetTokenAmount, aliceAddress, 0, data, {
                  value: assetTokenAmount,
                })
              ).to.be.revertedWith("UnsafePositionEquity()");
            });
          });

          context("when alice deposit with actions that resulted in unsafe debt value on stable side", async () => {
            it("should revert", async () => {
              const stableTokenAmount = ethers.utils.parseEther("500");
              const assetTokenAmount = ethers.utils.parseEther("500");
              await baseTokenAsAlice.approve(deltaVault.address, stableTokenAmount);
              const stableWorkbyteInput: IDepositWorkByte = {
                posId: 1,
                vaultAddress: stableVault.address,
                workerAddress: stableVaultWorker.address,
                twoSidesStrat: stableTwoSidesStrat.address,
                principalAmount: ethers.utils.parseEther("125"),
                borrowAmount: ethers.utils.parseEther("100"),
                farmingTokenAmount: ethers.utils.parseEther("125"),
                maxReturn: BigNumber.from(0),
                minLpReceive: BigNumber.from(0),
              };
              const assetWorkbyteInput: IDepositWorkByte = {
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
              let stableTokenPrice = ethers.utils.parseEther("1");
              let assetTokenPrice = ethers.utils.parseEther("1");
              let lpPrice = ethers.utils.parseEther("2");

              await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
              await setMockLpPrice(lpPrice);

              await expect(
                deltaVaultAsAlice.deposit(stableTokenAmount, assetTokenAmount, aliceAddress, 0, data, {
                  value: assetTokenAmount,
                })
              ).to.be.revertedWith("UnsafeDebtValue()");
            });
          });

          context("when alice deposit with actions that resulted in unsafe debt value on asset side", async () => {
            it("should revert", async () => {
              const stableTokenAmount = ethers.utils.parseEther("500");
              const assetTokenAmount = ethers.utils.parseEther("500");
              await baseTokenAsAlice.approve(deltaVault.address, stableTokenAmount);
              const stableWorkbyteInput: IDepositWorkByte = {
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
              const assetWorkbyteInput: IDepositWorkByte = {
                posId: 1,
                vaultAddress: assetVault.address,
                workerAddress: assetVaultWorker.address,
                twoSidesStrat: assetTwoSidesStrat.address,
                principalAmount: ethers.utils.parseEther("375"),
                borrowAmount: ethers.utils.parseEther("2"),
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
              let stableTokenPrice = ethers.utils.parseEther("1");
              let assetTokenPrice = ethers.utils.parseEther("1");
              let lpPrice = ethers.utils.parseEther("2");

              await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
              await setMockLpPrice(lpPrice);

              await expect(
                deltaVaultAsAlice.deposit(stableTokenAmount, assetTokenAmount, aliceAddress, 0, data, {
                  value: assetTokenAmount,
                })
              ).to.be.revertedWith("UnsafeDebtValue()");
            });
          });
        });

        describe("_outstandingCheck", () => {
          context("when stable token amount in contract has descresed after deposit", async () => {
            it("should revert", async () => {
              await baseTokenAsAlice.transfer(deltaVault.address, ethers.utils.parseEther("400"));
              const reduceAmount = ethers.utils.parseEther("10");
              const stableTokenAmount = ethers.utils.parseEther("500").sub(reduceAmount);
              const assetTokenAmount = ethers.utils.parseEther("500");

              await baseTokenAsAlice.approve(deltaVault.address, stableTokenAmount);

              const stableWorkbyteInput: IDepositWorkByte = {
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

              const assetWorkbyteInput: IDepositWorkByte = {
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

              let stableTokenPrice = ethers.utils.parseEther("1");
              let assetTokenPrice = ethers.utils.parseEther("1");
              let lpPrice = ethers.utils.parseEther("2");

              await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
              await setMockLpPrice(lpPrice);

              const beforeBaseTokenAmount = await baseToken.balanceOf(deltaVault.address);
              const expected = beforeBaseTokenAmount.sub(reduceAmount);

              await expect(
                deltaVaultAsAlice.deposit(stableTokenAmount, assetTokenAmount, aliceAddress, 0, data, {
                  value: assetTokenAmount,
                })
              ).to.be.revertedWith(
                `UnsafeOutstanding("${baseToken.address}", ${beforeBaseTokenAmount.toString()}, ${expected.toString()})`
              );
            });

            context("when asset token amount in the contract has descresed after deposit", async () => {
              it("should revert", async () => {
                await wbnbTokenAsAlice.transfer(deltaVault.address, ethers.utils.parseEther("400"));
                const reduceAmount = ethers.utils.parseEther("10");
                const stableTokenAmount = ethers.utils.parseEther("500");
                const assetTokenAmount = ethers.utils.parseEther("500").sub(reduceAmount);

                await baseTokenAsAlice.approve(deltaVault.address, stableTokenAmount);

                const stableWorkbyteInput: IDepositWorkByte = {
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

                const assetWorkbyteInput: IDepositWorkByte = {
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

                let stableTokenPrice = ethers.utils.parseEther("1");
                let assetTokenPrice = ethers.utils.parseEther("1");
                let lpPrice = ethers.utils.parseEther("2");

                await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
                await setMockLpPrice(lpPrice);

                const beforeWBnbAmount = await wbnb.balanceOf(deltaVault.address);
                const expected = beforeWBnbAmount.sub(reduceAmount);

                await expect(
                  deltaVaultAsAlice.deposit(stableTokenAmount, assetTokenAmount, aliceAddress, 0, data, {
                    value: assetTokenAmount,
                  })
                ).to.be.revertedWith(
                  `UnsafeOutstanding("${wbnb.address}", ${beforeWBnbAmount.toString()}, ${expected.toString()})`
                );
              });
            });
          });
        });
      });

      context("when alice deposit to delta neutral vault with deposit fee", async () => {
        it("should be able to deposit and deduct deposit fee", async () => {
          const depositFee = 100;
          const withdrawFee = 0;
          await deltaVaultConfig.setFees(depositFee, withdrawFee, 0);

          const depositStableTokenAmount = ethers.utils.parseEther("500");
          const depositAssetTokenAmount = ethers.utils.parseEther("500");

          await baseTokenAsAlice.approve(deltaVault.address, depositStableTokenAmount);

          const stableWorkbyteInput: IDepositWorkByte = {
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

          const assetWorkbyteInput: IDepositWorkByte = {
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
          const lpPrice = ethers.utils.parseEther("2");

          await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
          await setMockLpPrice(lpPrice);

          const shareSupplyBefore = await deltaVault.totalSupply();
          const aliceShareBeofre = await deltaVault.balanceOf(aliceAddress);
          const treasuryShareBefore = await deltaVault.balanceOf(eveAddress);

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

          // alice should get 99% of minted shares
          // treasury should get 1% of minted shares

          const shareSupplyAfter = await deltaVault.totalSupply();
          const totalMintShare = shareSupplyAfter.sub(shareSupplyBefore);
          const aliceShareAfter = await deltaVault.balanceOf(aliceAddress);
          const treasuryShareAfter = await deltaVault.balanceOf(eveAddress);

          const expectedAliceShare = totalMintShare.mul(10000 - depositFee).div(10000);
          const expectedDeltaVaultShare = totalMintShare.mul(depositFee).div(10000);

          Assert.assertAlmostEqual(expectedAliceShare.toString(), aliceShareAfter.sub(aliceShareBeofre).toString());
          Assert.assertAlmostEqual(
            expectedDeltaVaultShare.toString(),
            treasuryShareAfter.sub(treasuryShareBefore).toString()
          );
        });
      });

      context("when alice deposit make total position value exceed limit", async () => {
        it("should be revert", async () => {
          const depositStableTokenAmount = ethers.utils.parseEther("500");
          const depositAssetTokenAmount = ethers.utils.parseEther("500");

          await baseTokenAsAlice.approve(deltaVault.address, depositStableTokenAmount);

          const stableWorkbyteInput: IDepositWorkByte = {
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

          const assetWorkbyteInput: IDepositWorkByte = {
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
          const lpPrice = ethers.utils.parseEther("2");

          await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
          await setMockLpPrice(lpPrice);

          await deltaVaultConfig.setValueLimit(ethers.utils.parseEther("1"));
          // revert because hit max vault position value limit
          await expect(
            deltaVaultAsAlice.deposit(depositStableTokenAmount, depositAssetTokenAmount, aliceAddress, 0, data, {
              value: depositAssetTokenAmount,
            })
          ).to.revertedWith("PositionValueExceedLimit()");
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
            token0: baseToken,
            token1: wbnb,
            amount0desired: ethers.utils.parseEther("1000000"),
            amount1desired: ethers.utils.parseEther("1000000"),
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
        const lpPrice = ethers.utils.parseEther("2");

        await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
        await setMockLpPrice(lpPrice);

        const initTx = await deltaVault.initPositions(
          stableTokenAmount,
          assetTokenAmount,
          ethers.utils.parseEther("1000"),
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

      context("when alice withdraw from delta neutral vault", async () => {
        it("should be able to withdraw", async () => {
          // ======== withdraw ======
          await swapHelper.loadReserves([baseToken.address, wbnb.address]);
          let lpPrice = await swapHelper.computeLpHealth(ethers.utils.parseEther("1"), baseToken.address, wbnb.address);

          await setMockLpPrice(lpPrice);

          const withdrawValue = ethers.utils.parseEther("200");

          const stableWithdrawInput: IWithdrawWorkByte = {
            posId: 1,
            vaultAddress: stableVault.address,
            workerAddress: stableVaultWorker.address,
            partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
            debt: ethers.utils.parseEther("100"),
            maxLpTokenToLiquidate: ethers.utils.parseEther("75"), // lp amount to withdraw consists of both equity and debt
            maxDebtRepayment: ethers.utils.parseEther("100"),
            minFarmingToken: BigNumber.from(0),
          };

          const assetWithdrawInput: IWithdrawWorkByte = {
            posId: 1,
            vaultAddress: assetVault.address,
            workerAddress: assetVaultWorker.address,
            partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
            debt: ethers.utils.parseEther("300"),
            maxLpTokenToLiquidate: ethers.utils.parseEther("225"),
            maxDebtRepayment: ethers.utils.parseEther("300"),
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
          const withdrawTx = await deltaVaultAsAlice.withdraw(shareToWithdraw, 0, 0, withdrawData);
        });

        it("should not able to withdraw when chain price is outdated", async () => {
          // ======== withdraw ======
          await swapHelper.loadReserves([baseToken.address, wbnb.address]);
          let lpPrice = await swapHelper.computeLpHealth(ethers.utils.parseEther("1"), baseToken.address, wbnb.address);

          await setMockLpPrice(lpPrice);

          const withdrawValue = ethers.utils.parseEther("200");

          const stableWithdrawInput: IWithdrawWorkByte = {
            posId: 1,
            vaultAddress: stableVault.address,
            workerAddress: stableVaultWorker.address,
            partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
            debt: ethers.utils.parseEther("100"),
            maxLpTokenToLiquidate: ethers.utils.parseEther("75"), // lp amount to withdraw consists of both equity and debt
            maxDebtRepayment: ethers.utils.parseEther("100"),
            minFarmingToken: BigNumber.from(0),
          };

          const assetWithdrawInput: IWithdrawWorkByte = {
            posId: 1,
            vaultAddress: assetVault.address,
            workerAddress: assetVaultWorker.address,
            partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
            debt: ethers.utils.parseEther("300"),
            maxLpTokenToLiquidate: ethers.utils.parseEther("225"),
            maxDebtRepayment: ethers.utils.parseEther("300"),
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
          await TimeHelpers.increase(TimeHelpers.duration.minutes(ethers.BigNumber.from("30")));
          await expect(deltaVaultAsAlice.withdraw(shareToWithdraw, 0, 0, withdrawData)).to.be.revertedWith(
            "UnTrustedPrice()"
          );
        });

        it("should not able to withdraw when return stable token amount is less than minimum amount should send back", async () => {
          // ======== withdraw ======
          await swapHelper.loadReserves([baseToken.address, wbnb.address]);
          let lpPrice = await swapHelper.computeLpHealth(ethers.utils.parseEther("1"), baseToken.address, wbnb.address);

          await setMockLpPrice(lpPrice);

          const withdrawValue = ethers.utils.parseEther("200");

          const stableWithdrawInput: IWithdrawWorkByte = {
            posId: 1,
            vaultAddress: stableVault.address,
            workerAddress: stableVaultWorker.address,
            partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
            debt: ethers.utils.parseEther("100"),
            maxLpTokenToLiquidate: ethers.utils.parseEther("75"), // lp amount to withdraw consists of both equity and debt
            maxDebtRepayment: ethers.utils.parseEther("100"),
            minFarmingToken: BigNumber.from(0),
          };

          const assetWithdrawInput: IWithdrawWorkByte = {
            posId: 1,
            vaultAddress: assetVault.address,
            workerAddress: assetVaultWorker.address,
            partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
            debt: ethers.utils.parseEther("300"),
            maxLpTokenToLiquidate: ethers.utils.parseEther("225"),
            maxDebtRepayment: ethers.utils.parseEther("300"),
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
          await expect(
            deltaVaultAsAlice.withdraw(shareToWithdraw, ethers.utils.parseEther("1000000"), 0, withdrawData)
          ).to.be.revertedWith(
            `InsufficientTokenReceived("${baseToken.address}", 1000000000000000000000000, 149961473752156599529)`
          );
        });

        it("should not able to withdraw when return asset token amount is less than minimum amount should send back", async () => {
          // ======== withdraw ======
          await swapHelper.loadReserves([baseToken.address, wbnb.address]);
          let lpPrice = await swapHelper.computeLpHealth(ethers.utils.parseEther("1"), baseToken.address, wbnb.address);

          await setMockLpPrice(lpPrice);

          const withdrawValue = ethers.utils.parseEther("200");

          const stableWithdrawInput: IWithdrawWorkByte = {
            posId: 1,
            vaultAddress: stableVault.address,
            workerAddress: stableVaultWorker.address,
            partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
            debt: ethers.utils.parseEther("100"),
            maxLpTokenToLiquidate: ethers.utils.parseEther("75"), // lp amount to withdraw consists of both equity and debt
            maxDebtRepayment: ethers.utils.parseEther("100"),
            minFarmingToken: BigNumber.from(0),
          };

          const assetWithdrawInput: IWithdrawWorkByte = {
            posId: 1,
            vaultAddress: assetVault.address,
            workerAddress: assetVaultWorker.address,
            partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
            debt: ethers.utils.parseEther("300"),
            maxLpTokenToLiquidate: ethers.utils.parseEther("225"),
            maxDebtRepayment: ethers.utils.parseEther("300"),
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
          await expect(
            deltaVaultAsAlice.withdraw(shareToWithdraw, 0, ethers.utils.parseEther("100"), withdrawData)
          ).to.be.revertedWith(
            `InsufficientTokenReceived("${wbnb.address}", 100000000000000000000, 49886800906176105501)`
          );
        });

        describe("_burn", async () => {
          it("when burned token amount is greater then token balance", async () => {
            it("should revert", async () => {
              // ======== withdraw ======
              await swapHelper.loadReserves([baseToken.address, wbnb.address]);
              let lpPrice = await swapHelper.computeLpHealth(
                ethers.utils.parseEther("1"),
                baseToken.address,
                wbnb.address
              );

              await setMockLpPrice(lpPrice);
              const latest = await TimeHelpers.latest();

              const stableWithdrawInput: IWithdrawWorkByte = {
                posId: 1,
                vaultAddress: stableVault.address,
                workerAddress: stableVaultWorker.address,
                partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
                debt: ethers.utils.parseEther("100"),
                maxLpTokenToLiquidate: ethers.utils.parseEther("75"), // lp amount to withdraw consists of both equity and debt
                maxDebtRepayment: ethers.utils.parseEther("100"),
                minFarmingToken: BigNumber.from(0),
              };

              const assetWithdrawInput: IWithdrawWorkByte = {
                posId: 1,
                vaultAddress: assetVault.address,
                workerAddress: assetVaultWorker.address,
                partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
                debt: ethers.utils.parseEther("300"),
                maxLpTokenToLiquidate: ethers.utils.parseEther("225"),
                maxDebtRepayment: ethers.utils.parseEther("300"),
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
              await expect(
                deltaVaultAsAlice.withdraw(ethers.utils.parseEther("10000"), 0, 0, withdrawData)
              ).to.be.revertedWith(`ERC20: burn amount exceeds balance`);
            });
          });
        });

        describe("_doWork", async () => {
          context("alice try patial close position with different position id", async () => {
            it("should revert", async () => {
              // ======== withdraw ======
              await swapHelper.loadReserves([baseToken.address, wbnb.address]);
              let lpPrice = await swapHelper.computeLpHealth(
                ethers.utils.parseEther("1"),
                baseToken.address,
                wbnb.address
              );

              await setMockLpPrice(lpPrice);

              const withdrawValue = ethers.utils.parseEther("200");

              const stableWithdrawInput: IWithdrawWorkByte = {
                posId: 2,
                vaultAddress: stableVault.address,
                workerAddress: stableVaultWorker.address,
                partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
                debt: ethers.utils.parseEther("100"),
                maxLpTokenToLiquidate: ethers.utils.parseEther("75"), // lp amount to withdraw consists of both equity and debt
                maxDebtRepayment: ethers.utils.parseEther("100"),
                minFarmingToken: BigNumber.from(0),
              };

              const assetWithdrawInput: IWithdrawWorkByte = {
                posId: 2,
                vaultAddress: assetVault.address,
                workerAddress: assetVaultWorker.address,
                partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
                debt: ethers.utils.parseEther("300"),
                maxLpTokenToLiquidate: ethers.utils.parseEther("225"),
                maxDebtRepayment: ethers.utils.parseEther("300"),
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
              await expect(deltaVaultAsAlice.withdraw(shareToWithdraw, 0, 0, withdrawData)).to.be.revertedWith(
                `InvalidPositions("${stableVault.address}", 2)`
              );
            });
          });
        });

        describe("_withdrawHealthCheck", async () => {
          context(
            "when alice withdraw with actions that resulted in unsafe position equity on stable side",
            async () => {
              it("should revert", async () => {
                // ======== withdraw ======
                await swapHelper.loadReserves([baseToken.address, wbnb.address]);
                let lpPrice = await swapHelper.computeLpHealth(
                  ethers.utils.parseEther("1"),
                  baseToken.address,
                  wbnb.address
                );

                await setMockLpPrice(lpPrice);

                const withdrawValue = ethers.utils.parseEther("200");

                const stableWithdrawInput: IWithdrawWorkByte = {
                  posId: 1,
                  vaultAddress: stableVault.address,
                  workerAddress: stableVaultWorker.address,
                  partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
                  debt: ethers.utils.parseEther("100"),
                  maxLpTokenToLiquidate: ethers.utils.parseEther("80"), // lp amount to withdraw consists of both equity and debt
                  maxDebtRepayment: ethers.utils.parseEther("100"),
                  minFarmingToken: BigNumber.from(0),
                };
                const assetWithdrawInput: IWithdrawWorkByte = {
                  posId: 1,
                  vaultAddress: assetVault.address,
                  workerAddress: assetVaultWorker.address,
                  partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
                  debt: ethers.utils.parseEther("300"),
                  maxLpTokenToLiquidate: ethers.utils.parseEther("220"),
                  maxDebtRepayment: ethers.utils.parseEther("300"),
                  minFarmingToken: BigNumber.from(0),
                };
                const stableWithdrawWorkByte = buildWithdrawWorkByte(stableWithdrawInput);
                const assetWithdrawWorkByte = buildWithdrawWorkByte(assetWithdrawInput);
                const withdrawData = ethers.utils.defaultAbiCoder.encode(
                  ["uint8[]", "uint256[]", "bytes[]"],
                  [[ACTION_WORK, ACTION_WORK], [0], [stableWithdrawWorkByte, assetWithdrawWorkByte]]
                );
                const shareToWithdraw = await deltaVault.valueToShare(withdrawValue);
                await expect(deltaVaultAsAlice.withdraw(shareToWithdraw, 0, 0, withdrawData)).to.be.revertedWith(
                  "UnsafePositionValue()"
                );
              });
            }
          );
          context(
            "when alice withdraw with actions that resulted in unsafe position equity on asset side",
            async () => {
              it("should revert", async () => {
                // ======== withdraw ======
                await swapHelper.loadReserves([baseToken.address, wbnb.address]);
                let lpPrice = await swapHelper.computeLpHealth(
                  ethers.utils.parseEther("1"),
                  baseToken.address,
                  wbnb.address
                );

                await setMockLpPrice(lpPrice);

                const withdrawValue = ethers.utils.parseEther("200");
                const stableWithdrawInput: IWithdrawWorkByte = {
                  posId: 1,
                  vaultAddress: stableVault.address,
                  workerAddress: stableVaultWorker.address,
                  partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
                  debt: ethers.utils.parseEther("100"),
                  maxLpTokenToLiquidate: ethers.utils.parseEther("76"), // lp amount to withdraw consists of both equity and debt
                  maxDebtRepayment: ethers.utils.parseEther("100"),
                  minFarmingToken: BigNumber.from(0),
                };
                const assetWithdrawInput: IWithdrawWorkByte = {
                  posId: 1,
                  vaultAddress: assetVault.address,
                  workerAddress: assetVaultWorker.address,
                  partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
                  debt: ethers.utils.parseEther("300"),
                  maxLpTokenToLiquidate: ethers.utils.parseEther("224"),
                  maxDebtRepayment: ethers.utils.parseEther("300"),
                  minFarmingToken: BigNumber.from(0),
                };
                const stableWithdrawWorkByte = buildWithdrawWorkByte(stableWithdrawInput);
                const assetWithdrawWorkByte = buildWithdrawWorkByte(assetWithdrawInput);
                const withdrawData = ethers.utils.defaultAbiCoder.encode(
                  ["uint8[]", "uint256[]", "bytes[]"],
                  [[ACTION_WORK, ACTION_WORK], [0], [stableWithdrawWorkByte, assetWithdrawWorkByte]]
                );
                const shareToWithdraw = await deltaVault.valueToShare(withdrawValue);
                await expect(deltaVaultAsAlice.withdraw(shareToWithdraw, 0, 0, withdrawData)).to.be.revertedWith(
                  "UnsafePositionValue()"
                );
              });
            }
          );
          context("when alice withdraw with actions that resulted in unsafe debt ratio", async () => {
            it("should revert", async () => {
              // ======== withdraw ======
              await swapHelper.loadReserves([baseToken.address, wbnb.address]);
              let lpPrice = await swapHelper.computeLpHealth(
                ethers.utils.parseEther("1"),
                baseToken.address,
                wbnb.address
              );
              await setMockLpPrice(lpPrice);

              const withdrawValue = ethers.utils.parseEther("200");

              const stableWithdrawInput: IWithdrawWorkByte = {
                posId: 1,
                vaultAddress: stableVault.address,
                workerAddress: stableVaultWorker.address,
                partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
                debt: ethers.utils.parseEther("0"),
                maxLpTokenToLiquidate: ethers.utils.parseEther("100"), // lp amount to withdraw consists of both equity and debt
                maxDebtRepayment: ethers.utils.parseEther("0"),
                minFarmingToken: BigNumber.from(0),
              };
              const assetWithdrawInput: IWithdrawWorkByte = {
                posId: 1,
                vaultAddress: assetVault.address,
                workerAddress: assetVaultWorker.address,
                partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
                debt: ethers.utils.parseEther("0"),
                maxLpTokenToLiquidate: ethers.utils.parseEther("300"),
                maxDebtRepayment: ethers.utils.parseEther("0"),
                minFarmingToken: BigNumber.from(0),
              };
              const stableWithdrawWorkByte = buildWithdrawWorkByte(stableWithdrawInput);
              const assetWithdrawWorkByte = buildWithdrawWorkByte(assetWithdrawInput);
              const withdrawData = ethers.utils.defaultAbiCoder.encode(
                ["uint8[]", "uint256[]", "bytes[]"],
                [[ACTION_WORK, ACTION_WORK], [0], [stableWithdrawWorkByte, assetWithdrawWorkByte]]
              );
              const shareToWithdraw = await deltaVault.valueToShare(withdrawValue);
              await expect(deltaVaultAsAlice.withdraw(shareToWithdraw, 0, 0, withdrawData)).to.be.revertedWith(
                "UnsafeDebtRatio()"
              );
            });
          });
        });

        // describe("_outstandingCheck", () => {
        //   context("when stable token amount in contract has descresed after withdraw", async () => {
        //     it("should revert", async () => {
        //       // ======== withdraw ======
        //       await swapHelper.loadReserves([baseToken.address, wbnb.address]);
        //       let lpPrice = await swapHelper.computeLpHealth(
        //         ethers.utils.parseEther("1"),
        //         baseToken.address,
        //         wbnb.address
        //       );
        //       const latest = await TimeHelpers.latest();
        //       mockPriceOracle.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
        //         return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
        //       });

        //       const withdrawValue = ethers.utils.parseEther("200");

        //       // const stableWithdrawValue = withdrawValue.div(4);
        //       // const assetWithdrawValue = withdrawValue.mul(3).div(4);

        //       const stableWithdrawInput: IWithdrawWorkByte = {
        //         posId: 1,
        //         vaultAddress: stableVault.address,
        //         workerAddress: stableVaultWorker.address,
        //         partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
        //         debt: ethers.utils.parseEther("100"),
        //         maxLpTokenToLiquidate: ethers.utils.parseEther("75"), // lp amount to withdraw consists of both equity and debt
        //         maxDebtRepayment: ethers.utils.parseEther("100"),
        //         minFarmingToken: BigNumber.from(0),
        //       };

        //       const assetWithdrawInput: IWithdrawWorkByte = {
        //         posId: 1,
        //         vaultAddress: assetVault.address,
        //         workerAddress: assetVaultWorker.address,
        //         partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
        //         debt: ethers.utils.parseEther("300"),
        //         maxLpTokenToLiquidate: ethers.utils.parseEther("225"),
        //         maxDebtRepayment: ethers.utils.parseEther("300"),
        //         minFarmingToken: BigNumber.from(0),
        //       };

        //       await baseTokenAsAlice.transfer(deltaVault.address, ethers.utils.parseEther("100"));

        //       const depositStableWorkbyteInput: IDepositWorkByte = {
        //         posId: 1,
        //         vaultAddress: stableVault.address,
        //         workerAddress: stableVaultWorker.address,
        //         twoSidesStrat: stableTwoSidesStrat.address,
        //         principalAmount: ethers.utils.parseEther("0.1"),
        //         borrowAmount: ethers.utils.parseEther("0"),
        //         farmingTokenAmount: ethers.utils.parseEther("0"),
        //         maxReturn: BigNumber.from(0),
        //         minLpReceive: BigNumber.from(0),
        //       };

        //       const depositStableWorkByte = buildDepositWorkByte(depositStableWorkbyteInput);

        //       const stableWithdrawWorkByte = buildWithdrawWorkByte(stableWithdrawInput);
        //       const assetWithdrawWorkByte = buildWithdrawWorkByte(assetWithdrawInput);

        //       const withdrawData = ethers.utils.defaultAbiCoder.encode(
        //         ["uint8[]", "uint256[]", "bytes[]"],
        //         [
        //           [ACTION_WORK, ACTION_WORK, ACTION_WORK],
        //           [0, 0, 0],
        //           [depositStableWorkByte, stableWithdrawWorkByte, assetWithdrawWorkByte],
        //         ]
        //       );

        //       const shareToWithdraw = await deltaVault.valueToShare(withdrawValue);
        //       const beforeBaseTokenAmount = await baseToken.balanceOf(deltaVault.address);
        //       const expected = beforeBaseTokenAmount.sub(ethers.utils.parseEther("100"));

        //       await expect(deltaVaultAsAlice.withdraw(shareToWithdraw, 0, 0, withdrawData)).to.be.revertedWith(
        //         `UnsafeOutstanding("${baseToken.address}", ${beforeBaseTokenAmount.toString()}, ${expected.toString()})`
        //       );
        //     });

        //     context("when asset token amount in the contract has descresed after withdraw", async () => {
        //       it("should revert", async () => {
        //         // ======== withdraw ======
        //         await swapHelper.loadReserves([baseToken.address, wbnb.address]);
        //         let lpPrice = await swapHelper.computeLpHealth(
        //           ethers.utils.parseEther("1"),
        //           baseToken.address,
        //           wbnb.address
        //         );
        //         const latest = await TimeHelpers.latest();
        //         mockPriceOracle.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
        //           return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
        //         });

        //         const withdrawValue = ethers.utils.parseEther("200");

        //         // const stableWithdrawValue = withdrawValue.div(4);
        //         // const assetWithdrawValue = withdrawValue.mul(3).div(4);

        //         const stableWithdrawInput: IWithdrawWorkByte = {
        //           posId: 1,
        //           vaultAddress: stableVault.address,
        //           workerAddress: stableVaultWorker.address,
        //           partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
        //           debt: ethers.utils.parseEther("100"),
        //           maxLpTokenToLiquidate: ethers.utils.parseEther("75"), // lp amount to withdraw consists of both equity and debt
        //           maxDebtRepayment: ethers.utils.parseEther("100"),
        //           minFarmingToken: BigNumber.from(0),
        //         };

        //         const assetWithdrawInput: IWithdrawWorkByte = {
        //           posId: 1,
        //           vaultAddress: assetVault.address,
        //           workerAddress: assetVaultWorker.address,
        //           partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
        //           debt: ethers.utils.parseEther("300"),
        //           maxLpTokenToLiquidate: ethers.utils.parseEther("225"),
        //           maxDebtRepayment: ethers.utils.parseEther("300"),
        //           minFarmingToken: BigNumber.from(0),
        //         };

        //         await wbnbTokenAsAlice.transfer(deltaVault.address, ethers.utils.parseEther("10"));

        //         const assetDepositInput: IDepositWorkByte = {
        //           posId: 1,
        //           vaultAddress: assetVault.address,
        //           workerAddress: assetVaultWorker.address,
        //           twoSidesStrat: assetTwoSidesStrat.address,
        //           principalAmount: ethers.utils.parseEther("0.1"),
        //           borrowAmount: ethers.utils.parseEther("0"),
        //           farmingTokenAmount: ethers.utils.parseEther("0"),
        //           maxReturn: BigNumber.from(0),
        //           minLpReceive: BigNumber.from(0),
        //         };

        //         const stableWithdrawWorkByte = buildWithdrawWorkByte(stableWithdrawInput);
        //         const assetWithdrawWorkByte = buildWithdrawWorkByte(assetWithdrawInput);
        //         const assetDepositWorkByte = buildDepositWorkByte(assetDepositInput);

        //         const withdrawData = ethers.utils.defaultAbiCoder.encode(
        //           ["uint8[]", "uint256[]", "bytes[]"],
        //           [
        //             [ACTION_WORK, ACTION_WORK, ACTION_WORK],
        //             [0, 0, 0],
        //             [assetDepositWorkByte, stableWithdrawWorkByte, assetWithdrawWorkByte],
        //           ]
        //         );
        //         const shareToWithdraw = await deltaVault.valueToShare(withdrawValue);

        //         const beforeWBnbAmount = await wbnb.balanceOf(deltaVault.address);
        //         const expected = beforeWBnbAmount.sub(ethers.utils.parseEther("0.1"));

        //         await expect(deltaVaultAsAlice.withdraw(shareToWithdraw, 0, 0, withdrawData)).to.be.revertedWith(
        //           `UnsafeOutstanding("${wbnb.address}", ${beforeWBnbAmount.toString()}, ${expected.toString()})`
        //         );
        //       });
        //     });
        //   });
        // });
      });

      context("when alice withdraw from delta neutral vault with withdrawal fee", async () => {
        let withdrawData: string;
        let withdrawalFee = 100; // 1%
        beforeEach(async () => {
          await deltaVaultConfig.setFees(0, withdrawalFee, 0);

          const depositStableTokenAmount = ethers.utils.parseEther("500");
          const depositAssetTokenAmount = ethers.utils.parseEther("500");

          await baseTokenAsAlice.approve(deltaVault.address, depositStableTokenAmount);

          const stableWorkbyteInput: IDepositWorkByte = {
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

          const assetWorkbyteInput: IDepositWorkByte = {
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

          let stableTokenPrice = ethers.utils.parseEther("1");
          let assetTokenPrice = ethers.utils.parseEther("1");
          let lpPrice = ethers.utils.parseEther("2");

          await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
          await setMockLpPrice(lpPrice);

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
          // ======== withdraw ======
          await swapHelper.loadReserves([baseToken.address, wbnb.address]);
          lpPrice = await swapHelper.computeLpHealth(ethers.utils.parseEther("1"), baseToken.address, wbnb.address);

          await setMockLpPrice(lpPrice);

          const stableWithdrawInput: IWithdrawWorkByte = {
            posId: 1,
            vaultAddress: stableVault.address,
            workerAddress: stableVaultWorker.address,
            partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
            debt: ethers.utils.parseEther("100"),
            maxLpTokenToLiquidate: ethers.utils.parseEther("75"), // lp amount to withdraw consists of both equity and debt
            maxDebtRepayment: ethers.utils.parseEther("100"),
            minFarmingToken: BigNumber.from(0),
          };

          const assetWithdrawInput: IWithdrawWorkByte = {
            posId: 1,
            vaultAddress: assetVault.address,
            workerAddress: assetVaultWorker.address,
            partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
            debt: ethers.utils.parseEther("300"),
            maxLpTokenToLiquidate: ethers.utils.parseEther("225"),
            maxDebtRepayment: ethers.utils.parseEther("300"),
            minFarmingToken: BigNumber.from(0),
          };

          const stableWithdrawWorkByte = buildWithdrawWorkByte(stableWithdrawInput);
          const assetWithdrawWorkByte = buildWithdrawWorkByte(assetWithdrawInput);

          withdrawData = ethers.utils.defaultAbiCoder.encode(
            ["uint8[]", "uint256[]", "bytes[]"],
            [
              [ACTION_WORK, ACTION_WORK],
              [0, 0],
              [stableWithdrawWorkByte, assetWithdrawWorkByte],
            ]
          );
        });

        context("should be able to withdraw and deduct withdrawal fee from alice's share", async () => {
          it("should work", async () => {
            const shareToWithdraw = ethers.utils.parseEther("20");
            const treasuryShareBefore = await deltaVault.balanceOf(eveAddress);
            const aliceShareBefore = await deltaVault.balanceOf(aliceAddress);

            const withdrawTx = await deltaVaultAsAlice.withdraw(shareToWithdraw, 0, 0, withdrawData);

            const treasuryShareAfter = await deltaVault.balanceOf(eveAddress);
            const aliceShareAfter = await deltaVault.balanceOf(aliceAddress);

            // treasury should get 1% from alice withdraw share
            Assert.assertAlmostEqual(
              treasuryShareAfter.sub(treasuryShareBefore).toString(),
              shareToWithdraw.mul(withdrawalFee).div(10000).toString()
            );
            Assert.assertAlmostEqual(aliceShareBefore.sub(aliceShareAfter).toString(), shareToWithdraw.toString());
          });
        });
        context("when alice get exempted from fee", async () => {
          it("should work", async () => {
            await deltaVaultConfig.setFeeExemptedCallers([aliceAddress], true);
            const shareToWithdraw = ethers.utils.parseEther("20");
            const treasuryShareBefore = await deltaVault.balanceOf(eveAddress);
            const aliceShareBefore = await deltaVault.balanceOf(aliceAddress);

            const withdrawTx = await deltaVaultAsAlice.withdraw(shareToWithdraw, 0, 0, withdrawData);

            const treasuryShareAfter = await deltaVault.balanceOf(eveAddress);
            const aliceShareAfter = await deltaVault.balanceOf(aliceAddress);

            Assert.assertAlmostEqual(aliceShareBefore.sub(aliceShareAfter).toString(), shareToWithdraw.toString());
            expect(treasuryShareAfter.sub(treasuryShareBefore)).to.eq(0);
          });
        });
      });
    });
  });

  describe("#rebalance", async () => {
    describe("when positions initialized", async () => {
      beforeEach(async () => {
        // add liquidity to make price baseToken:wbnb = 1:500
        await swapHelper.addLiquidities([
          {
            token0: baseToken,
            token1: wbnb,
            amount0desired: ethers.utils.parseEther("50000000"),
            amount1desired: ethers.utils.parseEther("100000"),
          },
        ]);

        await swapHelper.loadReserves([baseToken.address, wbnb.address]);
        const lpPrice = await swapHelper.computeLpHealth(ethers.utils.parseEther("1"), baseToken.address, wbnb.address);

        const stableTokenPrice = ethers.utils.parseEther("1");
        const assetTokenPrice = ethers.utils.parseEther("500");

        await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
        await setMockLpPrice(lpPrice);

        const stableTokenAmount = ethers.utils.parseEther("250");
        const assetTokenAmount = ethers.utils.parseEther("1.5");

        await baseTokenAsDeployer.approve(deltaVault.address, stableTokenAmount);

        // provide 750 base token
        // swapAmt = 375.467928673591501565
        // lp = 16.749457647109601219
        const stableWorkbyteInput: IDepositWorkByte = {
          posId: 0,
          vaultAddress: stableVault.address,
          workerAddress: stableVaultWorker.address,
          twoSidesStrat: stableTwoSidesStrat.address,
          principalAmount: ethers.utils.parseEther("250"),
          borrowAmount: ethers.utils.parseEther("500"),
          maxReturn: BigNumber.from(0),
          farmingTokenAmount: ethers.utils.parseEther("0"),
          minLpReceive: BigNumber.from(0),
        };

        // lp = 50.248372475909067619
        const assetWorkbyteInput: IDepositWorkByte = {
          posId: 0,
          vaultAddress: assetVault.address,
          workerAddress: assetVaultWorker.address,
          twoSidesStrat: assetTwoSidesStrat.address,
          principalAmount: ethers.utils.parseEther("1.5"),
          borrowAmount: ethers.utils.parseEther("3"),
          maxReturn: BigNumber.from(0),
          farmingTokenAmount: ethers.utils.parseEther("0"),
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

        // Action 1:
        // stableToken = 750, assetToken = 0, stableReserve = 50000000, assetReserve = 100000
        // swap stableToken 375.467928673591501565 to assetToken
        // [(swapAmt1*swapFee)*r0/(r1*10000+(swapAmt1*swapFee))
        // [((375.467928673591501565*9975)*100000)/(50000000*10000+(375.467928673591501565*9975))] = 0.749052906859214108 assetToken]
        // - After Swap
        // stableReserve = 50000000 + 375.467928673591501565 = 50000375.467928673591501565
        // assetReserve = 100000 - 0.749052906859214108   = 99999.250947093140785892
        // lp supply = sqrt(50000375.467928673591501565 * 99999.250947093140785892) = 2236067.998488927674103841
        // - Add liquidity
        // stableToken = 750 - 375.467928673591501565 = 374.532071326408498435, assetToken = 0.749052906859214108
        // amountB = amountA.mul(reserveB) / reserveA;
        // SafeMath.min(amount0.mul(_totalSupply) / _reserve0, amount1.mul(_totalSupply) / _reserve1);
        // 2236067.998488927674103841 * 2236067.998488927674103841 / 50000375.467928673591501565 = 99999.250947093140785892
        // 0.749052906859214108 * 2236067.998488927674103841 / 99999.250947093140785892 =  16.749457804330527033
        // stableWorker lp = 16.749457804330527033 , actual lp = 16.749457647109601219
        // After add liquidity
        // new Reserve after add liquidity
        // stableReserve = 50000375.467928673591501565 + 374.532071326408498435 = 50000750
        // assetReserve = 99999.250947093140785892 + 0.749052906859214108 = 100000
        // lp supply = sqrt(50000750 * 100000) = 2236084.747946732004630882

        // Action 2:
        // stableToken = 0, assetToken = 4.5, stableReserve = 50000750, assetReserve = 100000
        // swap assetToken = 2.252790676454731706 to stableToken
        // [((2.252790676454731706*9975)*50000750)/(100000*10000+(2.252790676454731706*9975))] = 1123.570955149579004645 stableToken]
        // - After Swap
        // stableReserve = 50000750 - 1123.570955149579004645 = 49999626.429044850420995355
        // assetReserve = 100000 + 2.252790676454731706  = 100002.252790676454731706
        // lp supply = sqrt(49999626.429044850420995355 * 100002.252790676454731706) = 2236084.81091320206076970
        // - Add liquidity
        // stableToken = 1123.570955149579004645, assetToken = 4.5 - 2.252790676454731706 = 2.247209323545268294
        // 1123.570955149579004645 * 2236084.81091320206076970 / 49999626.429044850420995355 = 50.248374362528350503
        // 2.247209323545268294 * 2236084.81091320206076970 / 100002.252790676454731706 = 50.248374362528350539
        // assetWorker lp = 50.248374362528350503, actual lp = 50.248372475909067619
        // After add liquidity
        // stableReserve = 49999626.429044850420995355 + 1123.570955149579004645 = 50000750
        // assetReserve = 100002.252790676454731706 + 2.247209323545268294 = 100004.5
        // lp supply = sqrt(50000750 * 100004.5) = 2236135

        // stable position equity = 250, debt 500, position value = 750
        // asset position equity = 1.5 * 500 = 750, debt = 3 * 500 = 1500, position value = 2250
        // Delta netural vault equity = 1000

        const initTx = await deltaVault.initPositions(stableTokenAmount, assetTokenAmount, 0, data, {
          value: assetTokenAmount,
        });
      });
      context("when asset token price drop", async () => {
        it("should be able to rebalance", async () => {
          // Price swing 20% wbnb price drop to 400
          // Add more base token to the pool equals to
          // sqrt(10*((100004.5)**2) / 8) - 100004.5 = 11803.930027938855
          // swap assetToken to stableToken
          // [((11803.930027938855*9975)*50000750)/(100004.5*10000+(11803.930027938855*9975))] = 5266912.937520859413813218 stableToken]
          // stableReserve = 50000750 - 5266912.937520859413813218 = 44733837.062479140586186782
          // assetReserve = 100004.5 + 11803.930027938855 = 111808.430027938855
          // lpSupply = sqrt(44733837.062479140586186782 * 111808.430027938855) = 2236430.211538338346271616

          await wbnb.approve(routerV2.address, ethers.utils.parseEther("11803.930027938855"));
          await routerV2.swapExactTokensForTokens(
            ethers.utils.parseEther("11803.930027938855"),
            "0",
            [wbnb.address, baseToken.address],
            deployerAddress,
            FOREVER
          );

          await swapHelper.loadReserves([baseToken.address, wbnb.address]);
          const lpPrice = await swapHelper.computeLpHealth(
            ethers.utils.parseEther("1"),
            baseToken.address,
            wbnb.address
          );

          const stableTokenPrice = ethers.utils.parseEther("1");
          const assetTokenPrice = ethers.utils.parseEther("400");

          await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
          await setMockLpPrice(lpPrice);

          // rebalance
          // lpPrice = 39.959940081004244081
          // stableWorker lp = 16.749457647109601219, assetWorker lp = 50.248372475909067619

          // Current
          // Stable Position:
          // Equity=169.303851745595771606, PositionValue=669.307323967817993606 Debt=500.003472222222222000,  debtRatio=74.7046168952819746%
          // Asset Position:
          // asset: Equity=807.913619971975883422, PositionValue=2007.921953305309216222, Debt=1200.008333333333332800, debtRatio=59.763694069779875893%
          // totalEquity=169.303851745595771606 + 807.913619971975883422 = 977.217471717571655028

          // Target
          // Stable Position:
          // Equity=977.217471717571655028/4= 244.304367929392913757, PositionValue=244.304367929392913757*3=732.913103788178741271, Debt=488.608735858785827514
          // deltaEquity = 244.304367929392913757 - 169.303851745595771606 = 75.000516183797142151, deltaDebt = 488.608735858785827514 - 500.003472222222222000 = -11.394736363436394486
          // Asset Position:
          // Equity=977.217471717571655028*3/4=732.913103788178741271, PositionValue=732.913103788178741271*3=2198.739311364536223813, Debt=1465.826207576357482542
          // deltaEquity = 732.913103788178741271 - 807.913619971975883422= -75.000516183797142151, deltaDebt = 1465.826207576357482542 - 1200.008333333333332800 = 265.817874243024149742
          // totalEquity = 244.304367929392913757 + 732.913103788178741271 = 977.217471717571655028

          const expectedStableEquity = ethers.utils.parseEther("244.304367929392913757");
          const expectedStableDebt = ethers.utils.parseEther("488.608735858785827514");
          const expectedAssetEquity = ethers.utils.parseEther("732.913103788178741271");
          const expectedAssetDebt = ethers.utils.parseEther("1465.826207576357482542");

          // Step1: Partial Close Asset position by -75.000516183797142151 since it has negative deltaEquity
          const valueToLiquidate = ethers.utils.parseEther("75.000516183797142151");
          const lpToLiquidate = valueToLiquidate.mul(ethers.utils.parseEther("1")).div(lpPrice);

          const action1 = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "address", "uint256", "uint256", "uint256", "bytes"],
            [
              assetVault.address,
              1,
              assetVaultWorker.address,
              "0",
              "0",
              "0",
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [
                  partialCloseMinimizeStrat.address,
                  ethers.utils.defaultAbiCoder.encode(["uint256", "uint256", "uint256"], [lpToLiquidate, 0, 0]),
                ]
              ),
            ]
          );

          // Step2: Borrow more 265.817874243024149742 usd on asset position since it has positive delta debt
          const borrowMoreAmount = ethers.utils
            .parseEther("265.817874243024149742")
            .mul(ethers.utils.parseEther("1"))
            .div(assetTokenPrice);

          const action2WorkbyteInput: IDepositWorkByte = {
            posId: 1,
            vaultAddress: assetVault.address,
            workerAddress: assetVaultWorker.address,
            twoSidesStrat: assetTwoSidesStrat.address,
            principalAmount: BigNumber.from(0),
            borrowAmount: borrowMoreAmount,
            maxReturn: BigNumber.from(0),
            farmingTokenAmount: ethers.utils.parseEther("0"),
            minLpReceive: BigNumber.from(0),
          };
          const action2 = buildDepositWorkByte(action2WorkbyteInput);

          // Step3: Warp BNB since BNB vault return in native form
          const farmingTokenAmount = ethers.utils.parseEther("0.093845290915972522");

          // Step4: Add collateral on stable position by 75.000516183797142151
          // wbnb = 0.093845290915972522, baseToken = 37.546939703434325878
          // sum = 0.093845290915972522 * 400 + 37.546939703434325878 = 75.08505606982334
          const action4WorkbyteInput: IDepositWorkByte = {
            posId: 1,
            vaultAddress: stableVault.address,
            workerAddress: stableVaultWorker.address,
            twoSidesStrat: stableTwoSidesStrat.address,
            principalAmount: ethers.utils.parseEther("37.546939703434325878"),
            borrowAmount: BigNumber.from(0),
            maxReturn: BigNumber.from(0),
            farmingTokenAmount: farmingTokenAmount,
            minLpReceive: BigNumber.from(0),
          };
          const action4 = buildDepositWorkByte(action4WorkbyteInput);

          // Step5: Repay debt by 11.384656237950708
          const repayAmt = ethers.utils.parseEther("11.384656237950708");
          const valueToRepayWithSlippage = repayAmt.add(repayAmt.mul(25).div(10000));
          const lpToRapy = valueToRepayWithSlippage.mul(ethers.utils.parseEther("1")).div(lpPrice);
          const action5 = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "address", "uint256", "uint256", "uint256", "bytes"],
            [
              stableVault.address,
              1,
              stableVaultWorker.address,
              "0",
              "0",
              repayAmt,
              ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes"],
                [
                  partialCloseStrat.address,
                  ethers.utils.defaultAbiCoder.encode(["uint256", "uint256", "uint256"], [lpToRapy, repayAmt, 0]),
                ]
              ),
            ]
          );

          const totalEquityBefore = await deltaVault.totalEquityValue();

          const rebalanceTx = await deltaVault.rebalance(
            [ACTION_WORK, ACTION_WORK, ACTION_WRAP, ACTION_WORK, ACTION_WORK],
            [0, 0, farmingTokenAmount, 0],
            [action1, action2, EMPTY_BYTE, action4, action5]
          );

          const totalEquityAfter = await deltaVault.totalEquityValue();
          const positionInfo = await deltaVault.positionInfo();

          Assert.assertBigNumberClosePercent(totalEquityBefore, totalEquityAfter, "0.1");
          Assert.assertBigNumberClosePercent(positionInfo.stablePositionEquity, expectedStableEquity, "0.1");
          Assert.assertBigNumberClosePercent(positionInfo.stablePositionDebtValue, expectedStableDebt, "0.1");
          Assert.assertBigNumberClosePercent(positionInfo.assetPositionEquity, expectedAssetEquity, "0.1");
          Assert.assertBigNumberClosePercent(positionInfo.assetPositionDebtValue, expectedAssetDebt, "0.1");
          expect(rebalanceTx).to.emit(deltaVault, "LogRebalance");
        });
      });
    });
  });

  describe("#Managementfee", async () => {
    describe("when positions initialized", async () => {
      beforeEach(async () => {
        // add liquidity
        await deltaVaultConfig.setFees(0, 0, 100);
        await swapHelper.addLiquidities([
          {
            token0: baseToken,
            token1: wbnb,
            amount0desired: ethers.utils.parseEther("1000000"),
            amount1desired: ethers.utils.parseEther("1000000"),
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
        const lpPrice = ethers.utils.parseEther("2");

        await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
        await setMockLpPrice(lpPrice);

        const initTx = await deltaVault.initPositions(
          stableTokenAmount,
          assetTokenAmount,
          ethers.utils.parseEther("1000"),
          data,
          {
            value: assetTokenAmount,
          }
        );
        const treasuryAddress = await deltaVaultConfig.getTreasuryAddr();
        expect(await deltaVault.balanceOf(treasuryAddress)).to.be.eq(0);
      });
      context("when alice interact with delta neutral vault", async () => {
        it("there should be management fee in treasury", async () => {
          await TimeHelpers.increase(BigNumber.from("3600"));
          const treasuryAddress = await deltaVaultConfig.getTreasuryAddr();
          const depositStableTokenAmount = ethers.utils.parseEther("500");
          const depositAssetTokenAmount = ethers.utils.parseEther("500");

          await baseTokenAsAlice.approve(deltaVault.address, depositStableTokenAmount);

          const stableWorkbyteInput: IDepositWorkByte = {
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

          const assetWorkbyteInput: IDepositWorkByte = {
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

          let stableTokenPrice = ethers.utils.parseEther("1");
          let assetTokenPrice = ethers.utils.parseEther("1");
          let lpPrice = ethers.utils.parseEther("2");

          await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
          await setMockLpPrice(lpPrice);

          const totalSupplyBeforeDeposit = await deltaVault.totalSupply();
          const mngfeerate = await deltaVaultConfig.mangementFeeBps();
          const lastCollectFeeBeforeDeposit = await deltaVault.lastFeeCollected();
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
          const lastCollectFeeAfterDeposit = await deltaVault.lastFeeCollected();
          let expectedManagementFee = totalSupplyBeforeDeposit
            .mul(lastCollectFeeAfterDeposit.sub(lastCollectFeeBeforeDeposit))
            .mul(mngfeerate)
            .div(315360000000);
          let actualManagementFee = await deltaVault.balanceOf(treasuryAddress);
          Assert.assertAlmostEqual(actualManagementFee.toString(), expectedManagementFee.toString());
          // ======== withdraw ======
          await swapHelper.loadReserves([baseToken.address, wbnb.address]);
          lpPrice = await swapHelper.computeLpHealth(ethers.utils.parseEther("1"), baseToken.address, wbnb.address);

          await setMockLpPrice(lpPrice);

          const withdrawValue = ethers.utils.parseEther("200");

          const stableWithdrawInput: IWithdrawWorkByte = {
            posId: 1,
            vaultAddress: stableVault.address,
            workerAddress: stableVaultWorker.address,
            partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
            debt: ethers.utils.parseEther("100"),
            maxLpTokenToLiquidate: ethers.utils.parseEther("75"), // lp amount to withdraw consists of both equity and debt
            maxDebtRepayment: ethers.utils.parseEther("100"),
            minFarmingToken: BigNumber.from(0),
          };

          const assetWithdrawInput: IWithdrawWorkByte = {
            posId: 1,
            vaultAddress: assetVault.address,
            workerAddress: assetVaultWorker.address,
            partialCloseMinimizeStrat: partialCloseMinimizeStrat.address,
            debt: ethers.utils.parseEther("300"),
            maxLpTokenToLiquidate: ethers.utils.parseEther("225"),
            maxDebtRepayment: ethers.utils.parseEther("300"),
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
          await TimeHelpers.increase(BigNumber.from("3600"));

          // update last price time
          const latest = await TimeHelpers.latest();
          await setMockTokenPrice(stableTokenPrice, assetTokenPrice, latest);
          await setMockLpPrice(lpPrice, latest);

          const shareToWithdraw = await deltaVault.valueToShare(withdrawValue);
          const totalSupplyBeforeWithdraw = await deltaVault.totalSupply();
          const lastCollectFeeBeforeWithdraw = await deltaVault.lastFeeCollected();
          const manageFeeBalanceBeforeWithdraw = await deltaVault.balanceOf(treasuryAddress);
          const withdrawTx = await deltaVaultAsAlice.withdraw(shareToWithdraw, 0, 0, withdrawData);

          const lastCollectFeeAfterWithdraw = await deltaVault.lastFeeCollected();
          expectedManagementFee = totalSupplyBeforeWithdraw
            .mul(lastCollectFeeAfterWithdraw.sub(lastCollectFeeBeforeWithdraw))
            .mul(mngfeerate)
            .div(315360000000);
          const manageFeeBalanceAfterWithdraw = await deltaVault.balanceOf(treasuryAddress);
          actualManagementFee = manageFeeBalanceAfterWithdraw.sub(manageFeeBalanceBeforeWithdraw);
          Assert.assertAlmostEqual(actualManagementFee.toString(), expectedManagementFee.toString());
        });
      });
    });
  });

  // describe("#reinvest", async () => {
  //   beforeEach(async () => {
  //     // add liquidity
  //     await swapHelper.addLiquidities([
  //       {
  //         token0: baseToken,
  //         token1: wbnb,
  //         amount0desired: ethers.utils.parseEther("100000"),
  //         amount1desired: ethers.utils.parseEther("100000"),
  //       },
  //     ]);

  //     const stableTokenAmount = ethers.utils.parseEther("500");
  //     const assetTokenAmount = ethers.utils.parseEther("500");

  //     await baseTokenAsDeployer.approve(deltaVault.address, stableTokenAmount);

  //     const stableWorkbyteInput: IDepositWorkByte = {
  //       posId: 0,
  //       vaultAddress: stableVault.address,
  //       workerAddress: stableVaultWorker.address,
  //       twoSidesStrat: stableTwoSidesStrat.address,
  //       principalAmount: ethers.utils.parseEther("125"),
  //       borrowAmount: ethers.utils.parseEther("500"),
  //       farmingTokenAmount: ethers.utils.parseEther("125"),
  //       maxReturn: BigNumber.from(0),
  //       minLpReceive: BigNumber.from(0),
  //     };

  //     const assetWorkbyteInput: IDepositWorkByte = {
  //       posId: 0,
  //       vaultAddress: assetVault.address,
  //       workerAddress: assetVaultWorker.address,
  //       twoSidesStrat: assetTwoSidesStrat.address,
  //       principalAmount: ethers.utils.parseEther("375"),
  //       borrowAmount: ethers.utils.parseEther("1500"),
  //       farmingTokenAmount: ethers.utils.parseEther("375"),
  //       maxReturn: BigNumber.from(0),
  //       minLpReceive: BigNumber.from(0),
  //     };

  //     const stableWorkByte = buildDepositWorkByte(stableWorkbyteInput);
  //     const assetWorkByte = buildDepositWorkByte(assetWorkbyteInput);

  //     const data = ethers.utils.defaultAbiCoder.encode(
  //       ["uint8[]", "uint256[]", "bytes[]"],
  //       [
  //         [ACTION_WORK, ACTION_WORK],
  //         [0, 0],
  //         [stableWorkByte, assetWorkByte],
  //       ]
  //     );
  //     const stableTokenPrice = ethers.utils.parseEther("1");
  //     const assetTokenPrice = ethers.utils.parseEther("1");
  //     const lpPrice = ethers.utils.parseEther("2");

  //     const latest = await TimeHelpers.latest();
  //     mockPriceOracle.smocked.getTokenPrice.will.return.with((token: string) => {
  //       if (token === baseToken.address) {
  //         return [stableTokenPrice, latest];
  //       }
  //       if (token === wbnb.address) {
  //         return [assetTokenPrice, latest];
  //       }
  //       return [0, latest];
  //     });

  //     mockPriceOracle.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
  //       return lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1"));
  //     });

  //     const initTx = await deltaVault.initPositions(stableTokenAmount, assetTokenAmount, 0, data, {
  //       value: assetTokenAmount,
  //     });
  //   });

  //   context("when alice deposit to delta neutral vault", async () => {
  //     it("should be able to reinvest", async () => {
  //       await swapHelper.addLiquidities([
  //         {
  //           token0: alpacaToken,
  //           token1: baseToken,
  //           amount0desired: ethers.utils.parseEther("100000"),
  //           amount1desired: ethers.utils.parseEther("100000"),
  //         },
  //       ]);

  //       const depositStableTokenAmount = ethers.utils.parseEther("500");
  //       const depositAssetTokenAmount = ethers.utils.parseEther("500");

  //       await baseTokenAsAlice.approve(deltaVault.address, depositStableTokenAmount);

  //       const stableWorkbyteInput: IDepositWorkByte = {
  //         posId: 1,
  //         vaultAddress: stableVault.address,
  //         workerAddress: stableVaultWorker.address,
  //         twoSidesStrat: stableTwoSidesStrat.address,
  //         principalAmount: ethers.utils.parseEther("125"),
  //         borrowAmount: ethers.utils.parseEther("500"),
  //         farmingTokenAmount: ethers.utils.parseEther("125"),
  //         maxReturn: BigNumber.from(0),
  //         minLpReceive: BigNumber.from(0),
  //       };

  //       const assetWorkbyteInput: IDepositWorkByte = {
  //         posId: 1,
  //         vaultAddress: assetVault.address,
  //         workerAddress: assetVaultWorker.address,
  //         twoSidesStrat: assetTwoSidesStrat.address,
  //         principalAmount: ethers.utils.parseEther("375"),
  //         borrowAmount: ethers.utils.parseEther("1500"),
  //         farmingTokenAmount: ethers.utils.parseEther("375"),
  //         maxReturn: BigNumber.from(0),
  //         minLpReceive: BigNumber.from(0),
  //       };

  //       const stableWorkByte = buildDepositWorkByte(stableWorkbyteInput);
  //       const assetWorkByte = buildDepositWorkByte(assetWorkbyteInput);

  //       const data = ethers.utils.defaultAbiCoder.encode(
  //         ["uint8[]", "uint256[]", "bytes[]"],
  //         [
  //           [ACTION_WORK, ACTION_WORK],
  //           [0, 0],
  //           [stableWorkByte, assetWorkByte],
  //         ]
  //       );

  //       const stableTokenPrice = ethers.utils.parseEther("1");
  //       const assetTokenPrice = ethers.utils.parseEther("1");
  //       const lpPrice = ethers.utils.parseEther("2");
  //       const latest = await TimeHelpers.latest();
  //       mockPriceOracle.smocked.getTokenPrice.will.return.with((token: string) => {
  //         if (token === baseToken.address) {
  //           return [stableTokenPrice, latest];
  //         }
  //         if (token === wbnb.address) {
  //           return [assetTokenPrice, latest];
  //         }
  //         return [0, latest];
  //       });
  //       mockPriceOracle.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
  //         return lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1"));
  //       });

  //       const depositTx = await deltaVaultAsAlice.deposit(
  //         depositStableTokenAmount,
  //         depositAssetTokenAmount,
  //         aliceAddress,
  //         0,
  //         data,
  //         {
  //           value: depositAssetTokenAmount,
  //         }
  //       );

  //       // alice expect to get
  //       // share supply before alice deposit = 1
  //       // alice deposit another 1 to delta neutral
  //       // alice should get shares =
  //       const aliceShares = await deltaVault.balanceOf(aliceAddress);
  //       const beforePositionVal = await deltaVault.shareToValue(aliceShares);

  //       // ------- REINVEST PART -------
  //       const stableVaultFairLaunchPoolId = await stableVault.fairLaunchPoolId();
  //       const assetVaultFairLaunchPoolId = await assetVault.fairLaunchPoolId();
  //       console.log("stableVaultFairLaunchPoolId", stableVaultFairLaunchPoolId);
  //       console.log("assetVaultFairLaunchPoolId", assetVaultFairLaunchPoolId);

  //       let currentBlock = await TimeHelpers.latestBlockNumber();
  //       console.log("currentBlock before claim", currentBlock);

  //       const stableVaultPendingAlpaca = await fairLaunch.pendingAlpaca(
  //         stableVaultFairLaunchPoolId,
  //         deltaVault.address
  //       );
  //       const assetVaultPendingAlpaca = await fairLaunch.pendingAlpaca(assetVaultFairLaunchPoolId, deltaVault.address);

  //       console.log("aliceAddress", aliceAddress);
  //       console.log("deltaNeutral address", deltaVault.address);
  //       console.log("stable ALPACA alice", stableVaultPendingAlpaca);
  //       console.log("asset ALPACA alice", assetVaultPendingAlpaca);
  //       console.log(
  //         "stable ALPACA deltaNeutralVault",
  //         await fairLaunch.pendingAlpaca(stableVaultFairLaunchPoolId, deltaVault.address)
  //       );
  //       console.log(
  //         "asset ALPACA deltaNeutralVault",
  //         await fairLaunch.pendingAlpaca(assetVaultFairLaunchPoolId, deltaVault.address)
  //       );

  //       currentBlock = await TimeHelpers.latestBlockNumber();
  //       console.log("currentBlock after claim", currentBlock);
  //       const alpacaBountyBps = await deltaVaultConfig.alpacaBountyBps();
  //       const netAlpacaReceived = assetVaultPendingAlpaca.add(stableVaultPendingAlpaca);
  //       const bounty = alpacaBountyBps.mul(netAlpacaReceived).div(BigNumber.from("10000"));
  //       console.log("bounty calculation", bounty.toString());
  //       const amountIn = netAlpacaReceived.sub(bounty);
  //       console.log("convert asset amount ", amountIn.toString());

  //       const convertAssetInput = {
  //         swapType: CONVERT_EXACT_TOKEN_TO_TOKEN,
  //         amountIn: amountIn,
  //         amountOut: ethers.constants.Zero, //TODO do we need to calculate amountOut?
  //         source: alpacaToken.address,
  //         destination: baseToken.address,
  //       };

  //       const leverage = await deltaVaultConfig.leverageLevel();
  //       const principalAmountStable = amountIn.mul(leverage - 2).div(2 * leverage - 2);
  //       const farmingAmountAsset = amountIn.mul(leverage).div(2 * leverage - 2);

  //       await baseTokenAsAlice.approve(deltaVault.address, principalAmountStable);

  //       const stableDepositWorkByteInput: IDepositWorkByte = {
  //         posId: 1,
  //         vaultAddress: stableVault.address,
  //         workerAddress: stableVaultWorker.address,
  //         twoSidesStrat: stableTwoSidesStrat.address,
  //         principalAmount: principalAmountStable,
  //         borrowAmount: principalAmountStable.mul(leverage - 1),
  //         farmingTokenAmount: ethers.constants.Zero,
  //         maxReturn: BigNumber.from(0),
  //         minLpReceive: BigNumber.from(0),
  //       };

  //       const assetDepositWorkByteInput: IDepositWorkByte = {
  //         posId: 1,
  //         vaultAddress: assetVault.address,
  //         workerAddress: assetVaultWorker.address,
  //         twoSidesStrat: assetTwoSidesStrat.address,
  //         principalAmount: ethers.constants.Zero,
  //         borrowAmount: principalAmountStable.mul(leverage - 1),
  //         farmingTokenAmount: farmingAmountAsset,
  //         maxReturn: BigNumber.from(0),
  //         minLpReceive: BigNumber.from(0),
  //       };

  //       const stableDepositWorkByte = buildDepositWorkByte(stableDepositWorkByteInput);
  //       const assetDepositWorkByte = buildDepositWorkByte(assetDepositWorkByteInput);

  //       await deltaVault.reinvest([ACTION_WORK], [0, 0], [stableDepositWorkByte]);
  //       const afterPositionVal = await deltaVault.shareToValue(aliceShares);
  //       expect(afterPositionVal).be.gt(beforePositionVal);
  //     });
  //   });
  // });
});
