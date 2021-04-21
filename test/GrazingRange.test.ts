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
let cat: Signer;

let mockedBlock: BigNumber;

let stakingToken: MockERC20;
let rewardToken: MockERC20;
let grazingRange: GrazingRange;

let rewardTokenAsDeployer: MockERC20;
let stakingTokenAsDeployer: MockERC20;
let stakingTokenAsAlice: MockERC20;
let stakingTokenAsBob: MockERC20;
let stakingTokenAsCat: MockERC20;

let grazingRangeAsDeployer: GrazingRange;
let grazingRangeAsAlice: GrazingRange;
let grazingRangeAsBob: GrazingRange;
let grazingRangeAsCat: GrazingRange;

describe('GrazingRange', () => {
  beforeEach(async() => {
    [deployer, alice, bob, cat] = await ethers.getSigners();

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
    rewardToken = await upgrades.deployProxy(mockERC20Reward, [`RewardToken`, `RewardToken`]) as MockERC20;
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
    grazingRangeAsCat = GrazingRange__factory.connect(grazingRange.address, cat)

    stakingTokenAsDeployer = MockERC20__factory.connect(stakingToken.address, deployer)
    rewardTokenAsDeployer = MockERC20__factory.connect(rewardToken.address, deployer)

    stakingTokenAsAlice = MockERC20__factory.connect(stakingToken.address, alice)
    stakingTokenAsBob = MockERC20__factory.connect(stakingToken.address, bob)
    stakingTokenAsCat = MockERC20__factory.connect(stakingToken.address, cat)
  })

  describe('#addRewardInfo', async () => {
    context('When all parameters are valid', async () => {
      context('When the reward info is still within the limit', async () => {
        it('should still be able to push the new reward info with the latest as the newly pushed reward info', async () => {
          // set reward info limit to 1
          await grazingRangeAsDeployer.setRewardInfoLimit(2)
          // add the first reward info
          await grazingRangeAsDeployer.addRewardInfo(
            0, 
            mockedBlock.add(11).toString(),
            INITIAL_BONUS_REWARD_PER_BLOCK,
          )
          await grazingRangeAsDeployer.addRewardInfo(
            0, 
            mockedBlock.add(20).toString(),
            INITIAL_BONUS_REWARD_PER_BLOCK.add(1),
          )
          const rewardInfo = (await grazingRangeAsDeployer.campaignRewardInfo(0, 1))
          expect(rewardInfo.rewardPerBlock).to.eq(INITIAL_BONUS_REWARD_PER_BLOCK.add(1))
          expect(rewardInfo.endBlock).to.eq(mockedBlock.add(20).toString())
        })
      })
    })
    context('When some parameters are invalid', async () => {
      context("When the caller isn't the owner", async () => {
        it('should reverted since there is a modifier only owner validating the ownership', async () => {
          // set reward info limit to 1
          await expect(grazingRangeAsAlice.setRewardInfoLimit(1)).to.be.reverted
          await expect(grazingRangeAsAlice.addRewardInfo(
            0, 
            mockedBlock.add(11).toString(),
            INITIAL_BONUS_REWARD_PER_BLOCK,
          )).to.be.reverted
        })
      })
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
  })

  describe('#deposit()', async () => {
    context('When some parameters are invalid', async() => {
      context('when there is NO predefined campaign', async () => {
        it('should revert the tx since an array of predefined campaigns is out of bound', async () => {
          // mint staking token to alice
          await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther('100'))
          // mint reward token to GrazingRange
          await rewardTokenAsDeployer.mint(grazingRange.address, ethers.utils.parseEther('100'))
          // alice & bob approve grazing range
          await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther('100'))
          
          // alice deposit @block number #(mockedBlock+10)
          await expect(grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther('100'))).to.be.reverted
        })
      })
      context("when the user doesn't approve grazing range contract", async () => {
        it('should revert the tx since safe transfer is invalid', async () => {
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
          // mint reward token to GrazingRange
          await rewardTokenAsDeployer.mint(grazingRange.address, ethers.utils.parseEther('100'))
          
          // alice deposit @block number #(mockedBlock+10)
          await expect(grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther('100'))).to.be.reverted
        })
      })
    })
    context('When parameters are all valid', async () => {
      context ('When there is only single campaign', async () => {
        context('When there is only single reward info', async () => {
          context('When there is only one beneficial who get the reward (alice)', async () => {
            context("When alice's deposit block is is in the middle of start and end block", async () => {
              context('when bob deposits within the range of reward blocks', async () => {
                context('when the current block time is way too far than the latest reward', async () => {
                  it('#pendingReward() will recalculate the accuReward and return the correct reward corresponding to the current blocktime', async () => {
                    // scenario: alice deposit #n amount staking token to the pool
                    // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
                    // this scenario occurred between block #(mockedBlock+8)-..#(mockedBlock+10)
                    await grazingRangeAsDeployer.addCampaignInfo(
                      stakingToken.address, 
                      rewardToken.address, 
                      mockedBlock.add(8).toString(),
                    )
          
                    await grazingRangeAsDeployer.addRewardInfo(
                      0, 
                      mockedBlock.add(20).toString(),
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
                    
                    // alice deposit @block number #(mockedBlock+9)
                    await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther('100'))
                    // bob deposit @block number #(mockedBlock+10)
                    await grazingRangeAsBob.deposit(BigNumber.from(0), ethers.utils.parseEther('100'))
                    const currentBlockNum = await TimeHelpers.latestBlockNumber()
                    // advance a block number to #(mockedBlock+20) 10 block diff from bob's deposit
                    await TimeHelpers.advanceBlockTo(mockedBlock.add(20).toNumber())
                    // alice should expect to see her pending reward according to calculated reward per share and her deposit
                    const expectedAccRewardPerShare = BigNumber.from(1).mul('1000000000000') // reward per share 1e12 + 5e12
                    expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum)
                    expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(expectedAccRewardPerShare)
                    expect((await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await alice.getAddress()))).to.eq(ethers.utils.parseEther('600')) // alice should get 100 reward * 10 (10 blocks advanced)

                    // bob shouldn't expect anything, he deposited out of the range 
                    expect((await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await bob.getAddress()))).to.eq(ethers.utils.parseEther('500'))
                  })
                })
                it('should update a correct reward per share and pending rewards', async() => {
                  // scenario: alice deposit #n amount staking token to the pool
                  // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
                  // this scenario occurred between block #(mockedBlock+8)-..#(mockedBlock+10)
                  await grazingRangeAsDeployer.addCampaignInfo(
                    stakingToken.address, 
                    rewardToken.address, 
                    mockedBlock.add(8).toString(),
                  )
        
                  await grazingRangeAsDeployer.addRewardInfo(
                    0, 
                    mockedBlock.add(10).toString(),
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
                  
                  // alice deposit @block number #(mockedBlock+9)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther('100'))
                  // bob deposit @block number #(mockedBlock+10)
                  await grazingRangeAsBob.deposit(BigNumber.from(0), ethers.utils.parseEther('100'))
                  const currentBlockNum = await TimeHelpers.latestBlockNumber()
                  // alice should expect to see her pending reward according to calculated reward per share and her deposit
                  const expectedAccRewardPerShare = BigNumber.from(1).mul('1000000000000') // reward per share 1e12
                  expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum)
                  expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(expectedAccRewardPerShare)
                  expect((await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await alice.getAddress()))).to.eq(ethers.utils.parseEther('100'))

                  // bob shouldn't expect anything, he deposited out of the range 
                  expect((await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await bob.getAddress()))).to.eq(BigNumber.from(0))
                })
              })
              context('when bob deposits out of the range of reward blocks', async() => {
                it('should update a correct reward per share, pending rewards', async() => {
                  // scenario: alice deposit #n amount staking token to the pool
                  // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
                  // this scenario occurred between block #(mockedBlock+8)-..#(mockedBlock+10)
                  await grazingRangeAsDeployer.addCampaignInfo(
                    stakingToken.address, 
                    rewardToken.address, 
                    mockedBlock.add(8).toString(),
                  )
        
                  await grazingRangeAsDeployer.addRewardInfo(
                    0, 
                    mockedBlock.add(10).toString(),
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
                  
                  // alice deposit @block number #(mockedBlock+9)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther('100'))
                  const toBeAdvancedBlockNum = await TimeHelpers.latestBlockNumber()
                  // advanced block to 100
                  await TimeHelpers.advanceBlockTo(toBeAdvancedBlockNum.add(100).toNumber())
                  // bob deposit @block number #(mockedBlock+10+100)
                  await grazingRangeAsBob.deposit(BigNumber.from(0), ethers.utils.parseEther('100'))
                  // alice should expect to see her pending reward according to calculated reward per share and her deposit
                  const expectedAccRewardPerShare = BigNumber.from(1).mul('1000000000000') // reward per share 2e12, since range between start and end is 2, so right now reward is 2
                  // last reward block should be the end block, since when alice deposit, total supply is 0
                  // it will be updated soon once bob deposit his staking token.
                  expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(mockedBlock.add(10)) 
                  expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(expectedAccRewardPerShare)
                  expect((await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await alice.getAddress()))).to.eq(ethers.utils.parseEther('100'))
                  
                  // bob shouldn't expect anything, he deposited out of the range 
                  expect((await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await bob.getAddress()))).to.eq(BigNumber.from(0))
                })
              })
            })
            context('When a deposit block exceeds the end block', async() => {
              it("won't distribute any rewards to alice", async() => {
                  // scenario: alice deposit #n amount staking token to the pool
                  // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
                  // this scenario occurred between block #(mockedBlock+8)-..#(mockedBlock+10)
                  await grazingRangeAsDeployer.addCampaignInfo(
                    stakingToken.address, 
                    rewardToken.address, 
                    mockedBlock.add(8).toString(),
                  )
        
                  await grazingRangeAsDeployer.addRewardInfo(
                    0, 
                    mockedBlock.add(10).toString(),
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
                  // alice deposit @block number #(mockedBlock+9+100)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther('100'))
                  const aliceDepositBlockNum = await TimeHelpers.latestBlockNumber()
                  // bob deposit @block number #(mockedBlock+10+100)
                  await grazingRangeAsBob.deposit(BigNumber.from(0), ethers.utils.parseEther('100'))
                  // acc alpaca per share should be 0
                  // last reward block should be from alice deposit, since the first time the total supply is 0, alice deposited 100 to it
                  // alice, please don't expect anything, your deposit exceed end block
                  const expectedAccRewardPerShare = BigNumber.from(0) // reward per share 1e12
                  expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(aliceDepositBlockNum) // will end since alice's deposit block number
                  expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(expectedAccRewardPerShare)
                  expect((await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await alice.getAddress()))).to.eq(BigNumber.from(0))
              })
            })
          })
          context('When there are alice and bob who get the reward', async() => {
            context('When alice and bob deposit within the range of reward blocks', async () => {
              context('when cat deposits within the range of reward blocks', async () => {
                it('should update a correct reward per share and pending rewards', async() => {
                  // scenario: alice deposit #n amount staking token to the pool
                  // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
                  // this scenario occurred between block #(mockedBlock+11)-..#(mockedBlock+14)
                  await grazingRangeAsDeployer.addCampaignInfo(
                    stakingToken.address, 
                    rewardToken.address, 
                    mockedBlock.add(10).toString(),
                  )
        
                  await grazingRangeAsDeployer.addRewardInfo(
                    0, 
                    mockedBlock.add(13).toString(),
                    INITIAL_BONUS_REWARD_PER_BLOCK,
                  )
                  // mint staking token to alice
                  await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther('100'))
                  // mint staking token to bob
                  await stakingTokenAsDeployer.mint(await bob.getAddress(), ethers.utils.parseEther('100'))
                  // mint staking token to cat
                  await stakingTokenAsDeployer.mint(await cat.getAddress(), ethers.utils.parseEther('100'))
                  // mint reward token to GrazingRange
                  await rewardTokenAsDeployer.mint(grazingRange.address, ethers.utils.parseEther('100'))
                  // alice & bob approve grazing range
                  await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther('100'))
                  await stakingTokenAsBob.approve(grazingRange.address, ethers.utils.parseEther('100'))
                  await stakingTokenAsCat.approve(grazingRange.address, ethers.utils.parseEther('100'))
                  // alice deposit @block number #(mockedBlock+11)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther('100'))
                  // bob deposit @block number #(mockedBlock+12)
                  await grazingRangeAsBob.deposit(BigNumber.from(0), ethers.utils.parseEther('100'))
                  // cat deposit @block number #(mockedBlock+13)
                  await grazingRangeAsCat.deposit(BigNumber.from(0), ethers.utils.parseEther('100'))
                  const currentBlockNum = await TimeHelpers.latestBlockNumber()
                  // when alice deposit, the accu is 1, after bob deposit, the accu will be 1 + 1/2 = 1.5e12
                  const expectedAccRewardPerShare = BigNumber.from(1).mul('1500000000000') 
                  // B10---------------B11--------------------------------B13
                  // |- reward debt ---|---(alice deposit here)-----------|
                  // since total supply = 0 and alice is an initiator, only update a latest reward block to be B11
                  expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum)
                  expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(expectedAccRewardPerShare)
                  expect((await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await alice.getAddress()))).to.eq(ethers.utils.parseEther('150'))  
                  // B10-----------------------B12-----------------------B13
                  // |--this is a reward debt--|---(bob deposit here)-----|
                  // |------this is amount * accu reward per share--------|
                  // so total reward that bob should get is (amount * accuRewardPershare) - rewardDebt
                  expect((await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await bob.getAddress()))).to.eq(ethers.utils.parseEther('150').sub(ethers.utils.parseEther('100')))
                  expect((await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await cat.getAddress()))).to.eq(BigNumber.from(0))  
                })
              })
            })
          })
        })
      })
    })
  })
})
