import chai from 'chai'
import '@openzeppelin/test-helpers'
import { solidity } from 'ethereum-waffle'
import { BigNumber, Signer } from 'ethers'
import { ethers, upgrades } from 'hardhat'
import {
  ChainLinkPriceOracle,
  ChainLinkPriceOracle__factory,
  MockAggregatorV3,
  MockAggregatorV3__factory,
  MockERC20,
  MockERC20__factory,
} from '../typechain'

chai.use(solidity)
const { expect } = chai

// Accounts
let deployer: Signer
let alice: Signer

let token0: MockERC20
let token1: MockERC20

let mockAggregatorV3: MockAggregatorV3

let chainLinkOracle: ChainLinkPriceOracle
let chainLinkOracleAsDeployer: ChainLinkPriceOracle
let chainLinkOracleAsAlice: ChainLinkPriceOracle

describe('ChainLinkPriceOracle', () => {
  beforeEach(async () => {
    ;[deployer, alice] = await ethers.getSigners()

    const ERC20 = (await ethers.getContractFactory('MockERC20', deployer)) as MockERC20__factory
    token0 = (await upgrades.deployProxy(ERC20, ['token0', 'token0'])) as MockERC20
    await token0.deployed()
    token1 = (await upgrades.deployProxy(ERC20, ['token1', 'token1'])) as MockERC20
    await token1.deployed()

    const MockAggregatorV3 = (await ethers.getContractFactory(
      'MockAggregatorV3',
      deployer,
    )) as MockAggregatorV3__factory
    mockAggregatorV3 = await MockAggregatorV3.deploy(BigNumber.from('36538981280'), 8)
    await mockAggregatorV3.deployed()

    const ChainLinkPriceOracle = (await ethers.getContractFactory(
      'ChainLinkPriceOracle',
      deployer,
    )) as ChainLinkPriceOracle__factory
    chainLinkOracle = (await upgrades.deployProxy(ChainLinkPriceOracle)) as ChainLinkPriceOracle
    await chainLinkOracle.deployed()
    chainLinkOracleAsDeployer = ChainLinkPriceOracle__factory.connect(chainLinkOracle.address, deployer)
    chainLinkOracleAsAlice = ChainLinkPriceOracle__factory.connect(chainLinkOracle.address, alice)
  })

  describe('#setPriceFeed', async () => {
    context('when the caller is not the owner', async () => {
      it('should be reverted', async () => {
        await expect(
          chainLinkOracleAsAlice.setPriceFeed(token0.address, token1.address, mockAggregatorV3.address),
        ).to.revertedWith('Ownable: caller is not the owner')
      })
    })
    context('when the caller is the owner', async () => {
      context('when successfully', async () => {
        it('should successfully', async () => {
          await expect(
            chainLinkOracleAsDeployer.setPriceFeed(token0.address, token1.address, mockAggregatorV3.address),
          ).to.emit(chainLinkOracleAsDeployer, 'SetPriceFeed')
          const source = await chainLinkOracleAsDeployer.priceFeeds(token0.address, token1.address)
          expect(source).to.eq(mockAggregatorV3.address)
        })
      })
    })
  })

  describe('#getPrice', async () => {
    context('when no source', async () => {
      it('should be reverted', async () => {
        await expect(chainLinkOracleAsDeployer.getPrice(token1.address, token0.address)).to.revertedWith(
          'ChainLinkPriceOracle::getPrice:: no source',
        )
        await expect(chainLinkOracleAsDeployer.getPrice(token0.address, token1.address)).to.revertedWith(
          'ChainLinkPriceOracle::getPrice:: no source',
        )
      })
    })
    context('when successfully', async () => {
      it('should successfully', async () => {
        await chainLinkOracleAsDeployer.setPriceFeed(token0.address, token1.address, mockAggregatorV3.address)

        const [priceT0T1, lastUpdateT0T1] = await chainLinkOracleAsAlice.getPrice(token0.address, token1.address)
        // result should be (priceT0T1 * 1e18) / (10**decimals) = (36538981280 * 1e18) / (10**8) = 365389812800000000000
        expect(priceT0T1).to.eq(BigNumber.from('365389812800000000000'))

        const [priceT1T0, lastUpdateT1T0] = await chainLinkOracleAsDeployer.getPrice(token1.address, token0.address)
        // result should be (1e18 * 10**decimals) / (priceT0T1) = (1e18 * 10**8) / (36538981280) = 2736803175591982
        expect(priceT1T0).to.eq(BigNumber.from('2736803175591982'))
      })
    })
  })
})
