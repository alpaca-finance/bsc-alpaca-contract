import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  WaultSwapFactory,
  WaultSwapFactory__factory,
  WaultSwapPair,
  WaultSwapPair__factory,
  WaultSwapRouter,
  WaultSwapRouter__factory,
  WaultSwapRestrictedStrategyPartialCloseLiquidate,
  WaultSwapRestrictedStrategyPartialCloseLiquidate__factory,
  WETH,
  WETH__factory,
  MockWaultSwapWorker,
  MockWaultSwapWorker__factory
} from "../typechain";
import { assertAlmostEqual } from "./helpers/assert";

chai.use(solidity);
const { expect } = chai;

describe('WaultSwapRestrictedStrategyPartialCloseLiquidate', () => {
  const FOREVER = '2000000000';

  /// WaultSwap-related instance(s)
  let factory: WaultSwapFactory;
  let router: WaultSwapRouter;
  let lp: WaultSwapPair;

  /// MockWaultSwapWorker-related instance(s)
  let mockWaultSwapWorker: MockWaultSwapWorker;
  let mockWaultSwapEvilWorker: MockWaultSwapWorker

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let strat: WaultSwapRestrictedStrategyPartialCloseLiquidate;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let lpAsAlice: WaultSwapPair;
  let lpAsBob: WaultSwapPair;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerAsAlice: WaultSwapRouter;
  let routerAsBob: WaultSwapRouter;

  let stratAsAlice: WaultSwapRestrictedStrategyPartialCloseLiquidate;
  let stratAsBob: WaultSwapRestrictedStrategyPartialCloseLiquidate;

  let mockWaultSwapWorkerAsBob: MockWaultSwapWorker;
  let mockWaultSwapEvilWorkerAsBob: MockWaultSwapWorker

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    // Setup WaultSwap
    const WaultSwapFactory = (await ethers.getContractFactory(
      "WaultSwapFactory",
      deployer
    )) as WaultSwapFactory__factory;
    factory = await WaultSwapFactory.deploy((await deployer.getAddress()));
    await factory.deployed();

    const WBNB = (await ethers.getContractFactory(
      "WETH",
      deployer
    )) as WETH__factory;
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
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther('100'));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther('100'));
    farmingToken = await upgrades.deployProxy(MockERC20, ['FTOKEN', 'FTOKEN']) as MockERC20;
    await farmingToken.deployed();
    await farmingToken.mint(await alice.getAddress(), ethers.utils.parseEther('10'));
    await farmingToken.mint(await bob.getAddress(), ethers.utils.parseEther('10'));

    await factory.createPair(baseToken.address, farmingToken.address);

    lp = WaultSwapPair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);

    /// Setup MockWaultSwapWorker
    const MockWaultSwapWorker = (await ethers.getContractFactory(
      "MockWaultSwapWorker",
      deployer,
    )) as MockWaultSwapWorker__factory;
    mockWaultSwapWorker = await MockWaultSwapWorker.deploy(lp.address, baseToken.address, farmingToken.address) as MockWaultSwapWorker
    await mockWaultSwapWorker.deployed();
    mockWaultSwapEvilWorker = await MockWaultSwapWorker.deploy(lp.address, baseToken.address, farmingToken.address) as MockWaultSwapWorker
    await mockWaultSwapEvilWorker.deployed();

    const WaultSwapRestrictedStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyPartialCloseLiquidate",
      deployer
    )) as WaultSwapRestrictedStrategyPartialCloseLiquidate__factory;
    strat = await upgrades.deployProxy(WaultSwapRestrictedStrategyPartialCloseLiquidate, [router.address]) as WaultSwapRestrictedStrategyPartialCloseLiquidate;
    await strat.deployed();
    await strat.setWorkersOk([mockWaultSwapWorker.address], true)

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerAsAlice = WaultSwapRouter__factory.connect(router.address, alice);
    routerAsBob = WaultSwapRouter__factory.connect(router.address, bob);

    lpAsAlice = WaultSwapPair__factory.connect(lp.address, alice);
    lpAsBob = WaultSwapPair__factory.connect(lp.address, bob);

    stratAsAlice = WaultSwapRestrictedStrategyPartialCloseLiquidate__factory.connect(strat.address, alice);
    stratAsBob = WaultSwapRestrictedStrategyPartialCloseLiquidate__factory.connect(strat.address, bob);

    mockWaultSwapWorkerAsBob = MockWaultSwapWorker__factory.connect(mockWaultSwapWorker.address, bob);
    mockWaultSwapEvilWorkerAsBob = MockWaultSwapWorker__factory.connect(mockWaultSwapEvilWorker.address, bob);

    // Setting up liquidity
    // Alice adds 0.1 FTOKEN + 1 BTOKEN
    await baseTokenAsAlice.approve(router.address, ethers.utils.parseEther('1'));
    await farmingTokenAsAlice.approve(router.address, ethers.utils.parseEther('0.1'));
    await routerAsAlice.addLiquidity(
      baseToken.address, farmingToken.address,
      ethers.utils.parseEther('1'), ethers.utils.parseEther('0.1'), '0', '0',
      await alice.getAddress(), FOREVER);

    // Bob tries to add 1 FTOKEN + 1 BTOKEN (but obviously can only add 0.1 FTOKEN)
    await baseTokenAsBob.approve(router.address, ethers.utils.parseEther('1'));
    await farmingTokenAsBob.approve(router.address, ethers.utils.parseEther('1'));
    await routerAsBob.addLiquidity(
      baseToken.address, farmingToken.address,
      ethers.utils.parseEther('1'), ethers.utils.parseEther('1'), '0', '0',
      await bob.getAddress(), FOREVER);

    expect(await baseToken.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('99'));
    expect(await farmingToken.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('9.9'));
    expect(await lp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0.316227766016837933'));
  });

  context('When bad calldata', async() => {
    it('should revert', async () => {
      // Bob passes some bad calldata that can't be decoded
      await expect(
        stratAsBob.execute(await bob.getAddress(), '0', '0x1234')
      ).to.be.reverted;
    });
  })

  context('When the setOkWorkers caller is not an owner', async() => {
    it('should be reverted', async () => {
      await expect(stratAsBob.setWorkersOk([mockWaultSwapEvilWorkerAsBob.address], true)).to.reverted
    })
  })

  context('When non-worker call the strat', async () => {
    it('should revert', async() => {
      await expect(stratAsBob.execute(
        await bob.getAddress(), '0',
        ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'uint256'],
          [ethers.utils.parseEther('0.5'), ethers.utils.parseEther('0.5')]
        )
      )).to.be.reverted;
    })
  })

  context("When caller worker hasn't been whitelisted", async () => {
    it('should revert as bad worker', async () => {
      await baseTokenAsBob.transfer(mockWaultSwapEvilWorkerAsBob.address, ethers.utils.parseEther('0.05'));
      await expect(mockWaultSwapEvilWorkerAsBob.work(
        0, await bob.getAddress(), '0',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [strat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256'],
            [ethers.utils.parseEther('0.5'), ethers.utils.parseEther('0.5')],
          )],
        )
      )).to.be.revertedWith('WaultSwapRestrictedStrategyPartialCloseLiquidate::onlyWhitelistedWorkers:: bad worker');
    });
  })

  context("when revoking whitelist workers", async () => {
    it('should revert as bad worker', async () => {
      await strat.setWorkersOk([mockWaultSwapWorker.address], false)
      await expect(mockWaultSwapWorkerAsBob.work(
        0, await bob.getAddress(), '0',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [strat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256'],
            [ethers.utils.parseEther('0.5'), ethers.utils.parseEther('0.5')]
          )],
        )
      )).to.be.revertedWith('WaultSwapRestrictedStrategyPartialCloseLiquidate::onlyWhitelistedWorkers:: bad worker');
    });
  })

  it('should revert when the given LPs > the actual LPs sent to strategy', async () => {
    // Bob transfer LP to strategy first
    await lpAsBob.transfer(strat.address, ethers.utils.parseEther('0.316227766016837933'));

    // Bob uses partial close liquidate strategy to with unrealistic returnLp to liquidate
    // Bob only transfer ~0.316227766016837933 LPs. However, he ask to liquidate 1000 LPs
    await expect(mockWaultSwapWorkerAsBob.work(
      0, await bob.getAddress(), '0',
      ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [strat.address, ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'uint256', 'uint256'],
          [ethers.utils.parseEther('1000'), ethers.utils.parseEther('1'), ethers.utils.parseEther('0.5')]
          )],
      )
    )).revertedWith('WaultSwapRestrictedStrategyPartialCloseLiquidate::execute:: insufficient LP amount recevied from worker')
  });

  it('should convert the given LP tokens back to baseToken, when maxReturn >= liquidated amount', async () => {
    // Bob transfer LP to strategy first
    const bobLpBefore = await lp.balanceOf(await bob.getAddress());
    const bobBTokenBefore = await baseToken.balanceOf(await bob.getAddress());
    await lpAsBob.transfer(strat.address, ethers.utils.parseEther('0.316227766016837933'));

    // Bob uses partial close liquidate strategy to turn the 50% LPs back to BTOKEN with the same minimum value and the same maxReturn
    const returnLp = bobLpBefore.div(2)
    await expect(mockWaultSwapWorkerAsBob.work(
          0, await bob.getAddress(), '0',
          ethers.utils.defaultAbiCoder.encode(
              ['address', 'bytes'],
              [strat.address, ethers.utils.defaultAbiCoder.encode(
              ['uint256', 'uint256', 'uint256'],
              [returnLp, ethers.utils.parseEther('0.1'), ethers.utils.parseEther('0.5')]
            )],
          )
      )).to.emit(strat, 'WaultSwapRestrictedStrategyPartialCloseLiquidateEvent').withArgs(baseToken.address, farmingToken.address, returnLp, ethers.utils.parseEther('0.1'))

    // After execute strategy successfully. The following conditions must be satisfied
    // - LPs in Strategy contract must be 0
    // - Bob should have bobLpBefore - returnLp left in his account
    // - Bob should have bobBtokenBefore + 0.5 BTOKEN + [((0.05*998)*1.5)/(0.15*1000+(0.05*998))] = 0.374437218609304652 BTOKEN] (from swap 0.05 FTOKEN to BTOKEN) in his account
    // - BTOKEN in reserve should be 1.5-0.374437218609304652 = 1.125562781390695348 BTOKEN
    // - FTOKEN in reserve should be 0.15+0.05 = 0.2 FTOKEN
    expect(await lp.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'));
    expect(await lp.balanceOf(mockWaultSwapWorker.address)).to.be.bignumber.eq(bobLpBefore.sub(returnLp));
    assertAlmostEqual(
      bobBTokenBefore.add(ethers.utils.parseEther('0.5')).add(ethers.utils.parseEther('0.374437218609304652')).toString(),
      (await baseToken.balanceOf(await bob.getAddress())).toString()
    );
    assertAlmostEqual(
      ethers.utils.parseEther('1.125562781390695348').toString(),
      (await baseToken.balanceOf(lp.address)).toString()
    );
    assertAlmostEqual(
      ethers.utils.parseEther('0.2').toString(),
      (await farmingToken.balanceOf(lp.address)).toString()
    );
  });
});
