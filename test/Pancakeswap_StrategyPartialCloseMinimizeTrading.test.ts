import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet, BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import * as TestHelpers from './helpers/assert'
import {
  MockERC20,
  MockERC20__factory,
  PancakeFactory,
  PancakeFactory__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouter,
  PancakeRouter__factory,
  StrategyPartialMinimizeTrading,
  StrategyPartialMinimizeTrading__factory,
  WETH,
  WETH__factory,
  WNativeRelayer__factory
} from "../typechain";

chai.use(solidity);
const { expect } = chai;

describe('Pancakeswap - StrategyPartialCloseWithdrawMinimizeTrading', () => {
  const FOREVER = '2000000000';
  const BOB_LPs = '0.316227766016837933';

  /// Pancake-related instance(s)
  let factory: PancakeFactory;
  let router: PancakeRouter;
  let lp: PancakePair;
  let baseTokenWbnbLp: PancakePair;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy-ralted instance(s)
  let strat: StrategyPartialMinimizeTrading;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let baseTokenWbnbLpAsBob: PancakePair;

  let lpAsAlice: PancakePair;
  let lpAsBob: PancakePair;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerAsAlice: PancakeRouter;
  let routerAsBob: PancakeRouter;

  let stratAsAlice: StrategyPartialMinimizeTrading;
  let stratAsBob: StrategyPartialMinimizeTrading;

  let wbnbAsAlice: WETH;
  let wbnbAsBob: WETH;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    // Setup Pancake
    const PancakeFactory = (await ethers.getContractFactory(
      "PancakeFactory",
      deployer
    )) as PancakeFactory__factory;
    factory = await PancakeFactory.deploy((await deployer.getAddress()));
    await factory.deployed();

    const WETH = (await ethers.getContractFactory(
      "WETH",
      deployer
    )) as WETH__factory;
    wbnb = await WETH.deploy();
    await wbnb.deployed();

    const PancakeRouter = (await ethers.getContractFactory(
      "PancakeRouter",
      deployer
    )) as PancakeRouter__factory;
    router = await PancakeRouter.deploy(factory.address, wbnb.address);
    await router.deployed();

    /// Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory(
      "MockERC20",
      deployer
    )) as MockERC20__factory
    baseToken = await upgrades.deployProxy(MockERC20, ['BTOKEN', 'BTOKEN']) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther('100'));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther('100'));
    farmingToken = await upgrades.deployProxy(MockERC20, ['FTOKEN', 'FTOKEN']) as MockERC20;
    await farmingToken.deployed();
    await farmingToken.mint(await alice.getAddress(), ethers.utils.parseEther('1'));
    await farmingToken.mint(await bob.getAddress(), ethers.utils.parseEther('1'));

    await factory.createPair(baseToken.address, farmingToken.address);
    await factory.createPair(baseToken.address, wbnb.address);

    lp = PancakePair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);
    baseTokenWbnbLp = PancakePair__factory.connect(await factory.getPair(wbnb.address, baseToken.address), deployer);

    /// Setup WNativeRelayer
    const WNativeRelayer = (await ethers.getContractFactory(
      'WNativeRelayer',
      deployer
    )) as WNativeRelayer__factory;
    const wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
    await wNativeRelayer.deployed();

    /// Setup StrategyPartialMinimizeTrading
    const StrategyPartialMinimizeTrading = (await ethers.getContractFactory(
      "StrategyPartialMinimizeTrading",
      deployer
    )) as StrategyPartialMinimizeTrading__factory;
    strat = await upgrades.deployProxy(
        StrategyPartialMinimizeTrading,
        [router.address, wbnb.address, wNativeRelayer.address]) as StrategyPartialMinimizeTrading;
    await strat.deployed();

    await wNativeRelayer.setCallerOk([strat.address], true);

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    baseTokenWbnbLpAsBob = PancakePair__factory.connect(baseTokenWbnbLp.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerAsAlice = PancakeRouter__factory.connect(router.address, alice);
    routerAsBob = PancakeRouter__factory.connect(router.address, bob);

    lpAsAlice = PancakePair__factory.connect(lp.address, alice);
    lpAsBob = PancakePair__factory.connect(lp.address, bob);

    stratAsAlice = StrategyPartialMinimizeTrading__factory.connect(strat.address, alice);
    stratAsBob = StrategyPartialMinimizeTrading__factory.connect(strat.address, bob);

    wbnbAsAlice = WETH__factory.connect(wbnb.address, alice);
    wbnbAsBob = WETH__factory.connect(wbnb.address, bob);
  });

  context('It should convert LP tokens and farming token', () => {
    beforeEach(async () => {
      // Alice adds 0.1 FTOKEN + 1 BaseToken
      await baseTokenAsAlice.approve(router.address, ethers.utils.parseEther('1'));
      await farmingTokenAsAlice.approve(router.address, ethers.utils.parseEther('0.1'));
      await routerAsAlice.addLiquidity(
        baseToken.address, farmingToken.address,
        ethers.utils.parseEther('1'), ethers.utils.parseEther('0.1'), '0', '0', await alice.getAddress(), FOREVER);

      // Bob tries to add 1 FTOKEN + 1 BaseToken (but obviously can only add 0.1 FTOKEN)
      await baseTokenAsBob.approve(router.address, ethers.utils.parseEther('1'));
      await farmingTokenAsBob.approve(router.address, ethers.utils.parseEther('1'));
      await routerAsBob.addLiquidity(
        baseToken.address, farmingToken.address,
        ethers.utils.parseEther('1'), ethers.utils.parseEther('1'), '0', '0', await bob.getAddress(), FOREVER);

      expect(await farmingToken.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0.9'));
      expect(await lp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther(BOB_LPs));

      await lpAsBob.transfer(strat.address, ethers.utils.parseEther(BOB_LPs));
    });

    it('should revert when bad call data', async () => {
      // Bob passes some bad calldata that can't be decoded
      await expect(
        stratAsBob.execute(await bob.getAddress(), '0', '0x1234')
      ).to.be.reverted;
    });

    it('should revert when the given LPs are liquidated but slippage > minFarmingToken', async () => {
      // Bob uses partial close minimize trading strategy to turn LPs back to farming with an unreasonable expectation
      await expect(
        stratAsBob.execute(
          await bob.getAddress(),
          ethers.utils.parseEther('1'),
          ethers.utils.defaultAbiCoder.encode([
            'address',
            'address',
            'uint256',
            'uint256',
            'uint256'
          ], [
            baseToken.address,
            farmingToken.address,
            ethers.utils.parseEther(BOB_LPs),
            ethers.utils.parseEther('9999999999'),
            ethers.utils.parseEther('2')
          ]),
        ),
      ).to.be.revertedWith('StrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received')
    });

    it('should revert when Bob ask to exit with higher LPs than he has in position', async () => {
      await expect(
        stratAsBob.execute(
          await bob.getAddress(),
          ethers.utils.parseEther('1'),
          ethers.utils.defaultAbiCoder.encode([
            'address',
            'address',
            'uint256',
            'uint256',
            'uint256'
          ], [
            baseToken.address,
            farmingToken.address,
            ethers.utils.parseEther('8888888888'),
            ethers.utils.parseEther('9999999999'),
            ethers.utils.parseEther('2')
          ]),
        ),
      ).to.be.revertedWith('StrategyPartialCloseMinimizeTrading::execute:: insufficient LP amount recevied from worker')
    });

    it('should convert all LPs back to BTOKEN + FTOKEN, and use all of BTOKEN to pay debt, when maxReturn >= debt && debt == received BaseToken', async () => {
      const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFTOKENBefore = await farmingToken.balanceOf(await bob.getAddress());

      // Bob uses minimize trading strategy to turn LPs back to BaseToken and FTOKEN
      await stratAsBob.execute(
        await bob.getAddress(),
        ethers.utils.parseEther('1'), // debt 1 BaseToken
        ethers.utils.defaultAbiCoder.encode(
          [
            'address',
            'address',
            'uint256',
            'uint256',
            'uint256'
          ], [
            baseToken.address,
            farmingToken.address,
            ethers.utils.parseEther(BOB_LPs),
            ethers.utils.parseEther('8888888'),
            ethers.utils.parseEther('0.001')
          ])
      );

      const bobBaseTokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobFTOKENAfter = await farmingToken.balanceOf(await bob.getAddress());
      
      // After the execution is done, there should no LPs left in strategy contract
      expect(await lp.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      // Bob's LPs must be 0 due to returnLpToken == LPs he transfered to strategy contract
      expect(await lp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      // Bob should get 1 BTOKEN back due to he is a caller and strategy returns debt to caller
      // Please note that this 1 BTOKEN came from debt not the liquidation
      expect(bobBaseTokenAfter.sub(bobBaseTokenBefore)).to.be.bignumber.eq(ethers.utils.parseEther('1'));
      // Bob should get 0.1 FTOKEN back due to he is a user in this execution
      expect(bobFTOKENAfter.sub(bobFTOKENBefore)).to.be.bignumber.eq(ethers.utils.parseEther('0.1'));
    });

    it('should convert all LP tokens back to BTOKEN + FTOKEN, and return leftover both BTOKEN + FTOKEN to Bob, when maxReturn >= debt && debt < received BaseToken', async () => {
      const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFtokenBefore = await farmingToken.balanceOf(await bob.getAddress());

      // Bob uses liquidate strategy to turn LPs back to BTOKEN and FTOKEN
      await stratAsBob.execute(
        await bob.getAddress(), // User is Bob
        ethers.utils.parseEther('0.5'), // Debt 0.5 BTOKEN
        ethers.utils.defaultAbiCoder.encode(
          [
            'address',
            'address',
            'uint256',
            'uint256',
            'uint256'
          ], [
            baseToken.address, // BTOKEN address
            farmingToken.address, // FTOKEN address
            ethers.utils.parseEther(BOB_LPs), // returnLpAmount
            ethers.utils.parseEther('8888888'), // maxReturn
            ethers.utils.parseEther('0.001') // minFarmingToken
          ]),
      );

      const bobBtokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobFtokenAfter = await farmingToken.balanceOf(await bob.getAddress());
      
      // After the execution is done, there should no LPs left in strategy contract
      expect(await lp.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      // Bob's LPs must be 0 due to returnLpToken == LPs he transfered to strategy contract
      expect(await lp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0'))
      // Bob should get 1 BTOKEN back due strategy returns 0.5 BTOKEN to caller
      // and another 0.5 BTOKEN to user. In this case, the caller and the user is Bob
      // Hence, 0.5 BTOKN for paying debt, and 0.5 BTOKEN for leftover
      expect(bobBtokenAfter.sub(bobBtokenBefore)).to.be.bignumber.eq(ethers.utils.parseEther('1'));
      // Bob should get 0.1 FTOKEN leftover back due to he is a user
      expect(bobFtokenAfter.sub(bobFtokenBefore)).to.be.bignumber.eq(ethers.utils.parseEther('0.1'));
    });

    it('should convert all LP tokens back to BTOKEN + FTOKEN when maxReturn >= debt && debt > received BTOKEN, however FTOKEN is enough to cover debt', async () => {
      const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFtokenBefore = await farmingToken.balanceOf(await bob.getAddress());

      // Bob uses withdraw minimize trading strategy to turn LPs back to BTOKEN and FTOKEN
      await stratAsBob.execute(
        await bob.getAddress(), // User is Bob
        ethers.utils.parseEther('1.2'), // Debt is 1.2 BTOKEN
        ethers.utils.defaultAbiCoder.encode(
          [
            'address',
            'address',
            'uint256',
            'uint256',
            'uint256'
          ], [
            baseToken.address, // BTOKEN address
            farmingToken.address, // FTOKEN address
            ethers.utils.parseEther(BOB_LPs), // returnLpAmount
            ethers.utils.parseEther('88888888'), // maxReturn
            ethers.utils.parseEther('0.001') // minFarmingToken
          ]
        ),
      );

      const bobBtokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobFtokenAfter = await farmingToken.balanceOf(await bob.getAddress());
      
      // After the execution is done, there should no LPs left in strategy contract
      expect(await lp.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      // Bob's LPs must be 0 due to returnLpToken == LPs he transfered to strategy contract
      expect(await lp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      // Bob should get 1.2 BTOKEN back strategy returns debt to caller
      expect(bobBtokenAfter.sub(bobBtokenBefore)).to.be.bignumber.eq(ethers.utils.parseEther('1.2'));
      // Some portion of FTOKEN needs to be converted to BTOKEN to pay the debt
      // Hence Bob get less FTOKEN than what he put in
      expect(bobFtokenAfter.sub(bobFtokenBefore)).to.be.bignumber.eq(ethers.utils.parseEther('0.074949899799599198')); // 0.1 - 0.025 = 0.075 farming token
    });

    it('should convert the given LP tokens back to BTOKEN + FTOKEN, and use all of BTOKEN that it got to pay debt, when maxReturn >= debt && debt == received BaseToken', async () => {
      const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFTOKENBefore = await farmingToken.balanceOf(await bob.getAddress());

      // Bob uses minimize trading strategy to turn LPs back to BaseToken and FTOKEN
      await stratAsBob.execute(
        await bob.getAddress(),
        ethers.utils.parseEther('0.5'), // debt 1 BaseToken
        ethers.utils.defaultAbiCoder.encode(
          [
            'address',
            'address',
            'uint256',
            'uint256',
            'uint256'
          ], [
            baseToken.address,
            farmingToken.address,
            ethers.utils.parseEther(BOB_LPs).div(2),
            ethers.utils.parseEther('8888888'),
            ethers.utils.parseEther('0.001')
          ])
      );

      const bobBaseTokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobFTOKENAfter = await farmingToken.balanceOf(await bob.getAddress());
      
      // After the execution is done, there should no LPs left in strategy contract
      expect(await lp.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      // Bob's LPs must be half due to returnLpToken < LPs he transfered to strategy contract
      expect(await lp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther(BOB_LPs).div(2).add(1));
      // Bob should get 0.5 BTOKEN back due to he is a caller and strategy returns debt to caller
      // Please note that this 0.5 BTOKEN came from debt not the liquidation
      expect(bobBaseTokenAfter.sub(bobBaseTokenBefore)).to.be.bignumber.eq(ethers.utils.parseEther('0.5'));
      // Bob should get 0.05 FTOKEN back due to he is a user in this execution
      // PS. he gets 0.049999999999999998 FTOKEN back due to rounding
      expect(bobFTOKENAfter.sub(bobFTOKENBefore)).to.be.bignumber.eq(ethers.utils.parseEther('0.049999999999999998'));
    })

    it('should convert the given LP tokens back to BTOKEN + FTOKEN, and return leftover both BTOKEN + FTOKEN to Bob, when maxReturn >= debt && debt < received BaseToken', async () => {
      const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFTOKENBefore = await farmingToken.balanceOf(await bob.getAddress());

      // Bob uses minimize trading strategy to turn LPs back to BaseToken and FTOKEN
      await stratAsBob.execute(
        await bob.getAddress(),
        ethers.utils.parseEther('0.25'), // debt 0.25 BaseToken
        ethers.utils.defaultAbiCoder.encode(
          [
            'address',
            'address',
            'uint256',
            'uint256',
            'uint256'
          ], [
            baseToken.address,
            farmingToken.address,
            ethers.utils.parseEther(BOB_LPs).div(2),
            ethers.utils.parseEther('8888888'),
            ethers.utils.parseEther('0.001')
          ])
      );

      const bobBaseTokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobFTOKENAfter = await farmingToken.balanceOf(await bob.getAddress());
      
      // After the execution is done, there should no LPs left in strategy contract
      expect(await lp.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      // Bob's LPs must be half due to returnLpToken < LPs he transfered to strategy contract
      expect(await lp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther(BOB_LPs).div(2).add(1));
      // Bob should get 0.5 BTOKEN back due to he is a caller and strategy returns debt to caller
      // Please note that this 0.5 BTOKEN came from:
      // - 0.25 debt payback to the original caller
      // - 0.25 leftover returns to the user
      // Bob gets all because he is both original caller and user
      // PS. he gets 0.499999999999999998 due to rounding
      expect(bobBaseTokenAfter.sub(bobBaseTokenBefore)).to.be.bignumber.eq(ethers.utils.parseEther('0.499999999999999998'));
      // Bob should get 0.05 FTOKEN back due to he is a user in this execution
      // PS. he gets 0.049999999999999998 FTOKEN back due to rounding
      expect(bobFTOKENAfter.sub(bobFTOKENBefore)).to.be.bignumber.eq(ethers.utils.parseEther('0.049999999999999999'));
    })

    it('should convert the given LP tokens back to BTOKEN + FTOKEN when maxReturn >= debt && debt > received BTOKEN, however FTOKEN is enough to cover debt', async () => {
      const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobFtokenBefore = await farmingToken.balanceOf(await bob.getAddress());

      // Bob uses withdraw minimize trading strategy to turn LPs back to BTOKEN and FTOKEN
      await stratAsBob.execute(
        await bob.getAddress(), // User is Bob
        ethers.utils.parseEther('0.75'), // Debt is 0.75 BTOKEN
        ethers.utils.defaultAbiCoder.encode(
          [
            'address',
            'address',
            'uint256',
            'uint256',
            'uint256'
          ], [
            baseToken.address, // BTOKEN address
            farmingToken.address, // FTOKEN address
            ethers.utils.parseEther(BOB_LPs).div(2), // returnLpAmount
            ethers.utils.parseEther('88888888'), // maxReturn
            ethers.utils.parseEther('0.001') // minFarmingToken
          ]
        ),
      );

      const bobBtokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobFtokenAfter = await farmingToken.balanceOf(await bob.getAddress());
      
      // After the execution is done, there should no LPs left in strategy contract
      expect(await lp.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      // Bob's LPs must be half due to returnLpToken is half of LPs he transfered to strategy contract
      expect(await lp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther(BOB_LPs).div(2).add(1));
      // Bob should get 0.75 BTOKEN back from strategy returns debt to caller
      expect(bobBtokenAfter.sub(bobBtokenBefore)).to.be.bignumber.eq(ethers.utils.parseEther('0.75'));
      // Some portion of FTOKEN needs to be converted to BTOKEN to pay the debt
      // Hence Bob get less FTOKEN than what he put in
      // Bob should get 0.05 - [(0.15*0.25*1000)/((1.5-0.25)*998)] = 0.019939879759519036 FTOKEN
      expect(bobFtokenAfter.sub(bobFtokenBefore)).to.be.bignumber.eq(ethers.utils.parseEther('0.019939879759519036'));
    });

    it('should revert when maxReturn >= debt && debt > received BTOKEN, but FTOKEN is not enough to cover the debt', async () => {
      await expect(
        stratAsBob.execute(
          await bob.getAddress(),
          ethers.utils.parseEther('3'), // Debt 3 BOTOKEN
          ethers.utils.defaultAbiCoder.encode(
            [
              'address',
              'address',
              'uint256',
              'uint256',
              'uint256'
            ], [
              baseToken.address,
              farmingToken.address,
              ethers.utils.parseEther(BOB_LPs),
              ethers.utils.parseEther('8888888888'),
              ethers.utils.parseEther('0.001')
            ]
          ),
        ),
      ).to.be.revertedWith('subtraction overflow')
    });

  });

  context('It should handle properly when the farming token is WBNB', () => {
    beforeEach(async () => {
      // Alice wrap BNB
      await wbnbAsAlice.deposit({ value: ethers.utils.parseEther('0.1') });
      // Alice adds 0.1 WBNB + 1 BaseToken
      await baseTokenAsAlice.approve(router.address, ethers.utils.parseEther('1'));
      await wbnbAsAlice.approve(router.address, ethers.utils.parseEther('0.1'));
      await routerAsAlice.addLiquidity(
        baseToken.address, wbnb.address,
        ethers.utils.parseEther('1'), ethers.utils.parseEther('0.1'), '0', '0', await alice.getAddress(), FOREVER);

      // Bob wrap BNB
      await wbnbAsBob.deposit({ value: ethers.utils.parseEther('1') });
      // Bob tries to add 1 WBNB + 1 BaseToken (but obviously can only add 0.1 WBNB)
      await baseTokenAsBob.approve(router.address, ethers.utils.parseEther('1'));
      await wbnbAsBob.approve(router.address, ethers.utils.parseEther('1'));
      await routerAsBob.addLiquidity(
        baseToken.address, wbnb.address,
        ethers.utils.parseEther('1'), ethers.utils.parseEther('1'), '0', '0', await bob.getAddress(), FOREVER);

      expect(await wbnb.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0.9'));
      expect(await baseTokenWbnbLp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0.316227766016837933'));
      expect(await wbnb.balanceOf(baseTokenWbnbLp.address)).to.be.bignumber.eq(ethers.utils.parseEther('0.2'));
      expect(await baseToken.balanceOf(baseTokenWbnbLp.address)).to.be.bignumber.eq(ethers.utils.parseEther('2'));

      await baseTokenWbnbLpAsBob.transfer(strat.address, ethers.utils.parseEther('0.316227766016837933'));
    });

    it('should revert when bad call data', async () => {
      // Bob passes some bad calldata that can't be decoded
      await expect(
        stratAsBob.execute(await bob.getAddress(), '0', '0x1234')
      ).to.be.reverted;
    });

    it('should revert when the given LPs are liquidated but slippage > minFarmingToken', async () => {
      // Bob uses withdraw minimize trading strategy to turn LPs back to farming with an unreasonable expectation
      await expect(
        stratAsBob.execute(
          await bob.getAddress(),
          ethers.utils.parseEther('1'),
          ethers.utils.defaultAbiCoder.encode(
            [
              'address',
              'address',
              'uint256',
              'uint256',
              'uint256'
            ],
            [
              baseToken.address,
              wbnb.address,
              ethers.utils.parseEther(BOB_LPs),
              ethers.utils.parseEther('1000000'),
              ethers.utils.parseEther('99999999999')
            ]),
        ),
      ).to.be.revertedWith('StrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received')
    });

    it('should revert when Bob ask to exit with higher LPs than he has in position', async () => {
      await expect(
        stratAsBob.execute(
          await bob.getAddress(),
          ethers.utils.parseEther('1'),
          ethers.utils.defaultAbiCoder.encode([
            'address',
            'address',
            'uint256',
            'uint256',
            'uint256'
          ], [
            baseToken.address,
            farmingToken.address,
            ethers.utils.parseEther('8888888888'),
            ethers.utils.parseEther('9999999999'),
            ethers.utils.parseEther('2')
          ]),
        ),
      ).to.be.revertedWith('StrategyPartialCloseMinimizeTrading::execute:: insufficient LP amount recevied from worker')
    });

    it('should convert all LPs back to BTOKEN + BNB as Bob, and use all of BTOKEN to pay debt, when maxReturn >= debt && debt == received BTOKEN', async () => {
      const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbBefore = await ethers.provider.getBalance(await bob.getAddress());

      // Bob uses minimize trading strategy to turn LPs back to BTOKEN and BNB
      // set gasPrice = 0 in order to assert native balance movement easier
      await stratAsBob.execute(
        await bob.getAddress(),
        ethers.utils.parseEther('1'), // debt 1 BTOKEN
        ethers.utils.defaultAbiCoder.encode(
          [
            'address',
            'address',
            'uint256',
            'uint256',
            'uint256'
          ],
          [
            baseToken.address,
            wbnb.address,
            ethers.utils.parseEther(BOB_LPs),
            ethers.utils.parseEther('88888'),
            ethers.utils.parseEther('0.001')
          ]),
        { gasPrice: 0 }
      );

      const bobBaseTokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbAfter = await ethers.provider.getBalance(await bob.getAddress());

      expect(await baseTokenWbnbLp.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      expect(await baseTokenWbnbLp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      // Bob still get 1 BTOKEN back due to Bob is a msg.sender
      expect(bobBaseTokenAfter.sub(bobBaseTokenBefore)).to.be.bignumber.eq(ethers.utils.parseEther('1'));
      TestHelpers.assertAlmostEqual(
        ethers.utils.parseEther('0.1').toString(),
        bobBnbAfter.sub(bobBnbBefore).toString()
      );
    });

    it('should convert all LP tokens back to BTOKEN + BNB, and return leftover for both BTOKEN + BNB to Bob, when maxReturn >= debt && debt < received BTOKEN', async () => {
      const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbBefore = await ethers.provider.getBalance(await bob.getAddress());

      // Bob uses minimize trading strategy to turn LPs back to BTOKEN and BNB
      // set gasPrice = 0 in order to assert native balance movement easier
      await stratAsBob.execute(
        await bob.getAddress(),
        ethers.utils.parseEther('0.5'), // debt 0.5 ETH
        ethers.utils.defaultAbiCoder.encode(
          [
            'address',
            'address',
            'uint256',
            'uint256',
            'uint256'
          ],
          [
            baseToken.address,
            wbnb.address,
            ethers.utils.parseEther(BOB_LPs),
            ethers.utils.parseEther('88888888'),
            ethers.utils.parseEther('0.001')
          ]
        ),
        { gasPrice: 0 }
      );

      const bobBtokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbAfter = await ethers.provider.getBalance(await bob.getAddress());

      expect(await baseTokenWbnbLp.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      expect(await baseTokenWbnbLp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0'))
      
      // The following conditions must be statisfied:
      // - Bob must have 1 BTOKEN in his wallet due to Bob is a msg.sender which get .5 debt
      // and StrategyWithdrawMinimizeTrading returns another .5 BTOKEN
      // - Bob should have 0.1 BNB in his wallet
      expect(bobBtokenAfter.sub(bobBtokenBefore)).to.be.bignumber.eq(ethers.utils.parseEther('1'));
      expect(ethers.utils.parseEther('0.1')).to.be.bignumber.eq(bobBnbAfter.sub(bobBnbBefore));
    });

    it('should convert all LP tokens back to BTOKEN + BNB when maxReturn >= debt && debt > received BTOKEN, however BNB is enough to cover debt', async () => {
      const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbBefore = await ethers.provider.getBalance(await bob.getAddress());

      // Bob uses withdraw minimize trading strategy to turn LPs back to BaseToken and BNB
      // set gasPrice = 0 in order to assert native balance movement easier
      await stratAsBob.execute(
        await bob.getAddress(),
        ethers.utils.parseEther('1.2'), // debt 1.2 BaseToken
        ethers.utils.defaultAbiCoder.encode(
          [
            'address',
            'address',
            'uint256',
            'uint256',
            'uint256'
          ],
          [
            baseToken.address,
            wbnb.address,
            ethers.utils.parseEther(BOB_LPs),
            ethers.utils.parseEther('888888888'),
            ethers.utils.parseEther('0.001')
          ]
        ),
        { gasPrice: 0 },
      );

      const bobBtokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbAfter = await ethers.provider.getBalance(await bob.getAddress());

      expect(await baseTokenWbnbLp.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      expect(await baseTokenWbnbLp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      
      // The following conditions must be statified:
      // - Bob should have 1.2 BTOKEN in his wallet due to Bob is a msg.sender which get 1 BTOKEN from LP
      // and 0.2 BTOKEN from swap BNB to BTOKEN
      // - Bob should have 0.1 - [(0.1*0.2*1000)/((1-0.2)*998)] = 0.074949899799599198 BNB back to his wallet due to part of his BNB swapped into BTOKEN
      expect(bobBtokenAfter.sub(bobBtokenBefore)).to.be.bignumber.eq(ethers.utils.parseEther('1.2'));
      expect(ethers.utils.parseEther('0.074949899799599198')).to.be.bignumber.eq(bobBnbAfter.sub(bobBnbBefore))
    });

    it('should convert the given LP tokens back to BTOKEN + BNB, and use all of BTOKEN that it got to pay debt, when maxReturn >= debt && debt == received BaseToken', async () => {
      const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbBefore = await ethers.provider.getBalance(await bob.getAddress());

      // Bob uses minimize trading strategy to turn LPs back to BTOKEN and BNB
      await stratAsBob.execute(
        await bob.getAddress(),
        ethers.utils.parseEther('0.5'), // debt 0.5 BTOKEN
        ethers.utils.defaultAbiCoder.encode(
          [
            'address',
            'address',
            'uint256',
            'uint256',
            'uint256'
          ], [
            baseToken.address,
            wbnb.address,
            ethers.utils.parseEther(BOB_LPs).div(2),
            ethers.utils.parseEther('8888888'),
            ethers.utils.parseEther('0.001')
          ]),
        { gasPrice: 0 }
      );

      const bobBaseTokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbAfter = await ethers.provider.getBalance(await bob.getAddress());
      
      // After the execution is done, there should no LPs left in strategy contract
      expect(await baseTokenWbnbLp.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      // Bob's LPs must be half due to returnLpToken < LPs he transfered to strategy contract
      expect(await baseTokenWbnbLp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther(BOB_LPs).div(2).add(1));
      // Bob should get 0.5 BTOKEN back due to he is a caller and strategy returns debt to caller
      // Please note that this 0.5 BTOKEN came from debt not the liquidation
      expect(bobBaseTokenAfter.sub(bobBaseTokenBefore)).to.be.bignumber.eq(ethers.utils.parseEther('0.5'));
      // Bob should get 0.05 BNB back due to he is a user in this execution
      // PS. he gets 0.049999999999999998 BNB back due to rounding
      expect(bobBnbAfter.sub(bobBnbBefore)).to.be.bignumber.eq(ethers.utils.parseEther('0.049999999999999998'));
    })

    it('should convert the given LP tokens back to BTOKEN + BNB, and return leftover both BTOKEN + BNB to Bob, when maxReturn >= debt && debt < received BaseToken', async () => {
      const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbBefore = await ethers.provider.getBalance(await bob.getAddress());

      // Bob uses minimize trading strategy to turn LPs back to BTOKEN and BNB
      await stratAsBob.execute(
        await bob.getAddress(),
        ethers.utils.parseEther('0.25'), // debt 0.25 BTOKEN
        ethers.utils.defaultAbiCoder.encode(
          [
            'address',
            'address',
            'uint256',
            'uint256',
            'uint256'
          ], [
            baseToken.address,
            wbnb.address,
            ethers.utils.parseEther(BOB_LPs).div(2),
            ethers.utils.parseEther('8888888'),
            ethers.utils.parseEther('0.001')
          ])
        , { gasPrice: 0 }
      );

      const bobBaseTokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbAfter = await ethers.provider.getBalance(await bob.getAddress());
      
      // After the execution is done, there should no LPs left in strategy contract
      expect(await baseTokenWbnbLp.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      // Bob's LPs must be half due to returnLpToken < LPs he transfered to strategy contract
      expect(await baseTokenWbnbLp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther(BOB_LPs).div(2).add(1));
      // Bob should get 0.5 BTOKEN back due to he is a caller and strategy returns debt to caller
      // Please note that this 0.5 BTOKEN came from:
      // - 0.25 debt payback to the original caller
      // - 0.25 leftover returns to the user
      // Bob gets all because he is both original caller and user
      // PS. he gets 0.499999999999999998 due to rounding
      expect(bobBaseTokenAfter.sub(bobBaseTokenBefore)).to.be.bignumber.eq(ethers.utils.parseEther('0.499999999999999998'));
      // Bob should get 0.05 FTOKEN back due to he is a user in this execution
      // PS. he gets 0.049999999999999998 FTOKEN back due to rounding
      expect(bobBnbAfter.sub(bobBnbBefore)).to.be.bignumber.eq(ethers.utils.parseEther('0.049999999999999999'));
    })

    it('should convert the given LP tokens back to BTOKEN + BNB when maxReturn >= debt && debt > received BTOKEN, however BNB is enough to cover debt', async () => {
      const bobBtokenBefore = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbBefore = await ethers.provider.getBalance(await bob.getAddress());

      // Bob uses withdraw minimize trading strategy to turn LPs back to BTOKEN and FTOKEN
      await stratAsBob.execute(
        await bob.getAddress(), // User is Bob
        ethers.utils.parseEther('0.75'), // Debt is 0.75 BTOKEN
        ethers.utils.defaultAbiCoder.encode(
          [
            'address',
            'address',
            'uint256',
            'uint256',
            'uint256'
          ], [
            baseToken.address, // BTOKEN address
            wbnb.address, // FTOKEN address
            ethers.utils.parseEther(BOB_LPs).div(2), // returnLpAmount
            ethers.utils.parseEther('88888888'), // maxReturn
            ethers.utils.parseEther('0.001') // minFarmingToken
          ]
        ), { gasPrice: 0 }
      );

      const bobBtokenAfter = await baseToken.balanceOf(await bob.getAddress());
      const bobBnbAfter = await ethers.provider.getBalance(await bob.getAddress());
      
      // After the execution is done, there should no LPs left in strategy contract
      expect(await baseTokenWbnbLp.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      // Bob's LPs must be half due to returnLpToken is half of LPs he transfered to strategy contract
      expect(await baseTokenWbnbLp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther(BOB_LPs).div(2).add(1));
      // Bob should get 0.75 BTOKEN back from strategy returns debt to caller
      expect(bobBtokenAfter.sub(bobBtokenBefore)).to.be.bignumber.eq(ethers.utils.parseEther('0.75'));
      // Some portion of FTOKEN needs to be converted to BTOKEN to pay the debt
      // Hence Bob get less FTOKEN than what he put in
      // Bob should get 0.05 - [(0.15*0.25*1000)/((1.5-0.25)*998)] = 0.019939879759519036 FTOKEN
      expect(bobBnbAfter.sub(bobBnbBefore)).to.be.bignumber.eq(ethers.utils.parseEther('0.019939879759519036'));
    });

    it('should revert when debt > received BaseToken, BNB is not enough to cover the debt', async () => {
      await expect(
        stratAsBob.execute(
          await bob.getAddress(),
          ethers.utils.parseEther('3'), // debt 3 BTOKEN
          ethers.utils.defaultAbiCoder.encode(
            [
              'address',
              'address',
              'uint256',
              'uint256',
              'uint256'
            ],
            [
              baseToken.address,
              wbnb.address,
              ethers.utils.parseEther(BOB_LPs),
              ethers.utils.parseEther('88888888'),
              ethers.utils.parseEther('0.001')
            ]
          ),
        ),
      ).to.be.revertedWith('subtraction overflow')
    });
  });
});
