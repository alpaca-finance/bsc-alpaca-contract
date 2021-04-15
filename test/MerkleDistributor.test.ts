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
    /// Constant
    const ADDRESS0 = "0x0000000000000000000000000000000000000000";
    

    /// instant
    let merkleDistributor: MerkleDistributor;
    
    // Accounts
    let deployer: Signer;
    let admin: Signer;
    let alice: Signer;
    let bob: Signer;
    let catherine: Signer;
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

    // Provider
    const provider = new MockProvider({
        ganacheOptions: {
          hardfork: 'istanbul',
          mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
          gasLimit: 9999999,
        },
    })
    
    // Wallets
    const wallets = provider.getWallets()
    const { claims: innerClaims, merkleRoot, tokenTotal } = parseBalanceMap({
      [wallets[0].address]: 200,
      [wallets[1].address]: 300,
      [wallets[2].address]: 250,
    })

    
    beforeEach(async () => {
      nowBlock = (await TimeHelpers.latestBlockNumber()).toNumber();
      [deployer, admin, alice, bob, catherine] = await ethers.getSigners();

      const MockToken = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory
      mockERC20 = await upgrades.deployProxy(MockToken, [`STOKENA`, `STOKENB`]) as MockERC20;
      await mockERC20.deployed();

      const MerkleDistributorContract = (await ethers.getContractFactory(
        "MerkleDistributor",
        deployer
      )) as MerkleDistributor__factory;
      merkleDistributor = await MerkleDistributorContract.deploy(mockERC20.address, merkleRoot)
      await merkleDistributor.deployed();

      mockTokenAsDeployer = MockERC20__factory.connect(mockERC20.address, deployer)
      merkleAsDeployer = MerkleDistributor__factory.connect(merkleDistributor.address, deployer)

      await mockTokenAsDeployer.mint(merkleDistributor.address, tokenTotal)
    
      expect(tokenTotal).to.eq('0x02ee') // 750
      claims = innerClaims
    })
    context('parseBalanceMap', () => {
      it('check the proofs is as expected', async () => {
        expect(claims).to.deep.eq({
            [wallets[0].address]: {
              index: 0,
              amount: '0xc8',
              proof: ['0x2a411ed78501edb696adca9e41e78d8256b61cfac45612fa0434d7cf87d916c6'],
            },
            [wallets[1].address]: {
              index: 1,
              amount: '0x012c',
              proof: [
                '0xbfeb956a3b705056020a3b64c540bff700c0f6c96c55c0a5fcab57124cb36f7b',
                '0xd31de46890d4a77baeebddbd77bf73b5c626397b73ee8c69b51efe4c9a5a72fa',
              ],
            },
            [wallets[2].address]: {
              index: 2,
              amount: '0xfa',
              proof: [
                '0xceaacce7533111e902cc548e961d77b23a4d8cd073c6b68ccf55c62bd47fc36b',
                '0xd31de46890d4a77baeebddbd77bf73b5c626397b73ee8c69b51efe4c9a5a72fa',
              ],
            },
          })
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
    })
})