import { ethers, upgrades, waffle } from "hardhat";
import { Overrides, Signer, BigNumberish, utils, Wallet, BigNumber, constants } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import { GrazingRange, GrazingRange__factory, MockERC20, MockERC20__factory } from "../../../typechain";
import * as TimeHelpers from "../../helpers/time";
import * as Assert from "../../helpers/assert";

chai.use(solidity);
const { expect } = chai;
const INITIAL_BONUS_REWARD_PER_BLOCK = ethers.utils.parseEther("100");

// Accounts
let deployer: Signer;
let alice: Signer;
let bob: Signer;
let cat: Signer;

let mockedBlock: BigNumber;

let stakingToken: MockERC20;
let rewardToken: MockERC20;
let grazingRange: GrazingRange;
let rewardToken2: MockERC20;

let rewardTokenAsDeployer: MockERC20;
let rewardToken2AsDeployer: MockERC20;
let stakingTokenAsDeployer: MockERC20;
let stakingTokenAsAlice: MockERC20;
let stakingTokenAsBob: MockERC20;
let stakingTokenAsCat: MockERC20;

let grazingRangeAsDeployer: GrazingRange;
let grazingRangeAsAlice: GrazingRange;
let grazingRangeAsBob: GrazingRange;
let grazingRangeAsCat: GrazingRange;

