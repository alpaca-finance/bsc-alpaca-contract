import "@openzeppelin/test-helpers";
import * as TimeHelpers from "../../helpers/time";
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MerkleDistributor, MerkleDistributor__factory, MockERC20__factory, MockERC20 } from "../../../typechain";
import { BigNumber, Signer } from "ethers";
import { ethers, upgrades, waffle } from "hardhat";
import { parseBalanceMap } from "../../../utils/parse-balance-map";

chai.use(solidity);
const { expect } = chai;

describe("MerkleDistributor", () => {
  /// instant
  let merkleDistributor: MerkleDistributor;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let catherine: Signer;
  let nowBlock: number;

  //Token
  let mockERC20: MockERC20;

  //Contract as Signer
  let mockTokenAsDeployer: MockERC20;
  let merkleAsDeployer: MerkleDistributor;

  let claims: {
    [account: string]: {
      index: number;
      amount: string;
      proof: string[];
    };
  };

  async function fixture() {
    nowBlock = (await TimeHelpers.latestBlockNumber()).toNumber();
    [deployer, alice, bob, catherine] = await ethers.getSigners();

    const MockToken = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    mockERC20 = (await upgrades.deployProxy(MockToken, [`STOKENA`, `STOKENB`, "18"])) as MockERC20;
    await mockERC20.deployed();

    mockTokenAsDeployer = MockERC20__factory.connect(mockERC20.address, deployer);

    const {
      claims: innerClaims,
      merkleRoot,
      tokenTotal,
    } = parseBalanceMap({
      [await alice.getAddress()]: 200,
      [await bob.getAddress()]: 300,
      [await catherine.getAddress()]: 250,
    });
    const MerkleDistributorContract = (await ethers.getContractFactory(
      "MerkleDistributor",
      deployer
    )) as MerkleDistributor__factory;
    merkleDistributor = await MerkleDistributorContract.deploy(mockERC20.address, merkleRoot);
    await merkleDistributor.deployed();

    merkleAsDeployer = MerkleDistributor__factory.connect(merkleDistributor.address, deployer);

    expect(tokenTotal).to.eq(BigNumber.from(750).toHexString()); // 750
    claims = innerClaims;
    await mockTokenAsDeployer.mint(await deployer.getAddress(), tokenTotal);
    await mockTokenAsDeployer.approve(merkleDistributor.address, 750);
    await merkleAsDeployer.deposit(750);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("validate parseBalanceMap function", () => {
    it("should generate correct proof", async () => {
      // Alice
      expect(claims[await alice.getAddress()].amount).to.equal(BigNumber.from(200).toHexString());
      expect(claims[await alice.getAddress()].proof).to.deep.equal([
        "0x1c7cd16d5e49ed5aec8653361fe3c0496e8b9cda29a74e2913c7bd2e830ffad1",
        "0xa1281640dd3f2f3e400a42e90527e508f5a7ee4286dff710c570775145ee0165",
      ]);
      // Bob
      expect(claims[await bob.getAddress()].amount).to.equal(BigNumber.from(300).toHexString());
      expect(claims[await bob.getAddress()].proof).to.deep.equal([
        "0x947a7b7d06336aaaad02bfbe9ae36b7ad7b5d36a98931901e958544620016414",
        "0xa1281640dd3f2f3e400a42e90527e508f5a7ee4286dff710c570775145ee0165",
      ]);
      // Catherine
      expect(claims[await catherine.getAddress()].amount).to.equal(BigNumber.from(250).toHexString());
      expect(claims[await catherine.getAddress()].proof).to.deep.equal([
        "0xd1df20cc2fcab841bf3870b019038437dbd4c8db2bff627a8b385ebcc951f3a6",
      ]);
    });
    it("should allow to claim only once", async () => {
      expect(await mockTokenAsDeployer.balanceOf(merkleAsDeployer.address)).to.not.eq(0);
      for (let account in claims) {
        const claim = claims[account];
        await expect(merkleAsDeployer.claim(claim.index, account, claim.amount, claim.proof))
          .to.emit(merkleAsDeployer, "Claimed")
          .withArgs(claim.index, account, claim.amount);
        await expect(merkleAsDeployer.claim(claim.index, account, claim.amount, claim.proof)).to.be.revertedWith(
          "MerkleDistributor::claim:: drop already claimed"
        );
      }
      expect(await mockTokenAsDeployer.balanceOf(merkleAsDeployer.address)).to.eq(0);
    });
    it(`should distribute reward to correct person`, async () => {
      for (let account in claims) {
        const claim = claims[account];
        await merkleAsDeployer.claim(claim.index, account, claim.amount, claim.proof);
      }
      expect(await mockTokenAsDeployer.balanceOf(await alice.getAddress())).to.eq(200);
      expect(await mockTokenAsDeployer.balanceOf(await bob.getAddress())).to.eq(300);
      expect(await mockTokenAsDeployer.balanceOf(await catherine.getAddress())).to.eq(250);
    });
  });
});
