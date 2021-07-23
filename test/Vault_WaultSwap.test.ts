import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  AlpacaToken,
  AlpacaToken__factory,
  WaultSwapToken,
  WaultSwapToken__factory,
  DebtToken,
  DebtToken__factory,
  FairLaunch,
  FairLaunch__factory,
  MockERC20,
  MockERC20__factory,
  MockWBNB,
  MockWBNB__factory,
  WaultSwapFactory,
  WaultSwapFactory__factory,
  WexMaster,
  WexMaster__factory,
  PancakePair,
  PancakePair__factory,
  WaultSwapRouter,
  WaultSwapRouter__factory,
  WaultSwapRestrictedStrategyAddBaseTokenOnly,
  WaultSwapRestrictedStrategyAddBaseTokenOnly__factory,
  WaultSwapRestrictedStrategyLiquidate,
  WaultSwapRestrictedStrategyLiquidate__factory,
  WaultSwapRestrictedStrategyPartialCloseLiquidate,
  WaultSwapRestrictedStrategyPartialCloseLiquidate__factory,
  WaultSwapWorker,
  WaultSwapWorker__factory,
  SimpleVaultConfig,
  SimpleVaultConfig__factory,
  Vault,
  Vault__factory,
  WNativeRelayer,
  WNativeRelayer__factory,
  WaultSwapRestrictedStrategyPartialCloseMinimizeTrading__factory,
  WaultSwapRestrictedStrategyPartialCloseMinimizeTrading,
} from "../typechain";
import * as AssertHelpers from "./helpers/assert"
import * as TimeHelpers from "./helpers/time"

chai.use(solidity);
const { expect } = chai;

