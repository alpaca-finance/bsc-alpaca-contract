import "@openzeppelin/test-helpers";
import * as TimeHelpers from "./helpers/time"
import { solidity, deployContract, MockProvider } from "ethereum-waffle";
import chai from "chai";
import { MerkleDistributor, AlpacaToken, MerkleDistributor__factory, AlpacaToken__factory, MockERC20__factory, MockERC20 } from "../typechain"
import { Signer, BigNumberish, utils, BigNumber, Wallet } from "ethers";
import { ethers, upgrades } from "hardhat";
import { parseBalanceMap } from "../utils/parse-balance-map";

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
    let drew: Signer;
    let nowBlock: number;

    //Token
    let mockERC20: MockERC20

    //Contract as Signer
    let mockTokenAsDeployer: MockERC20
    let merkleAsDeployer: MerkleDistributor

    let claims: {
      [account: string]: {
        index: number
        amount: string
        proof: string[]
      }
    }
    
    beforeEach(async () => {
      nowBlock = (await TimeHelpers.latestBlockNumber()).toNumber();
      [deployer, alice, bob, catherine, drew] = await ethers.getSigners();

      const MockToken = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory
      mockERC20 = await upgrades.deployProxy(MockToken, [`STOKENA`, `STOKENB`]) as MockERC20;
      await mockERC20.deployed();

      mockTokenAsDeployer = MockERC20__factory.connect(mockERC20.address, deployer)

      const { claims: innerClaims, merkleRoot, tokenTotal } = parseBalanceMap({
        [await alice.getAddress()]: 200,
        [await bob.getAddress()]: 300,
        [await catherine.getAddress()]: 250,
      })
      const MerkleDistributorContract = (await ethers.getContractFactory(
        "MerkleDistributor",
        deployer
        )) as MerkleDistributor__factory;
        merkleDistributor = await MerkleDistributorContract.deploy(mockERC20.address, merkleRoot)
        await merkleDistributor.deployed();
        
        merkleAsDeployer = MerkleDistributor__factory.connect(merkleDistributor.address, deployer)
    
      expect(tokenTotal).to.eq('0x02ee') // 750
      claims = innerClaims
      await mockTokenAsDeployer.mint(merkleDistributor.address, tokenTotal)
    })
    context('parseBalanceMap', () => {
      it('check the proofs is as expected', async () => {
        // Alice
        expect(claims[await alice.getAddress()].amount).to.equal('0xc8')
        expect(claims[await alice.getAddress()].proof).to.deep.equal([
          '0x1c7cd16d5e49ed5aec8653361fe3c0496e8b9cda29a74e2913c7bd2e830ffad1',
          '0xa1281640dd3f2f3e400a42e90527e508f5a7ee4286dff710c570775145ee0165'
        ])
        // Bob
        expect(claims[await bob.getAddress()].amount).to.equal('0x012c')
        expect(claims[await bob.getAddress()].proof).to.deep.equal([
          '0x947a7b7d06336aaaad02bfbe9ae36b7ad7b5d36a98931901e958544620016414',
          '0xa1281640dd3f2f3e400a42e90527e508f5a7ee4286dff710c570775145ee0165'
        ])
        // Catherine
        expect(claims[await catherine.getAddress()].amount).to.equal('0xfa')
        expect(claims[await catherine.getAddress()].proof).to.deep.equal([
          '0xd1df20cc2fcab841bf3870b019038437dbd4c8db2bff627a8b385ebcc951f3a6',
        ])
      })
      it('all claim work exactly once', async () => {
        expect(await mockTokenAsDeployer.balanceOf(merkleAsDeployer.address)).to.not.eq(0)
        for (let account in claims) {
          const claim = claims[account]
          await expect(merkleAsDeployer.claim(claim.index, account, claim.amount, claim.proof))
            .to.emit(merkleAsDeployer, 'Claimed')
            .withArgs(claim.index, account, claim.amount)
          await expect(merkleAsDeployer.claim(claim.index, account, claim.amount, claim.proof)).to.be.revertedWith(
            'MerkleDistributor: Drop already claimed.'
          )
        }
        expect(await mockTokenAsDeployer.balanceOf(merkleAsDeployer.address)).to.eq(0)
      })
      it(`all reward's distributed to correct person`, async () => {
        for (let account in claims) {
          const claim = claims[account]
          await merkleAsDeployer.claim(claim.index, account, claim.amount, claim.proof)
        }
        expect(await mockTokenAsDeployer.balanceOf(await alice.getAddress())).to.eq('0xc8')
        expect(await mockTokenAsDeployer.balanceOf(await bob.getAddress())).to.eq('0x012c')
        expect(await mockTokenAsDeployer.balanceOf(await catherine.getAddress())).to.eq('0xfa')
      })
    })
})