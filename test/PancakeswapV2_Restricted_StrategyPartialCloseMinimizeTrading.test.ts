import { ethers, upgrades } from 'hardhat'
import { Signer } from 'ethers'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import '@openzeppelin/test-helpers'
import {
  MockERC20,
  MockERC20__factory,
  PancakeFactory,
  PancakeFactory__factory,
  PancakePair,
  PancakePair__factory,
  PancakeRouterV2__factory,
  PancakeRouterV2,
  WETH,
  WETH__factory,
  WNativeRelayer__factory,
  PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading,
  PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading__factory,
} from '../typechain'
import { MockPancakeswapV2Worker__factory } from '../typechain/factories/MockPancakeswapV2Worker__factory'
import { MockPancakeswapV2Worker } from '../typechain/MockPancakeswapV2Worker'
import * as TestHelpers from './helpers/assert'

chai.use(solidity)
const { expect } = chai

describe('PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading', () => {
  const FOREVER = '2000000000'

  /// Pancakeswap-related instance(s)
  let factoryV2: PancakeFactory
  let routerV2: PancakeRouterV2
  let lpV2: PancakePair
  let baseTokenWbnbLpV2: PancakePair

  /// MockPancakeswapV2Worker-related instance(s)
  let mockPancakeswapV2Worker: MockPancakeswapV2Worker
  let mockPancakeswapV2EvilWorker: MockPancakeswapV2Worker
  let mockPancakeswapBaseTokenWbnbV2Worker: MockPancakeswapV2Worker

  /// Token-related instance(s)
  let wbnb: WETH
  let baseToken: MockERC20
  let farmingToken: MockERC20

  /// Strategy instance(s)
  let strat: PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading

  // Accounts
  let deployer: Signer
  let alice: Signer
  let bob: Signer

  // Contract Signer
  let baseTokenAsAlice: MockERC20
  let baseTokenAsBob: MockERC20
  let baseTokenWbnbLpV2AsBob: PancakePair

  let lpAsAlice: PancakePair
  let lpAsBob: PancakePair

  let farmingTokenAsAlice: MockERC20
  let farmingTokenAsBob: MockERC20

  let routerV2AsAlice: PancakeRouterV2
  let routerV2AsBob: PancakeRouterV2

  let stratAsAlice: PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading
  let stratAsBob: PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading

  let mockPancakeswapV2WorkerAsBob: MockPancakeswapV2Worker
  let mockPancakeswapV2EvilWorkerAsBob: MockPancakeswapV2Worker
  let mockPancakeswapBaseTokenWbnbV2WorkerAsBob: MockPancakeswapV2Worker

  let wbnbAsAlice: WETH
  let wbnbAsBob: WETH

  beforeEach(async () => {
    ;[deployer, alice, bob] = await ethers.getSigners()

    // Setup Pancakeswap
    const PancakeFactory = (await ethers.getContractFactory('PancakeFactory', deployer)) as PancakeFactory__factory
    factoryV2 = await PancakeFactory.deploy(await deployer.getAddress())
    await factoryV2.deployed()

    const WBNB = (await ethers.getContractFactory('WETH', deployer)) as WETH__factory
    wbnb = await WBNB.deploy()

    const PancakeRouterV2 = (await ethers.getContractFactory('PancakeRouterV2', deployer)) as PancakeRouterV2__factory
    routerV2 = await PancakeRouterV2.deploy(factoryV2.address, wbnb.address)
    await routerV2.deployed()

    /// Setup token stuffs
    const MockERC20 = (await ethers.getContractFactory('MockERC20', deployer)) as MockERC20__factory
    baseToken = (await upgrades.deployProxy(MockERC20, ['BTOKEN', 'BTOKEN'])) as MockERC20
    await baseToken.deployed()
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther('2'))
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther('2'))
    farmingToken = (await upgrades.deployProxy(MockERC20, ['FTOKEN', 'FTOKEN'])) as MockERC20
    await farmingToken.deployed()
    await farmingToken.mint(await alice.getAddress(), ethers.utils.parseEther('40'))
    await farmingToken.mint(await bob.getAddress(), ethers.utils.parseEther('40'))

    await factoryV2.createPair(baseToken.address, farmingToken.address)
    await factoryV2.createPair(baseToken.address, wbnb.address)

    lpV2 = PancakePair__factory.connect(await factoryV2.getPair(farmingToken.address, baseToken.address), deployer)
    baseTokenWbnbLpV2 = PancakePair__factory.connect(await factoryV2.getPair(wbnb.address, baseToken.address), deployer)

    /// Setup MockPancakeswapV2Worker
    const MockPancakeswapV2Worker = (await ethers.getContractFactory(
      'MockPancakeswapV2Worker',
      deployer,
    )) as MockPancakeswapV2Worker__factory
    mockPancakeswapV2Worker = (await MockPancakeswapV2Worker.deploy(
      lpV2.address,
      baseToken.address,
      farmingToken.address,
    )) as MockPancakeswapV2Worker
    await mockPancakeswapV2Worker.deployed()
    mockPancakeswapV2EvilWorker = (await MockPancakeswapV2Worker.deploy(
      lpV2.address,
      baseToken.address,
      farmingToken.address,
    )) as MockPancakeswapV2Worker
    await mockPancakeswapV2EvilWorker.deployed()
    mockPancakeswapBaseTokenWbnbV2Worker = (await MockPancakeswapV2Worker.deploy(
      baseTokenWbnbLpV2.address,
      baseToken.address,
      wbnb.address,
    )) as MockPancakeswapV2Worker
    await mockPancakeswapBaseTokenWbnbV2Worker.deployed()

    /// Setup WNativeRelayer
    const WNativeRelayer = (await ethers.getContractFactory('WNativeRelayer', deployer)) as WNativeRelayer__factory
    const wNativeRelayer = await WNativeRelayer.deploy(wbnb.address)
    await wNativeRelayer.deployed()

    const PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      'PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading',
      deployer,
    )) as PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading__factory
    strat = (await upgrades.deployProxy(PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading, [
      routerV2.address,
      wbnb.address,
      wNativeRelayer.address,
    ])) as PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading
    await strat.deployed()
    await strat.setWorkersOk([mockPancakeswapV2Worker.address, mockPancakeswapBaseTokenWbnbV2Worker.address], true)
    await wNativeRelayer.setCallerOk([strat.address], true)

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice)
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob)
    baseTokenWbnbLpV2AsBob = PancakePair__factory.connect(baseTokenWbnbLpV2.address, bob)

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice)
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob)

    routerV2AsAlice = PancakeRouterV2__factory.connect(routerV2.address, alice)
    routerV2AsBob = PancakeRouterV2__factory.connect(routerV2.address, bob)

    lpAsAlice = PancakePair__factory.connect(lpV2.address, alice)
    lpAsBob = PancakePair__factory.connect(lpV2.address, bob)

    stratAsAlice = PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading__factory.connect(strat.address, alice)
    stratAsBob = PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading__factory.connect(strat.address, bob)

    mockPancakeswapV2WorkerAsBob = MockPancakeswapV2Worker__factory.connect(mockPancakeswapV2Worker.address, bob)
    mockPancakeswapV2EvilWorkerAsBob = MockPancakeswapV2Worker__factory.connect(
      mockPancakeswapV2EvilWorker.address,
      bob,
    )
    mockPancakeswapBaseTokenWbnbV2WorkerAsBob = MockPancakeswapV2Worker__factory.connect(
      mockPancakeswapBaseTokenWbnbV2Worker.address,
      bob,
    )

    wbnbAsAlice = WETH__factory.connect(wbnb.address, alice)
    wbnbAsBob = WETH__factory.connect(wbnb.address, bob)
  })

  context('When the setOkWorkers caller is not an owner', async () => {
    it('should be reverted', async () => {
      await expect(stratAsBob.setWorkersOk([mockPancakeswapV2EvilWorkerAsBob.address], true)).to.revertedWith(
        'Ownable: caller is not the owner',
      )
    })
  })

  context('When non-worker call the strat', async () => {
    it('should revert', async () => {
      await expect(
        stratAsBob.execute(
          await bob.getAddress(),
          '0',
          ethers.utils.defaultAbiCoder.encode(
            ['uint256', 'uint256', 'uint256'],
            [ethers.utils.parseEther('0.5'), ethers.utils.parseEther('0.5'), ethers.utils.parseEther('0.5')],
          ),
        ),
      ).to.revertedWith(
        'PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading::onlyWhitelistedWorkers:: bad worker',
      )
    })
  })

  context("When caller worker hasn't been whitelisted", async () => {
    it('should revert as bad worker', async () => {
      await expect(
        mockPancakeswapV2EvilWorkerAsBob.work(
          0,
          await bob.getAddress(),
          '0',
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'bytes'],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ['uint256', 'uint256', 'uint256'],
                [ethers.utils.parseEther('0.5'), ethers.utils.parseEther('0.5'), ethers.utils.parseEther('0.5')],
              ),
            ],
          ),
        ),
      ).to.revertedWith(
        'PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading::onlyWhitelistedWorkers:: bad worker',
      )
    })
  })

  context('when revoking whitelist workers', async () => {
    it('should revert as bad worker', async () => {
      await strat.setWorkersOk([mockPancakeswapV2Worker.address], false)
      await expect(
        mockPancakeswapV2WorkerAsBob.work(
          0,
          await bob.getAddress(),
          '0',
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'bytes'],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ['uint256', 'uint256', 'uint256'],
                [ethers.utils.parseEther('0.5'), ethers.utils.parseEther('0.5'), ethers.utils.parseEther('0.5')],
              ),
            ],
          ),
        ),
      ).to.revertedWith(
        'PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading::onlyWhitelistedWorkers:: bad worker',
      )
    })
  })

  context('When bad calldata', async () => {
    it('should revert', async () => {
      await expect(mockPancakeswapV2WorkerAsBob.work(0, await bob.getAddress(), '0', '0x1234')).to.reverted
    })
  })

  context('when lp amount that bob wish to return > the actual lp amount that he holds', async () => {
    it('should revert', async () => {
      await expect(
        mockPancakeswapV2WorkerAsBob.work(
          0,
          await bob.getAddress(),
          '0',
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'bytes'],
            [
              strat.address,
              ethers.utils.defaultAbiCoder.encode(
                ['uint256', 'uint256', 'uint256'],
                [ethers.utils.parseEther('0.5'), ethers.utils.parseEther('0.5'), ethers.utils.parseEther('0.5')],
              ),
            ],
          ),
        ),
      ).to.revertedWith(
        'PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient LP amount recevied from worker',
      )
    })
  })

  context('It should convert LP tokens and farming token', async () => {
    beforeEach(async () => {
      // Alice adds 40 FTOKEN + 2 BaseToken
      await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther('2'))
      await farmingTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther('40'))
      await routerV2AsAlice.addLiquidity(
        baseToken.address,
        farmingToken.address,
        ethers.utils.parseEther('2'),
        ethers.utils.parseEther('40'),
        '0',
        '0',
        await alice.getAddress(),
        FOREVER,
      )

      // Bob adds 40 FTOKEN + 2 BaseToken
      await baseTokenAsBob.approve(routerV2.address, ethers.utils.parseEther('2'))
      await farmingTokenAsBob.approve(routerV2.address, ethers.utils.parseEther('40'))
      await routerV2AsBob.addLiquidity(
        baseToken.address,
        farmingToken.address,
        ethers.utils.parseEther('2'),
        ethers.utils.parseEther('40'),
        '0',
        '0',
        await bob.getAddress(),
        FOREVER,
      )

      await lpAsBob.transfer(strat.address, ethers.utils.parseEther('8.944271909999158785'))
    })

    context('when no trade (repaid debt <= received BaseToken from LP token)', async () => {
      // LP token to liquidate: 4.472135954999579392 Lp token (20 farming token + 1 base token)
      // Base token to be repaid debt: 0.8 base token
      context('when insufficient farming tokens received', async () => {
        it('should revert', async () => {
          await expect(
            mockPancakeswapV2WorkerAsBob.work(
              0,
              await bob.getAddress(),
              '0',
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes'],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ['uint256', 'uint256', 'uint256'],
                    [
                      ethers.utils.parseEther('4.472135954999579393'),
                      ethers.utils.parseEther('0.8'),
                      ethers.utils.parseEther('25'),
                    ],
                  ),
                ],
              ),
            ),
          ).to.revertedWith(
            'PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received',
          )
        })
      })
      context('when successfully', async () => {
        // LP token to liquidate: 4.472135954999579392 Lp token (20 farming token + 1 base token)
        // Base token to be repaid debt: 0.8 base token
        it('should be successfully', async () => {
          const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress())
          const bobFTOKENBefore = await farmingToken.balanceOf(await bob.getAddress())

          await expect(
            mockPancakeswapV2WorkerAsBob.work(
              0,
              await bob.getAddress(),
              '0',
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes'],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ['uint256', 'uint256', 'uint256'],
                    [
                      ethers.utils.parseEther('4.472135954999579393'),
                      ethers.utils.parseEther('0.8'),
                      ethers.utils.parseEther('19.2'),
                    ],
                  ),
                ],
              ),
            ),
          ).to.emit(strat, 'PancakeswapV2RestrictedStrategyPartialCloseMinimizeTradingEvent').withArgs(baseToken.address, farmingToken.address, ethers.utils.parseEther('4.472135954999579393'), ethers.utils.parseEther('0.8'))

          // remove liquidity 50%: 4.472135954999579393 LP token (20 farming token + 1 base token)
          // no trade
          const bobBaseTokenAfter = await baseToken.balanceOf(await bob.getAddress())
          const bobFTOKENAfter = await farmingToken.balanceOf(await bob.getAddress())
          expect(await lpV2.balanceOf(strat.address)).to.be.bignumber.eq(
            ethers.utils.parseEther('0'),
          )
          expect(await lpV2.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0'))
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther('1').toString(),
            bobBaseTokenAfter.sub(bobBaseTokenBefore).toString(),
          )
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther('20').toString(),
            bobFTOKENAfter.sub(bobFTOKENBefore).toString(),
          )
        })
      })
    })

    context('when some trade (repaid debt > received Base token from LP)', async () => {
      context('when rapaid debt > received Base token from LP + trade', async () => {
        // LP token to liquidate: 0.894427190999915878 Lp token (4 farming token + 0.2 base token) ~ 0.4 base token
        // Base token to be repaid debt: 0.5 base token
        it('should be revert', async () => {
          const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress())
          const bobFTOKENBefore = await farmingToken.balanceOf(await bob.getAddress())

          await expect(
            mockPancakeswapV2WorkerAsBob.work(
              0,
              await bob.getAddress(),
              '0',
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes'],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ['uint256', 'uint256', 'uint256'],
                    [
                      ethers.utils.parseEther('0.894427190999915878'),
                      ethers.utils.parseEther('0.5'),
                      ethers.utils.parseEther('0'),
                    ],
                  ),
                ],
              ),
            ),
          ).to.revertedWith(
            'PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading::execute:: not enough to pay back debt',
          )
        })
      })

      context('when insufficient farming tokens received', async () => {
        // LP token to liquidate: 0.894427190999915878 Lp token (4 farming token + 0.2 base token)
        // Base token to be repaid debt: 0.24 base token
        it('should revert', async () => {
          await expect(
            mockPancakeswapV2WorkerAsBob.work(
              0,
              await bob.getAddress(),
              '0',
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes'],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ['uint256', 'uint256', 'uint256'],
                    [
                      ethers.utils.parseEther('0.894427190999915878'),
                      ethers.utils.parseEther('0.24'),
                      ethers.utils.parseEther('3.2'),
                    ],
                  ),
                ],
              ),
            ),
          ).to.revertedWith(
            'PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received',
          )
        })
      })
      context('when successfully', async () => {
        // LP token to liquidate: 0.894427190999915878 Lp token (4 farming token + 0.2 base token)
        // Base token to be repaid debt: 0.24 base token
        it('should be successfully', async () => {
          const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress())
          const bobFTOKENBefore = await farmingToken.balanceOf(await bob.getAddress())

          await expect(
            mockPancakeswapV2WorkerAsBob.work(
              0,
              await bob.getAddress(),
              '0',
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes'],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ['uint256', 'uint256', 'uint256'],
                    [
                      ethers.utils.parseEther('0.894427190999915878'),
                      ethers.utils.parseEther('0.24'),
                      ethers.utils.parseEther('3.168'),
                    ],
                  ),
                ],
              ),
            ),
          ).to.emit(strat, 'PancakeswapV2RestrictedStrategyPartialCloseMinimizeTradingEvent').withArgs(baseToken.address, farmingToken.address, ethers.utils.parseEther('0.894427190999915878'), ethers.utils.parseEther('0.24'))

          // remove liquidity 10%: 0.894427190999915878 LP token (4 farming token + 0.2 base token)
          // trade
          // exactIn = (exactOut * reserveIn * 10000) / (tradingFee * (reserveOut - exactOut))
          // exactIn = (0.04 * 76 * 10000) / (9975 * (3.8 - 0.04))
          // exactIn = 0.810536980749747
          // remainingFarmingToken = 4 - 0.810536980749747 = 3.189463019250253
          const bobBaseTokenAfter = await baseToken.balanceOf(await bob.getAddress())
          const bobFTOKENAfter = await farmingToken.balanceOf(await bob.getAddress())
          expect(await lpV2.balanceOf(strat.address)).to.be.bignumber.eq(
            ethers.utils.parseEther('0'),
          )
          expect(await lpV2.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0'))
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther('0.24').toString(),
            bobBaseTokenAfter.sub(bobBaseTokenBefore).toString(),
          )
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther('3.189463019250253').toString(),
            bobFTOKENAfter.sub(bobFTOKENBefore).toString(),
          )
        })
      })
    })
  })
  context('It should handle properly when the farming token is WBNB', () => {
    beforeEach(async () => {
      // Alice wrap BNB
      await wbnbAsAlice.deposit({ value: ethers.utils.parseEther('0.1') })
      // Alice adds 0.1 WBNB + 1 BaseToken
      await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther('1'))
      await wbnbAsAlice.approve(routerV2.address, ethers.utils.parseEther('0.1'))
      await routerV2AsAlice.addLiquidity(
        baseToken.address,
        wbnb.address,
        ethers.utils.parseEther('1'),
        ethers.utils.parseEther('0.1'),
        '0',
        '0',
        await alice.getAddress(),
        FOREVER,
      )

      // Bob wrap BNB
      await wbnbAsBob.deposit({ value: ethers.utils.parseEther('1') })
      // Bob tries to add 1 WBNB + 1 BaseToken (but obviously can only add 0.1 WBNB)
      await baseTokenAsBob.approve(routerV2.address, ethers.utils.parseEther('1'))
      await wbnbAsBob.approve(routerV2.address, ethers.utils.parseEther('1'))
      await routerV2AsBob.addLiquidity(
        baseToken.address,
        wbnb.address,
        ethers.utils.parseEther('1'),
        ethers.utils.parseEther('1'),
        '0',
        '0',
        await bob.getAddress(),
        FOREVER,
      )
      expect(await wbnb.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0.9'))
      expect(await baseTokenWbnbLpV2.balanceOf(await bob.getAddress())).to.be.bignumber.eq(
        ethers.utils.parseEther('0.316227766016837933'),
      )
      await baseTokenWbnbLpV2AsBob.transfer(
        mockPancakeswapBaseTokenWbnbV2Worker.address,
        ethers.utils.parseEther('0.316227766016837933'),
      )
    })
    context('when no trade (repaid debt <= received BaseToken from LP token)', async () => {
      // LP token to liquidate: 0.158113883008418966 Lp token (0.05 farming token + 0.5 base token)
      // Base token to be repaid debt: 0.1 base token
      context('when insufficient farming tokens received', async () => {
        it('should revert', async () => {
          await expect(
            mockPancakeswapBaseTokenWbnbV2WorkerAsBob.work(
              0,
              await bob.getAddress(),
              '0',
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes'],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ['uint256', 'uint256', 'uint256'],
                    [
                      ethers.utils.parseEther('0.158113883008418966'),
                      ethers.utils.parseEther('0.1'),
                      ethers.utils.parseEther('0.5'),
                    ],
                  ),
                ],
              ),
            ),
          ).to.revertedWith(
            'PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received',
          )
        })
      })
      context('when successfully', async () => {
        // LP token to liquidate: 0.158113883008418966 Lp token (0.05 farming token + 0.5 base token)
        // Base token to be repaid debt: 0.1 base token
        it('should be successfully', async () => {
          const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress())
          const bobBnbBefore = await ethers.provider.getBalance(await bob.getAddress())

          await expect(
            mockPancakeswapBaseTokenWbnbV2WorkerAsBob.work(
              0,
              await bob.getAddress(),
              '0',
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes'],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ['uint256', 'uint256', 'uint256'],
                    [
                      ethers.utils.parseEther('0.158113883008418966'),
                      ethers.utils.parseEther('0.1'),
                      ethers.utils.parseEther('0.0495'),
                    ],
                  ),
                ],
              ),
              { gasPrice: 0 },
            ),
          ).to.emit(strat, 'PancakeswapV2RestrictedStrategyPartialCloseMinimizeTradingEvent').withArgs(baseToken.address, wbnb.address, ethers.utils.parseEther('0.158113883008418966'), ethers.utils.parseEther('0.1'))

          // remove liquidity 50%: 0.158113883008418966 LP token (0.05 farming token + 0.5 base token)
          // no trade
          const bobBaseTokenAfter = await baseToken.balanceOf(await bob.getAddress())
          const bobBnbAfter = await ethers.provider.getBalance(await bob.getAddress())
          expect(await lpV2.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))
          expect(await lpV2.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0'))
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther('0.5').toString(),
            bobBaseTokenAfter.sub(bobBaseTokenBefore).toString(),
          )
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther('0.05').toString(),
            bobBnbAfter.sub(bobBnbBefore).toString(),
          )
        })
      })
    })

    context('when some trade (repaid debt > received Base token from LP)', async () => {
      context('when rapaid debt > received Base token from LP + trade', async () => {
        // LP token to liquidate: 0.158113883008418966 Lp token (0.05 farming token + 0.5 base token)
        // Base token to be repaid debt: 1 base token
        it('should be revert', async () => {
          const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress())
          const bobFTOKENBefore = await farmingToken.balanceOf(await bob.getAddress())

          await expect(
            mockPancakeswapBaseTokenWbnbV2WorkerAsBob.work(
              0,
              await bob.getAddress(),
              '0',
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes'],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ['uint256', 'uint256', 'uint256'],
                    [
                      ethers.utils.parseEther('0.158113883008418966'),
                      ethers.utils.parseEther('1'),
                      ethers.utils.parseEther('0.0495'),
                    ],
                  ),
                ],
              ),
              { gasPrice: 0 },
            ),
          ).to.revertedWith(
            'PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading::execute:: not enough to pay back debt',
          )
        })
      })

      context('when insufficient farming tokens received', async () => {
        // LP token to liquidate: 0.158113883008418966 Lp token (0.05 farming token + 0.5 base token)
        // Base token to be repaid debt: 1 base token
        it('should revert', async () => {
          await expect(
            mockPancakeswapBaseTokenWbnbV2WorkerAsBob.work(
              0,
              await bob.getAddress(),
              '0',
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes'],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ['uint256', 'uint256', 'uint256'],
                    [
                      ethers.utils.parseEther('0.158113883008418966'),
                      ethers.utils.parseEther('0.6'),
                      ethers.utils.parseEther('0.4'),
                    ],
                  ),
                ],
              ),
              { gasPrice: 0 },
            ),
          ).to.revertedWith(
            'PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received',
          )
        })
      })
      context('when successfully', async () => {
        // LP token to liquidate: 0.158113883008418966 Lp token (0.05 farming token + 0.5 base token)
        // Base token to be repaid debt: 1 base token
        it('should be successfully', async () => {
          const bobBaseTokenBefore = await baseToken.balanceOf(await bob.getAddress())
          const bobBnbBefore = await ethers.provider.getBalance(await bob.getAddress())

          await expect(
            mockPancakeswapBaseTokenWbnbV2WorkerAsBob.work(
              0,
              await bob.getAddress(),
              '0',
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes'],
                [
                  strat.address,
                  ethers.utils.defaultAbiCoder.encode(
                    ['uint256', 'uint256', 'uint256'],
                    [
                      ethers.utils.parseEther('0.158113883008418966'),
                      ethers.utils.parseEther('0.6'),
                      ethers.utils.parseEther('0.037'),
                    ],
                  ),
                ],
              ),
              { gasPrice: 0 },
            ),
          ).to.emit(strat, 'PancakeswapV2RestrictedStrategyPartialCloseMinimizeTradingEvent').withArgs(baseToken.address, wbnb.address, ethers.utils.parseEther('0.158113883008418966'), ethers.utils.parseEther('0.6'))

          // remove liquidity 50%: 0.158113883008418966 LP token (0.05 farming token + 0.5 base token)
          // trade
          // exactIn = (exactOut * reserveIn * 10000) / (tradingFee * (reserveOut - exactOut))
          // exactIn = (0.1 * 0.15 * 10000) / (9975 * (1.5 - 0.1))
          // exactIn = 0.010741138560687433
          // remainingFarmingToken = 0.05 - 0.010741138560687433 = 0.03925886143931257
          const bobBaseTokenAfter = await baseToken.balanceOf(await bob.getAddress())
          const bobBnbAfter = await ethers.provider.getBalance(await bob.getAddress())
          expect(await lpV2.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))
          expect(await lpV2.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0'))
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther('0.6').toString(),
            bobBaseTokenAfter.sub(bobBaseTokenBefore).toString(),
          )
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther('0.03925886143931257').toString(),
            bobBnbAfter.sub(bobBnbBefore).toString(),
          )
        })
      })
    })
  })
})