describe("GrazingRange", () => {
  async function fixture() {
    [deployer, alice, bob, cat] = await ethers.getSigners();

    const mockERC20Staking = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    stakingToken = (await upgrades.deployProxy(mockERC20Staking, [`StakingToken`, `StakingToken`, 18])) as MockERC20;
    await stakingToken.deployed();

    const mockERC20Reward2 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    rewardToken2 = (await upgrades.deployProxy(mockERC20Reward2, [`RewardToken2`, `RewardToken2`, 18])) as MockERC20;
    await rewardToken2.deployed();

    const mockERC20Reward = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    rewardToken = (await upgrades.deployProxy(mockERC20Reward, [`RewardToken`, `RewardToken`, 18])) as MockERC20;
    await rewardToken.deployed();

    const GrazingRange = (await ethers.getContractFactory("GrazingRange", deployer)) as GrazingRange__factory;
    grazingRange = (await upgrades.deployProxy(GrazingRange, [await deployer.getAddress()])) as GrazingRange;
    await grazingRange.deployed();
    rewardTokenAsDeployer = MockERC20__factory.connect(rewardToken.address, deployer);
    rewardToken2AsDeployer = MockERC20__factory.connect(rewardToken2.address, deployer);
    await rewardTokenAsDeployer.approve(grazingRange.address, constants.MaxUint256);
    await rewardToken2AsDeployer.approve(grazingRange.address, constants.MaxUint256);
    mockedBlock = await TimeHelpers.latestBlockNumber();
    await TimeHelpers.advanceBlockTo(mockedBlock.add(1).toNumber());

    grazingRangeAsDeployer = GrazingRange__factory.connect(grazingRange.address, deployer);
    grazingRangeAsAlice = GrazingRange__factory.connect(grazingRange.address, alice);
    grazingRangeAsBob = GrazingRange__factory.connect(grazingRange.address, bob);
    grazingRangeAsCat = GrazingRange__factory.connect(grazingRange.address, cat);

    stakingTokenAsDeployer = MockERC20__factory.connect(stakingToken.address, deployer);

    stakingTokenAsAlice = MockERC20__factory.connect(stakingToken.address, alice);
    stakingTokenAsBob = MockERC20__factory.connect(stakingToken.address, bob);
    stakingTokenAsCat = MockERC20__factory.connect(stakingToken.address, cat);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  describe("#setRewardHolder", async () => {
    context("When the caller is not the owner", async () => {
      it("should be reverted", async () => {
        const aliceAddr = await alice.getAddress();
        await expect(grazingRangeAsAlice.setRewardHolder(aliceAddr)).to.reverted;
      });
    });
    context("When the caller is the owner", async () => {
      it("should successfully change a reward holder", async () => {
        const aliceAddr = await alice.getAddress();
        await grazingRangeAsDeployer.setRewardHolder(aliceAddr);
        const holder = await grazingRangeAsDeployer.rewardHolder();
        expect(holder).to.eq(aliceAddr);
      });
    });
  });

  describe("#currentEndBlock()", async () => {
    context("reward info is not existed yet", async () => {
      it("should return 0 as a current end block", async () => {
        // add the first reward info
        const currentEndBlock = await grazingRangeAsDeployer.currentEndBlock(0);
        expect(currentEndBlock).to.eq(BigNumber.from(0));
      });
    });
    context("reward info is existed", async () => {
      it("should return a current reward info endblock as a current end block", async () => {
        const mintedRewardPhase1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(9).sub(mockedBlock.add(8)));
        const mintedRewardPhase2 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(10).sub(mockedBlock.add(9)));
        const mintedReward = mintedRewardPhase1.add(mintedRewardPhase2);
        // mint reward token to Deployer (when add rewardInfo)
        await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
        await grazingRangeAsDeployer.addCampaignInfo(
          stakingToken.address,
          rewardToken.address,
          mockedBlock.add(8).toString()
        );
        await grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(9).toString(), INITIAL_BONUS_REWARD_PER_BLOCK);
        let currentEndBlock = await grazingRangeAsDeployer.currentEndBlock(0);
        expect(currentEndBlock).to.eq(mockedBlock.add(9));

        await grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(10).toString(), INITIAL_BONUS_REWARD_PER_BLOCK);
        currentEndBlock = await grazingRangeAsDeployer.currentEndBlock(0);
        expect(currentEndBlock).to.eq(mockedBlock.add(9));

        await TimeHelpers.advanceBlockTo(mockedBlock.add(20).toNumber());
        currentEndBlock = await grazingRangeAsDeployer.currentEndBlock(0);
        expect(currentEndBlock).to.eq(mockedBlock.add(10));
      });
    });
  });

  describe("#currentRewardPerBlock()", async () => {
    context("reward info is not existed yet", async () => {
      it("should return 0 as a current reward per block", async () => {
        const currentEndBlock = await grazingRangeAsDeployer.currentRewardPerBlock(0);
        expect(currentEndBlock).to.eq(BigNumber.from(0));
      });
    });
    context("reward info is existed", async () => {
      it("should return a current reward info endblock as a current reward per block", async () => {
        const mintedRewardPhase1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(9).sub(mockedBlock.add(8)));
        const mintedRewardPhase2 = INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("500")).mul(
          mockedBlock.add(10).sub(mockedBlock.add(9))
        );
        const mintedReward = mintedRewardPhase1.add(mintedRewardPhase2);
        await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
        await grazingRangeAsDeployer.addCampaignInfo(
          stakingToken.address,
          rewardToken.address,
          mockedBlock.add(8).toString()
        );
        await grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(9).toString(), INITIAL_BONUS_REWARD_PER_BLOCK);
        let currentRewardPerBlock = await grazingRangeAsDeployer.currentRewardPerBlock(0);
        expect(currentRewardPerBlock).to.eq(INITIAL_BONUS_REWARD_PER_BLOCK);

        await TimeHelpers.advanceBlockTo(mockedBlock.add(8).toNumber());
        await grazingRangeAsDeployer.addRewardInfo(
          0,
          mockedBlock.add(10).toString(),
          INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("500"))
        );
        await TimeHelpers.advanceBlockTo(mockedBlock.add(10).toNumber());
        currentRewardPerBlock = await grazingRangeAsDeployer.currentRewardPerBlock(0);
        expect(currentRewardPerBlock).to.eq(INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("500")));
      });
    });
    context("When reward period ended", async () => {
      it("should return 0", async () => {
        const mintedRewardPhase1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(9).sub(mockedBlock.add(8)));
        const mintedRewardPhase2 = INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("500")).mul(
          mockedBlock.add(10).sub(mockedBlock.add(9))
        );
        const mintedReward = mintedRewardPhase1.add(mintedRewardPhase2);
        await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
        await grazingRangeAsDeployer.addCampaignInfo(
          stakingToken.address,
          rewardToken.address,
          mockedBlock.add(8).toString()
        );
        await grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(9).toString(), INITIAL_BONUS_REWARD_PER_BLOCK);
        let currentRewardPerBlock = await grazingRangeAsDeployer.currentRewardPerBlock(0);
        expect(currentRewardPerBlock).to.eq(INITIAL_BONUS_REWARD_PER_BLOCK);

        await TimeHelpers.advanceBlockTo(mockedBlock.add(8).toNumber());
        await grazingRangeAsDeployer.addRewardInfo(
          0,
          mockedBlock.add(10).toString(),
          INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("500"))
        );
        await TimeHelpers.advanceBlockTo(mockedBlock.add(100).toNumber());
        currentRewardPerBlock = await grazingRangeAsDeployer.currentRewardPerBlock(0);
        expect(currentRewardPerBlock).to.eq(0);
      });
    });
  });

  describe("#addCampaignInfo", async () => {
    it("should return a correct campaign info length", async () => {
      let length = await grazingRangeAsDeployer.campaignInfoLen();
      expect(length).to.eq(0);
      await grazingRangeAsDeployer.addCampaignInfo(
        stakingToken.address,
        rewardToken.address,
        mockedBlock.add(9).toString()
      );
      length = await grazingRangeAsDeployer.campaignInfoLen();
      expect(length).to.eq(1);
    });
  });

  describe("#addRewardInfo()", async () => {
    context("When all parameters are valid", async () => {
      context("When the reward info is still within the limit", async () => {
        it("should still be able to push the new reward info with the latest as the newly pushed reward info", async () => {
          const mintedRewardPhase1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(11).sub(mockedBlock.add(8)));
          const mintedRewardPhase2 = INITIAL_BONUS_REWARD_PER_BLOCK.add(1).mul(
            mockedBlock.add(20).sub(mockedBlock.add(11))
          );
          const mintedReward = mintedRewardPhase1.add(mintedRewardPhase2);
          await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
          await grazingRangeAsDeployer.addCampaignInfo(
            stakingToken.address,
            rewardToken.address,
            mockedBlock.add(8).toString()
          );
          // set reward info limit to 1
          await grazingRangeAsDeployer.setRewardInfoLimit(2);
          let length = await grazingRangeAsDeployer.rewardInfoLen(0);
          expect(length).to.eq(0);
          // add the first reward info
          await grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(11).toString(), INITIAL_BONUS_REWARD_PER_BLOCK);
          length = await grazingRangeAsDeployer.rewardInfoLen(0);
          expect(length).to.eq(1);

          await grazingRangeAsDeployer.addRewardInfo(
            0,
            mockedBlock.add(20).toString(),
            INITIAL_BONUS_REWARD_PER_BLOCK.add(1)
          );
          const rewardInfo = await grazingRangeAsDeployer.campaignRewardInfo(0, 1);
          length = await grazingRangeAsDeployer.rewardInfoLen(0);
          expect(length).to.eq(2);
          expect(rewardInfo.rewardPerBlock).to.eq(INITIAL_BONUS_REWARD_PER_BLOCK.add(1));
          expect(rewardInfo.endBlock).to.eq(mockedBlock.add(20).toString());
        });
      });
    });
    context("When some parameters are invalid", async () => {
      context("When the caller isn't the owner", async () => {
        it("should reverted since there is a modifier only owner validating the ownership", async () => {
          const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(11).sub(mockedBlock.add(8)));
          await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
          await grazingRangeAsDeployer.addCampaignInfo(
            stakingToken.address,
            rewardToken.address,
            mockedBlock.add(8).toString()
          );
          // set reward info limit to 1
          await expect(grazingRangeAsAlice.setRewardInfoLimit(1)).to.be.reverted;
          await expect(
            grazingRangeAsAlice.addRewardInfo(0, mockedBlock.add(11).toString(), INITIAL_BONUS_REWARD_PER_BLOCK)
          ).to.be.reverted;
        });
      });
      context("When reward info exceed the limit", async () => {
        it("should reverted since the length of reward info exceed the limit", async () => {
          const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(11).sub(mockedBlock.add(8)));
          await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
          await grazingRangeAsDeployer.addCampaignInfo(
            stakingToken.address,
            rewardToken.address,
            mockedBlock.add(8).toString()
          );
          // set reward info limit to 1
          await grazingRangeAsDeployer.setRewardInfoLimit(1);
          // add the first reward info
          await grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(11).toString(), INITIAL_BONUS_REWARD_PER_BLOCK);
          await expect(
            grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(11).toString(), INITIAL_BONUS_REWARD_PER_BLOCK)
          ).to.be.revertedWith("GrazingRange::addRewardInfo::reward info length exceeds the limit");
        });
      });
      context("When the newly added reward info endblock is less that the start block", async () => {
        it("should be reverted", async () => {
          const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(11).sub(mockedBlock.add(8)));
          await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
          await grazingRangeAsDeployer.addCampaignInfo(
            stakingToken.address,
            rewardToken.address,
            mockedBlock.add(8).toString()
          );
          // add the first reward info
          await expect(
            grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.sub(1).toString(), INITIAL_BONUS_REWARD_PER_BLOCK)
          ).to.reverted;
        });
      });
      context("When newly added reward info endblock is less than current end block", async () => {
        it("should reverted with the message GrazingRange::addRewardInfo::bad new endblock", async () => {
          const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(11).sub(mockedBlock.add(8)));
          await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
          await grazingRangeAsDeployer.addCampaignInfo(
            stakingToken.address,
            rewardToken.address,
            mockedBlock.add(8).toString()
          );
          // add the first reward info
          await grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(11).toString(), INITIAL_BONUS_REWARD_PER_BLOCK);
          await expect(
            grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(1).toString(), INITIAL_BONUS_REWARD_PER_BLOCK)
          ).to.be.revertedWith("GrazingRange::addRewardInfo::bad new endblock");
        });
      });
      context("When the current reward period has ended", async () => {
        it("should reverted with the message GrazingRange::addRewardInfo::reward period ended", async () => {
          const mintedRewardPhase1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(10).sub(mockedBlock.add(8)));
          const mintedRewardPhase2 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(12).sub(mockedBlock.add(10)));
          const mintedReward = mintedRewardPhase1.add(mintedRewardPhase2);
          await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
          await grazingRangeAsDeployer.addCampaignInfo(
            stakingToken.address,
            rewardToken.address,
            mockedBlock.add(8).toString()
          );
          // add the first reward info
          // with block number + 10
          await grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(10).toString(), INITIAL_BONUS_REWARD_PER_BLOCK);
          await TimeHelpers.advanceBlockTo(mockedBlock.add(11).toNumber());
          //this called method is invoked on blockNumber + 12
          await expect(
            grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(12).toString(), INITIAL_BONUS_REWARD_PER_BLOCK)
          ).to.be.revertedWith("GrazingRange::addRewardInfo::reward period ended");
        });
      });
    });
  });
  describe("#deposit()", async () => {
    context("With invalid parameters", async () => {
      context("When there is NO predefined campaign", async () => {
        it("should revert the tx since an array of predefined campaigns is out of bound", async () => {
          // mint staking token to alice
          await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
          // mint reward token to Deployer (when add rewardInfo)
          await rewardTokenAsDeployer.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));
          // alice & bob approve grazing range
          await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));

          // alice deposit @block number #(mockedBlock+10)
          await expect(grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"))).to.be.reverted;
        });
      });
      context("When the user doesn't approve the contract", async () => {
        it("should revert the tx since safe transfer is invalid", async () => {
          const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(11).sub(mockedBlock.add(9)));
          // mint reward token to Deployer (when add rewardInfo)
          await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);

          await grazingRangeAsDeployer.addCampaignInfo(
            stakingToken.address,
            rewardToken.address,
            mockedBlock.add(9).toString()
          );

          await grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(11).toString(), INITIAL_BONUS_REWARD_PER_BLOCK);
          // mint staking token to alice
          await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));

          // alice deposit @block number #(mockedBlock+10)
          await expect(grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"))).to.be.reverted;
        });
      });
    });
    context("With valid parameters", async () => {
      context("When there is only single campaign", async () => {
        context("When there is only single reward info", async () => {
          context("When there is only one beneficial who get the reward (alice)", async () => {
            context("When alice's deposit block is is in the middle of start and end block", async () => {
              context("When alice deposit again with different block time", async () => {
                it("should return reward from previous deposit to alice", async () => {
                  const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(16).sub(mockedBlock.add(6)));
                  // mint reward token to Deployer (when add rewardInfo)
                  await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
                  // scenario: alice deposit #n amount staking token to the pool
                  // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
                  // this scenario occurred between block #(mockedBlock+6)-..#(mockedBlock+16)
                  await grazingRangeAsDeployer.addCampaignInfo(
                    stakingToken.address,
                    rewardToken.address,
                    mockedBlock.add(6).toString()
                  );

                  await grazingRangeAsDeployer.addRewardInfo(
                    0,
                    mockedBlock.add(16).toString(),
                    INITIAL_BONUS_REWARD_PER_BLOCK
                  );
                  // mint staking token to alice
                  await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("300"));
                  // alice & bob approve grazing range
                  await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("300"));

                  // alice deposit @block number #(mockedBlock+7)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                  // bob deposit @block number #(mockedBlock+8)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("200"));
                  const currentBlockNum = await TimeHelpers.latestBlockNumber();
                  // advance a block number to #(mockedBlock+18) 10 block diff from bob's deposit
                  await TimeHelpers.advanceBlockTo(mockedBlock.add(16).toNumber());
                  // alice should expect to see her pending reward according to calculated reward per share and her deposit
                  const expectedAccRewardPerShare = BigNumber.from(2).mul(
                    BigNumber.from(ethers.utils.parseUnits("1", 20))
                  );
                  expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum);
                  expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(
                    expectedAccRewardPerShare
                  );
                  expect((await grazingRangeAsAlice.campaignInfo(0)).totalStaked).to.eq(ethers.utils.parseEther("300"));

                  // acc reward per share from block 7 to block 8 = 1
                  // alice will get a reward in a total of 100 reward
                  // not the total deposit of alice is 300, totalstaked should be 300 as well
                  // reward debt will be 300
                  // alice expect to get a pending reward from block 8 to 16 = 8 sec
                  // total reward from block 8 to 16 is ((8 * 100)/300) = 2.6666667
                  // thus the overall reward per share will be 3.666666666666
                  // pending reward of alice will be 300(3.666666666666) - 300 = 1100 - 300 ~ 800
                  Assert.assertAlmostEqual(
                    (await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await alice.getAddress())).toString(),
                    ethers.utils.parseEther("800").toString()
                  );
                  expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(ethers.utils.parseEther("200"));
                });
              });
              context("when calling update campaign within the range of reward blocks", async () => {
                context("when the current block time (alice time) is before the starting time", async () => {
                  it("#pendingReward() will recalculate the accuReward and return the correct reward corresponding to the starting blocktime", async () => {
                    const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(
                      mockedBlock.add(18).sub(mockedBlock.add(8))
                    );
                    // mint reward token to Deployer (when add rewardInfo)
                    await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
                    // scenario: alice deposit #n amount staking token to the pool
                    // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
                    // this scenario occurred between block #(mockedBlock+8)-..#(mockedBlock+18)
                    await grazingRangeAsDeployer.addCampaignInfo(
                      stakingToken.address,
                      rewardToken.address,
                      mockedBlock.add(8).toString()
                    );

                    await grazingRangeAsDeployer.addRewardInfo(
                      0,
                      mockedBlock.add(18).toString(),
                      INITIAL_BONUS_REWARD_PER_BLOCK
                    );
                    // mint staking token to alice
                    await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
                    // alice approve grazing range
                    await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));

                    // alice deposit @block number #(mockedBlock+7)
                    await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                    // alice call update campaign @block number #(mockedBlock+8)
                    await grazingRangeAsAlice.updateCampaign(BigNumber.from(0));
                    const currentBlockNum = await TimeHelpers.latestBlockNumber();
                    // advance a block number to #(mockedBlock+18) 10 block diff from last campaign updated
                    await TimeHelpers.advanceBlockTo(mockedBlock.add(18).toNumber());
                    // alice should expect to see her pending reward according to calculated reward per share and her deposit
                    const expectedAccRewardPerShare = BigNumber.from(0); // reward per share = 0, since alice deposited before the block start, and calling update campaign on the start block
                    expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum);
                    expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(
                      expectedAccRewardPerShare
                    );

                    // totalReward = (100 * 10) = 1000
                    // reward per share = 1000/100 = 10 reward per share
                    // alice deposit 100, thus will get overall of 1000 rewards individually
                    expect(await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await alice.getAddress())).to.eq(
                      ethers.utils.parseEther("1000")
                    );
                  });
                });
                context("when the current block time is way too far than the latest reward", async () => {
                  it("#pendingReward() will recalculate the accuReward and return the correct reward corresponding to the current blocktime", async () => {
                    const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(
                      mockedBlock.add(18).sub(mockedBlock.add(6))
                    );
                    // mint reward token to Deployer (when add rewardInfo)
                    await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
                    // scenario: alice deposit #n amount staking token to the pool
                    // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
                    // this scenario occurred between block #(mockedBlock+6)-..#(mockedBlock+18)
                    await grazingRangeAsDeployer.addCampaignInfo(
                      stakingToken.address,
                      rewardToken.address,
                      mockedBlock.add(6).toString()
                    );

                    await grazingRangeAsDeployer.addRewardInfo(
                      0,
                      mockedBlock.add(18).toString(),
                      INITIAL_BONUS_REWARD_PER_BLOCK
                    );
                    // mint staking token to alice
                    await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
                    // alice approve grazing range
                    await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));

                    // alice deposit @block number #(mockedBlock+7)
                    await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                    // alice call update campaign @block number #(mockedBlock+8)
                    await grazingRangeAsAlice.updateCampaign(BigNumber.from(0));
                    const currentBlockNum = await TimeHelpers.latestBlockNumber();
                    // advance a block number to #(mockedBlock+18) 10 block diff from update campaign
                    await TimeHelpers.advanceBlockTo(mockedBlock.add(18).toNumber());
                    // alice should expect to see her pending reward according to calculated reward per share and her deposit
                    const expectedAccRewardPerShare = BigNumber.from(2).mul(ethers.utils.parseUnits("1", 20)); // reward per share = 2
                    expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum);
                    expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(
                      expectedAccRewardPerShare
                    );
                    // alice should get a reward based on accRewardPerShare = 2 + (10(100)/100) =  2 + (1000/100) = 2 + 10 = 12 reward per share
                    // thus, alice who deposit 100 will receive 12 * 100 = 1200
                    expect(await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await alice.getAddress())).to.eq(
                      ethers.utils.parseEther("1200")
                    );
                  });
                });
                it("should update a correct reward per share and pending rewards", async () => {
                  const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(8).sub(mockedBlock.add(6)));
                  // mint reward token to Deployer (when add rewardInfo)
                  await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
                  // scenario: alice deposit #n amount staking token to the pool
                  // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
                  // this scenario occurred between block #(mockedBlock+6)-..#(mockedBlock+8)
                  await grazingRangeAsDeployer.addCampaignInfo(
                    stakingToken.address,
                    rewardToken.address,
                    mockedBlock.add(6).toString()
                  );

                  await grazingRangeAsDeployer.addRewardInfo(
                    0,
                    mockedBlock.add(8).toString(),
                    INITIAL_BONUS_REWARD_PER_BLOCK
                  );
                  // mint staking token to alice
                  await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
                  // alice & bob approve grazing range
                  await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));

                  // alice deposit @block number #(mockedBlock+7)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                  // update campaign @block number #(mockedBlock+8)
                  await grazingRangeAsAlice.updateCampaign(BigNumber.from(0));
                  const currentBlockNum = await TimeHelpers.latestBlockNumber();
                  // alice should expect to see her pending reward according to calculated reward per share and her deposit
                  // since alice is the first depositor, she shall get a reward from start block
                  const expectedAccRewardPerShare = BigNumber.from(2).mul(ethers.utils.parseUnits("1", 20)); // reward per share 2
                  expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum);
                  expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(
                    expectedAccRewardPerShare
                  );
                  // 1 reward per share
                  // thus, alice who deposit 100, shall get a total of 100 rewards
                  expect(await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await alice.getAddress())).to.eq(
                    ethers.utils.parseEther("200")
                  );
                });
              });
              context("when calling update campaign out of the range of reward blocks", async () => {
                it("should update a correct reward per share, pending rewards", async () => {
                  const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(8).sub(mockedBlock.add(6)));
                  // mint reward token to Deployer (when add rewardInfo)
                  await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
                  // scenario: alice deposit #n amount staking token to the pool
                  // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
                  // this scenario occurred between block #(mockedBlock+6)-..#(mockedBlock+8)
                  await grazingRangeAsDeployer.addCampaignInfo(
                    stakingToken.address,
                    rewardToken.address,
                    mockedBlock.add(6).toString()
                  );

                  await grazingRangeAsDeployer.addRewardInfo(
                    0,
                    mockedBlock.add(8).toString(),
                    INITIAL_BONUS_REWARD_PER_BLOCK
                  );
                  // mint staking token to alice
                  await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
                  // alice approve grazing range
                  await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));

                  // alice deposit @block number #(mockedBlock+7)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                  const toBeAdvancedBlockNum = await TimeHelpers.latestBlockNumber();
                  // advanced block to 100
                  await TimeHelpers.advanceBlockTo(toBeAdvancedBlockNum.add(100).toNumber());
                  // alice call update campaign @block number #(mockedBlock+8+100)
                  await grazingRangeAsAlice.updateCampaign(BigNumber.from(0));
                  // alice should expect to see her pending reward according to calculated reward per share and her deposit
                  const expectedAccRewardPerShare = BigNumber.from(2).mul(ethers.utils.parseUnits("1", 20)); // reward per share 2, since range between start and end is 2, so right now reward is 2
                  // last reward block should be the end block, since when alice deposit, total supply is 0
                  expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(mockedBlock.add(8));
                  expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(
                    expectedAccRewardPerShare
                  );
                  expect(await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await alice.getAddress())).to.eq(
                    ethers.utils.parseEther("200")
                  );
                });
              });
            });
            context("When a deposit block exceeds the end block", async () => {
              it("won't distribute any rewards to alice", async () => {
                const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(8).sub(mockedBlock.add(6)));
                // mint reward token to Deployer (when add rewardInfo)
                await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
                // scenario: alice deposit #n amount staking token to the pool
                // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
                // this scenario occurred between block #(mockedBlock+6)-..#(mockedBlock+8)
                await grazingRangeAsDeployer.addCampaignInfo(
                  stakingToken.address,
                  rewardToken.address,
                  mockedBlock.add(6).toString()
                );

                await grazingRangeAsDeployer.addRewardInfo(
                  0,
                  mockedBlock.add(8).toString(),
                  INITIAL_BONUS_REWARD_PER_BLOCK
                );
                // mint staking token to alice
                await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
                // alice approve grazing range
                await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
                const toBeAdvancedBlockNum = await TimeHelpers.latestBlockNumber();
                // advanced block to 100
                await TimeHelpers.advanceBlockTo(toBeAdvancedBlockNum.add(100).toNumber());
                // alice deposit @block number #(mockedBlock+7+100)
                await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                // alice call update campaign @block number #(mockedBlock+8+100)
                await grazingRangeAsAlice.updateCampaign(BigNumber.from(0));
                // acc alpaca per share should be 0
                // last reward block should be from alice deposit, since the first time the total supply is 0, alice deposited 100 to it
                // alice, please don't expect anything, your deposit exceed end block
                const expectedAccRewardPerShare = BigNumber.from(0); // reward per share 1
                expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(
                  mockedBlock.add(7).add(100).toString()
                ); // will end since alice's deposit block number
                expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(expectedAccRewardPerShare);
                expect(await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await alice.getAddress())).to.eq(
                  BigNumber.from(0)
                );
              });
            });
          });
          context("When alice and bob able to get the reward", async () => {
            context("When alice and bob deposit within the range of reward blocks", async () => {
              context("when calling update campaign within the range of reward blocks", async () => {
                it("should update a correct reward per share and pending rewards", async () => {
                  const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(11).sub(mockedBlock.add(8)));
                  // mint reward token to Deployer (when add rewardInfo)
                  await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward); // scenario: alice deposit #n amount staking token to the pool
                  // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
                  // this scenario occurred between block #(mockedBlock+8)-..#(mockedBlock+11)
                  await grazingRangeAsDeployer.addCampaignInfo(
                    stakingToken.address,
                    rewardToken.address,
                    mockedBlock.add(8).toString()
                  );

                  await grazingRangeAsDeployer.addRewardInfo(
                    0,
                    mockedBlock.add(11).toString(),
                    INITIAL_BONUS_REWARD_PER_BLOCK
                  );
                  // mint staking token to alice
                  await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
                  // mint staking token to bob
                  await stakingTokenAsDeployer.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
                  // alice & bob approve grazing range
                  await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
                  await stakingTokenAsBob.approve(grazingRange.address, ethers.utils.parseEther("100"));
                  // alice deposit @block number #(mockedBlock+9)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                  // bob deposit @block number #(mockedBlock+10)
                  await grazingRangeAsBob.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                  // alice call update campaign @block number #(mockedBlock+11)
                  await grazingRangeAsAlice.updateCampaign(BigNumber.from(0));
                  const currentBlockNum = await TimeHelpers.latestBlockNumber();
                  // when alice deposits, she is the first one, so the latest reward will still be a starting block
                  // once bob deposits, the latest reward will be #(mockedBlock+11)
                  // acc reward per share will be (2(100)/100 from block 8 to block 10)  and (1(100)/200 from block 10 to 11) = 2.5
                  const expectedAccRewardPerShare = BigNumber.from(1).mul(ethers.utils.parseUnits("2.5", 20));
                  // B8---------------B9--------------------------------B11
                  // |- reward debt ---|---(alice deposit here)-----------|
                  // since total supply = 0 and alice is an initiator, only update the latest reward block to be B8
                  expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum);
                  expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(
                    expectedAccRewardPerShare
                  );
                  expect(await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await alice.getAddress())).to.eq(
                    ethers.utils.parseEther("250")
                  );
                  // B8-----------------------B10-----------------------B11
                  // |--this is a reward debt--|---(bob deposit here)-----|
                  // |------this is amount * accu reward per share--------|
                  // so total reward that bob should get is (amount * accuRewardPershare) - rewardDebt
                  // bob will get 0.5 reward per share, thus 100 * 50 = 50 total rewards
                  expect(await grazingRangeAsBob.pendingReward(BigNumber.from(0), await bob.getAddress())).to.eq(
                    ethers.utils.parseEther("50")
                  );
                });
              });
            });
          });
        });
        context("When there are multiple reward info (multiple phases)", async () => {
          context("When bob finish deposit within the first phase", async () => {
            it("should accrue the correct reward corresponding to different phases", async () => {
              const mintedRewardPhase1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(
                mockedBlock.add(12).sub(mockedBlock.add(9))
              );
              const mintedRewardPhase2 = INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100")).mul(
                mockedBlock.add(21).sub(mockedBlock.add(12))
              );
              const mintedReward = mintedRewardPhase1.add(mintedRewardPhase2);
              // mint reward token to Deployer (when add rewardInfo)
              await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
              // scenario: alice deposit #n amount staking token to the pool
              // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
              // this scenario occurred between block #(mockedBlock+9)-..#(mockedBlock+11)
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(9).toString()
              );

              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(12).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );

              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(21).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100")) // 200 reward per block
              );
              // mint staking token to alice
              await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
              // mint staking token to bob
              await stakingTokenAsDeployer.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
              // alice & bob approve grazing range
              await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
              await stakingTokenAsBob.approve(grazingRange.address, ethers.utils.parseEther("100"));
              // alice deposit @block number #(mockedBlock+10)
              await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
              // bob deposit @block number #(mockedBlock+11)
              await grazingRangeAsBob.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
              const currentBlockNum = await TimeHelpers.latestBlockNumber();
              // alice should expect to see her pending reward according to calculated reward per share and her deposit
              const expectedAccRewardPerShare = BigNumber.from(2).mul(ethers.utils.parseUnits("1", 20)); // reward per share 1 (phase1)
              expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum);
              expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(expectedAccRewardPerShare);
              await TimeHelpers.advanceBlockTo(mockedBlock.add(21).toNumber());
              // 2 (from last acc reward) +((1*100)/200 = 0.5) ((9*200)/200 = 1800/200 = 9)
              // thus, alice will get 1150 total rewards
              expect(await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await alice.getAddress())).to.eq(
                ethers.utils.parseEther("1150")
              );
              // ((1*100)/200 = 0.5) ((9*200)/200 = 1800/200 = 9) = 9.5 reward per share
              // thus, bob will get 950 total rewards
              expect(await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await bob.getAddress())).to.eq(
                ethers.utils.parseEther("950")
              );
            });
          });
          context("When bob finish deposit within the second phase", async () => {
            it("should accrue the correct reward corresponding to different phases", async () => {
              const mintedRewardPhase1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(
                mockedBlock.add(11).sub(mockedBlock.add(9))
              );
              const mintedRewardPhase2 = INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100")).mul(
                mockedBlock.add(21).sub(mockedBlock.add(11))
              );
              const mintedReward = mintedRewardPhase1.add(mintedRewardPhase2);
              // mint reward token to Deployer (when add rewardInfo)
              await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward); // scenario: alice deposit #n amount staking token to the pool
              // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
              // this scenario occurred between block #(mockedBlock+9)-..#(mockedBlock+11)
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(9).toString()
              );

              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(11).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );

              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(21).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100")) // 200 reward per block
              );
              // mint staking token to alice
              await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
              // mint staking token to bob
              await stakingTokenAsDeployer.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
              // alice & bob approve grazing range
              await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
              await stakingTokenAsBob.approve(grazingRange.address, ethers.utils.parseEther("100"));
              // alice deposit @block number #(mockedBlock+10)
              await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
              // skip to phase 2
              await TimeHelpers.advanceBlockTo(mockedBlock.add(12).toNumber());
              // bob deposit @block number #(mockedBlock+13)
              await grazingRangeAsBob.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
              const currentBlockNum = await TimeHelpers.latestBlockNumber();
              // alice should expect to see her pending reward according to calculated reward per share and her deposit
              // reward per share 1 (phase1) and ((200(reward per block) * 2(multiplier))/(200(totalsupply)) =  4/1 = 4 (phase2))
              // thus 4 + 2 = 6 accu reward per share
              const expectedAccRewardPerShare = BigNumber.from(6).mul(ethers.utils.parseUnits("1", 20));
              expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum);
              expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(expectedAccRewardPerShare);
              await TimeHelpers.advanceBlockTo(mockedBlock.add(21).toNumber());
              // 5 (from last acc reward) + ((8*200)/200 = 1600/200 = 8) = 13 rewards per share
              expect(await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await alice.getAddress())).to.eq(
                ethers.utils.parseEther("1400")
              );
              // (8*200)/200 = 1600/200 = 8 rewards per share
              expect(await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await bob.getAddress())).to.eq(
                ethers.utils.parseEther("800")
              );
            });
          });
        });
      });
      context("When there are multiple campaigns", async () => {
        it("should correctly separate rewards and total staked", async () => {
          const mintedRewardCampaign1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(
            mockedBlock.add(13).sub(mockedBlock.add(10))
          );
          const mintedRewardCampaign2 = INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100")).mul(
            mockedBlock.add(17).sub(mockedBlock.add(14))
          );
          const mintedReward = mintedRewardCampaign1.add(mintedRewardCampaign2);
          // mint reward token to Deployer (when add rewardInfo)
          await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward); // scenario: alice deposit #n amount staking token to the pool
          // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
          // this scenario occurred between block #(mockedBlock+10)-..#(mockedBlock+17) for campaign 0 and 1
          await grazingRangeAsDeployer.addCampaignInfo(
            stakingToken.address,
            rewardToken.address,
            mockedBlock.add(10).toString()
          );

          await grazingRangeAsDeployer.addCampaignInfo(
            stakingToken.address,
            rewardToken.address,
            mockedBlock.add(14).toString()
          );

          // set reward for campaign 0
          await grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(13).toString(), INITIAL_BONUS_REWARD_PER_BLOCK);

          // set reward for campaign 1
          await grazingRangeAsDeployer.addRewardInfo(
            1,
            mockedBlock.add(17).toString(),
            INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100"))
          );
          // mint staking token to alice
          await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("1000"));
          // mint staking token to bob
          await stakingTokenAsDeployer.mint(await bob.getAddress(), ethers.utils.parseEther("1000"));
          // alice & bob approve grazing range
          await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("1000"));
          await stakingTokenAsBob.approve(grazingRange.address, ethers.utils.parseEther("1000"));

          // ### campaign 0 ###
          // alice deposit @block number #(mockedBlock+9)
          await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
          // bob deposit @block number #(mockedBlock+10)
          await grazingRangeAsBob.deposit(BigNumber.from(0), ethers.utils.parseEther("200"));
          let currentBlockNum = await TimeHelpers.latestBlockNumber();
          await TimeHelpers.advanceBlockTo(mockedBlock.add(13).toNumber());
          // alice should expect to see her pending reward according to calculated reward per share and her deposit
          let expectedAccRewardPerShare = BigNumber.from(2).mul(ethers.utils.parseUnits("1", 20)); // reward per share 1
          expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum);
          expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(expectedAccRewardPerShare);
          expect((await grazingRangeAsAlice.campaignInfo(0)).totalStaked).to.eq(ethers.utils.parseEther("300"));
          expect(await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await alice.getAddress())).to.eq(
            ethers.utils.parseEther("233.333333333333333333")
          );
          expect(await grazingRangeAsAlice.pendingReward(BigNumber.from(0), await bob.getAddress())).to.eq(
            ethers.utils.parseEther("66.666666666666666666")
          );
          // ### campaign 1 ##
          await TimeHelpers.advanceBlockTo(mockedBlock.add(14).toNumber());
          // alice deposit @block number #(mockedBlock+15)
          await grazingRangeAsAlice.deposit(BigNumber.from(1), ethers.utils.parseEther("400"));
          // bob deposit @block number #(mockedBlock+16)
          await grazingRangeAsBob.deposit(BigNumber.from(1), ethers.utils.parseEther("600"));
          currentBlockNum = await TimeHelpers.latestBlockNumber();
          await TimeHelpers.advanceBlockTo(mockedBlock.add(17).toNumber());
          // alice should expect to see her pending reward according to calculated reward per share and her deposit
          expectedAccRewardPerShare = BigNumber.from(1).mul(ethers.utils.parseUnits("1", 20)); // reward per share 1, from 2(200)/400 = 1
          expect((await grazingRangeAsAlice.campaignInfo(1)).lastRewardBlock).to.eq(currentBlockNum);
          expect((await grazingRangeAsAlice.campaignInfo(1)).accRewardPerShare).to.eq(expectedAccRewardPerShare);
          expect((await grazingRangeAsAlice.campaignInfo(1)).totalStaked).to.eq(ethers.utils.parseEther("1000"));
          // reward for alice will be calculated by 2(200)/400 = 1 (when alice deposit) +  1(200)/1000 = 0.2 (when bob deposit) = 1.2 reward per share * 400 = 480
          expect(await grazingRangeAsAlice.pendingReward(BigNumber.from(1), await alice.getAddress())).to.eq(
            ethers.utils.parseEther("480")
          );
          // reward for alice will be calculated by 2(200)/400 = 1 (when alice deposit) +  1(200)/1000 = 0.2 (when bob deposit) = 1.2 reward per share * 600 = 720
          // 720 - rewardDebt of bob = 720 - 600 = 120
          expect(await grazingRangeAsAlice.pendingReward(BigNumber.from(1), await bob.getAddress())).to.eq(
            ethers.utils.parseEther("120")
          );
        });
      });
    });
  });

  describe("#emergencyWithdraw()", async () => {
    it("should return the correct deposit amount to the user", async () => {
      const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(10).sub(mockedBlock.add(5)));
      // mint reward token to Deployer (when add rewardInfo)
      await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward); // this scenario occurred between block #(mockedBlock+5)-..#(mockedBlock+10)
      await grazingRangeAsDeployer.addCampaignInfo(
        stakingToken.address,
        rewardToken.address,
        mockedBlock.add(5).toString()
      );

      await grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(10).toString(), INITIAL_BONUS_REWARD_PER_BLOCK);
      // mint staking token to alice
      await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
      // alice & bob approve grazing range
      await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
      // alice deposit @block number #(mockedBlock+9)
      await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
      expect(await stakingToken.balanceOf(await alice.getAddress())).to.eq(BigNumber.from(0));
      // alice withdraw from the campaign
      await grazingRangeAsAlice.emergencyWithdraw(BigNumber.from(0));
      expect(await (await grazingRangeAsAlice.campaignInfo(0)).totalStaked).to.eq(0);
      expect(await stakingToken.balanceOf(await alice.getAddress())).to.eq(ethers.utils.parseEther("100"));
    });
    it("should reset all user's info", async () => {
      const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(10).sub(mockedBlock.add(5)));
      // mint reward token to Deployer (when add rewardInfo)
      await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward); // this scenario occurred between block #(mockedBlock+5)-..#(mockedBlock+10)
      await grazingRangeAsDeployer.addCampaignInfo(
        stakingToken.address,
        rewardToken.address,
        mockedBlock.add(5).toString()
      );

      await grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(10).toString(), INITIAL_BONUS_REWARD_PER_BLOCK);
      // mint staking token to alice
      await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
      // alice & bob approve grazing range
      await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
      // alice deposit @block number #(mockedBlock+9)
      await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
      let userInfo = await grazingRangeAsAlice.userInfo(BigNumber.from(0), await alice.getAddress());
      expect(await stakingToken.balanceOf(await alice.getAddress())).to.eq(BigNumber.from(0));
      expect(userInfo.amount).to.eq(ethers.utils.parseEther("100"));
      expect(userInfo.rewardDebt).to.eq(BigNumber.from(0));
      // alice withdraw from the campaign
      await grazingRangeAsAlice.emergencyWithdraw(BigNumber.from(0));
      userInfo = await grazingRangeAsAlice.userInfo(BigNumber.from(0), await alice.getAddress());
      expect(userInfo.amount).to.eq(BigNumber.from(0));
      expect(userInfo.rewardDebt).to.eq(BigNumber.from(0));
    });
  });

  describe("#emergencyRewardWithdraw()", async () => {
    context("When the caller is not the owner", async () => {
      it("should revert", async () => {
        await rewardTokenAsDeployer.mint(await deployer.getAddress(), ethers.utils.parseEther("1000"));
        await rewardToken2AsDeployer.mint(grazingRange.address, ethers.utils.parseEther("1000"));
        await grazingRangeAsDeployer.addCampaignInfo(
          stakingToken.address,
          rewardToken.address,
          mockedBlock.add(5).toString()
        );
        await grazingRangeAsDeployer.addCampaignInfo(
          stakingToken.address,
          rewardToken2.address,
          mockedBlock.add(5).toString()
        );

        await expect(
          grazingRangeAsAlice.emergencyRewardWithdraw(
            BigNumber.from(0),
            ethers.utils.parseEther("500"),
            await deployer.getAddress()
          )
        ).to.be.reverted;
      });
    });
    context("When the caller is the owner", async () => {
      context("When amount to be withdrawn is invalid", async () => {
        context("When there is a multiple campaign sharing the same reward token", async () => {
          context("When totalStaked is 0", () => {
            it("should be reverted", async () => {
              const mintedReward1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(10).sub(mockedBlock.add(5)));
              const mintedReward2 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(20).sub(mockedBlock.add(5)));
              const mintedReward = mintedReward2.add(mintedReward1);
              await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(5).toString()
              );
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(5).toString()
              );
              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(10).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );
              await grazingRangeAsDeployer.addRewardInfo(
                1,
                mockedBlock.add(20).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );
              // emergency withdraw campaign 0 with all minted reward
              // should revert, since, even though it shares the same reward token, still different in terms of campaign's all reward token
              await expect(
                grazingRangeAsDeployer.emergencyRewardWithdraw(
                  BigNumber.from(0),
                  mintedReward,
                  await deployer.getAddress()
                )
              ).to.revertedWith("GrazingRange::emergencyRewardWithdraw::not enough reward token");
            });
          });

          context("when currentStakingPendingReward + withdraw amount > campaign's total rewards)", async () => {
            it("should be reverted", async () => {
              const mintedReward1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(10).sub(mockedBlock.add(5)));
              const mintedReward2 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(20).sub(mockedBlock.add(5)));
              const mintedReward = mintedReward2.add(mintedReward1);
              await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(5).toString()
              );
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(5).toString()
              );
              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(10).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );
              await grazingRangeAsDeployer.addRewardInfo(
                1,
                mockedBlock.add(20).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );
              await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("400"));
              await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("400"));

              // alice deposit 400
              await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("400"));
              // emergency withdraw campaign 100, so currentStakingPendingReward + withdraw amount = 600 which exceeds INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(10).sub(mockedBlock.add(5)))
              await expect(
                grazingRangeAsDeployer.emergencyRewardWithdraw(
                  BigNumber.from(0),
                  ethers.utils.parseEther("100"),
                  await deployer.getAddress()
                )
              ).to.revertedWith("GrazingRange::emergencyRewardWithdraw::not enough reward token");
            });
          });
        });
        context("When there is a multiple campaign with different reward tokens", async () => {
          context("When totalStaked is 0", () => {
            it("should be reverted", async () => {
              const mintedReward1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(10).sub(mockedBlock.add(5)));
              const mintedReward2 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(20).sub(mockedBlock.add(5)));
              await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward1);
              await rewardToken2AsDeployer.mint(await deployer.getAddress(), mintedReward2);
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(5).toString()
              );
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken2.address,
                mockedBlock.add(5).toString()
              );
              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(10).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );
              await grazingRangeAsDeployer.addRewardInfo(
                1,
                mockedBlock.add(20).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );
              await expect(
                grazingRangeAsDeployer.emergencyRewardWithdraw(
                  BigNumber.from(0),
                  ethers.utils.parseEther("600"),
                  await deployer.getAddress()
                )
              ).to.revertedWith("GrazingRange::emergencyRewardWithdraw::not enough reward token");
            });
          });

          context("when currentStakingPendingReward + withdraw amount <= campaign's total rewards)", async () => {
            it("should be reverted", async () => {
              const mintedReward1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(10).sub(mockedBlock.add(5)));
              const mintedReward2 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(20).sub(mockedBlock.add(5)));
              await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward1);
              await rewardToken2AsDeployer.mint(await deployer.getAddress(), mintedReward2);
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(5).toString()
              );
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken2.address,
                mockedBlock.add(5).toString()
              );
              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(10).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );
              await grazingRangeAsDeployer.addRewardInfo(
                1,
                mockedBlock.add(20).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );
              await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("400"));
              await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("400"));

              // alice deposit 100
              await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("400"));
              // emergency withdraw campaign 0
              await expect(
                grazingRangeAsDeployer.emergencyRewardWithdraw(
                  BigNumber.from(0),
                  ethers.utils.parseEther("100"),
                  await deployer.getAddress()
                )
              ).to.revertedWith("GrazingRange::emergencyRewardWithdraw::not enough reward token");
            });
          });
        });
      });
      context("When amount to be withdrawn is valid", async () => {
        context("When there is a multiple campaign sharing the same reward token", async () => {
          context("When totalStaked is 0", () => {
            it("should return desired reward token based on total reward token to the beneficiary", async () => {
              const mintedReward1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(11).sub(mockedBlock.add(5)));
              const mintedReward2 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(20).sub(mockedBlock.add(5)));
              const mintedReward = mintedReward2.add(mintedReward1);
              await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(5).toString()
              );
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(5).toString()
              );
              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(11).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );
              await grazingRangeAsDeployer.addRewardInfo(
                1,
                mockedBlock.add(20).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );
              const aliceAsBeneficiary = await alice.getAddress();
              // emergency withdraw campaign 0
              await grazingRangeAsDeployer.emergencyRewardWithdraw(
                BigNumber.from(0),
                ethers.utils.parseEther("100"),
                await deployer.getAddress()
              );
              expect(await rewardToken.balanceOf(grazingRange.address)).to.eq(
                mintedReward.sub(ethers.utils.parseEther("100"))
              );
              expect(await (await grazingRangeAsDeployer.campaignInfo(0)).totalRewards).to.eq(
                mintedReward1.sub(ethers.utils.parseEther("100"))
              );
              expect(await (await grazingRangeAsDeployer.campaignInfo(1)).totalRewards).to.eq(mintedReward2);
              expect(await rewardToken.balanceOf(await deployer.getAddress())).to.eq(ethers.utils.parseEther("100"));

              // emergency withdraw campaign 1
              await grazingRangeAsDeployer.emergencyRewardWithdraw(
                BigNumber.from(1),
                ethers.utils.parseEther("1000"),
                aliceAsBeneficiary
              );
              expect(await rewardToken.balanceOf(grazingRange.address)).to.eq(
                mintedReward.sub(ethers.utils.parseEther("100")).sub(ethers.utils.parseEther("1000"))
              );
              expect(await (await grazingRangeAsDeployer.campaignInfo(0)).totalRewards).to.eq(
                mintedReward1.sub(ethers.utils.parseEther("100"))
              );
              expect(await (await grazingRangeAsDeployer.campaignInfo(1)).totalRewards).to.eq(
                mintedReward2.sub(ethers.utils.parseEther("1000"))
              );
              expect(await rewardToken.balanceOf(aliceAsBeneficiary)).to.eq(ethers.utils.parseEther("1000"));
            });
          });

          context("when currentStakingPendingReward + withdraw amount <= campaign's total rewards)", async () => {
            it("should update the reward", async () => {
              const mintedReward1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(11).sub(mockedBlock.add(5)));
              const mintedReward2 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(20).sub(mockedBlock.add(5)));
              const mintedReward = mintedReward2.add(mintedReward1);
              await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(5).toString()
              );
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(5).toString()
              );
              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(11).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );
              await grazingRangeAsDeployer.addRewardInfo(
                1,
                mockedBlock.add(20).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );
              await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("400"));
              await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("400"));

              // alice deposit 400 @block+9
              await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("400"));
              const aliceAsBeneficiary = await alice.getAddress();
              // emergency withdraw campaign 0
              // deployer withdraw 400 @block+10
              // so the rewards will be 500
              // thus, when currentStakingPendingReward + withdraw amount <= campaign's total rewards = 500 <= 600
              await grazingRangeAsDeployer.emergencyRewardWithdraw(
                BigNumber.from(0),
                ethers.utils.parseEther("100"),
                await deployer.getAddress()
              );
              expect(await rewardToken.balanceOf(grazingRange.address)).to.eq(
                mintedReward.sub(ethers.utils.parseEther("100"))
              );
              expect(await (await grazingRangeAsDeployer.campaignInfo(0)).totalRewards).to.eq(
                mintedReward1.sub(ethers.utils.parseEther("100"))
              );
              expect(await (await grazingRangeAsDeployer.campaignInfo(1)).totalRewards).to.eq(mintedReward2);
              expect(await rewardToken.balanceOf(await deployer.getAddress())).to.eq(ethers.utils.parseEther("100"));

              // emergency withdraw campaign 1
              await grazingRangeAsDeployer.emergencyRewardWithdraw(
                BigNumber.from(1),
                ethers.utils.parseEther("1000"),
                aliceAsBeneficiary
              );
              expect(await rewardToken.balanceOf(grazingRange.address)).to.eq(
                mintedReward.sub(ethers.utils.parseEther("100")).sub(ethers.utils.parseEther("1000"))
              );
              expect(await (await grazingRangeAsDeployer.campaignInfo(0)).totalRewards).to.eq(
                mintedReward1.sub(ethers.utils.parseEther("100"))
              );
              expect(await (await grazingRangeAsDeployer.campaignInfo(1)).totalRewards).to.eq(
                mintedReward2.sub(ethers.utils.parseEther("1000"))
              );
              expect(await rewardToken.balanceOf(aliceAsBeneficiary)).to.eq(ethers.utils.parseEther("1000"));
            });
          });
        });
        context("When there is a multiple campaign with different reward tokens", async () => {
          context("When totalStaked is 0", () => {
            it("should return desired reward token based on total reward token to the beneficiary", async () => {
              const mintedReward1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(11).sub(mockedBlock.add(5)));
              const mintedReward2 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(20).sub(mockedBlock.add(5)));
              await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward1);
              await rewardToken2AsDeployer.mint(await deployer.getAddress(), mintedReward2);
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(5).toString()
              );
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken2.address,
                mockedBlock.add(5).toString()
              );
              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(11).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );
              await grazingRangeAsDeployer.addRewardInfo(
                1,
                mockedBlock.add(20).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );
              const aliceAsBeneficiary = await alice.getAddress();
              // emergency withdraw campaign 0
              await grazingRangeAsDeployer.emergencyRewardWithdraw(
                BigNumber.from(0),
                ethers.utils.parseEther("100"),
                await deployer.getAddress()
              );
              expect(await rewardToken.balanceOf(grazingRange.address)).to.eq(
                mintedReward1.sub(ethers.utils.parseEther("100"))
              );
              expect(await (await grazingRangeAsDeployer.campaignInfo(0)).totalRewards).to.eq(
                mintedReward1.sub(ethers.utils.parseEther("100"))
              );
              expect(await (await grazingRangeAsDeployer.campaignInfo(1)).totalRewards).to.eq(mintedReward2);
              expect(await rewardToken.balanceOf(await deployer.getAddress())).to.eq(ethers.utils.parseEther("100"));

              // emergency withdraw campaign 1
              await grazingRangeAsDeployer.emergencyRewardWithdraw(
                BigNumber.from(1),
                ethers.utils.parseEther("1000"),
                aliceAsBeneficiary
              );
              expect(await rewardToken2.balanceOf(grazingRange.address)).to.eq(
                mintedReward2.sub(ethers.utils.parseEther("1000"))
              );
              expect(await (await grazingRangeAsDeployer.campaignInfo(0)).totalRewards).to.eq(
                mintedReward1.sub(ethers.utils.parseEther("100"))
              );
              expect(await (await grazingRangeAsDeployer.campaignInfo(1)).totalRewards).to.eq(
                mintedReward2.sub(ethers.utils.parseEther("1000"))
              );
              expect(await rewardToken2.balanceOf(aliceAsBeneficiary)).to.eq(ethers.utils.parseEther("1000"));
            });
          });

          context("when currentStakingPendingReward + withdraw amount <= campaign's total rewards)", async () => {
            it("should update the reward", async () => {
              const mintedReward1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(12).sub(mockedBlock.add(5)));
              const mintedReward2 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(20).sub(mockedBlock.add(5)));
              await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward1);
              await rewardToken2AsDeployer.mint(await deployer.getAddress(), mintedReward2);
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(5).toString()
              );
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken2.address,
                mockedBlock.add(5).toString()
              );
              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(12).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );
              await grazingRangeAsDeployer.addRewardInfo(
                1,
                mockedBlock.add(20).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );
              await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("400"));
              await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("400"));

              await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("400"));
              const aliceAsBeneficiary = await alice.getAddress();
              // emergency withdraw campaign 0
              await grazingRangeAsDeployer.emergencyRewardWithdraw(
                BigNumber.from(0),
                ethers.utils.parseEther("100"),
                await deployer.getAddress()
              );
              expect(await rewardToken.balanceOf(grazingRange.address)).to.eq(
                mintedReward1.sub(ethers.utils.parseEther("100"))
              );
              expect(await (await grazingRangeAsDeployer.campaignInfo(0)).totalRewards).to.eq(
                mintedReward1.sub(ethers.utils.parseEther("100"))
              );
              expect(await (await grazingRangeAsDeployer.campaignInfo(1)).totalRewards).to.eq(mintedReward2);
              expect(await rewardToken.balanceOf(await deployer.getAddress())).to.eq(ethers.utils.parseEther("100"));

              // emergency withdraw campaign 1
              await grazingRangeAsDeployer.emergencyRewardWithdraw(
                BigNumber.from(1),
                ethers.utils.parseEther("1000"),
                aliceAsBeneficiary
              );
              expect(await rewardToken2.balanceOf(grazingRange.address)).to.eq(
                mintedReward2.sub(ethers.utils.parseEther("1000"))
              );
              expect(await (await grazingRangeAsDeployer.campaignInfo(0)).totalRewards).to.eq(
                mintedReward1.sub(ethers.utils.parseEther("100"))
              );
              expect(await (await grazingRangeAsDeployer.campaignInfo(1)).totalRewards).to.eq(
                mintedReward2.sub(ethers.utils.parseEther("1000"))
              );
              expect(await rewardToken2.balanceOf(aliceAsBeneficiary)).to.eq(ethers.utils.parseEther("1000"));
            });
          });
        });
      });
    });
  });

  describe("#withdraw()", async () => {
    context("With invalid parameters", async () => {
      context("when there is NO predefined campaign", async () => {
        it("should revert the tx since an array of predefined campaigns is out of bound", async () => {
          // mint staking token to alice
          await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
          // mint reward token to Deployer (when add rewardInfo)
          await rewardTokenAsDeployer.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));
          // alice & bob approve grazing range
          await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));

          // alice deposit @block number #(mockedBlock+10)
          await expect(grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"))).to.be.reverted;
        });
      });
      context("when the user doesn't approve grazing range contract", async () => {
        it("should revert the tx since safe transfer is invalid", async () => {
          // mint reward token to Deployer (when add rewardInfo)
          const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(11).sub(mockedBlock.add(9)));
          await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
          await grazingRangeAsDeployer.addCampaignInfo(
            stakingToken.address,
            rewardToken.address,
            mockedBlock.add(9).toString()
          );

          await grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(11).toString(), INITIAL_BONUS_REWARD_PER_BLOCK);
          // mint staking token to alice
          await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));

          // alice deposit @block number #(mockedBlock+10)
          await expect(grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"))).to.be.reverted;
        });
      });
    });
    context("With valid parameters", async () => {
      context("When there is only single campaign", async () => {
        context("When there is only single reward info", async () => {
          context("When there is only one beneficial who get the reward (alice)", async () => {
            context("When alice's deposit block is in the middle of start and end block", async () => {
              context("when alice withdraw within the range of reward blocks", async () => {
                it("should receive a reward correctly", async () => {
                  // mint reward token to Deployer (when add rewardInfo)
                  await rewardTokenAsDeployer.mint(
                    await deployer.getAddress(),
                    INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(8).sub(mockedBlock.add(6)))
                  );
                  // scenario: alice deposit #n amount staking token to the pool
                  // when the time past, block number increase, alice expects to have her reward amount by calling `rewardToken()`
                  // this scenario occurred between block #(mockedBlock+5)-..#(mockedBlock+8)
                  // and alice withdraw amount staking token out of pool
                  await grazingRangeAsDeployer.addCampaignInfo(
                    stakingToken.address,
                    rewardToken.address,
                    mockedBlock.add(6).toString()
                  );

                  await grazingRangeAsDeployer.addRewardInfo(
                    0,
                    mockedBlock.add(8).toString(),
                    INITIAL_BONUS_REWARD_PER_BLOCK
                  );
                  // mint staking token to alice
                  await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
                  // alice approve grazing range
                  await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
                  // alice deposit @block number #(mockedBlock+6)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                  // alice withdraw @block number #(mockedBlock+7)
                  await grazingRangeAsAlice.withdraw(BigNumber.from(0), ethers.utils.parseEther("100"));

                  expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(ethers.utils.parseEther("200"));
                  expect(
                    await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(0))).totalStaked.toString()
                  ).to.eq(ethers.utils.parseEther("0"));
                  expect(await (await stakingToken.balanceOf(await alice.getAddress())).toString()).to.eq(
                    ethers.utils.parseEther("100")
                  );
                });
              });
              context("when alice withdraw out the range of reward blocks", async () => {
                it("should receive a reward correctly", async () => {
                  const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(8).sub(mockedBlock.add(6)));
                  // mint reward token to Deployer (when add rewardInfo)
                  await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
                  // scenario: alice deposit  #n amount staking token to the pool
                  // when the time past, block number increase, alice expects to have her reward amount by calling 'rewardToken'
                  // this scenario occurred between block #(mockedBlock+6)-..#(mockedBlock+8)
                  // and alice withdraw amount staking token out of pool after end time
                  await grazingRangeAsDeployer.addCampaignInfo(
                    stakingToken.address,
                    rewardToken.address,
                    mockedBlock.add(6).toString()
                  );

                  await grazingRangeAsDeployer.addRewardInfo(
                    0,
                    mockedBlock.add(8).toString(),
                    INITIAL_BONUS_REWARD_PER_BLOCK
                  );
                  // mint staking token to alice
                  await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
                  // alice approve grazing range
                  await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
                  // alice deposit @block number #(mockedBlock+7)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                  // alice withdraw @block number #(mockedBlock+8)
                  await TimeHelpers.advanceBlockTo(mockedBlock.add(20).toNumber());
                  await grazingRangeAsAlice.withdraw(BigNumber.from(0), ethers.utils.parseEther("100"));

                  expect(await (await stakingToken.balanceOf(await alice.getAddress())).toString()).to.eq(
                    ethers.utils.parseEther("100")
                  );
                  expect(
                    await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(0))).totalStaked.toString()
                  ).to.eq(ethers.utils.parseEther("0"));
                  expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(mintedReward);
                });
              });
            });
            context("When alice's deposit before the start block ", async () => {
              context("when alice withdraw within the range of reward blocks", async () => {
                it("should receive a reward correctly", async () => {
                  const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(10).sub(mockedBlock.add(8)));
                  // mint reward token to Deployer (when add rewardInfo)
                  await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
                  // scenario: alice deposit #n amount staking token to the pool
                  // when the time past, block number increase, alice expects to have her reward amount by calling `rewardToken()`
                  // this scenario occurred between block #(mockedBlock+8)-..#(mockedBlock+10)
                  // and alice withdraw amount staking token out of pool
                  await grazingRangeAsDeployer.addCampaignInfo(
                    stakingToken.address,
                    rewardToken.address,
                    mockedBlock.add(8).toString()
                  );

                  await grazingRangeAsDeployer.addRewardInfo(
                    0,
                    mockedBlock.add(10).toString(),
                    INITIAL_BONUS_REWARD_PER_BLOCK
                  );
                  // mint staking token to alice
                  await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
                  // alice approve grazing range
                  await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
                  // alice deposit @block number #(mockedBlock+6)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                  // alice withdraw @block number #(mockedBlock+7)
                  await TimeHelpers.advanceBlockTo(mockedBlock.add(10).toNumber());

                  await grazingRangeAsAlice.withdraw(BigNumber.from(0), ethers.utils.parseEther("100"));

                  expect(await (await stakingToken.balanceOf(await alice.getAddress())).toString()).to.eq(
                    ethers.utils.parseEther("100")
                  );
                  expect(
                    await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(0))).totalStaked.toString()
                  ).to.eq(ethers.utils.parseEther("0"));
                  expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(ethers.utils.parseEther("200"));
                });
              });
              context("when alice withdraw out the range of reward blocks", async () => {
                it("should receive a reward correctly", async () => {
                  // mint reward token to Deployer (when add rewardInfo)
                  await rewardTokenAsDeployer.mint(
                    await deployer.getAddress(),
                    INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(11).sub(mockedBlock.add(6)))
                  );
                  // scenario: alice deposit #n amount staking token to the pool
                  // when the time past, block number increase, alice expects to have her reward amount by calling `rewardToken()`
                  // this scenario occurred between block #(mockedBlock+9)-..#(mockedBlock+11)
                  // and alice withdraw amount staking token out of pool
                  await grazingRangeAsDeployer.addCampaignInfo(
                    stakingToken.address,
                    rewardToken.address,
                    mockedBlock.add(9).toString()
                  );

                  await grazingRangeAsDeployer.addRewardInfo(
                    0,
                    mockedBlock.add(11).toString(),
                    INITIAL_BONUS_REWARD_PER_BLOCK
                  );
                  // mint staking token to alice
                  await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
                  // alice approve grazing range
                  await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
                  // alice deposit @block number #(mockedBlock+6)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                  // alice withdraw @block number #(mockedBlock+7)
                  await TimeHelpers.advanceBlockTo(mockedBlock.add(11).toNumber());
                  await grazingRangeAsAlice.withdraw(BigNumber.from(0), ethers.utils.parseEther("100"));

                  expect(await (await stakingToken.balanceOf(await alice.getAddress())).toString()).to.eq(
                    ethers.utils.parseEther("100")
                  );
                  expect(
                    await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(0))).totalStaked.toString()
                  ).to.eq(ethers.utils.parseEther("0"));
                  expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(ethers.utils.parseEther("200"));
                });
              });
            });
            context("When alice's deposit block exceeds the end block", async () => {
              it("won't distribute any rewards to alice", async () => {
                const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(10).sub(mockedBlock.add(8)));
                // mint reward token to Deployer (when add rewardInfo)
                await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
                // scenario: alice deposit #n amount staking token to the pool
                // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
                // this scenario occurred between block #(mockedBlock+8)-..#(mockedBlock+10)
                await grazingRangeAsDeployer.addCampaignInfo(
                  stakingToken.address,
                  rewardToken.address,
                  mockedBlock.add(8).toString()
                );

                await grazingRangeAsDeployer.addRewardInfo(
                  0,
                  mockedBlock.add(10).toString(),
                  INITIAL_BONUS_REWARD_PER_BLOCK
                );
                // mint staking token to alice
                await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
                // mint staking token to bob
                await stakingTokenAsDeployer.mint(await bob.getAddress(), ethers.utils.parseEther("100"));

                // alice & bob approve grazing range
                await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
                await stakingTokenAsBob.approve(grazingRange.address, ethers.utils.parseEther("100"));
                const toBeAdvancedBlockNum = await TimeHelpers.latestBlockNumber();
                // advanced block to 100
                await TimeHelpers.advanceBlockTo(toBeAdvancedBlockNum.add(100).toNumber());
                // alice deposit @block number #(mockedBlock+9+100)
                await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                // alice withdraw @block number #(mockedBlock+10+100)
                await grazingRangeAsAlice.withdraw(BigNumber.from(0), ethers.utils.parseEther("100"));

                expect(await (await stakingToken.balanceOf(await alice.getAddress())).toString()).to.eq(
                  ethers.utils.parseEther("100")
                );
                expect(await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(0))).totalStaked.toString()).to.eq(
                  ethers.utils.parseEther("0")
                );
                expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(ethers.utils.parseEther("0"));
              });
            });
          });
        });
        context("When there are multiple reward info (multiple phases)", async () => {
          context("When alice finish deposit within the first phase", async () => {
            it("should accrue the correct reward corresponding to different phases", async () => {
              const mintedRewardPhase1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(
                mockedBlock.add(11).sub(mockedBlock.add(9))
              );
              const mintedRewardPhase2 = INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100")).mul(
                mockedBlock.add(21).sub(mockedBlock.add(11))
              );
              const mintedReward = mintedRewardPhase1.add(mintedRewardPhase2);
              // mint reward token to Deployer (when add rewardInfo)
              await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
              // scenario: alice deposit #n amount staking token to the pool
              // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
              // this scenario occurred between block #(mockedBlock+9)-..#(mockedBlock+11)
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(9).toString()
              );

              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(11).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );

              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(21).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100")) // 200 reward per block
              );
              // mint staking token to alice
              await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
              // mint staking token to bob
              await stakingTokenAsDeployer.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
              // alice & bob approve grazing range
              await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
              await stakingTokenAsBob.approve(grazingRange.address, ethers.utils.parseEther("100"));

              // alice deposit @block number #(mockedBlock+10)
              await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
              // bob deposit @block number #(mockedBlock+11)
              await grazingRangeAsBob.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));

              const currentBlockNum = await TimeHelpers.latestBlockNumber();
              // alice should expect to see her pending reward according to calculated reward per share and her deposit
              const expectedAccRewardPerShare = BigNumber.from(2).mul(ethers.utils.parseUnits("1", 20)); // reward per share 2 (phase1)
              expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum);
              expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(expectedAccRewardPerShare);
              await TimeHelpers.advanceBlockTo(mockedBlock.add(21).toNumber());
              // 2 from last acc reward + ((10*200)/200 = 2000/200 = 10 from second acc reward)

              await grazingRangeAsAlice.withdraw(BigNumber.from(0), ethers.utils.parseEther("100"));
              await grazingRangeAsBob.withdraw(BigNumber.from(0), ethers.utils.parseEther("100"));

              // (10*200)/200 = 2000/200 = 10
              expect(await (await stakingToken.balanceOf(await alice.getAddress())).toString()).to.eq(
                ethers.utils.parseEther("100")
              );
              expect(await (await stakingToken.balanceOf(await bob.getAddress())).toString()).to.eq(
                ethers.utils.parseEther("100")
              );

              expect(await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(0))).totalStaked.toString()).to.eq(
                ethers.utils.parseEther("0")
              );
              expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(ethers.utils.parseEther("1200"));
              expect(await rewardToken.balanceOf(await bob.getAddress())).to.eq(ethers.utils.parseEther("1000"));
            });
          });
          context("When alice finish deposit within the second phase", async () => {
            it("should accrue the correct reward corresponding to different phases", async () => {
              const mintedRewardPhase1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(
                mockedBlock.add(11).sub(mockedBlock.add(9))
              );
              const mintedRewardPhase2 = INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100")).mul(
                mockedBlock.add(21).sub(mockedBlock.add(11))
              );
              const totalMintedReward = mintedRewardPhase1.add(mintedRewardPhase2);
              // mint reward token to Deployer (when add rewardInfo)
              await rewardTokenAsDeployer.mint(await deployer.getAddress(), totalMintedReward);
              // scenario: alice deposit #n amount staking token to the pool
              // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
              // this scenario occurred between block #(mockedBlock+9)-..#(mockedBlock+11)
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(9).toString()
              );

              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(11).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );

              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(21).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100")) // 200 reward per block
              );
              // mint staking token to alice
              await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
              // mint staking token to bob
              await stakingTokenAsDeployer.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
              // alice & bob approve grazing range
              await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
              await stakingTokenAsBob.approve(grazingRange.address, ethers.utils.parseEther("100"));

              // alice deposit @block number #(mockedBlock+10)
              await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
              // skip to phase 2
              await TimeHelpers.advanceBlockTo(mockedBlock.add(12).toNumber());
              // bob deposit @block number #(mockedBlock+13)
              await grazingRangeAsBob.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
              const currentBlockNum = await TimeHelpers.latestBlockNumber();

              // alice should expect to see her pending reward according to calculated reward per share and her deposit
              // reward per share =  2(100)/100 = 2 (phase1) and ((200(reward per block) * 2(multiplier))/(100(totalsupply)) =  4/1 = 4 (phase2))
              // thus 4 + 2 = 6 reward per share
              const expectedAccRewardPerShare = BigNumber.from(6).mul(ethers.utils.parseUnits("1", 20));
              expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum);
              expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(expectedAccRewardPerShare);
              await TimeHelpers.advanceBlockTo(mockedBlock.add(21).toNumber());

              await grazingRangeAsAlice.withdraw(BigNumber.from(0), ethers.utils.parseEther("100"));
              await grazingRangeAsBob.withdraw(BigNumber.from(0), ethers.utils.parseEther("100"));

              expect(await (await stakingToken.balanceOf(await alice.getAddress())).toString()).to.eq(
                ethers.utils.parseEther("100")
              );
              expect(await (await stakingToken.balanceOf(await bob.getAddress())).toString()).to.eq(
                ethers.utils.parseEther("100")
              );

              expect(await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(0))).totalStaked.toString()).to.eq(
                ethers.utils.parseEther("0")
              );

              // alice will get 6 * 100 = 600 for the latest accu reward and (200 * 8)/200 * 100 = 800 for latest reward block to the end block
              expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(ethers.utils.parseEther("1400"));
              expect(await rewardToken.balanceOf(await bob.getAddress())).to.eq(ethers.utils.parseEther("800"));
            });
          });
        });
      });
      context("When there are multiple campaigns", async () => {
        it("should correctly separate rewards and total staked", async () => {
          const mintedRewardCampaign1Phase1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(
            mockedBlock.add(13).sub(mockedBlock.add(10))
          );
          const mintedRewardCampaign2Phase1 = INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100")).mul(
            mockedBlock.add(21).sub(mockedBlock.add(14))
          );
          const totalMintedReward = mintedRewardCampaign2Phase1.add(mintedRewardCampaign1Phase1);
          // mint reward token to Deployer (when add rewardInfo)
          await rewardTokenAsDeployer.mint(await deployer.getAddress(), totalMintedReward);
          // scenario: alice deposit #n amount staking token to the pool
          // when the time past, block number increase, alice expects to have her reward amount by calling `rewardToekn()`
          // this scenario occurred between block #(mockedBlock+10)-..#(mockedBlock+17) for campaign 0 and 1
          await grazingRangeAsDeployer.addCampaignInfo(
            stakingToken.address,
            rewardToken.address,
            mockedBlock.add(10).toString()
          );

          await grazingRangeAsDeployer.addCampaignInfo(
            stakingToken.address,
            rewardToken.address,
            mockedBlock.add(14).toString()
          );

          // set reward for campaign 0
          await grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(13).toString(), INITIAL_BONUS_REWARD_PER_BLOCK);

          // set reward for campaign 1
          await grazingRangeAsDeployer.addRewardInfo(
            1,
            mockedBlock.add(21).toString(),
            INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100"))
          );
          // mint staking token to alice
          await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("1000"));
          // mint staking token to bob
          await stakingTokenAsDeployer.mint(await bob.getAddress(), ethers.utils.parseEther("1000"));
          // alice & bob approve grazing range
          await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("1000"));
          await stakingTokenAsBob.approve(grazingRange.address, ethers.utils.parseEther("1000"));

          // ### campaign 0 ###
          // alice deposit @block number #(mockedBlock+11)
          await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
          // bob deposit @block number #(mockedBlock+12)
          await grazingRangeAsBob.deposit(BigNumber.from(0), ethers.utils.parseEther("200"));

          let currentBlockNum = await TimeHelpers.latestBlockNumber();
          await TimeHelpers.advanceBlockTo(mockedBlock.add(13).toNumber());

          // alice withdraw @block number #(mockedBlock)

          // alice should expect to see her pending reward according to calculated reward per share and her deposit
          let expectedAccRewardPerShare = BigNumber.from(2).mul(ethers.utils.parseUnits("1", 20)); // reward per share 1
          expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum);
          expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(expectedAccRewardPerShare);
          expect((await grazingRangeAsAlice.campaignInfo(0)).totalStaked).to.eq(ethers.utils.parseEther("300"));

          await grazingRangeAsAlice.withdraw(BigNumber.from(0), ethers.utils.parseEther("100"));
          await grazingRangeAsBob.withdraw(BigNumber.from(0), ethers.utils.parseEther("200"));

          expect(await (await stakingToken.balanceOf(await alice.getAddress())).toString()).to.eq(
            ethers.utils.parseEther("1000")
          );
          expect(await (await stakingToken.balanceOf(await bob.getAddress())).toString()).to.eq(
            ethers.utils.parseEther("1000")
          );

          expect(await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(0))).totalStaked.toString()).to.eq(
            ethers.utils.parseEther("0")
          );
          expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(
            ethers.utils.parseEther("233.333333333333333333")
          );
          expect(await rewardToken.balanceOf(await bob.getAddress())).to.eq(
            ethers.utils.parseEther("66.666666666666666666")
          );

          // ### campaign 1 ##
          await TimeHelpers.advanceBlockTo(mockedBlock.add(18).toNumber());
          // alice deposit @block number #(mockedBlock+19)
          await grazingRangeAsAlice.deposit(BigNumber.from(1), ethers.utils.parseEther("400"));
          // bob deposit @block number #(mockedBlock+20)
          await grazingRangeAsBob.deposit(BigNumber.from(1), ethers.utils.parseEther("600"));

          currentBlockNum = await TimeHelpers.latestBlockNumber();
          await TimeHelpers.advanceBlockTo(mockedBlock.add(22).toNumber());
          // reward per share calculated by 14 - 20 = 6 block diff * 200 rewards / 400 current staked from alice
          // = 1200 / 400 = 3 reward per share
          expectedAccRewardPerShare = BigNumber.from(3).mul(ethers.utils.parseUnits("1", 20));
          expect((await grazingRangeAsAlice.campaignInfo(1)).lastRewardBlock).to.eq(currentBlockNum);
          expect((await grazingRangeAsAlice.campaignInfo(1)).accRewardPerShare).to.eq(expectedAccRewardPerShare);
          expect((await grazingRangeAsAlice.campaignInfo(1)).totalStaked).to.eq(ethers.utils.parseEther("1000"));

          await grazingRangeAsAlice.withdraw(BigNumber.from(1), ethers.utils.parseEther("400"));
          await grazingRangeAsBob.withdraw(BigNumber.from(1), ethers.utils.parseEther("600"));
          // alice should expect to see her  reward according to calculated reward per share and her deposit

          expect(await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(1))).totalStaked.toString()).to.eq(
            ethers.utils.parseEther("0")
          );
          expect(await (await grazingRangeAsBob.campaignInfo(BigNumber.from(1))).totalStaked.toString()).to.eq(
            ethers.utils.parseEther("0")
          );
          // alice will get a total of (3 reward per share* 400(from last accu) = 1200) + (200 rewards * 1 multiplier / 1000 total staked = 2/10 = 0.2 * 400 = 80) = 1280
          // with prev campaign, alice will get in total of = 1280 + 233.3333 = 1513.333
          expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(
            ethers.utils.parseEther("1513.333333333333333333")
          );
          expect(await rewardToken.balanceOf(await bob.getAddress())).to.eq(
            ethers.utils.parseEther("186.666666666666666666")
          );
        });
      });
    });
  });

  describe("#harvest()", async () => {
    context("With invalid parameters", async () => {
      context("when there is NO predefined campaign", async () => {
        it("should revert the tx since an array of predefined campaigns is out of bound", async () => {
          // mint staking token to alice
          await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
          // mint reward token to Deployer (when add rewardInfo)
          await rewardTokenAsDeployer.mint(await deployer.getAddress(), ethers.utils.parseEther("100"));
          // alice & bob approve grazing range
          await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
          // alice deposit @block number #(mockedBlock+10)
          await expect(grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"))).to.be.reverted;
        });
      });
      context("when the user doesn't approve grazing range contract", async () => {
        it("should revert the tx since safe transfer is invalid", async () => {
          // mint reward token to Deployer (when add rewardInfo)
          const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(11).sub(mockedBlock.add(9)));
          await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
          await grazingRangeAsDeployer.addCampaignInfo(
            stakingToken.address,
            rewardToken.address,
            mockedBlock.add(9).toString()
          );

          await grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(11).toString(), INITIAL_BONUS_REWARD_PER_BLOCK);
          // mint staking token to alice
          await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));

          // alice deposit @block number #(mockedBlock+10)
          await expect(grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"))).to.be.reverted;
        });
      });
    });
    context("With valid parameters", async () => {
      context("When there is only single campaign", async () => {
        context("When there is only single reward info", async () => {
          context("When there is only one beneficial who get the reward (alice)", async () => {
            context("When alice's deposit block is in the middle of start and end block", async () => {
              context("when alice harvest within the range of reward blocks", async () => {
                it("should receive a reward correctly", async () => {
                  const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(8).sub(mockedBlock.add(6)));
                  // mint reward token to Deployer (when add rewardInfo)
                  await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
                  // scenario: alice deposit #n amount staking token to the pool
                  // when the time past, block number increase, alice expects to have her reward amount by calling `rewardToken()`
                  // this scenario occurred between block #(mockedBlock+6)-..#(mockedBlock+8)
                  // and alice harvest reward from staking token pool
                  await grazingRangeAsDeployer.addCampaignInfo(
                    stakingToken.address,
                    rewardToken.address,
                    mockedBlock.add(6).toString()
                  );

                  await grazingRangeAsDeployer.addRewardInfo(
                    0,
                    mockedBlock.add(8).toString(),
                    INITIAL_BONUS_REWARD_PER_BLOCK
                  );
                  // mint staking token to alice
                  await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
                  // alice approve grazing range
                  await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
                  // alice deposit @block number #(mockedBlock+7)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                  // alice withdraw @block number #(mockedBlock+8)
                  await grazingRangeAsAlice.harvest([BigNumber.from(0)]);

                  expect(await (await stakingToken.balanceOf(await alice.getAddress())).toString()).to.eq(
                    ethers.utils.parseEther("0")
                  );
                  expect(
                    await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(0))).totalStaked.toString()
                  ).to.eq(ethers.utils.parseEther("100"));
                  expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(mintedReward);
                });
              });
              context("when alice harvest out the range of reward blocks", async () => {
                it("should receive a reward correctly", async () => {
                  const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(8).sub(mockedBlock.add(6)));
                  // mint reward token to Deployer (when add rewardInfo)
                  await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
                  // scenario: alice deposit  #n amount staking token to the pool
                  // when the time past, block number increase, alice expects to have her reward amount by calling 'rewardToken'
                  // this scenario occurred between block #(mockedBlock+7)-..#(mockedBlock+8)
                  // and alice harvest amount from staking token pool after end time
                  await grazingRangeAsDeployer.addCampaignInfo(
                    stakingToken.address,
                    rewardToken.address,
                    mockedBlock.add(6).toString()
                  );

                  await grazingRangeAsDeployer.addRewardInfo(
                    0,
                    mockedBlock.add(8).toString(),
                    INITIAL_BONUS_REWARD_PER_BLOCK
                  );
                  // mint staking token to alice
                  await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
                  // alice approve grazing range
                  await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
                  // alice deposit @block number #(mockedBlock+7)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                  await TimeHelpers.advanceBlockTo(mockedBlock.add(20).toNumber());
                  await grazingRangeAsAlice.harvest([BigNumber.from(0)]);

                  expect(await (await stakingToken.balanceOf(await alice.getAddress())).toString()).to.eq(
                    ethers.utils.parseEther("0")
                  );
                  expect(
                    await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(0))).totalStaked.toString()
                  ).to.eq(ethers.utils.parseEther("100"));
                  expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(mintedReward);
                });
              });
            });
            context("When alice's deposit before the start block ", async () => {
              context("when alice harvest within the range of reward blocks", async () => {
                it("should receive a reward correctly", async () => {
                  const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(10).sub(mockedBlock.add(8)));
                  // mint reward token to Deployer (when add rewardInfo)
                  await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
                  // scenario: alice deposit #n amount staking token to the pool
                  // when the time past, block number increase, alice expects to have her reward amount by calling `rewardToken()`
                  // this scenario occurred between block #(mockedBlock+8)-..#(mockedBlock+10)
                  // and alice harvest rewards from staking token pool
                  await grazingRangeAsDeployer.addCampaignInfo(
                    stakingToken.address,
                    rewardToken.address,
                    mockedBlock.add(8).toString()
                  );

                  await grazingRangeAsDeployer.addRewardInfo(
                    0,
                    mockedBlock.add(10).toString(),
                    INITIAL_BONUS_REWARD_PER_BLOCK
                  );
                  // mint staking token to alice
                  await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
                  // alice approve grazing range
                  await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
                  // alice deposit @block number #(mockedBlock+6)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                  // alice withdraw @block number #(mockedBlock+7)
                  await TimeHelpers.advanceBlockTo(mockedBlock.add(10).toNumber());
                  await grazingRangeAsAlice.harvest([BigNumber.from(0)]);

                  expect(await (await stakingToken.balanceOf(await alice.getAddress())).toString()).to.eq(
                    ethers.utils.parseEther("0")
                  );
                  expect(
                    await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(0))).totalStaked.toString()
                  ).to.eq(ethers.utils.parseEther("100"));
                  expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(mintedReward);
                });
              });
              context("when alice harvest out the range of reward blocks", async () => {
                it("should receive a reward correctly", async () => {
                  const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(11).sub(mockedBlock.add(9)));
                  // mint reward token to Deployer (when add rewardInfo)
                  await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward); // scenario: alice deposit #n amount staking token to the pool
                  // when the time past, block number increase, alice expects to have her reward amount by calling `rewardToken()`
                  // this scenario occurred between block #(mockedBlock+5)-..#(mockedBlock+9)
                  // and alice harvest amount from staking token pool
                  await grazingRangeAsDeployer.addCampaignInfo(
                    stakingToken.address,
                    rewardToken.address,
                    mockedBlock.add(9).toString()
                  );

                  await grazingRangeAsDeployer.addRewardInfo(
                    0,
                    mockedBlock.add(11).toString(),
                    INITIAL_BONUS_REWARD_PER_BLOCK
                  );
                  // mint staking token to alice
                  await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
                  // alice approve grazing range
                  await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
                  // alice deposit @block number #(mockedBlock+6)
                  await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                  // alice withdraw @block number #(mockedBlock+7)
                  await TimeHelpers.advanceBlockTo(mockedBlock.add(11).toNumber());
                  await grazingRangeAsAlice.harvest([BigNumber.from(0)]);

                  expect(await (await stakingToken.balanceOf(await alice.getAddress())).toString()).to.eq(
                    ethers.utils.parseEther("0")
                  );
                  expect(
                    await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(0))).totalStaked.toString()
                  ).to.eq(ethers.utils.parseEther("100"));
                  expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(ethers.utils.parseEther("200"));
                });
              });
            });
            context("When alice's deposit block exceeds the end block", async () => {
              it("won't distribute any rewards to alice", async () => {
                const mintedReward = INITIAL_BONUS_REWARD_PER_BLOCK.mul(mockedBlock.add(10).sub(mockedBlock.add(8)));
                // mint reward token to Deployer (when add rewardInfo)
                await rewardTokenAsDeployer.mint(await deployer.getAddress(), mintedReward);
                // scenario: alice deposit #n amount staking token to the pool
                // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
                // this scenario occurred between block #(mockedBlock+8)-..#(mockedBlock+10)
                await grazingRangeAsDeployer.addCampaignInfo(
                  stakingToken.address,
                  rewardToken.address,
                  mockedBlock.add(8).toString()
                );

                await grazingRangeAsDeployer.addRewardInfo(
                  0,
                  mockedBlock.add(10).toString(),
                  INITIAL_BONUS_REWARD_PER_BLOCK
                );
                // mint staking token to alice
                await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
                // mint staking token to bob
                await stakingTokenAsDeployer.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
                // alice & bob approve grazing range
                await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
                await stakingTokenAsBob.approve(grazingRange.address, ethers.utils.parseEther("100"));
                const toBeAdvancedBlockNum = await TimeHelpers.latestBlockNumber();
                // advanced block to 100
                await TimeHelpers.advanceBlockTo(toBeAdvancedBlockNum.add(100).toNumber());
                // alice deposit @block number #(mockedBlock+9+100)
                await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
                // alice withdraw @block number #(mockedBlock+7)
                await grazingRangeAsAlice.harvest([BigNumber.from(0)]);

                expect(await (await stakingToken.balanceOf(await alice.getAddress())).toString()).to.eq(
                  ethers.utils.parseEther("0")
                );
                expect(await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(0))).totalStaked.toString()).to.eq(
                  ethers.utils.parseEther("100")
                );
                expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(ethers.utils.parseEther("0"));
              });
            });
          });
        });
        context("When there are multiple reward info (multiple phases)", async () => {
          context("When alice finish deposit within the first phase", async () => {
            it("should accrue the correct reward corresponding to different phases", async () => {
              const mintedRewardPhase1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(
                mockedBlock.add(11).sub(mockedBlock.add(9))
              );
              const mintedRewardPhase2 = INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100")).mul(
                mockedBlock.add(21).sub(mockedBlock.add(11))
              );
              const totalMintedReward = mintedRewardPhase1.add(mintedRewardPhase2);
              // mint reward token to Deployer (when add rewardInfo)
              await rewardTokenAsDeployer.mint(await deployer.getAddress(), totalMintedReward);
              // scenario: alice deposit #n amount staking token to the pool
              // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
              // this scenario occurred between block #(mockedBlock+9)-..#(mockedBlock+11)
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(9).toString()
              );

              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(11).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );

              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(21).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100")) // 200 reward per block
              );
              // mint staking token to alice
              await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
              // mint staking token to bob
              await stakingTokenAsDeployer.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
              // alice & bob approve grazing range
              await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
              await stakingTokenAsBob.approve(grazingRange.address, ethers.utils.parseEther("100"));
              // alice deposit @block number #(mockedBlock+10)
              await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
              // bob deposit @block number #(mockedBlock+11)
              await grazingRangeAsBob.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));

              const currentBlockNum = await TimeHelpers.latestBlockNumber();
              // alice should expect to see her pending reward according to calculated reward per share and her deposit
              const expectedAccRewardPerShare = BigNumber.from(2).mul(ethers.utils.parseUnits("1", 20)); // reward per share 2 (phase1)
              expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum);
              expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(expectedAccRewardPerShare);
              await TimeHelpers.advanceBlockTo(mockedBlock.add(21).toNumber());
              // 2 (from last acc reward) + ((10*200)/200 = 2000/200 = 10)
              await grazingRangeAsAlice.harvest([BigNumber.from(0)]);
              await grazingRangeAsBob.harvest([BigNumber.from(0)]);

              // (10*200)/200 = 2000/200 = 10
              expect(await (await stakingToken.balanceOf(await alice.getAddress())).toString()).to.eq(
                ethers.utils.parseEther("0")
              );
              expect(await (await stakingToken.balanceOf(await bob.getAddress())).toString()).to.eq(
                ethers.utils.parseEther("0")
              );
              expect(await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(0))).totalStaked.toString()).to.eq(
                ethers.utils.parseEther("200")
              );
              expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(ethers.utils.parseEther("1200"));
              expect(await rewardToken.balanceOf(await bob.getAddress())).to.eq(ethers.utils.parseEther("1000"));
            });
          });
          context("When alice finish deposit within the second phase", async () => {
            it("should accrue the correct reward corresponding to different phases", async () => {
              const mintedRewardPhase1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(
                mockedBlock.add(11).sub(mockedBlock.add(9))
              );
              const mintedRewardPhase2 = INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100")).mul(
                mockedBlock.add(21).sub(mockedBlock.add(11))
              );
              const totalMintedReward = mintedRewardPhase1.add(mintedRewardPhase2);
              // mint reward token to Deployer (when add rewardInfo)
              await rewardTokenAsDeployer.mint(await deployer.getAddress(), totalMintedReward); // scenario: alice deposit #n amount staking token to the pool
              // when the time past, block number increase, alice expects to have her reward amount by calling `pendingReward()`
              // this scenario occurred between block #(mockedBlock+9)-..#(mockedBlock+11)
              await grazingRangeAsDeployer.addCampaignInfo(
                stakingToken.address,
                rewardToken.address,
                mockedBlock.add(9).toString()
              );

              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(11).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK
              );

              await grazingRangeAsDeployer.addRewardInfo(
                0,
                mockedBlock.add(21).toString(),
                INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100")) // 200 reward per block
              );
              // mint staking token to alice
              await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("100"));
              // mint staking token to bob
              await stakingTokenAsDeployer.mint(await bob.getAddress(), ethers.utils.parseEther("100"));
              // alice & bob approve grazing range
              await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("100"));
              await stakingTokenAsBob.approve(grazingRange.address, ethers.utils.parseEther("100"));

              // alice deposit @block number #(mockedBlock+10)
              await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
              // skip to phase 2
              await TimeHelpers.advanceBlockTo(mockedBlock.add(12).toNumber());
              // bob deposit @block number #(mockedBlock+13)

              await grazingRangeAsBob.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
              const currentBlockNum = await TimeHelpers.latestBlockNumber();

              // alice should expect to see her pending reward according to calculated reward per share and her deposit
              // reward per share 2 (phase1) and ((200(reward per block) * 2(multiplier))/(200(totalsupply)) =  4/1 = 4 (phase2))
              // so 4 + 2 = 6 accu reward per share
              const expectedAccRewardPerShare = BigNumber.from(6).mul(ethers.utils.parseUnits("1", 20));
              expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum);
              expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(expectedAccRewardPerShare);
              await TimeHelpers.advanceBlockTo(mockedBlock.add(21).toNumber());

              await grazingRangeAsAlice.harvest([BigNumber.from(0)]);
              await grazingRangeAsBob.harvest([BigNumber.from(0)]);

              expect(await (await stakingToken.balanceOf(await alice.getAddress())).toString()).to.eq(
                ethers.utils.parseEther("0")
              );
              expect(await (await stakingToken.balanceOf(await bob.getAddress())).toString()).to.eq(
                ethers.utils.parseEther("0")
              );

              expect(await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(0))).totalStaked.toString()).to.eq(
                ethers.utils.parseEther("200")
              );
              expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(ethers.utils.parseEther("1400"));
              expect(await rewardToken.balanceOf(await bob.getAddress())).to.eq(ethers.utils.parseEther("800"));
            });
          });
        });
      });
      context("When there are multiple campaigns", async () => {
        it("should correctly separate rewards and total staked", async () => {
          const mintedRewardCampaign1Phase1 = INITIAL_BONUS_REWARD_PER_BLOCK.mul(
            mockedBlock.add(13).sub(mockedBlock.add(10))
          );
          const mintedRewardCampaign2Phase1 = INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100")).mul(
            mockedBlock.add(21).sub(mockedBlock.add(14))
          );
          const totalMintedReward = mintedRewardCampaign2Phase1.add(mintedRewardCampaign1Phase1);
          // mint reward token to Deployer (when add rewardInfo)
          await rewardTokenAsDeployer.mint(await deployer.getAddress(), totalMintedReward); // scenario: alice deposit #n amount staking token to the pool
          // when the time past, block number increase, alice expects to have her reward amount by calling `rewardToekn()`
          // this scenario occurred between block #(mockedBlock+10)-..#(mockedBlock+21) for campaign 0 and 1
          await grazingRangeAsDeployer.addCampaignInfo(
            stakingToken.address,
            rewardToken.address,
            mockedBlock.add(10).toString()
          );

          await grazingRangeAsDeployer.addCampaignInfo(
            stakingToken.address,
            rewardToken.address,
            mockedBlock.add(14).toString()
          );

          // set reward for campaign 0
          await grazingRangeAsDeployer.addRewardInfo(0, mockedBlock.add(13).toString(), INITIAL_BONUS_REWARD_PER_BLOCK);

          // set reward for campaign 1
          await grazingRangeAsDeployer.addRewardInfo(
            1,
            mockedBlock.add(21).toString(),
            INITIAL_BONUS_REWARD_PER_BLOCK.add(ethers.utils.parseEther("100"))
          );
          // mint staking token to alice
          await stakingTokenAsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther("1000"));
          // mint staking token to bob
          await stakingTokenAsDeployer.mint(await bob.getAddress(), ethers.utils.parseEther("1000"));
          // alice & bob approve grazing range
          await stakingTokenAsAlice.approve(grazingRange.address, ethers.utils.parseEther("1000"));
          await stakingTokenAsBob.approve(grazingRange.address, ethers.utils.parseEther("1000"));

          // ### campaign 0 ###
          // alice deposit @block number #(mockedBlock+11)
          await grazingRangeAsAlice.deposit(BigNumber.from(0), ethers.utils.parseEther("100"));
          // bob deposit @block number #(mockedBlock+12)
          await grazingRangeAsBob.deposit(BigNumber.from(0), ethers.utils.parseEther("200"));

          let currentBlockNum = await TimeHelpers.latestBlockNumber();
          await TimeHelpers.advanceBlockTo(mockedBlock.add(13).toNumber());

          // alice withdraw @block number #(mockedBlock)
          // alice should expect to see her pending reward according to calculated reward per share and her deposit
          let expectedAccRewardPerShare = BigNumber.from(2).mul(ethers.utils.parseUnits("1", 20)); // reward per share 2
          expect((await grazingRangeAsAlice.campaignInfo(0)).lastRewardBlock).to.eq(currentBlockNum);
          expect((await grazingRangeAsAlice.campaignInfo(0)).accRewardPerShare).to.eq(expectedAccRewardPerShare);
          expect((await grazingRangeAsAlice.campaignInfo(0)).totalStaked).to.eq(ethers.utils.parseEther("300"));

          await grazingRangeAsAlice.harvest([BigNumber.from(0)]);
          await grazingRangeAsBob.harvest([BigNumber.from(0)]);

          expect(await (await stakingToken.balanceOf(await alice.getAddress())).toString()).to.eq(
            ethers.utils.parseEther("900")
          );
          expect(await (await stakingToken.balanceOf(await bob.getAddress())).toString()).to.eq(
            ethers.utils.parseEther("800")
          );

          expect(await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(0))).totalStaked.toString()).to.eq(
            ethers.utils.parseEther("300")
          );
          expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(
            ethers.utils.parseEther("233.333333333333333333")
          );
          expect(await rewardToken.balanceOf(await bob.getAddress())).to.eq(
            ethers.utils.parseEther("66.666666666666666666")
          );

          // ### campaign 1 ##
          await TimeHelpers.advanceBlockTo(mockedBlock.add(18).toNumber());

          // alice deposit @block number #(mockedBlock+19)
          await grazingRangeAsAlice.deposit(BigNumber.from(1), ethers.utils.parseEther("400"));
          // bob deposit @block number #(mockedBlock+20)
          await grazingRangeAsBob.deposit(BigNumber.from(1), ethers.utils.parseEther("600"));

          currentBlockNum = await TimeHelpers.latestBlockNumber();
          await TimeHelpers.advanceBlockTo(mockedBlock.add(22).toNumber());
          // reward per share calculated by 14 - 20 = 6 block diff * 200 rewards / 400 current staked from alice
          // = 1200 / 400 = 3 accu reward per share
          expectedAccRewardPerShare = BigNumber.from(3).mul(ethers.utils.parseUnits("1", 20));
          expect((await grazingRangeAsAlice.campaignInfo(1)).lastRewardBlock).to.eq(currentBlockNum);
          expect((await grazingRangeAsAlice.campaignInfo(1)).accRewardPerShare).to.eq(expectedAccRewardPerShare);
          expect((await grazingRangeAsAlice.campaignInfo(1)).totalStaked).to.eq(ethers.utils.parseEther("1000"));
          // harvest
          await grazingRangeAsAlice.harvest([BigNumber.from(1)]);
          await grazingRangeAsBob.harvest([BigNumber.from(1)]);
          // alice should expect to see her pending reward according to calculated reward per share and her deposit

          expect(await (await stakingToken.balanceOf(await alice.getAddress())).toString()).to.eq(
            ethers.utils.parseEther("500")
          );
          expect(await (await stakingToken.balanceOf(await bob.getAddress())).toString()).to.eq(
            ethers.utils.parseEther("200")
          );
          expect(await (await grazingRangeAsAlice.campaignInfo(BigNumber.from(1))).totalStaked.toString()).to.eq(
            ethers.utils.parseEther("1000")
          );
          expect(await rewardToken.balanceOf(await alice.getAddress())).to.eq(
            ethers.utils.parseEther("1513.333333333333333333")
          );
          expect(await rewardToken.balanceOf(await bob.getAddress())).to.eq(
            ethers.utils.parseEther("186.666666666666666666")
          );
        });
      });
    });
  });
});
