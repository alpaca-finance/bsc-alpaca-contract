import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet, constants } from "ethers";
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
  MockContractContext,
  MockContractContext__factory,
  MockERC20,
  MockERC20__factory,
  MockWBNB,
  MockWBNB__factory,
  PancakeFactory,
  PancakeFactory__factory,
  PancakeMasterChef,
  PancakeMasterChef__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouterV2,
  PancakeRouterV2__factory,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedStrategyLiquidate,
  PancakeswapV2RestrictedStrategyLiquidate__factory,
  PancakeswapV2RestrictedStrategyPartialCloseLiquidate,
  PancakeswapV2RestrictedStrategyPartialCloseLiquidate__factory,
  PancakeswapV2Worker,
  PancakeswapV2Worker__factory,
  PancakeswapV2Worker02,
  PancakeswapV2Worker02__factory,
  SimpleVaultConfig,
  SimpleVaultConfig__factory,
  SyrupBar,
  SyrupBar__factory,
  Timelock,
  Timelock__factory,
  Vault,
  Vault__factory,
  WNativeRelayer,
  WNativeRelayer__factory,
} from "../typechain";
import * as AssertHelpers from "./helpers/assert"
import * as TimeHelpers from "./helpers/time"
import { parseEther } from "ethers/lib/utils";
import exp from "node:constants";

chai.use(solidity);
const { expect } = chai;

