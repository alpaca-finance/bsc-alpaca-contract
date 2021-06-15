import chai from 'chai'
import '@openzeppelin/test-helpers'
import { solidity } from 'ethereum-waffle'
import { BigNumber, Signer } from 'ethers'
import { ethers, upgrades } from 'hardhat'
import {
  MockERC20,
  MockERC20__factory,
  OracleRouter,
  OracleRouter__factory,
  SimplePriceOracle,
  SimplePriceOracle__factory,
} from '../typechain'

chai.use(solidity)
const { expect } = chai

// Accounts
let deployer: Signer
let feeder: Signer
let alice: Signer

let token0: MockERC20
let token1: MockERC20
let token2: MockERC20
let token3: MockERC20

let simplePriceOracle: SimplePriceOracle
let simplePriceOracleAsFeeder: SimplePriceOracle

let bobPriceOracle: SimplePriceOracle
let bobPriceOracleAsFeeder: SimplePriceOracle

let evePriceOracle: SimplePriceOracle
let evePriceOracleAsFeeder: SimplePriceOracle

let oracleRouter: OracleRouter
let oracleRouterAsDeployer: OracleRouter
let oracleRouterAsAlice: OracleRouter

describe('OracleRouter', () => {
  beforeEach(async () => {
    ;[deployer, feeder, alice] = await ethers.getSigners()

    const ERC20 = (await ethers.getContractFactory('MockERC20', deployer)) as MockERC20__factory
    token0 = (await upgrades.deployProxy(ERC20, ['token0', 'token0'])) as MockERC20
    await token0.deployed()
    token1 = (await upgrades.deployProxy(ERC20, ['token1', 'token1'])) as MockERC20
    await token1.deployed()
    token2 = (await upgrades.deployProxy(ERC20, ['token2', 'token2'])) as MockERC20
    await token0.deployed()
    token3 = (await upgrades.deployProxy(ERC20, ['token3', 'token3'])) as MockERC20
    await token1.deployed()

    const SimplePriceOracle = (await ethers.getContractFactory(
      'SimplePriceOracle',
      deployer,
    )) as SimplePriceOracle__factory
    simplePriceOracle = (await upgrades.deployProxy(SimplePriceOracle, [
      await feeder.getAddress(),
    ])) as SimplePriceOracle
    await simplePriceOracle.deployed()
    simplePriceOracleAsFeeder = SimplePriceOracle__factory.connect(simplePriceOracle.address, feeder)

    const BobPriceOracle = (await ethers.getContractFactory(
      'SimplePriceOracle',
      deployer,
    )) as SimplePriceOracle__factory
    bobPriceOracle = (await upgrades.deployProxy(BobPriceOracle, [await feeder.getAddress()])) as SimplePriceOracle
    await bobPriceOracle.deployed()
    bobPriceOracleAsFeeder = SimplePriceOracle__factory.connect(bobPriceOracle.address, feeder)

    const EvePriceOracle = (await ethers.getContractFactory(
      'SimplePriceOracle',
      deployer,
    )) as SimplePriceOracle__factory
    evePriceOracle = (await upgrades.deployProxy(EvePriceOracle, [await feeder.getAddress()])) as SimplePriceOracle
    await evePriceOracle.deployed()
    evePriceOracleAsFeeder = SimplePriceOracle__factory.connect(evePriceOracle.address, feeder)

    const OracleRouter = (await ethers.getContractFactory('OracleRouter', deployer)) as OracleRouter__factory
    oracleRouter = (await upgrades.deployProxy(OracleRouter)) as OracleRouter
    await oracleRouter.deployed()
    oracleRouterAsDeployer = OracleRouter__factory.connect(oracleRouter.address, deployer)
    oracleRouterAsAlice = OracleRouter__factory.connect(oracleRouter.address, alice)
  })

  describe('#setPrimarySources', async () => {
    context('when the caller is not the owner', async () => {
      it('should be reverted', async () => {
        await expect(
          oracleRouterAsAlice.setPrimarySources(token0.address, token1.address, BigNumber.from('1000000000000000000'), [
            simplePriceOracle.address,
          ]),
        ).to.revertedWith('Ownable: caller is not the owner')
      })
    })
    context('when the caller is the owner', async () => {
      context('when bad max deviation value', async () => {
        it('should be reverted', async () => {
          await expect(
            oracleRouterAsDeployer.setPrimarySources(token0.address, token1.address, BigNumber.from('0'), [
              simplePriceOracle.address,
            ]),
          ).to.revertedWith('bad max deviation value')
        })
        it('should be reverted', async () => {
          await expect(
            oracleRouterAsDeployer.setPrimarySources(
              token0.address,
              token1.address,
              BigNumber.from('2000000000000000000'),
              [simplePriceOracle.address],
            ),
          ).to.revertedWith('bad max deviation value')
        })
      })
      context('when sources length exceed 3', async () => {
        it('should be reverted', async () => {
          await expect(
            oracleRouterAsDeployer.setPrimarySources(
              token0.address,
              token1.address,
              BigNumber.from('1000000000000000000'),
              [
                simplePriceOracle.address,
                simplePriceOracle.address,
                simplePriceOracle.address,
                simplePriceOracle.address,
              ],
            ),
          ).to.revertedWith('sources length exceed 3')
        })
      })
      context('when successfully', async () => {
        it('should successfully', async () => {
          await oracleRouterAsDeployer.setPrimarySources(
            token0.address,
            token1.address,
            BigNumber.from('1000000000000000000'),
            [simplePriceOracle.address],
          )
          const source = await oracleRouterAsDeployer.primarySources(token0.address, token1.address, 0)
          const sourceCount = await oracleRouterAsDeployer.primarySourceCount(token0.address, token1.address)
          const maxPriceDeviation = await oracleRouterAsDeployer.maxPriceDeviations(token0.address, token1.address)
          expect(source).to.eq(simplePriceOracle.address)
          expect(sourceCount).to.eq(BigNumber.from(1))
          expect(maxPriceDeviation).to.eq(BigNumber.from('1000000000000000000'))
        })
      })
    })
  })

  describe('#setMultiPrimarySources', async () => {
    context('when inconsistent length', async () => {
      it('should be reverted', async () => {
        await expect(
          oracleRouterAsDeployer.setMultiPrimarySources(
            [token0.address, token2.address],
            [token1.address],
            [BigNumber.from('1000000000000000000')],
            [[simplePriceOracle.address]],
          ),
        ).to.revertedWith('inconsistent length')
      })
      it('should be reverted', async () => {
        await expect(
          oracleRouterAsDeployer.setMultiPrimarySources(
            [token0.address, token2.address],
            [token1.address, token3.address],
            [BigNumber.from('1000000000000000000')],
            [[simplePriceOracle.address]],
          ),
        ).to.revertedWith('inconsistent length')
      })
      it('should be reverted', async () => {
        await expect(
          oracleRouterAsDeployer.setMultiPrimarySources(
            [token0.address, token2.address],
            [token1.address, token3.address],
            [BigNumber.from('1000000000000000000'), BigNumber.from('900000000000000000')],
            [[simplePriceOracle.address]],
          ),
        ).to.revertedWith('inconsistent length')
      })
    })
    context('when successfully', async () => {
      it('should successfully', async () => {
        await oracleRouterAsDeployer.setMultiPrimarySources(
          [token0.address, token2.address],
          [token1.address, token3.address],
          [BigNumber.from('1000000000000000000'), BigNumber.from('1100000000000000000')],
          [[simplePriceOracle.address], [simplePriceOracle.address, bobPriceOracle.address]],
        )
        const sourceT0T1 = await oracleRouterAsDeployer.primarySources(token0.address, token1.address, 0)
        const sourceCountT0T1 = await oracleRouterAsDeployer.primarySourceCount(token0.address, token1.address)
        const maxPriceDeviationT0T1 = await oracleRouterAsDeployer.maxPriceDeviations(token0.address, token1.address)
        const source0T2T3 = await oracleRouterAsDeployer.primarySources(token2.address, token3.address, 0)
        const source1T2T3 = await oracleRouterAsDeployer.primarySources(token2.address, token3.address, 1)
        const sourceCountT2T3 = await oracleRouterAsDeployer.primarySourceCount(token2.address, token3.address)
        const maxPriceDeviationT2T3 = await oracleRouterAsDeployer.maxPriceDeviations(token2.address, token3.address)
        expect(sourceT0T1).to.eq(simplePriceOracle.address)
        expect(sourceCountT0T1).to.eq(BigNumber.from(1))
        expect(maxPriceDeviationT0T1).to.eq(BigNumber.from('1000000000000000000'))
        expect(source0T2T3).to.eq(simplePriceOracle.address)
        expect(source1T2T3).to.eq(bobPriceOracle.address)
        expect(sourceCountT2T3).to.eq(BigNumber.from(2))
        expect(maxPriceDeviationT2T3).to.eq(BigNumber.from('1100000000000000000'))
      })
    })
  })

  describe('#getPrice', async () => {
    context('when no primary source', async () => {
      it('should be reverted', async () => {
        await expect(oracleRouterAsAlice.getPrice(token0.address, token1.address)).to.revertedWith('no primary source')
      })
    })
    context('when no valid source', async () => {
      it('should be reverted', async () => {
        await oracleRouterAsDeployer.setPrimarySources(
          token0.address,
          token1.address,
          BigNumber.from('1000000000000000000'),
          [simplePriceOracle.address],
        )

        await expect(oracleRouterAsAlice.getPrice(token0.address, token1.address)).to.revertedWith('no valid source')
      })
    })
    context('when has 1 valid sources', async () => {
      it('should successfully', async () => {
        await simplePriceOracleAsFeeder.setPrices(
          [token0.address, token1.address],
          [token1.address, token0.address],
          [BigNumber.from('1000000000000000000'), BigNumber.from('1000000000000000000').div(10)],
        )
        await oracleRouterAsDeployer.setPrimarySources(
          token0.address,
          token1.address,
          BigNumber.from('1000000000000000000'),
          [simplePriceOracle.address],
        )

        const [price, lastTime] = await oracleRouterAsAlice.getPrice(token0.address, token1.address)
        expect(price).to.eq(BigNumber.from('1000000000000000000'))
      })
    })
    context('when has 2 valid sources', async () => {
      context('when too much deviation (2 valid sources)', async () => {
        it('should be reverted', async () => {
          await simplePriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from('1000000000000000000'), BigNumber.from('1000000000000000000').div(10)],
          )
          await bobPriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from('900000000000000000'), BigNumber.from('1000000000000000000').div(9)],
          )

          await oracleRouterAsDeployer.setPrimarySources(
            token0.address,
            token1.address,
            BigNumber.from('1100000000000000000'),
            [simplePriceOracle.address, bobPriceOracle.address],
          )
          await expect(oracleRouterAsAlice.getPrice(token0.address, token1.address)).to.reverted
        })
      })
      context('when successfully', async () => {
        it('should successfully', async () => {
          await simplePriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from('1000000000000000000'), BigNumber.from('1000000000000000000').div(10)],
          )
          await bobPriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from('900000000000000000'), BigNumber.from('1000000000000000000').div(9)],
          )

          await oracleRouterAsDeployer.setPrimarySources(
            token0.address,
            token1.address,
            BigNumber.from('1200000000000000000'),
            [simplePriceOracle.address, bobPriceOracle.address],
          )
          const [price, lastTime] = await oracleRouterAsAlice.getPrice(token0.address, token1.address)
          expect(price).to.eq(BigNumber.from('950000000000000000'))
        })
      })
    })
    context('when has 3 valid sources', async () => {
      context('when too much deviation', async () => {
        it('should be reverted', async () => {
          await simplePriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from('1000000000000000000'), BigNumber.from('1000000000000000000').div(10)],
          )
          await bobPriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from('900000000000000000'), BigNumber.from('1000000000000000000').div(9)],
          )
          await evePriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from('800000000000000000'), BigNumber.from('1000000000000000000').div(8)],
          )

          await oracleRouterAsDeployer.setPrimarySources(
            token0.address,
            token1.address,
            BigNumber.from('1100000000000000000'),
            [simplePriceOracle.address, bobPriceOracle.address, evePriceOracleAsFeeder.address],
          )
          await expect(oracleRouterAsAlice.getPrice(token0.address, token1.address)).to.reverted
        })
      })
      context('when source1 and source2 has too much deviation', async () => {
        it('should be successfully', async () => {
          await simplePriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from('1100000000000000000'), BigNumber.from('1000000000000000000').div(11)],
          )
          await bobPriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from('900000000000000000'), BigNumber.from('1000000000000000000').div(9)],
          )
          await evePriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from('800000000000000000'), BigNumber.from('1000000000000000000').div(8)],
          )

          await oracleRouterAsDeployer.setPrimarySources(
            token0.address,
            token1.address,
            BigNumber.from('1200000000000000000'),
            [simplePriceOracle.address, bobPriceOracle.address, evePriceOracleAsFeeder.address],
          )
          const [price, lastTime] = await oracleRouterAsAlice.getPrice(token0.address, token1.address)
          expect(price).to.eq(BigNumber.from('850000000000000000'))
        })
      })
      context('when source2 and source3 has too much deviation', async () => {
        it('should be successfully', async () => {
          await simplePriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from('1000000000000000000'), BigNumber.from('1000000000000000000').div(10)],
          )
          await bobPriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from('900000000000000000'), BigNumber.from('1000000000000000000').div(9)],
          )
          await evePriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from('700000000000000000'), BigNumber.from('1000000000000000000').div(7)],
          )

          await oracleRouterAsDeployer.setPrimarySources(
            token0.address,
            token1.address,
            BigNumber.from('1200000000000000000'),
            [simplePriceOracle.address, bobPriceOracle.address, evePriceOracleAsFeeder.address],
          )
          const [price, lastTime] = await oracleRouterAsAlice.getPrice(token0.address, token1.address)
          expect(price).to.eq(BigNumber.from('950000000000000000'))
        })
      })
      context('when source1, source2 and source3 is ok', async () => {
        it('should be successfully', async () => {
          await simplePriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from('1000000000000000000'), BigNumber.from('1000000000000000000').div(10)],
          )
          await bobPriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from('900000000000000000'), BigNumber.from('1000000000000000000').div(9)],
          )
          await evePriceOracleAsFeeder.setPrices(
            [token0.address, token1.address],
            [token1.address, token0.address],
            [BigNumber.from('800000000000000000'), BigNumber.from('1000000000000000000').div(8)],
          )

          await oracleRouterAsDeployer.setPrimarySources(
            token0.address,
            token1.address,
            BigNumber.from('1200000000000000000'),
            [simplePriceOracle.address, bobPriceOracle.address, evePriceOracleAsFeeder.address],
          )
          const [price, lastTime] = await oracleRouterAsAlice.getPrice(token0.address, token1.address)
          expect(price).to.eq(BigNumber.from('900000000000000000'))
        })
      })
    })
  })
})
