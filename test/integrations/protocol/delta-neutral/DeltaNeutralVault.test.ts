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
import { DeployHelper } from "../../../helpers/deploy";
import { SwapHelper } from "../../../helpers/swap";
import { Worker02Helper } from "../../../helpers/worker";
import { MockPriceHelper } from "../../../../typechain/MockPriceHelper";
import { MockPriceHelper__factory } from "../../../../typechain/factories/MockPriceHelper__factory";
import { MockContract, smockit } from "@eth-optimism/smock";
import { zeroAddress } from "ethereumjs-util";

chai.use(solidity);
const { expect } = chai;

describe("DeltaNeutralVault", () => {
  const FOREVER = "2000000000";
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther("5000");
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
  const DEPOSIT_FEE_BPS = "0"; // 0%

  // Delta Vault
  const ACTION_WORK = 1;
  const ACTION_WRAP = 2;
  const ACTION_CONVERT_ASSET = 3;

  /// @dev constant subAction of CONVERT_ASSET
  const CONVERT_EXACT_TOKEN_TO_NATIVE = 1;
  const CONVERT_EXACT_NATIVE_TO_TOKEN = 2;
  const CONVERT_EXACT_TOKEN_TO_TOKEN = 3;
  const CONVERT_TOKEN_TO_EXACT_TOKEN = 4;

  /// Pancakeswap-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouterV2;

  let wbnb: MockWBNB;
  let lp: PancakePair;

  /// Token-related instance(s)
  let baseToken: MockERC20;
  let farmToken: MockERC20;
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

  /// PriceHelper instance
  // let priceHelper: MockPriceHelper;
  let mockPriceHelper: MockContract;

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

  let farmTokenAsAlice: MockERC20;

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

    // Setup MockpriceHelper
    mockPriceHelper = await smockit(await ethers.getContractFactory("PriceHelper", deployer));

    /// Setup token stuffs
    [baseToken, farmToken] = await deployHelper.deployBEP20([
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
      {
        name: "FTOKEN",
        symbol: "FTOKEN",
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
      132,
      137
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
      mockPriceHelper.address
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
      mockPriceHelper.address
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
        token0: baseToken,
        token1: farmToken,
        amount0desired: ethers.utils.parseEther("1000"),
        amount1desired: ethers.utils.parseEther("100"),
      },
      {
        token0: cake,
        token1: wbnb,
        amount0desired: ethers.utils.parseEther("100"),
        amount1desired: ethers.utils.parseEther("1000"),
      },
      // {
      //   token0: baseToken,
      //   token1: wbnb,
      //   amount0desired: ethers.utils.parseEther("100000"),
      //   amount1desired: ethers.utils.parseEther("100000"),
      // },
      {
        token0: farmToken,
        token1: wbnb,
        amount0desired: ethers.utils.parseEther("1000"),
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
    };
    deltaVaultConfig = await deployHelper.deployDeltaNeutralVaultConfig(deltaNeutralConfig);
    // allow deployer to call rebalance
    await deltaVaultConfig.setWhitelistedRebalancer([deployerAddress], true);
    await deltaVaultConfig.setLeverageLevel(3);

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
      priceHelper: mockPriceHelper.address,
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

    farmTokenAsAlice = MockERC20__factory.connect(farmToken.address, alice);

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

  interface IConvertAssetByte {
    swapType: number;
    amountIn: BigNumber;
    amountOut: BigNumber;
    source: string;
    destination: string;
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

  function buildConvertAssetByte(input: IConvertAssetByte): string {
    const convertAssetByte = ethers.utils.defaultAbiCoder.encode(
      ["uint256", "uint256", "uint256", "address", "address"],
      [input.swapType, input.amountIn, input.amountOut, input.source, input.destination]
    );

    return convertAssetByte;
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
        const latest = await TimeHelpers.latest();

        mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
          if (token === baseToken.address) {
            return [stableTokenPrice, latest];
          }
          if (token === wbnb.address) {
            return [assetTokenPrice, latest];
          }
          return [0, latest];
        });

        mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
          return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
        });

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

        // when deployer try to initialize positions again
        await expect(
          deltaVault.initPositions(stableTokenAmount, assetTokenAmount, ethers.utils.parseEther("1"), data, {
            value: assetTokenAmount,
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
        const latest = await TimeHelpers.latest();
        mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
          if (token === baseToken.address) {
            return [stableTokenPrice, latest];
          }
          if (token === wbnb.address) {
            return [assetTokenPrice, latest];
          }
          return [0, latest];
        });

        mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
          return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
        });

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
        const latest = await TimeHelpers.latest();
        mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
          if (token === baseToken.address) {
            return [stableTokenPrice, latest];
          }
          if (token === wbnb.address) {
            return [assetTokenPrice, latest];
          }
          return [0, latest];
        });

        mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
          return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
        });

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
        const latest = await TimeHelpers.latest();
        mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
          if (token === baseToken.address) {
            return [stableTokenPrice, latest];
          }
          if (token === wbnb.address) {
            return [assetTokenPrice, latest];
          }
          return [0, latest];
        });
        mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
          return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
        });
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
          const latest = await TimeHelpers.latest();
          mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
            if (token === baseToken.address) {
              return [stableTokenPrice, latest];
            }
            if (token === wbnb.address) {
              return [assetTokenPrice, latest];
            }
            return [0, latest];
          });

          mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
            return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
          });

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
            const latest = await TimeHelpers.latest();
            mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
              if (token === baseToken.address) {
                return [stableTokenPrice, latest];
              }
              if (token === wbnb.address) {
                return [assetTokenPrice, latest];
              }
              return [0, latest];
            });

            mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
              return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
            });

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
              const latest = await TimeHelpers.latest();
              mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
                if (token === baseToken.address) {
                  return [stableTokenPrice, latest];
                }
                if (token === wbnb.address) {
                  return [assetTokenPrice, latest];
                }
                return [0, latest];
              });

              mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
                return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
              });

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
              const latest = await TimeHelpers.latest();
              mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
                if (token === baseToken.address) {
                  return [stableTokenPrice, latest];
                }
                if (token === wbnb.address) {
                  return [assetTokenPrice, latest];
                }
                return [0, latest];
              });

              mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
                return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
              });

              await expect(
                deltaVaultAsAlice.deposit(stableTokenAmount, assetTokenAmount, zeroAddress(), 0, data, {
                  value: assetTokenAmount,
                })
              ).to.be.revertedWith("ERC20: mint to the zero address");
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
                const latest = await TimeHelpers.latest();
                mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
                  if (token === baseToken.address) {
                    return [stableTokenPrice, latest];
                  }
                  if (token === wbnb.address) {
                    return [assetTokenPrice, latest];
                  }
                  return [0, latest];
                });
                mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
                  return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
                });
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
              const latest = await TimeHelpers.latest();
              mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
                if (token === baseToken.address) {
                  return [stableTokenPrice, latest];
                }
                if (token === wbnb.address) {
                  return [assetTokenPrice, latest];
                }
                return [0, latest];
              });
              mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
                return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
              });
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
              const latest = await TimeHelpers.latest();
              mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
                if (token === baseToken.address) {
                  return [stableTokenPrice, latest];
                }
                if (token === wbnb.address) {
                  return [assetTokenPrice, latest];
                }
                return [0, latest];
              });
              mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
                return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
              });
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
              const latest = await TimeHelpers.latest();
              mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
                if (token === baseToken.address) {
                  return [stableTokenPrice, latest];
                }
                if (token === wbnb.address) {
                  return [assetTokenPrice, latest];
                }
                return [0, latest];
              });
              mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
                return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
              });
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
              const latest = await TimeHelpers.latest();
              mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
                if (token === baseToken.address) {
                  return [stableTokenPrice, latest];
                }
                if (token === wbnb.address) {
                  return [assetTokenPrice, latest];
                }
                return [0, latest];
              });

              mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
                return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
              });

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
                const latest = await TimeHelpers.latest();
                mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
                  if (token === baseToken.address) {
                    return [stableTokenPrice, latest];
                  }
                  if (token === wbnb.address) {
                    return [assetTokenPrice, latest];
                  }
                  return [0, latest];
                });

                mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
                  return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
                });

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
        describe("_convertAsset", async () => {
          context("when call deposit and inject convertAsset action", async () => {
            it("should revert at healthcheck", async () => {
              const baseWbnbPath = [baseToken.address, wbnb.address];

              const routeSwapBaseBnb = {
                swapRouter: routerV2.address,
                paths: baseWbnbPath,
              };

              const wbnbBasePath = [wbnb.address, baseToken.address];
              const routeSwapBnbBase = {
                swapRouter: routerV2.address,
                paths: wbnbBasePath,
              };

              deltaVaultConfig.setSwapRoutes(
                [baseToken.address, wbnb.address],
                [wbnb.address, baseToken.address],
                [routeSwapBaseBnb, routeSwapBnbBase]
              );
              const depositStableTokenAmount = ethers.utils.parseEther("500");
              const depositAssetTokenAmount = ethers.utils.parseEther("500");

              await baseTokenAsAlice.approve(deltaVault.address, depositStableTokenAmount);
              await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther("1"));

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

              let stableTokenPrice = ethers.utils.parseEther("1");
              let assetTokenPrice = ethers.utils.parseEther("1");
              let lpPrice = ethers.utils.parseEther("2");
              const latest = await TimeHelpers.latest();
              mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
                if (token === baseToken.address) {
                  return [stableTokenPrice, latest];
                }
                if (token === wbnb.address) {
                  return [assetTokenPrice, latest];
                }
                return [0, latest];
              });

              mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
                return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
              });

              const convertAssetByte = buildConvertAssetByte({
                swapType: CONVERT_EXACT_TOKEN_TO_NATIVE,
                amountIn: ethers.constants.WeiPerEther,
                amountOut: ethers.constants.Zero,
                source: baseToken.address,
                destination: wbnb.address,
              });

              const data = ethers.utils.defaultAbiCoder.encode(
                ["uint8[]", "uint256[]", "bytes[]"],
                [[ACTION_CONVERT_ASSET], [0], [convertAssetByte]]
              );

              await expect(
                deltaVaultAsAlice.deposit(depositStableTokenAmount, depositAssetTokenAmount, aliceAddress, 0, data, {
                  value: depositAssetTokenAmount,
                })
              ).to.be.revertedWith("UnsafePositionEquity()");
            });
          });
        });
      });

      context("when alice deposit to delta neutral vault with deposit fee", async () => {
        it("should be able to deposit and deduct deposit fee", async () => {
          const depositFee = 100; // 1%
          const manageFee = 0; // 0%

          await deltaVaultConfig.setFees(depositFee, manageFee);

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
          const latest = await TimeHelpers.latest();
          mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
            if (token === baseToken.address) {
              return [stableTokenPrice, latest];
            }
            if (token === wbnb.address) {
              return [assetTokenPrice, latest];
            }
            return [0, latest];
          });

          mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
            return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
          });

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
        const latest = await TimeHelpers.latest();
        mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
          if (token === baseToken.address) {
            return [stableTokenPrice, latest];
          }
          if (token === wbnb.address) {
            return [assetTokenPrice, latest];
          }
          return [0, latest];
        });
        mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
          return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
        });
        const initTx = await deltaVault.initPositions(
          stableTokenAmount,
          assetTokenAmount,
          ethers.utils.parseEther("1000"),
          data,
          {
            value: assetTokenAmount,
          }
        );
      });
      context("when alice withdraw from delta neutral vault", async () => {
        it("should be able to withdraw", async () => {
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
          const latest = await TimeHelpers.latest();
          mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
            if (token === baseToken.address) {
              return [stableTokenPrice, latest];
            }
            if (token === wbnb.address) {
              return [assetTokenPrice, latest];
            }
            return [0, latest];
          });

          mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
            return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
          });

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

          mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
            return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
          });

          const withdrawValue = ethers.utils.parseEther("200");

          const stableWithdrawValue = withdrawValue.div(4);
          const assetWithdrawValue = withdrawValue.mul(3).div(4);

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
          const withdrawTx = await deltaVaultAsAlice.withdraw(0, 0, shareToWithdraw, withdrawData);
        });
        describe("_convertAsset", async () => {
          beforeEach(async () => {
            const baseWbnbPath = [baseToken.address, wbnb.address];

            const routeSwapBaseBnb = {
              swapRouter: routerV2.address,
              paths: baseWbnbPath,
            };

            const wbnbBasePath = [wbnb.address, baseToken.address];
            const routeSwapBnbBase = {
              swapRouter: routerV2.address,
              paths: wbnbBasePath,
            };

            deltaVaultConfig.setSwapRoutes(
              [baseToken.address, wbnb.address],
              [wbnb.address, baseToken.address],
              [routeSwapBaseBnb, routeSwapBnbBase]
            );
          });
          context("when convertAsset from baseToken to nativeToken", async () => {
            it("should be able to withdraw and convert", async () => {
              const depositStableTokenAmount = ethers.utils.parseEther("500");
              const depositAssetTokenAmount = ethers.utils.parseEther("500");

              await baseTokenAsAlice.approve(deltaVault.address, depositStableTokenAmount);

              const stableWorkbyteInput: IDepositWorkByte = {
                posId: 1,
                vaultAddress: stableVault.address,
                workerAddress: stableVaultWorker.address,
                twoSidesStrat: stableTwoSidesStrat.address,
                principalAmount: ethers.utils.parseEther("125"),
                maxReturn: BigNumber.from(0),
                borrowAmount: ethers.utils.parseEther("500"),
                farmingTokenAmount: ethers.utils.parseEther("125"),
                minLpReceive: BigNumber.from(0),
              };

              const assetWorkbyteInput: IDepositWorkByte = {
                posId: 1,
                vaultAddress: assetVault.address,
                workerAddress: assetVaultWorker.address,
                twoSidesStrat: assetTwoSidesStrat.address,
                principalAmount: ethers.utils.parseEther("375"),
                maxReturn: BigNumber.from(0),
                borrowAmount: ethers.utils.parseEther("1500"),
                farmingTokenAmount: ethers.utils.parseEther("375"),
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
              const latest = await TimeHelpers.latest();
              mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
                if (token === baseToken.address) {
                  return [stableTokenPrice, latest];
                }
                if (token === wbnb.address) {
                  return [assetTokenPrice, latest];
                }
                return [0, latest];
              });

              mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
                return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
              });

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

              mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
                return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
              });

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

              const convertAssetInput: IConvertAssetByte = {
                swapType: CONVERT_EXACT_TOKEN_TO_NATIVE,
                amountIn: BigNumber.from("149961473752156599529"),
                amountOut: ethers.constants.Zero,
                source: baseToken.address,
                destination: wbnb.address,
              };

              const stableWithdrawWorkByte = buildWithdrawWorkByte(stableWithdrawInput);
              const assetWithdrawWorkByte = buildWithdrawWorkByte(assetWithdrawInput);
              const convertToNativeByte = buildConvertAssetByte(convertAssetInput);

              const withdrawData = ethers.utils.defaultAbiCoder.encode(
                ["uint8[]", "uint256[]", "bytes[]"],
                [
                  [ACTION_WORK, ACTION_WORK, ACTION_CONVERT_ASSET],
                  [0, 0, 0],
                  [stableWithdrawWorkByte, assetWithdrawWorkByte, convertToNativeByte],
                ]
              );
              const shareToWithdraw = await deltaVault.valueToShare(withdrawValue);

              const aliceBaseTokenBefore = await baseToken.balanceOf(aliceAddress);
              const aliceNativeTokenBefore = await alice.getBalance();

              const withdrawTx = await deltaVaultAsAlice.withdraw(0, 0, shareToWithdraw, withdrawData);

              const aliceBaseTokenAfter = await baseToken.balanceOf(aliceAddress);
              const aliceNativeTokenAfter = await alice.getBalance();

              expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.be.eq(ethers.constants.Zero);

              expect(aliceNativeTokenAfter.gt(aliceNativeTokenBefore)).to.be.true;
            });
          });

          context("when convertAsset from nativeToken to baseToken", async () => {
            it("should be able to withdraw and convert", async () => {
              const depositStableTokenAmount = ethers.utils.parseEther("500");
              const depositAssetTokenAmount = ethers.utils.parseEther("500");

              await baseTokenAsAlice.approve(deltaVault.address, depositStableTokenAmount);

              const stableWorkbyteInput: IDepositWorkByte = {
                posId: 1,
                vaultAddress: stableVault.address,
                workerAddress: stableVaultWorker.address,
                twoSidesStrat: stableTwoSidesStrat.address,
                principalAmount: ethers.utils.parseEther("125"),
                maxReturn: BigNumber.from(0),
                borrowAmount: ethers.utils.parseEther("500"),
                farmingTokenAmount: ethers.utils.parseEther("125"),
                minLpReceive: BigNumber.from(0),
              };

              const assetWorkbyteInput: IDepositWorkByte = {
                posId: 1,
                vaultAddress: assetVault.address,
                workerAddress: assetVaultWorker.address,
                twoSidesStrat: assetTwoSidesStrat.address,
                principalAmount: ethers.utils.parseEther("375"),
                maxReturn: BigNumber.from(0),
                borrowAmount: ethers.utils.parseEther("1500"),
                farmingTokenAmount: ethers.utils.parseEther("375"),
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
              const latest = await TimeHelpers.latest();
              mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
                if (token === baseToken.address) {
                  return [stableTokenPrice, latest];
                }
                if (token === wbnb.address) {
                  return [assetTokenPrice, latest];
                }
                return [0, latest];
              });

              mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
                return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
              });

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

              mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
                return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
              });

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

              const convertAssetInput: IConvertAssetByte = {
                swapType: CONVERT_EXACT_NATIVE_TO_TOKEN,
                amountIn: ethers.constants.Zero,
                amountOut: ethers.constants.Zero,
                source: wbnb.address,
                destination: baseToken.address,
              };

              const stableWithdrawWorkByte = buildWithdrawWorkByte(stableWithdrawInput);
              const assetWithdrawWorkByte = buildWithdrawWorkByte(assetWithdrawInput);
              const convertNativeToTokenByte = buildConvertAssetByte(convertAssetInput);

              const withdrawData = ethers.utils.defaultAbiCoder.encode(
                ["uint8[]", "uint256[]", "bytes[]"],
                [
                  [ACTION_WORK, ACTION_WORK, ACTION_CONVERT_ASSET],
                  [0, 0, BigNumber.from("49886800906176105501")],
                  [stableWithdrawWorkByte, assetWithdrawWorkByte, convertNativeToTokenByte],
                ]
              );
              const shareToWithdraw = await deltaVault.valueToShare(withdrawValue);

              const aliceBaseTokenBefore = await baseToken.balanceOf(aliceAddress);
              const aliceNativeTokenBefore = await alice.getBalance();

              const withdrawTx = await deltaVaultAsAlice.withdraw(0, 0, shareToWithdraw, withdrawData);

              const aliceBaseTokenAfter = await baseToken.balanceOf(aliceAddress);
              const aliceNativeTokenAfter = await alice.getBalance();

              expect(aliceNativeTokenBefore.gt(aliceNativeTokenAfter)).to.be.true;
              expect(aliceBaseTokenAfter.gt(aliceBaseTokenBefore)).to.be.true;
            });
          });

          context("when inject bad action _convertAsset", async () => {
            it("should revert healthcheck from convert baseToken to otherToken", async () => {
              await swapHelper.addLiquidities([
                {
                  token0: baseToken,
                  token1: alpacaToken,
                  amount0desired: ethers.utils.parseEther("100000"),
                  amount1desired: ethers.utils.parseEther("100000"),
                },
              ]);

              const routeSwapBaseAlpaca = {
                swapRouter: routerV2.address,
                paths: [baseToken.address, alpacaToken.address],
              };
              deltaVaultConfig.setSwapRoutes([baseToken.address], [alpacaToken.address], [routeSwapBaseAlpaca]);

              const depositStableTokenAmount = ethers.utils.parseEther("500");
              const depositAssetTokenAmount = ethers.utils.parseEther("500");

              await baseTokenAsAlice.approve(deltaVault.address, depositStableTokenAmount);

              const stableWorkbyteInput: IDepositWorkByte = {
                posId: 1,
                vaultAddress: stableVault.address,
                workerAddress: stableVaultWorker.address,
                twoSidesStrat: stableTwoSidesStrat.address,
                principalAmount: ethers.utils.parseEther("125"),
                maxReturn: BigNumber.from(0),
                borrowAmount: ethers.utils.parseEther("500"),
                farmingTokenAmount: ethers.utils.parseEther("125"),
                minLpReceive: BigNumber.from(0),
              };

              const assetWorkbyteInput: IDepositWorkByte = {
                posId: 1,
                vaultAddress: assetVault.address,
                workerAddress: assetVaultWorker.address,
                twoSidesStrat: assetTwoSidesStrat.address,
                principalAmount: ethers.utils.parseEther("375"),
                maxReturn: BigNumber.from(0),
                borrowAmount: ethers.utils.parseEther("1500"),
                farmingTokenAmount: ethers.utils.parseEther("375"),
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
              const latest = await TimeHelpers.latest();
              mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
                if (token === baseToken.address) {
                  return [stableTokenPrice, latest];
                }
                if (token === wbnb.address) {
                  return [assetTokenPrice, latest];
                }
                return [0, latest];
              });

              mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
                return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
              });

              await deltaVaultAsAlice.deposit(
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

              mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
                return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
              });

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

              const convertAssetInput: IConvertAssetByte = {
                swapType: CONVERT_EXACT_TOKEN_TO_TOKEN,
                amountIn: BigNumber.from("149961473752156599529"),
                amountOut: ethers.constants.Zero,
                source: baseToken.address,
                destination: alpacaToken.address,
              };

              const stableWithdrawWorkByte = buildWithdrawWorkByte(stableWithdrawInput);
              const assetWithdrawWorkByte = buildWithdrawWorkByte(assetWithdrawInput);
              const convertAssetByte = buildConvertAssetByte(convertAssetInput);

              const withdrawData = ethers.utils.defaultAbiCoder.encode(
                ["uint8[]", "uint256[]", "bytes[]"],
                [
                  [ACTION_WORK, ACTION_WORK, ACTION_CONVERT_ASSET],
                  [0, 0, 0],
                  [stableWithdrawWorkByte, assetWithdrawWorkByte, convertAssetByte],
                ]
              );
              const shareToWithdraw = await deltaVault.valueToShare(withdrawValue);

              await expect(deltaVaultAsAlice.withdraw(0, 0, shareToWithdraw, withdrawData)).to.be.revertedWith(
                "UnsafePositionValue()"
              );
            });
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
        const latest = await TimeHelpers.latest();
        mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
          if (token === baseToken.address) {
            return [stableTokenPrice, latest];
          }
          if (token === wbnb.address) {
            return [assetTokenPrice, latest];
          }
          return [0, latest];
        });
        mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
          return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
        });

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

        // stalbe position equity = 250, debt 500, position value = 750
        // asset position equity = 1.5 * 500 = 750, debt = 3 * 500 = 1500, position value = 2250
        // Delta netural vault equity = 1000

        const initTx = await deltaVault.initPositions(stableTokenAmount, assetTokenAmount, 0, data, {
          value: assetTokenAmount,
        });
      });
      context("when asset token price drop", async () => {
        it("should be able to rebalance", async () => {
          const reserves = await lp.getReserves();
          // _reserve0: BigNumber { value: "100004 499999999999999998" },
          // _reserve1: BigNumber { value: "50000750 000000000000000000" },

          // Price swing 20% wbnb price drop to 400
          // Add more base token to the pool equals to
          // sqrt(10*((100004)**2) / 8) - 100004 = 11803.8710
          await wbnb.approve(routerV2.address, ethers.utils.parseEther("11803.8710"));
          await routerV2.swapExactTokensForTokens(
            ethers.utils.parseEther("11803.8710"),
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
          const latest = await TimeHelpers.latest();
          mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
            if (token === baseToken.address) {
              return [stableTokenPrice, latest];
            }
            if (token === wbnb.address) {
              return [assetTokenPrice, latest];
            }
            return [0, latest];
          });
          mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
            return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
          });

          // rebalance

          // lpPrice = 39.959961130207909910
          // stable lp = 16.749457647109601219, asset lp = 50.248372475909067619

          // Current
          // Stable Position:
          // Equity=169.3076765305633, PositionValue=669.3076765305633, Debt=500,  debtRatio=74.70405876588926%
          // Asset Position:
          // asset: Equity=807.9230109935352, PositionValue=2007.9230109935352, Debt=1200, , debtRatio=59.76324756626157%
          // totalEquity=169.3076765305633 + 807.9230109935352= 977.2306875240985

          // Target
          // Stable Position:
          // Equity=977.2306875240985/4=244.30767188102462, PositionValue=244.30767188102462*3=732.9230156430739, Debt=488.6153437620493
          // deltaEquity = 244.30767188102462 - 169.3076765305633 = 74.99999535046132, deltaDebt = 488.6153437620493 - 500 = -11.384656237950708

          // Asset Position:
          // Equity=977.2306875240985*3/4=732.9230156430739, PositionValue=732.9230156430739*3=2198.7690469292215, Debt=1465.8460312861475
          // deltaEquity = 732.9230156430739 - 807.9230109935352= -74.99999535046129, deltaDebt = 1465.8460312861475 - 1200 = 265.84603128614754
          // totalEquity = 244.30767188102462 + 732.9230156430739 = 977.2306875240985

          const expectedStableEquity = ethers.utils.parseEther("244.30767188102462");
          const expectedStableDebt = ethers.utils.parseEther("488.6153437620493");
          const expectedAssetEquity = ethers.utils.parseEther("732.9230156430739");
          const expectedAssetDebt = ethers.utils.parseEther("1465.8460312861475");

          // Step1: Partial Close Asset position by -74.99999535046129 since it has negative deltaEquity
          const valueToLiquidate = ethers.utils.parseEther("74.99999535046129");
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

          // Step2: Borrow more 265.84603128614754 usd on asset position since it has positive delta debt
          const borrowMoreAmount = ethers.utils
            .parseEther("265.84603128614754")
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

          // Step4: Add collateral on stable position by 74.99999535046132
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
        await deltaVaultConfig.setFees(0, 100);
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
        const latest = await TimeHelpers.latest();
        mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
          if (token === baseToken.address) {
            return [stableTokenPrice, latest];
          }
          if (token === wbnb.address) {
            return [assetTokenPrice, latest];
          }
          return [0, latest];
        });
        mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
          return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
        });
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
          console.log("DeltaNetTest - lastFeeCollected: ", await deltaVault.lastFeeCollected());
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
          const latest = await TimeHelpers.latest();
          mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
            if (token === baseToken.address) {
              return [stableTokenPrice, latest];
            }
            if (token === wbnb.address) {
              return [assetTokenPrice, latest];
            }
            return [0, latest];
          });

          mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
            return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
          });

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
          console.log("DeltaNetTest - lastFeeCollected: ", await deltaVault.lastFeeCollected());
          // ======== withdraw ======
          await swapHelper.loadReserves([baseToken.address, wbnb.address]);
          lpPrice = await swapHelper.computeLpHealth(ethers.utils.parseEther("1"), baseToken.address, wbnb.address);

          mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
            return [lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1")), latest];
          });

          const withdrawValue = ethers.utils.parseEther("200");

          const stableWithdrawValue = withdrawValue.div(4);
          const assetWithdrawValue = withdrawValue.mul(3).div(4);

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
          const withdrawTx = await deltaVaultAsAlice.withdraw(0, 0, shareToWithdraw, withdrawData);
          console.log("DeltaNetTest - lastFeeCollected: ", await deltaVault.lastFeeCollected());

          const treasuryAddress = await deltaVaultConfig.getTreasuryAddr();
          expect(await deltaVault.balanceOf(treasuryAddress)).to.not.be.eq(0);
        });
      });
    });
  });
});
