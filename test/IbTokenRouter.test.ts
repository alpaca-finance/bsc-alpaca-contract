import { ethers, upgrades, waffle } from "hardhat";
import { Overrides, Signer, BigNumberish, utils, Wallet } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  AlpacaToken,
  AlpacaToken__factory,
  DebtToken,
  DebtToken__factory,
  FairLaunch,
  FairLaunch__factory,
  IbTokenRouter,
  IbTokenRouter__factory,
  MockERC20,
  MockERC20__factory,
  PancakeFactory,
  PancakeFactory__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouter,
  PancakeRouter__factory,
  SimpleVaultConfig,
  SimpleVaultConfig__factory,
  Vault,
  Vault__factory,
  WETH,
  WETH__factory,
  WNativeRelayer,
  WNativeRelayer__factory,
} from "../typechain";
import * as AssertHelpers from "./helpers/assert"

const { BN, ether, expectRevert } = require('@openzeppelin/test-helpers');

chai.use(solidity);
const { expect } = chai;

describe('IbTokenRouter', () => {
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther('5000');
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const RESERVE_POOL_BPS = 1000; // 10% reserve pool
  const KILL_PRIZE_BPS = 1000; // 10% Kill prize
  const INTEREST_RATE = 3472222222222; // 30% per year
  const MIN_DEBT_SIZE = ethers.utils.parseEther('1'); // 1 WBTC min debt size
  const FOREVER = 20000000000;

  // Contract instances
  let factory: PancakeFactory;
  let router: PancakeRouter;
  let lp: PancakePair;

  let fairLaunch: FairLaunch;
  let alpacaToken: AlpacaToken;

  let wbnb: WETH;
  let govToken: MockERC20;
  let wbtc: MockERC20;

  let ibTokenRouter: IbTokenRouter;

  let config: SimpleVaultConfig;
  let wNativeRelayer: WNativeRelayer;
  let vault: Vault;

  // Contract Signer
  let lpAsDeployer: PancakePair;
  let lpAsAlice: PancakePair;

  let ibTokenRouterAsDeployer: IbTokenRouter;
  let ibTokenRouterAsAlice: IbTokenRouter;

  let wethAsDeployer: WETH;
  let wethAsAlice: WETH;

  let govTokenAsDeployer: MockERC20;
  let govTokenAsAlice: MockERC20;

  let wbtcAsDeployer: MockERC20;
  let wbtcAsAlice: MockERC20;

  let vaultAsDeployer: Vault;
  let vaultAsAlice: Vault;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let dev: Signer;

  beforeEach(async () => {
    [deployer, alice, bob, dev] = await ethers.getSigners();

    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory(
      "PancakeFactory",
      deployer
    )) as PancakeFactory__factory;
    factory = await PancakeFactory.deploy((await deployer.getAddress()));
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory(
      "WETH",
      deployer
    )) as WETH__factory;
    wbnb = await WBNB.deploy();
    await wbnb.deployed();

    const PancakeRouter = (await ethers.getContractFactory(
      "PancakeRouter",
      deployer
    )) as PancakeRouter__factory;
    router = await PancakeRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

    // Mock ERC20s components
    const MockERC20 = (await ethers.getContractFactory(
      "MockERC20",
      deployer
    )) as MockERC20__factory;
    // govToken => Alpaca
    govToken = await upgrades.deployProxy(MockERC20, ['ALPACA', 'ALPACA']) as MockERC20;
    await govToken.deployed();
    await govToken.mint((await deployer.getAddress()), ethers.utils.parseEther('10000'));
    await govToken.mint((await alice.getAddress()), ethers.utils.parseEther('100'));
    // wbtc => WBTC
    wbtc = await upgrades.deployProxy(MockERC20, ['WBTC', 'WBTC']) as MockERC20;
    await wbtc.deployed();
    await wbtc.mint((await deployer.getAddress()), ethers.utils.parseEther('10000'));
    await wbtc.mint((await alice.getAddress()), ethers.utils.parseEther('100'));

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
      alpacaToken.address, (await dev.getAddress()), ALPACA_REWARD_PER_BLOCK, 0, ALPACA_BONUS_LOCK_UP_BPS, 0
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
    config = await upgrades.deployProxy(SimpleVaultConfig, [
      MIN_DEBT_SIZE, INTEREST_RATE, RESERVE_POOL_BPS, KILL_PRIZE_BPS,
      wbnb.address, wNativeRelayer.address, fairLaunch.address
    ]) as SimpleVaultConfig;
    await config.deployed();

    const DebtToken = (await ethers.getContractFactory(
      "DebtToken",
      deployer
    )) as DebtToken__factory;
    const debtToken = await upgrades.deployProxy(DebtToken, [
      'debtibBTOKEN_V2', 'debtibBTOKEN_V2', (await deployer.getAddress())]) as DebtToken;
    await debtToken.deployed();

    const Vault = (await ethers.getContractFactory(
      "Vault",
      deployer
    )) as Vault__factory;
    vault = await upgrades.deployProxy(Vault, [
      config.address, wbtc.address, 'Interest Bearing WBTC', 'ibWBTC', 18, debtToken.address
    ]) as Vault;
    await vault.deployed();

    await wNativeRelayer.setCallerOk([vault.address], true);

    // Set ContractAsAccount
    govTokenAsDeployer = MockERC20__factory.connect(govToken.address, deployer);
    govTokenAsAlice = MockERC20__factory.connect(govToken.address, alice);

    wethAsDeployer = WETH__factory.connect(wbnb.address, deployer);
    wethAsAlice = WETH__factory.connect(wbnb.address, alice);

    wbtcAsDeployer = MockERC20__factory.connect(wbtc.address, deployer);
    wbtcAsAlice = MockERC20__factory.connect(wbtc.address, alice);

    vaultAsDeployer = Vault__factory.connect(vault.address, deployer);
    vaultAsAlice = Vault__factory.connect(vault.address, alice);

    // Set add FairLaunch poool and set fairLaunchPoolId for Vault
    await fairLaunch.addPool(1, (await vault.debtToken()), false);
    await vault.setFairLaunchPoolId(0);

    // Allow Vault to transfer WBTC from the account
    await wbtcAsDeployer.approve(vault.address, ethers.utils.parseEther('100'));
    await wbtcAsAlice.approve(vault.address, ethers.utils.parseEther('10'))
    // Deposit some WBTC to Vault
    await vaultAsDeployer.deposit(ethers.utils.parseEther('100'));
    await vaultAsAlice.deposit(ethers.utils.parseEther('10'));

    // expect vault to be configured properly
    expect(await wbtc.balanceOf(vault.address)).to.be.bignumber.equal(ethers.utils.parseEther('110'));
    expect(await vault.balanceOf(await alice.getAddress())).to.be.bignumber.equal(ethers.utils.parseEther('10'));
    expect(await vault.balanceOf(await deployer.getAddress())).to.be.bignumber.equal(ethers.utils.parseEther('100'));

    // Send some WBTC to Vault to create interest
    // This make 1 ibWTC = 1.045454545454545454 WBTC
    await wbtcAsDeployer.transfer(vault.address, ethers.utils.parseEther('5'));

    // Create ibToken-Alpaca pair
    await factory.createPair(vault.address, govToken.address);
    lp = PancakePair__factory.connect(
      await factory.getPair(govToken.address, vault.address), deployer);

    const IbTokenRouter = (await ethers.getContractFactory(
      "IbTokenRouter",
      deployer
    )) as IbTokenRouter__factory;
    ibTokenRouter = await upgrades.deployProxy(
      IbTokenRouter, [router.address, wbtc.address, vault.address, govToken.address]) as IbTokenRouter;

    // Assign contract signer
    lpAsDeployer = PancakePair__factory.connect(lp.address, deployer);
    lpAsAlice = PancakePair__factory.connect(lp.address, alice);

    ibTokenRouterAsDeployer = IbTokenRouter__factory.connect(ibTokenRouter.address, deployer);
    ibTokenRouterAsAlice = IbTokenRouter__factory.connect(ibTokenRouter.address, alice);

    // Deployer adds 10000 Alpaca + 100 ibWBTC, price 100 Alpaca : 1 ibWBTC
    await govTokenAsDeployer.approve(router.address, ethers.utils.parseEther('10000'));
    await vaultAsDeployer.approve(router.address, ethers.utils.parseEther('100'));
    await router.addLiquidity(
      govToken.address, vault.address, ethers.utils.parseEther('10000'), ethers.utils.parseEther('100'), '0', '0',
      (await deployer.getAddress()), FOREVER);
  });

  it('should receive some interest when redeem ibWBTC', async () => {
    await vaultAsAlice.withdraw(await vault.balanceOf(await alice.getAddress()));
    expect(await vault.balanceOf(await alice.getAddress())).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(await alice.getAddress())).to.be.bignumber.above(ethers.utils.parseEther('10'));
  });

  it('should be able to add liquidity to ibWBTC-ALPACA with WBTC and ALPACA', async () => {
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('100'));
    await wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('1'));
    await ibTokenRouterAsAlice.addLiquidityToken(ethers.utils.parseEther('1'), 0, ethers.utils.parseEther('100'), 0, (await alice.getAddress()), FOREVER);
    expect(await lp.balanceOf((await alice.getAddress()))).to.be.bignumber.above(ethers.utils.parseEther('0'));
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should revert when add liquidity to ibWBTC-ALPACA with too little WBTC', async () => {
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('100'));
    await wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('1'));
    await expect(
      ibTokenRouterAsAlice.addLiquidityToken(
        ethers.utils.parseEther('1'), ethers.utils.parseEther('50'),
        ethers.utils.parseEther('100'), 0, await alice.getAddress(), FOREVER)
    ).to.be.revertedWith('IbTokenRouter: require more token than amountTokenMin')
    expect(await lp.balanceOf(await alice.getAddress())).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should revert when add liquidity to ibWBTC-ALPACA with too little ALPACA', async () => {
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('100'));
    await wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('1'));
    await expect(
      ibTokenRouterAsAlice.addLiquidityToken(
        ethers.utils.parseEther('1'), 0, ethers.utils.parseEther('100'),
        ethers.utils.parseEther('1000'), await alice.getAddress(), FOREVER)
    ).to.be.revertedWith('PancakeRouter: INSUFFICIENT_A_AMOUNT');
    expect(await lp.balanceOf(await alice.getAddress())).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should be able to add liquidity with excess WBTC and get dust WBTC back', async () => {
    // approve ibTokenRouter to spend ALPACA and WBTC
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('100'));
    await wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('10'));

    const aliceWBTCBalanceBefore = await wbtc.balanceOf(await alice.getAddress());
    const aliceALPACABalanceBefore = await govToken.balanceOf(await alice.getAddress());

    // Adding 100 ALPACA requires adding 1 ibWBTC
    // Deposit 1.045454545454545454 WBTC, yield 1 ibWTC
    // Only need 1.045454545454545454 WBTC, but add 10 WBTC
    await ibTokenRouterAsAlice.addLiquidityToken(
      ethers.utils.parseEther('10'), 0, ethers.utils.parseEther('100'), 0, await alice.getAddress(), FOREVER);

    expect(await lp.balanceOf(await alice.getAddress())).to.be.bignumber.above(ethers.utils.parseEther('0'));
    AssertHelpers.assertAlmostEqual(
      (await wbtcAsAlice.balanceOf(await alice.getAddress())).toString(),
      aliceWBTCBalanceBefore.sub(ethers.utils.parseEther('1.045454545454545454')).toString()
    );
    expect(await govToken.balanceOf(await alice.getAddress())).to.be.bignumber.equal(aliceALPACABalanceBefore.sub(ethers.utils.parseEther('100')));
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should be able to add liquidity with excess ALPACA and get dust ALPACA back', async () => {
    // approve ibTokenRouter to spend ALPACA and WBTC
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('100'));
    await wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('0.1'));

    const aliceWBTCBalanceBefore = await wbtc.balanceOf(await alice.getAddress());
    const aliceALPACABalanceBefore = await govToken.balanceOf(await alice.getAddress());

    // Add 100 ALPACA requires adding 1 ibWBTC
    // Deposit 0.1 WBTC, yield 0.095652173913043478 ibWBTC (1/1.045454545454545454*0.1)
    // Only need 9.565217391304347800 ALPACA, but 100 ALPACA is provided
    await ibTokenRouterAsAlice.addLiquidityToken(
      ethers.utils.parseEther('0.1'), 0, ethers.utils.parseEther('100'), 0, await alice.getAddress(), FOREVER);

    expect(await lp.balanceOf(await alice.getAddress())).to.be.bignumber.above(ethers.utils.parseEther('0'));
    AssertHelpers.assertAlmostEqual(
      (await wbtc.balanceOf(await alice.getAddress())).toString(),
      aliceWBTCBalanceBefore.sub(ethers.utils.parseEther('0.1')).toString()
    );
    expect(await govToken.balanceOf(await alice.getAddress())).to.be.bignumber.equal(
      aliceALPACABalanceBefore.sub(ethers.utils.parseEther('9.565217391304347800'))
    );
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should be able to add liquidity optimally with only ibWBTC', async () => {
    await vaultAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('5'));

    const aliceIbWBTCBalanceBefore = await vault.balanceOf(await alice.getAddress());

    // Sending 5 ibWBTC, 5*0.5 = 2.5 ibWBTC should be used to swap optimally for ALPACA
    // Should get slightly less than 250 ALPACA from swap.
    // So should add liquidity total of ~250 ALPACA and ~2.5 ibWBTC and get ~25 lpToken
    await ibTokenRouterAsAlice.addLiquidityTwoSidesOptimal(
      ethers.utils.parseEther('5'), 0, 0, await alice.getAddress(), FOREVER);

    expect(await lp.balanceOf(await alice.getAddress())).to.be.bignumber.equal(ethers.utils.parseEther('24.670357097439839692'));
    AssertHelpers.assertAlmostEqual(
      (await vault.balanceOf(await alice.getAddress())).toString(),
      aliceIbWBTCBalanceBefore.sub(ethers.utils.parseEther('5')).toString()
    );
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should be able to add liquidity optimally with only ALPACA', async () => {
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('50'));

    const aliceALPACABalanceBefore = await govToken.balanceOf(await alice.getAddress());

    // Sending 50 ALPACA, 50*0.5 = 25 ALPACA should be used to swap optimally for ibWBTC
    // Should get slightly less than 0.25 ibWBTC from swap.
    // So should add liquidity total of ~25 ALPACA and ~0.25 ibWBTC and get ~2.5 lpToken
    await ibTokenRouterAsAlice.addLiquidityTwoSidesOptimal(
      0, ethers.utils.parseEther('50'), 0, await alice.getAddress(), FOREVER);

    expect(await lp.balanceOf(await alice.getAddress())).to.be.bignumber.equal(ethers.utils.parseEther('2.494383409113283473'));
    AssertHelpers.assertAlmostEqual(
      (await govToken.balanceOf(await alice.getAddress())).toString(),
      aliceALPACABalanceBefore.sub(ethers.utils.parseEther('50')).toString()
    );
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should be able to add liquidity optimally with more ibWBTC than required', async () => {
    await vaultAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('5'));
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('50'));

    const aliceALPACABalanceBefore = await govToken.balanceOf(await alice.getAddress());
    const aliceIbWBTCalanceBefore = await vault.balanceOf(await alice.getAddress());

    // Add 50 ALPACA requires adding 0.5 ibWBTC
    // Sending 5 ibWBTC, (5-0.5)*0.5 = 2.25 ibWBTC should be used to swap optimally for ALPACA
    // Should get slightly less than 225 ALPACA from swap.
    // So should add liquidity total of ~275 ALPACA and ~2.75 ibWBTC and get ~27.5 lpToken
    await ibTokenRouterAsAlice.addLiquidityTwoSidesOptimal(
      ethers.utils.parseEther('5'), ethers.utils.parseEther('50'), 0, await alice.getAddress(), FOREVER);

    expect(await lp.balanceOf(await alice.getAddress())).to.be.bignumber.equal(ethers.utils.parseEther('27.231344441127665977'));
    AssertHelpers.assertAlmostEqual(
      (await govToken.balanceOf(await alice.getAddress())).toString(),
      aliceALPACABalanceBefore.sub(ethers.utils.parseEther('50')).toString()
    );
    AssertHelpers.assertAlmostEqual(
      (await vault.balanceOf(await alice.getAddress())).toString(),
      aliceIbWBTCalanceBefore.sub(ethers.utils.parseEther('5')).toString()
    );
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should be able to add liquidity optimally with more ALPACA than required', async () => {
    await vaultAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('0.1'));
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('50'));

    const aliceALPACABalanceBefore = await govToken.balanceOf(await alice.getAddress());
    const aliceIbWBTCBalanceBefore = await vault.balanceOf(await alice.getAddress());

    // Add 0.1 ibWBTC requires adding 10 ALPACA
    // Sending 50 ALPACA, (50-10)*0.5 = 20 ALPACA should be used to swap optimally for ibWBTC
    // Should get slightly less than 0.2 ibWBTC from swap.
    // So should add liquidity total of ~30 ALPACA and ~0.3 ibWBTC and get ~3 lpToken
    await ibTokenRouterAsAlice.addLiquidityTwoSidesOptimal(
      ethers.utils.parseEther('0.1'), ethers.utils.parseEther('50'), 0, await alice.getAddress(), FOREVER);

    expect(await lp.balanceOf(await alice.getAddress())).to.be.bignumber.equal(ethers.utils.parseEther('2.996005976077707108'));
    AssertHelpers.assertAlmostEqual(
      (await govToken.balanceOf(await alice.getAddress())).toString(),
      aliceALPACABalanceBefore.sub(ethers.utils.parseEther('50')).toString()
    );
    AssertHelpers.assertAlmostEqual(
      (await vault.balanceOf(await alice.getAddress())).toString(),
      aliceIbWBTCBalanceBefore.sub(ethers.utils.parseEther('0.1')).toString()
    );
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should revert when add liquidity optimally with less lpToken than minumum specified', async () => {
    await vaultAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('0.1'));
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('50'));

    const aliceALPACABalanceBefore = await govToken.balanceOf(await alice.getAddress());
    const aliceIbWBTCBalanceBefore = await vault.balanceOf(await alice.getAddress());

    // Add 0.1 ibWBTC requires adding 10 ALPACA
    // Sending 50 ALPACA, (50-10)*0.5 = 20 ALPACA should be used to swap optimally for ibWBTC
    // Should get slightly less than 0.2 ibWBTC from swap.
    // So should add liquidity total of ~30 ALPACA and ~0.3 ibWBTC and get ~3 lpToken, but require at least 100 lpToken
    await expect(
      ibTokenRouterAsAlice.addLiquidityTwoSidesOptimal(
        ethers.utils.parseEther('0.1'), ethers.utils.parseEther('50'),
        ethers.utils.parseEther('100'), await alice.getAddress(), FOREVER)
    ).to.be.revertedWith('IbTokenRouter: receive less lpToken than amountLPMin');

    expect(await lp.balanceOf(await alice.getAddress())).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await govToken.balanceOf(await alice.getAddress())).to.be.bignumber.equal(aliceALPACABalanceBefore);
    expect(await vault.balanceOf(await alice.getAddress())).to.be.bignumber.equal(aliceIbWBTCBalanceBefore);
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should be able to add liquidity optimally with only WBTC', async () => {
    await wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('5'));

    const aliceWBTCBalanceBefore = await wbtc.balanceOf(await alice.getAddress());

    // Depositing 5 WBTC yield 4.7826087 ibWBTC (1/1.045454545454545454*5)
    // Sending 4.7826087 ibWBTC, 4.7826087*0.5 = 2.39130435 ibWBTC should be used to swap optimally for ALPACA
    // Should get slightly less than 239.130435 ALPACA from swap.
    // So should add liquidity total of ~239.13 ALPACA and ~2.39 ibWBTC and get ~23.9 lpToken
    await ibTokenRouterAsAlice.addLiquidityTwoSidesOptimalToken(
      ethers.utils.parseEther('5'), 0, 0, await alice.getAddress(), FOREVER);

    expect(await lp.balanceOf(await alice.getAddress())).to.be.bignumber.equal(ethers.utils.parseEther('23.610108879532197459'));
    AssertHelpers.assertAlmostEqual(
      (await wbtc.balanceOf(await alice.getAddress())).toString(),
      aliceWBTCBalanceBefore.sub(ethers.utils.parseEther('5')).toString()
    )
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should be able to add liquidity optimally with more WBTC than required', async () => {
    await wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('5'));
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('50'));

    const aliceWBTCBalanceBefore = await wbtc.balanceOf(await alice.getAddress());
    const aliceALPACABalanceBefore = await govToken.balanceOf(await alice.getAddress());

    // Add 50 ALPACA requires adding 0.5 ibWBTC
    // Depositing 5 WBTC yield 4.7826087 ibWBTC
    // Sending 4.7826087 ibWBTC, (4.7826087-0.5)*0.5 = 2.14130435 ibWBTC should be used to swap optimally for ALPACA
    // Should get slightly less than 214.130435 ALPACA from swap.
    // So should add liquidity total of ~264 ALPACA and ~2.64 ibWBTC and get ~26.4 lpToken
    await ibTokenRouterAsAlice.addLiquidityTwoSidesOptimalToken(
      ethers.utils.parseEther('5'), ethers.utils.parseEther('50'), 0, await alice.getAddress(), FOREVER);

    expect(await lp.balanceOf(await alice.getAddress())).to.be.bignumber.equal(ethers.utils.parseEther('26.168448910231942973'));
    AssertHelpers.assertAlmostEqual(
      (await govToken.balanceOf(await alice.getAddress())).toString(),
      aliceALPACABalanceBefore.sub(ethers.utils.parseEther('50')).toString(),
    )
    AssertHelpers.assertAlmostEqual(
      (await wbtc.balanceOf(await alice.getAddress())).toString(),
      aliceWBTCBalanceBefore.sub(ethers.utils.parseEther('5')).toString(),
    )
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should be able to add liquidity optimally with less WBTC than required', async () => {
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('50'));
    await wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('0.1'));

    const aliceALPACABalanceBefore = await govToken.balanceOf(await alice.getAddress());
    const aliceWBTCBalanceBefore = await wbtc.balanceOf(await alice.getAddress());

    // Depositing 0.1 WBTC yield 0.095652174 ibWBTC
    // Add 0.095652174 ibWBTC requires adding 9.5652174 ALPACA
    // Sending 50 ALPACA, (50-9.5652174)*0.5 = 20.2173913 ALPACA should be used to swap optimally for ibWBTC
    // Should get slightly less than 0.202 ibWBTC from swap.
    // So should add liquidity total of ~29.7826087 ALPACA and ~0.297 ibWBTC and get ~2.97 lpToken
    await ibTokenRouterAsAlice.addLiquidityTwoSidesOptimalToken(
      ethers.utils.parseEther('0.1'), ethers.utils.parseEther('50'), 0, await alice.getAddress(), FOREVER);

    expect(await lp.balanceOf(await alice.getAddress())).to.be.bignumber.equal(ethers.utils.parseEther('2.974201500410627734'));
    AssertHelpers.assertAlmostEqual(
      (await govToken.balanceOf(await alice.getAddress())).toString(),
      aliceALPACABalanceBefore.sub(ethers.utils.parseEther('50')).toString(),
    );
    AssertHelpers.assertAlmostEqual(
      (await wbtc.balanceOf(await alice.getAddress())).toString(),
      aliceWBTCBalanceBefore.sub(ethers.utils.parseEther('0.1')).toString(),
    )
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should revert when add liquidity optimally WBTC with less lpToken than minumum specified', async () => {
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('50'));
    await wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('5'));

    const aliceALPACABalanceBefore = await govToken.balanceOf(await alice.getAddress());
    const aliceWBTCBalanceBefore = await wbtc.balanceOf(await alice.getAddress());

    // Add 50 ALPACA requires adding 0.5 ibWBTC
    // Depositing 5 WBTC yield 4.7826087 ibWBTC
    // Sending 4.7826087 ibWBTC, (4.7826087-0.5)*0.5 = 2.14130435 ibWBTC should be used to swap optimally for ALPACA
    // Should get slightly less than 214.130435 ALPACA from swap.
    // So should add liquidity total of ~264 ALPACA and ~2.64 ibWBTC and get ~26.4 lpToken
    // but lpTokenMin is 100 hence this should revert
    await expect(
      ibTokenRouterAsAlice.addLiquidityTwoSidesOptimalToken(
        ethers.utils.parseEther('5'), ethers.utils.parseEther('50'),
        ethers.utils.parseEther('100'), await alice.getAddress(), FOREVER)
    ).to.be.revertedWith('IbTokenRouter: receive less lpToken than amountLPMin');

    expect(await lp.balanceOf(await alice.getAddress())).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await govToken.balanceOf(await alice.getAddress())).to.be.bignumber.equal(aliceALPACABalanceBefore);
    AssertHelpers.assertAlmostEqual(
      (await wbtc.balanceOf(await alice.getAddress())).toString(),
      aliceWBTCBalanceBefore.toString(),
    )
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should be able to remove liquidity and get WBTC and ALPACA back', async () => {
    await wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('1'));
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('100'));
    await ibTokenRouterAsAlice.addLiquidityToken(
      ethers.utils.parseEther('1'), 0, ethers.utils.parseEther('100'), 0, await alice.getAddress(), FOREVER);

    const aliceLPBalanceBefore = await lp.balanceOf(await alice.getAddress());
    const aliceALPACABalanceBefore = await govToken.balanceOf(await alice.getAddress());
    const aliceWBTCBalanceBefore = await wbtc.balanceOf(await alice.getAddress());

    expect(aliceLPBalanceBefore).to.be.bignumber.above(ethers.utils.parseEther('0'));

    // Deposit 1 WBTC, yield 0.95652173913043478 ibWBTC
    // Add liquidity with 0.95652173913043478 ibWBTC and 95.652173913043478 ALPACA
    // So, removeLiquidity should get 1 WBTC and 95.652173913043478 ALPACA back
    await lpAsAlice.approve(ibTokenRouter.address, aliceLPBalanceBefore);
    await ibTokenRouterAsAlice.removeLiquidityToken(
      aliceLPBalanceBefore, 0, 0, await alice.getAddress(), FOREVER);

    expect(await lp.balanceOf(await alice.getAddress())).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await govToken.balanceOf(await alice.getAddress())).to.be.bignumber.equal(
      aliceALPACABalanceBefore.add(ethers.utils.parseEther('95.652173913043478200'))
    );
    AssertHelpers.assertAlmostEqual(
      (await wbtc.balanceOf(await alice.getAddress())).toString(),
      aliceWBTCBalanceBefore.add(ethers.utils.parseEther('1')).toString(),
    );
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should revert when remove liquidity and receive too little WBTC', async () => {
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('100'));
    await wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('1'));

    await ibTokenRouterAsAlice.addLiquidityToken(
      ethers.utils.parseEther('1'), 0, ethers.utils.parseEther('100'), 0, await alice.getAddress(), FOREVER);

    const aliceLPBalanceBefore = await lp.balanceOf(await alice.getAddress());

    expect(aliceLPBalanceBefore).to.be.bignumber.above(ethers.utils.parseEther('0'));

    // Deposit 1 WBTC, yield 0.95652173913043478 ibWBTC
    // Add liquidity with 0.95652173913043478 ibWBTC and 95.65217391304347800 ALPACA
    // So, removeLiquidity should get 1 WBTC and 95.65217391304347800 ALPACA back
    await lpAsAlice.approve(ibTokenRouter.address, aliceLPBalanceBefore);
    await expect(
      ibTokenRouterAsAlice.removeLiquidityToken(
        aliceLPBalanceBefore, 0, ethers.utils.parseEther('100'), await alice.getAddress(), FOREVER)
    ).to.be.revertedWith('IbTokenRouter: receive less Token than amountTokenmin');

    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should revert when remove liquidity and receive too little ALPACA', async () => {
    await wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('1'));
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('100'));

    await ibTokenRouterAsAlice.addLiquidityToken(
      ethers.utils.parseEther('1'), 0,
      ethers.utils.parseEther('100'), 0, await alice.getAddress(), FOREVER);

    const aliceLPBalanceBefore = await lp.balanceOf(await alice.getAddress());

    expect(aliceLPBalanceBefore).to.be.bignumber.above(ethers.utils.parseEther('0'));

    // Deposit 1 WBTC, yield 0.95652173913043478 ibWBTC
    // Add liquidity with 0.95652173913043478 ibWBTC and 95.65217391304347800 ALPACA
    // So, removeLiquidity should get 1 WBTC and 95.65217391304347800 ALPACA back
    await lpAsAlice.approve(ibTokenRouter.address, aliceLPBalanceBefore);

    await expect(
      ibTokenRouterAsAlice.removeLiquidityToken(
        aliceLPBalanceBefore, ethers.utils.parseEther('1000'), 0, await alice.getAddress(), FOREVER
      )
    ).to.be.revertedWith('PancakeRouter: INSUFFICIENT_A_AMOUNT');
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should be able to remove liquidity (all ALPACA) and get only ALPACA back', async () => {
    await wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('1'));
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('100'));

    await ibTokenRouterAsAlice.addLiquidityToken(
      ethers.utils.parseEther('1'), 0, ethers.utils.parseEther('100'), 0, await alice.getAddress(), FOREVER);

    const aliceLPBalanceBefore = await lp.balanceOf(await alice.getAddress());
    const aliceALPACABalanceBefore = await govToken.balanceOf(await alice.getAddress());
    const aliceWBTCBalanceBefore = await wbtc.balanceOf(await alice.getAddress());

    expect(aliceLPBalanceBefore).to.be.bignumber.above(ethers.utils.parseEther('0'));

    // Deposit 1 WBTC, yield 0.95652173913043478 ibWBTC
    // Add liquidity with 0.95652173913043478 ibWBTC and 95.65217391304347800 ALPACA
    // So, removeLiquidityAllAlpha should get slightly less than 2*95.65217391304347800 = 191.21 ALPACA (190.210382595723081026)
    await lpAsAlice.approve(ibTokenRouter.address, aliceLPBalanceBefore);
    await ibTokenRouterAsAlice.removeLiquidityAllAlpaca(aliceLPBalanceBefore, 0, await alice.getAddress(), FOREVER);

    expect(await lpAsAlice.balanceOf(await alice.getAddress())).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await govToken.balanceOf(await alice.getAddress())).to.be.bignumber.equal(
      aliceALPACABalanceBefore.add(ethers.utils.parseEther('190.210382595723081026'))
    );
    AssertHelpers.assertAlmostEqual(
      (await wbtc.balanceOf(await alice.getAddress())).toString(),
      aliceWBTCBalanceBefore.toString(),
    );
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should revert when remove liquidity (all ALPACA) and receive too little ALPACA', async () => {
    await wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('1'));
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('100'));

    await ibTokenRouterAsAlice.addLiquidityToken(
      ethers.utils.parseEther('1'), 0, ethers.utils.parseEther('100'), 0, await alice.getAddress(), FOREVER);

    const aliceLPBalanceBefore = await lp.balanceOf(await alice.getAddress());

    expect(aliceLPBalanceBefore).to.be.bignumber.above(ethers.utils.parseEther('0'));

    // Deposit 1 WBTC, yield 0.95652173913043478 ibWBTC
    // Add liquidity with 0.95652173913043478 ibWBTC and 95.65217391304347800 ALPACA
    // So, removeLiquidityAllAlpaca should get slightly less than 2*95.65217391304347800 = 191.304348 ALPACA (190.116529919717225111)back
    await lpAsAlice.approve(ibTokenRouter.address, aliceLPBalanceBefore);
    await expect(
      ibTokenRouterAsAlice.removeLiquidityAllAlpaca(
        aliceLPBalanceBefore, ethers.utils.parseEther('1000'), await alice.getAddress(), FOREVER)
    ).to.be.revertedWith('IbTokenRouter: receive less Alpaca than amountAlpacaMin');

    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should be able to swap exact WBTC for ALPACA', async () => {
    await wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('1'));

    const aliceWBTCBalanceBefore = await wbtc.balanceOf(await alice.getAddress());
    const aliceBalanceBefore = await govToken.balanceOf(await alice.getAddress());

    // 1 WBTC, yield 0.95652173913043478 ibWBTC
    // so should get slightly less than 95.6 ALPACA back (94.464356006673746911)
    await ibTokenRouterAsAlice.swapExactTokenForAlpaca(
      ethers.utils.parseEther('1'), 0, await alice.getAddress(), FOREVER);

    AssertHelpers.assertAlmostEqual(
      (await wbtc.balanceOf(await alice.getAddress())).toString(),
      aliceWBTCBalanceBefore.sub(ethers.utils.parseEther('1')).toString(),
    );
    expect(await govToken.balanceOf(await alice.getAddress())).to.be.bignumber.equal(aliceBalanceBefore.add(ethers.utils.parseEther('94.558208682679602826')));
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should revert when swap exact WBTC for ALPACA and receive too little ALPACA', async () => {
    wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('1'))

    await expect(
      ibTokenRouterAsAlice.swapExactTokenForAlpaca(
        ethers.utils.parseEther('1'), ethers.utils.parseEther('1000'), await alice.getAddress(), FOREVER
      )
    ).to.be.revertedWith('PancakeRouter: INSUFFICIENT_OUTPUT_AMOUNT');

    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should be able to swap ALPACA for exact WBTC', async () => {
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('100'));

    const aliceWBTCBalanceBefore = await wbtc.balanceOf(await alice.getAddress());
    const aliceALPACABalanceBefore = await govToken.balanceOf(await alice.getAddress());

    // 0.9 WBTC, yield 0.860869565 ibWBTC
    // so should use slightly more than 86.08 ALPACA (87.008505213215660403)
    await ibTokenRouterAsAlice.swapAlpacaForExactToken(
      ethers.utils.parseEther('100'), ethers.utils.parseEther('0.9'), await alice.getAddress(), FOREVER
    );

    AssertHelpers.assertAlmostEqual(
      (await wbtc.balanceOf(await alice.getAddress())).toString(),
      aliceWBTCBalanceBefore.add(ethers.utils.parseEther('0.9')).toString(),
    );
    expect(await govToken.balanceOf(await alice.getAddress())).to.be.bignumber.equal(
      aliceALPACABalanceBefore.sub(ethers.utils.parseEther('87.008505213215660403'))
    );
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should revert when swap ALPACA for exact WBTC given too little ALPACA given', async () => {
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('100'));

    // 0.9 WBTC, yield 0.860869565 ibWBTC
    // so should use slightly more than 86.08 ALPACA (87.095775529377361063)
    await expect(
      ibTokenRouterAsAlice.swapAlpacaForExactToken(
        ethers.utils.parseEther('1'), ethers.utils.parseEther('0.9'), await alice.getAddress(), FOREVER
      )
    ).to.be.revertedWith('PancakeRouter: EXCESSIVE_INPUT_AMOUNT');

    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should be able to swap exact ALPACA for WBTC', async () => {
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('100'));

    const aliceWBTCBalanceBefore = await wbtc.balanceOf(await alice.getAddress());
    const aliceALPACABalanceBefore = await govToken.balanceOf(await alice.getAddress());

    // 100 ALPACA, yield 1 ibWBTC
    // so should get slightly less than 1.045 ALPACA (1.032028854142382266)
    await ibTokenRouterAsAlice.swapExactAlpacaForToken(
      ethers.utils.parseEther('100'), 0, await alice.getAddress(), FOREVER);

    AssertHelpers.assertAlmostEqual(
      (await wbtc.balanceOf(await alice.getAddress())).toString(),
      aliceWBTCBalanceBefore.add(ethers.utils.parseEther('1.032028854142382266')).toString()
    );
    expect(await govToken.balanceOf(await alice.getAddress())).to.be.bignumber.equal(aliceALPACABalanceBefore.sub(ethers.utils.parseEther('100')));
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should revert when swap exact ALPACA for WBTC and receive too little WBTC given', async () => {
    await govTokenAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('100'));

    // 100 ALPACA, yield 1 ibWBTC
    // so should get slightly less than 1.045 ALPACA (1.032028854142382266)
    await expect(
      ibTokenRouterAsAlice.swapExactAlpacaForToken(
        ethers.utils.parseEther('100'), ethers.utils.parseEther('1000'), await alice.getAddress(), FOREVER)
    ).to.be.revertedWith('IbTokenRouter: receive less Token than amountTokenmin');

    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should be able to swap WBTC for exact ALPACA with dust WBTC back', async () => {
    wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('1.1'));

    const aliceWBTCBalanceBefore = await wbtc.balanceOf(await alice.getAddress());
    const aliceALPACABalanceBefore = await govToken.balanceOf(await alice.getAddress());

    // 100 ALPACA need ~1 ibWBTC
    // Deposit 1.045454545454545454 WBTC, yield 1 ibWBTC
    // so should get add slightly more than 1.045 WBTC (1.059192269185886404 WBTC)
    await ibTokenRouterAsAlice.swapTokenForExactAlpaca(
      ethers.utils.parseEther('1.1'), ethers.utils.parseEther('100'), await alice.getAddress(), FOREVER);

    AssertHelpers.assertAlmostEqual(
      (await wbtc.balanceOf(await alice.getAddress())).toString(),
      aliceWBTCBalanceBefore.sub(ethers.utils.parseEther('1.059192269185886404')).toString()
    );
    expect(await govToken.balanceOf(await alice.getAddress())).to.be.bignumber.equal(aliceALPACABalanceBefore.add(ethers.utils.parseEther('100')));
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should be able to swap WBTC for exact ALPACA with no dust WBTC back', async () => {
    wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('1.059192269185886403'));

    const aliceWBTCBalanceBefore = await wbtc.balanceOf(await alice.getAddress());
    const aliceALPACABalanceBefore = await govToken.balanceOf(await alice.getAddress());

    // 100 ALPACA need ~1 ibWBTC
    // Deposit 1.045454545454545454 WBTC, yield 1 ibWBTC
    // so should get add slightly more than 1.045 WBTC (1.059192269185886404 WBTC)
    await ibTokenRouterAsAlice.swapTokenForExactAlpaca(
      ethers.utils.parseEther('1.059192269185886403'), ethers.utils.parseEther('100'), await alice.getAddress(), FOREVER);

    AssertHelpers.assertAlmostEqual(
      (await wbtc.balanceOf(await alice.getAddress())).toString(),
      aliceWBTCBalanceBefore.sub(ethers.utils.parseEther('1.059192269185886404')).toString(),
    );
    expect(await govToken.balanceOf(await alice.getAddress())).to.be.bignumber.equal(aliceALPACABalanceBefore.add(ethers.utils.parseEther('100')));
    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });

  it('should revert when swap WBTC for exact ALPACA given too little WBTC', async () => {
    wbtcAsAlice.approve(ibTokenRouter.address, ethers.utils.parseEther('0.1'));

    await expect(
      ibTokenRouterAsAlice.swapTokenForExactAlpaca(
        ethers.utils.parseEther('0.1'), ethers.utils.parseEther('100'), await alice.getAddress(), FOREVER)
    ).to.be.revertedWith('PancakeRouter: EXCESSIVE_INPUT_AMOUNT');

    expect(await govToken.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await vault.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));
    expect(await wbtc.balanceOf(ibTokenRouter.address)).to.be.bignumber.equal(ethers.utils.parseEther('0'));

    // expect approval to be reset
    expect(await lp.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await govToken.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await vault.allowance(ibTokenRouter.address, router.address)).to.be.bignumber.eq('0');
    expect(await wbtc.allowance(ibTokenRouter.address, vault.address)).to.be.bignumber.eq('0');
  });
});