import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet, BigNumber } from "ethers";
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
  MockERC20,
  MockERC20__factory,
  PancakeFactory,
  PancakeFactory__factory,
  PancakeMasterChef,
  PancakeMasterChef__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouter,
  PancakeRouter__factory,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory,
  PancakeswapV2StrategyLiquidate,
  PancakeswapV2StrategyLiquidate__factory,
  PancakeswapWorker,
  PancakeswapWorker__factory,
  SimpleVaultConfig,
  SimpleVaultConfig__factory,
  SyrupBar,
  SyrupBar__factory,
  Vault,
  Vault__factory,
  WETH,
  WETH__factory,
  WNativeRelayer,
  WNativeRelayer__factory,
  MockVaultForRestrictedAddTwosideOptimalStrat,
  MockVaultForRestrictedAddTwosideOptimalStrat__factory,
  MockPancakeswapV2Worker,
  MockPancakeswapV2Worker__factory,
  PancakeswapV2StrategyAddTwoSidesOptimal__factory,
  PancakeswapV2StrategyAddTwoSidesOptimal,
  PancakeswapV2Worker
} from "../typechain";

chai.use(solidity);
const { expect } = chai;

describe('Pancakeswapv2RestrictedStrategyAddTwoSideOptimal', () => {
  const FOREVER = '2000000000';
  const MAX_ROUNDING_ERROR = Number('15');

  /// Pancakeswap-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouter;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;
  let mockedVault: MockVaultForRestrictedAddTwosideOptimalStrat

  // V2
  let mockPancakeswapV2WorkerAsBob: MockPancakeswapV2Worker;
  let mockPancakeswapV2WorkerAsAlice: MockPancakeswapV2Worker;
  let mockPancakeswapV2EvilWorkerAsBob: MockPancakeswapV2Worker
  let mockPancakeswapV2Worker: MockPancakeswapV2Worker;
  let mockPancakeswapV2EvilWorker: MockPancakeswapV2Worker

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  let liqStrat: PancakeswapV2StrategyLiquidate;
  let addRestrictedStrat: PancakeswapV2RestrictedStrategyAddTwoSidesOptimal
  let addRestrictedStratAsDeployer: PancakeswapV2RestrictedStrategyAddTwoSidesOptimal;

  // Contract Signer
  let addRestrictedStratAsBob: PancakeswapV2RestrictedStrategyAddTwoSidesOptimal;

  let baseTokenAsBob: MockERC20;

  let farmingTokenAsAlice: MockERC20;

  let lpV2: PancakePair;

  const setupFullFlowTest = async () => {
    // Setup Pancakeswap
    const PancakeFactoryV2 = (await ethers.getContractFactory(
      "PancakeFactory",
      deployer
    )) as PancakeFactory__factory;
    factoryV2 = await PancakeFactoryV2.deploy((await deployer.getAddress()));
    await factoryV2.deployed();

    const WBNB = (await ethers.getContractFactory(
      "WETH",
      deployer
    )) as WETH__factory;
    wbnb = await WBNB.deploy();
    await wbnb.deployed();

    const PancakeRouterV2 = (await ethers.getContractFactory(
      "PancakeRouterV2",
      deployer
    )) as PancakeRouter__factory;
    routerV2 = await PancakeRouterV2.deploy(factoryV2.address, wbnb.address);
    await routerV2.deployed();

    /// Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory(
      "MockERC20",
      deployer
    )) as MockERC20__factory
    baseToken = await upgrades.deployProxy(MockERC20, ['BTOKEN', 'BTOKEN']) as MockERC20;
    await baseToken.deployed();
    await baseToken.mint(await deployer.getAddress(), ethers.utils.parseEther('100'));
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther('100'));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther('100'));
    farmingToken = await upgrades.deployProxy(MockERC20, ['FTOKEN', 'FTOKEN']) as MockERC20;
    await farmingToken.deployed();
    await farmingToken.mint(await deployer.getAddress(), ethers.utils.parseEther('100'))
    await farmingToken.mint(await alice.getAddress(), ethers.utils.parseEther('100'));
    await farmingToken.mint(await bob.getAddress(), ethers.utils.parseEther('100'));


    /// Setup BTOKEN-FTOKEN pair on Pancakeswap
    await factoryV2.createPair(farmingToken.address, baseToken.address);
    lpV2 = PancakePair__factory.connect(await factoryV2.getPair(farmingToken.address, baseToken.address), deployer);
    await lpV2.deployed()

    /// Setup BTOKEN-FTOKEN pair on Pancakeswap
    await factoryV2.createPair(wbnb.address, farmingToken.address);


    const PancakeswapV2StrategyLiquidate = (await ethers.getContractFactory(
      "PancakeswapV2StrategyLiquidate",
      deployer
    )) as PancakeswapV2StrategyLiquidate__factory;
    liqStrat = await upgrades.deployProxy(PancakeswapV2StrategyLiquidate, [routerV2.address]) as PancakeswapV2StrategyLiquidate;
    await liqStrat.deployed();

    // Deployer adds 0.1 FTOKEN + 1 BTOKEN
    await baseToken.approve(routerV2.address, ethers.utils.parseEther('1'));
    await farmingToken.approve(routerV2.address, ethers.utils.parseEther('0.1'));
    await routerV2.addLiquidity(
      baseToken.address, farmingToken.address,
      ethers.utils.parseEther('1'), ethers.utils.parseEther('0.1'),
      '0', '0', await deployer.getAddress(), FOREVER);

    // Deployer adds 1 BTOKEN + 1 NATIVE
    await baseToken.approve(routerV2.address, ethers.utils.parseEther('1'));
    await routerV2.addLiquidityETH(
      baseToken.address, ethers.utils.parseEther('1'),
      '0', '0', await deployer.getAddress(), FOREVER, { value: ethers.utils.parseEther('1') });
  }

  const setupRestrictedTest = async () => {
    const MockVaultForRestrictedAddTwosideOptimalStrat =  (await ethers.getContractFactory(
      "MockVaultForRestrictedAddTwosideOptimalStrat",
      deployer
    )) as MockVaultForRestrictedAddTwosideOptimalStrat__factory;
    mockedVault = await upgrades.deployProxy(MockVaultForRestrictedAddTwosideOptimalStrat) as MockVaultForRestrictedAddTwosideOptimalStrat;
    await mockedVault.deployed();

    const PancakeswapV2RestrictedStrategyAddTwoSidesOptimal = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedStrategyAddTwoSidesOptimal",
      deployer
    )) as PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory;
    addRestrictedStrat = await upgrades.deployProxy(PancakeswapV2RestrictedStrategyAddTwoSidesOptimal, [routerV2.address, mockedVault.address]) as PancakeswapV2RestrictedStrategyAddTwoSidesOptimal
    await addRestrictedStrat.deployed();

    /// Setup MockPancakeswapV2Worker
    const MockPancakeswapV2Worker = (await ethers.getContractFactory(
      "MockPancakeswapV2Worker",
      deployer,
    )) as MockPancakeswapV2Worker__factory;
    mockPancakeswapV2Worker = await MockPancakeswapV2Worker.deploy(lpV2.address, baseToken.address, farmingToken.address) as MockPancakeswapV2Worker
    await mockPancakeswapV2Worker.deployed();
    mockPancakeswapV2EvilWorker = await MockPancakeswapV2Worker.deploy(lpV2.address, baseToken.address, farmingToken.address) as MockPancakeswapV2Worker
    await mockPancakeswapV2EvilWorker.deployed();
  }


  const setupContractSigner = async () => {
     // Contract signer
     addRestrictedStratAsBob = PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory.connect(addRestrictedStrat.address, bob);
     addRestrictedStratAsDeployer = PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory.connect(addRestrictedStrat.address, deployer)
 
     baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);
 
     farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
 
     mockPancakeswapV2WorkerAsBob = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker.address, bob);
     mockPancakeswapV2WorkerAsAlice = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker.address, alice);
     mockPancakeswapV2EvilWorkerAsBob = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2EvilWorker.address, bob);
  }

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();
    await setupFullFlowTest()
    await setupRestrictedTest()
    await setupContractSigner()
    await addRestrictedStratAsDeployer.setWorkersOk([mockPancakeswapV2Worker.address], true);
  });

  describe('full flow test', async () => {
    context('when strategy execution is not in the scope', async () => {
      it('should revert', async () => {
        await expect(
          addRestrictedStratAsBob.execute(
            await bob.getAddress(),
            '0',
            ethers.utils.defaultAbiCoder.encode([
              'uint256', 'uint256'],
              ['0', '0']
            ),
          )
        ).to.be.reverted;
      });
    })
    context('when bad calldata', async () => {
      it('should revert', async () => {
        await mockedVault.setMockOwner(await alice.getAddress())
        await baseToken.mint(mockPancakeswapV2Worker.address, ethers.utils.parseEther('1'))
        await expect(mockPancakeswapV2WorkerAsAlice.work(0, await alice.getAddress(), ethers.utils.parseEther('1'), ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addRestrictedStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['address'],
            [await bob.getAddress()]
          )],
        ))).to.reverted
      })
    })
    it('should convert all BTOKEN to LP tokens at best rate', async () => {
      // Now Alice leverage 2x on her 1 BTOKEN.
      // So totally Alice will take 1 BTOKEN from the pool and 1 BTOKEN from her pocket to
      // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
      await mockedVault.setMockOwner(await alice.getAddress())
      await baseToken.mint(mockPancakeswapV2Worker.address, ethers.utils.parseEther('1'))
      await mockPancakeswapV2WorkerAsAlice.work(0, await alice.getAddress(), ethers.utils.parseEther('1'), ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes'],
        [addRestrictedStrat.address, ethers.utils.defaultAbiCoder.encode(
          ['uint256','uint256'],
          ['0', ethers.utils.parseEther('0.01')]
        )],
      ))
  
      const stratLPBalance = await lpV2.balanceOf(mockPancakeswapV2Worker.address);
      expect(stratLPBalance).to.above(ethers.utils.parseEther('0'));
      expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.bignumber.below(MAX_ROUNDING_ERROR);
  
      // Now Alice leverage 2x on her 0.1 BTOKEN.
      // So totally Alice will take 0.1 BTOKEN from the pool and 0.1 BTOKEN from her pocket to
      // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
      await baseToken.mint(mockPancakeswapV2Worker.address, ethers.utils.parseEther('0.1'))
      await mockPancakeswapV2WorkerAsAlice.work(0, await alice.getAddress(), ethers.utils.parseEther('0.1'), ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes'],
        [addRestrictedStrat.address, ethers.utils.defaultAbiCoder.encode(
          ['uint256','uint256'],
          ['0', ethers.utils.parseEther('0')]
        )],
      ))
  
      expect(await lpV2.balanceOf(mockPancakeswapV2Worker.address)).to.above(stratLPBalance);
      expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.bignumber.below(MAX_ROUNDING_ERROR);
    })
  
    it('should convert some BTOKEN and some FTOKEN to LP tokens at best rate', async () => {
      // Now Alice leverage 2x on her 1 BTOKEN.
      // So totally Alice will take 1 BTOKEN from the pool and 1 BTOKEN from her pocket to
      // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
      await mockedVault.setMockOwner(await alice.getAddress())
      await baseToken.mint(mockPancakeswapV2Worker.address, ethers.utils.parseEther('1'))
      await farmingTokenAsAlice.approve(mockedVault.address, ethers.utils.parseEther('1'));
      await mockPancakeswapV2WorkerAsAlice.work(0, await alice.getAddress(), ethers.utils.parseEther('1'), ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes'],
        [addRestrictedStrat.address, ethers.utils.defaultAbiCoder.encode(
          ['uint256','uint256'],
          [ethers.utils.parseEther('0.05'), ethers.utils.parseEther('0')]
        )],
      ))
  
      const stratLPBalance = await lpV2.balanceOf(mockPancakeswapV2Worker.address);
      expect(stratLPBalance).to.above(ethers.utils.parseEther('0'));
      expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.bignumber.below(MAX_ROUNDING_ERROR);
  
      // Now Alice leverage 2x on her 0.1 BTOKEN.
      // So totally Alice will take 0.1 BTOKEN from the pool and 0.1 BTOKEN from her pocket to
      // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
      await baseToken.mint(mockPancakeswapV2Worker.address, ethers.utils.parseEther('1'))
      await farmingTokenAsAlice.approve(mockedVault.address, ethers.utils.parseEther('1'));
      await mockPancakeswapV2WorkerAsAlice.work(0, await alice.getAddress(), ethers.utils.parseEther('1'), ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes'],
        [addRestrictedStrat.address, ethers.utils.defaultAbiCoder.encode(
          ['uint256','uint256'],
          [ethers.utils.parseEther('1'), ethers.utils.parseEther('0.1')]
        )],
      ))
  
      expect(await lpV2.balanceOf(mockPancakeswapV2Worker.address)).to.above(stratLPBalance);
      expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.bignumber.below(MAX_ROUNDING_ERROR);
    })
  })

  describe('restricted test', async() => {
    context('When the setOkWorkers caller is not an owner', async() => {
      it('should be reverted', async () => {
        await expect(addRestrictedStratAsBob.setWorkersOk([mockPancakeswapV2EvilWorkerAsBob.address], true)).to.reverted
      })
    })

    context('When the caller worker is not whitelisted', async () => {
      it ('should revert', async() => {
        await baseTokenAsBob.transfer(mockPancakeswapV2EvilWorkerAsBob.address, ethers.utils.parseEther('0.01'));
        await expect(mockPancakeswapV2EvilWorkerAsBob.work(0, await bob.getAddress(), 0, ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addRestrictedStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256'],
            [ethers.utils.parseEther('0'), ethers.utils.parseEther('0.01')]
          )]
        ))).to.revertedWith('PancakeswapV2RestrictedStrategyAddTwoSidesOptimal::onlyWhitelistedWorkers:: bad worker')
      })
    })
  
    context('When the caller worker has been revoked from callable', async () => {
      it ('should revert', async() => {
        await baseTokenAsBob.transfer(mockPancakeswapV2EvilWorkerAsBob.address, ethers.utils.parseEther('0.01'));
        await addRestrictedStratAsDeployer.setWorkersOk([mockPancakeswapV2Worker.address], false)
        await expect(mockPancakeswapV2WorkerAsBob.work(0, await bob.getAddress(), 0, ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addRestrictedStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256'],
            [ethers.utils.parseEther('0'), ethers.utils.parseEther('0.01')]
          )]
        ))).to.revertedWith('PancakeswapV2RestrictedStrategyAddTwoSidesOptimal::onlyWhitelistedWorkers:: bad worker')
      })
    })
  })
});
