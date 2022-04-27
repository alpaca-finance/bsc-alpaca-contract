import { DeltaNeutralOracle } from "./../../../../typechain/DeltaNeutralOracle";
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
  DeltaNeutralVault,
  DeltaNeutralVault__factory,
  MockWBNB__factory,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory,
  DeltaNeutralVaultConfig,
  DeltaNeutralPancakeWorker02,
  DeltaNeutralPancakeWorker02__factory,
  IERC20,
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

describe("DeltaNeutralVault", () => {
  const FOREVER = "2000000000";
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther("1");
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

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
    // depsit fund into vaults
    await baseTokenAsDeployer.approve(stableVault.address, ethers.utils.parseEther("10000"));
    await stableVault.deposit(ethers.utils.parseEther("10000"));

    await wbnbTokenAsDeployer.approve(assetVault.address, ethers.utils.parseEther("10000"));
    await assetVault.deposit(ethers.utils.parseEther("10000"));
  });

  describe("#deploy", async () => {
    context("when deploy with wrong config", async () => {
      it("should revert", async () => {
        const deployHelper = new DeployHelper(deployer);
        // Setup Delta Neutral Vault
        const deltaNeutral = {
          name: "DELTA_NEUTRAL_VAULT",
          symbol: "DELTA_NEUTRAL_VAULT",
          vaultStable: stableVault.address,
          vaultAsset: assetVault.address,
          stableVaultWorker: stableVaultWorker.address,
          assetVaultWorker: assetVaultWorker.address,
          lpToken: aliceAddress,
          alpacaToken: alpacaToken.address,
          deltaNeutralOracle: mockPriceOracle.address,
          deltaVaultConfig: deltaVaultConfig.address,
        };
        await expect(deployHelper.deployDeltaNeutralVault(deltaNeutral)).to.revertedWith(
          "DeltaNeutralVault_InvalidLpToken()"
        );
      });
    });
  });

  describe("#setConfig", async () => {
    context("when not owner call set DeltaNeutralVaultConfig", async () => {
      it("should revert", async () => {
        await expect(deltaVaultAsAlice.setDeltaNeutralVaultConfig(aliceAddress)).to.be.reverted;
      });
    });

    context("when owner set wrong DeltaNeutralVaultConfig", async () => {
      it("should revert", async () => {
        await expect(deltaVault.setDeltaNeutralVaultConfig(aliceAddress)).to.be.reverted;
      });
    });

    context("when owner set new DeltaNeutralVaultConfig", async () => {
      it("should be able to set new DeltaNeutralVaultConfig", async () => {
        const deployHelper = new DeployHelper(deployer);

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

        const newDeltaVaultConfig = await deployHelper.deployDeltaNeutralVaultConfig(deltaNeutralConfig);

        const setDeltaVaultConfigTx = await deltaVault.setDeltaNeutralVaultConfig(newDeltaVaultConfig.address);

        expect(newDeltaVaultConfig.address).to.eq(await deltaVault.config());
        expect(setDeltaVaultConfigTx)
          .to.emit(deltaVault, "LogSetDeltaNeutralVaultConfig")
          .withArgs(deployerAddress, newDeltaVaultConfig.address);
      });
    });

    context("when not owner call set DeltaNeutralOracle", async () => {
      it("should revert", async () => {
        await expect(deltaVaultAsAlice.setDeltaNeutralOracle(aliceAddress)).to.be.reverted;
      });
    });
    context("when owner set wrong DeltaNeutralOracle", async () => {
      it("should revert", async () => {
        await expect(deltaVault.setDeltaNeutralOracle(aliceAddress)).to.be.reverted;
      });
    });
    context("when owner set new DeltaNeutralOracle", async () => {
      it("should be able to set new DeltaNeutralOracle", async () => {
        const deployHelper = new DeployHelper(deployer);
        let newPriceOracle;
        let chainlink;

        [newPriceOracle, chainlink] = await deployHelper.deployDeltaNeutralOracle(
          [baseToken.address, wbnb.address],
          [ethers.utils.parseEther("1"), ethers.utils.parseEther("200")],
          [18, 18],
          baseToken.address
        );

        const setDeltaNeutralOracleTx = await deltaVault.setDeltaNeutralOracle(newPriceOracle.address);

        expect(newPriceOracle.address).to.eq(await deltaVault.priceOracle());
        expect(setDeltaNeutralOracleTx)
          .to.emit(deltaVault, "LogSetDeltaNeutralOracle")
          .withArgs(deployerAddress, newPriceOracle.address);
      });
    });
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
            amount0desired: ethers.utils.parseEther("10000000000"),
            amount1desired: ethers.utils.parseEther("10000000000"),
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
        // stableToken = 625 - 249.689057639671804928 = 375.310942360328195072, assetToken = 125 + 248.446043267854514597 = 373.446043267854514597
        // amountB = amountA.mul(reserveB) / reserveA;
        // SafeMath.min(amount0.mul(_totalSupply) / _reserve0, amount1.mul(_totalSupply) / _reserve1);
        // 375.310942360328195072 * 10000 / 100249.689057639671804928 = 374.376166039317091199
        // 373.446043267854514597 * 10000 / 99751.553956732145485403 =  374.376166039317091196
        // stableWorker lp = 374.376166039317091196
        // - After add liquidity
        // stableReserve = 100249.689057639673 + 375.3109423603282 = 100625
        // assetReserve = 99751.55395673214 + 373.4460432678545 = 100125
        // lp supply = 100000 + 374.376166039317091196 = 100374.376166039317091196

        // Action 2: stableToken = 375, assetToken = 1875, stableReserve = 100625, assetReserve = 100125
        // swap 746.302038330887106153 assetToken to stableToken
        // [((746.302038330887106153*9975)*100625)/(100125*10000+(746.302038330887106153*9975))] = 742.6322953782392 stableToken]
        // - After Swap
        // stableReserve = 100625 - 742.6322953782392 = 99882.36770462176
        // assetReserve = 100125 + 746.302038330887106153 = 100871.30203833089
        // - Add liquidity
        // add liquidity stableToken = 375 + 742.6322953782392 = 1117.6117772394427, assetToken = 1875 - 746.302038330887106153 = 1128.6979616691128
        // 1117.6117772394427 * 100374.376166039317091196 / 99882.36770462176 = 1123.116997666413775361
        // 1128.6979616691128 * 100374.376166039317091196 / 100871.30203833089 = 1123.137616875079991374
        // assetWorker lp = 1123.137616875079991374 , actual lp = 1123.137616875080116978
        // - After add liquidity
        // stableReserve = 99882.36770462176 + 1117.6117772394427 = 100999.9794818612
        // assetReserve = 100871.30203833089 + 1128.6979616691128 = 102000
        // lp supply = 100374.376166039317091196 + 1123.137616875080116978 = 101497.513782914397208174

        // positionValue = 2 * (374.376166039317091196 + 1123.137616875080116978) = 2995.027565828794416348
        // debtValue = (1 * 500) + (1 * 1500) = 2000
        // equityValue = 2995.027565828794416348 - 2000 = 995.027565828794416348
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
        // apply 0.5% slippage = 995
        const minSharesReceive = ethers.utils.parseEther("995");
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

        // shareReceive  = depositValue * totalSupply / Equity
        // since totalSupply = 0, shareReceive = depositValue = (1*500 + 1*500) = 1000
        // since this is not 3x apply 1% slippage = 990
        const minSharesReceive = ethers.utils.parseEther("990");
        const stableTokenPrice = ethers.utils.parseEther("1");
        const assetTokenPrice = ethers.utils.parseEther("1");
        const lpPrice = ethers.utils.parseEther("2");

        await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
        await setMockLpPrice(lpPrice);

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
    context("when alice try deposit to delta neutral vault before positions initialized", async () => {
      it("should revert", async () => {
        await swapHelper.addLiquidities([
          {
            token0: baseToken as unknown as IERC20,
            token1: wbnb as unknown as IERC20,
            amount0desired: ethers.utils.parseEther("10000000000"),
            amount1desired: ethers.utils.parseEther("10000000000"),
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
        ).to.revertedWith("DeltaNeutralVault_PositionsNotInitialized()");
      });
    });

    describe("when positions initialized", async () => {
      beforeEach(async () => {
        // add liquidity
        await swapHelper.addLiquidities([
          {
            token0: baseToken as unknown as IERC20,
            token1: wbnb as unknown as IERC20,
            amount0desired: ethers.utils.parseEther("10000000000"),
            amount1desired: ethers.utils.parseEther("10000000000"),
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

          // lp supply 101497.513782914397208174
          // Action1: stableToken = 625, assetToken = 125
          // actual lp =375.605325678087635489

          // Action2: stableToken = 375, assetToken = 1875,
          // actual lp 1119.503142860026043124

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

          // deposit value = (1 *250) + (1 *750) = 1000
          // expect alice share = depositValue * shareSupply / totalEquity = 1000 * (995027565828794416348 / 995027565828794416348) = 1000
          // applied 0.5% slippage = 995

          const expectAliceShare = ethers.utils.parseEther("995");
          const expectPosiitonValueDiff = stableLpDiff.add(assetLpDiff).mul(lpPrice).div(ethers.utils.parseEther("1"));
          const aliceShare = await deltaVault.balanceOf(aliceAddress);

          expect(aliceShare).to.at.least(expectAliceShare);
          expect(expectPosiitonValueDiff).to.eq(positionValueAfter.sub(positionValueBefore));
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
            ).to.be.revertedWith(
              "DeltaNeutralVault_InsufficientShareReceived(1000000000000000000000000000000, 997496795745176936356)"
            );
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

        describe("_execute", async () => {
          context("when input bad action size", async () => {
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
              // bad actions input
              const data = ethers.utils.defaultAbiCoder.encode(
                ["uint8[]", "uint256[]", "bytes[]"],
                [[ACTION_WORK, ACTION_WORK], [0], [stableWorkByte, assetWorkByte]]
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
              ).to.be.revertedWith("DeltaNeutralVault_BadActionSize()");
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
                ).to.be.revertedWith("DeltaNeutralVault_UnsafePositionEquity()");
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
              ).to.be.revertedWith("DeltaNeutralVault_UnsafePositionEquity()");
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
              ).to.be.revertedWith("DeltaNeutralVault_UnsafeDebtValue()");
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
              ).to.be.revertedWith("DeltaNeutralVault_UnsafeDebtValue()");
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

        context("when native amount and _assetTokenAmount mismatch", async () => {
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

            await expect(
              deltaVaultAsAlice.deposit(stableTokenAmount, assetTokenAmount, aliceAddress, 0, data, {
                value: 0,
              })
            ).to.be.revertedWith("DeltaNeutralVault_IncorrectNativeAmountDeposit()");
          });
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
          ).to.revertedWith("DeltaNeutralVault_PositionValueExceedLimit()");
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
        const lpPrice = ethers.utils.parseEther("2");

        await setMockTokenPrice(stableTokenPrice, assetTokenPrice);
        await setMockLpPrice(lpPrice);

        const initTx = await deltaVault.initPositions(
          stableTokenAmount,
          assetTokenAmount,
          ethers.utils.parseEther("995"),
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
          await swapHelper.loadReserves([baseToken.address, wbnb.address]);
          const lpPrice = await swapHelper.computeLpHealth(
            ethers.utils.parseEther("1"),
            baseToken.address,
            wbnb.address
          );

          await setMockLpPrice(lpPrice);

          // Current Delta Neutral Position
          // Stable Position:
          // Equity=496.859775279132755434, PositionValue=1496.859775279132755434 Debt=1000.00
          // Asset Position:
          // Equity=1490.562691116413626439, PositionValue=4490.562691116413626439, Debt=3000.00
          // totalEquity=496.859775279132755434 + 1490.562691116413626439 = 1987.422466395546381873

          // ***** Target: Delta Neutral Position After Withdraw 200 Equity *****
          // totalEquity = 1987.422466395546381873 - 200 = 1787.422466395546381873
          // - % equity to withdraw
          // % stableEquity = 496.859775279132755434/1987.422466395546381873 = 0.250002092499363611
          // % assetEquity = 1490.562691116413626439/1987.422466395546381873 = 0.749997907500636388

          // Target Stable Position:
          // Equity = 1787.422466395546381873*0.250002092499363611 = 446.859356779260032153
          // PositionValue = 446.859356779260032153 * Lerverage = 446.859356779260032153*3 = 1340.578070337780096459
          // Debt = 1340.578070337780096459 - 446.859356779260032153 = 893.718713558520064306
          // deltaEquity = 446.859356779260032153 - 496.859775279132755434 = -50.000418499872723281
          // debtaDebt = 893.718713558520064306 - 1000.00 = -106.281286441479935694

          // deltaEquityWithSlippage = -50.000418499872723281 * 9970/10000 = -49.850417244373105111
          // deltaDebtWithSlippage = -106.281286441479935694 * 9970/10000 = -105.962442582155495886

          // expectStableEquity = 446.859356779260032153 + (50.000418499872723281 - 49.850417244373105111) = 447.009358034759650323
          // expectStableDebt = 893.718713558520064306 + (106.281286441479935694 - 105.962442582155495886) = 894.037557417844504114

          // Target Asset Position:
          // Equity = 1787.422466395546381873 * 0.749997907500636388 = 1340.563109616286347932
          // PositionValue = 1340.563109616286347932 * 3 = 4021.689328848859043796
          // Debt = 4021.689328848859043796 - 1340.563109616286347932 = 2681.126219232572695864
          // deltaEquity = 1340.563109616286347932 - 1490.562691116413626439 = -149.999581500127278507
          // debtaDebt = 2681.126219232572695864 - 3000  = -318.873780767427304136

          // deltaEquityWithSlippage = -149.999581500127278507 * 9970/10000 = -149.549582755626896671
          // deltaDebtWithSlippage = -318.873780767427304136 * 9970/10000 = -317.917159425125022223

          // expectAssetEquity = 1340.563109616286347932 + (149.999581500127278507 - 149.549582755626896671) = 1341.013108360786729768
          // expectAssetDebt = 2681.126219232572695864 + (318.873780767427304136 - 317.917159425125022223) = 2682.082840574874977777

          const expectStableEquity = ethers.utils.parseEther("447.009358034759650323");
          const expectStableDebt = ethers.utils.parseEther("894.037557417844504114");
          const expectAssetEquity = ethers.utils.parseEther("1341.013108360786729768");
          const expectAssetDebt = ethers.utils.parseEther("2682.082840574874977777");

          // Action1: partialCloseMinimize lp = 78.004799780378508254
          // return stableToken = 105.962442582155495886, repay debt -105.962442582155495886, remaining = 0
          // return assetToken = 49.976458329680142948

          const stableDebtToRepay = ethers.utils.parseEther("105.962442582155495886");
          const stableValueToWithDraw = ethers.utils.parseEther("49.850417244373105111").add(stableDebtToRepay);
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
          // return stableToken = 149.931452849760353839
          // return assetToken = 317.917159425125022223, repay debt -317.917159425125022223, remaining = 0

          const assetDebtToRepay = ethers.utils.parseEther("317.917159425125022223");
          const assetValueToWithDraw = ethers.utils.parseEther("149.549582755626896671").add(assetDebtToRepay);
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
          const minStableTokenReceive = ethers.utils.parseEther("149.931452849760353839");
          const minAssetTokenReceive = ethers.utils.parseEther("49.976458329680142948");

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

        it("if there's withdrawal fee but alice is exempted, should work the same way", async () => {
          await deltaVaultConfig.setFees(eveAddress, 0, eveAddress, 20, eveAddress, 0);
          await deltaVaultConfig.setFeeExemptedCallers([aliceAddress], true);
          await swapHelper.loadReserves([baseToken.address, wbnb.address]);
          const lpPrice = await swapHelper.computeLpHealth(
            ethers.utils.parseEther("1"),
            baseToken.address,
            wbnb.address
          );

          await setMockLpPrice(lpPrice);

          const expectStableEquity = ethers.utils.parseEther("447.009358034759650323");
          const expectStableDebt = ethers.utils.parseEther("894.037557417844504114");
          const expectAssetEquity = ethers.utils.parseEther("1341.013108360786729768");
          const expectAssetDebt = ethers.utils.parseEther("2682.082840574874977777");

          const stableDebtToRepay = ethers.utils.parseEther("105.962442582155495886");
          const stableValueToWithDraw = ethers.utils.parseEther("49.850417244373105111").add(stableDebtToRepay);
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

          const assetDebtToRepay = ethers.utils.parseEther("317.917159425125022223");
          const assetValueToWithDraw = ethers.utils.parseEther("149.549582755626896671").add(assetDebtToRepay);
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
          const minStableTokenReceive = ethers.utils.parseEther("149.931452849760353839");
          const minAssetTokenReceive = ethers.utils.parseEther("49.976458329680142948");

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

        it("should not able to when send share amount as 0", async () => {
          // ======== withdraw ======
          await swapHelper.loadReserves([baseToken.address, wbnb.address]);
          let lpPrice = await swapHelper.computeLpHealth(ethers.utils.parseEther("1"), baseToken.address, wbnb.address);

          await setMockLpPrice(lpPrice);

          const withdrawData = ethers.utils.defaultAbiCoder.encode(["uint8[]", "uint256[]", "bytes[]"], [[], [], []]);
          await TimeHelpers.increase(TimeHelpers.duration.minutes(ethers.BigNumber.from("30")));
          await expect(deltaVaultAsAlice.withdraw(0, 0, 0, withdrawData)).to.be.revertedWith(
            "DeltaNeutralVault_InvalidShareAmount()"
          );
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
          await TimeHelpers.increase(TimeHelpers.duration.minutes(ethers.BigNumber.from("1440")));
          await expect(deltaVaultAsAlice.withdraw(shareToWithdraw, 0, 0, withdrawData)).to.be.revertedWith(
            "DeltaNeutralVault_UnTrustedPrice()"
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
            `InsufficientTokenReceived("${baseToken.address}", 1000000000000000000000000, 149813699100046854016)`
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
            `InsufficientTokenReceived("${wbnb.address}", 100000000000000000000, 49936781539802944371)`
          );
        });

        it("should revert if debt ratio change more than 30 BPS", async () => {
          await swapHelper.loadReserves([baseToken.address, wbnb.address]);
          const lpPrice = await swapHelper.computeLpHealth(
            ethers.utils.parseEther("1"),
            baseToken.address,
            wbnb.address
          );

          await setMockLpPrice(lpPrice);
          // Same calculation from previos test case

          // Action1: partialCloseMinimize lp = 78.004799780378508254
          // return stableToken = 105.962442582155495886, repay debt -105.962442582155495886, remaining = 0
          // return assetToken = 49.976458329680142948

          // Try to repay more debt which will get from other's LP in the pool
          const stableDebtToRepay = ethers.utils.parseEther("110.962442582155495886");
          const stableValueToWithDraw = ethers.utils.parseEther("49.850417244373105111").add(stableDebtToRepay);
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
          // return stableToken = 149.931452849760353839
          // return assetToken = 317.917159425125022223, repay debt -317.917159425125022223, remaining = 0

          const assetDebtToRepay = ethers.utils.parseEther("317.917159425125022223");
          const assetValueToWithDraw = ethers.utils.parseEther("149.549582755626896671").add(assetDebtToRepay);
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

          // ======== withdraw ======
          const minStableTokenReceive = ethers.utils.parseEther("149.931452849760353839");
          const minAssetTokenReceive = ethers.utils.parseEther("49.976458329680142948");

          await expect(
            deltaVaultAsAlice.withdraw(shareToWithdraw, 0, 0, withdrawData, { gasPrice: 0 })
          ).to.be.revertedWith("DeltaNeutralVault_UnsafeDebtRatio()");
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
                  [
                    [ACTION_WORK, ACTION_WORK],
                    [0, 0],
                    [stableWithdrawWorkByte, assetWithdrawWorkByte],
                  ]
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
                  [
                    [ACTION_WORK, ACTION_WORK],
                    [0, 0],
                    [stableWithdrawWorkByte, assetWithdrawWorkByte],
                  ]
                );
                const shareToWithdraw = await deltaVault.valueToShare(withdrawValue);
                await expect(deltaVaultAsAlice.withdraw(shareToWithdraw, 0, 0, withdrawData)).to.be.revertedWith(
                  "UnsafePositionValue()"
                );
              });
            }
          );
        });
      });

      context("when alice withdraw from delta neutral vault with withdrawal fee", async () => {
        let withdrawData: string;
        let withdrawalFee = 100; // 1%
        beforeEach(async () => {
          await deltaVaultConfig.setFees(eveAddress, 0, eveAddress, withdrawalFee, eveAddress, 0);

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
            const shareToWithdraw = ethers.utils.parseEther("205");
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
      });
    });
  });

  describe("#rebalance", async () => {
    describe("when positions initialized", async () => {
      beforeEach(async () => {
        // add liquidity to make price baseToken:wbnb = 1:500
        await swapHelper.addLiquidities([
          {
            token0: baseToken as unknown as IERC20,
            token1: wbnb as unknown as IERC20,
            amount0desired: ethers.utils.parseEther("50000000"),
            amount1desired: ethers.utils.parseEther("100000"),
          },
        ]);
        // lp total supply = 2236067.977499789696409173

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
        // - Add liquidity
        // stableToken = 750 - 375.467928673591501565 = 374.532071326408498435, assetToken = 0.749052906859214108
        // amountB = amountA.mul(reserveB) / reserveA;
        // SafeMath.min(amount0.mul(_totalSupply) / _reserve0, amount1.mul(_totalSupply) / _reserve1);
        // 374.532071326408498435 * 2236067.977499789696409173 / 50000375.467928673591501565 = 16.749457647109601234
        // 0.749052906859214108 * 2236067.977499789696409173 / 99999.250947093140785892 =  16.749457804330527033
        // stableWorker lp = 16.749457647109601234 , actual lp = 16.749457647109601219
        // After add liquidity
        // new Reserve after add liquidity
        // stableReserve = 50000375.467928673591501565 + 374.532071326408498435 = 50000750
        // assetReserve = 99999.250947093140785892 + 0.749052906859214108 = 100000
        // lp supply = 2236067.977499789696409173 + 16.749457647109601234 = 2236084.726957436806010407

        // Action 2:
        // stableToken = 0, assetToken = 4.5, stableReserve = 50000750, assetReserve = 100000
        // swap assetToken = 2.252790676454731706 to stableToken
        // [((2.252790676454731706*9975)*50000750)/(100000*10000+(2.252790676454731706*9975))] = 1123.570955149579004645 stableToken]
        // - After Swap
        // stableReserve = 50000750 - 1123.570955149579004645 = 49999626.429044850420995355
        // assetReserve = 100000 + 2.252790676454731706  = 100002.252790676454731706
        // - Add liquidity
        // stableToken = 1123.570955149579004645, assetToken = 4.5 - 2.252790676454731706 = 2.247209323545268294
        // 1123.570955149579004645 * 2236084.726957436806010407 / 49999626.429044850420995355 = 50.248372475909067628
        // 2.247209323545268294 * 2236084.726957436806010407 / 100002.252790676454731706 = 50.248372475909067664
        // assetWorker lp = 50.248372475909067664, actual lp = 50.248372475909067619
        // After add liquidity
        // stableReserve = 49999626.429044850420995355 + 1123.570955149579004645 = 50000750
        // assetReserve = 100002.252790676454731706 + 2.247209323545268294 = 100004.5

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
          // stableReserve = 50000750 - 5266912.937520859413813218 = 44733837.062479140586186687
          // assetReserve = 100004.5 + 11803.930027938855 = 111808.430027938854999998
          // lpSupply = 2236134.975329912715078011

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
          // Equity=169.307323967817993606, PositionValue=669.307323967817993606 Debt=500.00,  debtRatio=74.7040981168228300%
          // Asset Position:
          // Equity=807.921953305309216222, PositionValue=2007.921953305309216222, Debt=1200.00, debtRatio=59.7632790470087161377%
          // totalEquity=169.307323967817993606 + 807.921953305309216222 = 977.229277273127209828

          // Target
          // Stable Position:
          // Equity=977.229277273127209828/4= 244.307319318281802457, PositionValue=244.307319318281802457*3=732.921957954845407371, Debt=488.614638636563604914
          // deltaEquity = 244.307319318281802457 - 169.307323967817993606 = 74.999995350463808851, deltaDebt = 488.614638636563604914 - 500.00 = -11.385361363436395086
          // Asset Position:
          // Equity=977.229277273127209828*3/4= 732.921957954845407371, PositionValue=732.921957954845407371*3= 2198.765873864536222113, Debt=1465.843915909690814742
          // deltaEquity = 732.921957954845407371 - 807.921953305309216222= -74.999995350463808851, deltaDebt = 1465.843915909690814742 - 1200.00= 265.843915909690814742
          // totalEquity = 244.307319318281802457 + 732.921957954845407371 = 977.229277273127209828

          const expectedStableEquity = ethers.utils.parseEther("244.307319318281802457");
          const expectedStableDebt = ethers.utils.parseEther("488.614638636563604914");
          const expectedAssetEquity = ethers.utils.parseEther("732.921957954845407371");
          const expectedAssetDebt = ethers.utils.parseEther("1465.843915909690814742");

          // Step1: Partial Close Asset position by -74.999995350463808851 since it has negative deltaEquity

          // Action1: Remove 74.999995350463808851 = 74.999995350463808851/39.959940081004244081 = 1.876879574854932156 lp
          // amount0 = liquidity.mul(balance0) / _totalSupply
          // stableTokenBack = 1.876879574854932156 * 44733837.062479140586186687 / 2236134.975329912715078011 = 37.546939703435586983
          // assetTokenBack = 1.876879574854932156 * 111808.430027938854999998 / 2236134.975329912715078011 = 0.093845389894263659
          const valueToLiquidate = ethers.utils.parseEther("74.999995350463808851");
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

          // Action2: Brrow more assetToken = 265.843915909690814742/400 =  0.664544685607560374355

          // Step2: Borrow more 265.843915909690814742 usd on asset position since it has positive delta debt
          const borrowMoreAmount = ethers.utils
            .parseEther("265.843915909690814742")
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

          // Step3: Wrap BNB since BNB vault return in native form
          const farmingTokenAmount = ethers.utils.parseEther("0.093845389894263659");

          // Step4: Add collateral on stable position by 74.999995350463808851 = 74.999995350463808851/400 = 0.1874999883761595221275 lp
          // Token left frop Step1. asset = 0.093845389894263659, baseToken = 37.546939703435586983
          // sum = 0.093845389894263659 * 400 + 37.546939703435586983 = 75.085095661141050583
          const action4WorkbyteInput: IDepositWorkByte = {
            posId: 1,
            vaultAddress: stableVault.address,
            workerAddress: stableVaultWorker.address,
            twoSidesStrat: stableTwoSidesStrat.address,
            principalAmount: ethers.utils.parseEther("37.546939703435586983"),
            borrowAmount: BigNumber.from(0),
            maxReturn: BigNumber.from(0),
            farmingTokenAmount: farmingTokenAmount,
            minLpReceive: BigNumber.from(0),
          };
          const action4 = buildDepositWorkByte(action4WorkbyteInput);

          // Step5: Repay debt by 11.385361363436395086
          const repayAmt = ethers.utils.parseEther("11.385361363436395086");
          const valueToRepayWithSlippage = repayAmt.add(repayAmt.mul(25).div(10000));
          const lpToRepay = valueToRepayWithSlippage.mul(ethers.utils.parseEther("1")).div(lpPrice);
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
                  ethers.utils.defaultAbiCoder.encode(["uint256", "uint256", "uint256"], [lpToRepay, repayAmt, 0]),
                ]
              ),
            ]
          );

          const totalEquityBefore = await deltaVault.totalEquityValue();

          const rebalanceTx = await deltaVault.rebalance(
            [ACTION_WORK, ACTION_WORK, ACTION_WRAP, ACTION_WORK, ACTION_WORK],
            [0, 0, farmingTokenAmount, 0, 0],
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

      context("when user try rebalance but position is healthy", async () => {
        it("should revert", async () => {
          await expect(deltaVault.rebalance([], [], [])).to.be.revertedWith("DeltaNeutralVault_PositionsIsHealthy()");
        });
      });

      context("when asset token price drop but try liquidate too much", async () => {
        it("should revert", async () => {
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

          // Step1: Partial Close Asset position by -75.000516183797142151 since it has negative deltaEquity
          // but user try liquidate 100
          const valueToLiquidate = ethers.utils.parseEther("100");
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

          // Step3: Wrap BNB since BNB vault return in native form
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
          const lpToRepay = valueToRepayWithSlippage.mul(ethers.utils.parseEther("1")).div(lpPrice);
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
                  ethers.utils.defaultAbiCoder.encode(["uint256", "uint256", "uint256"], [lpToRepay, repayAmt, 0]),
                ]
              ),
            ]
          );

          await expect(
            deltaVault.rebalance(
              [ACTION_WORK, ACTION_WORK, ACTION_WRAP, ACTION_WORK, ACTION_WORK],
              [0, 0, farmingTokenAmount, 0, 0],
              [action1, action2, EMPTY_BYTE, action4, action5]
            )
          ).to.be.revertedWith("DeltaNeutralVault_UnsafePositionValue()");
        });
      });
    });
  });

  describe("#managementfee", async () => {
    describe("when positions initialized", async () => {
      beforeEach(async () => {
        // add liquidity
        await deltaVaultConfig.setFees(eveAddress, 0, eveAddress, 0, eveAddress, 100);
        await swapHelper.addLiquidities([
          {
            token0: baseToken as unknown as IERC20,
            token1: wbnb as unknown as IERC20,
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
          ethers.utils.parseEther("995"),
          data,
          {
            value: assetTokenAmount,
          }
        );
        const treasuryAddress = await deltaVaultConfig.managementFeeTreasury();
        expect(await deltaVault.balanceOf(treasuryAddress)).to.be.eq(0);
      });

      context("when alice interact with delta neutral vault", async () => {
        it("there should be management fee in treasury", async () => {
          await TimeHelpers.increase(BigNumber.from("3600"));
          const treasuryAddress = await deltaVaultConfig.managementFeeTreasury();
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
          const managementFeePerSec = await deltaVaultConfig.managementFeePerSec();
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
            .mul(managementFeePerSec)
            .div(ethers.utils.parseEther("1"));
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
            .mul(managementFeePerSec)
            .div(ethers.utils.parseEther("1"));
          const manageFeeBalanceAfterWithdraw = await deltaVault.balanceOf(treasuryAddress);
          actualManagementFee = manageFeeBalanceAfterWithdraw.sub(manageFeeBalanceBeforeWithdraw);
          Assert.assertAlmostEqual(actualManagementFee.toString(), expectedManagementFee.toString());
        });
      });
    });
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
          await fairLaunch.massUpdatePools();

          let latest = await TimeHelpers.latestBlockNumber();

          // calculate ALPACA REWARD

          // formula = user.amount.mul(accAlpacaPerShare).div(1e12).sub(user.rewardDebt);
          // STABLE POSITION
          // user.amount 1000.000000000000000000
          // accAlpacaPerShare 7000000000
          // user.rewardDebt 5.000000000000000000
          // ((1000.000000000000000000 * 7000000000)/ 1000000000000) - 5.000000000000000000
          // (7000000000000.000000000000000000 / 1000000000000) - 5.000000000000000000 => 2.000000000000000000

          // ASSET POSITION
          // user.amount 3000.000000000000000000
          // accAlpacaPerShare 2333333332
          // user.rewardDebt 4.999999998000000000
          // ((3000.000000000000000000*2333333332) / 1000000000000) - 4.999999998000000000
          // (6999999996000.000000000000000000 / 1000000000000) - 4.999999998000000000 = > 1.999999998000000000

          // reward from both pool => (2.000000000000000000 +1.999999998000000000 )  => 3.999999998000000000

          const stableRewardAlpaca = ethers.utils.parseEther("2");
          const assetRewardAlpaca = ethers.utils.parseEther("1.999999998");
          const alpacaBefore = await alpacaToken.balanceOf(deltaVault.address);

          latest = await TimeHelpers.latestBlockNumber();

          // calculate swap amount
          const alpacaBountyBps = await deltaVaultConfig.alpacaBountyBps();
          const alpacaBeneficiaryBps = await deltaVaultConfig.alpacaBeneficiaryBps();
          const netAlpacaReceived = stableRewardAlpaca.add(assetRewardAlpaca);
          expect(netAlpacaReceived).to.be.eq(ethers.utils.parseEther("3.999999998"));
          const outstandingAlpaca = await alpacaToken.balanceOf(deltaVault.address);
          const bounty = alpacaBountyBps.mul(outstandingAlpaca.add(netAlpacaReceived)).div("10000");

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
          await fairLaunch.massUpdatePools();

          let latest = await TimeHelpers.latestBlockNumber();

          // calculate ALPACA REWARD

          // formula = user.amount.mul(accAlpacaPerShare).div(1e12).sub(user.rewardDebt);
          // STABLE POSITION
          // user.amount 1000.000000000000000000
          // accAlpacaPerShare 7000000000
          // user.rewardDebt 5.000000000000000000
          // ((1000.000000000000000000 * 7000000000)/ 1000000000000) - 5.000000000000000000
          // (7000000000000.000000000000000000 / 1000000000000) - 5.000000000000000000 => 2.000000000000000000

          // ASSET POSITION
          // user.amount 3000.000000000000000000
          // accAlpacaPerShare 2333333332
          // user.rewardDebt 4.999999998000000000
          // ((3000.000000000000000000*2333333332) / 1000000000000) - 4.999999998000000000
          // (6999999996000.000000000000000000 / 1000000000000) - 4.999999998000000000 = > 1.999999998000000000

          // reward from both pool => (2.000000000000000000 +1.999999998000000000 )  => 3.999999998000000000

          const stableRewardAlpaca = ethers.utils.parseEther("2");
          const assetRewardAlpaca = ethers.utils.parseEther("1.999999998");
          const alpacaBefore = await alpacaToken.balanceOf(deltaVault.address);

          latest = await TimeHelpers.latestBlockNumber();

          // calculate swap amount
          const alpacaBountyBps = await deltaVaultConfig.alpacaBountyBps();
          const netAlpacaReceived = stableRewardAlpaca.add(assetRewardAlpaca);
          expect(netAlpacaReceived).to.be.eq(ethers.utils.parseEther("3.999999998"));

          const bounty = alpacaBountyBps.mul(alpacaBefore.add(netAlpacaReceived)).div(BigNumber.from("10000"));
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