describe('Vault - PancakeswapV202', () => {
  const FOREVER = '2000000000';
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther('5000');
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther('0.076');
  const REINVEST_BOUNTY_BPS = '100'; // 1% reinvest bounty
  const RESERVE_POOL_BPS = '1000'; // 10% reserve pool
  const KILL_PRIZE_BPS = '1000'; // 10% Kill prize
  const INTEREST_RATE = '3472222222222'; // 30% per year
  const MIN_DEBT_SIZE = ethers.utils.parseEther('1'); // 1 BTOKEN min debt size
  const WORK_FACTOR = '7000';
  const KILL_FACTOR = '8000';
  const MAX_REINVEST_BOUNTY: string = '500'
  const DEPLOYER = '0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51';
  const BENEFICIALVAULT_BOUNTY_BPS = '1000'
  const REINVEST_THRESHOLD = ethers.utils.parseEther('1') // If pendingCake > 1 $CAKE, then reinvest

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
  let liqStrat: PancakeswapV2RestrictedStrategyLiquidate;
  let partialCloseStrat: PancakeswapV2RestrictedStrategyPartialCloseLiquidate;

  /// Vault-related instance(s)
  let simpleVaultConfig: SimpleVaultConfig;
  let wNativeRelayer: WNativeRelayer;
  let vault: Vault;

  /// FairLaunch-related instance(s)
  let fairLaunch: FairLaunch;
  let alpacaToken: AlpacaToken;

  /// PancakeswapMasterChef-related instance(s)
  let masterChef: PancakeMasterChef;
  let poolId: number;
  let pancakeswapV2Worker: PancakeswapV2Worker02;
  let pancakeswapV2Worker01: PancakeswapV2Worker

  /// Timelock instance(s)
  let whitelistedContract: MockContractContext;
  let evilContract: MockContractContext;

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

  let pancakeMasterChefAsAlice: PancakeMasterChef;
  let pancakeMasterChefAsBob: PancakeMasterChef;

  let pancakeswapV2WorkerAsEve: PancakeswapV2Worker02;
  let pancakeswapV2Worker01AsEve: PancakeswapV2Worker;

  let vaultAsAlice: Vault;
  let vaultAsBob: Vault;
  let vaultAsEve: Vault;

  beforeEach(async () => {
    [deployer, alice, bob, eve] = await ethers.getSigners();

    // Setup Timelock
    const MockContractContext = (await ethers.getContractFactory(
      "MockContractContext",
      deployer
    )) as MockContractContext__factory
    whitelistedContract = await MockContractContext.deploy()
    await whitelistedContract.deployed()
    evilContract = await MockContractContext.deploy()
    await evilContract.deployed()

    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory(
      "PancakeFactory",
      deployer
    )) as PancakeFactory__factory;
    factoryV2 = await PancakeFactory.deploy((await deployer.getAddress()));
    await factoryV2.deployed();

    const WBNB = (await ethers.getContractFactory(
      "MockWBNB",
      deployer
    )) as MockWBNB__factory;
    wbnb = await WBNB.deploy();
    await factoryV2.deployed();

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
    await baseToken.mint(await deployer.getAddress(), ethers.utils.parseEther('1000'));
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther('1000'));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther('1000'));
    farmToken = await upgrades.deployProxy(MockERC20, ['FTOKEN', 'FTOKEN']) as MockERC20;
    await farmToken.deployed();
    await farmToken.mint(await deployer.getAddress(), ethers.utils.parseEther('1000'))
    await farmToken.mint(await alice.getAddress(), ethers.utils.parseEther('1000'));
    await farmToken.mint(await bob.getAddress(), ethers.utils.parseEther('1000'));

    const CakeToken = (await ethers.getContractFactory(
      "CakeToken",
      deployer
    )) as CakeToken__factory;
    cake = await CakeToken.deploy();
    await cake.deployed();
    await cake["mint(address,uint256)"](await deployer.getAddress(), ethers.utils.parseEther('100'));

    const SyrupBar = (await ethers.getContractFactory(
      "SyrupBar",
      deployer
    )) as SyrupBar__factory;
    syrup = await SyrupBar.deploy(cake.address);
    await syrup.deployed();

    /// Setup BTOKEN-FTOKEN pair on Pancakeswap
    await factoryV2.createPair(baseToken.address, farmToken.address);
    lp = PancakePair__factory.connect(await factoryV2.getPair(farmToken.address, baseToken.address), deployer);
    await lp.deployed();

    /// Setup strategy
    const PancakeswapV2RestrictedStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyAddBaseTokenOnly",
      deployer
    )) as PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory;
    addStrat = await upgrades.deployProxy(PancakeswapV2RestrictedStrategyAddBaseTokenOnly, [routerV2.address]) as PancakeswapV2RestrictedStrategyAddBaseTokenOnly
    await addStrat.deployed();

    const PancakeswapV2RestrictedStrategyLiquidate = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyLiquidate",
      deployer
    )) as PancakeswapV2RestrictedStrategyLiquidate__factory;
    liqStrat = await upgrades.deployProxy(PancakeswapV2RestrictedStrategyLiquidate, [routerV2.address]) as PancakeswapV2RestrictedStrategyLiquidate;
    await liqStrat.deployed();

    const PancakeswapV2RestrictedStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyPartialCloseLiquidate",
      deployer
    )) as PancakeswapV2RestrictedStrategyPartialCloseLiquidate__factory;
    partialCloseStrat = await upgrades.deployProxy(
        PancakeswapV2RestrictedStrategyPartialCloseLiquidate, [routerV2.address]) as PancakeswapV2RestrictedStrategyPartialCloseLiquidate
    await partialCloseStrat.deployed();

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
      wbnb.address, wNativeRelayer.address, fairLaunch.address
    ]) as SimpleVaultConfig;
    await simpleVaultConfig.deployed();

    // whitelisted contract to be able to call work
    await simpleVaultConfig.setWhitelistedCallers([whitelistedContract.address], true)

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
    await masterChef.add(1, lp.address, true);

    /// Setup PancakeswapV2Worker02
    poolId = 1;
    const PancakeswapV2Worker02 = (await ethers.getContractFactory(
      "PancakeswapV2Worker02",
      deployer,
    )) as PancakeswapV2Worker02__factory;
    pancakeswapV2Worker = await upgrades.deployProxy(PancakeswapV2Worker02, [
      vault.address,
      baseToken.address,
      masterChef.address,
      routerV2.address,
      poolId,
      addStrat.address,
      liqStrat.address,
      REINVEST_BOUNTY_BPS,
      DEPLOYER,
      [cake.address, wbnb.address, baseToken.address],
      0
    ]) as PancakeswapV2Worker02
    await pancakeswapV2Worker.deployed();

    const PancakeswapV2Worker = (await ethers.getContractFactory(
      "PancakeswapV2Worker",
      deployer,
    )) as PancakeswapV2Worker02__factory;
    pancakeswapV2Worker01 = await upgrades.deployProxy(PancakeswapV2Worker, [
      vault.address, baseToken.address, masterChef.address, routerV2.address, poolId, addStrat.address, liqStrat.address, REINVEST_BOUNTY_BPS
    ]) as PancakeswapV2Worker
    await pancakeswapV2Worker01.deployed();


    await simpleVaultConfig.setWorker(pancakeswapV2Worker.address, true, true, WORK_FACTOR, KILL_FACTOR);
    await simpleVaultConfig.setWorker(pancakeswapV2Worker01.address, true, true, WORK_FACTOR, KILL_FACTOR);
    await pancakeswapV2Worker.setStrategyOk([partialCloseStrat.address], true);
    await pancakeswapV2Worker.setReinvestorOk([await eve.getAddress()], true);
    await pancakeswapV2Worker.setTreasuryAccount(await eve.getAddress())
    await pancakeswapV2Worker.setTreasuryBountyBps(REINVEST_BOUNTY_BPS)
    await pancakeswapV2Worker01.setStrategyOk([partialCloseStrat.address], true);
    await pancakeswapV2Worker01.setReinvestorOk([await eve.getAddress()], true);
    
    await addStrat.setWorkersOk([pancakeswapV2Worker.address, pancakeswapV2Worker01.address], true)
    await liqStrat.setWorkersOk([pancakeswapV2Worker.address, pancakeswapV2Worker01.address], true)
    await partialCloseStrat.setWorkersOk([pancakeswapV2Worker.address, pancakeswapV2Worker01.address], true)

    // Deployer adds 0.1 FTOKEN + 1 BTOKEN
    await baseToken.approve(routerV2.address, ethers.utils.parseEther('1'));
    await farmToken.approve(routerV2.address, ethers.utils.parseEther('0.1'));

    await routerV2.addLiquidity(
      baseToken.address, farmToken.address,
      ethers.utils.parseEther('1'), ethers.utils.parseEther('0.1'),
      '0', '0', await deployer.getAddress(), FOREVER);

    // Deployer adds 0.1 CAKE + 1 NATIVE
    await cake.approve(routerV2.address, ethers.utils.parseEther('1'));
    await routerV2.addLiquidityETH(
      cake.address, ethers.utils.parseEther('0.1'),
      '0', '0', await deployer.getAddress(), FOREVER, { value: ethers.utils.parseEther('1') });

    // Deployer adds 1 BTOKEN + 1 NATIVE
    await baseToken.approve(routerV2.address, ethers.utils.parseEther('1'));
    await routerV2.addLiquidityETH(
      baseToken.address, ethers.utils.parseEther('1'),
      '0', '0', await deployer.getAddress(), FOREVER, { value: ethers.utils.parseEther('1') });

    // Contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    lpAsAlice = PancakePair__factory.connect(lp.address, alice);
    lpAsBob = PancakePair__factory.connect(lp.address, bob);

    fairLaunchAsAlice = FairLaunch__factory.connect(fairLaunch.address, alice);

    pancakeMasterChefAsAlice = PancakeMasterChef__factory.connect(masterChef.address, alice);
    pancakeMasterChefAsBob = PancakeMasterChef__factory.connect(masterChef.address, bob);

    vaultAsAlice = Vault__factory.connect(vault.address, alice);
    vaultAsBob = Vault__factory.connect(vault.address, bob);
    vaultAsEve = Vault__factory.connect(vault.address, eve);

    pancakeswapV2WorkerAsEve = PancakeswapV2Worker02__factory.connect(pancakeswapV2Worker.address, eve);
    pancakeswapV2Worker01AsEve = PancakeswapV2Worker__factory.connect(pancakeswapV2Worker01.address, eve);
  });

  context('when update Vault\'s params', async() => {
    it('should revert when new debtToken is token', async() => {
      await expect(vault.updateDebtToken(baseToken.address, 1)).to.be.revertedWith('Vault::updateDebtToken:: _debtToken must not be the same as token')
    })
  })

  context('when worker is initialized', async() => {
    it('should has FTOKEN as a farmingToken in PancakeswapWorker', async() => {
      expect(await pancakeswapV2Worker.farmingToken()).to.be.equal(farmToken.address);
    });

    it('should initialized the correct fee and feeDenom', async() => {
      expect(await pancakeswapV2Worker.fee()).to.be.bignumber.eq('9975');
      expect(await pancakeswapV2Worker.feeDenom()).to.be.bignumber.eq('10000');
    });

    it('should give rewards out when you stake LP tokens', async() => {
      // Deployer sends some LP tokens to Alice and Bob
      await lp.transfer(await alice.getAddress(), ethers.utils.parseEther('0.05'));
      await lp.transfer(await bob.getAddress(), ethers.utils.parseEther('0.05'));

      // Alice and Bob stake 0.01 LP tokens and waits for 1 day
      await lpAsAlice.approve(masterChef.address, ethers.utils.parseEther('0.01'));
      await lpAsBob.approve(masterChef.address, ethers.utils.parseEther('0.02'));
      await pancakeMasterChefAsAlice.deposit(poolId, ethers.utils.parseEther('0.01'));
      await pancakeMasterChefAsBob.deposit(poolId, ethers.utils.parseEther('0.02')); // alice +1 Reward

      // Alice and Bob withdraw stake from the pool
      await pancakeMasterChefAsBob.withdraw(poolId, ethers.utils.parseEther('0.02')); // alice +1/3 Reward  Bob + 2/3 Reward
      await pancakeMasterChefAsAlice.withdraw(poolId, ethers.utils.parseEther('0.01')); // alice +1 Reward

      AssertHelpers.assertAlmostEqual(
        (await cake.balanceOf(await alice.getAddress())).toString(),
        (CAKE_REWARD_PER_BLOCK.mul(ethers.BigNumber.from(7)).div(ethers.BigNumber.from(3))).toString(),
      );
      AssertHelpers.assertAlmostEqual(
        (await cake.balanceOf(await bob.getAddress())).toString(),
        (CAKE_REWARD_PER_BLOCK.mul(2).div(3)).toString(),
      );
    });
  });

  context('when owner is setting worker', async() => {
    it('should set reinvest config correctly', async() => {
      await expect(pancakeswapV2Worker.setReinvestConfig(
        250, ethers.utils.parseEther('1'), [cake.address, baseToken.address]
      )).to.be.emit(pancakeswapV2Worker, 'SetReinvestConfig')
        .withArgs(await deployer.getAddress(), 250, ethers.utils.parseEther('1'), [cake.address, baseToken.address])
      expect(await pancakeswapV2Worker.reinvestBountyBps()).to.be.bignumber.eq(250);
      expect(await pancakeswapV2Worker.reinvestThreshold()).to.be.bignumber.eq(ethers.utils.parseEther('1'))
      expect(await pancakeswapV2Worker.getReinvestPath()).to.deep.eq([cake.address, baseToken.address])
    });

    it('should set max reinvest bounty', async() => {
      await pancakeswapV2Worker.setMaxReinvestBountyBps(200)
      expect(await pancakeswapV2Worker.maxReinvestBountyBps()).to.be.eq(200)
    });

    it('should successfully set a treasury account', async() => {
      const aliceAddr = await alice.getAddress()
      await pancakeswapV2Worker.setTreasuryAccount(aliceAddr);
      expect(await pancakeswapV2Worker.treasuryAccount()).to.eq(aliceAddr)
    })

    context('when treasury bounty > max reinvest bounty', async () => {
      it('should revert', async() => {
        await expect(
          pancakeswapV2Worker.setTreasuryBountyBps(parseInt(MAX_REINVEST_BOUNTY) + 1)
        ).to.revertedWith('PancakeswapV2Worker02::setTreasuryBountyBps:: _treasuryBountyBps exceeded maxReinvestBountyBps');
        expect(await pancakeswapV2Worker.treasuryBountyBps()).to.eq(REINVEST_BOUNTY_BPS)
      })
    })

    context('when treasury bounty <= max reinvest bounty', async () => {
      it('should successfully set a treasury bounty', async() => {
        await pancakeswapV2Worker.setTreasuryBountyBps(499);
        expect(await pancakeswapV2Worker.treasuryBountyBps()).to.eq(499)
      })
    })

    
    it('should revert when owner set reinvestBountyBps > max', async() => {
      await expect(
        pancakeswapV2Worker.setReinvestConfig(1000, '0', [cake.address, baseToken.address])
      ).to.be.revertedWith('PancakeswapV2Worker02::setReinvestConfig:: _reinvestBountyBps exceeded maxReinvestBountyBps');
      expect(await pancakeswapV2Worker.reinvestBountyBps()).to.be.bignumber.eq(100);
    });

    it('should revert when owner set reinvest path that doesn\'t start with $CAKE and end with $BTOKN', async() => {
      await expect(
        pancakeswapV2Worker.setReinvestConfig(200, '0', [baseToken.address, cake.address])
      ).to.be.revertedWith('PancakeswapV2Worker02::setReinvestConfig:: reinvestPath must start with CAKE, end with BTOKEN')
    })

    it('should set strat ok', async() => {
      await pancakeswapV2Worker.setStrategyOk([await alice.getAddress()], true);
      expect(await pancakeswapV2Worker.okStrats(await alice.getAddress())).to.be.eq(true);
    });
  });

  context('when user uses LYF', async() => {
    context('when user is contract', async() => {
      it('should revert if evil contract try to call onlyEOAorWhitelisted function', async () => {           
        await expect(evilContract.executeTransaction(
          vault.address, 0,
          "work(uint256,address,uint256,uint256,uint256,bytes)",
          ethers.utils.defaultAbiCoder.encode(
            ['uint256','address','uint256','uint256','uint256','bytes'],
            [0, pancakeswapV2Worker.address, ethers.utils.parseEther('0.3'), '0', '0',
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes'],
                [addStrat.address, ethers.utils.defaultAbiCoder.encode(
                  ['uint256'],
                  ['0']
                )]
            )]
          )
        )).to.be.revertedWith("Vault::onlyEOAorWhitelisted:: not eoa")
      })

      it('should allow whitelisted contract to open position without debt', async () => {
        // Deployer deposit 3 BTOKEN to the vault
        await baseToken.approve(vault.address, ethers.utils.parseEther('3'))
        await vault.deposit(ethers.utils.parseEther('3'))

        // Deployer funds whitelisted contract
        await baseToken.transfer(whitelistedContract.address, ethers.utils.parseEther('1'))

        // whitelisted contract approve Alpaca to to take BTOKEN
        await whitelistedContract.executeTransaction(
          baseToken.address, '0',
          'approve(address,uint256)',
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256'],
            [vault.address, ethers.utils.parseEther('0.3')]
          )
        )
        expect(await baseToken.allowance(whitelistedContract.address, vault.address))
          .to.be.eq(ethers.utils.parseEther('0.3'))
        
        // whitelisted contract should able to open position with 0 debt
        await whitelistedContract.executeTransaction(
          vault.address, 0,
          "work(uint256,address,uint256,uint256,uint256,bytes)",
          ethers.utils.defaultAbiCoder.encode(
            ['uint256','address','uint256','uint256','uint256','bytes'],
            [0, pancakeswapV2Worker.address, ethers.utils.parseEther('0.3'), '0', '0',
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes'],
                [addStrat.address, ethers.utils.defaultAbiCoder.encode(
                  ['uint256'],
                  ['0']
                )]
            )]
          )
        )

        const [worker, owner ] = await vault.positions(1)
        expect(owner).to.be.eq(whitelistedContract.address)
        expect(worker).to.be.eq(pancakeswapV2Worker.address)
      })
    })
    
    context('when user is EOA', async() => {
      context("When the treasury Account and treasury bounty bps haven't been set", async () => {
        it('should use reinvestBountyBps and deployer account', async () => {
          await pancakeswapV2Worker.setTreasuryAccount(constants.AddressZero)
          await pancakeswapV2Worker.setTreasuryBountyBps(0)
          // Deployer deposits 3 BTOKEN to the bank
          const deposit = ethers.utils.parseEther('3');
          await baseToken.approve(vault.address, deposit);
          await vault.deposit(deposit);
      
          // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
          const loan = ethers.utils.parseEther('1');
          await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('1'))
          await vaultAsAlice.work(
            0,
            pancakeswapV2Worker.address,
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
          expect(await pancakeswapV2Worker.treasuryBountyBps()).to.eq(REINVEST_BOUNTY_BPS)
          expect(await pancakeswapV2Worker.treasuryAccount()).to.eq(DEPLOYER)
        })
      })
      it('should allow to open a position without debt', async () => {
        // Deployer deposits 3 BTOKEN to the bank
        await baseToken.approve(vault.address, ethers.utils.parseEther('3'));
        await vault.deposit(ethers.utils.parseEther('3'));
    
        // Alice can take 0 debt ok
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('0.3'));
        await vaultAsAlice.work(
          0,
          pancakeswapV2Worker.address,
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
            pancakeswapV2Worker.address,
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
            pancakeswapV2Worker.address,
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
            pancakeswapV2Worker.address,
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
          pancakeswapV2Worker.address,
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
        await pancakeswapV2WorkerAsEve.reinvest();
        await vault.deposit(0); // Random action to trigger interest computation
    
        // You can't liquidate her position yet
        await expect(vaultAsEve.kill('1')).to.be.revertedWith("can't liquidate");
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));
        await expect(vaultAsEve.kill('1')).to.be.revertedWith("can't liquidate");
      });

      context("when the worker is an older version", async() => {
        context("when upgrade is during the tx flow", async() => {
          context("when beneficialVault == operator", async() => {
            it('should work with the new upgraded worker', async () => {
              // Deployer deposits 3 BTOKEN to the bank
              const deposit = ethers.utils.parseEther('3');
              await baseToken.approve(vault.address, deposit);
              await vault.deposit(deposit);
          
              // Now Alice can take 1 BTOKEN loan + 1 BTOKEN of her to create a new position
              const loan = ethers.utils.parseEther('1');
              await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('1'))
              // Position#1: Bob borrows 1 BTOKEN loan and supply another 1 BToken
              // Thus, Bob's position value will be worth 20 BTOKEN 
              // After calling `work()` 
              // 2 BTOKEN needs to swap 0.0732967258967755614 BTOKEN to 0.042234424701074812 FTOKEN
              // new reserve after swap will be 1.732967258967755614 ฺBTOKEN 0.057765575298925188 FTOKEN
              // based on optimal swap formula, BTOKEN-FTOKEN to be added into the LP will be 1.267032741032244386 BTOKEN - 0.042234424701074812 FTOKEN
              // lp amount from adding liquidity will be (0.042234424701074812 / 0.057765575298925188) * 0.316227766016837933(first total supply) = 0.231205137369691323 LP
              // new reserve after adding liquidity 2.999999999999999954 BTOKEN - 0.100000000000000000 FTOKEN
              await vaultAsAlice.work(
                0,
                pancakeswapV2Worker01.address,
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
              expect(await pancakeswapV2Worker01.health(1)).to.be.bignumber.eq(ethers.utils.parseEther('1.997883397660681282'));
              expect(await pancakeswapV2Worker01.shares(1)).to.eq(ethers.utils.parseEther('0.231205137369691323'))
              expect(await pancakeswapV2Worker01.shareToBalance(await pancakeswapV2Worker01.shares(1))).to.eq(ethers.utils.parseEther('0.231205137369691323'))
              
              // PancakeswapV2Worker needs to be updated to PancakeswapV2Worker02
              const PancakeswapV2Worker02 = (await ethers.getContractFactory(
                'PancakeswapV2Worker02',
                deployer
              )) as PancakeswapV2Worker02__factory
              const pancakeswapV2Worker02 = await upgrades.upgradeProxy(pancakeswapV2Worker01.address, PancakeswapV2Worker02) as PancakeswapV2Worker02
              await pancakeswapV2Worker02.deployed()
              
              // except that important states must be the same.
              // - health(1) should return the same value as before upgrade
              // - shares(1) should return the same value as before upgrade
              // - shareToBalance(shares(1)) should return the same value as before upgrade
              // - reinvestPath[0] should be reverted as reinvestPath.lenth == 0
              // - reinvestPath should return default reinvest path ($CAKE->$WBNB->$BTOKEN)
              expect(await pancakeswapV2Worker02.health(1)).to.be.bignumber.eq(ethers.utils.parseEther('1.997883397660681282'));
              expect(await pancakeswapV2Worker02.shares(1)).to.eq(ethers.utils.parseEther('0.231205137369691323'))
              expect(await pancakeswapV2Worker02.shareToBalance(await pancakeswapV2Worker01.shares(1))).to.eq(ethers.utils.parseEther('0.231205137369691323'))
              expect(pancakeswapV2Worker02.address).to.eq(pancakeswapV2Worker01.address)
              await expect(pancakeswapV2Worker02.reinvestPath(0)).to.be.reverted
              expect(await pancakeswapV2Worker02.getReinvestPath()).to.be.deep.eq([cake.address, wbnb.address, baseToken.address])
              
              const pancakeswapV2Worker02AsEve = PancakeswapV2Worker02__factory.connect(pancakeswapV2Worker02.address, eve)
              
              // set beneficialVaultConfig
              await pancakeswapV2Worker02.setBeneficialVaultConfig(BENEFICIALVAULT_BOUNTY_BPS, vault.address, [cake.address, wbnb.address, baseToken.address])
  
              expect(await pancakeswapV2Worker02.beneficialVault(), 'expect beneficialVault to be equal to input vault').to.eq(vault.address)
              expect(await pancakeswapV2Worker02.beneficialVaultBountyBps(), 'expect beneficialVaultBountyBps to be equal to BENEFICIALVAULT_BOUNTY_BPS').to.eq(BENEFICIALVAULT_BOUNTY_BPS)
              expect(await pancakeswapV2Worker02.rewardPath(0), 'index #0 of reward path should be cake').to.eq(cake.address)
              expect(await pancakeswapV2Worker02.rewardPath(1), 'index #1 of reward path should be wbnb').to.eq(wbnb.address)
              expect(await pancakeswapV2Worker02.rewardPath(2), 'index #2 of reward path should be baseToken').to.eq(baseToken.address)
              
              // Eve comes and trigger reinvest
              await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));
              // Eve calls reinvest to increase the LP size and receive portion of rewards
              // it's 4 blocks apart since the first tx, thus 0.0076 * 4 = 0.303999999999841411 CAKE
              // 10% of 0.303999999999841411 will become a bounty, thus eve shall get 90% of 0.003039999999998414 CAKE
              // 10% of 0.003039999999998414 will increase a beneficial vault's totalToken, this beneficial vault will get 0.0003039999999998414 CAKE
              // thus, 0.002735999999998573 will be returned to eve
              
  
              // 0.000303999999999841 CAKE is converted to (0.000303999999999841 * 0.9975 * 1) / (0.1 + 0.000303999999999841 * 0.9975) = 0.003023232350219612 WBNB
              // 0.003023232350219612 WBNB is converted to (0.003023232350219612 * 0.9975 * 1) / (0.1 + 0.003023232350219612 * 0.9975) = 0.003006607321008077 BTOKEN
              // 0.003006607321008077 will be returned to beneficial vault
  
              // total reward left to be added to lp is~ 0.300959999999842997 CAKE
              // 0.300959999999842997 CAKE is converted to (0.300959999999842997 * 0.9975 * 0.996976767649780388) / (1.00303999999999841 * 0.9975) = 0.747294217375624642 WBNB
              // 0.747294217375624642 WBNB is converted to (0.747294217375624642 * 0.9975 * 0.996993392678991923) / (1.003023232350219612 + 0.747294217375624642 * 0.9975) = 0.425053683338158027 BTOKEN
              // 0.425053683338158027 BTOKEN will be added to add strat to increase an lp size
              // after optimal swap, 0.425053683338158027 needs to swap 0.205746399352533711 BTOKEN to get the pair
              // thus (0.205746399352533711 * 0.9975 * 0.1) / (2.999999999999999954 + 0.205746399352533711 * 0.9975) = 0.006403032018227551
              // 0.205746399352533711 BTOKEN - 0.006403032018227551 FTOKEN to be added to  the pool
              // LP from adding the pool will be (0.006403032018227551 / 0.09359696798177246) * 0.547432903386529256 = 0.037450255962328211 LP
              // Accumulated LP will be 0.231205137369691323 + 0.037450255962328211 = 0.268655393332019534
              // now her balance based on share will be equal to (2.31205137369691323 / 2.31205137369691323) * 0.268655393332019534 = 0.268655393332019534 LP
              let vaultBalanceBefore = await baseToken.balanceOf(vault.address)
              await pancakeswapV2Worker02AsEve.reinvest();
              let vaultBalanceAfter = await baseToken.balanceOf(vault.address)
              AssertHelpers.assertAlmostEqual(vaultBalanceAfter.sub(vaultBalanceBefore).toString(), ethers.utils.parseEther('0.003006607321008077').toString())
              AssertHelpers.assertAlmostEqual(
                (CAKE_REWARD_PER_BLOCK.mul('4').mul(REINVEST_BOUNTY_BPS).div('10000'))
                .sub(
                  (CAKE_REWARD_PER_BLOCK.mul('4').mul(REINVEST_BOUNTY_BPS).mul(BENEFICIALVAULT_BOUNTY_BPS).div('10000').div('10000'))
                ).toString(),
                (await cake.balanceOf(await eve.getAddress())).toString(),
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
                deposit.sub(loan).add(ethers.utils.parseEther('0.003006607321008077')).toString(),
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
                deposit.add(ethers.utils.parseEther('0.003006607321008077')).add(interest).sub(reservePool).toString(),
                (await vault.totalToken()).toString(),
              );
              expect(await pancakeswapV2Worker01.shares(1)).to.eq(ethers.utils.parseEther('0.231205137369691323'))
              expect(await pancakeswapV2Worker01.shareToBalance(await pancakeswapV2Worker01.shares(1))).to.eq(ethers.utils.parseEther('0.268655393332019534'))
              const baseTokenBefore = await baseToken.balanceOf(await alice.getAddress())
              const farmingTokenBefore = await farmToken.balanceOf(await alice.getAddress())
              const vaultDebtValBefore = await vault.vaultDebtVal()
              
              // Alice closes position. This will trigger _reinvest in work function. Hence, positions get reinvested.
              // Reinvest fees should be transferred to DEPLOYER account.
              // it's 2 blocks apart since the first tx, thus 0.0076 * 2 = 0.151999999999986883 CAKE
              // 10% of 0.151999999999986883 will become a bounty, thus DEPLOYER shall get 90% of 0.001519999999999868 CAKE
              // 10% of 0.0015199999999998683 will be returned to the beneficial vault = 0.0001519999999999868 CAKE
              // thus DEPLOYER will receive 0.001367999999999882 CAKE as a bounty
              // Eve's CAKE should still be the same.
  
              // 0.0001519999999999868 CAKE is converted to (0.0001519999999999868 * 0.9975 * 0.249682550274155746) / (0.401263999999842838 + 0.0001519999999999868 * 0.9975) = 0.000094308408508315 WBNB
              // 0.000094308408508315 WBNB is converted to (0.000094308408508315 * 0.9975 * 0.571939709340833896) / (1.750317449725844254+ 0.000094308408508315 * 0.9975) = 0.000030737844360520 BTOKEN
              // 0.01367999999999882 will be returned to beneficial vault
  
              // total bounty left to be added to lp is~ 0.150479999999987015 CAKE
              // 0.150479999999987015 CAKE is converted to (0.150479999999987015 * 0.9975 * 0.249588241865647431) / (0.401415999999842824 + 0.150479999999987015  * 0.9975) = 0.067928918489165924 WBNB
              // 0.067928918489165924 WBNB is converted to (0.067928918489165924 * 0.9975 * 0.571908971496473376) / (1.750411758134352569 + 0.067928918489165924 * 0.9975) = 0.021313747781736658 BTOKEN
              // 0.021313747781736658 BTOKEN will be added to add strat to increase an lp size
              // after optimal swap, 0.021313747781736658 needs to swap 0.010653663230585143 BTOKEN to get the pair
              // thus (0.010653663230585143 * 0.9975 * 0.1) / (3.425053683338158027 + 0.010653663230585143 * 0.9975) = 0.000309313640063257
              // 0.010653663230585143 BTOKEN - 0.000309313640063257 FTOKEN to be added to  the pool
              // LP from adding the pool will be (0.000309313640063257 / 0.099690686359936743) * 0.584883159348857467 = 0.001814736618190215 LP
              // latest balance of BTOKEN-FTOKEN pair will be 3.446367431119894685 BTOKEN 0.100000000000000000 FTOKEN
              // latest total supply will be 0.584883159348857467 + 0.001814736618190215 = 0.5866978959670477
              // Accumulated LP will be 0.26865539333201954 + 0.001814736618190215 = 0.270470129950209749
              // now her balance based on share will be equal to (2.31205137369691323 / 2.31205137369691323) * 0.270470129950209749 = 0.270470129950209749
  
              // now she removes 0.270470129950209749 of her lp to BTOKEN-FTOKEN pair
              // (0.270470129950209749 / 0.5866978959670477) * 0.1 = 0.046100409053691391 FTOKEN
              // (0.270470129950209749 / 0.5866978959670477) * 3.446367431119894685 = 1.5887894832394673 BTOKEN
              // 0.046100409053691391 FTOKEN will be converted to (0.046100409053691391 * 0.9975 * 1.857577947880427336) / (0.553899590946308609 + 0.046100409053691391) = 0.855195776761125094 BTOKEN
              // latest balance of BTOKEN-FTOKEN pair will be 1.002379264603457950 BTOKEN 0.100000000000000000 FTOKEN
              // thus, alice will receive 1.5887894832394673 + 0.855195776761125094 = 2.4439852600005922 BTOKEN
              vaultBalanceBefore = await baseToken.balanceOf(vault.address)
              const eveCakeBefore = await cake.balanceOf(await eve.getAddress())
              await vaultAsAlice.work(
                1,
                pancakeswapV2Worker01.address,
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
              vaultBalanceAfter = await baseToken.balanceOf(vault.address)
              AssertHelpers.assertAlmostEqual(vaultBalanceAfter.sub(vaultBalanceBefore).toString(), ethers.utils.parseEther('0.000030737844360520').add(vaultDebtValBefore).toString())
              expect(await cake.balanceOf(await eve.getAddress())).to.be.eq(eveCakeBefore)
              AssertHelpers.assertAlmostEqual(
                ethers.utils.parseEther('0.001367999999999882').toString(),
                (await cake.balanceOf(DEPLOYER)).toString(),
              );
              const baseTokenAfter = await baseToken.balanceOf(await alice.getAddress())
              const farmingTokenAfter = await farmToken.balanceOf(await alice.getAddress())
              expect(await pancakeswapV2Worker01.shares(1)).to.eq(ethers.utils.parseEther('0'))
              expect(await pancakeswapV2Worker01.shareToBalance(await pancakeswapV2Worker01.shares(1))).to.eq(ethers.utils.parseEther('0'))
              AssertHelpers.assertAlmostEqual(baseTokenAfter.sub(baseTokenBefore).toString(), ethers.utils.parseEther('1.5887894832394673').add(ethers.utils.parseEther('0.855195776761125094')).sub(interest.add(loan)).toString())
              expect(farmingTokenAfter.sub(farmingTokenBefore)).to.eq('0')
            });
          })
        })
      })
  
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
          pancakeswapV2Worker.address,
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
        expect(await pancakeswapV2Worker.health(1)).to.be.bignumber.eq(ethers.utils.parseEther('1.997883397660681282'));
    
        // Eve comes and trigger reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));
        await pancakeswapV2WorkerAsEve.reinvest();
        AssertHelpers.assertAlmostEqual(
          (CAKE_REWARD_PER_BLOCK.mul('2').mul(REINVEST_BOUNTY_BPS).div('10000')).toString(),
          (await cake.balanceOf(await eve.getAddress())).toString(),
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
          pancakeswapV2Worker.address,
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
        await pancakeswapV2WorkerAsEve.reinvest();
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
          pancakeswapV2Worker.address,
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
        await pancakeswapV2WorkerAsEve.reinvest();
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
    
        const eveBefore = await baseToken.balanceOf(await eve.getAddress());
        const aliceAlpacaBefore = await alpacaToken.balanceOf(await alice.getAddress());
        
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
        expect(await baseToken.balanceOf(await eve.getAddress())).to.be.bignumber.gt(eveBefore);
        expect(await alpacaToken.balanceOf(await alice.getAddress())).to.be.bignumber.gt(aliceAlpacaBefore);
  
        // Alice creates a new position again
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('1'));
        await vaultAsAlice.work(
          0,
          pancakeswapV2Worker.address,
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
          pancakeswapV2Worker.address,
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
          pancakeswapV2Worker.address,
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
        await pancakeswapV2WorkerAsEve.reinvest();
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
          pancakeswapV2Worker.address,
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
          pancakeswapV2Worker.address,
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
          pancakeswapV2Worker.address,
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
        await farmToken.approve(routerV2.address, ethers.utils.parseEther('100'));
        await routerV2.swapExactTokensForTokens(
          ethers.utils.parseEther('100'), '0',
          [farmToken.address, baseToken.address], await deployer.getAddress(), FOREVER);
    
        // Alice liquidates Bob position#1
        let aliceBefore = await baseToken.balanceOf(await alice.getAddress());
  
        await expect(vaultAsAlice.kill('1'))
          .to.emit(vaultAsAlice, 'Kill')
  
        let aliceAfter = await baseToken.balanceOf(await alice.getAddress());
  
        // Bank balance is increase by liquidation
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('10.002702699312215556').toString(),
          (await baseToken.balanceOf(vault.address)).toString(),
        );
        // Alice is liquidator, Alice should receive 10% Kill prize
        // BTOKEN back from liquidation 0.00300199830261993, 10% of it is 0.000300199830261993
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('0.000300199830261993').toString(),
          aliceAfter.sub(aliceBefore).toString(),
        );
    
        // Alice withdraws 2 BOKTEN
        aliceBefore = await baseToken.balanceOf(await alice.getAddress());
        await vaultAsAlice.withdraw(await vault.balanceOf(await alice.getAddress()));
        aliceAfter = await baseToken.balanceOf(await alice.getAddress());
    
        // alice gots 2/12 * 10.002702699312215556 = 1.667117116552036
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('1.667117116552036').toString(),
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
          pancakeswapV2Worker.address,
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
        await farmToken.approve(routerV2.address, ethers.utils.parseEther('100'));
    
        // Price swing 10%
        // Add more token to the pool equals to sqrt(10*((0.1)**2) / 9) - 0.1 = 0.005409255338945984, (0.1 is the balance of token in the pool)
        await routerV2.swapExactTokensForTokens(
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
        await routerV2.swapExactTokensForTokens(
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
        await routerV2.swapExactTokensForTokens(
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
        await routerV2.swapExactTokensForTokens(
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
        );
    
        // Set Reinvest bounty to 10% of the reward
        await pancakeswapV2Worker.setReinvestConfig('100', '0', [cake.address, wbnb.address, baseToken.address]);
    
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
          pancakeswapV2Worker.address,
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
          pancakeswapV2Worker.address,
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
    
        let [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        await pancakeswapV2WorkerAsEve.reinvest();
        // PancakeWorker receives 303999999998816250 cake as a reward
        // Eve got 10% of 303999999998816250 cake = 0.01 * 303999999998816250 = 3039999999988162 bounty
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('0.003039999999988162').toString(),
          (await cake.balanceOf(await eve.getAddress())).toString(),
        );
    
        // Remaining PancakeWorker reward = 227999999998874730 - 22799999999887473 = 205199999998987257 (~90% reward)
        // Convert 205199999998987257 cake to 671683776318381694 NATIVE
        // Convert NATIVE to 1252466339860712438 LP token and stake
        let [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
    
        // LP tokens of worker should be inceased from reinvestment
        expect(workerLPAfter).to.be.bignumber.gt(workerLPBefore);
    
        // Check Bob position info
        await pancakeswapV2Worker.health('1');
        let [bobHealth, bobDebtToShare] = await vault.positionInfo('1');
        expect(bobHealth).to.be.bignumber.gt(ethers.utils.parseEther('20')); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('10').toString(),
          bobDebtToShare.toString(),
        );
    
        // Check Alice position info
        await pancakeswapV2Worker.health('2');
        let [aliceHealth, aliceDebtToShare] = await vault.positionInfo('2');
        expect(aliceHealth).to.be.bignumber.gt(ethers.utils.parseEther('3')); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('2').toString(),
          aliceDebtToShare.toString(),
        );
    
        // ---------------- Reinvest#2 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));
    
        [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        await pancakeswapV2WorkerAsEve.reinvest();
    
        // eve should earn cake as a reward for reinvest
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('0.004559999999987660').toString(),
          (await cake.balanceOf(await eve.getAddress())).toString(),
        );
    
        // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
        // Convert 128572916666654734 uni to 157462478899282341 NATIVE
        // Convert NATIVE to 5001669421841640 LP token
        [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
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
    
        // ---------------- Reinvest#3 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));
    
        [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        await pancakeswapV2WorkerAsEve.reinvest();
    
        // eve should earn cake as a reward for reinvest
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('0.006079999999979926').toString(),
          (await cake.balanceOf(await eve.getAddress())).toString(),
        );
    
        // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
        // Convert 128572916666654734 uni to 74159218067697746 NATIVE
        // Convert NATIVE to 2350053120029788 LP token
        [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        // LP tokens of worker should be inceased from reinvestment
        expect(workerLPAfter).to.be.bignumber.gt(workerLPBefore);
    
        const bobBefore = await baseToken.balanceOf(await bob.getAddress());
        // Bob close position#1
        await vaultAsBob.work(
          1,
          pancakeswapV2Worker.address,
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
          pancakeswapV2Worker.address,
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
          pancakeswapV2Worker.address,
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
  
      it('should liquidate user position correctly', async () => {
        // Bob deposits 20 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('20'));
        await vaultAsBob.deposit(ethers.utils.parseEther('20'));
    
        // Position#1: Alice borrows 10 BTOKEN loan
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('10'));
        await vaultAsAlice.work(
          0,
          pancakeswapV2Worker.address,
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
        await farmToken.approve(routerV2.address, ethers.utils.parseEther('100'));
    
        // Price swing 10%
        // Add more token to the pool equals to sqrt(10*((0.1)**2) / 9) - 0.1 = 0.005409255338945984, (0.1 is the balance of token in the pool)
        await routerV2.swapExactTokensForTokens(
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
        await routerV2.swapExactTokensForTokens(
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
        await routerV2.swapExactTokensForTokens(
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
        await routerV2.swapExactTokensForTokens(
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
        );
  
        // Set Reinvest bounty to 10% of the reward
        await pancakeswapV2Worker.setReinvestConfig('100', '0', [cake.address, wbnb.address, baseToken.address]);
  
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
          pancakeswapV2Worker.address,
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
          pancakeswapV2Worker.address,
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
  
        let [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        await pancakeswapV2WorkerAsEve.reinvest();
        // PancakeWorker receives 303999999998816250 cake as a reward
        // Eve got 10% of 303999999998816250 cake = 0.01 * 303999999998816250 = 3039999999988162 bounty
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('0.003039999999988162').toString(),
          (await cake.balanceOf(await eve.getAddress())).toString(),
        );
  
        // Remaining PancakeWorker reward = 227999999998874730 - 22799999999887473 = 205199999998987257 (~90% reward)
        // Convert 205199999998987257 cake to 671683776318381694 NATIVE
        // Convert NATIVE to 1252466339860712438 LP token and stake
        let [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
  
        // LP tokens of worker should be inceased from reinvestment
        expect(workerLPAfter).to.be.bignumber.gt(workerLPBefore);
  
        // Check Position#1 info
        await pancakeswapV2Worker.health('1');
        let [bob1Health, bob1DebtToShare] = await vault.positionInfo('1');
        expect(bob1Health).to.be.bignumber.gt(ethers.utils.parseEther('20')); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('10').toString(),
          bob1DebtToShare.toString(),
        );
  
        // Check Position#2 info
        await pancakeswapV2Worker.health('2');
        let [bob2Health, bob2DebtToShare] = await vault.positionInfo('2');
        expect(bob2Health).to.be.bignumber.gt(ethers.utils.parseEther('3')); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('2').toString(),
          bob2DebtToShare.toString(),
        );
  
        // ---------------- Reinvest#2 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));
  
        [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        await pancakeswapV2WorkerAsEve.reinvest();
  
        // eve should earn cake as a reward for reinvest
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('0.004559999999987660').toString(),
          (await cake.balanceOf(await eve.getAddress())).toString(),
        );
  
        // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
        // Convert 128572916666654734 uni to 157462478899282341 NATIVE
        // Convert NATIVE to 5001669421841640 LP token
        [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
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
          pancakeswapV2Worker.address,
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
          pancakeswapV2Worker.address,
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
          pancakeswapV2Worker.address,
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
        );
    
        // Set Reinvest bounty to 10% of the reward
        await pancakeswapV2Worker.setReinvestConfig('100', '0', [cake.address, wbnb.address, baseToken.address]);
    
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
          pancakeswapV2Worker.address,
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
          pancakeswapV2Worker.address,
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
    
        let [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        await pancakeswapV2WorkerAsEve.reinvest();
        // PancakeWorker receives 303999999998816250 cake as a reward
        // Eve got 10% of 303999999998816250 cake = 0.01 * 303999999998816250 = 3039999999988162 bounty
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('0.003039999999988162').toString(),
          (await cake.balanceOf(await eve.getAddress())).toString(),
        );
    
        // Remaining PancakeWorker reward = 227999999998874730 - 22799999999887473 = 205199999998987257 (~90% reward)
        // Convert 205199999998987257 cake to 671683776318381694 NATIVE
        // Convert NATIVE to 1252466339860712438 LP token and stake
        let [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
    
        // LP tokens of worker should be inceased from reinvestment
        expect(workerLPAfter).to.be.bignumber.gt(workerLPBefore);
    
        // Check Position#1 info
        await pancakeswapV2Worker.health('1');
        let [bob1Health, bob1DebtToShare] = await vault.positionInfo('1');
        expect(bob1Health).to.be.bignumber.gt(ethers.utils.parseEther('20')); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('10').toString(),
          bob1DebtToShare.toString(),
        );
    
        // Check Position#2 info
        await pancakeswapV2Worker.health('2');
        let [bob2Health, bob2DebtToShare] = await vault.positionInfo('2');
        expect(bob2Health).to.be.bignumber.gt(ethers.utils.parseEther('3')); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('0').toString(),
          bob2DebtToShare.toString(),
        );
    
        // ---------------- Reinvest#2 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));
    
        [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        await pancakeswapV2WorkerAsEve.reinvest();
    
        // eve should earn cake as a reward for reinvest
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('0.004559999999987660').toString(),
          (await cake.balanceOf(await eve.getAddress())).toString(),
        );
    
        // Remaining Worker reward = 142858796296283038 - 14285879629628304 = 128572916666654734 (~90% reward)
        // Convert 128572916666654734 uni to 157462478899282341 NATIVE
        // Convert NATIVE to 5001669421841640 LP token
        [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
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
          pancakeswapV2Worker.address,
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
          pancakeswapV2Worker.address,
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
          pancakeswapV2Worker.address,
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
        );
        
        // Set Reinvest bounty to 10% of the reward
        await pancakeswapV2Worker.setReinvestConfig('100', '0', [cake.address, wbnb.address, baseToken.address]);
  
        // Bob deposits 10 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
        await vaultAsBob.deposit(ethers.utils.parseEther('10'));
  
        // Alice deposits 12 BTOKEN
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('12'));
        await vaultAsAlice.deposit(ethers.utils.parseEther('12'));
  
        // Position#1: Bob borrows 10 BTOKEN loan and supply another 10 BToken
        // Thus, Bob's position value will be worth 20 BTOKEN 
        // After calling `work()` 
        // 20 BTOKEN needs to swap 3.587061715703192586 BTOKEN to FTOKEN
        // new reserve after swap will be 4.587061715703192586 0.021843151027158060
        // based on optimal swap formula, BTOKEN-FTOKEN to be added into the LP will be 16.412938284296807414 BTOKEN - 0.078156848972841940 FTOKEN
        // new reserve after adding liquidity 21.000000000000000000 BTOKEN - 0.100000000000000000 FTOKEN
        // lp amount from adding liquidity will be 1.131492691639043045 LP
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'))
        let [workerLPBefore, workerDebtBefore] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        await vaultAsBob.work(
          0,
          pancakeswapV2Worker.address,
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
        let [workerLPAfter, workerDebtAfter] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        expect(workerLPAfter.sub(workerLPBefore)).to.eq(parseEther('1.131492691639043045'))
  
        await baseTokenAsAlice.approve(vault.address, ethers.utils.parseEther('1'))
        // Position#2: Alice borrows 2 BTOKEN loan and supply 1 BTOKEN
        // After calling `work()`, the `_reinvest()` is invoked
        // since 2 blocks have passed since approve and work now reward will be 0.076 * 2 =~ 0.1519999999990075  CAKE
        // reward without bounty will be 0.1519999999990075 - 0.001519999999991226 =~ 0.150479999999131439 CAKE
        // 0.150479999999131439 CAKE can be converted into: 
        // (0.150479999999131439 * 0.9975 * 1) / (0.1 + 0.150479999999131439 * 0.9975) = 0.6001660110722029 WBNB
        // 0.6001660110722029 WBNB can be converted into (0.6001660110722029 * 0.9975 * 1) / (1 + 0.6001660110722029 * 0.9975) = 0.374478313366409272 BTOKEN
        // based on optimal swap formula, 0.374478313366409272 BTOKEN needs to swap 0.186645098725751122 BTOKEN
        // new reserve after swap will be 21.186645098725751122 0.099121226670953660
        // based on optimal swap formula, BTOKEN-FTOKEN to be added into the LP will be 0.187833214640658150 BTOKEN - 0.000878773329046340 FTOKEN
        // new reserve after adding liquidity receiving from `_reinvest()` is 21.374478313366409272 BTOKEN - 0.100000000000000000 FTOKEN
        // more LP amount after executing add strategy will be 0.012834971567957384 LP
        // accumulated LP of the worker will be 1.131492691639043045 + 0.012834971567957384 = 1.1443276632070005 LP
        
        // alice supplying 3 BTOKEN to the pool
        // based on optimal swap formula, 3 BTOKEN needs to swap for 1.452581363963336302 BTOKEN for 0.006348520022223796 FTOKEN
        // new reserve after swap will be 22.827059677329745574 BTOKEN - 0.093651479977776204 FTOKEN
        // based on optimal swap formula, BTOKEN-FTOKEN to be added into the LP will be 1.547418636036663698 BTOKEN - 0.006348520022223796 FTOKEN
        // new reserve after adding liquidity is 24.374478313366409272 BTOKEN - 0.100000000000000000 FTOKEN
        // more LP amount after executing add strategy will be 0.099009277677144773 LP
        // accumulated LP of the worker will be 1.1443276632070005 + 0.099009277677144773 = 1.2433369408841453 LP
        let userInfoBefore = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        await vaultAsAlice.work(
          0,
          pancakeswapV2Worker.address,
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
        let userInfoAfter = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        // LP tokens of worker should be inceased from reinvestment
        expect(userInfoAfter.amount).to.be.bignumber.gt(userInfoBefore.amount);
        expect(userInfoAfter.amount.sub(userInfoBefore.amount)).to.eq(parseEther('0.099009277677144773').add(parseEther('0.012834971567957384')))
  
        // ---------------- Reinvest#1 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));
  
        userInfoBefore = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        await pancakeswapV2WorkerAsEve.reinvest();
        // PancakeWorker receives 0.151999999999007550 cake as a reward
        // Eve got 10% of 0.151999999999007550 cake = 0.01 * 0.151999999999007550 = 0.001519999999990075 bounty
        // with previous received cake reward, it will be  0.001519999999990075 + 0.001519999999990075 =~ 0.003039999999988162 CAKE
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('0.003039999999988162').toString(),
          (await cake.balanceOf(await eve.getAddress())).toString(),
        );
        // Remaining PancakeWorker reward = 0.151999999999007550 - 0.001519999999990075 = 0.150479999999200233 (~90% reward)
        // Convert 0.150479999999200233 cake to 0.053430713396006806 BTOKEN
        // Convert NATIVE to 0.001706268418962981 LP token and stake
        // accumulated LP of the worker will be 1.2433369408841453 + 0.001706268418962981 = 1.2450432093031083 LP
        userInfoAfter = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        expect(userInfoAfter.amount.sub(userInfoBefore.amount)).to.eq(parseEther('0.001706268418962981'))
  
        // LP tokens of worker should be inceased from reinvestment
        expect(userInfoAfter.amount).to.be.bignumber.gt(userInfoBefore.amount);
  
        // Check Bob position info
        await pancakeswapV2Worker.health('1');
        let [bobHealth, bobDebtToShare] = await vault.positionInfo('1');
        expect(bobHealth).to.be.bignumber.gt(ethers.utils.parseEther('20')); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('10').toString(),
          bobDebtToShare.toString(),
        );
  
        // Check Alice position info
        await pancakeswapV2Worker.health('2');
        let [aliceHealth, aliceDebtToShare] = await vault.positionInfo('2');
        expect(aliceHealth).to.be.bignumber.gt(ethers.utils.parseEther('3')); // Get Reward and increase health
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('2').toString(),
          aliceDebtToShare.toString(),
        );
  
        // ---------------- Reinvest#2 -------------------
        // Wait for 1 day and someone calls reinvest
        await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('1')));
        userInfoBefore = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        await pancakeswapV2WorkerAsEve.reinvest();
        // PancakeWorker receives 0.151999999999007550 cake as a reward
        // Eve got 10% of 0.151999999999007550 cake = 0.01 * 0.151999999999007550 = 0.001519999999990075 bounty
        // with previous received cake reward, it will be  0.003039999999988162 + 0.001519999999990075 =~ 0.004559999999987660
        // eve should earn cake as a reward for reinvest
        AssertHelpers.assertAlmostEqual(
          ethers.utils.parseEther('0.004559999999987660').toString(),
          (await cake.balanceOf(await eve.getAddress())).toString(),
        );

        // Remaining PancakeWorker reward = 0.151999999999007550 - 0.001519999999990075 = 0.150479999999200233 (~90% reward)
        // Convert 0.150479999999200233 cake to 0.053430713396006806 BTOKEN
        // Convert NATIVE to 0.000682143588031014 LP token and stake
        // accumulated LP of the worker will be 1.2450432093031083 + 0.000682143588031014 = 1.2457253528911394 LP
        userInfoAfter = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        // LP tokens of worker should be inceased from reinvestment
        expect(userInfoAfter.amount).to.be.bignumber.gt(userInfoBefore.amount);
        expect(userInfoAfter.amount.sub(userInfoBefore.amount)).to.eq(parseEther('0.000682143588031014'))
  
        // Check Bob position info
        ;[bobHealth, bobDebtToShare] = await vault.positionInfo('1');
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
  
        const bobBefore = await baseToken.balanceOf(await bob.getAddress());
        const [bobHealthBefore, ] = await vault.positionInfo('1');
        const lpUnderBobPosition = await pancakeswapV2Worker.shareToBalance(await pancakeswapV2Worker.shares(1));
        userInfoBefore = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        // Bob think he made enough. He now wants to close position partially.
        // After calling `work()`, the `_reinvest()` is invoked
        // since 1 blocks have passed since approve and work now reward will be 0.076 * 1 =~ 0.075999999998831803 ~   CAKE
        // reward without bounty will be 0.075999999998831803 - 0.000759999999988318 =~ 0.0752399999988435 CAKE
        // 0.0752399999988435 CAKE can be converted into: 
        // (0.0752399999988435 * 0.9975 * 0.181910827281197007) / (0.551439999997349147 + 0.0752399999988435 * 0.9975) = 0.021792385851914001 WBNB
        // 0.021792385851914001 WBNB can be converted into (0.021792385851914001 * 0.9975 * 0.550713681895118383) / (1.818089172718802993 + 0.021792385851914001 * 0.9975) = 0.006506786307732169 BTOKEN
        // based on optimal swap formula, 0.006506786307732169 BTOKEN needs to swap 0.003257248283727063 BTOKEN
        // new reserve after swap will be 24.452543566388608680 0.099986712604207391
        // based on optimal swap formula, BTOKEN-FTOKEN to be added into the LP will be 0.003249538024005106 BTOKEN - 0.000013287395792609 FTOKEN
        // new reserve after adding liquidity receiving from `_reinvest()` is 24.455793104412613786 BTOKEN - 0.100000000000000000 FTOKEN
        // more LP amount after executing add strategy will be 0.000207570473714694 LP
        // accumulated LP of the worker will be 1.2457253528911394 + 0.000207570473714694 = 1.2459329233648542 LP
        
        // bob close 50% of his position, thus he will close 1.131492691639043045 * (1.2457253528911394 /  (1.131492691639043045 (bob's share) + 0.099009277677144773 (alice's share))) =~ 1.146525881438009825 / 2 = 0.573262940719004912 LP
        // 0.573262940719004912 LP will be converted into 8.974492808547204961 BTOKEN - 0.036696797238311265 FTOKEN
        // 0.036696797238311265 FTOKEN will be converted into (0.036696797238311265 * 0.9975 * 15.481300295865408825) / (0.063303202761688735 + 0.036696797238311265 * 0.9975) = 5.672142262341941975 BTOKEN
        // thus, Bob will receive 5.672142262341941975 + 8.974492808547204961 = 14.646635070889146936 BTOKEN
        await vaultAsBob.work(
          1,
          pancakeswapV2Worker.address,
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
        // 14.646635070889146936 BTOKEN (price impact+trading fee included)
        // Bob returns 5 BTOKEN to payback the debt hence; He should be
        // 14.646635070889146936 - 5 = 9.646635070889147 BTOKEN richer
        AssertHelpers.assertAlmostEqual(
          bobAfter.toString(),
          bobBefore.add(ethers.utils.parseEther('9.646635070889147')).toString(),
        );
        // Check Bob position info
        [bobHealth, bobDebtToShare] = await vault.positionInfo('1');
        // Bob's health after partial close position must be 50% less than before
        // due to he exit half of lp under his position
        expect(bobHealth).to.be.bignumber.lt(bobHealthBefore.div(2));
        // Bob's debt should be left only 5 BTOKEN due he said he wants to return at max 5 BTOKEN
        expect(bobDebtToShare).to.be.bignumber.eq(ethers.utils.parseEther('5'));
        // Check LP deposited by Worker on MasterChef
        userInfoAfter = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        // LP tokens + 0.000207570473714694 LP from reinvest of worker should be decreased by lpUnderBobPosition/2
        // due to Bob execute StrategyClosePartialLiquidate
        expect(userInfoAfter.amount).to.be.bignumber.eq(userInfoBefore.amount.add(parseEther('0.000207570473714694')).sub(lpUnderBobPosition.div(2)));
      }).timeout(50000);
  
      it('should partially close position successfully, when maxReturn > liquidated amount and liquidated amount > debt', async () => {
        // Set Bank's debt interests to 0% per year
        await simpleVaultConfig.setParams(
          ethers.utils.parseEther('1'), // 1 BTOKEN min debt size,
          '0', // 0% per year
          '1000', // 10% reserve pool
          '1000', // 10% Kill prize
          wbnb.address,
          wNativeRelayer.address,
          fairLaunch.address,
        );
  
        // Bob deposits 10 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
        await vaultAsBob.deposit(ethers.utils.parseEther('10'));
  
        // Position#1: Bob borrows 10 BTOKEN loan and supply another 10 BToken
        // Thus, Bob's position value will be worth 20 BTOKEN 
        // After calling `work()` 
        // 20 BTOKEN needs to swap 3.587061715703192586 BTOKEN to FTOKEN
        // new reserve after swap will be 4.587061715703192586 0.021843151027158060
        // based on optimal swap formula, BTOKEN-FTOKEN to be added into the LP will be 16.412938284296807414 BTOKEN - 0.078156848972841940 FTOKEN
        // new reserve after adding liquidity 21.000000000000000000 BTOKEN - 0.100000000000000000 FTOKEN
        // lp amount from adding liquidity will be 1.131492691639043045 LP
        let [workerLPBefore, ] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'))
        await vaultAsBob.work(
          0,
          pancakeswapV2Worker.address,
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

        let [workerLPAfter, ] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        expect(workerLPAfter.sub(workerLPBefore)).to.eq(parseEther('1.131492691639043045'))

        // Bob think he made enough. He now wants to close position partially.
        // He close 50% of his position and return all debt
        const bobBefore = await baseToken.balanceOf(await bob.getAddress());
        const [bobHealthBefore, ] = await vault.positionInfo('1');
        const lpUnderBobPosition = await pancakeswapV2Worker.shareToBalance(await pancakeswapV2Worker.shares(1));
        [workerLPBefore,] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
  
        // Bob think he made enough. He now wants to close position partially.
        // After calling `work()`, the `_reinvest()` is invoked
        // since 1 blocks have passed since approve and work now reward will be 0.076 * 1 =~ 0.075999999998831803 ~   CAKE
        // reward without bounty will be 0.075999999998831803 - 0.000759999999988318 =~ 0.0752399999988435 CAKE
        // 0.0752399999988435 CAKE can be converted into: 
        // (0.0752399999988435 * 0.9975 * 1) / (0.1 + 0.0752399999988435 * 0.9975) = 0.428740847712892766 WBNB
        // 0.428740847712892766 WBNB can be converted into (0.428740847712892766 * 0.9975 * 1) / (1 + 0.428740847712892766 * 0.9975) = 0.299557528330150526 BTOKEN
        // based on optimal swap formula, 0.299557528330150526 BTOKEN needs to swap 0.149435199790075736 BTOKEN
        // new reserve after swap will be 21.149435199790075736 BTOKEN - 0.099295185694161018 FTOKEN
        // based on optimal swap formula, BTOKEN-FTOKEN to be added into the LP will be 0.150122328540074790 BTOKEN - 0.000704814305838982 FTOKEN
        // new reserve after adding liquidity receiving from `_reinvest()` is 21.299557528330150526 BTOKEN - 0.100000000000000000 FTOKEN
        // more LP amount after executing add strategy will be 0.010276168801924356 LP
        // accumulated LP of the worker will be 1.131492691639043045 + 0.010276168801924356 = 1.1417688604409675 LP
        
        // bob close 50% of his position, thus he will close 1.131492691639043045 * (1.131492691639043045 / (1.131492691639043045)) =~ 1.131492691639043045 / 2 = 0.5657463458195215 LP
        // 0.5657463458195215 LP will be converted into 8.264866063854500749 BTOKEN - 0.038802994160144191 FTOKEN
        // 0.038802994160144191 FTOKEN will be converted into (0.038802994160144191 * 0.9975 * 13.034691464475649777) / (0.061197005839855809 + 0.038802994160144191 * 0.9975) = 5.050104921127982573 BTOKEN
        // thus, Bob will receive 8.264866063854500749 + 5.050104921127982573 = 13.314970984982483322 BTOKEN
        await vaultAsBob.work(
          1,
          pancakeswapV2Worker.address,
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
        // 13.314970984982483322 BTOKEN (price impact+trading fee included)
        // Bob wish to return 5,000,000,000 BTOKEN (when maxReturn > debt, return all debt) 
        // The following criteria must be stratified:
        // - Bob should get 13.314970984982483322 - 10 = 3.314970984982483322 BTOKEN back.
        // - Bob's position debt must be 0
        expect(
          bobBefore.add(ethers.utils.parseEther('3.314970984982483322')),
          "Expect BTOKEN in Bob's account after close position to increase by ~3.32 BTOKEN").to.be.bignumber.eq(bobAfter)
        // Check Bob position info
        const [bobHealth, bobDebtVal] = await vault.positionInfo('1');
        // Bob's health after partial close position must be 50% less than before
        // due to he exit half of lp under his position
        expect(bobHealth).to.be.bignumber.lt(bobHealthBefore.div(2));
        // Bob's debt should be 0 BTOKEN due he said he wants to return at max 5,000,000,000 BTOKEN (> debt, return all debt)
        expect(bobDebtVal).to.be.bignumber.eq('0');
        // Check LP deposited by Worker on MasterChef
        [workerLPAfter,] = await masterChef.userInfo(poolId, pancakeswapV2Worker.address);
        // LP tokens + LP tokens from reinvest of worker should be decreased by lpUnderBobPosition/2
        // due to Bob execute StrategyClosePartialLiquidate
        expect(workerLPAfter).to.be.bignumber.eq(workerLPBefore.add(parseEther('0.010276168801924356')).sub(lpUnderBobPosition.div(2)));
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
        );
  
        // Bob deposits 10 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
        await vaultAsBob.deposit(ethers.utils.parseEther('10'));
  
        // Position#1: Bob borrows 10 BTOKEN loan
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'))
        await vaultAsBob.work(
          0,
          pancakeswapV2Worker.address,
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
        const lpUnderBobPosition = await pancakeswapV2Worker.shareToBalance(await pancakeswapV2Worker.shares(1));
        // Bob closes position with maxReturn 5,000,000,000 and liquidate half of his position
        // Expect that Bob will not be able to close his position as he liquidate all underlying assets but not paydebt
        // which made his position debt ratio higher than allow work factor
        await expect(vaultAsBob.work(
          1,
          pancakeswapV2Worker.address,
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
        );
  
        // Bob deposits 10 BTOKEN
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'));
        await vaultAsBob.deposit(ethers.utils.parseEther('10'));
  
        // Position#1: Bob borrows 10 BTOKEN loan
        await baseTokenAsBob.approve(vault.address, ethers.utils.parseEther('10'))
        await vaultAsBob.work(
          0,
          pancakeswapV2Worker.address,
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
        const lpUnderBobPosition = await pancakeswapV2Worker.shareToBalance(await pancakeswapV2Worker.shares(1));
        // Transaction should be revert due to Bob is asking contract to liquidate Lp amount > Lp that is under his position
        await expect(vaultAsBob.work(
          1,
          pancakeswapV2Worker.address,
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
    })
  });
});