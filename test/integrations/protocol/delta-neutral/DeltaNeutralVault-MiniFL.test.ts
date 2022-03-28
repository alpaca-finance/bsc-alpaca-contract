import { DeltaNeutralVault } from "./../../../../typechain/DeltaNeutralVault.d";
import { DeltaNeutralOracle } from "../../../../typechain/DeltaNeutralOracle";
import { ethers, network, upgrades, waffle } from "hardhat";
import { BigNumber } from "ethers";
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
  WNativeRelayer,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal,
  PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading,
  PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading,
  MockWBNB__factory,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory,
  DeltaNeutralVaultConfig,
  DeltaNeutralPancakeWorker02,
  DeltaNeutralPancakeWorker02__factory,
  IERC20,
  MockMiniFL,
  DeltaNeutralVault__factory,
} from "../../../../typechain";
import * as Assert from "../../../helpers/assert";
import * as TimeHelpers from "../../../helpers/time";
import { DeployHelper, IDeltaNeutralVaultConfig } from "../../../helpers/deploy";
import { SwapHelper } from "../../../helpers/swap";
import { Worker02Helper } from "../../../helpers/worker";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { zeroAddress } from "ethereumjs-util";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
const { expect } = chai;

describe("DeltaNeutralVault-MiniFL", () => {
  const FOREVER = "2000000000";
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_MAX_PER_SEC = ethers.utils.parseEther("1");
  // const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther("0.076");
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther("0");
  const REINVEST_BOUNTY_BPS = "100"; // 1% reinvest bounty
  const RESERVE_POOL_BPS = "1000"; // 10% reserve pool
  const KILL_PRIZE_BPS = "1000"; // 10% Kill prize
  const INTEREST_RATE = "0"; // 0% per year
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
  const REBALANCE_FACTOR = "6800";
  const POSITION_VALUE_TOLERANCE_BPS = "200";
  const DEBT_RATIO_TOLERANCE_BPS = "30";
  const MAX_VAULT_POSITION_VALUE = ethers.utils.parseEther("100000");
  const DEPOSIT_FEE_BPS = "0"; // 0%

  // Delta Vault Actions
  const ACTION_WORK = 1;
  const ACTION_WRAP = 2;

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

  /// MiniFairLaunch-related instance(s)
  let miniFL: MockMiniFL;
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
        decimals: "18",
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("10000000000000") },
          { address: aliceAddress, amount: ethers.utils.parseEther("10000000000000") },
          { address: bobAddress, amount: ethers.utils.parseEther("10000000000000") },
        ],
      },
    ]);
    wbnb = await deployHelper.deployWBNB();

    await wbnb.mint(deployerAddress, ethers.utils.parseEther("10000000000000"));
    await wbnb.mint(aliceAddress, ethers.utils.parseEther("10000000000000"));
    await wbnb.mint(bobAddress, ethers.utils.parseEther("10000000000000"));

    [factoryV2, routerV2, cake, syrup, masterChef] = await deployHelper.deployPancakeV2(wbnb, CAKE_REWARD_PER_BLOCK, [
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

    // Seed reward liquidity
    await alpacaToken.mint(miniFL.address, ethers.utils.parseEther("50"));

    //transfer alpacaToken to miniFl
    await alpacaToken.transferOwnership(miniFL.address);

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
      fairlaunchAddr: miniFL.address,
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

    pancakeMasterChefAsAlice = PancakeMasterChef__factory.connect(masterChef.address, alice);
    pancakeMasterChefAsBob = PancakeMasterChef__factory.connect(masterChef.address, bob);

    deltaVaultAsAlice = DeltaNeutralVault__factory.connect(deltaVault.address, alice);
    deltaVaultAsBob = DeltaNeutralVault__factory.connect(deltaVault.address, bob);
    deltaVaultAsEve = DeltaNeutralVault__factory.connect(deltaVault.address, eve);

    // Set block base fee per gas to 0
    await network.provider.send("hardhat_setNextBlockBaseFeePerGas", ["0x0"]);
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

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
    // depsit fund into vaults
    await baseTokenAsDeployer.approve(stableVault.address, ethers.utils.parseEther("10000"));
    await stableVault.deposit(ethers.utils.parseEther("10000"));

    await wbnbTokenAsDeployer.approve(assetVault.address, ethers.utils.parseEther("10000"));
    await assetVault.deposit(ethers.utils.parseEther("10000"));
  });

  describe("#reinvest", async () => {
    beforeEach(async () => {
      // add liquidity
      await swapHelper.addLiquidities([
        {
          token0: baseToken as unknown as IERC20,
          token1: wbnb as unknown as IERC20,
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

      await deltaVault.initPositions(stableTokenAmount, assetTokenAmount, 0, data, {
        value: assetTokenAmount,
      });
    });

    context("when there is a beneficiacy", async () => {
      beforeEach(async () => {
        await deltaVaultConfig.setAlpacaBountyConfig(eveAddress, "1000");
        await deltaVaultConfig.setAlpacaBeneficiaryConfig(aliceAddress, "5000");
      });

      context("when alice deposit to delta neutral vault", async () => {
        it("should be able to reinvest & distribute ALPACA correctly", async () => {
          await swapHelper.addLiquidities([
            {
              token0: baseToken as unknown as IERC20,
              token1: alpacaToken as unknown as IERC20,
              amount0desired: ethers.utils.parseEther("100000"),
              amount1desired: ethers.utils.parseEther("100000"),
            },
          ]);
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

          await deltaVaultAsAlice.deposit(depositStableTokenAmount, depositAssetTokenAmount, aliceAddress, 0, data, {
            value: depositAssetTokenAmount,
          });

          const aliceShares = await deltaVault.balanceOf(aliceAddress);
          const beforePositionVal = await deltaVault.shareToValue(aliceShares);

          // ------- REINVEST PART -------
          await miniFL.massUpdatePools();

          let latest = await TimeHelpers.latestBlockNumber();

          const stableRewardAlpaca = ethers.utils.parseEther("10");
          const assetRewardAlpaca = ethers.utils.parseEther("10");
          const alpacaBefore = await alpacaToken.balanceOf(deltaVault.address);

          latest = await TimeHelpers.latestBlockNumber();

          // calculate swap amount
          const alpacaBountyBps = await deltaVaultConfig.alpacaBountyBps();
          const alpacaBeneficiaryBps = await deltaVaultConfig.alpacaBeneficiaryBps();
          const netAlpacaReceived = stableRewardAlpaca.add(assetRewardAlpaca);
          expect(netAlpacaReceived).to.be.eq(ethers.utils.parseEther("20"));
          const bounty = alpacaBountyBps.mul(netAlpacaReceived).div("10000");
          const beneficiacyShare = bounty.mul(alpacaBeneficiaryBps).div("10000");
          const swapAmount = alpacaBefore.add(netAlpacaReceived).sub(bounty);

          await alpacaToken.approve(routerV2.address, swapAmount);
          const reinvestPath = await deltaVaultConfig.getReinvestPath();

          // calculate amountOut when swap token
          await swapHelper.loadReserves(reinvestPath);
          const [amountInSwap, amountOutSwap] = await swapHelper.computeSwapExactTokensForTokens(
            swapAmount,
            reinvestPath,
            true
          );
          const leverage = await deltaVaultConfig.leverageLevel();
          const principalAmountStable = amountOutSwap.mul(leverage - 2).div(2 * leverage - 2);
          const farmingAmountAsset = amountOutSwap.mul(leverage).div(2 * leverage - 2);
          const dustBaseToken = amountOutSwap.sub(principalAmountStable).sub(farmingAmountAsset);

          await baseTokenAsDeployer.approve(deltaVault.address, amountOutSwap.sub(dustBaseToken));

          const stableDepositWorkByteInput: IDepositWorkByte = {
            posId: 1,
            vaultAddress: stableVault.address,
            workerAddress: stableVaultWorker.address,
            twoSidesStrat: stableTwoSidesStrat.address,
            principalAmount: principalAmountStable,
            borrowAmount: principalAmountStable.mul(leverage - 1),
            farmingTokenAmount: ethers.constants.Zero,
            maxReturn: BigNumber.from(0),
            minLpReceive: BigNumber.from(0),
          };

          const assetDepositWorkByteInput: IDepositWorkByte = {
            posId: 1,
            vaultAddress: assetVault.address,
            workerAddress: assetVaultWorker.address,
            twoSidesStrat: assetTwoSidesStrat.address,
            principalAmount: ethers.constants.Zero,
            borrowAmount: principalAmountStable.mul(leverage - 1),
            farmingTokenAmount: farmingAmountAsset,
            maxReturn: BigNumber.from(0),
            minLpReceive: BigNumber.from(0),
          };

          const stableDepositWorkByte = buildDepositWorkByte(stableDepositWorkByteInput);
          const assetDepositWorkByte = buildDepositWorkByte(assetDepositWorkByteInput);

          const alpacaReinvestFeeTreasuryBefore = await alpacaToken.balanceOf(eveAddress);
          const alpacaBeneficiaryBefore = await alpacaToken.balanceOf(aliceAddress);
          await deltaVault.reinvest(
            [ACTION_WORK, ACTION_WORK],
            [0, 0],
            [stableDepositWorkByte, assetDepositWorkByte],
            0
          );
          const alpacaReinvestFeeTreasuryAfter = await alpacaToken.balanceOf(eveAddress);
          const alpacaBeneficiaryAfter = await alpacaToken.balanceOf(aliceAddress);

          const afterPositionVal = await deltaVault.shareToValue(aliceShares);

          expect(alpacaReinvestFeeTreasuryAfter.sub(alpacaReinvestFeeTreasuryBefore)).to.be.eq(
            bounty.sub(beneficiacyShare)
          );
          expect(alpacaBeneficiaryAfter.sub(alpacaBeneficiaryBefore)).to.be.eq(beneficiacyShare);
          expect(afterPositionVal).be.gt(beforePositionVal);
          expect(await baseToken.balanceOf(deltaVault.address)).to.be.eq(dustBaseToken);
        });
      });
    });

    context("when there is no beneficiacy", async () => {
      beforeEach(async () => {
        await deltaVaultConfig.setAlpacaBountyConfig(eveAddress, "100");
      });

      context("when alice deposit to delta neutral vault", async () => {
        it("should be able to reinvest", async () => {
          await swapHelper.addLiquidities([
            {
              token0: baseToken as unknown as IERC20,
              token1: alpacaToken as unknown as IERC20,
              amount0desired: ethers.utils.parseEther("100000"),
              amount1desired: ethers.utils.parseEther("100000"),
            },
          ]);
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

          const aliceShares = await deltaVault.balanceOf(aliceAddress);
          const beforePositionVal = await deltaVault.shareToValue(aliceShares);

          // ------- REINVEST PART -------
          await miniFL.massUpdatePools();

          let latest = await TimeHelpers.latestBlockNumber();

          const stableRewardAlpaca = ethers.utils.parseEther("10");
          const assetRewardAlpaca = ethers.utils.parseEther("10");
          const alpacaBefore = await alpacaToken.balanceOf(deltaVault.address);

          latest = await TimeHelpers.latestBlockNumber();

          // calculate swap amount
          const alpacaBountyBps = await deltaVaultConfig.alpacaBountyBps();
          const netAlpacaReceived = stableRewardAlpaca.add(assetRewardAlpaca);
          expect(netAlpacaReceived).to.be.eq(ethers.utils.parseEther("20"));
          const bounty = alpacaBountyBps.mul(netAlpacaReceived).div(BigNumber.from("10000"));
          const swapAmount = alpacaBefore.add(netAlpacaReceived).sub(bounty);

          await alpacaToken.approve(routerV2.address, swapAmount);
          const reinvestPath = await deltaVaultConfig.getReinvestPath();

          // calculate amountOut when swap token
          await swapHelper.loadReserves(reinvestPath);
          const [amountInSwap, amountOutSwap] = await swapHelper.computeSwapExactTokensForTokens(
            swapAmount,
            reinvestPath,
            true
          );

          const leverage = await deltaVaultConfig.leverageLevel();
          const principalAmountStable = amountOutSwap.mul(leverage - 2).div(2 * leverage - 2);
          const farmingAmountAsset = amountOutSwap.mul(leverage).div(2 * leverage - 2);
          const dustBaseToken = amountOutSwap.sub(principalAmountStable).sub(farmingAmountAsset);

          await baseTokenAsDeployer.approve(deltaVault.address, amountOutSwap.sub(dustBaseToken));

          const stableDepositWorkByteInput: IDepositWorkByte = {
            posId: 1,
            vaultAddress: stableVault.address,
            workerAddress: stableVaultWorker.address,
            twoSidesStrat: stableTwoSidesStrat.address,
            principalAmount: principalAmountStable,
            borrowAmount: principalAmountStable.mul(leverage - 1),
            farmingTokenAmount: ethers.constants.Zero,
            maxReturn: BigNumber.from(0),
            minLpReceive: BigNumber.from(0),
          };

          const assetDepositWorkByteInput: IDepositWorkByte = {
            posId: 1,
            vaultAddress: assetVault.address,
            workerAddress: assetVaultWorker.address,
            twoSidesStrat: assetTwoSidesStrat.address,
            principalAmount: ethers.constants.Zero,
            borrowAmount: principalAmountStable.mul(leverage - 1),
            farmingTokenAmount: farmingAmountAsset,
            maxReturn: BigNumber.from(0),
            minLpReceive: BigNumber.from(0),
          };

          const stableDepositWorkByte = buildDepositWorkByte(stableDepositWorkByteInput);
          const assetDepositWorkByte = buildDepositWorkByte(assetDepositWorkByteInput);

          await deltaVault.reinvest(
            [ACTION_WORK, ACTION_WORK],
            [0, 0],
            [stableDepositWorkByte, assetDepositWorkByte],
            0
          );

          const afterPositionVal = await deltaVault.shareToValue(aliceShares);

          expect(afterPositionVal).be.gt(beforePositionVal);
          expect(await baseToken.balanceOf(deltaVault.address)).to.be.eq(dustBaseToken);
        });

        describe("_unsafePositionEquity", async () => {
          context("when try to set withdraw execute in action", async () => {
            it("should revert", async () => {
              await swapHelper.addLiquidities([
                {
                  token0: alpacaToken as unknown as IERC20,
                  token1: baseToken as unknown as IERC20,
                  amount0desired: ethers.utils.parseEther("100000"),
                  amount1desired: ethers.utils.parseEther("100000"),
                },
              ]);
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
              const aliceShares = await deltaVault.balanceOf(aliceAddress);
              const beforePositionVal = await deltaVault.shareToValue(aliceShares);

              // ------- INJECT WITHDRAW PART -------

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

              await expect(
                deltaVault.reinvest(
                  [ACTION_WORK, ACTION_WORK],
                  [0, 0],
                  [stableWithdrawWorkByte, assetWithdrawWorkByte],
                  0
                )
              ).to.be.revertedWith("DeltaNeutralVault_UnsafePositionEquity()");
            });
          });

          context("when not set action", async () => {
            it("should revert", async () => {
              await swapHelper.addLiquidities([
                {
                  token0: alpacaToken as unknown as IERC20,
                  token1: baseToken as unknown as IERC20,
                  amount0desired: ethers.utils.parseEther("100000"),
                  amount1desired: ethers.utils.parseEther("100000"),
                },
              ]);

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

              const aliceShares = await deltaVault.balanceOf(aliceAddress);
              await expect(deltaVault.reinvest([], [], [], 0)).to.be.revertedWith(
                "DeltaNeutralVault_UnsafePositionEquity()"
              );
            });
          });
        });
      });

      context("when token return after swap reward less than minTokenReceive", async () => {
        it("should revert", async () => {
          await swapHelper.addLiquidities([
            {
              token0: alpacaToken as unknown as IERC20,
              token1: baseToken as unknown as IERC20,
              amount0desired: ethers.utils.parseEther("100000"),
              amount1desired: ethers.utils.parseEther("100000"),
            },
          ]);

          await expect(deltaVault.reinvest([], [], [], ethers.utils.parseEther("10000000000000"))).to.be.revertedWith(
            "PancakeRouter: INSUFFICIENT_OUTPUT_AMOUNT"
          );
        });
      });

      context("when non set reinvestPath", async () => {
        it("should revert", async () => {
          const deployHelper = new DeployHelper(deployer);

          const deltaNeutralConfig = {
            wNativeAddr: wbnb.address,
            wNativeRelayer: wNativeRelayer.address,
            fairlaunchAddr: miniFL.address,
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
          await deltaVaultConfig.setSwapRouter(routerV2.address);

          // Setup Delta Neutral Vault
          const _deltaNeutral = {
            name: "DELTA_NEUTRAL_VAULT",
            symbol: "DELTA_NEUTRAL_VAULT",
            vaultStable: stableVault.address,
            vaultAsset: assetVault.address,
            stableVaultWorker: stableVaultWorker.address,
            assetVaultWorker: assetVaultWorker.address,
            lpToken: lp.address,
            alpacaToken: alpacaToken.address,
            deltaNeutralOracle: mockPriceOracle.address,
            deltaVaultConfig: deltaVaultConfig.address,
          };
          deltaVault = await deployHelper.deployDeltaNeutralVault(_deltaNeutral);

          await expect(deltaVault.reinvest([], [], [], 0)).to.be.revertedWith("DeltaNeutralVault_BadReinvestPath()");
        });
      });
    });
  });
});
