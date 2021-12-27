import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  NFTStaking,
  NFTStaking__factory,
  Alpies,
  Alpies__factory,
  FixedPriceModel,
  FixedPriceModel__factory,
} from "../typechain";
import { latestBlockNumber } from "./helpers/time";

chai.use(solidity);
const { expect } = chai;

const MAX_SALE_ALPIES = 100;
const MAX_RESERVE_AMOUNT = 5;
const MAX_PREMINT_AMOUNT = 10;
const ALPIES_PRICE = ethers.utils.parseEther("1");

describe("NFTStaking", () => {
  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let eve: Signer;

  let deployerAddress: string;
  let aliceAddress: string;
  let bobAddress: string;

  let nftStaking: NFTStaking;
  let alpies: Alpies;
  let alpies2: Alpies;

  let alpiesAsAlice: Alpies;
  let nftStakingAsAlice: NFTStaking;

  async function fixture() {
    [deployer, alice, bob, eve] = await ethers.getSigners();

    const NFTStaking = (await ethers.getContractFactory("NFTStaking", deployer)) as NFTStaking__factory;
    nftStaking = (await upgrades.deployProxy(NFTStaking, [])) as NFTStaking;
    await nftStaking.deployed();

    // Deploy Fix PriceModel
    const FixedPriceModel = (await ethers.getContractFactory("FixedPriceModel", deployer)) as FixedPriceModel__factory;
    const fixedPriceModel = await FixedPriceModel.deploy(
      (await latestBlockNumber()).add(1000),
      (await latestBlockNumber()).add(1800),
      ALPIES_PRICE
    );
    await fixedPriceModel.deployed();

    // Deploy Alpies
    // Sale will start 1000 blocks from here and another 1000 blocks to reveal
    const Alpies = (await ethers.getContractFactory("Alpies", deployer)) as Alpies__factory;
    alpies = (await upgrades.deployProxy(Alpies, [
      "Alpies",
      "ALPIES",
      MAX_SALE_ALPIES,
      (await latestBlockNumber()).add(1850),
      fixedPriceModel.address,
      MAX_RESERVE_AMOUNT,
      MAX_PREMINT_AMOUNT,
    ])) as Alpies;
    await alpies.deployed();

    alpies2 = (await upgrades.deployProxy(Alpies, [
      "Alpies2",
      "ALPIES2",
      MAX_SALE_ALPIES,
      (await latestBlockNumber()).add(1850),
      fixedPriceModel.address,
      MAX_RESERVE_AMOUNT,
      MAX_PREMINT_AMOUNT,
    ])) as Alpies;
    await alpies2.deployed();

    alpiesAsAlice = Alpies__factory.connect(alpies.address, alice);
    nftStakingAsAlice = NFTStaking__factory.connect(nftStaking.address, alice);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);

    [deployerAddress, aliceAddress, bobAddress] = await Promise.all([
      deployer.getAddress(),
      alice.getAddress(),
      bob.getAddress(),
    ]);
  });

  describe("#addPool", async () => {
    context("when addPool with correct params", async () => {
      it("should success", async () => {
        const poolId = ethers.utils.solidityKeccak256(["string"], ["ALPIES"]);
        await nftStaking.addPool(poolId, [alpies.address]);

        const poolInfo = await nftStaking.poolInfo(poolId);
        expect(poolInfo).to.be.eq(1);

        const isEligibleNFT = await nftStaking.isEligibleNFT(poolId, alpies.address);
        expect(isEligibleNFT).to.be.true;
      });
    });
  });

  describe("#setStakeNFTToken", async () => {
    context("when setStakeNFTToken with correct params", async () => {
      it("should success", async () => {
        const poolId = ethers.utils.solidityKeccak256(["string"], ["ALPIES"]);
        await nftStaking.addPool(poolId, [alpies.address]);

        await nftStaking.setStakeNFTToken(poolId, [alpies2.address], [1]);
        const isEligibleNFT = await nftStaking.isEligibleNFT(poolId, alpies2.address);
        expect(isEligibleNFT).to.be.true;
      });
    });
  });

  describe("#stakeNFT", async () => {
    context("when stake eligible NFT", async () => {
      it("should success", async () => {
        const poolId = ethers.utils.solidityKeccak256(["string"], ["ALPIES"]);
        await nftStaking.addPool(poolId, [alpies.address]);
        await alpies.mintReserve(1);

        await alpies.approve(nftStaking.address, 0);
        await nftStaking.stakeNFT(poolId, alpies.address, 0);

        const userStakingNFT = await nftStaking.userStakingNFT(poolId, deployerAddress);
        expect(userStakingNFT.nftAddress).to.be.eq(alpies.address);
        expect(userStakingNFT.nftTokenId).to.be.eq(0);

        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.true;
      });
    });

    context("when stake eligible NFT without approval", async () => {
      it("should revert", async () => {
        const poolId = ethers.utils.solidityKeccak256(["string"], ["ALPIES"]);
        await nftStaking.addPool(poolId, [alpies.address]);
        await alpies.mintReserve(1);

        await expect(nftStaking.stakeNFT(poolId, alpies.address, 0)).to.be.revertedWith(
          "ERC721: transfer caller is not owner nor approved"
        );
      });
    });

    context("when stake ineligible NFT", async () => {
      it("should revert", async () => {
        const poolId = ethers.utils.solidityKeccak256(["string"], ["ALPIES"]);
        await nftStaking.addPool(poolId, [alpies.address]);
        await alpies2.mintReserve(1);

        await expect(nftStaking.stakeNFT(poolId, alpies2.address, 0)).to.be.revertedWith(
          "NFTStaking::stakeNFT::nft address not allowed"
        );
        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.false;
      });
    });

    context("when stake eligible NFT again", async () => {
      it("should allow the second NFT to be staked and received first NFT back", async () => {
        const poolId = ethers.utils.solidityKeccak256(["string"], ["ALPIES"]);
        await nftStaking.addPool(poolId, [alpies.address]);
        await alpies.mintReserve(2);

        expect(await alpies.balanceOf(deployerAddress)).to.be.eq(2);

        await alpies.approve(nftStaking.address, 0);
        await nftStaking.stakeNFT(poolId, alpies.address, 0);

        const userStakingNFT = await nftStaking.userStakingNFT(poolId, deployerAddress);
        expect(userStakingNFT.nftAddress).to.be.eq(alpies.address);
        expect(userStakingNFT.nftTokenId).to.be.eq(0);

        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.true;

        expect(await alpies.balanceOf(deployerAddress)).to.be.eq(1);

        await alpies.approve(nftStaking.address, 1);
        await nftStaking.stakeNFT(poolId, alpies.address, 1);

        const userStakingNFT2 = await nftStaking.userStakingNFT(poolId, deployerAddress);
        expect(userStakingNFT2.nftAddress).to.be.eq(alpies.address);
        expect(userStakingNFT2.nftTokenId).to.be.eq(1);

        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.true;

        expect(await alpies.balanceOf(deployerAddress)).to.be.eq(1);
      });
    });
  });

  describe("#unstakeNFT", async () => {
    context("when unstake the already staked NFT", async () => {
      it("should success", async () => {
        const poolId = ethers.utils.solidityKeccak256(["string"], ["ALPIES"]);
        await nftStaking.addPool(poolId, [alpies.address]);
        await alpies.mintReserve(1);

        expect(await alpies.balanceOf(deployerAddress)).to.be.eq(1);

        await alpies.approve(nftStaking.address, 0);
        await nftStaking.stakeNFT(poolId, alpies.address, 0);

        expect(await alpies.balanceOf(deployerAddress)).to.be.eq(0);

        const userStakingNFT = await nftStaking.userStakingNFT(poolId, deployerAddress);
        expect(userStakingNFT.nftAddress).to.be.eq(alpies.address);
        expect(userStakingNFT.nftTokenId).to.be.eq(0);
        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.true;

        await nftStaking.unstakeNFT(poolId);

        expect(await alpies.balanceOf(deployerAddress)).to.be.eq(1);
        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.false;
      });
    });

    context("when unstake without staked NFT", async () => {
      it("should revert", async () => {
        const poolId = ethers.utils.solidityKeccak256(["string"], ["ALPIES"]);
        await nftStaking.addPool(poolId, [alpies.address]);
        await alpies.mintReserve(1);

        expect(await alpies.balanceOf(deployerAddress)).to.be.eq(1);

        const userStakingNFT = await nftStaking.userStakingNFT(poolId, deployerAddress);
        expect(userStakingNFT.nftAddress).to.be.eq(ethers.constants.AddressZero);
        expect(userStakingNFT.nftTokenId).to.be.eq(0);
        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.false;

        await expect(nftStaking.unstakeNFT(poolId)).to.be.revertedWith("NFTStaking::unstakeNFT::no nft staked");
      });
    });

    context("when unstake other user's NFT", async () => {
      it("should revert", async () => {
        const poolId = ethers.utils.solidityKeccak256(["string"], ["ALPIES"]);
        await nftStaking.addPool(poolId, [alpies.address]);
        await alpies.mintReserve(1);

        await alpies.transferFrom(deployerAddress, aliceAddress, 0);

        expect(await alpies.balanceOf(aliceAddress)).to.be.eq(1);

        await alpiesAsAlice.approve(nftStaking.address, 0);
        await nftStakingAsAlice.stakeNFT(poolId, alpies.address, 0);

        expect(await alpies.balanceOf(aliceAddress)).to.be.eq(0);

        const userStakingNFT = await nftStaking.userStakingNFT(poolId, aliceAddress);
        expect(userStakingNFT.nftAddress).to.be.eq(alpies.address);
        expect(userStakingNFT.nftTokenId).to.be.eq(0);

        expect(await nftStaking.isStaked(poolId, aliceAddress)).to.be.true;
        expect(await nftStaking.isStaked(poolId, deployerAddress)).to.be.false;

        await expect(nftStaking.unstakeNFT(poolId)).to.be.revertedWith("NFTStaking::unstakeNFT::no nft staked");
      });
    });
  });
});
