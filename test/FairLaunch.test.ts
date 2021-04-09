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
  MockERC20,
  MockERC20__factory
} from "../typechain";

chai.use(solidity);
const { expect } = chai;

describe("FairLaunch", () => {
  const ALPACA_REWARD_PER_BLOCK = ethers.utils.parseEther('5000');
  const ALPACA_BONUS_LOCK_UP_BPS = 7000;

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

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let dev: Signer;

  let alpacaToken: AlpacaToken;
  let fairLaunch: FairLaunch;
  let stakingTokens: MockERC20[];

  beforeEach(async() => {
    [deployer, alice, bob, dev] = await ethers.getSigners();

    // Setup FairLaunch contract
    // Deploy ALPACAs
    const AlpacaToken = (await ethers.getContractFactory(
      "AlpacaToken",
      deployer
    )) as AlpacaToken__factory;
    alpacaToken = await AlpacaToken.deploy(132, 137);
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
    for(let i = 0; i < 4; i++) {
      const MockERC20 = (await ethers.getContractFactory(
        "MockERC20",
        deployer
      )) as MockERC20__factory;
      const mockERC20 = await upgrades.deployProxy(MockERC20, [`STOKEN${i}`, `STOKEN${i}`]) as MockERC20;
      await mockERC20.deployed();
      stakingTokens.push(mockERC20);
    }

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
  });

  context('when adjust params', async() => {
    it('should add new pool', async() => {
      for(let i = 0; i < stakingTokens.length; i++) {
        await fairLaunch.addPool(1, stakingTokens[i].address, false,
          { from: (await deployer.getAddress()) } as Overrides)
      }
      expect(await fairLaunch.poolLength()).to.eq(stakingTokens.length);
    });

    it('should revert when the stakeToken is already added to the pool', async() => {
      for(let i = 0; i < stakingTokens.length; i++) {
        await fairLaunch.addPool(1, stakingTokens[i].address, false,
          { from: (await deployer.getAddress()) } as Overrides)
      }
      expect(await fairLaunch.poolLength()).to.eq(stakingTokens.length);

      await expect(fairLaunch.addPool(1, stakingTokens[0].address, false,
          { from: (await deployer.getAddress()) } as Overrides)).to.be.revertedWith("add: stakeToken dup");
    });
  });

  context('when use pool', async() => {
    it('should revert when there is nothing to be harvested', async() => {
      await fairLaunch.addPool(1, stakingTokens[0].address.toString(), false,
        { from: (await deployer.getAddress()) } as Overrides);
      await expect(fairLaunch.harvest(0,
        { from: (await deployer.getAddress()) } as Overrides)).to.be.revertedWith("nothing to harvest");
    });

    it('should revert when that pool is not existed', async() => {
      await expect(fairLaunch.deposit((await deployer.getAddress()), 88, ethers.utils.parseEther('100'),
        { from: (await deployer.getAddress()) } as Overrides)).to.be.reverted;
    });

    it('should revert when withdrawer is not a funder', async () => {
      // 1. Mint STOKEN0 for staking
      await stoken0AsDeployer.mint((await alice.getAddress()), ethers.utils.parseEther('400'));

      // 2. Add STOKEN0 to the fairLaunch pool
      await fairLaunchAsDeployer.addPool(1, stakingTokens[0].address, false);

      // 3. Deposit STOKEN0 to the STOKEN0 pool
      await stoken0AsAlice.approve(fairLaunch.address, ethers.utils.parseEther('100'));
      await fairLaunchAsAlice.deposit((await bob.getAddress()), 0, ethers.utils.parseEther('100'));

      // 4. Bob try to withdraw from the pool
      // Bob shuoldn't do that, he can get yield but not the underlaying
      await expect(fairLaunchAsBob.withdrawAll((await bob.getAddress()), 0)).to.be.revertedWith("only funder");
    });

    it('should revert when 2 accounts try to fund the same user', async () => {
      // 1. Mint STOKEN0 for staking
      await stoken0AsDeployer.mint((await alice.getAddress()), ethers.utils.parseEther('400'));
      await stoken0AsDeployer.mint((await dev.getAddress()), ethers.utils.parseEther('100'));

      // 2. Add STOKEN0 to the fairLaunch pool
      await fairLaunchAsDeployer.addPool(1, stakingTokens[0].address, false);

      // 3. Deposit STOKEN0 to the STOKEN0 pool
      await stoken0AsAlice.approve(fairLaunch.address, ethers.utils.parseEther('100'));
      await fairLaunchAsAlice.deposit((await bob.getAddress()), 0, ethers.utils.parseEther('100'));

      // 4. Dev try to deposit to the pool on the bahalf of Bob
      // Dev should get revert tx as this will fuck up the tracking
      await stoken0AsDev.approve(fairLaunch.address, ethers.utils.parseEther("100"));
      await expect(fairLaunchAsDev.deposit((await bob.getAddress()), 0, ethers.utils.parseEther('1'))).to.be.revertedWith('bad sof');
    });

    it('should harvest yield from the position opened by funder', async () => {
      // 1. Mint STOKEN0 for staking
      await stoken0AsDeployer.mint((await alice.getAddress()), ethers.utils.parseEther('400'));

      // 2. Add STOKEN0 to the fairLaunch pool
      await fairLaunchAsDeployer.addPool(1, stakingTokens[0].address, false);

      // 3. Deposit STOKEN0 to the STOKEN0 pool
      await stoken0AsAlice.approve(fairLaunch.address, ethers.utils.parseEther('100'));
      await fairLaunchAsAlice.deposit((await bob.getAddress()), 0, ethers.utils.parseEther('100'));

      // 4. Move 1 Block so there is some pending
      await fairLaunchAsDeployer.massUpdatePools();
      expect(await fairLaunchAsBob.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5000'));

      // 5. Harvest all yield
      await fairLaunchAsBob.harvest(0);

      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('10000'));
    });

    it('should distribute rewards according to the alloc point', async() => {
      // 1. Mint STOKEN0 and STOKEN1 for staking
      await stoken0AsDeployer.mint((await alice.getAddress()), ethers.utils.parseEther('100'));
      await stoken1AsDeployer.mint((await alice.getAddress()), ethers.utils.parseEther('50'));

      // 2. Add STOKEN0 to the fairLaunch pool
      await fairLaunchAsDeployer.addPool(50, stakingTokens[0].address, false);
      await fairLaunchAsDeployer.addPool(50, stakingTokens[1].address, false);

      // 3. Deposit STOKEN0 to the STOKEN0 pool
      await stoken0AsAlice.approve(fairLaunch.address, ethers.utils.parseEther('100'));
      await fairLaunchAsAlice.deposit((await alice.getAddress()), 0, ethers.utils.parseEther('100'));

      // 4. Deposit STOKEN1 to the STOKEN1 pool
      await stoken1AsAlice.approve(fairLaunch.address, ethers.utils.parseEther('50'));
      await fairLaunchAsAlice.deposit((await alice.getAddress()), 1, ethers.utils.parseEther('50'));

      // 4. Move 1 Block so there is some pending
      await fairLaunchAsDeployer.massUpdatePools();

      expect(await fairLaunch.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('7500'));
      expect(await fairLaunch.pendingAlpaca(1, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('2500'));

      // 5. Harvest all yield
      await fairLaunchAsAlice.harvest(0);
      await fairLaunchAsAlice.harvest(1);

      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('17500'));
    })

    it('should work', async() => {
      // 1. Mint STOKEN0 for staking
      await stoken0AsDeployer.mint((await alice.getAddress()), ethers.utils.parseEther('400'));
      await stoken0AsDeployer.mint((await bob.getAddress()), ethers.utils.parseEther('100'));

      // 2. Add STOKEN0 to the fairLaunch pool
      await fairLaunchAsDeployer.addPool(1, stakingTokens[0].address, false);

      // 3. Deposit STOKEN0 to the STOKEN0 pool
      await stoken0AsAlice.approve(fairLaunch.address, ethers.utils.parseEther('100'));
      await fairLaunchAsAlice.deposit((await alice.getAddress()), 0, ethers.utils.parseEther('100'));

      // 4. Trigger random update pool to make 1 more block mine
      await fairLaunchAsAlice.massUpdatePools();

      // 5. Check pendingAlpaca for Alice
      expect(await fairLaunch.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5000'));

      // 6. Trigger random update pool to make 1 more block mine
      await fairLaunchAsAlice.massUpdatePools();

      // 7. Check pendingAlpaca for Alice
      expect(await fairLaunch.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('10000'));

      // 8. Alice should get 15,000 ALPACAs when she harvest
      // also check that dev got his tax
      await fairLaunchAsAlice.harvest(0);
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('15000'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('1500'));

      // 9. Bob come in and join the party
      // 2 blocks are mined here, hence Alice should get 10,000 ALPACAs more
      await stoken0AsBob.approve(fairLaunch.address, ethers.utils.parseEther('100'));
      await fairLaunchAsBob.deposit((await bob.getAddress()), 0, ethers.utils.parseEther('100'));

      expect(await fairLaunch.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('10000'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('2500'));

      // 10. Trigger random update pool to make 1 more block mine
      await fairLaunch.massUpdatePools();

      // 11. Check pendingAlpaca
      // Reward per Block must now share amoung Bob and Alice (50-50)
      // Alice should has 12,500 ALPACAs (10,000 + 2,500)
      // Bob should has 2,500 ALPACAs
      // Dev get 10% tax per block (5,000*0.1 = 500/block)
      expect(await fairLaunch.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('12500'));
      expect(await fairLaunch.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('2500'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('3000'));

      // 12. Trigger random update pool to make 1 more block mine
      await fairLaunchAsAlice.massUpdatePools();

      // 13. Check pendingAlpaca
      // Reward per Block must now share amoung Bob and Alice (50-50)
      // Alice should has 15,000 ALPACAs (12,500 + 2,500)
      // Bob should has 5,000 ALPACAs (2,500 + 2,500)
      // Dev get 10% tax per block (5,000*0.1 = 500/block)
      expect(await fairLaunch.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('15000'));
      expect(await fairLaunch.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5000'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('3500'));

      // 14. Bob harvest his yield
      // Reward per Block is till (50-50) as Bob is not leaving the pool yet
      // Alice should has 17,500 ALPACAs (15,000 + 2,500) in pending
      // Bob should has 7,500 ALPACAs (5,000 + 2,500) in his account as he harvest it
      // Dev get 10% tax per block (5,000*0.1 = 500/block)
      await fairLaunchAsBob.harvest(0);

      expect(await fairLaunch.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('17500'));
      expect(await fairLaunch.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('7500'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('4000'));

      // 15. Alice wants more ALPACAs so she deposit 140 STOKEN0 more
      await stoken0AsAlice.approve(fairLaunch.address, ethers.utils.parseEther('300'));
      await fairLaunchAsAlice.deposit((await alice.getAddress()), 0, ethers.utils.parseEther('300'));

      // Alice deposit to the same pool as she already has some STOKEN0 in it
      // Hence, Alice will get auto-harvest
      // Alice should get 22,500 ALPACAs (17,500 + 2,500 [B1] + 2,500 [B2]) back to her account
      // Hence, Alice should has 15,000 + 20,000 = 35,000 ALPACAs in her account and 0 pending as she harvested
      // Bob should has (2,500 [B1] + 2,500 [B2]) = 5,000 ALPACAs in pending
      expect(await fairLaunch.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      expect(await fairLaunch.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5000'));
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('37500'));
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('7500'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5000'));

      // 16. Trigger random update pool to make 1 more block mine
      await fairLaunchAsAlice.massUpdatePools();

      // 1 more block is mined, now Alice shold get 80% and Bob should get 20% of rewards
      // How many STOKEN0 needed to make Alice get 80%: find n from 100n/(100n+100) = 0.8
      // Hence, Alice should get 0 + 4,000 = 4,000 ALPACAs in pending
      // Bob should get 5,000 + 1,000 = 6,000 ALPACAs in pending
      expect(await fairLaunch.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('4000'));
      expect(await fairLaunch.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('6000'));
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('37500'));
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('7500'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('5500'));

      // 17. Ayyooo people vote for the bonus period, 1 block executed
      // bonus will start to accu. on the next box
      await fairLaunchAsDeployer.setBonus(10, (await ethers.provider.getBlockNumber()) + 5, 7000);
      // Make block mined 7 times to make it pass bonusEndBlock
      for(let i = 0; i < 7; i++) {
        await stoken1AsDeployer.mint((await deployer.getAddress()), ethers.utils.parseEther('1'));
      }
      // Trigger this to mint token for dev, 1 more block mined
      await fairLaunchAsDeployer.massUpdatePools();
      // Expect pending balances
      // Each block during bonus period Alice will get 40,000 ALPACAs in pending
      // Bob will get 10,000 ALPACAs in pending
      // Total blocks mined = 9 blocks counted from setBonus executed
      // However, bonus will start to accu. on the setBonus's block + 1
      // Hence, 5 blocks during bonus period and 3 blocks are out of bonus period
      // Hence Alice will get 4,000 + (40,000 * 5) + (4,000 * 4) = 220,000 ALPACAs in pending
      // Bob will get 6,000 + (10,000*5)+(1,000*4) = 60,000 ALPACAs in pending
      // Dev will get 5,500 + (5,000*5*0.3) + (500*4) = 15,000 ALPACAs in account
      // Dev will get 0 + (5,000*5*0.7) = 17,500 ALPACAs locked in AlpacaToken contract
      expect(await fairLaunch.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('220000'));
      expect(await fairLaunch.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('60000'));
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('37500'));
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('7500'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('15000'));
      expect(await alpacaToken.lockOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('17500'));

      // 18. Alice harvest her pending ALPACAs
      // Alice Total Pending is 220,000 ALPACAs
      // 50,000 * 5 = 200,000 ALPACAs are from bonus period
      // Hence subject to lock 200,000 * 0.7 = 140,000 will be locked
      // 200,000 - 140,000 = 60,000 ALPACAs from bonus period should be free float
      // Alice should get 37,500 + (220,000-140,000) + 4,000 = 121,500 ALPACAs
      // 1 Block is mined, hence Bob pending must be increased
      // Bob should get 60,000 + 1,000 = 61,000 ALPACAs
      // Dev should get 500 ALPACAs in the account
      await fairLaunchAsAlice.harvest(0);

      expect(await fairLaunch.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      expect(await fairLaunch.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('61000'));
      expect(await alpacaToken.lockOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('140000'));
      expect(await alpacaToken.lockOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('121500'));
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('7500'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('15500'));
      expect(await alpacaToken.lockOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('17500'));

      // 19. Bob harvest his pending ALPACAs
      // Bob Total Pending is 61,000 ALPACAs
      // 10,000 * 5 = 50,000 ALPACAs are from bonus period
      // Hence subject to lock 50,000 * 0.7 = 35,000 will be locked
      // 50,000 - 35,000 = 15,000 ALPACAs from bonus period should be free float
      // Alice should get 7,500 + (61,000-35,000) + 1,000 = 34,500 ALPACAs
      // 1 Block is mined, hence Bob pending must be increased
      // Alice should get 0 + 4,000 = 4,000 ALPACAs in pending
      // Dev should get 500 ALPACAs in the account
      await fairLaunchAsBob.harvest(0);

      expect(await fairLaunch.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('4000'));
      expect(await fairLaunch.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      expect(await alpacaToken.lockOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('140000'));
      expect(await alpacaToken.lockOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('35000'));
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('121500'));
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('34500'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('16000'));
      expect(await alpacaToken.lockOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('17500'));

      // 20. Alice is happy. Now she want to leave the pool.
      // 2 Blocks are mined
      // Alice pending must be 0 as she harvest and leave the pool.
      // Alice should get 121,500 + 4,000 + 4,000 = 129,500 ALPACAs
      // Bob pending should be 1,000 ALPACAs
      // Dev get another 500 ALPACAs
      await fairLaunchAsAlice.withdrawAll((await alice.getAddress()), 0);

      expect(await fairLaunch.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      expect(await fairLaunch.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('1000'));
      expect(await alpacaToken.lockOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('140000'));
      expect(await alpacaToken.lockOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('35000'));
      expect(await stakingTokens[0].balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('400'));
      expect(await stakingTokens[0].balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('129500'));
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('34500'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('16500'));
      expect(await alpacaToken.lockOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('17500'));

      // 21. Bob is happy. Now he want to leave the pool.
      // 1 Blocks is mined
      // Alice should not move as she left the pool already
      // Bob pending should be 0 ALPACAs
      // Bob should has 34,500 + 1,000 + 5,000 = 40,500 ALPACAs in his account
      // Dev get another 500 ALPACAs
      await fairLaunchAsBob.withdrawAll((await bob.getAddress()), 0);

      expect(await fairLaunch.pendingAlpaca(0, (await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      expect(await fairLaunch.pendingAlpaca(0, (await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('0'));
      expect(await alpacaToken.lockOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('140000'));
      expect(await alpacaToken.lockOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('35000'));
      expect(await stakingTokens[0].balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('400'));
      expect(await stakingTokens[0].balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('100'));
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('129500'));
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('40500'));
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('17000'));
      expect(await alpacaToken.lockOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('17500'));

      // Oh hello! The locked ALPACAs will be released on the next block
      // so let's move four block to get all tokens unlocked
      for(let i = 0; i < 5; i++) {
        // random contract call to make block mined
        await stoken0AsDeployer.mint((await deployer.getAddress()), ethers.utils.parseEther('1'));
      }
      expect(await alpacaToken.canUnlockAmount((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('140000'));
      expect(await alpacaToken.canUnlockAmount((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('35000'));
      expect(await alpacaToken.canUnlockAmount((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('17500'));

      await alpacaTokenAsAlice.unlock();
      expect(await alpacaToken.balanceOf((await alice.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('269500'));

      await alpacaTokenAsBob.unlock();
      expect(await alpacaToken.balanceOf((await bob.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('75500'));

      await alpacaTokenAsDev.unlock();
      expect(await alpacaToken.balanceOf((await dev.getAddress()))).to.be.bignumber.eq(ethers.utils.parseEther('34500'));
    });
  });
});