describe('Vault - WaultSwap', () => {
  const FOREVER = '2000000000';
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther('5000');
  const WEX_REWARD_PER_BLOCK = ethers.utils.parseEther('0.076');
  const REINVEST_BOUNTY_BPS = '100'; // 1% reinvest bounty
  const RESERVE_POOL_BPS = '1000'; // 10% reserve pool
  const KILL_PRIZE_BPS = '1000'; // 10% Kill prize
  const INTEREST_RATE = '3472222222222'; // 30% per year
  const MIN_DEBT_SIZE = ethers.utils.parseEther('1'); // 1 BTOKEN min debt size
  const WORK_FACTOR = '7000';
  const KILL_FACTOR = '8000';
  const KILL_TREASURY_BPS = '100';

  /// WaultSwap-related instance(s)
  let factory: WaultSwapFactory;
  let router: WaultSwapRouter;

  let wbnb: MockWBNB;
  let lp: PancakePair;

  /// Token-related instance(s)
  let baseToken: MockERC20;
  let farmToken: MockERC20;
  let wex: WaultSwapToken;
  let debtToken: DebtToken;

  /// Strategy-ralted instance(s)
  let addStrat: WaultSwapRestrictedStrategyAddBaseTokenOnly;
  let liqStrat: WaultSwapRestrictedStrategyLiquidate;
  let partialCloseStrat: WaultSwapRestrictedStrategyPartialCloseLiquidate;
  let partialCloseMinimizeStrat: WaultSwapRestrictedStrategyPartialCloseMinimizeTrading;

  /// Vault-related instance(s)
  let simpleVaultConfig: SimpleVaultConfig;
  let wNativeRelayer: WNativeRelayer;
  let vault: Vault;

  /// FairLaunch-related instance(s)
  let fairLaunch: FairLaunch;
  let alpacaToken: AlpacaToken;

  /// WexMaster-related instance(s)
  let wexMaster: WexMaster;
  let poolId: number;
  let waultSwapWorker: WaultSwapWorker;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let eve: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let fairLaunchAsAlice: FairLaunch;

  let lpAsAlice: PancakePair;
  let lpAsBob: PancakePair;

  let wexMasterAsAlice: WexMaster;
  let wexMasterAsBob: WexMaster;

  let waultSwapWorkerAsEve: WaultSwapWorker;

  let vaultAsAlice: Vault;
  let vaultAsBob: Vault;
  let vaultAsEve: Vault;

  beforeEach(async () => {
    [deployer, alice, bob, eve] = await ethers.getSigners();

    // Setup WaultSwap
    const WaultSwapFactory = (await ethers.getContractFactory(
      "WaultSwapFactory",
      deployer
    )) as WaultSwapFactory__factory;
    factory = await WaultSwapFactory.deploy((await deployer.getAddress()));
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory(
      "MockWBNB",
      deployer
    )) as MockWBNB__factory;
    wbnb = await WBNB.deploy();
    await factory.deployed();

    const WaultSwapRouter = (await ethers.getContractFactory(
      "WaultSwapRouter",
      deployer
    )) as WaultSwapRouter__factory;
    router = await WaultSwapRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

    /// Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory(
      "MockERC20",
      deployer
    )) as MockERC20__factory
    baseToken = await upgrades.deployProxy(MockERC20, ['BTOKEN', 'BTOKEN']) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(await deployer.getAddress(), ethers.utils.parseEther('1000'));
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther('1000'));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther('1000'));
    farmToken = await upgrades.deployProxy(MockERC20, ['FTOKEN', 'FTOKEN']) as MockERC20;
    await farmToken.deployed();
    await farmToken.mint(await deployer.getAddress(), ethers.utils.parseEther('1000'))
    await farmToken.mint(await alice.getAddress(), ethers.utils.parseEther('1000'));
    await farmToken.mint(await bob.getAddress(), ethers.utils.parseEther('1000'));

    const WaultSwapToken = (await ethers.getContractFactory(
      "WaultSwapToken",
      deployer
    )) as WaultSwapToken__factory;
    wex = await WaultSwapToken.deploy();
    await wex.deployed();
    await wex.mint(await deployer.getAddress(), ethers.utils.parseEther('100'));

    /// Setup BTOKEN-FTOKEN pair on WaultSwap
    await factory.createPair(baseToken.address, farmToken.address);
    lp = PancakePair__factory.connect(await factory.getPair(farmToken.address, baseToken.address), deployer);
    await lp.deployed();

    // Setup FairLaunch contract
    // Deploy ALPACAs
    const AlpacaToken = (await ethers.getContractFactory(
      "AlpacaToken",
      deployer
    )) as AlpacaToken__factory;
    alpacaToken = await AlpacaToken.deploy(132, 137);
    await alpacaToken.deployed();

    const FairLaunch = (await ethers.getContractFactory(
      "FairLaunch",
      deployer
    )) as FairLaunch__factory;
    fairLaunch = await FairLaunch.deploy(
      alpacaToken.address, (await deployer.getAddress()), ALPACA_REWARD_PER_BLOCK, 0, ALPACA_BONUS_LOCK_UP_BPS, 0
    );
    await fairLaunch.deployed();

    await alpacaToken.transferOwnership(fairLaunch.address);

    // Config & Deploy Vault ibBTOKEN
    // Create a new instance of BankConfig & Vault
    const WNativeRelayer = (await ethers.getContractFactory(
      "WNativeRelayer",
      deployer
    )) as WNativeRelayer__factory;
    wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
    await wNativeRelayer.deployed();

    const SimpleVaultConfig = (await ethers.getContractFactory(
      "SimpleVaultConfig",
      deployer
    )) as SimpleVaultConfig__factory;
    simpleVaultConfig = await upgrades.deployProxy(SimpleVaultConfig, [
      MIN_DEBT_SIZE, INTEREST_RATE, RESERVE_POOL_BPS, KILL_PRIZE_BPS,
      wbnb.address, wNativeRelayer.address, fairLaunch.address,KILL_TREASURY_BPS,await deployer.getAddress()
    ]) as SimpleVaultConfig;
    await simpleVaultConfig.deployed();

    // whitelisted to be able to call kill
    await simpleVaultConfig.setWhitelistedLiquidators([await alice.getAddress(), await eve.getAddress()], true)

    const DebtToken = (await ethers.getContractFactory(
      "DebtToken",
      deployer
    )) as DebtToken__factory;
    debtToken = await upgrades.deployProxy(DebtToken, [
      'debtibBTOKEN_V2', 'debtibBTOKEN_V2', (await deployer.getAddress())]) as DebtToken;
    await debtToken.deployed();

    const Vault = (await ethers.getContractFactory(
      "Vault",
      deployer
    )) as Vault__factory;
    vault = await upgrades.deployProxy(Vault, [
      simpleVaultConfig.address, baseToken.address, 'Interest Bearing BTOKEN', 'ibBTOKEN', 18, debtToken.address
    ]) as Vault;
    await vault.deployed();

    await wNativeRelayer.setCallerOk([vault.address], true);

    // Transfer ownership to vault
    await debtToken.transferOwnership(vault.address);

    // Update DebtToken
    await vault.updateDebtToken(debtToken.address, 0);

    // Set add FairLaunch poool and set fairLaunchPoolId for Vault
    await fairLaunch.addPool(1, (await vault.debtToken()), false);
    await vault.setFairLaunchPoolId(0);

    /// Setup wexMaster
    const WexMaster = (await ethers.getContractFactory(
      "WexMaster",
      deployer
    )) as WexMaster__factory;
    wexMaster = await WexMaster.deploy(
      wex.address, WEX_REWARD_PER_BLOCK, 0);
    await wexMaster.deployed();
    // Transfer mintership so wexMaster can mint WEX
    await wex.transferMintership(wexMaster.address);

    // Add lp to wexMaster's pool
    await wexMaster.add(1, lp.address, true);

    /// Setup strategy
    const WaultSwapRestrictedStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyAddBaseTokenOnly",
      deployer
    )) as WaultSwapRestrictedStrategyAddBaseTokenOnly__factory;
    addStrat = await upgrades.deployProxy(WaultSwapRestrictedStrategyAddBaseTokenOnly, [router.address]) as WaultSwapRestrictedStrategyAddBaseTokenOnly
    await addStrat.deployed();

    const WaultSwapRestrictedStrategyLiquidate = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyLiquidate",
      deployer
    )) as WaultSwapRestrictedStrategyLiquidate__factory;
    liqStrat = await upgrades.deployProxy(WaultSwapRestrictedStrategyLiquidate, [router.address]) as WaultSwapRestrictedStrategyLiquidate;
    await liqStrat.deployed();

    const WaultSwapRestrictedStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyPartialCloseLiquidate",
      deployer
    )) as WaultSwapRestrictedStrategyPartialCloseLiquidate__factory;
    partialCloseStrat = await upgrades.deployProxy(
        WaultSwapRestrictedStrategyPartialCloseLiquidate, [router.address]) as WaultSwapRestrictedStrategyPartialCloseLiquidate
    await partialCloseStrat.deployed();

    const WaultSwapRestrictedStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyPartialCloseMinimizeTrading",
      deployer
    )) as WaultSwapRestrictedStrategyPartialCloseMinimizeTrading__factory;
    partialCloseMinimizeStrat = await upgrades.deployProxy(
      WaultSwapRestrictedStrategyPartialCloseMinimizeTrading, [router.address, wbnb.address, wNativeRelayer.address]) as WaultSwapRestrictedStrategyPartialCloseMinimizeTrading
    await partialCloseMinimizeStrat.deployed();

    /// Setup WaultSwapWorker
    poolId = 0;
    const WaultSwapWorker = (await ethers.getContractFactory(
      "WaultSwapWorker",
      deployer,
    )) as WaultSwapWorker__factory;
    waultSwapWorker = await upgrades.deployProxy(WaultSwapWorker, [
      vault.address, baseToken.address, wexMaster.address, router.address, poolId, addStrat.address, liqStrat.address, REINVEST_BOUNTY_BPS
    ]) as WaultSwapWorker
    await waultSwapWorker.deployed();
    await simpleVaultConfig.setWorker(waultSwapWorker.address, true, true, WORK_FACTOR, KILL_FACTOR);
    await waultSwapWorker.setStrategyOk([partialCloseStrat.address], true);
    await waultSwapWorker.setStrategyOk([partialCloseMinimizeStrat.address], true);
    await waultSwapWorker.setReinvestorOk([await eve.getAddress()], true);
    await addStrat.setWorkersOk([waultSwapWorker.address], true)
    await liqStrat.setWorkersOk([waultSwapWorker.address], true)
    await partialCloseStrat.setWorkersOk([waultSwapWorker.address], true)
    await partialCloseMinimizeStrat.setWorkersOk([waultSwapWorker.address], true)

    // Deployer adds 0.1 FTOKEN + 1 BTOKEN
    await baseToken.approve(router.address, ethers.utils.parseEther('1'));
    await farmToken.approve(router.address, ethers.utils.parseEther('0.1'));
    await router.addLiquidity(
      baseToken.address, farmToken.address,
      ethers.utils.parseEther('1'), ethers.utils.parseEther('0.1'),
      '0', '0', await deployer.getAddress(), FOREVER);

    // Deployer adds 0.1 WEX + 1 NATIVE
    await wex.approve(router.address, ethers.utils.parseEther('1'));
    await router.addLiquidityETH(
      wex.address, ethers.utils.parseEther('0.1'),
      '0', '0', await deployer.getAddress(), FOREVER, { value: ethers.utils.parseEther('1') });

    // Deployer adds 1 BTOKEN + 1 NATIVE
    await baseToken.approve(router.address, ethers.utils.parseEther('1'));
    await router.addLiquidityETH(
      baseToken.address, ethers.utils.parseEther('1'),
      '0', '0', await deployer.getAddress(), FOREVER, { value: ethers.utils.parseEther('1') });

    // Contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    lpAsAlice = PancakePair__factory.connect(lp.address, alice);
    lpAsBob = PancakePair__factory.connect(lp.address, bob);

    fairLaunchAsAlice = FairLaunch__factory.connect(fairLaunch.address, alice);

    wexMasterAsAlice = WexMaster__factory.connect(wexMaster.address, alice);
    wexMasterAsBob = WexMaster__factory.connect(wexMaster.address, bob);

    vaultAsAlice = Vault__factory.connect(vault.address, alice);
    vaultAsBob = Vault__factory.connect(vault.address, bob);
    vaultAsEve = Vault__factory.connect(vault.address, eve);

    waultSwapWorkerAsEve = WaultSwapWorker__factory.connect(waultSwapWorker.address, eve);
  });

  context('when worker is initialized', async() => {
    it('should has FTOKEN as a farmingToken in WaultSwapWorker', async() => {
      expect(await waultSwapWorker.farmingToken()).to.be.equal(farmToken.address);
    });

    it('should initialized the correct fee and feeDenom', async() => {
      expect(await waultSwapWorker.fee()).to.be.bignumber.eq('998');
      expect(await waultSwapWorker.feeDenom()).to.be.bignumber.eq('1000');
    });
  });

  context('when owner is setting worker', async() => {
    it('should set reinvest bounty if < max', async() => {
      await waultSwapWorker.setReinvestBountyBps(250);
      expect(await waultSwapWorker.reinvestBountyBps()).to.be.bignumber.eq(250);
    });

    it('should set max reinvest bounty', async() => {
      await waultSwapWorker.setMaxReinvestBountyBps(200);
      expect(await waultSwapWorker.maxReinvestBountyBps()).to.be.bignumber.eq(200);
    });

    it('should revert when owner set reinvestBountyBps > max', async() => {
      await expect(waultSwapWorker.setReinvestBountyBps(1000)).to.be.revertedWith('WaultSwapWorker::setReinvestBountyBps:: _reinvestBountyBps exceeded maxReinvestBountyBps');
      expect(await waultSwapWorker.reinvestBountyBps()).to.be.bignumber.eq(100);
    });

    it('should set strat ok', async() => {
      await waultSwapWorker.setStrategyOk([await alice.getAddress()], true);
      expect(await waultSwapWorker.okStrats(await alice.getAddress())).to.be.eq(true);
    });
  });

  context('when user uses LYF', async() => {
    it('should allow to open a position without debt', async () => {
      // Deployer deposits 3 BTOKEN to the bank
      await baseToken.approve(vault.address, ethers.utils.parseEther('3'));
      await vault.deposit(ethers.utils.parseEther('3'));

      // Alice can take 0 debt ok
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('0.3'));
      await vaultAsAlice.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('0.3'),
        ethers.utils.parseEther('0'),
        '0',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );

      // To find health of the position, derive following variables:
      // totalBaseToken = 1.3
      // totalFarmingToken = 0.1
      // userBaseToken = 0.159684250517396851
      // userFarmingToken = 0.012283403885953603

      // health = amount of underlying of lp after converted to BTOKEN
      // = userBaseToken + userFarmingTokenAfterSellToBaseToken

      // Find userFarmingTokenAfterSellToBaseToken from
      // mktSellAMount
      // = [(userFarmingToken * 9980) * (totalBaseToken - userBaseToken)] / [((totalFarmingToken - userFarmingToken) * 10000) + (userFarmingToken * 9980)]
      // = [(0.012283403885953603 * 9980) * (1.3 - 0.159684250517396851)] / [((0.1 - 0.012283403885953603) * 10000) + (0.012283403885953603 * 9980)]
      // = 0.139823800150121109

      // health = userBaseToken + userFarmingTokenAfterSellToBaseToken
      // = 0.159684250517396851 + 0.139823800150121109
      // = 0.29950805066751796
      expect(await waultSwapWorker.health(1)).to.be.equal(ethers.utils.parseEther('0.29950805066751796'));

      // must be able to close position
      await vaultAsAlice.work(
        1,
        waultSwapWorker.address,
        '0',
        '0',
        ethers.constants.MaxUint256.toString(),
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [liqStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      );
      expect(await waultSwapWorker.health(1)).to.be.equal(ethers.constants.Zero);
    });

    it('should not allow to open a position with debt less than MIN_DEBT_SIZE', async () => {
      // Deployer deposits 3 BTOKEN to the bank
      await baseToken.approve(vault.address, ethers.utils.parseEther('3'));
      await vault.deposit(ethers.utils.parseEther('3'));

      // Alice cannot take 0.3 debt because it is too small
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('0.3'));
      await expect(
        vaultAsAlice.work(
          0,
          waultSwapWorker.address,
          ethers.utils.parseEther('0.3'),
          ethers.utils.parseEther('0.3'),
          '0',
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'bytes'],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(
              ['uint256'],
              ['0'])
            ]
          )
        )
      ).to.be.revertedWith('too small debt size');
    });

    it('should not allow to open the position with bad work factor', async () => {
      // Deployer deposits 3 BTOKEN to the bank
      await baseToken.approve(vault.address, ethers.utils.parseEther('3'));
      await vault.deposit(ethers.utils.parseEther('3'));

      // Alice cannot take 1 BTOKEN loan because she only put 0.3 BTOKEN as a collateral
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('0.3'));
      await expect(
        vaultAsAlice.work(
          0,
          waultSwapWorker.address,
          ethers.utils.parseEther('0.3'),
          ethers.utils.parseEther('1'),
          '0',
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'bytes'],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(
              ['uint256'],
              ['0'])
            ]
          )
        )
      ).to.be.revertedWith('bad work factor');
    });

    it('should not allow positions if Vault has less BaseToken than requested loan', async () => {
      // Alice cannot take 1 BTOKEN loan because the contract does not have it
      baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('1'));
      await expect(
        vaultAsAlice.work(
          0,
          waultSwapWorker.address,
          ethers.utils.parseEther('1'),
          ethers.utils.parseEther('1'),
          '0',
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'bytes'],
            [addStrat.address, ethers.utils.defaultAbiCoder.encode(
              ['uint256'],
              ['0'])
            ]
          )
        )
      ).to.be.revertedWith('insufficient funds in the vault');
    });

    it('should not able to liquidate healthy position', async () => {
      // Deployer deposits 3 BTOKEN to the bank
      const deposit = ethers.utils.parseEther('3');
      await baseToken.approve(vault.address, deposit);
      await vault.deposit(deposit);

      // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
      const loan = ethers.utils.parseEther('1');
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('1'))
      await vaultAsAlice.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('1'),
        loan,
        '0',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );

      // Her position should have ~2 BTOKEN health (minus some small trading fee)
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')))
      await waultSwapWorkerAsEve.reinvest();
      await vault.deposit(0); // Random action to trigger interest computation

      // You can't liquidate her position yet
      await expect(vaultAsEve.kill('1')).to.be.revertedWith("can't liquidate");
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));
      await expect(vaultAsEve.kill('1')).to.be.revertedWith("can't liquidate");
    });

    it('should work', async () => {
      // Deployer deposits 3 BTOKEN to the bank
      const deposit = ethers.utils.parseEther('3');
      await baseToken.approve(vault.address, deposit);
      await vault.deposit(deposit);

      // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
      const loan = ethers.utils.parseEther('1');
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('1'))
      await vaultAsAlice.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('1'),
        loan,
        '0',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      );

      // Her position should have ~2 NATIVE health (minus some small trading fee)
      // To find health of the position, derive following variables:
      // totalBaseToken = 2.999999999999999958
      // totalFarmingToken = 0.1
      // userBaseToken = 1.267216253674334111
      // userFarmingToken = 0.042240541789144470

      // health = amount of underlying of lp after converted to BTOKEN
      // = userBaseToken + userFarmingTokenAfterSellToBaseToken

      // Find userFarmingTokenAfterSellToBaseToken from
      // mktSellAMount
      // = [(userFarmingToken * 9980) * (totalBaseToken - userBaseToken)] / [((totalFarmingToken - userFarmingToken) * 10000) + (userFarmingToken * 9980)]
      // = [(0.042240541789144470 * 9980) * (2.999999999999999958 - 1.267216253674334111)] / [((0.1 - 0.042240541789144470) * 10000) + (0.042240541789144470 * 9980)]
      // = 0.731091001597324380

      // health = userBaseToken + userFarmingTokenAfterSellToBaseToken
      // = 1.267216253674334111 + 0.731091001597324380
      // = 1.998307255271658491

      expect(await waultSwapWorker.health(1)).to.be.bignumber.eq(ethers.utils.parseEther('1.998307255271658491'));

      // Eve comes and trigger reinvest
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));
      await waultSwapWorkerAsEve.reinvest();
      AssertHelpers.assertAlmostEqual(
        (WEX_REWARD_PER_BLOCK.mul('2').mul(REINVEST_BOUNTY_BPS).div('10000')).toString(),
        (await wex.balanceOf(await eve.getAddress())).toString(),
      );

      await vault.deposit(0); // Random action to trigger interest computation
      const healthDebt = await vault.positionInfo('1');
      expect(healthDebt[0]).to.be.bignumber.above(ethers.utils.parseEther('2'));
      const interest = ethers.utils.parseEther('0.3'); // 30% interest rate
      AssertHelpers.assertAlmostEqual(
        healthDebt[1].toString(),
        interest.add(loan).toString(),
      );
      AssertHelpers.assertAlmostEqual(
        (await baseToken.balanceOf(vault.address)).toString(),
        deposit.sub(loan).toString(),
      );
      AssertHelpers.assertAlmostEqual(
        (await vault.vaultDebtVal()).toString(),
        interest.add(loan).toString(),
      );

      const reservePool = interest.mul(RESERVE_POOL_BPS).div('10000');
      AssertHelpers.assertAlmostEqual(
        reservePool.toString(),
        (await vault.reservePool()).toString(),
      );
      AssertHelpers.assertAlmostEqual(
        deposit.add(interest).sub(reservePool).toString(),
        (await vault.totalToken()).toString(),
      );
    });

    it('should has correct interest rate growth', async () => {
      // Deployer deposits 3 BTOKEN to the bank
      const deposit = ethers.utils.parseEther('3');
      await baseToken.approve(vault.address, deposit);
      await vault.deposit(deposit);

      // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
      const loan = ethers.utils.parseEther('1');
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('1'));
      await vaultAsAlice.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('1'),
        loan,
        '0',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      );

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));
      await waultSwapWorkerAsEve.reinvest();
      await vault.deposit(0); // Random action to trigger interest computation

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));

      await vault.deposit(0); // Random action to trigger interest computation
      const interest = ethers.utils.parseEther('0.3'); //30% interest rate
      const reservePool = interest.mul(RESERVE_POOL_BPS).div('10000');
      AssertHelpers.assertAlmostEqual(
        (deposit
          .add(interest.sub(reservePool))
          .add(interest.sub(reservePool).mul(13).div(10))
          .add(interest.sub(reservePool).mul(13).div(10))).toString(),
        (await vault.totalToken()).toString(),
      );
    });

    it('should be able to liquidate bad position', async () => {
      // Deployer deposits 3 BTOKEN to the bank
      const deposit = ethers.utils.parseEther('3');
      await baseToken.approve(vault.address, deposit);
      await vault.deposit(deposit);

      // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
      const loan = ethers.utils.parseEther('1');
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('1'));
      await vaultAsAlice.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('1'),
        loan,
        '0',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));
      await waultSwapWorkerAsEve.reinvest();
      await vault.deposit(0); // Random action to trigger interest computation

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));

      await vault.deposit(0); // Random action to trigger interest computation
      const interest = ethers.utils.parseEther('0.3'); //30% interest rate
      const reservePool = interest.mul(RESERVE_POOL_BPS).div('10000');
      AssertHelpers.assertAlmostEqual(
        (deposit
          .add(interest.sub(reservePool))
          .add(interest.sub(reservePool).mul(13).div(10))
          .add(interest.sub(reservePool).mul(13).div(10))).toString(),
        (await vault.totalToken()).toString()
      );

      // Calculate the expected result.
        // set interest rate to be 0 to be easy for testing.
        await simpleVaultConfig.setParams(
          MIN_DEBT_SIZE, 0, RESERVE_POOL_BPS, KILL_PRIZE_BPS,
          wbnb.address, wNativeRelayer.address, fairLaunch.address, KILL_TREASURY_BPS,await deployer.getAddress()
        )
        const toBeLiquidatedValue = await waultSwapWorker.health(1)
        const liquidationBounty = toBeLiquidatedValue.mul(KILL_PRIZE_BPS).div(10000)
        const treasuryKillFees = toBeLiquidatedValue.mul(KILL_TREASURY_BPS).div(10000)
        const totalLiquidationFees = liquidationBounty.add(treasuryKillFees)
        const eveBalanceBefore = await baseToken.balanceOf(await eve.getAddress())
        const aliceAlpacaBefore = await alpacaToken.balanceOf(await alice.getAddress());
        const aliceBalanceBefore = await baseToken.balanceOf(await alice.getAddress())
        const vaultBalanceBefore = await baseToken.balanceOf(vault.address)
        const deployerBalanceBefore = await baseToken.balanceOf(await deployer.getAddress())
        const vaultDebtVal = await vault.vaultDebtVal()
        const debt = await vault.debtShareToVal((await vault.positions(1)).debtShare)
        const left = debt.gte(toBeLiquidatedValue.sub(totalLiquidationFees)) ? ethers.constants.Zero : toBeLiquidatedValue.sub(totalLiquidationFees).sub(debt)
        
        // Now eve kill the position
        await expect(vaultAsEve.kill('1'))
          .to.emit(vaultAsEve, 'Kill')
        
        // Getting balances after killed
        const eveBalanceAfter = await baseToken.balanceOf(await eve.getAddress())
        const aliceBalanceAfter = await baseToken.balanceOf(await alice.getAddress())
        const vaultBalanceAfter = await baseToken.balanceOf(vault.address)
        const deployerBalanceAfter = await baseToken.balanceOf(await deployer.getAddress())
  
        AssertHelpers.assertAlmostEqual(
          deposit
            .add(interest)
            .add(interest.mul(13).div(10))
            .add(interest.mul(13).div(10)).toString(),
          (await baseToken.balanceOf(vault.address)).toString(),
        );
        expect(await vault.vaultDebtVal()).to.be.bignumber.eq(ethers.utils.parseEther('0'));
        AssertHelpers.assertAlmostEqual(
          reservePool.add(reservePool.mul(13).div(10)).add(reservePool.mul(13).div(10)).toString(),
          (await vault.reservePool()).toString(),
        );
        AssertHelpers.assertAlmostEqual(
          deposit
            .add(interest.sub(reservePool))
            .add(interest.sub(reservePool).mul(13).div(10))
            .add(interest.sub(reservePool).mul(13).div(10)).toString(),
          (await vault.totalToken()).toString(),
        );
        expect(
          eveBalanceAfter.sub(eveBalanceBefore),
          "expect Eve to get her liquidation bounty"
        ).to.be.eq(liquidationBounty)
        expect(
          deployerBalanceAfter.sub(deployerBalanceBefore),
          "expect Deployer to get treasury liquidation fees"
        ).to.be.eq(treasuryKillFees)
        expect(
          aliceBalanceAfter.sub(aliceBalanceBefore),
          "expect Alice to get her leftover back"
        ).to.be.eq(left)
        expect(
          vaultBalanceAfter.sub(vaultBalanceBefore),
          "expect Vault to get its funds + interest"
        ).to.be.eq(vaultDebtVal)
        expect(
          (await vault.positions(1)).debtShare,
          "expect Pos#1 debt share to be 0"
        ).to.be.eq(0)
        expect(
          await alpacaToken.balanceOf(await alice.getAddress()),
          "expect Alice to get some ALPACA from holding LYF position"
        ).to.be.bignumber.gt(aliceAlpacaBefore);

      // Alice creates a new position again
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('1'));
      await vaultAsAlice.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('1'),
        ethers.utils.parseEther('1'),
        '0',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      )

      // She can close position
      await vaultAsAlice.work(
        2,
        waultSwapWorker.address,
        '0',
        '0',
        '115792089237316195423570985008687907853269984665640564039457584007913129639935',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [liqStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      );
    }).timeout(50000);

    it('should be not allow user to emergencyWithdraw debtToken on FairLaunch', async () => {
      // Deployer deposits 3 BTOKEN to the bank
      const deposit = ethers.utils.parseEther('3');
      await baseToken.approve(vault.address, deposit);
      await vault.deposit(deposit);

      // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
      const loan = ethers.utils.parseEther('1');
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('1'));
      await vaultAsAlice.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('1'),
        loan,
        '0',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));
      await waultSwapWorkerAsEve.reinvest();
      await vault.deposit(0); // Random action to trigger interest computation

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));

      await vault.deposit(0); // Random action to trigger interest computation
      const interest = ethers.utils.parseEther('0.3'); //30% interest rate
      const reservePool = interest.mul(RESERVE_POOL_BPS).div('10000');
      AssertHelpers.assertAlmostEqual(
        (deposit
          .add(interest.sub(reservePool))
          .add(interest.sub(reservePool).mul(13).div(10))
          .add(interest.sub(reservePool).mul(13).div(10))).toString(),
        (await vault.totalToken()).toString()
      );

      // Alice emergencyWithdraw from FairLaunch
      await expect(fairLaunchAsAlice.emergencyWithdraw(0)).to.be.revertedWith('only funder');

      const eveBefore = await baseToken.balanceOf(await eve.getAddress());

      // Now you can liquidate because of the insane interest rate
      await expect(vaultAsEve.kill('1'))
        .to.emit(vaultAsEve, 'Kill')

      expect(await baseToken.balanceOf(await eve.getAddress())).to.be.bignumber.gt(eveBefore);
      AssertHelpers.assertAlmostEqual(
        deposit
          .add(interest)
          .add(interest.mul(13).div(10))
          .add(interest.mul(13).div(10)).toString(),
        (await baseToken.balanceOf(vault.address)).toString(),
      );
      expect(await vault.vaultDebtVal()).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      AssertHelpers.assertAlmostEqual(
        reservePool.add(reservePool.mul(13).div(10)).add(reservePool.mul(13).div(10)).toString(),
        (await vault.reservePool()).toString(),
      );
      AssertHelpers.assertAlmostEqual(
        deposit
          .add(interest.sub(reservePool))
          .add(interest.sub(reservePool).mul(13).div(10))
          .add(interest.sub(reservePool).mul(13).div(10)).toString(),
        (await vault.totalToken()).toString(),
      );

      // Alice creates a new position again
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('1'));
      await vaultAsAlice.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('1'),
        ethers.utils.parseEther('1'),
        '0',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      )

      // She can close position
      await vaultAsAlice.work(
        2,
        waultSwapWorker.address,
        '0',
        '0',
        '115792089237316195423570985008687907853269984665640564039457584007913129639935',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [liqStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      );
    }).timeout(50000);

    it('should deposit and withdraw BTOKEN from Vault (bad debt case)', async () => {
      // Deployer deposits 10 BTOKEN to the Vault
      const deposit = ethers.utils.parseEther('10');
      await baseToken.approve(vault.address, deposit)
      await vault.deposit(deposit);

      expect(await vault.balanceOf(await deployer.getAddress())).to.be.bignumber.equal(deposit);

      // Bob borrows 2 BTOKEN loan
      const loan = ethers.utils.parseEther('2');
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('1'));
      await vaultAsBob.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('1'),
        loan,
        '0', // max return = 0, don't return BTOKEN to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      );

      expect(await baseToken.balanceOf(vault.address)).to.be.bignumber.equal(deposit.sub(loan));
      expect(await vault.vaultDebtVal()).to.be.bignumber.equal(loan);
      expect(await vault.totalToken()).to.be.bignumber.equal(deposit);

      // Alice deposits 2 BTOKEN
      const aliceDeposit = ethers.utils.parseEther('2');
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('2'));
      await vaultAsAlice.deposit(aliceDeposit);

      AssertHelpers.assertAlmostEqual(
        deposit.sub(loan).add(aliceDeposit).toString(),
        (await baseToken.balanceOf(vault.address)).toString(),
      );

      // check Alice ibBTOKEN balance = 2/10 * 10 = 2 ibBTOKEN
      AssertHelpers.assertAlmostEqual(
        aliceDeposit.toString(),
        (await vault.balanceOf(await alice.getAddress())).toString(),
      );
      AssertHelpers.assertAlmostEqual(
        deposit.add(aliceDeposit).toString(),
        (await vault.totalSupply()).toString(),
      );

      // Simulate BTOKEN price is very high by swap FTOKEN to BTOKEN (reduce BTOKEN supply)
      await farmToken.mint(await deployer.getAddress(), ethers.utils.parseEther('100'));
      await farmToken.approve(router.address, ethers.utils.parseEther('100'));
      await router.swapExactTokensForTokens(
        ethers.utils.parseEther('100'), '0',
        [farmToken.address, baseToken.address], await deployer.getAddress(), FOREVER);

      // Alice liquidates Bob position#1
      const vaultBaseBefore = await baseToken.balanceOf(vault.address)
      let aliceBefore = await baseToken.balanceOf(await alice.getAddress());
      await expect(vaultAsAlice.kill('1')) // at health = 0.003000997994240237
        .to.emit(vaultAsAlice, 'Kill')

      let aliceAfter = await baseToken.balanceOf(await alice.getAddress());

      // Bank balance is increase by liquidation (0.002700898194816214 = 0.9 * 0.003000997994240237)
      AssertHelpers.assertAlmostEqual(
        vaultBaseBefore.add(
          ethers.utils.parseEther('0.002700898194816214')
        ).toString(),
        (await baseToken.balanceOf(vault.address)).toString(),
      );

      // Alice is liquidator, Alice should receive 10% Kill prize
      // BTOKEN back from liquidation 0.003000997994240237, 10% of it is 0.000300099799424023
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('0.000300099799424023').toString(),
        aliceAfter.sub(aliceBefore).toString(),
      );

      // Alice withdraws 2 BOKTEN
      aliceBefore = await baseToken.balanceOf(await alice.getAddress());
      await vaultAsAlice.withdraw(await vault.balanceOf(await alice.getAddress()));
      aliceAfter = await baseToken.balanceOf(await alice.getAddress());

      // alice gots 2/12 * 10.002700898194816214 = 1.667116816365802702
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('1.667116816365802702').toString(),
        aliceAfter.sub(aliceBefore).toString()
      );
    });

    it('should liquidate user position correctly', async () => {
      // Bob deposits 20 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('20'));
      await vaultAsBob.deposit(ethers.utils.parseEther('20'));

      // Position#1: Alice borrows 10 BTOKEN loan
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('10'));
      await vaultAsAlice.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('10'),
        ethers.utils.parseEther('10'),
        '0', // max return = 0, don't return BTOKEN to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      );

      await farmToken.mint(await deployer.getAddress(), ethers.utils.parseEther('100'));
      await farmToken.approve(router.address, ethers.utils.parseEther('100'));

      // Price swing 10%
      // Add more token to the pool equals to sqrt(10*((0.1)**2) / 9) - 0.1 = 0.005409255338945984, (0.1 is the balance of token in the pool)
      await router.swapExactTokensForTokens(
        ethers.utils.parseEther('0.005409255338945984'),
        '0',
        [farmToken.address, baseToken.address],
        await deployer.getAddress(),
        FOREVER
      );
      await expect(vaultAsEve.kill('1')).to.be.revertedWith("can't liquidate");

      // Price swing 20%
      // Add more token to the pool equals to
      // sqrt(10*((0.10540925533894599)**2) / 8) - 0.10540925533894599 = 0.012441874858811944
      // (0.10540925533894599 is the balance of token in the pool)
      await router.swapExactTokensForTokens(
        ethers.utils.parseEther('0.012441874858811944'),
        '0',
        [farmToken.address, baseToken.address],
        await deployer.getAddress(),
        FOREVER
      );
      await expect(vaultAsEve.kill('1')).to.be.revertedWith("can't liquidate");

      // Price swing 23.43%
      // Existing token on the pool = 0.10540925533894599 + 0.012441874858811944 = 0.11785113019775793
      // Add more token to the pool equals to
      // sqrt(10*((0.11785113019775793)**2) / 7.656999999999999) - 0.11785113019775793 = 0.016829279312591913
      await router.swapExactTokensForTokens(
        ethers.utils.parseEther('0.016829279312591913'),
        '0',
        [farmToken.address, baseToken.address],
        await deployer.getAddress(),
        FOREVER
      );
      await expect(vaultAsEve.kill('1')).to.be.revertedWith("can't liquidate");

      // Price swing 30%
      // Existing token on the pool = 0.11785113019775793 + 0.016829279312591913 = 0.13468040951034985
      // Add more token to the pool equals to
      // sqrt(10*((0.13468040951034985)**2) / 7) - 0.13468040951034985 = 0.026293469053292218
      await router.swapExactTokensForTokens(
        ethers.utils.parseEther('0.026293469053292218'),
        '0',
        [farmToken.address, baseToken.address],
        await deployer.getAddress(),
        FOREVER
      );

      // Now you can liquidate because of the price fluctuation
      const eveBefore = await baseToken.balanceOf(await eve.getAddress());
      await expect(vaultAsEve.kill('1'))
        .to.emit(vaultAsEve, 'Kill')

      expect(await baseToken.balanceOf(await eve.getAddress())).to.be.bignumber.gt(eveBefore);
    });

    it('should reinvest correctly', async () => {
      // Set Bank's debt interests to 0% per year
      await simpleVaultConfig.setParams(
        ethers.utils.parseEther('1'), // 1 BTOKEN min debt size,
        '0', // 0% per year
        '1000', // 10% reserve pool
        '1000', // 10% Kill prize
        wbnb.address,
        wNativeRelayer.address,
        fairLaunch.address,
        KILL_TREASURY_BPS,
        await deployer.getAddress(),
      );

      // Set Reinvest bounty to 10% of the reward
      await waultSwapWorker.setReinvestBountyBps('100');

      // Bob deposits 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
      await vaultAsBob.deposit(ethers.utils.parseEther('10'));

      // Alice deposits 12 BTOKEN
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('12'));
      await vaultAsAlice.deposit(ethers.utils.parseEther('12'));

      // Position#1: Bob borrows 10 BTOKEN loan
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'))
      await vaultAsBob.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('10'),
        ethers.utils.parseEther('10'),
        '0', // max return = 0, don't return NATIVE to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );

      // Position#2: Alice borrows 2 BTOKEN loan
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('1'))
      await vaultAsAlice.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('1'),
        ethers.utils.parseEther('2'),
        '0', // max return = 0, don't return BTOKEN to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      );

      // ---------------- Reinvest#1 -------------------
      // Wait for 1 day and someone calls reinvest
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));

      let [bobHealthBefore] = await vault.positionInfo('1');
      let [aliceHealthBefore] = await vault.positionInfo('2');

      let [workerLPBefore, workerDebtBefore] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      await waultSwapWorkerAsEve.reinvest();

      // WaultSwapWorker receives 303999999998816250 WEX as a reward
      // Eve got 10% of 303999999998816250 WEX = 0.01 * 303999999998816250 = 3039999999988162 bounty
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('0.003039999999988162').toString(),
        (await wex.balanceOf(await eve.getAddress())).toString(),
      );

      // Remaining WaultSwapWorker reward = 227999999998874730 - 22799999999887473 = 205199999998987257 (~90% reward)
      // Convert 205199999998987257 WEX -> NATIVE -> 428154194393642655 BTOKEN
      //
      // To find the increasing LP amount, derive following variables before adding liquidity:
      // amountBaseToken = 214810100415974530
      // totalBaseToken = 24213344093977668125
      // totalSupply = 1547881394156502594
      // lpAmount = totalSupply * (amountB / reserveB)
      // = 1547881394156502594 * (214810100415974530 / 24213344093977668125)
      // = 13732120454748601
      let [workerLPAfter, workerDebtAfter] = await wexMaster.userInfo(poolId, waultSwapWorker.address);

      // LP tokens of worker should be inceased from reinvestment
      expect(workerLPAfter).to.be.bignumber.gt(workerLPBefore);
      AssertHelpers.assertAlmostEqual(
        workerLPAfter.sub(workerLPBefore).toString(),
        '13732120454748601'
      )
      // Check Bob position info
      await waultSwapWorker.health('1');
      let [bobHealth, bobDebtToShare] = await vault.positionInfo('1');
      expect(bobHealth).to.be.bignumber.gt(bobHealthBefore); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('10').toString(),
        bobDebtToShare.toString(),
      );

      // Check Alice position info
      await waultSwapWorker.health('2');
      let [aliceHealth, aliceDebtToShare] = await vault.positionInfo('2');
      expect(aliceHealth).to.be.bignumber.gt(aliceHealthBefore); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('2').toString(),
        aliceDebtToShare.toString(),
      );

      // ---------------- Reinvest#2 -------------------
      // Wait for 1 day and someone calls reinvest
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));

      [bobHealthBefore] = await vault.positionInfo('1');
      [aliceHealthBefore] = await vault.positionInfo('2');

      [workerLPBefore, workerDebtBefore] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      await waultSwapWorkerAsEve.reinvest();

      // eve should earn wex as a reward for reinvest
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('0.004559999999987660').toString(),
        (await wex.balanceOf(await eve.getAddress())).toString(),
      );

      // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
      // Convert 128572916666654734 WEX to 157462478899282341 NATIVE
      // Convert NATIVE to 5001669421841640 LP token
      [workerLPAfter, workerDebtAfter] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      // LP tokens of worker should be inceased from reinvestment
      expect(workerLPAfter).to.be.bignumber.gt(workerLPBefore);

      // Check Bob position info
      [bobHealth, bobDebtToShare] = await vault.positionInfo('1');
      expect(bobHealth).to.be.bignumber.gt(bobHealthBefore); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('10').toString(),
        bobDebtToShare.toString(),
      );

      // Check Alice position info
      [aliceHealth, aliceDebtToShare] = await vault.positionInfo('2');
      expect(aliceHealth).to.be.bignumber.gt(aliceHealthBefore); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('2').toString(),
        aliceDebtToShare.toString(),
      );

      // ---------------- Reinvest#3 -------------------
      // Wait for 1 day and someone calls reinvest
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));

      [workerLPBefore, workerDebtBefore] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      await waultSwapWorkerAsEve.reinvest();

      // eve should earn WEX as a reward for reinvest
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('0.006079999999979926').toString(),
        (await wex.balanceOf(await eve.getAddress())).toString(),
      );

      // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
      // Convert 128572916666654734 WEX to 74159218067697746 NATIVE
      // Convert NATIVE to 2350053120029788 LP token
      [workerLPAfter, workerDebtAfter] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      // LP tokens of worker should be inceased from reinvestment
      expect(workerLPAfter).to.be.bignumber.gt(workerLPBefore);

      const bobBefore = await baseToken.balanceOf(await bob.getAddress());
      // Bob close position#1
      await vaultAsBob.work(
        1,
        waultSwapWorker.address,
        '0',
        '0',
        '1000000000000000000000',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [liqStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      );
      const bobAfter = await baseToken.balanceOf(await bob.getAddress());

      // Check Bob account, Bob must be richer as he earn more from yield
      expect(bobAfter).to.be.bignumber.gt(bobBefore);

      // Alice add another 10 BTOKEN
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('10'));
      await vaultAsAlice.work(
        2,
        waultSwapWorker.address,
        ethers.utils.parseEther('10'),
        0,
        '0', // max return = 0, don't return NATIVE to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      );

      const aliceBefore = await baseToken.balanceOf(await alice.getAddress());
      // Alice close position#2
      await vaultAsAlice.work(
        2,
        waultSwapWorker.address,
        '0',
        '0',
        '1000000000000000000000000000000',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [liqStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );
      const aliceAfter = await baseToken.balanceOf(await alice.getAddress());

      // Check Alice account, Alice must be richer as she earned from leverage yield farm without getting liquidated
      expect(aliceAfter).to.be.bignumber.gt(aliceBefore);
    }).timeout(50000);

    it('should close position correctly when user holds multiple positions', async () => {
      // Set Bank's debt interests to 0% per year
      await simpleVaultConfig.setParams(
        ethers.utils.parseEther('1'), // 1 BTOKEN min debt size,
        '0', // 0% per year
        '1000', // 10% reserve pool
        '1000', // 10% Kill prize
        wbnb.address,
        wNativeRelayer.address,
        fairLaunch.address,
        KILL_TREASURY_BPS,
        await deployer.getAddress(),
      );

      // Set Reinvest bounty to 10% of the reward
      await waultSwapWorker.setReinvestBountyBps('100');

      // Bob deposits 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
      await vaultAsBob.deposit(ethers.utils.parseEther('10'));

      // Alice deposits 12 BTOKEN
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('12'));
      await vaultAsAlice.deposit(ethers.utils.parseEther('12'));

      // Position#1: Bob borrows 10 BTOKEN loan
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'))
      await vaultAsBob.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('10'),
        ethers.utils.parseEther('10'),
        '0', // max return = 0, don't return NATIVE to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );

      // Position#2: Bob borrows another 2 BTOKEN loan
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('1'))
      await vaultAsBob.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('1'),
        ethers.utils.parseEther('2'),
        '0', // max return = 0, don't return BTOKEN to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      );

      // ---------------- Reinvest#1 -------------------
      // Wait for 1 day and someone calls reinvest
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));

      let [workerLPBefore, workerDebtBefore] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      await waultSwapWorkerAsEve.reinvest();
      // WaultSwapWorker receives 303999999998816250 wex as a reward
      // Eve got 10% of 303999999998816250 wex = 0.01 * 303999999998816250 = 3039999999988162 bounty
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('0.003039999999988162').toString(),
        (await wex.balanceOf(await eve.getAddress())).toString(),
      );

      // Remaining WaultSwapWorker reward = 227999999998874730 - 22799999999887473 = 205199999998987257 (~90% reward)
      // Convert 205199999998987257 wex to 671683776318381694 NATIVE
      // Convert NATIVE to 1252466339860712438 LP token and stake
      let [workerLPAfter, workerDebtAfter] = await wexMaster.userInfo(poolId, waultSwapWorker.address);

      // LP tokens of worker should be inceased from reinvestment
      expect(workerLPAfter).to.be.bignumber.gt(workerLPBefore);

      // Check Position#1 info
      await waultSwapWorker.health('1');
      let [bob1Health, bob1DebtToShare] = await vault.positionInfo('1');
      expect(bob1Health).to.be.bignumber.gt(ethers.utils.parseEther('20')); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('10').toString(),
        bob1DebtToShare.toString(),
      );

      // Check Position#2 info
      await waultSwapWorker.health('2');
      let [bob2Health, bob2DebtToShare] = await vault.positionInfo('2');
      expect(bob2Health).to.be.bignumber.gt(ethers.utils.parseEther('3')); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('2').toString(),
        bob2DebtToShare.toString(),
      );

      // ---------------- Reinvest#2 -------------------
      // Wait for 1 day and someone calls reinvest
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));

      [workerLPBefore, workerDebtBefore] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      await waultSwapWorkerAsEve.reinvest();

      // eve should earn wex as a reward for reinvest
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('0.004559999999987660').toString(),
        (await wex.balanceOf(await eve.getAddress())).toString(),
      );

      // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
      // Convert 128572916666654734 WEX to 157462478899282341 NATIVE
      // Convert NATIVE to 5001669421841640 LP token
      [workerLPAfter, workerDebtAfter] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      // LP tokens of worker should be inceased from reinvestment
      expect(workerLPAfter).to.be.bignumber.gt(workerLPBefore);

      // Check Position#1 position info
      [bob1Health, bob1DebtToShare] = await vault.positionInfo('1');
      expect(bob1Health).to.be.bignumber.gt(ethers.utils.parseEther('20')); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('10').toString(),
        bob1DebtToShare.toString(),
      );

      // Check Position#2 position info
      [bob2Health, bob2DebtToShare] = await vault.positionInfo('2');
      expect(bob2Health).to.be.bignumber.gt(ethers.utils.parseEther('3')); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('2').toString(),
        bob2DebtToShare.toString(),
      );

      let bobBefore = await baseToken.balanceOf(await bob.getAddress());
      let bobAlpacaBefore = await alpacaToken.balanceOf(await bob.getAddress());
      // Bob close position#1
      await vaultAsBob.work(
        1,
        waultSwapWorker.address,
        '0',
        '0',
        '1000000000000000000000',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [liqStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      );
      let bobAfter = await baseToken.balanceOf(await bob.getAddress());
      let bobAlpacaAfter = await alpacaToken.balanceOf(await bob.getAddress());

      // Check Bob account, Bob must be richer as he earn more from yield
      expect(bobAlpacaAfter).to.be.bignumber.gt(bobAlpacaBefore);
      expect(bobAfter).to.be.bignumber.gt(bobBefore);

      // Bob add another 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
      await vaultAsBob.work(
        2,
        waultSwapWorker.address,
        ethers.utils.parseEther('10'),
        0,
        '0', // max return = 0, don't return NATIVE to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      );

      bobBefore = await baseToken.balanceOf(await bob.getAddress());
      bobAlpacaBefore = await alpacaToken.balanceOf(await bob.getAddress());
      // Bob close position#2
      await vaultAsBob.work(
        2,
        waultSwapWorker.address,
        '0',
        '0',
        '1000000000000000000000000000000',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [liqStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );
      bobAfter = await baseToken.balanceOf(await bob.getAddress());
      bobAlpacaAfter = await alpacaToken.balanceOf(await bob.getAddress());

      // Check Bob account, Bob must be richer as she earned from leverage yield farm without getting liquidated
      expect(bobAfter).to.be.bignumber.gt(bobBefore);
      expect(bobAlpacaAfter).to.be.bignumber.gt(bobAlpacaBefore);
    }).timeout(50000)

    it('should close position correctly when user holds mix positions of leveraged and non-leveraged', async () => {
      // Set Bank's debt interests to 0% per year
      await simpleVaultConfig.setParams(
        ethers.utils.parseEther('1'), // 1 BTOKEN min debt size,
        '0', // 0% per year
        '1000', // 10% reserve pool
        '1000', // 10% Kill prize
        wbnb.address,
        wNativeRelayer.address,
        fairLaunch.address,
        KILL_TREASURY_BPS,
        await deployer.getAddress(),
      );

      // Set Reinvest bounty to 10% of the reward
      await waultSwapWorker.setReinvestBountyBps('100');

      // Bob deposits 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
      await vaultAsBob.deposit(ethers.utils.parseEther('10'));

      // Alice deposits 12 BTOKEN
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('12'));
      await vaultAsAlice.deposit(ethers.utils.parseEther('12'));

      // Position#1: Bob borrows 10 BTOKEN loan
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'))
      await vaultAsBob.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('10'),
        ethers.utils.parseEther('10'),
        '0', // max return = 0, don't return NATIVE to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );

      // Position#2: Bob open position without leverage
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('3'))
      await vaultAsBob.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('3'),
        '0',
        '0', // max return = 0, don't return BTOKEN to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      );

      // ---------------- Reinvest#1 -------------------
      // Wait for 1 day and someone calls reinvest
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));

      let [workerLPBefore, workerDebtBefore] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      await waultSwapWorkerAsEve.reinvest();
      // WaultSwapWorker receives 303999999998816250 wex as a reward
      // Eve got 10% of 303999999998816250 wex = 0.01 * 303999999998816250 = 3039999999988162 bounty
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('0.003039999999988162').toString(),
        (await wex.balanceOf(await eve.getAddress())).toString(),
      );

      // Remaining WaultSwapWorker reward = 227999999998874730 - 22799999999887473 = 205199999998987257 (~90% reward)
      // Convert 205199999998987257 wex to 671683776318381694 NATIVE
      // Convert NATIVE to 1252466339860712438 LP token and stake
      let [workerLPAfter, workerDebtAfter] = await wexMaster.userInfo(poolId, waultSwapWorker.address);

      // LP tokens of worker should be inceased from reinvestment
      expect(workerLPAfter).to.be.bignumber.gt(workerLPBefore);

      // Check Position#1 info
      await waultSwapWorker.health('1');
      let [bob1Health, bob1DebtToShare] = await vault.positionInfo('1');
      expect(bob1Health).to.be.bignumber.gt(ethers.utils.parseEther('20')); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('10').toString(),
        bob1DebtToShare.toString(),
      );

      // Check Position#2 info
      await waultSwapWorker.health('2');
      let [bob2Health, bob2DebtToShare] = await vault.positionInfo('2');
      expect(bob2Health).to.be.bignumber.gt(ethers.utils.parseEther('3')); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('0').toString(),
        bob2DebtToShare.toString(),
      );

      // ---------------- Reinvest#2 -------------------
      // Wait for 1 day and someone calls reinvest
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));

      [workerLPBefore, workerDebtBefore] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      await waultSwapWorkerAsEve.reinvest();

      // eve should earn wex as a reward for reinvest
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('0.004559999999987660').toString(),
        (await wex.balanceOf(await eve.getAddress())).toString(),
      );

      // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
      // Convert 128572916666654734 WEX to 157462478899282341 NATIVE
      // Convert NATIVE to 5001669421841640 LP token
      [workerLPAfter, workerDebtAfter] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      // LP tokens of worker should be inceased from reinvestment
      expect(workerLPAfter).to.be.bignumber.gt(workerLPBefore);

      // Check Position#1 position info
      [bob1Health, bob1DebtToShare] = await vault.positionInfo('1');
      expect(bob1Health).to.be.bignumber.gt(ethers.utils.parseEther('20')); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('10').toString(),
        bob1DebtToShare.toString(),
      );

      // Check Position#2 position info
      [bob2Health, bob2DebtToShare] = await vault.positionInfo('2');
      expect(bob2Health).to.be.bignumber.gt(ethers.utils.parseEther('3')); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('0').toString(),
        bob2DebtToShare.toString(),
      );

      let bobBefore = await baseToken.balanceOf(await bob.getAddress());
      let bobAlpacaBefore = await alpacaToken.balanceOf(await bob.getAddress());
      // Bob close position#1
      await vaultAsBob.work(
        1,
        waultSwapWorker.address,
        '0',
        '0',
        '1000000000000000000000',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [liqStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      );
      let bobAfter = await baseToken.balanceOf(await bob.getAddress());
      let bobAlpacaAfter = await alpacaToken.balanceOf(await bob.getAddress());

      // Check Bob account, Bob must be richer as he earn more from yield
      expect(bobAlpacaAfter).to.be.bignumber.gt(bobAlpacaBefore);
      expect(bobAfter).to.be.bignumber.gt(bobBefore);

      // Bob add another 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
      await vaultAsBob.work(
        2,
        waultSwapWorker.address,
        ethers.utils.parseEther('10'),
        0,
        '0', // max return = 0, don't return NATIVE to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      );

      bobBefore = await baseToken.balanceOf(await bob.getAddress());
      bobAlpacaBefore = await alpacaToken.balanceOf(await bob.getAddress());
      // Bob close position#2
      await vaultAsBob.work(
        2,
        waultSwapWorker.address,
        '0',
        '0',
        '1000000000000000000000000000000',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [liqStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );
      bobAfter = await baseToken.balanceOf(await bob.getAddress());
      bobAlpacaAfter = await alpacaToken.balanceOf(await bob.getAddress());

      // Check Bob account, Bob must be richer as she earned from leverage yield farm without getting liquidated
      // But bob shouldn't earn more ALPACAs from closing position#2
      expect(bobAfter).to.be.bignumber.gt(bobBefore);
      expect(bobAlpacaAfter).to.be.bignumber.eq(bobAlpacaBefore);
    }).timeout(50000)

    it('should partially close position successfully, when maxReturn < liquidated amount, payback part of the debt', async () => {
      // Set Bank's debt interests to 0% per year
      await simpleVaultConfig.setParams(
        ethers.utils.parseEther('1'), // 1 BTOKEN min debt size,
        '0', // 0% per year
        '1000', // 10% reserve pool
        '1000', // 10% Kill prize
        wbnb.address,
        wNativeRelayer.address,
        fairLaunch.address,
        KILL_TREASURY_BPS,
        await deployer.getAddress(),
      );

      // Set Reinvest bounty to 10% of the reward
      await waultSwapWorker.setReinvestBountyBps('100');

      // Bob deposits 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
      await vaultAsBob.deposit(ethers.utils.parseEther('10'));

      // Alice deposits 12 BTOKEN
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('12'));
      await vaultAsAlice.deposit(ethers.utils.parseEther('12'));

      // Position#1: Bob borrows 10 BTOKEN loan
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'))
      await vaultAsBob.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('10'),
        ethers.utils.parseEther('10'),
        '0', // max return = 0, don't return NATIVE to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );

      // Position#2: Alice borrows 2 BTOKEN loan
      await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('1'))
      await vaultAsAlice.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('1'),
        ethers.utils.parseEther('2'),
        '0', // max return = 0, don't return BTOKEN to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        )
      );

      // ---------------- Reinvest#1 -------------------
      // Wait for 1 day and someone calls reinvest
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));

      let [workerLPBefore, workerDebtBefore] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      await waultSwapWorkerAsEve.reinvest();
      // WaultSwapWorker receives 303999999998816250 wex as a reward
      // Eve got 10% of 303999999998816250 wex = 0.01 * 303999999998816250 = 3039999999988162 bounty
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('0.003039999999988162').toString(),
        (await wex.balanceOf(await eve.getAddress())).toString(),
      );

      // Remaining WaultSwapWorker reward = 227999999998874730 - 22799999999887473 = 205199999998987257 (~90% reward)
      // Convert 205199999998987257 wex to 671683776318381694 NATIVE
      // Convert NATIVE to 1252466339860712438 LP token and stake
      let [workerLPAfter, workerDebtAfter] = await wexMaster.userInfo(poolId, waultSwapWorker.address);

      // LP tokens of worker should be inceased from reinvestment
      expect(workerLPAfter).to.be.bignumber.gt(workerLPBefore);

      // Check Bob position info
      await waultSwapWorker.health('1');
      let [bobHealth, bobDebtToShare] = await vault.positionInfo('1');
      expect(bobHealth).to.be.bignumber.gt(ethers.utils.parseEther('20')); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('10').toString(),
        bobDebtToShare.toString(),
      );

      // Check Alice position info
      await waultSwapWorker.health('2');
      let [aliceHealth, aliceDebtToShare] = await vault.positionInfo('2');
      expect(aliceHealth).to.be.bignumber.gt(ethers.utils.parseEther('3')); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('2').toString(),
        aliceDebtToShare.toString(),
      );

      // ---------------- Reinvest#2 -------------------
      // Wait for 1 day and someone calls reinvest
      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));

      [workerLPBefore, workerDebtBefore] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      await waultSwapWorkerAsEve.reinvest();

      // eve should earn wex as a reward for reinvest
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('0.004559999999987660').toString(),
        (await wex.balanceOf(await eve.getAddress())).toString(),
      );

      // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
      // Convert 128572916666654734 WEX to 157462478899282341 BTOKEN
      // Convert BTOKEN to 5001669421841640 LP token
      [workerLPAfter, workerDebtAfter] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      // LP tokens of worker should be inceased from reinvestment
      expect(workerLPAfter).to.be.bignumber.gt(workerLPBefore);

      // Check Bob position info
      [bobHealth, bobDebtToShare] = await vault.positionInfo('1');
      expect(bobHealth).to.be.bignumber.gt(ethers.utils.parseEther('20')); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('10').toString(),
        bobDebtToShare.toString(),
      );

      // Check Alice position info
      [aliceHealth, aliceDebtToShare] = await vault.positionInfo('2');
      expect(aliceHealth).to.be.bignumber.gt(ethers.utils.parseEther('3')); // Get Reward and increase health
      AssertHelpers.assertAlmostEqual(
        ethers.utils.parseEther('2').toString(),
        aliceDebtToShare.toString(),
      );

      // Bob think he made enough. He now wants to close position partially.
      const bobBefore = await baseToken.balanceOf(await bob.getAddress());
      const [bobHealthBefore, ] = await vault.positionInfo('1');
      const lpUnderBobPosition = await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1));
      [workerLPBefore, workerDebtBefore] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      // Bob close his position 50%
      await vaultAsBob.work(
        1,
        waultSwapWorker.address,
        '0',
        '0',
        ethers.utils.parseEther('5'),
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [partialCloseStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256'],
            [lpUnderBobPosition.div(2), '0'])
          ]
        )
      );
      const bobAfter = await baseToken.balanceOf(await bob.getAddress());

      // After Bob liquidate half of his position which worth
      // 14.62878631929428108 BTOKEN (price impact+trading fee included)
      // Bob returns 5 BTOKEN to payback the debt hence; He should be
      // 14.62878631929428108 - 5 = 9.62878631929 BTOKEN richer
      AssertHelpers.assertAlmostEqual(
        bobAfter.toString(),
        bobBefore.add(ethers.utils.parseEther('9.62878631929')).toString(),
      );
      // Check Bob position info
      [bobHealth, bobDebtToShare] = await vault.positionInfo('1');
      // Bob's health after partial close position must be 50% less than before
      // due to he exit half of lp under his position
      expect(bobHealth).to.be.bignumber.lt(bobHealthBefore.div(2));
      // Bob's debt should be left only 5 BTOKEN due he said he wants to return at max 5 BTOKEN
      expect(bobDebtToShare).to.be.bignumber.eq(ethers.utils.parseEther('5'));
      // Check LP deposited by Worker on wexMaster
      [workerLPAfter, workerDebtAfter] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      // LP tokens of worker should be decreased by lpUnderBobPosition/2
      // due to Bob execute StrategyClosePartialLiquidate
      expect(workerLPAfter).to.be.bignumber.eq(workerLPBefore.sub(lpUnderBobPosition.div(2)));
    }).timeout(50000);

    it('should partially close position successfully, when maxReturn > liquidated amount and liquidated amount > debt', async () => {
      // Set Bank's debt interests to 0% per year
      await simpleVaultConfig.setParams(
        ethers.utils.parseEther('1'), // 1 BTOKEN min debt size,
        '0', // 0% per year
        '1000', // 10% reserve pool
        '300', // 10% Kill prize
        wbnb.address,
        wNativeRelayer.address,
        fairLaunch.address,
        KILL_TREASURY_BPS,
        await deployer.getAddress(),
      );

      // Bob deposits 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
      await vaultAsBob.deposit(ethers.utils.parseEther('10'));

      // Position#1: Bob borrows 10 BTOKEN loan
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'))
      await vaultAsBob.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('10'),
        ethers.utils.parseEther('10'),
        '0', // max return = 0, don't return BTOKEN to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );

      // Bob think he made enough. He now wants to close position partially.
      // He close 50% of his position and return all debt
      const bobBefore = await baseToken.balanceOf(await bob.getAddress());
      const [bobHealthBefore, ] = await vault.positionInfo('1');
      const lpUnderBobPosition = await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1));
      const [workerLPBefore,] = await wexMaster.userInfo(poolId, waultSwapWorker.address);

      // Bob closes position with maxReturn 5,000,000,000 and liquidate half of his position
      // Expect that Bob will close position successfully and his debt must be reduce as liquidated amount pay debt
      await vaultAsBob.work(
        1,
        waultSwapWorker.address,
        '0',
        '0',
        ethers.utils.parseEther('5000000000'),
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [partialCloseStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256'],
            [lpUnderBobPosition.div(2), '0'])
          ]
        )
      );

      const bobAfter = await baseToken.balanceOf(await bob.getAddress());

      // After Bob liquidate half of his position which worth
      // swapAmount = 13.200430549066301204 BTOKEN (price impact+trading fee included)
      // Bob wish to return 5,000,000,000 BTOKEN (when maxReturn > debt, return all debt)
      // The following criteria must be stratified:
      // - Bob should get 13.200430549066301204 - 10 = 3.200430549066301204 BTOKEN back.
      // - Bob's position debt must be 0
      expect(
        bobBefore.add(ethers.utils.parseEther('3.200430549066301204')),
        "Expect BTOKEN in Bob's account after close position to increase by ~3.20 BTOKEN").to.be.bignumber.eq(bobAfter)
      // Check Bob position info
      const [bobHealth, bobDebtVal] = await vault.positionInfo('1');
      // Bob's health after partial close position must be 50% less than before
      // due to he exit half of lp under his position
      expect(bobHealth).to.be.bignumber.lt(bobHealthBefore.div(2));
      // Bob's debt should be 0 BTOKEN due he said he wants to return at max 5,000,000,000 BTOKEN (> debt, return all debt)
      expect(bobDebtVal).to.be.bignumber.eq('0');
      // Check LP deposited by Worker on wexMaster
      const [workerLPAfter,] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      // LP tokens of worker should be decreased by lpUnderBobPosition/2
      // due to Bob execute StrategyClosePartialLiquidate
      expect(workerLPAfter).to.be.bignumber.eq(workerLPBefore.sub(lpUnderBobPosition.div(2)));
    }).timeout(50000);

    it('should revert when partial close position made leverage higher than work factor', async () => {
      // Set Bank's debt interests to 0% per year
      await simpleVaultConfig.setParams(
        ethers.utils.parseEther('1'), // 1 BTOKEN min debt size,
        '0', // 0% per year
        '1000', // 10% reserve pool
        '1000', // 10% Kill prize
        wbnb.address,
        wNativeRelayer.address,
        fairLaunch.address,
        KILL_TREASURY_BPS,
        await deployer.getAddress(),
      );

      // Bob deposits 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
      await vaultAsBob.deposit(ethers.utils.parseEther('10'));

      // Position#1: Bob borrows 10 BTOKEN loan
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'))
      await vaultAsBob.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('10'),
        ethers.utils.parseEther('10'),
        '0', // max return = 0, don't return BTOKEN to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );

      // Bob think he made enough. He now wants to close position partially.
      // He liquidate all of his position but not payback the debt.
      const lpUnderBobPosition = await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1));
      // Bob closes position with maxReturn 5,000,000,000 and liquidate half of his position
      // Expect that Bob will not be able to close his position as he liquidate all underlying assets but not paydebt
      // which made his position debt ratio higher than allow work factor
      await expect(vaultAsBob.work(
        1,
        waultSwapWorker.address,
        '0',
        '0',
        '0',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [partialCloseStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256'],
            [lpUnderBobPosition, '0'])
          ]
        )
      )).revertedWith("Vault::work:: bad work factor");
    }).timeout(50000);

    it('should not allow to partially close position, when returnLpAmount > LpUnderPosition', async () => {
      // Set Bank's debt interests to 0% per year
      await simpleVaultConfig.setParams(
        ethers.utils.parseEther('1'), // 1 BTOKEN min debt size,
        '0', // 0% per year
        '1000', // 10% reserve pool
        '1000', // 10% Kill prize
        wbnb.address,
        wNativeRelayer.address,
        fairLaunch.address,
        KILL_TREASURY_BPS,
        await deployer.getAddress(),
      );

      // Bob deposits 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
      await vaultAsBob.deposit(ethers.utils.parseEther('10'));

      // Position#1: Bob borrows 10 BTOKEN loan
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'))
      await vaultAsBob.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('10'),
        ethers.utils.parseEther('10'),
        '0', // max return = 0, don't return NATIVE to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );

      // Bob think he made enough. He now wants to close position partially. However, his input is invalid.
      // He put returnLpAmount > Lp that is under his position
      const lpUnderBobPosition = await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1));
      // Transaction should be revert due to Bob is asking contract to liquidate Lp amount > Lp that is under his position
      await expect(vaultAsBob.work(
        1,
        waultSwapWorker.address,
        '0',
        '0',
        ethers.utils.parseEther('10'),
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [partialCloseStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256'],
            [lpUnderBobPosition.mul(2), '0'])
          ]
        )
      )).to.be.revertedWith('StrategyPartialCloseLiquidate::execute:: insufficient LP amount recevied from worker');
    }).timeout(50000);

    it('should partially close minimize trading position successfully, when maxReturn < liquidated amount, payback part of the debt', async () => {
      // Set Bank's debt interests to 0% per year
      await simpleVaultConfig.setParams(
        ethers.utils.parseEther('1'), // 1 BTOKEN min debt size,
        '0', // 0% per year
        '1000', // 10% reserve pool
        '1000', // 10% Kill prize
        wbnb.address,
        wNativeRelayer.address,
        fairLaunch.address,
        KILL_TREASURY_BPS,
        await deployer.getAddress(),
      );

      // Bob deposits 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
      await vaultAsBob.deposit(ethers.utils.parseEther('10'));

      // Position#1: Bob borrows 10 BTOKEN loan
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'))
      await vaultAsBob.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('10'),
        ethers.utils.parseEther('10'),
        '0', // max return = 0, don't return BTOKEN to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );

      // Bob think he made enough. He now wants to close position partially minimize trading.
      // He close 50% of his position and return all debt
      const bobBTokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFTokenBefore = await farmToken.balanceOf(await bob.getAddress());
      const [bobHealthBefore, ] = await vault.positionInfo('1');
      const lpUnderBobPosition = await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1));
      const [workerLPBefore,] = await wexMaster.userInfo(poolId, waultSwapWorker.address);

      // Bob closes position with maxReturn 5 BTOKEN and liquidate half of his position
      // Expect that Bob will close position successfully and his debt must be reduce as liquidated amount pay debt
      await vaultAsBob.work(
        1,
        waultSwapWorker.address,
        '0',
        '0',
        ethers.utils.parseEther('5'),
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [partialCloseMinimizeStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256', 'uint256'],
            [lpUnderBobPosition.div(2), ethers.utils.parseEther('10'), '0'])
          ]
        )
      );
      const bobBTokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobFTokenAfter = await farmToken.balanceOf(await bob.getAddress());
      // After Bob liquidate half of his position which worth
      // 10 BTOKEN + 0.029130343017579222 FTOKEN (price impact+trading fee included)
      // Bob returns 5 BTOKEN to payback the debt hence; He should be
      // The following criteria must be stratified:
      // - Bob should get 10 - 5 = 5 BTOKEN back.
      // - Bob should get 0.29130343017579222 FTOKEN back.
      // - Bob's position debt must be 5 BTOKEN
      expect(bobBTokenBefore.add(ethers.utils.parseEther('5'))).to.be.bignumber.eq(bobBTokenAfter)
      expect(
        bobFTokenBefore.add(ethers.utils.parseEther('0.029130343017579222')),
        "Expect BTOKEN in Bob's account after close position to increase by ~0.029 FTOKEN").to.be.bignumber.eq(bobFTokenAfter)
      // Check Bob position info
      const [bobHealth, bobDebtVal] = await vault.positionInfo('1');
      // Bob's health after partial close position must be 50% less than before
      // due to he exit half of lp under his position
      expect(bobHealth).to.be.bignumber.lt(bobHealthBefore.div(2));
      // Bob's debt should be left only 5 BTOKEN due he said he wants to return at max 5 BTOKEN
      expect(bobDebtVal).to.be.bignumber.eq(ethers.utils.parseEther('5'));
      // Check LP deposited by Worker on wexMaster
      const [workerLPAfter,] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      // LP tokens of worker should be decreased by lpUnderBobPosition/2
      // due to Bob execute StrategyClosePartialLiquidate
      expect(workerLPAfter).to.be.bignumber.eq(workerLPBefore.sub(lpUnderBobPosition.div(2)));
    }).timeout(50000);

    it('should partially close minimize trading position successfully, when maxReturn > liquidated amount and liquidated amount > debt', async () => {
      // Set Bank's debt interests to 0% per year
      await simpleVaultConfig.setParams(
        ethers.utils.parseEther('1'), // 1 BTOKEN min debt size,
        '0', // 0% per year
        '1000', // 10% reserve pool
        '1000', // 10% Kill prize
        wbnb.address,
        wNativeRelayer.address,
        fairLaunch.address,
        KILL_TREASURY_BPS,
        await deployer.getAddress(),
      );

      // Bob deposits 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
      await vaultAsBob.deposit(ethers.utils.parseEther('10'));

      // Position#1: Bob borrows 10 BTOKEN loan
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'))
      await vaultAsBob.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('10'),
        ethers.utils.parseEther('10'),
        '0', // max return = 0, don't return BTOKEN to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );

      // Bob think he made enough. He now wants to close position partially minimize trading.
      // He close 50% of his position and return all debt
      const bobBTokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFTokenBefore = await farmToken.balanceOf(await bob.getAddress());
      const [bobHealthBefore, ] = await vault.positionInfo('1');
      const lpUnderBobPosition = await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1));
      const [workerLPBefore,] = await wexMaster.userInfo(poolId, waultSwapWorker.address);

      // Bob closes position with maxReturn 5,000,000,000 and liquidate half of his position
      // Expect that Bob will close position successfully and his debt must be reduce as liquidated amount pay debt
      await vaultAsBob.work(
        1,
        waultSwapWorker.address,
        '0',
        '0',
        ethers.utils.parseEther('5000000000'),
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [partialCloseMinimizeStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256', 'uint256'],
            [lpUnderBobPosition.div(2), ethers.utils.parseEther('10'), '0'])
          ]
        )
      );
      const bobBTokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobFTokenAfter = await farmToken.balanceOf(await bob.getAddress());
      // After Bob liquidate half of his position which worth
      // 10 BTOKEN + 0.029130343017579222 FTOKEN (price impact+trading fee included)
      // Bob wish to return 5,000,000,000 BTOKEN (when maxReturn > debt, return all debt) 
      // The following criteria must be stratified:
      // - Bob should get 10 - 10 = 0 BTOKEN back.
      // - Bob should get 0.029130343017579222 FTOKEN back.
      // - Bob's position debt must be 0
      expect(bobBTokenBefore).to.be.bignumber.eq(bobBTokenAfter)
      expect(
        bobFTokenBefore.add(ethers.utils.parseEther('0.029130343017579222')),
        "Expect BTOKEN in Bob's account after close position to increase by ~0.029 FTOKEN").to.be.bignumber.eq(bobFTokenAfter)
      // Check Bob position info
      const [bobHealth, bobDebtVal] = await vault.positionInfo('1');
      // Bob's health after partial close position must be 50% less than before
      // due to he exit half of lp under his position
      expect(bobHealth).to.be.bignumber.lt(bobHealthBefore.div(2));
      // Bob's debt should be 0 BTOKEN due he said he wants to return at max 5,000,000,000 BTOKEN (> debt, return all debt)
      expect(bobDebtVal).to.be.bignumber.eq('0');
      // Check LP deposited by Worker on wexMaster
      const [workerLPAfter,] = await wexMaster.userInfo(poolId, waultSwapWorker.address);
      // LP tokens of worker should be decreased by lpUnderBobPosition/2
      // due to Bob execute StrategyClosePartialLiquidate
      expect(workerLPAfter).to.be.bignumber.eq(workerLPBefore.sub(lpUnderBobPosition.div(2)));
    }).timeout(50000);
    it('should revert when partial close minimize trading position made leverage higher than work factor', async () => {
      // Set Bank's debt interests to 0% per year
      await simpleVaultConfig.setParams(
        ethers.utils.parseEther('1'), // 1 BTOKEN min debt size,
        '0', // 0% per year
        '1000', // 10% reserve pool
        '1000', // 10% Kill prize
        wbnb.address,
        wNativeRelayer.address,
        fairLaunch.address,
        KILL_TREASURY_BPS,
        await deployer.getAddress(),
      );

      // Bob deposits 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
      await vaultAsBob.deposit(ethers.utils.parseEther('10'));

      // Position#1: Bob borrows 10 BTOKEN loan
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'))
      await vaultAsBob.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('10'),
        ethers.utils.parseEther('10'),
        '0', // max return = 0, don't return BTOKEN to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );

      // Bob think he made enough. He now wants to close position partially minimize trading.
      // He liquidate half of his position but not payback the debt.
      const lpUnderBobPosition = await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1));
      // Bob closes position with maxReturn 0 and liquidate half of his position
      // Expect that Bob will not be able to close his position as he liquidate underlying assets but not paydebt
      // which made his position debt ratio higher than allow work factor
      await expect(vaultAsBob.work(
        1,
        waultSwapWorker.address,
        '0',
        '0',
        '0',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [partialCloseMinimizeStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256', 'uint256'],
            [lpUnderBobPosition.div(2), '0', '0'])
          ]
        )
      )).revertedWith("Vault::work:: bad work factor");
    }).timeout(50000);

    it('should not allow to partially close minimize trading position, when toRepaidBaseTokenDebt > debt', async () => {
      // Set Bank's debt interests to 0% per year
      await simpleVaultConfig.setParams(
        ethers.utils.parseEther('1'), // 1 BTOKEN min debt size,
        '0', // 0% per year
        '1000', // 10% reserve pool
        '1000', // 10% Kill prize
        wbnb.address,
        wNativeRelayer.address,
        fairLaunch.address,
        KILL_TREASURY_BPS,
        await deployer.getAddress(),
      );

      // Bob deposits 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
      await vaultAsBob.deposit(ethers.utils.parseEther('10'));

      // Position#1: Bob borrows 10 BTOKEN loan
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'))
      await vaultAsBob.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('10'),
        ethers.utils.parseEther('10'),
        '0', // max return = 0, don't return NATIVE to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );

      // Bob think he made enough. He now wants to close position partially. However, his input is invalid.
      const lpUnderBobPosition = await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1));
      await expect(vaultAsBob.work(
        1,
        waultSwapWorker.address,
        '0',
        '0',
        ethers.utils.parseEther('10'),
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [partialCloseMinimizeStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256', 'uint256'],
            [lpUnderBobPosition, ethers.utils.parseEther('20'), '0'])
          ]
        )
      )).to.be.revertedWith('WaultSwapRestrictedStrategyPartialCloseMinimizeTrading::execute:: amount to repay debt is greater than debt');
    }).timeout(50000);
    
    it('should not allow to partially close minimize trading position, when returnLpAmount > LpUnderPosition', async () => {
      // Set Bank's debt interests to 0% per year
      await simpleVaultConfig.setParams(
        ethers.utils.parseEther('1'), // 1 BTOKEN min debt size,
        '0', // 0% per year
        '1000', // 10% reserve pool
        '1000', // 10% Kill prize
        wbnb.address,
        wNativeRelayer.address,
        fairLaunch.address,
        KILL_TREASURY_BPS,
        await deployer.getAddress(),
      );

      // Bob deposits 10 BTOKEN
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
      await vaultAsBob.deposit(ethers.utils.parseEther('10'));

      // Position#1: Bob borrows 10 BTOKEN loan
      await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'))
      await vaultAsBob.work(
        0,
        waultSwapWorker.address,
        ethers.utils.parseEther('10'),
        ethers.utils.parseEther('10'),
        '0', // max return = 0, don't return NATIVE to the debt
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0'])
          ]
        ),
      );

      // Bob think he made enough. He now wants to close position partially. However, his input is invalid.
      // He put returnLpAmount > Lp that is under his position
      const lpUnderBobPosition = await waultSwapWorker.shareToBalance(await waultSwapWorker.shares(1));
      // Transaction should be revert due to Bob is asking contract to liquidate Lp amount > Lp that is under his position
      await expect(vaultAsBob.work(
        1,
        waultSwapWorker.address,
        '0',
        '0',
        ethers.utils.parseEther('10'),
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [partialCloseMinimizeStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256', 'uint256'],
            [lpUnderBobPosition.mul(2), '0', '0'])
          ]
        )
      )).to.be.revertedWith('WaultSwapRestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient LP amount recevied from worker');
    }).timeout(50000);
  })
});