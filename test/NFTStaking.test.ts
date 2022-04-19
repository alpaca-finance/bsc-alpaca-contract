import { ethers, upgrades, waffle } from "hardhat";
import { Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import { NFTStaking, NFTStaking__factory, MockNFT, MockNFT__factory } from "../typechain";

chai.use(solidity);
const { expect } = chai;

describe("NFTStaking", () => {
  // Accounts
  let deployer: Signer;
  let alice: Signer;

  let deployerAddress: string;
  let aliceAddress: string;

  let nftStaking: NFTStaking;
  let mockNFT: MockNFT;
  let mockNFT2: MockNFT;

  let mockNFTAsAlice: MockNFT;
  let nftStakingAsAlice: NFTStaking;

  async function fixture() {
    [deployer, alice] = await ethers.getSigners();

    const NFTStaking = (await ethers.getContractFactory("NFTStaking", deployer)) as NFTStaking__factory;
    nftStaking = (await upgrades.deployProxy(NFTStaking, [])) as NFTStaking;
    await nftStaking.deployed();

    // Deploy MockNFT
    // Sale will start 1000 blocks from here and another 1000 blocks to reveal
    const MockNFT = (await ethers.getContractFactory("MockNFT", deployer)) as MockNFT__factory;
    mockNFT = (await upgrades.deployProxy(MockNFT, [])) as MockNFT;
    mockNFT2 = (await upgrades.deployProxy(MockNFT, [])) as MockNFT;
    await mockNFT.deployed();
    await mockNFT2.deployed();
    mockNFTAsAlice = MockNFT__factory.connect(mockNFT.address, alice);
    nftStakingAsAlice = NFTStaking__factory.connect(nftStaking.address, alice);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);

    [deployerAddress, aliceAddress] = await Promise.all([deployer.getAddress(), alice.getAddress()]);
  });

  describe("#addPool", async () => {
    const poolId = ethers.utils.solidityKeccak256(["string"], ["ALPIES"]);
    context("when addPool with correct params", async () => {
      it("should success", async () => {
        await nftStaking.addPool(poolId, [mockNFT.address], 100);
        const isEligibleNFT = await nftStaking.isEligibleNFT(poolId, mockNFT.address);
        expect(isEligibleNFT).to.be.true;
      });
    });

    context("when addPool with already exist pool", async () => {
      it("should fail", async () => {
        await nftStaking.addPool(poolId, [mockNFT.address], 100);
        expect(nftStaking.addPool(poolId, [mockNFT.address], 100)).to.be.revertedWith("NFTStaking_PoolAlreadyExist()");
      });
    });
  });

  describe("#setStakeNFTToken", async () => {
    const poolId = ethers.utils.solidityKeccak256(["string"], ["ALPIES"]);
    context("when setStakeNFTToken with correct params", async () => {
      it("should success", async () => {
        await nftStaking.addPool(poolId, [mockNFT.address], 100);
        await nftStaking.setStakeNFTToken(poolId, [mockNFT2.address], [1]);
        const isEligibleNFT = await nftStaking.isEligibleNFT(poolId, mockNFT2.address);
        expect(isEligibleNFT).to.be.true;
      });
    });

    context("when pool not initialize", async () => {
      it("should revert", async () => {
        expect(nftStaking.setStakeNFTToken(poolId, [mockNFT2.address], [1])).to.be.revertedWith(
          "NFTStaking_PoolNotExist()"
        );
      });
    });

    context("when setStakeNFTToken with bad params", async () => {
      it("should revert", async () => {
        await nftStaking.addPool(poolId, [mockNFT.address], 100);
        expect(nftStaking.setStakeNFTToken(poolId, [], [1])).to.be.revertedWith("NFTStaking_BadParamsLength()");
      });
    });
  });

  describe("#stakeNFT", async () => {
    const poolId = ethers.utils.solidityKeccak256(["string"], ["ALPIES"]);
    const poolId2 = ethers.utils.solidityKeccak256(["string"], ["ALPIES2"]);

    context("when stake eligible NFT", async () => {
      it("should success", async () => {
        await nftStaking.addPool(poolId, [mockNFT.address], 100);
        await mockNFT.mint(1);

        expect(await mockNFT.balanceOf(deployerAddress)).to.be.eq(1);

        await mockNFT.approve(nftStaking.address, 0);
        await nftStaking.stakeNFT(poolId, mockNFT.address, 0);

        const userStakingNFT = await nftStaking.userStakingNFT(poolId, deployerAddress);
        expect(userStakingNFT.nftAddress).to.be.eq(mockNFT.address);
        expect(userStakingNFT.nftTokenId).to.be.eq(0);
        expect(await mockNFT.balanceOf(deployerAddress)).to.be.eq(0);


        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.true;
      });
    });

    context("when stake eligible NFT without approval", async () => {
      it("should revert", async () => {
        await nftStaking.addPool(poolId, [mockNFT.address], 100);
        await mockNFT.mint(1);

        expect(await mockNFT.balanceOf(deployerAddress)).to.be.eq(1);

        await expect(nftStaking.stakeNFT(poolId, mockNFT.address, 0)).to.be.revertedWith(
          "ERC721: transfer caller is not owner nor approved"
        );
      });
    });

    context("when stake ineligible NFT", async () => {
      it("should revert", async () => {
        await nftStaking.addPool(poolId, [mockNFT.address], 100);
        await mockNFT2.mint(1);

        expect(await mockNFT2.balanceOf(deployerAddress)).to.be.eq(1);

        await expect(nftStaking.stakeNFT(poolId, mockNFT2.address, 0)).to.be.revertedWith(
          "NFTStaking_InvalidNFTAddress()"
        );
        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.false;
      });
    });

    context("when stake eligible NFT again", async () => {
      it("should allow the second NFT to be staked and received first NFT back", async () => {
        await nftStaking.addPool(poolId, [mockNFT.address], 100);
        await mockNFT.mint(2);

        expect(await mockNFT.balanceOf(deployerAddress)).to.be.eq(2);

        await mockNFT.approve(nftStaking.address, 0);
        await nftStaking.stakeNFT(poolId, mockNFT.address, 0);

        let userStakingNFT = await nftStaking.userStakingNFT(poolId, deployerAddress);
        expect(userStakingNFT.nftAddress).to.be.eq(mockNFT.address);
        expect(userStakingNFT.nftTokenId).to.be.eq(0);

        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.true;

        expect(await mockNFT.balanceOf(deployerAddress)).to.be.eq(1);

        await mockNFT.approve(nftStaking.address, 1);
        await nftStaking.stakeNFT(poolId, mockNFT.address, 1);

        userStakingNFT = await nftStaking.userStakingNFT(poolId, deployerAddress);
        expect(userStakingNFT.nftAddress).to.be.eq(mockNFT.address);
        expect(userStakingNFT.nftTokenId).to.be.eq(1);

        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.true;

        expect(await mockNFT.balanceOf(deployerAddress)).to.be.eq(1);
      });
    });

    context("when stakeNFT with higher weight, update the userHighestWeightPoolId", async () => {
      it("should success", async () => {
        await nftStaking.addPool(poolId, [mockNFT.address], 100);
        await mockNFT.mint(1);

        expect(await mockNFT.balanceOf(deployerAddress)).to.be.eq(1);

        await mockNFT.approve(nftStaking.address, 0);
        await nftStaking.stakeNFT(poolId, mockNFT.address, 0);

        let userStakingNFT = await nftStaking.userStakingNFT(poolId, deployerAddress);
        expect(userStakingNFT.nftAddress).to.be.eq(mockNFT.address);
        expect(userStakingNFT.nftTokenId).to.be.eq(0);
        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.true;
        expect(await mockNFT.balanceOf(deployerAddress)).to.be.eq(0);
        expect(await nftStaking.userHighestWeightPoolId(deployerAddress)).to.be.eq(poolId);

        // Add pool with higher weight
        await nftStaking.addPool(poolId2, [mockNFT2.address], 200);
        await mockNFT2.mint(2);

        expect(await mockNFT2.balanceOf(deployerAddress)).to.be.eq(2);

        await mockNFT2.approve(nftStaking.address, 0);
        await nftStaking.stakeNFT(poolId2, mockNFT2.address, 0);

        userStakingNFT = await nftStaking.userStakingNFT(poolId2, deployerAddress);
        expect(userStakingNFT.nftAddress).to.be.eq(mockNFT2.address);
        expect(userStakingNFT.nftTokenId).to.be.eq(0);
        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.true;
        expect(await mockNFT2.balanceOf(deployerAddress)).to.be.eq(1);
        expect(await nftStaking.userHighestWeightPoolId(deployerAddress)).to.be.eq(poolId2);
      });
    });

    context("when stakeNFT with lower weight, userHighestWeightPoolId remain the same ", async () => {
      it("should success", async () => {
        await nftStaking.addPool(poolId, [mockNFT.address], 100);
        await mockNFT.mint(1);

        expect(await mockNFT.balanceOf(deployerAddress)).to.be.eq(1);

        await mockNFT.approve(nftStaking.address, 0);
        await nftStaking.stakeNFT(poolId, mockNFT.address, 0);

        let userStakingNFT = await nftStaking.userStakingNFT(poolId, deployerAddress);
        expect(userStakingNFT.nftAddress).to.be.eq(mockNFT.address);
        expect(userStakingNFT.nftTokenId).to.be.eq(0);
        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.true;
        expect(await mockNFT.balanceOf(deployerAddress)).to.be.eq(0);
        expect(await nftStaking.userHighestWeightPoolId(deployerAddress)).to.be.eq(poolId);

        // Add pool with lower weight
        await nftStaking.addPool(poolId2, [mockNFT2.address], 50);
        await mockNFT2.mint(1);

        expect(await mockNFT2.balanceOf(deployerAddress)).to.be.eq(1);

        await mockNFT2.approve(nftStaking.address, 0);
        await nftStaking.stakeNFT(poolId2, mockNFT2.address, 0);

        userStakingNFT = await nftStaking.userStakingNFT(poolId2, deployerAddress);
        expect(userStakingNFT.nftAddress).to.be.eq(mockNFT2.address);
        expect(userStakingNFT.nftTokenId).to.be.eq(0);
        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.true;
        expect(await mockNFT2.balanceOf(deployerAddress)).to.be.eq(0);
        expect(await nftStaking.userHighestWeightPoolId(deployerAddress)).to.be.eq(poolId);
      });
    });
  });

  describe("#unstakeNFT", async () => {
    const poolId = ethers.utils.solidityKeccak256(["string"], ["ALPIES"]);
    context("when unstake the already staked NFT", async () => {
      it("should success", async () => {
        await nftStaking.addPool(poolId, [mockNFT.address], 100);
        await mockNFT.mint(1);

        expect(await mockNFT.balanceOf(deployerAddress)).to.be.eq(1);

        await mockNFT.approve(nftStaking.address, 0);
        await nftStaking.stakeNFT(poolId, mockNFT.address, 0);

        const userStakingNFT = await nftStaking.userStakingNFT(poolId, deployerAddress);
        expect(userStakingNFT.nftAddress).to.be.eq(mockNFT.address);
        expect(userStakingNFT.nftTokenId).to.be.eq(0);
        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.true;

        await nftStaking.unstakeNFT(poolId);

        expect(await mockNFT.balanceOf(deployerAddress)).to.be.eq(1);
        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.false;
      });
    });

    context("when unstake without staked NFT", async () => {
      it("should revert", async () => {
        await nftStaking.addPool(poolId, [mockNFT.address], 100);
        await mockNFT.mint(1);

        expect(await mockNFT.balanceOf(deployerAddress)).to.be.eq(1);

        const userStakingNFT = await nftStaking.userStakingNFT(poolId, deployerAddress);
        expect(userStakingNFT.nftAddress).to.be.eq(ethers.constants.AddressZero);
        expect(userStakingNFT.nftTokenId).to.be.eq(0);
        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.false;

        await expect(nftStaking.unstakeNFT(poolId)).to.be.revertedWith("NFTStaking_NoNFTStaked()");
      });
    });

    context("when unstake other user's NFT", async () => {
      it("should revert", async () => {
        await nftStaking.addPool(poolId, [mockNFT.address], 100);
        await mockNFT.mint(1);

        await mockNFT.transferFrom(deployerAddress, aliceAddress, 0);

        expect(await mockNFT.balanceOf(aliceAddress)).to.be.eq(1);

        await mockNFTAsAlice.approve(nftStaking.address, 0);
        await nftStakingAsAlice.stakeNFT(poolId, mockNFT.address, 0);

        expect(await mockNFT.balanceOf(aliceAddress)).to.be.eq(0);

        const userStakingNFT = await nftStaking.userStakingNFT(poolId, aliceAddress);
        expect(userStakingNFT.nftAddress).to.be.eq(mockNFT.address);
        expect(userStakingNFT.nftTokenId).to.be.eq(0);

        expect(await nftStaking.isStaked(poolId, aliceAddress)).to.be.true;
        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.false;

        await expect(nftStaking.unstakeNFT(poolId)).to.be.revertedWith("NFTStaking_NoNFTStaked()");
      });
    });
  });
});
