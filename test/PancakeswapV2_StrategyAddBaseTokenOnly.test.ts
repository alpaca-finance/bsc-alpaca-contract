import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  CakeToken__factory,
  MockERC20,
  MockERC20__factory,
  PancakeFactory,
  PancakeFactory__factory,
  PancakeMasterChef,
  PancakeMasterChef__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouter,
  PancakeRouterV2__factory,
  PancakeRouter__factory,
  PancakeswapV2StrategyAddBaseTokenOnly,
  PancakeswapV2StrategyAddBaseTokenOnly__factory,
  PancakeswapV2Worker,
  PancakeswapV2Worker__factory,
  StrategyAddBaseTokenOnly,
  StrategyAddBaseTokenOnly__factory,
  SyrupBar__factory,
  WETH,
  WETH__factory
} from "../typechain";
import { MockPancakeswapV2Worker__factory } from "../typechain/factories/MockPancakeswapV2Worker__factory";
import { MockPancakeswapV2Worker } from "../typechain/MockPancakeswapV2Worker";

chai.use(solidity);
const { expect } = chai;

describe('PancakeswapV2 - StrategyAddBaseTokenOnly', () => {
  const FOREVER = '2000000000';
  const CAKE_REWARD_PER_BLOCK = ethers.utils.parseEther('0.076');

  /// Pancakeswap-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouter;
  let lpV2: PancakePair;

  /// MockPancakeswapV2Worker-related instance(s)
  let mockPancakeswapV2Worker: MockPancakeswapV2Worker;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy-ralted instance(s)
  let strat: PancakeswapV2StrategyAddBaseTokenOnly;

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

  let routerV2AsAlice: PancakeRouter;
  let routerV2AsBob: PancakeRouter;

  let stratAsAlice: PancakeswapV2StrategyAddBaseTokenOnly;
  let stratAsBob: PancakeswapV2StrategyAddBaseTokenOnly;

  let mockPancakeswapV2WorkerAsBob: MockPancakeswapV2Worker;

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

    const PancakeswapV2StrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "PancakeswapV2StrategyAddBaseTokenOnly",
      deployer
    )) as PancakeswapV2StrategyAddBaseTokenOnly__factory;
    strat = await upgrades.deployProxy(PancakeswapV2StrategyAddBaseTokenOnly, [routerV2.address]) as PancakeswapV2StrategyAddBaseTokenOnly;
    await strat.deployed();

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerV2AsAlice = PancakeRouter__factory.connect(routerV2.address, alice);
    routerV2AsBob = PancakeRouter__factory.connect(routerV2.address, bob);

    lpAsAlice = PancakePair__factory.connect(lpV2.address, alice);
    lpAsBob = PancakePair__factory.connect(lpV2.address, bob);

    stratAsAlice = StrategyAddBaseTokenOnly__factory.connect(strat.address, alice);
    stratAsBob = StrategyAddBaseTokenOnly__factory.connect(strat.address, bob);

    mockPancakeswapV2WorkerAsBob = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker.address, bob);

    // Adding liquidity to the pool
    // Alice adds 0.1 FTOKEN + 1 WBTC
    await farmingTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther('0.1'));
    await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther('1'));

    // Add liquidity to the WBTC-FTOKEN pool on Pancakeswap
    await routerV2AsAlice.addLiquidity(
      baseToken.address, farmingToken.address,
      ethers.utils.parseEther('1'), ethers.utils.parseEther('0.1'), '0', '0', await alice.getAddress(), FOREVER);
  });

  it('should revert on bad calldata', async () => {
    // Bob passes some bad calldata that can't be decoded
    await expect(
      stratAsBob.execute(await bob.getAddress(), '0', '0x1234')
    ).to.be.reverted;
  });

  it('should revert when non-worker call to the strat', async () => {
    await expect(stratAsBob.execute(
      await bob.getAddress(), '0',
      ethers.utils.defaultAbiCoder.encode(
        ['address','address', 'uint256'], [baseToken.address, farmingToken.address, '0']
      )
    )).to.be.reverted;
  });

  it('should revert when contract get LP < minLP', async () => {
    // Bob uses AddBaseTokenOnly strategy yet again, but now with an unreasonable min LP request
    await baseTokenAsBob.transfer(mockPancakeswapV2Worker.address, ethers.utils.parseEther('0.1'));
    await expect(mockPancakeswapV2WorkerAsBob.work(
      0, await bob.getAddress(), '0',
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes'],
        [strat.address, ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [baseToken.address, farmingToken.address, ethers.utils.parseEther('0.05')]
        )],
      )
    )).to.be.revertedWith('PancakeswapV2StrategyAddBaseTokenOnly::execute:: insufficient LP tokens received');
  });

  it('should revert when inject wrong pair', async () => {
    await expect(mockPancakeswapV2WorkerAsBob.work(
      0, await bob.getAddress(), '0',
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes'],
        [strat.address, ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [farmingToken.address, farmingToken.address, ethers.utils.parseEther('0.05')]
        )],
      )
    )).to.be.revertedWith('PancakeswapV2StrategyAddBaseTokenOnly::execute:: worker.lpToken != factory.getPair');
  });

  it('should convert all BTOKEN to LP tokens at best rate', async () => {
    // Bob transfer 0.1 WBTC to StrategyAddBaseTokenOnly first
    await baseTokenAsBob.transfer(mockPancakeswapV2Worker.address, ethers.utils.parseEther('0.1'));
    // Bob uses AddBaseTokenOnly strategy to add 0.1 WBTC
    await mockPancakeswapV2WorkerAsBob.work(
      0, await bob.getAddress(), '0',
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes'],
        [strat.address, ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [baseToken.address, farmingToken.address, '0']
        )],
      )
    );

    expect(await lpV2.balanceOf(mockPancakeswapV2Worker.address)).to.be.bignumber.eq(ethers.utils.parseEther('0.015415396042372718'))
    expect(await lpV2.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))
    expect(await farmingToken.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))

    // Bob uses AddBaseTokenOnly strategy to add another 0.1 WBTC
    await baseTokenAsBob.transfer(mockPancakeswapV2Worker.address, ethers.utils.parseEther('0.1'));
    await mockPancakeswapV2WorkerAsBob.work(
      0, await bob.getAddress(), '0',
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes'],
        [strat.address, ethers.utils.defaultAbiCoder.encode(
          ['address', 'address', 'uint256'],
          [baseToken.address, farmingToken.address, '0']
        )],
      )
    );

    expect(await lpV2.balanceOf(mockPancakeswapV2Worker.address)).to.be.bignumber.eq(ethers.utils.parseEther('0.030143763464109982'))
    expect(await lpV2.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))
    expect(await farmingToken.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))
    expect(await baseToken.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))
  });
});
