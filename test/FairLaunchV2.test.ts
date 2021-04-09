import { ethers, upgrades, waffle } from "hardhat";
import { Overrides, Signer, BigNumberish, utils, Wallet } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  AlpacaToken,
  AlpacaToken__factory,
  FairLaunch,
  FairLaunch__factory,
  FairLaunchV2,
  FairLaunchV2__factory,
  MockERC20,
  MockERC20__factory,
  LinearRelease,
  LinearRelease__factory
} from "../typechain";
import * as TimeHelpers from "./helpers/time"

chai.use(solidity);
const { expect } = chai;

describe("FairLaunchV2", () => {
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther('5000');
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;
  const ADDRESS0 = '0x0000000000000000000000000000000000000000'

  // Contract as Signer
  let alpacaTokenAsAlice: AlpacaToken;
  let alpacaTokenAsBob: AlpacaToken;
  let alpacaTokenAsDev: AlpacaToken;

  let stoken0AsDeployer: MockERC20;
  let stoken0AsAlice: MockERC20;
  let stoken0AsBob: MockERC20;
  let stoken0AsDev: MockERC20;

  let stoken1AsDeployer: MockERC20;
  let stoken1AsAlice: MockERC20;
  let stoken1AsBob: MockERC20;
  let stoken1AsDev: MockERC20;

  let fairLaunchAsDeployer: FairLaunch;
  let fairLaunchAsAlice: FairLaunch;
  let fairLaunchAsBob: FairLaunch;
  let fairLaunchAsDev: FairLaunch;

  let fairLaunchV2AsDeployer: FairLaunchV2;
  let fairLaunchV2AsAlice: FairLaunchV2;
  let fairLaunchV2AsBob: FairLaunchV2;
  let fairLaunchV2AsDev: FairLaunchV2;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let dev: Signer;

  let alpacaToken: AlpacaToken;
  let fairLaunch: FairLaunch;
  let fairLaunchV2: FairLaunchV2;
  let fairLaunchLink: MockERC20;
  let stakingTokens: MockERC20[];

  beforeEach(async() => {
    [deployer, alice, bob, dev] = await ethers.getSigners();

    // Setup FairLaunch contract
    // Deploy ALPACAs
    const AlpacaToken = (await ethers.getContractFactory(
      "AlpacaToken",
      deployer
    )) as AlpacaToken__factory;
    alpacaToken = await AlpacaToken.deploy(0, 1);
    await alpacaToken.deployed();

    const FairLaunch = (await ethers.getContractFactory(
      "FairLaunch",
      deployer
    )) as FairLaunch__factory;
    fairLaunch = await FairLaunch.deploy(
      alpacaToken.address, (await dev.getAddress()), ALPACA_REWARD_PER_BLOCK, 0, ALPACA_BONUS_LOCK_UP_BPS, 0
    )
    await fairLaunch.deployed();

    await alpacaToken.transferOwnership(fairLaunch.address);

    stakingTokens = new Array();
    const MockERC20 = (await ethers.getContractFactory(
      "MockERC20",
      deployer
    )) as MockERC20__factory;
    for(let i = 0; i < 4; i++) {
      const mockERC20 = await upgrades.deployProxy(MockERC20, [`STOKEN${i}`, `STOKEN${i}`]) as MockERC20;
      await mockERC20.deployed();
      stakingTokens.push(mockERC20);
    }

    // Create fairLaunchLink token
    fairLaunchLink = await upgrades.deployProxy(MockERC20, ['fairLaunchLink', 'fairLaunchLink']) as MockERC20
    await fairLaunchLink.deployed();

    // Deploy FairLaunchV2
    const FairLaunchV2 = (await ethers.getContractFactory(
      "FairLaunchV2",
      deployer
    )) as FairLaunchV2__factory;
    fairLaunchV2 = await FairLaunchV2.deploy(
      fairLaunch.address, alpacaToken.address, 1
    )
    await fairLaunch.deployed();

    alpacaTokenAsAlice = AlpacaToken__factory.connect(alpacaToken.address, alice);
    alpacaTokenAsBob = AlpacaToken__factory.connect(alpacaToken.address, bob);
    alpacaTokenAsDev = AlpacaToken__factory.connect(alpacaToken.address, dev);

    stoken0AsDeployer = MockERC20__factory.connect(stakingTokens[0].address, deployer);
    stoken0AsAlice = MockERC20__factory.connect(stakingTokens[0].address, alice);
    stoken0AsBob = MockERC20__factory.connect(stakingTokens[0].address, bob);
    stoken0AsDev = MockERC20__factory.connect(stakingTokens[0].address, dev);

    stoken1AsDeployer = MockERC20__factory.connect(stakingTokens[1].address, deployer);
    stoken1AsAlice = MockERC20__factory.connect(stakingTokens[1].address, alice);
    stoken1AsBob = MockERC20__factory.connect(stakingTokens[1].address, bob);
    stoken1AsDev = MockERC20__factory.connect(stakingTokens[1].address, dev);

    fairLaunchAsDeployer = FairLaunch__factory.connect(fairLaunch.address, deployer);
    fairLaunchAsAlice = FairLaunch__factory.connect(fairLaunch.address, alice);
    fairLaunchAsBob = FairLaunch__factory.connect(fairLaunch.address, bob);
    fairLaunchAsDev = FairLaunch__factory.connect(fairLaunch.address, dev);

    fairLaunchV2AsDeployer = FairLaunchV2__factory.connect(fairLaunchV2.address, deployer);
    fairLaunchV2AsAlice = FairLaunchV2__factory.connect(fairLaunchV2.address, alice);
    fairLaunchV2AsBob = FairLaunchV2__factory.connect(fairLaunchV2.address, bob);
    fairLaunchV2AsDev = FairLaunchV2__factory.connect(fairLaunchV2.address, dev);

  });

  context('when already init', async() => {
    it('should work', async() => {
      // add dummyToken to fairLaunchV1
      await fairLaunch.addPool(0, stakingTokens[0].address, false);
      await fairLaunch.addPool(1, fairLaunchLink.address, false);

      // mint fairLaunchLink token for deployer
      await fairLaunchLink.mint(await deployer.getAddress(), ethers.utils.parseEther('1'));

      // Initialized fairLaunchV2
      await fairLaunchLink.approve(fairLaunchV2.address, ethers.utils.parseEther('1'));
      await fairLaunchV2.init(fairLaunchLink.address);

      expect(await fairLaunchLink.balanceOf(await deployer.getAddress())).to.be.eq('0');
    })
  })

  context('when adjust params', async() => {
    it('should add new pool', async() => {
      // add dummyToken to fairLaunchV1
      await fairLaunch.addPool(0, stakingTokens[0].address, false);
      await fairLaunch.addPool(1, fairLaunchLink.address, false);

      // mint fairLaunchLink token for deployer
      await fairLaunchLink.mint(await deployer.getAddress(), ethers.utils.parseEther('1'));

      // Initialized fairLaunchV2
      await fairLaunchLink.approve(fairLaunchV2.address, ethers.utils.parseEther('1'));
      await fairLaunchV2.init(fairLaunchLink.address);

      for(let i = 0; i < stakingTokens.length; i++) {
        await fairLaunchV2.addPool(1, stakingTokens[i].address, ADDRESS0, 0)
      }
      expect(await fairLaunchV2.poolLength()).to.eq(stakingTokens.length);
    });

    it('should revert when the stakeToken is already added to the pool', async() => {
      // add dummyToken to fairLaunchV1
      await fairLaunch.addPool(0, stakingTokens[0].address, false);
      await fairLaunch.addPool(1, fairLaunchLink.address, false);

      // mint fairLaunchLink token for deployer
      await fairLaunchLink.mint(await deployer.getAddress(), ethers.utils.parseEther('1'));

      // Initialized fairLaunchV2
      await fairLaunchLink.approve(fairLaunchV2.address, ethers.utils.parseEther('1'));
      await fairLaunchV2.init(fairLaunchLink.address);

      for(let i = 0; i < stakingTokens.length; i++) {
        await fairLaunchV2.addPool(1, stakingTokens[i].address, ADDRESS0, 0)
      }
      expect(await fairLaunchV2.poolLength()).to.eq(stakingTokens.length);

      await expect(fairLaunchV2.addPool(1, stakingTokens[0].address, ADDRESS0, 0))
        .to.be.revertedWith("FairLaunchV2::addPool:: stakeToken dup");
    });
  });

  context('when use pool', async() => {
    it('should revert when that pool is not existed', async() => {
      // add dummyToken to fairLaunchV1
      await fairLaunch.addPool(0, stakingTokens[0].address, false);
      await fairLaunch.addPool(1, fairLaunchLink.address, false);

      // mint fairLaunchLink token for deployer
      await fairLaunchLink.mint(await deployer.getAddress(), ethers.utils.parseEther('1'));

      // Initialized fairLaunchV2
      await fairLaunchLink.approve(fairLaunchV2.address, ethers.utils.parseEther('1'));
      await fairLaunchV2.init(fairLaunchLink.address);

      await expect(fairLaunchV2.deposit((await deployer.getAddress()), 88, ethers.utils.parseEther('100'),
        { from: (await deployer.getAddress()) } as Overrides)).to.be.reverted;
    });

    it('should revert when withdrawer is not a funder', async () => {
      // add dummyToken to fairLaunchV1
      await fairLaunch.addPool(0, stakingTokens[0].address, false);
      await fairLaunch.addPool(1, fairLaunchLink.address, false);

      // mint fairLaunchLink token for deployer
      await fairLaunchLink.mint(await deployer.getAddress(), ethers.utils.parseEther('1'));

      // Initialized fairLaunchV2
      await fairLaunchLink.approve(fairLaunchV2.address, ethers.utils.parseEther('1'));
      await fairLaunchV2.init(fairLaunchLink.address);

      // 1. Mint STOKEN0 for staking
      await stoken0AsDeployer.mint((await alice.getAddress()), ethers.utils.parseEther('400'));

      // 2. Add STOKEN0 to the fairLaunch pool
      await fairLaunchV2AsDeployer.addPool(1, stakingTokens[0].address, ADDRESS0, 0);

      // 3. Deposit STOKEN0 to the STOKEN0 pool
      await stoken0AsAlice.approve(fairLaunchV2.address, ethers.utils.parseEther('100'));
      await fairLaunchV2AsAlice.deposit((await bob.getAddress()), 0, ethers.utils.parseEther('100'));

      // 4. Bob try to withdraw from the pool
      // Bob shuoldn't do that, he can get yield but not the underlaying
      await expect(fairLaunchV2AsBob.withdraw(await bob.getAddress(), 0, ethers.utils.parseEther('100'))).to.be.revertedWith("FairLaunchV2::withdraw:: only funder");
    });

    it('should allow deposit when funder withdrew funds and owner want to stake his own token', async () => {
      // add dummyToken to fairLaunchV1
      await fairLaunch.addPool(0, stakingTokens[0].address, false);
      await fairLaunch.addPool(1, fairLaunchLink.address, false);

      // mint fairLaunchLink token for deployer
      await fairLaunchLink.mint(await deployer.getAddress(), ethers.utils.parseEther('1'));

      // Initialized fairLaunchV2
      await fairLaunchLink.approve(fairLaunchV2.address, ethers.utils.parseEther('1'));
      await fairLaunchV2.init(fairLaunchLink.address);

      // 1. Mint STOKEN0 for staking
      await stoken0AsDeployer.mint(await alice.getAddress(), ethers.utils.parseEther('400'));
      await stoken0AsDeployer.mint(await bob.getAddress(), ethers.utils.parseEther('100'));

      // 2. Add STOKEN0 to the fairLaunch pool
      await fairLaunchV2AsDeployer.addPool(1, stakingTokens[0].address, ADDRESS0, 0);

      // 3. Deposit STOKEN0 to the STOKEN0 pool
      await stoken0AsAlice.approve(fairLaunchV2.address, ethers.utils.parseEther('100'));
      await fairLaunchV2AsAlice.deposit((await bob.getAddress()), 0, ethers.utils.parseEther('100'));

      // 4. Bob harvest the yield
      let bobAlpacaBalanceBefore = await alpacaToken.balanceOf(await bob.getAddress());
      await fairLaunchV2AsBob.harvest(0);
      expect(await alpacaToken.balanceOf(await bob.getAddress())).to.be.gt(bobAlpacaBalanceBefore);

      // 5. Bob try to withdraw from the pool
      // Bob shuoldn't do that, he can get yield but not the underlaying
      await expect(fairLaunchV2AsBob.withdraw(await bob.getAddress(), 0, ethers.utils.parseEther('100'))).to.be.revertedWith("FairLaunchV2::withdraw:: only funder");

      // 6. Alice withdraw her STOKEN0 that staked on behalf of BOB
      await fairLaunchV2AsAlice.withdraw((await bob.getAddress()), 0, ethers.utils.parseEther('100'));

      // 7. Bob deposit his STOKN0 to FairLaunch
      await stoken0AsBob.approve(fairLaunchV2.address, ethers.utils.parseEther('100'));
      await fairLaunchV2AsBob.deposit(await bob.getAddress(), 0, ethers.utils.parseEther('100'));
    });

    it('should revert when funder partially withdraw the funds, then user try to withdraw funds', async () => {
      // add dummyToken to fairLaunchV1
      await fairLaunch.addPool(0, stakingTokens[0].address, false);
      await fairLaunch.addPool(1, fairLaunchLink.address, false);

      // mint fairLaunchLink token for deployer
      await fairLaunchLink.mint(await deployer.getAddress(), ethers.utils.parseEther('1'));

      // Initialized fairLaunchV2
      await fairLaunchLink.approve(fairLaunchV2.address, ethers.utils.parseEther('1'));
      await fairLaunchV2.init(fairLaunchLink.address);

      // 1. Mint STOKEN0 for staking
      await stoken0AsDeployer.mint((await alice.getAddress()), ethers.utils.parseEther('400'));
      await stoken0AsDeployer.mint((await dev.getAddress()), ethers.utils.parseEther('100'));

      // 2. Add STOKEN0 to the fairLaunch pool
      await fairLaunchV2AsDeployer.addPool(1, stakingTokens[0].address, ADDRESS0, 0);

      // 3. Deposit STOKEN0 to the STOKEN0 pool
      await stoken0AsAlice.approve(fairLaunchV2.address, ethers.utils.parseEther('100'));
      await fairLaunchV2AsAlice.deposit((await bob.getAddress()), 0, ethers.utils.parseEther('100'));

      // 4. Alice withdraw some from FLV2
      await fairLaunchV2AsAlice.withdraw(await bob.getAddress(), 0, ethers.utils.parseEther("50"));

      // 5. Expect to be revert with Bob try to withdraw the funds
      await expect(fairLaunchV2AsBob.withdraw((await bob.getAddress()), 0, ethers.utils.parseEther('1'))).to.be.revertedWith('FairLaunchV2::withdraw:: only funder');
    });

    it('should give the correct withdraw amount back to funder if funder withdraw', async() => {
      // add dummyToken to fairLaunchV1
      await fairLaunch.addPool(0, stakingTokens[0].address, false);
      await fairLaunch.addPool(1, fairLaunchLink.address, false);

      // mint fairLaunchLink token for deployer
      await fairLaunchLink.mint(await deployer.getAddress(), ethers.utils.parseEther('1'));

      // Initialized fairLaunchV2
      await fairLaunchLink.approve(fairLaunchV2.address, ethers.utils.parseEther('1'));
      await fairLaunchV2.init(fairLaunchLink.address);

      // 1. Mint STOKEN0 for staking
      await stoken0AsDeployer.mint((await alice.getAddress()), ethers.utils.parseEther('400'));
      await stoken0AsDeployer.mint((await dev.getAddress()), ethers.utils.parseEther('100'));

      // 2. Add STOKEN0 to the fairLaunch pool
      await fairLaunchV2AsDeployer.addPool(1, stakingTokens[0].address, ADDRESS0, 0);

      // 3. Deposit STOKEN0 to the STOKEN0 pool
      await stoken0AsAlice.approve(fairLaunchV2.address, ethers.utils.parseEther('100'));
      await fairLaunchV2AsAlice.deposit((await bob.getAddress()), 0, ethers.utils.parseEther('100'));

      // 4. Alice withdraw some from FLV2
      await fairLaunchV2AsAlice.withdraw(await bob.getAddress(), 0, ethers.utils.parseEther("50"));

      // 5. Expect to Alice STOKEN0 will be 400-100+50=350
      expect(await stoken0AsBob.balanceOf(await alice.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('350'));
    });

    it('should revert when non funder try to emergencyWithdraw from FLV2', async () => {
      // add dummyToken to fairLaunchV1
      await fairLaunch.addPool(0, stakingTokens[0].address, false);
      await fairLaunch.addPool(1, fairLaunchLink.address, false);

      // mint fairLaunchLink token for deployer
      await fairLaunchLink.mint(await deployer.getAddress(), ethers.utils.parseEther('1'));

      // Initialized fairLaunchV2
      await fairLaunchLink.approve(fairLaunchV2.address, ethers.utils.parseEther('1'));
      await fairLaunchV2.init(fairLaunchLink.address);

      // 1. Mint STOKEN0 for staking
      await stoken0AsDeployer.mint((await alice.getAddress()), ethers.utils.parseEther('400'));
      await stoken0AsDeployer.mint((await dev.getAddress()), ethers.utils.parseEther('100'));

      // 2. Add STOKEN0 to the fairLaunch pool
      await fairLaunchV2AsDeployer.addPool(1, stakingTokens[0].address, ADDRESS0, 0);

      // 3. Deposit STOKEN0 to the STOKEN0 pool
      await stoken0AsAlice.approve(fairLaunchV2.address, ethers.utils.parseEther('100'));
      await fairLaunchV2AsAlice.deposit((await bob.getAddress()), 0, ethers.utils.parseEther('100'));

      await expect(fairLaunchV2AsBob.emergencyWithdraw(0, await bob.getAddress())).to.be.revertedWith('FairLaunchV2::emergencyWithdraw:: only funder')
    })

    it('should revert when 2 accounts try to fund the same user', async () => {
      // add dummyToken to fairLaunchV1
      await fairLaunch.addPool(0, stakingTokens[0].address, false);
      await fairLaunch.addPool(1, fairLaunchLink.address, false);

      // mint fairLaunchLink token for deployer
      await fairLaunchLink.mint(await deployer.getAddress(), ethers.utils.parseEther('1'));

      // Initialized fairLaunchV2
      await fairLaunchLink.approve(fairLaunchV2.address, ethers.utils.parseEther('1'));
      await fairLaunchV2.init(fairLaunchLink.address);

      // 1. Mint STOKEN0 for staking
      await stoken0AsDeployer.mint((await alice.getAddress()), ethers.utils.parseEther('400'));
      await stoken0AsDeployer.mint((await dev.getAddress()), ethers.utils.parseEther('100'));

      // 2. Add STOKEN0 to the fairLaunch pool
      await fairLaunchV2AsDeployer.addPool(1, stakingTokens[0].address, ADDRESS0, 0);

      // 3. Deposit STOKEN0 to the STOKEN0 pool
      await stoken0AsAlice.approve(fairLaunchV2.address, ethers.utils.parseEther('100'));
      await fairLaunchV2AsAlice.deposit((await bob.getAddress()), 0, ethers.utils.parseEther('100'));

      // 4. Dev try to deposit to the pool on the bahalf of Bob
      // Dev should get revert tx as this will fuck up the tracking
      await stoken0AsDev.approve(fairLaunchV2.address, ethers.utils.parseEther("100"));
      await expect(fairLaunchV2AsDev.deposit((await bob.getAddress()), 0, ethers.utils.parseEther('1'))).to.be.revertedWith('FairLaunchV2::deposit:: bad sof');
    });

    it('should harvest yield from the position opened by funder', async () => {
      // add dummyToken to fairLaunchV1
      await fairLaunch.addPool(0, stakingTokens[0].address, false);
      await fairLaunch.addPool(1, fairLaunchLink.address, false);

      // mint fairLaunchLink token for deployer
      await fairLaunchLink.mint(await deployer.getAddress(), ethers.utils.parseEther('1'));

      // Initialized fairLaunchV2
      await fairLaunchLink.approve(fairLaunchV2.address, ethers.utils.parseEther('1'));
      await fairLaunchV2.init(fairLaunchLink.address);

      // 1. Mint STOKEN0 for staking
      await stoken0AsDeployer.mint((await alice.getAddress()), ethers.utils.parseEther('400'));

      // 2. Add STOKEN0 to the fairLaunch pool
      await fairLaunchV2AsDeployer.addPool(1, stakingTokens[0].address, ADDRESS0, 0);

      // 3. Deposit STOKEN0 to the STOKEN0 pool
      await stoken0AsAlice.approve(fairLaunchV2.address, ethers.utils.parseEther('100'));
      await fairLaunchV2AsAlice.deposit((await bob.getAddress()), 0, ethers.utils.parseEther('100'));

      // 4. Move 1 Block so there is some pending
      await fairLaunchV2AsDeployer.updatePool(0);
      expect(await fairLaunchV2AsBob.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5000'));

      // 5. Harvest all yield
      await fairLaunchV2AsBob.harvest(0);
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('10000'));
    });

    it('should distribute rewards according to the alloc point', async() => {
      // add dummyToken to fairLaunchV1
      await fairLaunch.addPool(0, stakingTokens[0].address, false);
      await fairLaunch.addPool(1, fairLaunchLink.address, false);

      // mint fairLaunchLink token for deployer
      await fairLaunchLink.mint(await deployer.getAddress(), ethers.utils.parseEther('1'));

      // Initialized fairLaunchV2
      await fairLaunchLink.approve(fairLaunchV2.address, ethers.utils.parseEther('1'));
      await fairLaunchV2.init(fairLaunchLink.address);

      // 1. Mint STOKEN0 and STOKEN1 for staking
      await stoken0AsDeployer.mint((await alice.getAddress()), ethers.utils.parseEther('100'));
      await stoken1AsDeployer.mint((await alice.getAddress()), ethers.utils.parseEther('50'));

      // 2. Add STOKEN0 to the fairLaunch pool
      await fairLaunchV2AsDeployer.addPool(50, stakingTokens[0].address, ADDRESS0, 0);
      await fairLaunchV2AsDeployer.addPool(50, stakingTokens[1].address, ADDRESS0, 0);

      // 3. Deposit STOKEN0 to the STOKEN0 pool
      await stoken0AsAlice.approve(fairLaunchV2.address, ethers.utils.parseEther('100'));
      await fairLaunchV2AsAlice.deposit(await alice.getAddress(), 0, ethers.utils.parseEther('100'));

      // 4. Deposit STOKEN1 to the STOKEN1 pool
      await stoken1AsAlice.approve(fairLaunchV2.address, ethers.utils.parseEther('50'));
      await fairLaunchV2AsAlice.deposit(await alice.getAddress(), 1, ethers.utils.parseEther('50'));

      // 5. Move 1 Block so there is some pending
      await fairLaunchV2AsDeployer.massUpdatePools([0, 1]);

      expect(await fairLaunchV2.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('7500'));
      expect(await fairLaunchV2.pendingAlpaca(1, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('2500'));

      // 6. Harvest all yield of pId 0
      // should get 7,500 ALPACAs from pId 0
      await fairLaunchV2AsAlice.harvest(0);
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('10000'));

      // 7. Harvest all yield of pId 1
      // should get 5,000 ALPACAs from pId 1
      await fairLaunchV2AsAlice.harvest(1);
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('17500'));
    })

    it('should work', async() => {
      // add dummyToken to fairLaunchV1
      await fairLaunch.addPool(0, stakingTokens[0].address, false);
      await fairLaunch.addPool(1, fairLaunchLink.address, false);

      // mint fairLaunchLink token for deployer
      await fairLaunchLink.mint(await deployer.getAddress(), ethers.utils.parseEther('1'));

      // Initialized fairLaunchV2
      await fairLaunchLink.approve(fairLaunchV2.address, ethers.utils.parseEther('1'));
      await fairLaunchV2.init(fairLaunchLink.address);

      // 1. Mint STOKEN0 for staking
      await stoken0AsDeployer.mint((await alice.getAddress()), ethers.utils.parseEther('400'));
      await stoken0AsDeployer.mint((await bob.getAddress()), ethers.utils.parseEther('100'));

      // 2. Add STOKEN0 to the fairLaunchV2 pool
      await fairLaunchV2AsDeployer.addPool(1, stakingTokens[0].address, ADDRESS0, 0);

      // 3. Deposit STOKEN0 to the STOKEN0 pool
      await stoken0AsAlice.approve(fairLaunchV2.address, ethers.utils.parseEther('100'));
      await fairLaunchV2AsAlice.deposit((await alice.getAddress()), 0, ethers.utils.parseEther('100'));

      // 4. Trigger random update pool to make 1 more block mine
      await fairLaunchV2.massUpdatePools([0]);

      // 5. Check pendingAlpaca for Alice
      expect(await fairLaunchV2.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5000'));

      // 6. Trigger random update pool to make 1 more block mine
      await fairLaunchV2AsAlice.massUpdatePools([0]);

      // 7. Check pendingAlpaca for Alice
      expect(await fairLaunchV2.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('10000'));

      // 8. Alice should get 15,000 ALPACAs when she harvest
      // also check that dev got his tax
      // PS. Dev get 4,000 as MASTER_POOL was added 8 blocks earlier
      await fairLaunchV2AsAlice.harvest(0);
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('15000'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('4000'));

      // 9. Bob come in and join the party
      // 2 blocks are mined here, hence Alice should get 10,000 ALPACAs more
      await stoken0AsBob.approve(fairLaunchV2.address, ethers.utils.parseEther('100'));
      await fairLaunchV2AsBob.deposit((await bob.getAddress()), 0, ethers.utils.parseEther('100'));

      expect(await fairLaunchV2.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('10000'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5000'));

      // 10. Trigger random update pool to make 1 more block mine
      await fairLaunchV2.massUpdatePools([0]);

      // 11. Check pendingAlpaca
      // Reward per Block must now share amoung Bob and Alice (50-50)
      // Alice should has 12,500 ALPACAs (10,000 + 2,500)
      // Bob should has 2,500 ALPACAs
      // Dev get 10% tax per block (5,000*0.1 = 500/block)
      expect(await fairLaunchV2.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('12500'));
      expect(await fairLaunchV2.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('2500'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5500'));

      // 12. Trigger random update pool to make 1 more block mine
      await fairLaunchV2AsAlice.massUpdatePools([0]);

      // 13. Check pendingAlpaca
      // Reward per Block must now share amoung Bob and Alice (50-50)
      // Alice should has 15,000 ALPACAs (12,500 + 2,500)
      // Bob should has 5,000 ALPACAs (2,500 + 2,500)
      // Dev get 10% tax per block (5,000*0.1 = 500/block)
      expect(await fairLaunchV2.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('15000'));
      expect(await fairLaunchV2.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5000'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('6000'));

      // 14. Bob harvest his yield
      // Reward per Block is till (50-50) as Bob is not leaving the pool yet
      // Alice should has 17,500 ALPACAs (15,000 + 2,500) in pending
      // Bob should has 7,500 ALPACAs (5,000 + 2,500) in his account as he harvest it
      // Dev get 10% tax per block (5,000*0.1 = 500/block)
      await fairLaunchV2AsBob.harvest(0);

      expect(await fairLaunchV2.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('17500'));
      expect(await fairLaunchV2.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('7500'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('6500'));

      // 15. Alice wants more ALPACAs so she deposit 140 STOKEN0 more
      await stoken0AsAlice.approve(fairLaunchV2.address, ethers.utils.parseEther('300'));
      await fairLaunchV2AsAlice.deposit((await alice.getAddress()), 0, ethers.utils.parseEther('300'));

      // Alice deposit to the same pool as she already has some STOKEN0 in it
      // Hence, Alice will get auto-harvest
      // Alice should get 22,500 ALPACAs (17,500 + 2,500 [B1] + 2,500 [B2]) in pending Alpaca
      // Hence, Alice should has 15,000 + 20,000 = 35,000 ALPACAs in her account and 0 pending as she harvested
      // Bob should has (2,500 [B1] + 2,500 [B2]) = 5,000 ALPACAs in pending
      expect(await fairLaunchV2.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('22500'));
      expect(await fairLaunchV2.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5000'));
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('15000'));
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('7500'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('7500'));

      // 16. Trigger random update pool to make 1 more block mine
      await fairLaunchV2AsAlice.massUpdatePools([0]);

      // 1 more block is mined, now Alice shold get 80% and Bob should get 20% of rewards
      // How many STOKEN0 needed to make Alice get 80%: find n from 100n/(100n+100) = 0.8
      // Hence, Alice should get 0 + 4,000 = 4,000 ALPACAs in pending
      // Bob should get 5,000 + 1,000 = 6,000 ALPACAs in pending
      expect(await fairLaunchV2.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('26500'));
      expect(await fairLaunchV2.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('6000'));
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('15000'));
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('7500'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('8000'));
    });

    it('should work when there is a locker', async() => {
      // add dummyToken to fairLaunchV1
      await fairLaunch.addPool(0, stakingTokens[0].address, false);
      await fairLaunch.addPool(1, fairLaunchLink.address, false);

      // mint fairLaunchLink token for deployer
      await fairLaunchLink.mint(await deployer.getAddress(), ethers.utils.parseEther('1'));

      // Initialized fairLaunchV2
      await fairLaunchLink.approve(fairLaunchV2.address, ethers.utils.parseEther('1'));
      await fairLaunchV2.init(fairLaunchLink.address);

      // 1. Mint STOKEN0 for staking
      await stoken0AsDeployer.mint((await alice.getAddress()), ethers.utils.parseEther('400'));
      await stoken0AsDeployer.mint((await bob.getAddress()), ethers.utils.parseEther('100'));

      // 2. Deploy LinearRelease Locker
      const startReleaseBlock = (await TimeHelpers.latestBlockNumber()).add(12)
      const endReleaseBlock = startReleaseBlock.add(5);
      const LinearRelease = (await ethers.getContractFactory(
        'LinearRelease', deployer
      )) as LinearRelease__factory
      const linearRelease = await LinearRelease.deploy(
        alpacaToken.address, '7000', fairLaunchV2.address, startReleaseBlock, endReleaseBlock) as LinearRelease

      const linearReleaseAsAlice = LinearRelease__factory.connect(linearRelease.address, alice);
      const linearReleaseAsBob = LinearRelease__factory.connect(linearRelease.address, bob);

      // 3. Add STOKEN0 to the fairLaunchV2 pool
      await fairLaunchV2AsDeployer.addPool(1, stakingTokens[0].address, linearRelease.address, 0);

      // 4. Deposit STOKEN0 to the STOKEN0 pool
      await stoken0AsAlice.approve(fairLaunchV2.address, ethers.utils.parseEther('100'));
      await fairLaunchV2AsAlice.deposit((await alice.getAddress()), 0, ethers.utils.parseEther('100'));

      // 5. Trigger random update pool to make 1 more block mine
      await fairLaunchV2.massUpdatePools([0]);

      // 6. Check pendingAlpaca for Alice
      expect(await fairLaunchV2.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5000'));

      // 7. Trigger random update pool to make 1 more block mine
      await fairLaunchV2AsAlice.massUpdatePools([0]);

      // 8. Check pendingAlpaca for Alice
      expect(await fairLaunchV2.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('10000'));

      // 9. Alice should get 15,000 * (1-0.7) = 4,500 ALPACAs when she harvest
      // also check that dev got his tax
      // PS. Dev get 4,500 as MASTER_POOL was added 9 blocks earlier
      await fairLaunchV2AsAlice.harvest(0);
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('4500'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('4500'));
      expect(await linearRelease.lockOf(await alice.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('10500'));

      // 9. Bob come in and join the party
      // 2 blocks are mined here, hence Alice should get 10,000 ALPACAs more
      await stoken0AsBob.approve(fairLaunchV2.address, ethers.utils.parseEther('100'));
      await fairLaunchV2AsBob.deposit((await bob.getAddress()), 0, ethers.utils.parseEther('100'));

      expect(await fairLaunchV2.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('10000'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5500'));

      // 10. Trigger random update pool to make 1 more block mine
      await fairLaunchV2.massUpdatePools([0]);

      // 11. Check pendingAlpaca
      // Reward per Block must now share amoung Bob and Alice (50-50)
      // Alice should has 12,500 ALPACAs (10,000 + 2,500)
      // Bob should has 2,500 ALPACAs
      // Dev get 10% tax per block (5,000*0.1 = 500/block)
      expect(await fairLaunchV2.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('12500'));
      expect(await fairLaunchV2.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('2500'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('6000'));

      // 12. Trigger random update pool to make 1 more block mine
      await fairLaunchV2AsAlice.massUpdatePools([0]);

      // 13. Check pendingAlpaca
      // Reward per Block must now share amoung Bob and Alice (50-50)
      // Alice should has 15,000 ALPACAs (12,500 + 2,500)
      // Bob should has 5,000 ALPACAs (2,500 + 2,500)
      // Dev get 10% tax per block (5,000*0.1 = 500/block)
      expect(await fairLaunchV2.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('15000'));
      expect(await fairLaunchV2.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5000'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('6500'));

      // 14. Bob harvest his yield
      // Reward per Block is till (50-50) as Bob is not leaving the pool yet
      // Alice should has 17,500 ALPACAs (15,000 + 2,500) in pending
      // Bob should has 7,500 * 0.3 = 2,250 ALPACAs (5,000 + 2,500) in his account as he harvest it
      // Dev get 10% tax per block (5,000*0.1 = 500/block)
      await fairLaunchV2AsBob.harvest(0);

      expect(await fairLaunchV2.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('17500'));
      expect(await fairLaunchV2.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('2250'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('7000'));
      expect(await linearRelease.lockOf(await alice.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('10500'));
      expect(await linearRelease.lockOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('5250'));

      // Make random event
      await fairLaunchV2.massUpdatePools([0]);

      const [, alicePendingRewardsT0] = await linearReleaseAsAlice.pendingTokens(await alice.getAddress());
      const [, bobPendingRewardsT0] = await linearReleaseAsBob.pendingTokens(await bob.getAddress());
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('4500'));
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('2250'));
      expect(alicePendingRewardsT0[0]).to.be.bignumber.eq(ethers.utils.parseEther('2100'));
      expect(bobPendingRewardsT0[0]).to.be.bignumber.eq(ethers.utils.parseEther('1050'));

      await linearReleaseAsAlice.claim()
      const [, alicePendingRewardsT1] = await linearReleaseAsAlice.pendingTokens(await alice.getAddress());
      const [, bobPendingRewardsT1] = await linearReleaseAsBob.pendingTokens(await bob.getAddress());
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('8700'));
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('2250'));
      expect(alicePendingRewardsT1[0]).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      expect(bobPendingRewardsT1[0]).to.be.bignumber.eq(ethers.utils.parseEther('2100'));

      await linearReleaseAsBob.claim()
      const [, alicePendingRewardsT2] = await linearReleaseAsAlice.pendingTokens(await alice.getAddress());
      const [, bobPendingRewardsT2] = await linearReleaseAsBob.pendingTokens(await bob.getAddress());
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('8700'));
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5400'));
      expect(alicePendingRewardsT2[0]).to.be.bignumber.eq(ethers.utils.parseEther('2100'));
      expect(bobPendingRewardsT2[0]).to.be.bignumber.eq(ethers.utils.parseEther('0'));

      await fairLaunchV2.massUpdatePools([0]);
      await fairLaunchV2.massUpdatePools([0]);

      await linearReleaseAsAlice.claim()
      await linearReleaseAsBob.claim()
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('15000'));
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('7500'));
    });
  });

  context('when migrate from FLV1 to FLV2', async() => {
    it('should migrate successfully', async() => {
      // 1. Mint STOKEN0 for staking
      await stoken0AsDeployer.mint((await alice.getAddress()), ethers.utils.parseEther('400'));
      await stoken0AsDeployer.mint((await bob.getAddress()), ethers.utils.parseEther('100'));

      // 2. Add STOKEN0 to the fairLaunch pool
      await fairLaunchAsDeployer.addPool(1, stakingTokens[0].address, false);

      // 3. Alice deposit STOKEN0 to the STOKEN0 pool
      await stoken0AsAlice.approve(fairLaunch.address, ethers.utils.parseEther('100'));
      await fairLaunchAsAlice.deposit((await alice.getAddress()), 0, ethers.utils.parseEther('100'));

      // 4. Trigger random update pool to make 1 more block mine
      await fairLaunch.massUpdatePools();

      // 5. Check pendingAlpaca for Alice
      expect(await fairLaunch.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5000'));

      // 6. Trigger random update pool to make 1 more block mine
      await fairLaunch.massUpdatePools();

      // 7. Check pendingAlpaca for Alice
      expect(await fairLaunch.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('10000'));

      // 8. Alice should get 15,000 ALPACAs when she harvest
      // also check that dev got his tax
      // PS. Dev get 1,500 = as 10% as Alice
      await fairLaunchAsAlice.harvest(0);
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('15000'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('1500'));

      // 9. Bob come in and join the party
      // 2 blocks are mined here, hence Alice should get 10,000 ALPACAs more (2x5,000)
      await stoken0AsBob.approve(fairLaunch.address, ethers.utils.parseEther('100'));
      await fairLaunchAsBob.deposit((await bob.getAddress()), 0, ethers.utils.parseEther('100'));

      expect(await fairLaunch.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('10000'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('2500'));

      // 10. Trigger random update pool to make 1 more block mine
      await fairLaunch.massUpdatePools();

      // 11. Start to migrate FLV1 to FLV2
      // add Link pool to FLV1 first, then turn off all pools on FLV1
      await fairLaunch.addPool(1, fairLaunchLink.address, false);
      await fairLaunch.setPool(0, 0, false);

      // 12. Alice & Bob exit FLV1
      // Alice +10,000+2,500+2,500
      // Bob +2,500+2,500
      await fairLaunchAsAlice.withdraw(await alice.getAddress(), 0, ethers.utils.parseEther('100'));
      await fairLaunchAsBob.withdraw(await bob.getAddress(), 0, ethers.utils.parseEther('100'));
      expect(await alpacaToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('30000'));
      expect(await alpacaToken.balanceOf(await bob.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('5000'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('3500'));

      // 13. Initialized fairLaunchV2
      await fairLaunchLink.mint(await deployer.getAddress(), ethers.utils.parseEther('1'));
      await fairLaunchLink.approve(fairLaunchV2.address, ethers.utils.parseEther('1'));

      // 14. Add STOKEN0 to the fairLaunchV2 pool
      // start at blockNumber + 5 as we want to make sure that Alice & Bob have time to onboard
      const startBlock = (await TimeHelpers.latestBlockNumber()).add(6);
      await fairLaunchV2AsDeployer.addPool(1, stakingTokens[0].address, ADDRESS0, startBlock);

      // 15. Alice & Bob deposit STOKEN0 to the STOKEN0 pool
      await stoken0AsAlice.approve(fairLaunchV2.address, ethers.utils.parseEther('100'));
      await fairLaunchV2AsAlice.deposit((await alice.getAddress()), 0, ethers.utils.parseEther('100'));
      await stoken0AsBob.approve(fairLaunchV2.address, ethers.utils.parseEther('100'));
      await fairLaunchV2AsBob.deposit(await bob.getAddress(), 0, ethers.utils.parseEther('100'));

      // 16. Trigger random update pool to make 1 more block mine
      await fairLaunchV2.massUpdatePools([0]);

      // 17. Check pendingAlpaca for Alice & Bob. Expected to be 0 as pool has no allocPoint yet
      // expect dev token to be the same amount as no alpaca has been mint
      expect(await fairLaunchV2.pendingAlpaca(0, await alice.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      expect(await fairLaunchV2.pendingAlpaca(0, await alice.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      expect(await alpacaToken.balanceOf(await dev.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('3500'));

      await fairLaunchV2.init(fairLaunchLink.address);

      // 18. Set allocPoint to 1 to continue mintting ALPACAs
      // Rewards kick-in here
      await fairLaunch.setPool(1, 1, false);

      // 19. Trigger random update pool to make 1 more block mine
      await fairLaunchV2AsAlice.massUpdatePools([0]);

      // 20. Now Alice and Bob should get some ALPACAs
      // Check pendingAlpaca for Alice & Bob
      expect(await fairLaunchV2.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('7500'));
      expect(await fairLaunchV2.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('7500'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('4500'));

      // 21. Alice should get 10,000 ALPACAs when she harvest
      // also check that dev got his tax
      // PS. Dev get 5,000 as mining continue 2 blocks earlier
      await fairLaunchV2AsAlice.harvest(0);
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('40000'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5000'));
    })
  })
});