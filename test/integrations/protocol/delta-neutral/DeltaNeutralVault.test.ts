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
  MockBeneficialVault__factory,
  MockBeneficialVault,
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
import * as AssertHelpers from "../../../helpers/assert";
import * as TimeHelpers from "../../../helpers/time";
import { parseEther } from "ethers/lib/utils";
import { DeployHelper } from "../../../helpers/deploy";
import { SwapHelper } from "../../../helpers/swap";
import { Worker02Helper } from "../../../helpers/worker";
import { MockPriceHelper } from "../../../../typechain/MockPriceHelper";
import { MockPriceHelper__factory } from "../../../../typechain/factories/MockPriceHelper__factory";
import { DeltaNeutralWorker02 } from "../../../../typechain/DeltaNeutralWorker02";
import { MockContract, smockit } from "@eth-optimism/smock";

chai.use(solidity);
const { expect } = chai;

describe("DeltaNeutralVault", () => {
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

  // Delta Vault Config
  const REBALANCE_FACTOR = "6500";
  const POSITION_VALUE_TOLERANCE_BPS = "100";

  // Delta Vault
  const ACTION_WORK = 1;
  const ACTION_WRAP = 2;

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
      140,
      145
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

    console.log("after deploy assetVault");

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

    console.log("before create pair");
    // Setup BTOKEN-WBNB pair on Pancakeswap
    // Add lp to masterChef's pool
    await factoryV2.createPair(baseToken.address, wbnb.address);
    lp = PancakePair__factory.connect(await factoryV2.getPair(wbnb.address, baseToken.address), deployer);
    await masterChef.add(1, lp.address, true);
    console.log("before deploy stableVaultWorker");

    /// Setup PancakeswapV2Worker02
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
    console.log("after deploy stableVaultWorker");
    /// Setup PancakeswapV2Worker02
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

    console.log("after deploy assetVaultWorker");

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
      {
        token0: baseToken,
        token1: wbnb,
        amount0desired: ethers.utils.parseEther("1000000"),
        amount1desired: ethers.utils.parseEther("1000000"),
      },
      {
        token0: farmToken,
        token1: wbnb,
        amount0desired: ethers.utils.parseEther("1000"),
        amount1desired: ethers.utils.parseEther("1000"),
      },
    ]);
    console.log("after add liquidity");
    // Set up Delta Neutral Vault Config
    const deltaNeutralConfig = {
      wNativeAddr: wbnb.address,
      wNativeRelayer: wNativeRelayer.address,
      fairlaunchAddr: fairLaunch.address,
      rebalanceFactor: REBALANCE_FACTOR,
      positionValueTolerance: POSITION_VALUE_TOLERANCE_BPS,
    };
    deltaVaultConfig = await deployHelper.deployDeltaNeutralVaultConfig(deltaNeutralConfig);

    // Setup Delta Neutral Vault
    const deltaNeutral = {
      name: "DELTA_NEUTRAL_VAULT",
      symbol: "DELTA_NEUTRAL_VAULT",
      vaultStable: stableVault.address,
      vaultAsset: assetVault.address,
      stableVaultWorker: stableVaultWorker.address,
      assetVaultWorker: assetVaultWorker.address,
      lpToken: lp.address,
      alpacaToken: assetVault.address, // change this to alpaca token address
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
        "0",
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
        // stable token reserve = 1000, asset token reserve = 10000
        // deployer deposit 0.5 stable token, 0.5 asset token
        // stable equity value should have 0.25 and position value = 0.25*3 = 0.75
        // asset equity value should have 0.75 and position value = 0.75*3 = 2.25
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

        mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
          if (token === baseToken.address) {
            return stableTokenPrice;
          }
          if (token === wbnb.address) {
            return assetTokenPrice;
          }
          return 0;
        });

        mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
          return lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1"));
        });

        const initTx = await deltaVault.initPositions(
          ethers.utils.parseEther("1000"),
          stableTokenAmount,
          assetTokenAmount,
          data,
          {
            value: assetTokenAmount,
          }
        );

        //
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
          deltaVault.initPositions(ethers.utils.parseEther("1"), stableTokenAmount, assetTokenAmount, data, {
            value: assetTokenAmount,
          })
        ).to.revertedWith("PositionsAlreadyInitialized()");
      });
    });
  });

  describe("#deposit", async () => {
    context("when alice try deposit to delta neutral vault before positions initialized", async () => {
      it("should revert", async () => {
        const stableTokenAmount = ethers.utils.parseEther("0.5");
        const assetTokenAmount = ethers.utils.parseEther("0.5");

        await baseTokenAsAlice.approve(deltaVault.address, stableTokenAmount);

        const stableWorkbyteInput: IDepositWorkByte = {
          posId: 0,
          vaultAddress: stableVault.address,
          workerAddress: stableVaultWorker.address,
          twoSidesStrat: stableTwoSidesStrat.address,
          principalAmount: ethers.utils.parseEther("0.125"),
          borrowAmount: ethers.utils.parseEther("0.5"),
          farmingTokenAmount: ethers.utils.parseEther("0.125"),
          minLpReceive: BigNumber.from(0),
        };

        const assetWorkbyteInput: IDepositWorkByte = {
          posId: 0,
          vaultAddress: assetVault.address,
          workerAddress: assetVaultWorker.address,
          twoSidesStrat: assetTwoSidesStrat.address,
          principalAmount: ethers.utils.parseEther("0.375"),
          borrowAmount: ethers.utils.parseEther("1.5"),
          farmingTokenAmount: ethers.utils.parseEther("0.375"),
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
        mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
          if (token === baseToken.address) {
            return stableTokenPrice;
          }
          if (token === wbnb.address) {
            return assetTokenPrice;
          }
          return 0;
        });

        mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
          return lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1"));
        });

        await expect(
          deltaVaultAsAlice.deposit(aliceAddress, 0, stableTokenAmount, assetTokenAmount, data, {
            value: assetTokenAmount,
          })
        ).to.revertedWith("PositionsNotInitialized()");
      });
    });
    describe("when positions initialized", async () => {
      beforeEach(async () => {
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
        mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
          if (token === baseToken.address) {
            return stableTokenPrice;
          }
          if (token === wbnb.address) {
            return assetTokenPrice;
          }
          return 0;
        });
        mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
          return lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1"));
        });
        const initTx = await deltaVault.initPositions(
          ethers.utils.parseEther("1"),
          stableTokenAmount,
          assetTokenAmount,
          data,
          {
            value: assetTokenAmount,
          }
        );
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
          mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
            if (token === baseToken.address) {
              return stableTokenPrice;
            }
            if (token === wbnb.address) {
              return assetTokenPrice;
            }
            return 0;
          });

          mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
            return lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1"));
          });

          const depositTx = await deltaVaultAsAlice.deposit(
            aliceAddress,
            0,
            depositStableTokenAmount,
            depositAssetTokenAmount,
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
          console.log("aliceShare", aliceShare);
        });
      });
    });
  });

  describe("#withdraw", async () => {
    describe("when positions initialized", async () => {
      beforeEach(async () => {
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
        mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
          if (token === baseToken.address) {
            return stableTokenPrice;
          }
          if (token === wbnb.address) {
            return assetTokenPrice;
          }
          return 0;
        });
        mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
          return lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1"));
        });
        const initTx = await deltaVault.initPositions(
          ethers.utils.parseEther("1000"),
          stableTokenAmount,
          assetTokenAmount,
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
          mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
            if (token === baseToken.address) {
              return stableTokenPrice;
            }
            if (token === wbnb.address) {
              return assetTokenPrice;
            }
            return 0;
          });

          mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
            return lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1"));
          });

          const depositTx = await deltaVaultAsAlice.deposit(
            aliceAddress,
            0,
            depositStableTokenAmount,
            depositAssetTokenAmount,
            data,
            {
              value: depositAssetTokenAmount,
            }
          );

          // ======== withdraw ======
          console.log("deltavault equity", await deltaVault.totalEquityValue());
          await swapHelper.loadReserves([baseToken.address, wbnb.address]);
          console.log("reserve before init", await lp.getReserves());
          lpPrice = await swapHelper.computeLpHealth(ethers.utils.parseEther("1"), baseToken.address, wbnb.address);
          console.log("lp lpPrice", lpPrice);

          mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
            return lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1"));
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
          const withdrawTx = await deltaVaultAsAlice.withdraw(shareToWithdraw, 0, 0, withdrawData);
        });
      });
    });
  });

  describe("#claim", async () => {
    context("when alice deposit and claim reward", async () => {
      it("it should claim reward successfully", async () => {
        // depsit fund into vaults
        await baseTokenAsDeployer.approve(stableVault.address, ethers.utils.parseEther("10"));
        await stableVault.deposit(ethers.utils.parseEther("10"));

        await wbnbTokenAsDeployer.approve(assetVault.address, ethers.utils.parseEther("10"));
        await assetVault.deposit(ethers.utils.parseEther("10"));

        // stable token reserve = 1, asset token reserve = 1
        // deployer deposit 0.5 stable token, 0.5 asset token
        // stable equity value should have 0.25 and position value = 0.25*3 = 0.75
        // asset equity value should have 0.75 and position value = 0.75*3 = 2.25
        let stableTokenAmount = ethers.utils.parseEther("0.5");
        let assetTokenAmount = ethers.utils.parseEther("0.5");

        await baseTokenAsDeployer.approve(deltaVault.address, stableTokenAmount);

        let stableWorkByte = ethers.utils.defaultAbiCoder.encode(
          ["address", "uint256", "address", "uint256", "uint256", "uint256", "bytes"],
          [
            stableVault.address,
            0,
            stableVaultWorker.address,
            stableTokenAmount.div(4),
            ethers.utils.parseEther("0.5"),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                stableTwoSidesStrat.address,
                ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [assetTokenAmount.div(4), 0]),
              ]
            ),
          ]
        );

        let assetWorkByte = ethers.utils.defaultAbiCoder.encode(
          ["address", "uint256", "address", "uint256", "uint256", "uint256", "bytes"],
          [
            assetVault.address,
            0,
            assetVaultWorker.address,
            assetTokenAmount.mul(3).div(4),
            ethers.utils.parseEther("1.5"),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                assetTwoSidesStrat.address,
                ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [stableTokenAmount.mul(3).div(4), 0]),
              ]
            ),
          ]
        );

        let data = ethers.utils.defaultAbiCoder.encode(
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
        mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
          if (token === baseToken.address) {
            return stableTokenPrice;
          }
          if (token === wbnb.address) {
            return assetTokenPrice;
          }
          return 0;
        });

        mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
          return lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1"));
        });

        await swapHelper.loadReserves([baseToken.address, wbnb.address]);
        const lphealth = await swapHelper.computeLpHealth(
          ethers.utils.parseEther("1"),
          baseToken.address,
          wbnb.address
        );

        let currentBlock = await TimeHelpers.latestBlockNumber();

        const initTx = await deltaVault.initPositions(0, stableTokenAmount, assetTokenAmount, data, {
          value: assetTokenAmount,
        });

        currentBlock = await TimeHelpers.latestBlockNumber();

        // claim because do not know how many block passed in deltaVault.initPositions and update accPerShare in fairlaunch too.

        await deltaVault.claim();
        const alpacaBalanceBefore = await alpacaToken.balanceOf(deltaVault.address);

        // claim is using 1 block, so update block first
        currentBlock = await TimeHelpers.latestBlockNumber();
        const blockBefore = currentBlock;

        // ADVANCE TO NEXT 5 block
        await TimeHelpers.advanceBlockTo(currentBlock.add(BigNumber.from("5")).toNumber());
        currentBlock = await TimeHelpers.latestBlockNumber();

        await deltaVault.claim();
        currentBlock = await TimeHelpers.latestBlockNumber();

        const alpacaBalanceAfter = await alpacaToken.balanceOf(deltaVault.address);

        const realizedAlpacaReward = alpacaBalanceAfter.sub(alpacaBalanceBefore);

        // cant assert using static call because block shifted
        AssertHelpers.assertAlmostEqual(
          currentBlock.sub(blockBefore).mul(ALPACA_REWARD_PER_BLOCK).toString(),
          realizedAlpacaReward.toString()
        );
      });
    });

    context("when alice claim it before init transaction", async () => {
      it("should be reverted", async () => {
        await expect(deltaVault.claim()).to.be.revertedWith("nothing to harvest");
      });
    });
  });

  describe("#withdrawAlpaca", async () => {
    context("when alice deposit, claim reward then withdraw", async () => {
      it("it should withdraw reward successfully", async () => {
        // depsit fund into vaults
        await baseTokenAsDeployer.approve(stableVault.address, ethers.utils.parseEther("10"));
        await stableVault.deposit(ethers.utils.parseEther("10"));

        await wbnbTokenAsDeployer.approve(assetVault.address, ethers.utils.parseEther("10"));
        await assetVault.deposit(ethers.utils.parseEther("10"));

        // stable token reserve = 1, asset token reserve = 1
        // deployer deposit 0.5 stable token, 0.5 asset token
        // stable equity value should have 0.25 and position value = 0.25*3 = 0.75
        // asset equity value should have 0.75 and position value = 0.75*3 = 2.25
        let stableTokenAmount = ethers.utils.parseEther("0.5");
        let assetTokenAmount = ethers.utils.parseEther("0.5");

        await baseTokenAsDeployer.approve(deltaVault.address, stableTokenAmount);

        let stableWorkByte = ethers.utils.defaultAbiCoder.encode(
          ["address", "uint256", "address", "uint256", "uint256", "uint256", "bytes"],
          [
            stableVault.address,
            0,
            stableVaultWorker.address,
            stableTokenAmount.div(4),
            ethers.utils.parseEther("0.5"),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                stableTwoSidesStrat.address,
                ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [assetTokenAmount.div(4), 0]),
              ]
            ),
          ]
        );

        let assetWorkByte = ethers.utils.defaultAbiCoder.encode(
          ["address", "uint256", "address", "uint256", "uint256", "uint256", "bytes"],
          [
            assetVault.address,
            0,
            assetVaultWorker.address,
            assetTokenAmount.mul(3).div(4),
            ethers.utils.parseEther("1.5"),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                assetTwoSidesStrat.address,
                ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [stableTokenAmount.mul(3).div(4), 0]),
              ]
            ),
          ]
        );

        let data = ethers.utils.defaultAbiCoder.encode(
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
        mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
          if (token === baseToken.address) {
            return stableTokenPrice;
          }
          if (token === wbnb.address) {
            return assetTokenPrice;
          }
          return 0;
        });

        mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
          return lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1"));
        });

        await swapHelper.loadReserves([baseToken.address, wbnb.address]);
        const lphealth = await swapHelper.computeLpHealth(
          ethers.utils.parseEther("1"),
          baseToken.address,
          wbnb.address
        );

        let currentBlock = await TimeHelpers.latestBlockNumber();

        const initTx = await deltaVault.initPositions(0, stableTokenAmount, assetTokenAmount, data, {
          value: assetTokenAmount,
        });

        currentBlock = await TimeHelpers.latestBlockNumber();

        // claim because do not know how many block passed in deltaVault.initPositions and update accPerShare in fairlaunch too.

        await deltaVault.claim();
        const alpacaBalanceBefore = await alpacaToken.balanceOf(deltaVault.address);

        // claim is using 1 block, so update block first
        currentBlock = await TimeHelpers.latestBlockNumber();
        const blockBefore = currentBlock;

        // ADVANCE TO NEXT 5 block
        await TimeHelpers.advanceBlockTo(currentBlock.add(BigNumber.from("5")).toNumber());
        currentBlock = await TimeHelpers.latestBlockNumber();

        await deltaVault.claim();
        currentBlock = await TimeHelpers.latestBlockNumber();

        const alpacaBalanceAfter = await alpacaToken.balanceOf(deltaVault.address);

        const realizedAlpacaReward = alpacaBalanceAfter.sub(alpacaBalanceBefore);

        // cant assert using static call because block shifted
        AssertHelpers.assertAlmostEqual(
          currentBlock.sub(blockBefore).mul(ALPACA_REWARD_PER_BLOCK).toString(),
          realizedAlpacaReward.toString()
        );

        const alpacaTokenAsAliceBefore = await alpacaToken.balanceOf(aliceAddress);
        await deltaVault.withdrawAlpaca(aliceAddress, realizedAlpacaReward);
        const alpacaTokenAsAliceAfter = await alpacaToken.balanceOf(aliceAddress);
        expect(alpacaTokenAsAliceAfter.sub(alpacaTokenAsAliceBefore)).to.be.eq(realizedAlpacaReward);
      });
    });

    context("withdrawAlpaca to no address", async () => {
      it("it should revert from safeTransfer", async () => {
        // depsit fund into vaults
        await baseTokenAsDeployer.approve(stableVault.address, ethers.utils.parseEther("10"));
        await stableVault.deposit(ethers.utils.parseEther("10"));

        await wbnbTokenAsDeployer.approve(assetVault.address, ethers.utils.parseEther("10"));
        await assetVault.deposit(ethers.utils.parseEther("10"));

        // stable token reserve = 1, asset token reserve = 1
        // deployer deposit 0.5 stable token, 0.5 asset token
        // stable equity value should have 0.25 and position value = 0.25*3 = 0.75
        // asset equity value should have 0.75 and position value = 0.75*3 = 2.25
        let stableTokenAmount = ethers.utils.parseEther("0.5");
        let assetTokenAmount = ethers.utils.parseEther("0.5");

        await baseTokenAsDeployer.approve(deltaVault.address, stableTokenAmount);

        let stableWorkByte = ethers.utils.defaultAbiCoder.encode(
          ["address", "uint256", "address", "uint256", "uint256", "uint256", "bytes"],
          [
            stableVault.address,
            0,
            stableVaultWorker.address,
            stableTokenAmount.div(4),
            ethers.utils.parseEther("0.5"),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                stableTwoSidesStrat.address,
                ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [assetTokenAmount.div(4), 0]),
              ]
            ),
          ]
        );

        let assetWorkByte = ethers.utils.defaultAbiCoder.encode(
          ["address", "uint256", "address", "uint256", "uint256", "uint256", "bytes"],
          [
            assetVault.address,
            0,
            assetVaultWorker.address,
            assetTokenAmount.mul(3).div(4),
            ethers.utils.parseEther("1.5"),
            "0",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [
                assetTwoSidesStrat.address,
                ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [stableTokenAmount.mul(3).div(4), 0]),
              ]
            ),
          ]
        );

        let data = ethers.utils.defaultAbiCoder.encode(
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
        mockPriceHelper.smocked.getTokenPrice.will.return.with((token: string) => {
          if (token === baseToken.address) {
            return stableTokenPrice;
          }
          if (token === wbnb.address) {
            return assetTokenPrice;
          }
          return 0;
        });

        mockPriceHelper.smocked.lpToDollar.will.return.with((lpAmount: BigNumber, lpToken: string) => {
          return lpAmount.mul(lpPrice).div(ethers.utils.parseEther("1"));
        });

        await swapHelper.loadReserves([baseToken.address, wbnb.address]);
        const lphealth = await swapHelper.computeLpHealth(
          ethers.utils.parseEther("1"),
          baseToken.address,
          wbnb.address
        );

        let currentBlock = await TimeHelpers.latestBlockNumber();

        const initTx = await deltaVault.initPositions(0, stableTokenAmount, assetTokenAmount, data, {
          value: assetTokenAmount,
        });

        currentBlock = await TimeHelpers.latestBlockNumber();

        // claim because do not know how many block passed in deltaVault.initPositions and update accPerShare in fairlaunch too.

        await deltaVault.claim();
        const alpacaBalanceBefore = await alpacaToken.balanceOf(deltaVault.address);

        // claim is using 1 block, so update block first
        currentBlock = await TimeHelpers.latestBlockNumber();
        const blockBefore = currentBlock;

        // ADVANCE TO NEXT 5 block
        await TimeHelpers.advanceBlockTo(currentBlock.add(BigNumber.from("5")).toNumber());
        currentBlock = await TimeHelpers.latestBlockNumber();

        await deltaVault.claim();
        currentBlock = await TimeHelpers.latestBlockNumber();

        const alpacaBalanceAfter = await alpacaToken.balanceOf(deltaVault.address);

        const realizedAlpacaReward = alpacaBalanceAfter.sub(alpacaBalanceBefore);

        // cant assert using static call because block shifted
        AssertHelpers.assertAlmostEqual(
          currentBlock.sub(blockBefore).mul(ALPACA_REWARD_PER_BLOCK).toString(),
          realizedAlpacaReward.toString()
        );

        await expect(deltaVault.withdrawAlpaca(ethers.constants.AddressZero, realizedAlpacaReward)).to.be.revertedWith(
          "!safeTransfer"
        );
      });
    });

    context("not owner", async () => {
      it("it should revert", async () => {
        // TODO
      });
    });
  });
});
