import { ethers, upgrades } from 'hardhat'
import { Signer } from 'ethers'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import '@openzeppelin/test-helpers'
import {
  MockERC20,
  MockERC20__factory,
  WETH,
  WETH__factory,
  WNativeRelayer__factory,
  WaultSwapFactory,
  WaultSwapRouter,
  WaultSwapPair,
  MockWaultSwapWorker,
  WaultSwapRestrictedStrategyPartialCloseMinimizeTrading,
  WaultSwapFactory__factory,
  WaultSwapRouter__factory,
  WaultSwapPair__factory,
  MockWaultSwapWorker__factory,
  WaultSwapRestrictedStrategyPartialCloseMinimizeTrading__factory,
} from '../typechain'
import * as TestHelpers from './helpers/assert'

chai.use(solidity)
const { expect } = chai

describe('WaultSwapRestrictedStrategyPartialCloseMinimizeTrading', () => {
  const FOREVER = '2000000000';

  /// WaultSwap-related instance(s)
  let factory: WaultSwapFactory;
  let router: WaultSwapRouter;
  let lp: WaultSwapPair;
  let baseTokenWbnbLp: WaultSwapPair;

  /// MockWaultSwapWorker-related instance(s)
  let mockWaultSwapWorker: MockWaultSwapWorker;
  let mockWaultSwapEvilWorker: MockWaultSwapWorker
  let mockWaultSwapBaseTokenWbnbV2Worker: MockWaultSwapWorker;

  /// Token-related instance(s)
  let wbnb: WETH;
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let strat: WaultSwapRestrictedStrategyPartialCloseMinimizeTrading;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;
  let baseTokenWbnbLpV2AsBob: WaultSwapPair;

  let lpAsAlice: WaultSwapPair;
  let lpAsBob: WaultSwapPair;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let routerAsAlice: WaultSwapRouter;
  let routerAsBob: WaultSwapRouter;

  let stratAsAlice: WaultSwapRestrictedStrategyPartialCloseMinimizeTrading;
  let stratAsBob: WaultSwapRestrictedStrategyPartialCloseMinimizeTrading;

  let mockWaultSwapWorkerAsBob: MockWaultSwapWorker;
  let mockWaultSwapV2EvilWorkerAsBob: MockWaultSwapWorker
  let mockWaultSwapBaseTokenWbnbV2WorkerAsBob: MockWaultSwapWorker

  let wbnbAsAlice: WETH;
  let wbnbAsBob: WETH;

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
    await baseToken.mint(await alice.getAddress(), ethers.utils.parseEther('2'));
    await baseToken.mint(await bob.getAddress(), ethers.utils.parseEther('2'));
    farmingToken = await upgrades.deployProxy(MockERC20, ['FTOKEN', 'FTOKEN']) as MockERC20;
    await farmingToken.deployed();
    await farmingToken.mint(await alice.getAddress(), ethers.utils.parseEther('40'));
    await farmingToken.mint(await bob.getAddress(), ethers.utils.parseEther('40'));

    await factory.createPair(baseToken.address, farmingToken.address);
    await factory.createPair(baseToken.address, wbnb.address);

    lp = WaultSwapPair__factory.connect(await factory.getPair(farmingToken.address, baseToken.address), deployer);
    baseTokenWbnbLp = WaultSwapPair__factory.connect(await factory.getPair(wbnb.address, baseToken.address), deployer);

    /// Setup MockWaultSwapWorker
    const MockWaultSwapWorker = (await ethers.getContractFactory(
      "MockWaultSwapWorker",
      deployer,
    )) as MockWaultSwapWorker__factory;
    mockWaultSwapWorker = await MockWaultSwapWorker.deploy(lp.address, baseToken.address, farmingToken.address) as MockWaultSwapWorker
    await mockWaultSwapWorker.deployed();
    mockWaultSwapEvilWorker = await MockWaultSwapWorker.deploy(lp.address, baseToken.address, farmingToken.address) as MockWaultSwapWorker
    await mockWaultSwapEvilWorker.deployed();
    mockWaultSwapBaseTokenWbnbV2Worker = await MockWaultSwapWorker.deploy(baseTokenWbnbLp.address, baseToken.address, wbnb.address) as MockWaultSwapWorker
    await mockWaultSwapBaseTokenWbnbV2Worker.deployed()

    /// Setup WNativeRelayer
    const WNativeRelayer = (await ethers.getContractFactory(
        'WNativeRelayer',
        deployer
      )) as WNativeRelayer__factory;
      const wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
      await wNativeRelayer.deployed();

    const WaultSwapRestrictedStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyPartialCloseMinimizeTrading",
      deployer
    )) as WaultSwapRestrictedStrategyPartialCloseMinimizeTrading__factory;
    strat = await upgrades.deployProxy(WaultSwapRestrictedStrategyPartialCloseMinimizeTrading, [router.address, wbnb.address, wNativeRelayer.address]) as WaultSwapRestrictedStrategyPartialCloseMinimizeTrading;
    await strat.deployed();
    await strat.setWorkersOk([mockWaultSwapWorker.address, mockWaultSwapBaseTokenWbnbV2Worker.address], true)
    await wNativeRelayer.setCallerOk([strat.address], true)

    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);
    baseTokenWbnbLpV2AsBob = WaultSwapPair__factory.connect(baseTokenWbnbLp.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    routerAsAlice = WaultSwapRouter__factory.connect(router.address, alice);
    routerAsBob = WaultSwapRouter__factory.connect(router.address, bob);

    lpAsAlice = WaultSwapPair__factory.connect(lp.address, alice);
    lpAsBob = WaultSwapPair__factory.connect(lp.address, bob);

    stratAsAlice = WaultSwapRestrictedStrategyPartialCloseMinimizeTrading__factory.connect(strat.address, alice);
    stratAsBob = WaultSwapRestrictedStrategyPartialCloseMinimizeTrading__factory.connect(strat.address, bob);

    mockWaultSwapWorkerAsBob = MockWaultSwapWorker__factory.connect(mockWaultSwapWorker.address, bob);
    mockWaultSwapV2EvilWorkerAsBob = MockWaultSwapWorker__factory.connect(mockWaultSwapEvilWorker.address, bob);
    mockWaultSwapBaseTokenWbnbV2WorkerAsBob = MockWaultSwapWorker__factory.connect(mockWaultSwapBaseTokenWbnbV2Worker.address, bob);
    
    wbnbAsAlice = WETH__factory.connect(wbnb.address, alice);
    wbnbAsBob = WETH__factory.connect(wbnb.address, bob);
  });

  context('When the setOkWorkers caller is not an owner', async () => {
    it('should be reverted', async () => {
      await expect(stratAsBob.setWorkersOk([mockWaultSwapV2EvilWorkerAsBob.address], true)).to.revertedWith(
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
        'WaultSwapRestrictedStrategyPartialCloseMinimizeTrading::onlyWhitelistedWorkers:: bad worker',
      )
    })
  })

  context("When caller worker hasn't been whitelisted", async () => {
    it('should revert as bad worker', async () => {
      await expect(
        mockWaultSwapV2EvilWorkerAsBob.work(
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
        'WaultSwapRestrictedStrategyPartialCloseMinimizeTrading::onlyWhitelistedWorkers:: bad worker',
      )
    })
  })

  context('when revoking whitelist workers', async () => {
    it('should revert as bad worker', async () => {
      await strat.setWorkersOk([mockWaultSwapWorker.address], false)
      await expect(
        mockWaultSwapWorkerAsBob.work(
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
        'WaultSwapRestrictedStrategyPartialCloseMinimizeTrading::onlyWhitelistedWorkers:: bad worker',
      )
    })
  })

  context('When bad calldata', async () => {
    it('should revert', async () => {
      await expect(mockWaultSwapWorkerAsBob.work(0, await bob.getAddress(), '0', '0x1234')).to.reverted
    })
  })

  context('when lp amount that bob wish to return > the actual lp amount that he holds', async () => {
    it('should revert', async () => {
      await expect(
        mockWaultSwapWorkerAsBob.work(
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
        'WaultSwapRestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient LP amount recevied from worker',
      )
    })
  })

  context('It should convert LP tokens and farming token', async () => {
    beforeEach(async () => {
      // Alice adds 40 FTOKEN + 2 BaseToken
      await baseTokenAsAlice.approve(router.address, ethers.utils.parseEther('2'))
      await farmingTokenAsAlice.approve(router.address, ethers.utils.parseEther('40'))
      await routerAsAlice.addLiquidity(
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
      await baseTokenAsBob.approve(router.address, ethers.utils.parseEther('2'))
      await farmingTokenAsBob.approve(router.address, ethers.utils.parseEther('40'))
      await routerAsBob.addLiquidity(
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
            mockWaultSwapWorkerAsBob.work(
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
            'WaultSwapRestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received',
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
            mockWaultSwapWorkerAsBob.work(
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
          ).to.emit(strat, 'WaultSwapRestrictedStrategyPartialCloseMinimizeTradingEvent').withArgs(baseToken.address, farmingToken.address, ethers.utils.parseEther('4.472135954999579393'), ethers.utils.parseEther('0.8'))

          // remove liquidity 50%: 4.472135954999579393 LP token (20 farming token + 1 base token)
          // no trade
          const bobBaseTokenAfter = await baseToken.balanceOf(await bob.getAddress())
          const bobFTOKENAfter = await farmingToken.balanceOf(await bob.getAddress())
          expect(await lp.balanceOf(strat.address)).to.be.bignumber.eq(
            ethers.utils.parseEther('0'),
          )
          expect(await lp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0'))
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
            mockWaultSwapWorkerAsBob.work(
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
            'WaultSwapRestrictedStrategyPartialCloseMinimizeTrading::execute:: not enough to pay back debt',
          )
        })
      })

      context('when insufficient farming tokens received', async () => {
        // LP token to liquidate: 0.894427190999915878 Lp token (4 farming token + 0.2 base token)
        // Base token to be repaid debt: 0.24 base token
        it('should revert', async () => {
          await expect(
            mockWaultSwapWorkerAsBob.work(
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
            'WaultSwapRestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received',
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
            mockWaultSwapWorkerAsBob.work(
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
          ).to.emit(strat, 'WaultSwapRestrictedStrategyPartialCloseMinimizeTradingEvent').withArgs(baseToken.address, farmingToken.address, ethers.utils.parseEther('0.894427190999915878'),ethers.utils.parseEther('0.24'))

          // remove liquidity 10%: 0.894427190999915878 LP token (4 farming token + 0.2 base token)
          // trade
          // exactIn = (exactOut * reserveIn * 10000) / (tradingFee * (reserveOut - exactOut))
          // exactIn = (0.04 * 76 * 10000) / (9980 * (3.8 - 0.04))
          // exactIn = 0.8101309000980685
          // remainingFarmingToken = 4 - 0.8101309000980685 = 3.1898690999019315
          const bobBaseTokenAfter = await baseToken.balanceOf(await bob.getAddress())
          const bobFTOKENAfter = await farmingToken.balanceOf(await bob.getAddress())
          expect(await lp.balanceOf(strat.address)).to.be.bignumber.eq(
            ethers.utils.parseEther('0'),
          )
          expect(await lp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0'))
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther('0.24').toString(),
            bobBaseTokenAfter.sub(bobBaseTokenBefore).toString(),
          )
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther('3.1898690999019315').toString(),
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
      await baseTokenAsAlice.approve(router.address, ethers.utils.parseEther('1'))
      await wbnbAsAlice.approve(router.address, ethers.utils.parseEther('0.1'))
      await routerAsAlice.addLiquidity(
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
      await baseTokenAsBob.approve(router.address, ethers.utils.parseEther('1'))
      await wbnbAsBob.approve(router.address, ethers.utils.parseEther('1'))
      await routerAsBob.addLiquidity(
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
      expect(await baseTokenWbnbLp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(
        ethers.utils.parseEther('0.316227766016837933'),
      )
      await baseTokenWbnbLpV2AsBob.transfer(
        mockWaultSwapBaseTokenWbnbV2Worker.address,
        ethers.utils.parseEther('0.316227766016837933'),
      )
    })
    context('when no trade (repaid debt <= received BaseToken from LP token)', async () => {
      // LP token to liquidate: 0.158113883008418966 Lp token (0.05 farming token + 0.5 base token)
      // Base token to be repaid debt: 0.1 base token
      context('when insufficient farming tokens received', async () => {
        it('should revert', async () => {
          await expect(
            mockWaultSwapBaseTokenWbnbV2WorkerAsBob.work(
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
            'WaultSwapRestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received',
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
            mockWaultSwapBaseTokenWbnbV2WorkerAsBob.work(
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
          ).to.emit(strat, 'WaultSwapRestrictedStrategyPartialCloseMinimizeTradingEvent').withArgs(baseToken.address, wbnb.address, ethers.utils.parseEther('0.158113883008418966'), ethers.utils.parseEther('0.1'))

          // remove liquidity 50%: 0.158113883008418966 LP token (0.05 farming token + 0.5 base token)
          // no trade
          const bobBaseTokenAfter = await baseToken.balanceOf(await bob.getAddress())
          const bobBnbAfter = await ethers.provider.getBalance(await bob.getAddress())
          expect(await lp.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))
          expect(await lp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0'))
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
            mockWaultSwapBaseTokenWbnbV2WorkerAsBob.work(
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
            'WaultSwapRestrictedStrategyPartialCloseMinimizeTrading::execute:: not enough to pay back debt',
          )
        })
      })

      context('when insufficient farming tokens received', async () => {
        // LP token to liquidate: 0.158113883008418966 Lp token (0.05 farming token + 0.5 base token)
        // Base token to be repaid debt: 1 base token
        it('should revert', async () => {
          await expect(
            mockWaultSwapBaseTokenWbnbV2WorkerAsBob.work(
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
            'WaultSwapRestrictedStrategyPartialCloseMinimizeTrading::execute:: insufficient farming tokens received',
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
            mockWaultSwapBaseTokenWbnbV2WorkerAsBob.work(
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
          ).to.emit(strat, 'WaultSwapRestrictedStrategyPartialCloseMinimizeTradingEvent').withArgs(baseToken.address, wbnb.address, ethers.utils.parseEther('0.158113883008418966'), ethers.utils.parseEther('0.6'))

          // remove liquidity 50%: 0.158113883008418966 LP token (0.05 farming token + 0.5 base token)
          // trade
          // exactIn = (exactOut * reserveIn * 10000) / (tradingFee * (reserveOut - exactOut))
          // exactIn = (0.1 * 0.15 * 10000) / (9980 * (1.5 - 0.1))
          // exactIn = 0.0107357572287432
          // remainingFarmingToken = 0.05 - 0.0107357572287432 = 0.0392642427712568
          const bobBaseTokenAfter = await baseToken.balanceOf(await bob.getAddress())
          const bobBnbAfter = await ethers.provider.getBalance(await bob.getAddress())
          expect(await lp.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))
          expect(await lp.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0'))
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther('0.6').toString(),
            bobBaseTokenAfter.sub(bobBaseTokenBefore).toString(),
          )
          TestHelpers.assertAlmostEqual(
            ethers.utils.parseEther('0.0392642427712568').toString(),
            bobBnbAfter.sub(bobBnbBefore).toString(),
          )
        })
      })
    })
  })
})
