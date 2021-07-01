import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MockERC20,
  MockERC20__factory,
  PancakeFactory,
  PancakeFactory__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouterV2__factory,
  PancakeRouterV2,
  PancakeswapV2RestrictedStrategyPartialCloseLiquidate,
  PancakeswapV2RestrictedStrategyPartialCloseLiquidate__factory,
  WETH,
  WETH__factory
} from "../typechain";
import { MockPancakeswapV2Worker__factory } from "../typechain/factories/MockPancakeswapV2Worker__factory";
import { MockPancakeswapV2Worker } from "../typechain/MockPancakeswapV2Worker";
import { assertAlmostEqual } from "./helpers/assert";

chai.use(solidity);
const { expect } = chai;

describe('PancakeswapV2RestrictedStrategyPartialCloseLiquidate', () => {
  const FOREVER = '2000000000';

  /// Pancakeswap-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouterV2;
  let lpV2: PancakePair;

  /// MockPancakeswapV2Worker-related instance(s)
  let mockPancakeswapV2Worker: MockPancakeswapV2Worker;
  let mockPancakeswapV2EvilWorker: MockPancakeswapV2Worker

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let strat: PancakeswapV2RestrictedStrategyPartialCloseLiquidate;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let lpAsAlice: PancakePair;
  let lpAsBob: PancakePair;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerV2AsAlice: PancakeRouterV2;
  let routerV2AsBob: PancakeRouterV2;

  let stratAsAlice: PancakeswapV2RestrictedStrategyPartialCloseLiquidate;
  let stratAsBob: PancakeswapV2RestrictedStrategyPartialCloseLiquidate;

  let mockPancakeswapV2WorkerAsBob: MockPancakeswapV2Worker;
  let mockPancakeswapV2EvilWorkerAsBob: MockPancakeswapV2Worker

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

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
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther('100'));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther('100'));
    farmingToken = await upgrades.deployProxy(MockERC20, ['FTOKEN', 'FTOKEN']) as MockERC20;
    await farmingToken.deployed();
    await farmingToken.mint(await alice.getAddress(), ethers.utils.parseEther('10'));
    await farmingToken.mint(await bob.getAddress(), ethers.utils.parseEther('10'));

    await factoryV2.createPair(baseToken.address, farmingToken.address);

    lpV2 = PancakePair__factory.connect(await factoryV2.getPair(farmingToken.address, baseToken.address), deployer);

    /// Setup MockPancakeswapV2Worker
    const MockPancakeswapV2Worker = (await ethers.getContractFactory(
      "MockPancakeswapV2Worker",
      deployer,
    )) as MockPancakeswapV2Worker__factory;
    mockPancakeswapV2Worker = await MockPancakeswapV2Worker.deploy(lpV2.address, baseToken.address, farmingToken.address) as MockPancakeswapV2Worker
    await mockPancakeswapV2Worker.deployed();
    mockPancakeswapV2EvilWorker = await MockPancakeswapV2Worker.deploy(lpV2.address, baseToken.address, farmingToken.address) as MockPancakeswapV2Worker
    await mockPancakeswapV2EvilWorker.deployed();

    const PancakeswapV2RestrictedStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyPartialCloseLiquidate",
      deployer
    )) as PancakeswapV2RestrictedStrategyPartialCloseLiquidate__factory;
    strat = await upgrades.deployProxy(PancakeswapV2RestrictedStrategyPartialCloseLiquidate, [routerV2.address]) as PancakeswapV2RestrictedStrategyPartialCloseLiquidate;
    await strat.deployed();
    await strat.setWorkersOk([mockPancakeswapV2Worker.address], true)
    

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerV2AsAlice = PancakeRouterV2__factory.connect(routerV2.address, alice);
    routerV2AsBob = PancakeRouterV2__factory.connect(routerV2.address, bob);

    lpAsAlice = PancakePair__factory.connect(lpV2.address, alice);
    lpAsBob = PancakePair__factory.connect(lpV2.address, bob);

    stratAsAlice = PancakeswapV2RestrictedStrategyPartialCloseLiquidate__factory.connect(strat.address, alice);
    stratAsBob = PancakeswapV2RestrictedStrategyPartialCloseLiquidate__factory.connect(strat.address, bob);

    mockPancakeswapV2WorkerAsBob = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker.address, bob);
    mockPancakeswapV2EvilWorkerAsBob = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2EvilWorker.address, bob);

        // Setting up liquidity
    // Alice adds 0.1 FTOKEN + 1 BTOKEN
    await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther('1'));
    await farmingTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther('0.1'));
    await routerV2AsAlice.addLiquidity(
      baseToken.address, farmingToken.address,
      ethers.utils.parseEther('1'), ethers.utils.parseEther('0.1'), '0', '0',
      await alice.getAddress(), FOREVER);

    // Bob tries to add 1 FTOKEN + 1 BTOKEN (but obviously can only add 0.1 FTOKEN)
    await baseTokenAsBob.approve(routerV2.address, ethers.utils.parseEther('1'));
    await farmingTokenAsBob.approve(routerV2.address, ethers.utils.parseEther('1'));
    await routerV2AsBob.addLiquidity(
      baseToken.address, farmingToken.address,
      ethers.utils.parseEther('1'), ethers.utils.parseEther('1'), '0', '0',
      await bob.getAddress(), FOREVER);

    expect(await baseToken.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('99'));
    expect(await farmingToken.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('9.9'));
    expect(await lpV2.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0.316227766016837933'));
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
      await expect(stratAsBob.setWorkersOk([mockPancakeswapV2EvilWorkerAsBob.address], true)).to.reverted
    })
  })

  context('When non-worker call the strat', async () => {
    it('should revert', async() => {
      await expect(stratAsBob.execute(
        await bob.getAddress(), '0',
        ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'uint256'],
          [ethers.utils.parseEther('0.5'), ethers.utils.parseEther('0.5'), ]
        )
      )).to.be.reverted;
    })
  })

  context("When caller worker hasn't been whitelisted", async () => {
    it('should revert as bad worker', async () => {
      await baseTokenAsBob.transfer(mockPancakeswapV2EvilWorkerAsBob.address, ethers.utils.parseEther('0.05'));
      await expect(mockPancakeswapV2EvilWorkerAsBob.work(
        0, await bob.getAddress(), '0',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [strat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256'],
            [ethers.utils.parseEther('0.5'), ethers.utils.parseEther('0.5')],
          )],
        )
      )).to.be.revertedWith('PancakeswapV2RestrictedStrategyPartialCloseLiquidate::onlyWhitelistedWorkers:: bad worker');
    });
  })

  context("when revoking whitelist workers", async () => {
    it('should revert as bad worker', async () => {
      await strat.setWorkersOk([mockPancakeswapV2Worker.address], false)
      await expect(mockPancakeswapV2WorkerAsBob.work(
        0, await bob.getAddress(), '0',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [strat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256'],
            [ethers.utils.parseEther('0.5'), ethers.utils.parseEther('0.5')]
          )],
        )
      )).to.be.revertedWith('PancakeswapV2RestrictedStrategyPartialCloseLiquidate::onlyWhitelistedWorkers:: bad worker');
    });
  })

  it('should revert when the given LPs > the actual LPs sent to strategy', async () => {
    // Bob transfer LP to strategy first
    await lpAsBob.transfer(strat.address, ethers.utils.parseEther('0.316227766016837933'));

    // Bob uses partial close liquidate strategy to with unrealistic returnLp to liquidate
    // Bob only transfer ~0.316227766016837933 LPs. However, he ask to liquidate 1000 LPs
    await expect(mockPancakeswapV2WorkerAsBob.work(
      0, await bob.getAddress(), '0',
      ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [strat.address, ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'uint256', 'uint256'],
          [ethers.utils.parseEther('1000'), ethers.utils.parseEther('1'), ethers.utils.parseEther('0.5')]
          )],
      )
    )).revertedWith('PancakeswapV2RestrictedStrategyPartialCloseLiquidate::execute:: insufficient LP amount recevied from worker')
  });

  it('should convert the given LP tokens back to baseToken, when maxReturn >= liquidated amount', async () => {
    // Bob transfer LP to strategy first
    const bobLpBefore = await lpV2.balanceOf(await bob.getAddress());
    const bobBTokenBefore = await baseToken.balanceOf(await bob.getAddress());
    await lpAsBob.transfer(strat.address, ethers.utils.parseEther('0.316227766016837933'));

    // Bob uses partial close liquidate strategy to turn the 50% LPs back to BTOKEN with the same minimum value and the same maxReturn
    const returnLp = bobLpBefore.div(2)
    await expect(mockPancakeswapV2WorkerAsBob.work(
          0, await bob.getAddress(), '0',
          ethers.utils.defaultAbiCoder.encode(
              ['address', 'bytes'],
              [strat.address, ethers.utils.defaultAbiCoder.encode(
              ['uint256', 'uint256', 'uint256'],
              [returnLp, ethers.utils.parseEther('0.1'), ethers.utils.parseEther('0.5')]
            )],
          )
      )).to.emit(strat, 'PancakeswapV2RestrictedStrategyPartialCloseLiquidateEvent')
    
    // After execute strategy successfully. The following conditions must be satisfied
    // - LPs in Strategy contract must be 0
    // - Bob should have bobLpBefore - returnLp left in his account
    // - Bob should have bobBtokenBefore + 0.5 BTOKEN + [((0.05*9975)*1.5)/(0.15*10000+(0.05*9975))] = ~0.374296435272045028 BTOKEN] (from swap 0.05 FTOKEN to BTOKEN) in his account
    // - BTOKEN in reserve should be 1.5-0.374296435272045028 = 1.12570356 BTOKEN
    // - FTOKEN in reserve should be 0.15+0.05 = 0.2 FTOKEN
    expect(await lpV2.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'));
    expect(await lpV2.balanceOf(mockPancakeswapV2Worker.address)).to.be.bignumber.eq(bobLpBefore.sub(returnLp));
    assertAlmostEqual(
      bobBTokenBefore.add(ethers.utils.parseEther('0.5')).add(ethers.utils.parseEther('0.374296435272045028')).toString(),
      (await baseToken.balanceOf(await bob.getAddress())).toString()
    );
    assertAlmostEqual(
      ethers.utils.parseEther('1.12570356').toString(),
      (await baseToken.balanceOf(lpV2.address)).toString()
    );
    assertAlmostEqual(
      ethers.utils.parseEther('0.2').toString(),
      (await farmingToken.balanceOf(lpV2.address)).toString()
    );
  });
});
