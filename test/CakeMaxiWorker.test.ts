import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet, BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  PancakeFactory,
  PancakeFactory__factory,
  PancakeRouterV2__factory,
  PancakeMasterChef,
  PancakeMasterChef__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouterV2,
  PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading,
  PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading__factory,
  PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedCakeMaxiStrategyAddBaseWithFarm,
  PancakeswapV2RestrictedCakeMaxiStrategyAddBaseWithFarm__factory,
  PancakeswapV2RestrictedCakeMaxiStrategyLiquidate,
  PancakeswapV2RestrictedCakeMaxiStrategyLiquidate__factory,
  MockVaultForRestrictedCakeMaxiAddBaseWithFarm,
  MockVaultForRestrictedCakeMaxiAddBaseWithFarm__factory,
  WETH,
  WETH__factory,
  WNativeRelayer__factory,
  WNativeRelayer,
  CakeMaxiWorker__factory,
  CakeMaxiWorker,
  CakeToken,
  SyrupBar,
  CakeToken__factory,
  SyrupBar__factory
} from "../typechain";
import * as TimeHelpers from "./helpers/time"
import * as Assert from "./helpers/assert"

chai.use(solidity);
const { expect } = chai;

describe('CakeMaxiWorker', () => {
  const FOREVER = '2000000000';
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther('5000');
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther('0.1');
  const REINVEST_BOUNTY_BPS = '100'; // 1% reinvest bounty
  const RESERVE_POOL_BPS = '1000'; // 10% reserve pool
  const KILL_PRIZE_BPS = '1000'; // 10% Kill prize
  const INTEREST_RATE = '3472222222222'; // 30% per year
  const MIN_DEBT_SIZE = ethers.utils.parseEther('1'); // 1 BTOKEN min debt size
  const WORK_FACTOR = '7000';
  const KILL_FACTOR = '8000';
  const poolId = 0

  /// PancakeswapV2-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouterV2;
  let masterChef: PancakeMasterChef;

  /// cake maxi worker instance(s)
  let cakeMaxiWorkerNative: CakeMaxiWorker;
  let cakeMaxiWorkerNonNative: CakeMaxiWorker;

  /// Token-related instance(s)
  let wbnb: WETH
  let baseToken: MockERC20;
  let cake: CakeToken;
  let syrup: SyrupBar;

  /// Strategy instance(s)
  let stratAdd: PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly
  let stratLiq: PancakeswapV2RestrictedCakeMaxiStrategyLiquidate
  let stratAddWithFarm: PancakeswapV2RestrictedCakeMaxiStrategyAddBaseWithFarm
  let stratMinimize: PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading;
  let stratEvil: PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let eve: Signer;

  // Vault
  let mockedVault: MockVaultForRestrictedCakeMaxiAddBaseWithFarm

  // Contract Signer
  let baseTokenAsAlice: MockERC20;

  let cakeAsAlice: MockERC20;

  let wbnbTokenAsAlice: WETH;
  let wbnbTokenAsBob: WETH;

  let routerV2AsAlice: PancakeRouterV2;

  let cakeMaxiWorkerNativeAsAlice: CakeMaxiWorker
  let cakeMaxiWorkerNonNativeAsAlice: CakeMaxiWorker
  let cakeMaxiWorkerNativeAsEve: CakeMaxiWorker
  let cakeMaxiWorkerNonNativeAsEve: CakeMaxiWorker
  let notOperatorCakeMaxiWorker: CakeMaxiWorker

  let wNativeRelayer: WNativeRelayer;

  beforeEach(async () => {
    [deployer, alice, bob, eve] = await ethers.getSigners();
    // Setup Vault
    const MockVault =  (await ethers.getContractFactory(
        "MockVaultForRestrictedCakeMaxiAddBaseWithFarm",
        deployer
      )) as MockVaultForRestrictedCakeMaxiAddBaseWithFarm__factory;
    mockedVault = await upgrades.deployProxy(MockVault) as MockVaultForRestrictedCakeMaxiAddBaseWithFarm;
    await mockedVault.deployed();

    await mockedVault.setMockOwner(await alice.getAddress())
    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory(
      "PancakeFactory",
      deployer
    )) as PancakeFactory__factory;
    factoryV2 = await PancakeFactory.deploy((await deployer.getAddress()));
    await factoryV2.deployed();

    const WBNB = (await ethers.getContractFactory(
      "WETH",
      deployer
    )) as WETH__factory;
    wbnb = await WBNB.deploy();
    await wbnb.deployed()
    /// Setup WNativeRelayer
    const WNativeRelayer = (await ethers.getContractFactory(
      'WNativeRelayer',
      deployer
    )) as WNativeRelayer__factory;
    wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
    await wNativeRelayer.deployed();
    
    const PancakeRouterV2 = (await ethers.getContractFactory(
      "PancakeRouterV2",
      deployer
    )) as PancakeRouterV2__factory;
    routerV2 = await PancakeRouterV2.deploy(factoryV2.address, wbnb.address);
    await routerV2.deployed();

    /// Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory(
      "MockERC20",
      deployer
    )) as MockERC20__factory
    baseToken = await upgrades.deployProxy(MockERC20, ['BTOKEN', 'BTOKEN']) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther('100'));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther('100'));
    const CakeToken = (await ethers.getContractFactory(
        "CakeToken",
        deployer
    )) as CakeToken__factory;
    cake = await CakeToken.deploy();
    await cake.deployed()
    await cake["mint(address,uint256)"](await deployer.getAddress(), ethers.utils.parseEther('100'));
    await cake["mint(address,uint256)"](await alice.getAddress(), ethers.utils.parseEther('10'));
    await cake["mint(address,uint256)"](await bob.getAddress(), ethers.utils.parseEther('10'));
    await factoryV2.createPair(baseToken.address, wbnb.address);
    await factoryV2.createPair(cake.address, wbnb.address);
    const SyrupBar = (await ethers.getContractFactory(
        "SyrupBar",
        deployer
    )) as SyrupBar__factory;
    syrup = await SyrupBar.deploy(cake.address);
    await syrup.deployed();

    // Setup Strategies
    const PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
        "PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly",
        deployer
    )) as PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly__factory;
    stratAdd = await upgrades.deployProxy(PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly, [routerV2.address]) as PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly;
    await stratAdd.deployed();

    const PancakeswapV2RestrictedCakeMaxiStrategyAddBaseWithFarm = (await ethers.getContractFactory(
        "PancakeswapV2RestrictedCakeMaxiStrategyAddBaseWithFarm",
        deployer
    )) as PancakeswapV2RestrictedCakeMaxiStrategyAddBaseWithFarm__factory;
    stratAddWithFarm = await upgrades.deployProxy(PancakeswapV2RestrictedCakeMaxiStrategyAddBaseWithFarm, [routerV2.address, mockedVault.address]) as PancakeswapV2RestrictedCakeMaxiStrategyAddBaseWithFarm;
    await stratAddWithFarm.deployed();

    const PancakeswapV2RestrictedCakeMaxiStrategyLiquidate = (await ethers.getContractFactory(
        "PancakeswapV2RestrictedCakeMaxiStrategyLiquidate",
        deployer
    )) as PancakeswapV2RestrictedCakeMaxiStrategyLiquidate__factory;
    stratLiq = await upgrades.deployProxy(PancakeswapV2RestrictedCakeMaxiStrategyLiquidate, [routerV2.address]) as PancakeswapV2RestrictedCakeMaxiStrategyLiquidate;
    await stratLiq.deployed();

    const PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
        "PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading",
        deployer
    )) as PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading__factory;
    stratMinimize = await upgrades.deployProxy(PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading, [routerV2.address, wNativeRelayer.address]) as PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading;
    await stratMinimize.deployed();

    const EvilStrat = (await ethers.getContractFactory(
        "PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading",
        deployer
    )) as PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading__factory;
    stratEvil = await upgrades.deployProxy(EvilStrat, [routerV2.address, wNativeRelayer.address]) as PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading;
    await stratEvil.deployed()

    await wNativeRelayer.setCallerOk([stratMinimize.address, stratLiq.address, stratAddWithFarm.address, stratAdd.address], true)

    /// Setup MasterChef
    const PancakeMasterChef = (await ethers.getContractFactory(
    "PancakeMasterChef",
    deployer
    )) as PancakeMasterChef__factory;

    masterChef = await PancakeMasterChef.deploy(
        cake.address, syrup.address, await deployer.getAddress(), CAKE_REWARD_PER_BLOCK, 0);
    await masterChef.deployed();

    // Transfer ownership so masterChef can mint CAKE
    await cake.transferOwnership(masterChef.address);
    await syrup.transferOwnership(masterChef.address);
    // Add lp to masterChef's pool
    await masterChef.add(0, cake.address, true);

    /// Setup Cake Maxi Worker
    const CakeMaxiWorker = (await ethers.getContractFactory(
        "CakeMaxiWorker",
        deployer,
    )) as CakeMaxiWorker__factory;
    cakeMaxiWorkerNative = await upgrades.deployProxy(CakeMaxiWorker, [await alice.getAddress(), wbnb.address, masterChef.address, routerV2.address, poolId, stratAdd.address, stratLiq.address, REINVEST_BOUNTY_BPS]) as CakeMaxiWorker
    await cakeMaxiWorkerNative.deployed();
    cakeMaxiWorkerNonNative = await upgrades.deployProxy(CakeMaxiWorker, [await alice.getAddress(), baseToken.address, masterChef.address, routerV2.address, poolId, stratAdd.address, stratLiq.address, REINVEST_BOUNTY_BPS]) as CakeMaxiWorker
    await cakeMaxiWorkerNonNative.deployed();

    await cakeMaxiWorkerNative.setStrategyOk([stratAdd.address, stratAddWithFarm.address, stratLiq.address, stratMinimize.address], true);
    await cakeMaxiWorkerNative.setReinvestorOk([await eve.getAddress()], true);
    await cakeMaxiWorkerNonNative.setStrategyOk([stratAdd.address, stratAddWithFarm.address, stratLiq.address, stratMinimize.address], true);
    await cakeMaxiWorkerNonNative.setReinvestorOk([await eve.getAddress()], true);
    await stratAdd.setWorkersOk([cakeMaxiWorkerNative.address, cakeMaxiWorkerNonNative.address], true)
    await stratAddWithFarm.setWorkersOk([cakeMaxiWorkerNative.address, cakeMaxiWorkerNonNative.address], true)   
    await stratLiq.setWorkersOk([cakeMaxiWorkerNative.address, cakeMaxiWorkerNonNative.address], true)
    await stratMinimize.setWorkersOk([cakeMaxiWorkerNative.address, cakeMaxiWorkerNonNative.address], true)
    await stratEvil.setWorkersOk([cakeMaxiWorkerNative.address, cakeMaxiWorkerNonNative.address], true)
    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);

    cakeAsAlice = MockERC20__factory.connect(cake.address, alice);

    wbnbTokenAsAlice = WETH__factory.connect(wbnb.address, alice)
    wbnbTokenAsBob = WETH__factory.connect(wbnb.address, bob)

    routerV2AsAlice = PancakeRouterV2__factory.connect(routerV2.address, alice);

    cakeMaxiWorkerNativeAsAlice = CakeMaxiWorker__factory.connect(cakeMaxiWorkerNative.address, alice);
    cakeMaxiWorkerNonNativeAsAlice = CakeMaxiWorker__factory.connect(cakeMaxiWorkerNonNative.address, alice);
    cakeMaxiWorkerNativeAsEve = CakeMaxiWorker__factory.connect(cakeMaxiWorkerNative.address, eve);
    cakeMaxiWorkerNonNativeAsEve = CakeMaxiWorker__factory.connect(cakeMaxiWorkerNonNative.address, eve);
    notOperatorCakeMaxiWorker = CakeMaxiWorker__factory.connect(cakeMaxiWorkerNative.address, bob);
    // Adding liquidity to the pool
    // Alice adds 0.1 FTOKEN + 1 WBTC + 1 WBNB
    await wbnbTokenAsAlice.deposit({
        value: ethers.utils.parseEther('52')
    })
    await wbnbTokenAsBob.deposit({
        value: ethers.utils.parseEther('50')
    })
    await cakeAsAlice.approve(routerV2.address, ethers.utils.parseEther('0.1'));
    await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther('1'));
    await wbnbTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther('2'))
    // Add liquidity to the WBTC-WBNB pool on Pancakeswap
    await routerV2AsAlice.addLiquidity(
      baseToken.address, wbnb.address,
      ethers.utils.parseEther('1'), ethers.utils.parseEther('1'), '0', '0', await alice.getAddress(), FOREVER);
      // Add liquidity to the WBNB-FTOKEN pool on Pancakeswap
    await routerV2AsAlice.addLiquidity(
        cake.address, wbnb.address,
        ethers.utils.parseEther('0.1'), 
        ethers.utils.parseEther('1'), 
        '0', 
        '0', 
        await alice.getAddress(), 
        FOREVER
    );
  });

  describe("#work()", async () => {
    context("When the caller is not an operator", async() => {
        it('should be reverted', async () => {
            await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther('0.1'));
            await expect(notOperatorCakeMaxiWorker.work(
                0, await bob.getAddress(), '0',
                ethers.utils.defaultAbiCoder.encode(
                    ['address', 'bytes'],
                    [stratAdd.address, 
                        ethers.utils.defaultAbiCoder.encode(
                        ['uint256'],
                        [ethers.utils.parseEther('0.05')]
                        )
                    ],
                )
            )).to.revertedWith("CakeMaxiWorker::onlyOperator:: not operator")
        })
    })
    context("When the caller calling a non-whitelisted strategy", async() => {
        it('should be reverted', async () => {
            await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther('0.1'));
            await expect(cakeMaxiWorkerNativeAsAlice.work(
                0, await alice.getAddress(), ethers.utils.parseEther('0.1'),
                ethers.utils.defaultAbiCoder.encode(
                    ['address', 'bytes'],
                    [stratEvil.address, 
                        ethers.utils.defaultAbiCoder.encode(
                            ['uint256'],
                            [ethers.utils.parseEther('0')]
                        )
                    ],
                )
            )).to.revertedWith("CakeMaxiWorker::work:: unapproved work strategy")
        })
    })
    context("When the operator calling a revoked strategy", async() => {
        it('should be reverted', async () => {
            await cakeMaxiWorkerNative.setStrategyOk([stratAdd.address], false)
            await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther('0.1'));
            await expect(cakeMaxiWorkerNativeAsAlice.work(
                0, await alice.getAddress(), ethers.utils.parseEther('0.1'),
                ethers.utils.defaultAbiCoder.encode(
                    ['address', 'bytes'],
                    [stratAdd.address, 
                        ethers.utils.defaultAbiCoder.encode(
                            ['uint256'],
                            [ethers.utils.parseEther('0')]
                        )
                    ],
                )
            )).to.revertedWith("CakeMaxiWorker::work:: unapproved work strategy")
        })
    })
    context("When the user passes addBaseToken strategy", async() => {
        it('should convert an input base token to a farming token and stake to the masterchef', async () => {
            // sending 0.1 wbnb to the worker (let's pretend to be the value from the vault)
            // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB
            // amountOut of 0.1 will be
            // if 1WBNB = 0.1 FToken
            // 0.1WBNB will be (0.1*0.9975) * (0.1/(1+0.1*0.9975)) = 0.009070243237099340
            await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther('0.1'));
            await cakeMaxiWorkerNativeAsAlice.work(
                0, await alice.getAddress(), 0,
                ethers.utils.defaultAbiCoder.encode(
                    ['address', 'bytes'],
                    [stratAdd.address, 
                        ethers.utils.defaultAbiCoder.encode(
                            ['uint256'],
                            [ethers.utils.parseEther('0')]
                        )
                    ],
                )
            )
            let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address)
            expect(userInfo[0]).to.eq(ethers.utils.parseEther('0.00907024323709934'))
            expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther('0.00907024323709934'))
            // Alice uses AddBaseTokenOnly strategy to add another 0.1 WBNB
            // amountOut of 0.1 will be
            // if 1.1 WBNB = (0.1 - 0.00907024323709934) FToken
            // if 1.1 WBNB = 0.09092975676290066 FToken
            // 0.1 WBNB will be (0.1*0.9975) * (0.09092975676290066/(1.1+0.1*0.9975)) = 0.0075601110540523785
            // thus, the current amount accumulated with the previous one will be 0.0075601110540523785 + 0.009070243237099340
            // = 0.01663035429115172
            await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther('0.1'));
            await cakeMaxiWorkerNativeAsAlice.work(
                0, await alice.getAddress(), 0,
                ethers.utils.defaultAbiCoder.encode(
                    ['address', 'bytes'],
                    [stratAdd.address, 
                        ethers.utils.defaultAbiCoder.encode(
                            ['uint256'],
                            [ethers.utils.parseEther('0')]
                        )
                    ],
                )
            )
            // after all these steps above, alice will have a balance in total of 0.016630354291151718 
            userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address)
            expect(userInfo[0]).to.eq(ethers.utils.parseEther('0.016630354291151718'))
            expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther('0.016630354291151718'))
            Assert.assertAlmostEqual(await (await cakeMaxiWorkerNative.rewardBalance()).toString(), ethers.utils.parseEther('0.2').toString())
            // bob start opening his position using 0.1 wbnb
            // amountOut of 0.1 will be
            // if 1.2 WBNB = (0.1 - (0.00907024323709934 + 0.0075601110540523785)) FToken
            // if 1.2 WBNB = 0.08336964570884828 FToken
            // 0.1 WBNB will be (0.1*0.9975) * (0.08336964570884828/(1.2+0.1*0.9975)) = 0.006398247477943924
            // total farming token amount will be 0.016630354291151717 + 0.006398247477943924 = 0.23028601769095642
            await wbnbTokenAsBob.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther('0.1'));
            await cakeMaxiWorkerNativeAsAlice.work(
                1, await bob.getAddress(), 0,
                ethers.utils.defaultAbiCoder.encode(
                    ['address', 'bytes'],
                    [stratAdd.address, 
                        ethers.utils.defaultAbiCoder.encode(
                            ['uint256'],
                            [ethers.utils.parseEther('0')]
                        )
                    ],
                )
            )
            userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address)
            expect(userInfo[0]).to.eq(ethers.utils.parseEther('0.023028601769095642'))
            expect(await cakeMaxiWorkerNative.shares(1)).to.eq(ethers.utils.parseEther('0.006398247477943924'))
            expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(1))).to.eq(ethers.utils.parseEther('0.006398247477943924'))
            Assert.assertAlmostEqual(await (await cakeMaxiWorkerNative.rewardBalance()).toString(), ethers.utils.parseEther('0.4').toString())
        })
    })
    context("When the user passes addBaseWithFarm strategy", async() => {
        it('should convert an input as a base token with some farming token and stake to the masterchef', async () => {
                  // Alice transfer 0.1 WBNB to StrategyAddBaseWithFarm first
            await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther('0.1'));
            // Alice uses AddBaseWithFarm strategy to add 0.1 WBNB
            // amountOut of 0.1 will be
            // if 1WBNB = 0.1 FToken
            // 0.1WBNB will be (0.1*0.9975) * (0.1/(1+0.1*0.9975)) = 0.00907024323709934
            await cakeMaxiWorkerNativeAsAlice.work(
                0, await alice.getAddress(), '0',
                ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes'],
                [stratAddWithFarm.address, ethers.utils.defaultAbiCoder.encode(
                    ['uint256', 'uint256'],
                    ['0', '0']
                )],
                )
            );
        
            // after all these steps above, alice will have a balance in total of 0.016630354291151718 
            let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address)
            expect(userInfo[0]).to.eq(ethers.utils.parseEther('0.00907024323709934'))
            expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther('0.00907024323709934'))
            // Bob uses AddBaseWithFarm strategy to add another 0.1 WBNB
            // amountOut of 0.1 will be
            // if 1.1 WBNB = (0.1 - 0.00907024323709934) FToken
            // if 1.1 WBNB = 0.09092975676290066 FToken
            // 0.1 WBNB will be (0.1*0.9975) * (0.09092975676290066/(1.1+0.1*0.9975)) = 0.0075601110540523785
            // thus, the current amount accumulated with the previous one will be 0.0075601110540523785 + 0.00907024323709934 + 0.04 = 0.05663035429115172
            await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther('0.1'));
            await cakeAsAlice.approve(mockedVault.address, ethers.utils.parseEther('0.04'));
            await cakeMaxiWorkerNativeAsAlice.work(
                0, await alice.getAddress(), '0',
                ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes'],
                [stratAddWithFarm.address, ethers.utils.defaultAbiCoder.encode(
                    ['uint256', 'uint256'],
                    [ethers.utils.parseEther('0.04'), '0']
                )],
                )
            );
            // after all these steps above, alice will have a balance in total of 0.056630354291151718
            userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address)
            expect(userInfo[0]).to.eq(ethers.utils.parseEther('0.056630354291151718'))
            expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther('0.056630354291151718'))
            Assert.assertAlmostEqual(await (await cakeMaxiWorkerNative.rewardBalance()).toString(), ethers.utils.parseEther('0.3').toString())

            // bob start opening his position using 0.1 wbnb
            // amountOut of 0.1 will be
            // if 1.2 WBNB = (0.1 - (0.0075601110540523785 + 0.00907024323709934)) FToken
            // if 1.2 WBNB = 0.08336964570884828 FToken
            // 0.1 WBNB will be (0.1*0.9975) * (0.08336964570884828/(1.2+0.1*0.9975)) = 0.006398247477943925
            // thus, total staked balance will be = 0.056630354291151718 + 0.006398247477943925 + 0.05 =  0.11302860176909564
            await wbnbTokenAsBob.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther('0.1'));
            await cakeAsAlice.approve(mockedVault.address, ethers.utils.parseEther('0.05'));
            await cakeMaxiWorkerNativeAsAlice.work(
                1, await bob.getAddress(), 0,
                ethers.utils.defaultAbiCoder.encode(
                    ['address', 'bytes'],
                    [stratAddWithFarm.address, 
                        ethers.utils.defaultAbiCoder.encode(
                            ['uint256', 'uint256'],
                            [ethers.utils.parseEther('0.05'), '0']
                        )
                    ],
                )
            )
            userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address)
            expect(userInfo[0]).to.eq(ethers.utils.parseEther('0.113028601769095642'))
            expect(await cakeMaxiWorkerNative.shares(1)).to.eq(ethers.utils.parseEther('0.056398247477943924'))
            expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(1))).to.eq(ethers.utils.parseEther('0.056398247477943924'))
            Assert.assertAlmostEqual(await (await cakeMaxiWorkerNative.rewardBalance()).toString(), ethers.utils.parseEther('0.6').toString())
        })
    })
    context("When the user passes liquidation strategy to close the position", async () => {
        it('should liquidate a position based on the share of a user', async () => {
            // sending 0.1 wbnb to the worker (let's pretend to be the value from the vault)
            // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB
            // amountOut of 0.1 will be
            // if 1WBNB = 0.1 FToken
            // 0.1WBNB will be (0.1*0.9975) * (0.1/(1+0.1*0.9975)) = 0.009070243237099340
            await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther('0.1'));
            const aliceBaseTokenBefore = await wbnb.balanceOf(await alice.getAddress())
            const aliceFarmingTokenBefore = await cake.balanceOf(await alice.getAddress())
            await cakeMaxiWorkerNativeAsAlice.work(
                0, await alice.getAddress(), 0,
                ethers.utils.defaultAbiCoder.encode(
                    ['address', 'bytes'],
                    [stratAdd.address, 
                        ethers.utils.defaultAbiCoder.encode(
                            ['uint256'],
                            [ethers.utils.parseEther('0')]
                        )
                    ],
                )
            )
            let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address)
            expect(userInfo[0]).to.eq(ethers.utils.parseEther('0.00907024323709934'))
            expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther('0.00907024323709934'))
            // Alice call liquidate strategy to close her position
            await cakeMaxiWorkerNativeAsAlice.work(
                0, await alice.getAddress(), 0,
                ethers.utils.defaultAbiCoder.encode(
                    ['address', 'bytes'],
                    [stratLiq.address, 
                        ethers.utils.defaultAbiCoder.encode(
                            ['uint256'],
                            [ethers.utils.parseEther('0')]
                        )
                    ],
                )
            )
            // alice will get a base token based on 0.00907024323709934 farming token (staked balance)
            userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address)
            const aliceBaseTokenAfter = await wbnb.balanceOf(await alice.getAddress())
            const aliceFarmingTokenAfter = await cake.balanceOf(await alice.getAddress())
            expect(userInfo[0]).to.eq(ethers.utils.parseEther('0'))
            expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther('0'))
            Assert.assertAlmostEqual(await (await cakeMaxiWorkerNative.rewardBalance()).toString(), ethers.utils.parseEther('0.1').toString())
            expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.eq(ethers.utils.parseEther('0.099545816538303460'))
            expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.eq(ethers.utils.parseEther('0'))
        })
    })
    context("When the user passes close minimize trading strategy to close the position", async () => {
        it('should send a base token to be enough for repaying the debt, the rest will be sent as a farming token', async () => {
            // sending 0.1 wbnb to the worker (let's pretend to be the value from the vault)
            // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB
            // amountOut of 0.1 will be
            // if 1WBNB = 0.1 FToken
            // 0.1WBNB will be (0.1*0.9975) * (0.1/(1+0.1*0.9975)) = 0.009070243237099340
            await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther('0.1'));
            const aliceBaseTokenBefore = await wbnb.balanceOf(await alice.getAddress())
            const aliceFarmingTokenBefore = await cake.balanceOf(await alice.getAddress())
            await cakeMaxiWorkerNativeAsAlice.work(
                0, await alice.getAddress(), 0,
                ethers.utils.defaultAbiCoder.encode(
                    ['address', 'bytes'],
                    [stratAdd.address, 
                        ethers.utils.defaultAbiCoder.encode(
                            ['uint256'],
                            [ethers.utils.parseEther('0')]
                        )
                    ],
                )
            )
            let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address)
            expect(userInfo[0]).to.eq(ethers.utils.parseEther('0.00907024323709934'))
            expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther('0.00907024323709934'))
            // Alice call liquidate strategy to close her position
            await cakeMaxiWorkerNativeAsAlice.work(
                0, await alice.getAddress(), ethers.utils.parseEther('0.05'),
                ethers.utils.defaultAbiCoder.encode(
                    ['address', 'bytes'],
                    [stratMinimize.address, 
                        ethers.utils.defaultAbiCoder.encode(
                            ['uint256'],
                            [ethers.utils.parseEther('0')]
                        )
                    ],
                )
            )
            // 0.1 - 0.00907024323709934 FTOKEN = 1.1 WBNB
            // 0.09092975676290066 FTOKEN =  1.1 WBNB
            // x FTOKEN = (x * 0.9975) * (1.1 / (0.09092975676290066 + x * 0.9975)) = 0.05 WBNB
            // x = 0.004340840518577427
            // thus, the remaining farming token will be 0.00907024323709934 - 0.004340840518577427 
            // = 0.004729402718521914
            userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address)
            const aliceBaseTokenAfter = await wbnb.balanceOf(await alice.getAddress())
            const aliceFarmingTokenAfter = await cake.balanceOf(await alice.getAddress())
            expect(userInfo[0]).to.eq(ethers.utils.parseEther('0'))
            expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther('0'))
            Assert.assertAlmostEqual(await (await cakeMaxiWorkerNative.rewardBalance()).toString(), ethers.utils.parseEther('0.1').toString())
            expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.eq(ethers.utils.parseEther('0.05'))
            expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.eq(ethers.utils.parseEther('0.004729402718521912'))
        })
    })
  })

  describe("#reinvest()", async() => {
    context("When the caller is not a reinvestor", async () => {
        it('should be reverted', async () => {
            await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther('0.1'));
            await cakeMaxiWorkerNativeAsAlice.work(
                0, await alice.getAddress(), 0,
                ethers.utils.defaultAbiCoder.encode(
                    ['address', 'bytes'],
                    [stratAdd.address, 
                        ethers.utils.defaultAbiCoder.encode(
                            ['uint256'],
                            [ethers.utils.parseEther('0')]
                        )
                    ],
                )
            )
            await expect(cakeMaxiWorkerNativeAsAlice.reinvest()).to.revertedWith('CakeMaxiWorker::onlyReinvestor:: not reinvestor')
        })
    })
    context("When the reinvestor reinvest in the middle of a transaction set", async () => {
        it('should increase the size of total balance, thus share to balance will be increased', async () => {
            // sending 0.1 wbnb to the worker (let's pretend to be the value from the vault)
            // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB
            // amountOut of 0.1 will be
            // if 1WBNB = 0.1 FToken
            // 0.1WBNB will be (0.1*0.9975) * (0.1/(1+0.1*0.9975)) = 0.009070243237099340
            await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther('0.1'));
            await cakeMaxiWorkerNativeAsAlice.work(
                0, await alice.getAddress(), 0,
                ethers.utils.defaultAbiCoder.encode(
                    ['address', 'bytes'],
                    [stratAdd.address, 
                        ethers.utils.defaultAbiCoder.encode(
                            ['uint256'],
                            [ethers.utils.parseEther('0')]
                        )
                    ],
                )
            )
            let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address)
            expect(userInfo[0]).to.eq(ethers.utils.parseEther('0.00907024323709934'))
            expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther('0.00907024323709934'))
            expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(ethers.utils.parseEther('0.00907024323709934'))
            // Alice uses AddBaseTokenOnly strategy to add another 0.1 WBNB
            // amountOut of 0.1 will be
            // if 1.1 WBNB = (0.1 - 0.00907024323709934) FToken
            // if 1.1 WBNB = 0.09092975676290066 FToken
            // 0.1 WBNB will be (0.1*0.9975) * (0.09092975676290066/(1.1+0.1*0.9975)) = 0.0075601110540523785
            // thus, the current amount accumulated with the previous one will be 0.0075601110540523785 + 0.009070243237099340
            // = 0.01663035429115172
            await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther('0.1'));
            await cakeMaxiWorkerNativeAsAlice.work(
                0, await alice.getAddress(), 0,
                ethers.utils.defaultAbiCoder.encode(
                    ['address', 'bytes'],
                    [stratAdd.address, 
                        ethers.utils.defaultAbiCoder.encode(
                            ['uint256'],
                            [ethers.utils.parseEther('0')]
                        )
                    ],
                )
            )
            // after all these steps above, alice will have a balance in total of 0.016630354291151718 
            userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address)
            expect(userInfo[0]).to.eq(ethers.utils.parseEther('0.016630354291151718'))
            expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther('0.016630354291151718'))
            Assert.assertAlmostEqual(await (await cakeMaxiWorkerNative.rewardBalance()).toString(), ethers.utils.parseEther('0.2').toString())
            expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(ethers.utils.parseEther('0.016630354291151718'))
             // reinvest.. the size of the reward should be 2 (blocks) * 0.1 farming token (CAKE)
            await cakeMaxiWorkerNativeAsEve.reinvest()
            // eve, who is a reinvestor will get her bounty for 0.3 * 1% = 0.003
            Assert.assertAlmostEqual(await (await cake.balanceOf(await eve.getAddress())).toString(), ethers.utils.parseEther('0.003').toString())
            userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address)
            // bob start opening his position using 0.1 wbnb
            // amountOut of 0.1 will be
            // if 1.2 WBNB = (0.1 - (0.00907024323709934 + 0.0075601110540523785)) FToken
            // if 1.2 WBNB = 0.08336964570884828 FToken
            // 0.1 WBNB will be (0.1*0.9975) * (0.08336964570884828/(1.2+0.1*0.9975)) = 0.006398247477943924
            // total farming token amount will be 0.016630354291151717 + 0.006398247477943924 + 0.1*3 from block reward - 0.1*3*0.01 deducted from bounty  = 0.320028601769079632
            const bobShare = ethers.utils.parseEther('0.006398247477943924').mul(await cakeMaxiWorkerNative.totalShare()).div(userInfo[0])
            const aliceShare = ethers.utils.parseEther('0.016630354291151718') // no need to readjust the share since this happened before the reinvest
            await wbnbTokenAsBob.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther('0.1'));
            await cakeMaxiWorkerNativeAsAlice.work(
                1, await bob.getAddress(), 0,
                ethers.utils.defaultAbiCoder.encode(
                    ['address', 'bytes'],
                    [stratAdd.address, 
                        ethers.utils.defaultAbiCoder.encode(
                            ['uint256'],
                            [ethers.utils.parseEther('0')]
                        )
                    ],
                )
            )
            userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address)
            const bobBalance = bobShare.mul(userInfo[0]).div(await cakeMaxiWorkerNative.totalShare())
            const aliceBalance = aliceShare.mul(userInfo[0]).div(await cakeMaxiWorkerNative.totalShare())
            expect(userInfo[0]).to.eq(ethers.utils.parseEther('0.320028601769079632'))
            expect(await cakeMaxiWorkerNative.shares(1)).to.eq(bobShare)
            expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(1))).to.eq(bobBalance)
            expect(await cakeMaxiWorkerNative.shareToBalance(await cakeMaxiWorkerNative.shares(0))).to.eq(aliceBalance)
            Assert.assertAlmostEqual(await (await cakeMaxiWorkerNative.rewardBalance()).toString(), ethers.utils.parseEther('0.2').toString())
        })
    })
  })

  describe("#health()", async() => {
    context("When the worker is not a native", async () => {
        it("should convert CAKE(FarmingToken) back to Base Token with a correct amount out", async () => {
            // Alice transfer 0.1 BASE to StrategyAddBaseTokenOnly first
            await baseTokenAsAlice.transfer(cakeMaxiWorkerNonNative.address, ethers.utils.parseEther('0.1'));
            // Alice uses AddBaseTokenOnly strategy to add 0.1 BASE
            // amountOut of 0.1 will be
            // if 1 BASE = 1 BNB
            // 0.1 BASE will be (0.1 * 0.9975) * (1 / (1 + 0.1 * 0.9975)) = 0.09070243237099342 BNB
            // if 1 BNB = 0.1 FTOKEN
            // 0.09070243237099342 BNB = (0.09070243237099342 * 0.9975) * (0.1 / (1 + 0.09070243237099342 * 0.9975)) = 0.008296899991192416 FTOKEN
            await cakeMaxiWorkerNonNativeAsAlice.work(
                0, await alice.getAddress(), '0',
                ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes'],
                [stratAdd.address, ethers.utils.defaultAbiCoder.encode(
                    ['uint256'],
                    ['0']
                )],
                )
            );
            let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNonNativeAsAlice.address)
            expect(userInfo[0]).to.eq(ethers.utils.parseEther('0.008296899991192416'))
            expect(await cakeMaxiWorkerNonNativeAsAlice.shares(0)).to.eq(ethers.utils.parseEther('0.008296899991192416'))
            // if  0.091703100008807584 FTOKEN = 1.090702432370993407 BNB
            // 0.008296899991192416 FTOKEN = (0.008296899991192416 * 0.9975) * (1.090702432370993407 / (0.091703100008807584 + 0.008296899991192416 * 0.9975)) = 0.09028698134165357 BNB
            // if  0.909297567629006593 BNB = 1.1 BaseToken
            // 0.09028698134165357 BNB = (0.09028698134165357 * 0.9975) * (1.1 / (0.909297567629006593 + 0.09028698134165357 * 0.9975)) = 0.09913094991787623
            // thus, calling health should return 0.099130949917876232
            let health = await cakeMaxiWorkerNonNativeAsAlice.health(0)
            expect(health).to.eq(ethers.utils.parseEther('0.099130949917876232'))
        })
    })
    context("When the worker is native", async () => {
        it("should convert CAKE(FarmingToken) back to Base Token with a correct amount out", async () => {
            // Alice transfer 0.1 WBNB to StrategyAddBaseTokenOnly first
            await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther('0.1'));
            // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB
            // amountOut of 0.1 will be
            // if 1WBNB = 0.1 FToken
            // 0.1WBNB will be (0.1*0.9975) * (0.1/(1+0.1*0.9975)) = 0.00907024323709934
            await cakeMaxiWorkerNativeAsAlice.work(
                0, await alice.getAddress(), '0',
                ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes'],
                [stratAdd.address, ethers.utils.defaultAbiCoder.encode(
                    ['uint256'],
                    ['0']
                )],
                )
            );
            let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address)
            expect(userInfo[0]).to.eq(ethers.utils.parseEther('0.00907024323709934'))
            expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther('0.00907024323709934'))
            // if  0.1  - 0.00907024323709934 FTOKEN = 1.1 BNB
            // if 0.09092975676290066 FTOKEN = 1.1 BNB
            // 0.00907024323709934 FTOKEN = (0.00907024323709934 * 0.9975) * (1.1 / (0.09092975676290066 + 0.00907024323709934 * 0.9975)) = 0.0995458165383035 BNB
            // thus, calling health should return 0.099545816538303460
            let health = await cakeMaxiWorkerNative.health(0)
            expect(health).to.eq(ethers.utils.parseEther('0.099545816538303460'))
        })
    })
  })

  describe("#liquidate()", async () => {
    it('should liquidate a position based on the share of a user', async () => {
        // sending 0.1 wbnb to the worker (let's pretend to be the value from the vault)
        // Alice uses AddBaseTokenOnly strategy to add 0.1 WBNB
        // amountOut of 0.1 will be
        // if 1WBNB = 0.1 FToken
        // 0.1WBNB will be (0.1*0.9975) * (0.1/(1+0.1*0.9975)) = 0.009070243237099340
        await wbnbTokenAsAlice.transfer(cakeMaxiWorkerNative.address, ethers.utils.parseEther('0.1'));
        const aliceBaseTokenBefore = await wbnb.balanceOf(await alice.getAddress())
        const aliceFarmingTokenBefore = await cake.balanceOf(await alice.getAddress())
        await cakeMaxiWorkerNativeAsAlice.work(
            0, await alice.getAddress(), 0,
            ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes'],
                [stratAdd.address, 
                    ethers.utils.defaultAbiCoder.encode(
                        ['uint256'],
                        [ethers.utils.parseEther('0')]
                    )
                ],
            )
        )
        let userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address)
        expect(userInfo[0]).to.eq(ethers.utils.parseEther('0.00907024323709934'))
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther('0.00907024323709934'))
        // Alice call liquidate strategy to close her position
        await cakeMaxiWorkerNativeAsAlice.liquidate(0)
        // alice will get a base token based on 0.00907024323709934 farming token (staked balance)
        userInfo = await masterChef.userInfo(0, cakeMaxiWorkerNative.address)
        const aliceBaseTokenAfter = await wbnb.balanceOf(await alice.getAddress())
        const aliceFarmingTokenAfter = await cake.balanceOf(await alice.getAddress())
        expect(userInfo[0]).to.eq(ethers.utils.parseEther('0'))
        expect(await cakeMaxiWorkerNative.shares(0)).to.eq(ethers.utils.parseEther('0'))
        Assert.assertAlmostEqual(await (await cakeMaxiWorkerNative.rewardBalance()).toString(), ethers.utils.parseEther('0.1').toString())
        expect(aliceBaseTokenAfter.sub(aliceBaseTokenBefore)).to.eq(ethers.utils.parseEther('0.099545816538303460'))
        expect(aliceFarmingTokenAfter.sub(aliceFarmingTokenBefore)).to.eq(ethers.utils.parseEther('0'))
    })
  })
})