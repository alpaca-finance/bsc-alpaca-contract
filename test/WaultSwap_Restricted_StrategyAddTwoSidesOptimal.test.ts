import { ethers, upgrades } from "hardhat";
import { Signer } from "ethers";
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
  WaultSwapRestrictedStrategyAddTwoSidesOptimal,
  WaultSwapRestrictedStrategyAddTwoSidesOptimal__factory,
  WaultSwapRestrictedStrategyLiquidate,
  WaultSwapRestrictedStrategyLiquidate__factory,
  WETH,
  WETH__factory,
  MockVaultForRestrictedAddTwosideOptimalStrat,
  MockVaultForRestrictedAddTwosideOptimalStrat__factory,
  MockWaultSwapWorker,
  MockWaultSwapWorker__factory}
from "../typechain";
import * as Assert from "./helpers/assert"

chai.use(solidity);
const { expect } = chai;

describe('WaultSwapRestrictedStrategyAddTwoSideOptimal', () => {
  const FOREVER = '2000000000';
  const MAX_ROUNDING_ERROR = Number('15');

  /// Pancakeswap-related instance(s)
  let factory: WaultSwapFactory;
  let router: WaultSwapRouter;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;
  let mockedVault: MockVaultForRestrictedAddTwosideOptimalStrat

  let mockWaultSwapWorkerAsBob: MockWaultSwapWorker;
  let mockWaultSwapWorkerAsAlice: MockWaultSwapWorker;
  let mockWaultSwapEvilWorkerAsBob: MockWaultSwapWorker
  let mockWaultSwapWorker: MockWaultSwapWorker;
  let mockWaultSwapEvilWorker: MockWaultSwapWorker

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  let liqStrat: WaultSwapRestrictedStrategyLiquidate;
  let addRestrictedStrat: WaultSwapRestrictedStrategyAddTwoSidesOptimal
  let addRestrictedStratAsDeployer: WaultSwapRestrictedStrategyAddTwoSidesOptimal;

  // Contract Signer
  let addRestrictedStratAsBob: WaultSwapRestrictedStrategyAddTwoSidesOptimal;

  let baseTokenAsBob: MockERC20;

  let farmingTokenAsAlice: MockERC20;

  let lpV2: WaultSwapPair;

  const setupFullFlowTest = async () => {
    // Setup Pancakeswap
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
    await wbnb.deployed();

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
    await baseToken.mint(await deployer.getAddress(), ethers.utils.parseEther('100'));
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther('100'));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther('100'));
    farmingToken = await upgrades.deployProxy(MockERC20, ['FTOKEN', 'FTOKEN']) as MockERC20;
    await farmingToken.deployed();
    await farmingToken.mint(await deployer.getAddress(), ethers.utils.parseEther('100'))
    await farmingToken.mint(await alice.getAddress(), ethers.utils.parseEther('100'));
    await farmingToken.mint(await bob.getAddress(), ethers.utils.parseEther('100'));


    /// Setup BTOKEN-FTOKEN pair on Pancakeswap
    await factory.createPair(farmingToken.address, baseToken.address);
    lpV2 = WaultSwapPair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);
    await lpV2.deployed()

    /// Setup BTOKEN-FTOKEN pair on Pancakeswap
    await factory.createPair(wbnb.address, farmingToken.address);


    const WaultSwapRestrictedStrategyLiquidate = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyLiquidate",
      deployer
    )) as WaultSwapRestrictedStrategyLiquidate__factory;
    liqStrat = await upgrades.deployProxy(WaultSwapRestrictedStrategyLiquidate, [router.address]) as WaultSwapRestrictedStrategyLiquidate;
    await liqStrat.deployed();

    // Deployer adds 0.1 FTOKEN + 1 BTOKEN
    await baseToken.approve(router.address, ethers.utils.parseEther('1'));
    await farmingToken.approve(router.address, ethers.utils.parseEther('0.1'));
    await router.addLiquidity(
      baseToken.address, farmingToken.address,
      ethers.utils.parseEther('1'), ethers.utils.parseEther('0.1'),
      '0', '0', await deployer.getAddress(), FOREVER);

    // Deployer adds 1 BTOKEN + 1 NATIVE
    await baseToken.approve(router.address, ethers.utils.parseEther('1'));
    await router.addLiquidityETH(
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

    const WaultSwapRestrictedStrategyAddTwoSidesOptimal = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyAddTwoSidesOptimal",
      deployer
    )) as WaultSwapRestrictedStrategyAddTwoSidesOptimal__factory;
    addRestrictedStrat = await upgrades.deployProxy(WaultSwapRestrictedStrategyAddTwoSidesOptimal, [router.address, mockedVault.address]) as WaultSwapRestrictedStrategyAddTwoSidesOptimal
    await addRestrictedStrat.deployed();

    /// Setup MockWaultSwapWorker
    const MockWaultSwapWorker = (await ethers.getContractFactory(
      "MockWaultSwapWorker",
      deployer,
    )) as MockWaultSwapWorker__factory;
    mockWaultSwapWorker = await MockWaultSwapWorker.deploy(lpV2.address, baseToken.address, farmingToken.address) as MockWaultSwapWorker
    await mockWaultSwapWorker.deployed();
    mockWaultSwapEvilWorker = await MockWaultSwapWorker.deploy(lpV2.address, baseToken.address, farmingToken.address) as MockWaultSwapWorker
    await mockWaultSwapEvilWorker.deployed();
  }


  const setupContractSigner = async () => {
    // Contract signer
    addRestrictedStratAsBob = WaultSwapRestrictedStrategyAddTwoSidesOptimal__factory.connect(addRestrictedStrat.address, bob);
    addRestrictedStratAsDeployer = WaultSwapRestrictedStrategyAddTwoSidesOptimal__factory.connect(addRestrictedStrat.address, deployer)

    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);

    mockWaultSwapWorkerAsBob = MockWaultSwapWorker__factory.connect(mockWaultSwapWorker.address, bob);
    mockWaultSwapWorkerAsAlice = MockWaultSwapWorker__factory.connect(mockWaultSwapWorker.address, alice);
    mockWaultSwapEvilWorkerAsBob = MockWaultSwapWorker__factory.connect(mockWaultSwapEvilWorker.address, bob);
  }

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();
    await setupFullFlowTest()
    await setupRestrictedTest()
    await setupContractSigner()
    await addRestrictedStratAsDeployer.setWorkersOk([mockWaultSwapWorker.address], true);
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
        await baseToken.mint(mockWaultSwapWorker.address, ethers.utils.parseEther('1'))
        await expect(mockWaultSwapWorkerAsAlice.work(0, await alice.getAddress(), ethers.utils.parseEther('1'), ethers.utils.defaultAbiCoder.encode(
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
      await baseToken.mint(mockWaultSwapWorker.address, ethers.utils.parseEther('2'))
      await mockWaultSwapWorkerAsAlice.work(0, await alice.getAddress(), ethers.utils.parseEther('0'), ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes'],
        [addRestrictedStrat.address, ethers.utils.defaultAbiCoder.encode(
          ['uint256','uint256'],
          ['0', ethers.utils.parseEther('0.01')]
        )],
      ))

      console.log((await baseToken.balanceOf(lpV2.address)).toString())
      console.log((await farmingToken.balanceOf(lpV2.address)).toString())

      // the calculation is ratio between balance and reserve * total supply
      // let total supply = sqrt(1 * 0.1) = 0.31622776601683793
      // current reserve after swap is 1732967258967755614
      // ths lp will be (1267216253674334154 (optimal swap amount) / 1732783746325665846 (reserve)) * 0.31622776601683793
      // lp will be 0.231263113939866551
      const stratLPBalance = await lpV2.balanceOf(mockWaultSwapWorker.address);
      Assert.assertAlmostEqual(stratLPBalance.toString(), ethers.utils.parseEther('0.231263113939866551').toString())
      expect(stratLPBalance).to.above(ethers.utils.parseEther('0'));
      expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.bignumber.below(MAX_ROUNDING_ERROR);


      console.log((await baseToken.balanceOf(lpV2.address)).toString())
      console.log((await farmingToken.balanceOf(lpV2.address)).toString())
      console.log(0, (await lpV2.getReserves())[0].toString())
      console.log(1, (await lpV2.getReserves())[1].toString())

      // Now Alice leverage 2x on her 0.1 BTOKEN.
      // So totally Alice will take 0.1 BTOKEN from the pool and 0.1 BTOKEN from her pocket to
      // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
      await baseToken.mint(mockWaultSwapWorker.address, ethers.utils.parseEther('0.1'))
      await mockWaultSwapWorkerAsAlice.work(0, await alice.getAddress(), ethers.utils.parseEther('0.1'), ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes'],
        [addRestrictedStrat.address, ethers.utils.defaultAbiCoder.encode(
          ['uint256','uint256'],
          ['0', ethers.utils.parseEther('0')]
        )],
      ))

      // the calculation is ratio between balance and reserve * total supply
      // let total supply = sqrt(2.999999999999999958 * 0.1) = 0.547722557505166109
      // current reserve after swap is 3049652202279806938
      // ths lp will be (50360223424036484 (optimal swap amount) / 3049639776575963516 (reserve)) * 0.547722557505166109
      // lp will be 0.009044815909803818
      // thus the accum lp will  be 0.009044815909803818 +  0.231263113939866551 = 0.2403079298496703690
      Assert.assertAlmostEqual((await lpV2.balanceOf(mockWaultSwapWorker.address)).toString(), ethers.utils.parseEther('0.240307929849670369').toString())
      expect(await lpV2.balanceOf(mockWaultSwapWorker.address)).to.above(stratLPBalance);
      expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.bignumber.below(MAX_ROUNDING_ERROR);
    })

    it('should convert some BTOKEN and some FTOKEN to LP tokens at best rate', async () => {
      // Now Alice leverage 2x on her 1 BTOKEN.
      // So totally Alice will take 1 BTOKEN from the pool and 1 BTOKEN from her pocket to
      // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
      await mockedVault.setMockOwner(await alice.getAddress())
      await baseToken.mint(mockWaultSwapWorker.address, ethers.utils.parseEther('2'))
      await farmingTokenAsAlice.approve(mockedVault.address, ethers.utils.parseEther('1'));
      await mockWaultSwapWorkerAsAlice.work(0, await alice.getAddress(), ethers.utils.parseEther('0'), ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes'],
        [addRestrictedStrat.address, ethers.utils.defaultAbiCoder.encode(
          ['uint256','uint256'],
          [ethers.utils.parseEther('0.05'), ethers.utils.parseEther('0')]
        )],
      ))

      // the calculation is ratio between balance and reserve * total supply
      // let total supply = sqrt(1 * 0.1) = 0.31622776601683793
      // current reserve after swap is 1414628251406192119
      // ths lp will be (1585371748593807881 (optimal swap amount) / 1414628251406192119 (reserve)) *  0.31622776601683794
      // lp will be 0.354395980615881993
      const stratLPBalance = await lpV2.balanceOf(mockWaultSwapWorker.address);
      Assert.assertAlmostEqual(stratLPBalance.toString(), ethers.utils.parseEther('0.354395980615881993').toString())
      expect(stratLPBalance).to.above(ethers.utils.parseEther('0'));
      expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.bignumber.below(MAX_ROUNDING_ERROR);

      // Now Alice leverage 2x on her 0.1 BTOKEN.
      // So totally Alice will take 0.1 BTOKEN from the pool and 0.1 BTOKEN from her pocket to
      // Provide liquidity in the BTOKEN-FTOKEN pool on Pancakeswap
      await baseToken.mint(mockWaultSwapWorker.address, ethers.utils.parseEther('1'))
      await farmingTokenAsAlice.approve(mockedVault.address, ethers.utils.parseEther('1'));
      await mockWaultSwapWorkerAsAlice.work(0, await alice.getAddress(), ethers.utils.parseEther('1'), ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes'],
        [addRestrictedStrat.address, ethers.utils.defaultAbiCoder.encode(
          ['uint256','uint256'],
          [ethers.utils.parseEther('1'), ethers.utils.parseEther('0.1')]
        )],
      ))

      // the calculation is ratio between balance and reserve * total supply
      // let total supply = 0.31622776601683794 + 0.354346766435591663 = 0.6705745324524296
      // current reserve after swap is 1251999642993914466
      // ths lp will be (2748183224992804794 (optimal swap amount) / 1251816775007195206 (reserve)) *  0.6705745324524296
      // lp will be 1.472149693139052074
      // thus, the accum lp will be 1.472149693139052074 + 0.354346766435591663 = 1.8264964595746437379
      Assert.assertAlmostEqual((await lpV2.balanceOf(mockWaultSwapWorker.address)).toString(), ethers.utils.parseEther('1.826496459574643737').toString())
      expect(await lpV2.balanceOf(mockWaultSwapWorker.address)).to.above(stratLPBalance);
      expect(await farmingToken.balanceOf(addRestrictedStrat.address)).to.be.bignumber.below(MAX_ROUNDING_ERROR);
    })
  })

  describe('restricted test', async() => {
    context('When the setOkWorkers caller is not an owner', async() => {
      it('should be reverted', async () => {
        await expect(addRestrictedStratAsBob.setWorkersOk([mockWaultSwapEvilWorkerAsBob.address], true)).to.reverted
      })
    })

    context('When the caller worker is not whitelisted', async () => {
      it ('should revert', async() => {
        await baseTokenAsBob.transfer(mockWaultSwapEvilWorkerAsBob.address, ethers.utils.parseEther('0.01'));
        await expect(mockWaultSwapEvilWorkerAsBob.work(0, await bob.getAddress(), 0, ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addRestrictedStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256'],
            [ethers.utils.parseEther('0'), ethers.utils.parseEther('0.01')]
          )]
        ))).to.revertedWith('WaultSwapRestrictedStrategyAddTwoSidesOptimal::onlyWhitelistedWorkers:: bad worker')
      })
    })

    context('When the caller worker has been revoked from callable', async () => {
      it ('should revert', async() => {
        await baseTokenAsBob.transfer(mockWaultSwapEvilWorkerAsBob.address, ethers.utils.parseEther('0.01'));
        await addRestrictedStratAsDeployer.setWorkersOk([mockWaultSwapWorker.address], false)
        await expect(mockWaultSwapWorkerAsBob.work(0, await bob.getAddress(), 0, ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [addRestrictedStrat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256'],
            [ethers.utils.parseEther('0'), ethers.utils.parseEther('0.01')]
          )]
        ))).to.revertedWith('WaultSwapRestrictedStrategyAddTwoSidesOptimal::onlyWhitelistedWorkers:: bad worker')
      })
    })
  })
});
