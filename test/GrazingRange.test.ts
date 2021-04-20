import { ethers, upgrades, waffle } from "hardhat";
import { Overrides, Signer, BigNumberish, utils, Wallet, BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  GrazingRange,
  GrazingRange__factory,
  MockERC20,
  MockERC20__factory
} from "../typechain";
import * as TimeHelpers from "./helpers/time"

chai.use(solidity);
const { expect } = chai;
const INITIAL_BONUS_REWARD_PER_BLOCK = ethers.utils.parseEther('100');

// Accounts
let deployer: Signer;
let alice: Signer;
let bob: Signer;

let mockedBlock: BigNumber;

let stakingToken: MockERC20;
let rewardToken: MockERC20;
let grazingRange: GrazingRange;

let rewardTokenAsDeployer: MockERC20;
let stakingTokenAsDeployer: MockERC20;
let stakingTokenAsAlice: MockERC20;
let stakingTokenAsBob: MockERC20;

let grazingRangeAsDeployer: GrazingRange;
let grazingRangeAsAlice: GrazingRange;
let grazingRangeAsBob: GrazingRange;

describe('GrazingRange', () => {
  beforeEach(async() => {
    [deployer, alice, bob] = await ethers.getSigners();

    const mockERC20Staking = (await ethers.getContractFactory(
      "MockERC20",
      deployer
    )) as MockERC20__factory;
    stakingToken = await upgrades.deployProxy(mockERC20Staking, [`StakingToken`, `StakingToken`]) as MockERC20;
    await stakingToken.deployed();

    const mockERC20Reward = (await ethers.getContractFactory(
      "MockERC20",
      deployer
    )) as MockERC20__factory;
    rewardToken = await upgrades.deployProxy(mockERC20Reward, [`StakingToken`, `StakingToken`]) as MockERC20;
    await rewardToken.deployed();

    const GrazingRange = (await ethers.getContractFactory(
      "GrazingRange",
      deployer
    )) as GrazingRange__factory;
    mockedBlock = await TimeHelpers.latestBlockNumber()
    grazingRange = await upgrades.deployProxy(GrazingRange, []) as GrazingRange;
    await grazingRange.deployed();

    grazingRangeAsDeployer = GrazingRange__factory.connect(grazingRange.address, deployer)
    grazingRangeAsAlice = GrazingRange__factory.connect(grazingRange.address, alice)
    grazingRangeAsBob = GrazingRange__factory.connect(grazingRange.address, bob)
    stakingTokenAsDeployer = MockERC20__factory.connect(stakingToken.address, deployer)
    rewardTokenAsDeployer = MockERC20__factory.connect(rewardToken.address, deployer)
    stakingTokenAsAlice = MockERC20__factory.connect(stakingToken.address, alice)
    stakingTokenAsBob = MockERC20__factory.connect(stakingToken.address, bob)
  })

  describe('#deposit()', async () => {
    context('When some parameters are invalid', async() => {
      context('When reward info exceed the limit', async () => {
        it('should reverted since the length of reward info exceed the limit', async () => {
          // set reward info limit to 1
          await grazingRangeAsDeployer.setRewardInfoLimit(1)
          // add the first reward info
          await grazingRangeAsDeployer.addRewardInfo(
            0, 
            mockedBlock.add(11).toString(),
            INITIAL_BONUS_REWARD_PER_BLOCK,
          )
          await expect(grazingRangeAsDeployer.addRewardInfo(
            0, 
            mockedBlock.add(11).toString(),
            INITIAL_BONUS_REWARD_PER_BLOCK,
          )).to.be.revertedWith('addRewardInfo: reward info length exceeds the limit')
        })
      })
    })
    context('When parameters are all valid', async () => {
      context ('When there is only single campaign', async () => {
        context('When there is only single reward info', async () => {
          context('When there is only one beneficial who get the reward (alice)', async () => {
            context('When deposit block is is in the middle of start and end block', async () => {
              it('should update a correct pool info', async() => {
                // scenario: alice deposit #n amount staking token to the pool
                // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
                // this scenario occurred between block #(mockedBlock+9)-..#(mockedBlock+11)
                await grazingRangeAsDeployer.addCampaignInfo(
                  stakingToken.address, 
                  rewardToken.address, 
                  mockedBlock.add(9).toString(),
                )
      
                await grazingRangeAsDeployer.addRewardInfo(
                  0, 
                  mockedBlock.add(11).toString(),
                  INITIAL_BONUS_REWARD_PER_BLOCK,
                )
                // mint staking token to alice
                await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther('100'))
                // mint staking token to bob
                await stakingTokenAsDeployer.mint(await bob.getAddress(), ethers.utils.parseEther('100'))
                // mint reward token to GrazingRange
                await rewardTokenAsDeployer.mint(grazingRange.address, ethers.utils.parseEther('100'))
                // alice & bob approve grazing range
                await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther('100'))
                await stakingTokenAsBob.approve(grazingRange.address, ethers.utils.parseEther('100'))
                
                // alice deposit @block number #(mockedBlock+10)
                await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther('100'))
                // bob deposit @block number #(mockedBlock+11)
                await grazingRangeAsBob.deposit(BigNumber.from(0), ethers.utils.parseEther('100'))
                const currentBlockNum = await TimeHelpers.latestBlockNumber()
                // should expect acc per share from alice's deposit
                // should expect the last reward block as a different between block 106 - 105 (1 block in total)
                // alice should expect to see her pending reward according to calculated reward per share and her deposit
                const expectedAccRewardPerShare = BigNumber.from(1).mul('1000000000000') // reward per share 1e12
                expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum)
                expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(expectedAccRewardPerShare)
                expect((await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await alice.getAddress()))).to.eq(ethers.utils.parseEther('100'))
              })
            })
            context('When deposit block exceeds the end block', async() => {
                it("won't distribute any rewards to alice", async() => {
                  // scenario: alice deposit #n amount staking token to the pool
                  // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
                  // this scenario occurred between block #(mockedBlock+9)-..#(mockedBlock+11)
                  await grazingRangeAsDeployer.addCampaignInfo(
                    stakingToken.address, 
                    rewardToken.address, 
                    mockedBlock.add(9).toString(),
                  )
        
                  await grazingRangeAsDeployer.addRewardInfo(
                    0, 
                    mockedBlock.add(11).toString(),
                    INITIAL_BONUS_REWARD_PER_BLOCK,
                  )
                  // mint staking token to alice
                  await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther('100'))
                  // mint staking token to bob
                  await stakingTokenAsDeployer.mint(await bob.getAddress(), ethers.utils.parseEther('100'))
                  // mint reward token to GrazingRange
                  await rewardTokenAsDeployer.mint(grazingRange.address, ethers.utils.parseEther('100'))
                  // alice & bob approve grazing range
                  await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther('100'))
                  await stakingTokenAsBob.approve(grazingRange.address, ethers.utils.parseEther('100'))
                  const toBeAdvancedBlockNum = await TimeHelpers.latestBlockNumber()
                  // advanced block to 100
                  await TimeHelpers.advanceBlockTo(toBeAdvancedBlockNum.add(100).toNumber())
                  // alice deposit @block number #(mockedBlock+10+100)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther('100'))
                  const aliceDepositBlockNum = await TimeHelpers.latestBlockNumber()
                  // bob deposit @block number #(mockedBlock+11+100)
                  await grazingRangeAsBob.deposit(BigNumber.from(0), ethers.utils.parseEther('100'))
                  // acc alpaca per share should be 0
                  // last reward block should be from alice deposit, since the first time the total supply is 0, alice deposited 100 to it
                  // alice, please don't expect anything, your deposit exceed end block :(
                  const expectedAccRewardPerShare = BigNumber.from(0) // reward per share 1e12
                  expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(aliceDepositBlockNum) // will end since alice's deposit block number
                  expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(expectedAccRewardPerShare)
                  expect((await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await alice.getAddress()))).to.eq(BigNumber.from(0))
                })
            })
          })
        })
      })
    })
  })
})