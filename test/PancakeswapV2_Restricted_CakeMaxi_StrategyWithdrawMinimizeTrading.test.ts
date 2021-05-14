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
  PancakeRouter,
  PancakeRouterV2__factory,
  PancakeRouter__factory,
  PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading,
  PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading__factory,
  WETH,
  WETH__factory,
  WNativeRelayer__factory,
  WNativeRelayer
} from "../typechain";
import { MockPancakeswapV2CakeMaxiWorker__factory } from "../typechain/factories/MockPancakeswapV2CakeMaxiWorker__factory";
import { MockPancakeswapV2CakeMaxiWorker } from "../typechain/MockPancakeswapV2CakeMaxiWorker";

chai.use(solidity);
const { expect } = chai;

describe('PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading', () => {
  const FOREVER = '2000000000';

  /// Pancakeswap-related instance(s)
  let factoryV2: PancakeFactory;
  let routerV2: PancakeRouter;

  /// MockPancakeswapV2CakeMaxiWorker-related instance(s)
  let mockPancakeswapV2WorkerBaseFTokenPair: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2WorkerBNBFtokenPair: MockPancakeswapV2CakeMaxiWorker
  let mockPancakeswapV2WorkerBaseBNBTokenPair: MockPancakeswapV2CakeMaxiWorker
  let mockPancakeswapV2EvilWorker: MockPancakeswapV2CakeMaxiWorker

  /// Token-related instance(s)
  let wbnb: WETH
  let baseToken: MockERC20;
  let farmingToken: MockERC20;

  /// Strategy instance(s)
  let strat: PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  // Contract Signer
  let baseTokenAsAlice: MockERC20;
  let baseTokenAsBob: MockERC20;

  let farmingTokenAsAlice: MockERC20;
  let farmingTokenAsBob: MockERC20;

  let wbnbTokenAsAlice: WETH;

  let routerV2AsAlice: PancakeRouter;
  let routerV2AsBob: PancakeRouter;

  let stratAsAlice: PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading;
  let stratAsBob: PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading;

  let mockPancakeswapV2WorkerBaseFTokenPairAsAlice: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2WorkerBNBFtokenPairAsAlice: MockPancakeswapV2CakeMaxiWorker;
  let mockPancakeswapV2WorkerBaseBNBTokenPairAsAlice: MockPancakeswapV2CakeMaxiWorker
  let mockPancakeswapV2EvilWorkerAsAlice: MockPancakeswapV2CakeMaxiWorker

  let wNativeRelayer: WNativeRelayer;

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

    /// Setup WNativeRelayer
    const WNativeRelayer = (await ethers.getContractFactory(
      'WNativeRelayer',
      deployer
    )) as WNativeRelayer__factory;
    wNativeRelayer = await WNativeRelayer.deploy(wbnb.address);
    await wNativeRelayer.deployed();
    
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
    await factoryV2.createPair(baseToken.address, wbnb.address);
    await factoryV2.createPair(farmingToken.address, wbnb.address);
    /// Setup MockPancakeswapV2CakeMaxiWorker
    const MockPancakeswapV2CakeMaxiWorker = (await ethers.getContractFactory(
      "MockPancakeswapV2CakeMaxiWorker",
      deployer,
    )) as MockPancakeswapV2CakeMaxiWorker__factory;
    mockPancakeswapV2WorkerBaseFTokenPair = await MockPancakeswapV2CakeMaxiWorker.deploy(baseToken.address, farmingToken.address) as MockPancakeswapV2CakeMaxiWorker
    await mockPancakeswapV2WorkerBaseFTokenPair.deployed();
    
    mockPancakeswapV2WorkerBNBFtokenPair = await MockPancakeswapV2CakeMaxiWorker.deploy(wbnb.address, farmingToken.address) as MockPancakeswapV2CakeMaxiWorker
    await mockPancakeswapV2WorkerBNBFtokenPair.deployed();

    mockPancakeswapV2WorkerBaseBNBTokenPair = await MockPancakeswapV2CakeMaxiWorker.deploy(baseToken.address, wbnb.address) as MockPancakeswapV2CakeMaxiWorker
    await mockPancakeswapV2WorkerBaseBNBTokenPair.deployed();
    
    mockPancakeswapV2EvilWorker = await MockPancakeswapV2CakeMaxiWorker.deploy(baseToken.address, farmingToken.address) as MockPancakeswapV2CakeMaxiWorker
    await mockPancakeswapV2EvilWorker.deployed();

    const PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading",
      deployer
    )) as PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading__factory;
    strat = await upgrades.deployProxy(PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading, [routerV2.address, wNativeRelayer.address]) as PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading;
    await strat.deployed();
    await strat.setWorkersOk([mockPancakeswapV2WorkerBaseFTokenPair.address, mockPancakeswapV2WorkerBNBFtokenPair.address, mockPancakeswapV2WorkerBaseBNBTokenPair.address], true)
    await wNativeRelayer.setCallerOk([strat.address], true)
    // Assign contract signer
    baseTokenAsAlice = MockERC20__factory.connect(baseToken.address, alice);
    baseTokenAsBob = MockERC20__factory.connect(baseToken.address, bob);

    farmingTokenAsAlice = MockERC20__factory.connect(farmingToken.address, alice);
    farmingTokenAsBob = MockERC20__factory.connect(farmingToken.address, bob);

    wbnbTokenAsAlice = WETH__factory.connect(wbnb.address, alice)

    routerV2AsAlice = PancakeRouter__factory.connect(routerV2.address, alice);
    routerV2AsBob = PancakeRouter__factory.connect(routerV2.address, bob);

    stratAsAlice = PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading__factory.connect(strat.address, alice);
    stratAsBob = PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading__factory.connect(strat.address, bob);

    mockPancakeswapV2WorkerBaseFTokenPairAsAlice = MockPancakeswapV2CakeMaxiWorker__factory.connect(mockPancakeswapV2WorkerBaseFTokenPair.address, alice);
    mockPancakeswapV2WorkerBNBFtokenPairAsAlice = MockPancakeswapV2CakeMaxiWorker__factory.connect(mockPancakeswapV2WorkerBNBFtokenPair.address, alice);
    mockPancakeswapV2WorkerBaseBNBTokenPairAsAlice = MockPancakeswapV2CakeMaxiWorker__factory.connect(mockPancakeswapV2WorkerBaseBNBTokenPair.address, alice);
    mockPancakeswapV2EvilWorkerAsAlice = MockPancakeswapV2CakeMaxiWorker__factory.connect(mockPancakeswapV2EvilWorker.address, alice);
    // Adding liquidity to the pool
    // Alice adds 0.1 FTOKEN + 1 WBTC + 1 WBNB
    await wbnbTokenAsAlice.deposit({
        value: ethers.utils.parseEther('52')
    })
    await farmingTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther('0.1'));
    await baseTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther('1'));
    await wbnbTokenAsAlice.approve(routerV2.address, ethers.utils.parseEther('2'))
    // Add liquidity to the WBTC-WBNB pool on Pancakeswap
    await routerV2AsAlice.addLiquidity(
      baseToken.address, wbnb.address,
      ethers.utils.parseEther('1'), ethers.utils.parseEther('1'), '0', '0', await alice.getAddress(), FOREVER);
    // Add liquidity to the WBNB-FTOKEN pool on Pancakeswap
    await routerV2AsAlice.addLiquidity(
    farmingToken.address, wbnb.address,
    ethers.utils.parseEther('0.1'), ethers.utils.parseEther('1'), '0', '0', await alice.getAddress(), FOREVER);
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
      await expect(stratAsBob.setWorkersOk([mockPancakeswapV2EvilWorkerAsAlice.address], true)).to.reverted
    })
  })

  context('When non-worker call the strat', async () => {
    it('should revert', async() => {
      await expect(stratAsBob.execute(
        await bob.getAddress(), '0',
        ethers.utils.defaultAbiCoder.encode(
          ['uint256'], ['0']
        )
      )).to.be.reverted;
    })
  })

  context('When the base token is a wrap native', async () => {
    context('When contract get farmingAmount amount < minFarmingAmount', async () => {
        it('should revert', async () => {
          // if 0.1 Ftoken = 1 WBNB
          // x FToken = (x * 0.9975) * (1 / (0.1 + x*0.9975)) = 0.1
          // x = ~ 0.011138958507379568
          // thus, the return farming token will be 0.088861041492620439
          await farmingTokenAsAlice.transfer(mockPancakeswapV2WorkerBNBFtokenPair.address, ethers.utils.parseEther('0.1'));
          await expect(mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
            0, await alice.getAddress(), ethers.utils.parseEther('0.1'),
            ethers.utils.defaultAbiCoder.encode(
              ['address', 'bytes'],
              [strat.address, ethers.utils.defaultAbiCoder.encode(
                ['uint256'],
                [ethers.utils.parseEther('0.088861041492620439').add(1)]
              )],
            )
          )).to.be.revertedWith('PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading::execute:: insufficient farmingToken amount received');
        });
      })
    
    context("When caller worker hasn't been whitelisted", async () => {
      it('should revert as bad worker', async () => {
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2EvilWorkerAsAlice.address, ethers.utils.parseEther('0.05'));
        await expect(mockPancakeswapV2EvilWorkerAsAlice.work(
          0, await alice.getAddress(), '0',
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'bytes'],
            [strat.address, ethers.utils.defaultAbiCoder.encode(
              ['uint256'],
              [ethers.utils.parseEther('0.05')]
            )],
          )
        )).to.be.revertedWith('PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker');
      });
    })
  
    context("when revoking whitelist workers", async () => {
      it('should revert as bad worker', async () => {
        await strat.setWorkersOk([mockPancakeswapV2WorkerBNBFtokenPair.address], false)
        await expect(mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
          0, await alice.getAddress(), '0',
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'bytes'],
            [strat.address, ethers.utils.defaultAbiCoder.encode(
              ['uint256'],
              [ethers.utils.parseEther('0.05')]
            )],
          )
        )).to.be.revertedWith('PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker');
      });
    })
  
    it('should convert to WBNB to be enough for repaying the debt, and return farmingToken to the user', async () => {
      // if 0.1 Ftoken = 1 WBNB
      // x FToken = (x * 0.9975) * (1 / (0.1 + x*0.9975)) = 0.1
      // x = ~ 0.011138958507379568
      // thus, the return farming token will be 0.088861041492620439
      await farmingTokenAsAlice.transfer(mockPancakeswapV2WorkerBNBFtokenPair.address, ethers.utils.parseEther('0.1'));
      await mockPancakeswapV2WorkerBNBFtokenPairAsAlice.work(
        0, await alice.getAddress(), ethers.utils.parseEther('0.1'),
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [strat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0']
          )],
        )
      );
      // so the worker will return 0.1 WBNB for repaying the debt, the rest will be returned as a farmingToken
      expect(await wbnb.balanceOf(await alice.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('50').add(ethers.utils.parseEther('0.1')))
      expect(await farmingToken.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))
      expect(await wbnb.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))
      expect(await farmingToken.balanceOf(mockPancakeswapV2WorkerBNBFtokenPair.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))
      expect(await farmingToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('9.888861041492620439'))
    });
  })

  context('When the base token is not a wrap native', async () => {
    context('When contract get farmingToken amount < minFarmingTokenAmount', async () => {
      it('should revert', async () => {
        // if 1 WBNB = 1 BaseToken
        // x WBNB = (x * 0.9975) * (1 / (1 + x * 0.9975)) = 0.1
        // x WBNB =~ ~ 0.11138958507379568

        // if 0.1 FToken = 1 WBNB
        // x FToken =  (x * 0.9975) * (1 / (0.1 + x * 0.9975)) = 0.11138958507379568
        // x = 0.012566672086044004
        // thus 0.1 - 0.012566672086044 = 0.087433327913955996
        await farmingTokenAsAlice.transfer(mockPancakeswapV2WorkerBaseFTokenPair.address, ethers.utils.parseEther('0.1'));
        await expect(mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
          0, await alice.getAddress(), ethers.utils.parseEther('0.1'),
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'bytes'],
            [strat.address, ethers.utils.defaultAbiCoder.encode(
              ['uint256'],
              [ethers.utils.parseEther('0.087433327913955996').add(1)]
            )],
          )
        )).to.be.revertedWith('PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading::execute:: insufficient farmingToken amount received');
      });
    })
    
    context("When caller worker hasn't been whitelisted", async () => {
      it('should revert as bad worker', async () => {
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2EvilWorkerAsAlice.address, ethers.utils.parseEther('0.05'));
        await expect(mockPancakeswapV2EvilWorkerAsAlice.work(
          0, await alice.getAddress(), '0',
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'bytes'],
            [strat.address, ethers.utils.defaultAbiCoder.encode(
              ['uint256'],
              [ethers.utils.parseEther('0.05')]
            )],
          )
        )).to.be.revertedWith('PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker');
      });
    })
  
    context("when revoking whitelist workers", async () => {
      it('should revert as bad worker', async () => {
        await strat.setWorkersOk([mockPancakeswapV2WorkerBaseFTokenPair.address], false)
        await expect(mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
          0, await alice.getAddress(), '0',
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'bytes'],
            [strat.address, ethers.utils.defaultAbiCoder.encode(
              ['uint256'],
              [ethers.utils.parseEther('0.05')]
            )],
          )
        )).to.be.revertedWith('PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker');
      });
    })
  
    it('should convert to WBTC to be enough for repaying the debt, and return farmingToken to the user', async () => {
      // if 1 WBNB = 1 BaseToken
      // x WBNB = (x * 0.9975) * (1 / (1 + x * 0.9975)) = 0.1
      // x WBNB =~ ~ 0.11138958507379568

      // if 0.1 FToken = 1 WBNB
      // x FToken =  (x * 0.9975) * (1 / (0.1 + x * 0.9975)) = 0.11138958507379568
      // x = 0.012566672086044004
      // thus 0.1 - 0.012566672086044 = 0.087433327913955996

      // alice will have 9.8 from sending some money to the worker and a liquidity pair
      await farmingTokenAsAlice.transfer(mockPancakeswapV2WorkerBaseFTokenPair.address, ethers.utils.parseEther('0.1'));
      await mockPancakeswapV2WorkerBaseFTokenPairAsAlice.work(
        0, await alice.getAddress(), ethers.utils.parseEther('0.1'),
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [strat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            ['0']
          )],
        )
      );
      // so the worker will return 0.1 WBNB for repaying the debt, the rest will be returned as a farmingToken
      expect(await baseToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('99').add(ethers.utils.parseEther('0.1')))
      expect(await farmingToken.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))
      expect(await baseToken.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))
      expect(await farmingToken.balanceOf(mockPancakeswapV2WorkerBaseFTokenPair.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))
      expect(await farmingToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('9.887433327913955996'))
    })
  })

  context('When the farming token is a wrap native', async () => {
    context('When contract get farmingAmount amount < minFarmingAmount', async () => {
      it('should revert', async () => {
        // if 1 BNB = 1 BaseToken
        // x BNB = (x * 0.9975) * (1 / (1 + x * 0.9975)) = 0.1
        // x = ~ 0.11138958507379568
        // thus, the return farming token will be 0.888610414926204399
        await wbnbTokenAsAlice.transfer(mockPancakeswapV2WorkerBaseBNBTokenPair.address, ethers.utils.parseEther('1'));
        await expect(mockPancakeswapV2WorkerBaseBNBTokenPairAsAlice.work(
          0, await alice.getAddress(), ethers.utils.parseEther('0.1'),
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'bytes'],
            [strat.address, ethers.utils.defaultAbiCoder.encode(
              ['uint256'],
              [ethers.utils.parseEther('0.888610414926204399').add(1)]
            )],
          )
        )).to.be.revertedWith('PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading::execute:: insufficient farmingToken amount received');
      });
    })
  
  context("When caller worker hasn't been whitelisted", async () => {
    it('should revert as bad worker', async () => {
      await wbnbTokenAsAlice.transfer(mockPancakeswapV2EvilWorkerAsAlice.address, ethers.utils.parseEther('0.05'));
      await expect(mockPancakeswapV2EvilWorkerAsAlice.work(
        0, await alice.getAddress(), '0',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [strat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            [ethers.utils.parseEther('0.05')]
          )],
        )
      )).to.be.revertedWith('PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker');
    });
  })

  context("when revoking whitelist workers", async () => {
    it('should revert as bad worker', async () => {
      await strat.setWorkersOk([mockPancakeswapV2WorkerBaseBNBTokenPair.address], false)
      await expect(mockPancakeswapV2WorkerBaseBNBTokenPairAsAlice.work(
        0, await alice.getAddress(), '0',
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes'],
          [strat.address, ethers.utils.defaultAbiCoder.encode(
            ['uint256'],
            [ethers.utils.parseEther('0.05')]
          )],
        )
      )).to.be.revertedWith('PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading::onlyWhitelistedWorkers:: bad worker');
    });
  })

  it('should convert to WBNB to be enough for repaying the debt, and return farmingToken to the user', async () => {
    // if 1 BNB = 1 BaseToken
    // x BNB = (x * 0.9975) * (1 / (1 + x * 0.9975)) = 0.1
    // x = ~ 0.11138958507379568
    // thus, the return farming token will be 0.888610414926204399
    await wbnbTokenAsAlice.transfer(mockPancakeswapV2WorkerBaseBNBTokenPair.address, ethers.utils.parseEther('1'));
    const beforeNativeBalance = await ethers.provider.getBalance(await bob.getAddress())
    await mockPancakeswapV2WorkerBaseBNBTokenPairAsAlice.work(
      0, await bob.getAddress(), ethers.utils.parseEther('0.1'),
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes'],
        [strat.address, ethers.utils.defaultAbiCoder.encode(
          ['uint256'],
          ['0']
        )],
      )
    );
    const afterNativeBalance = await ethers.provider.getBalance(await bob.getAddress())
    // so the worker will return 0.1 WBNB for repaying the debt, the rest will be returned as a farmingToken
    // alice wbnb will be 52 (from initial) - 2 (liquidity provision) - 1 (mock wbnb in worker) + 0.88861041492620439
    expect(await baseToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('99').add(ethers.utils.parseEther('0.1')))
    expect(await wbnb.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))
    expect(await baseToken.balanceOf(strat.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))
    expect(await wbnb.balanceOf(mockPancakeswapV2WorkerBaseBNBTokenPair.address)).to.be.bignumber.eq(ethers.utils.parseEther('0'))
    expect(await wbnb.balanceOf(await alice.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('49'))
    expect(afterNativeBalance.sub(beforeNativeBalance)).to.be.bignumber.eq(ethers.utils.parseEther('0.888610414926204399'))
  });
  })
})