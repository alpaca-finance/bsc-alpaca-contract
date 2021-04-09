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
  MockERC20__factory,
  Shield,
  Shield__factory,
  Timelock,
  Timelock__factory,
} from "../typechain";
import * as TimeHelpers from "./helpers/time"

chai.use(solidity);
const { expect } = chai;

describe("Shield", () => {
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

  let timelockAsDev: Timelock;

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let dev: Signer;

  // Contracts
  let alpacaToken: AlpacaToken;
  let fairLaunch: FairLaunch;
  let shield: Shield;
  let stakingTokens: MockERC20[];
  let timelock: Timelock;

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

    const Timelock = (await ethers.getContractFactory(
      "Timelock",
      deployer
    )) as Timelock__factory;
    timelock = await Timelock.deploy(await dev.getAddress(), '259200');
    await timelock.deployed();

    const Shield = (await ethers.getContractFactory(
      "Shield",
      deployer
    )) as Shield__factory;
    shield = await Shield.deploy(timelock.address, fairLaunch.address);
    await shield.deployed();

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

    timelockAsDev = Timelock__factory.connect(timelock.address, dev);
  });

  context("when migrate FairLaunchV1's owner from Timelock to Shield + Timelock", async() => {
    beforeEach(async() => {
      await fairLaunch.transferOwnership(timelock.address);

      expect(await fairLaunch.owner()).to.be.eq(timelock.address);
      expect(await shield.owner()).to.be.eq(timelock.address);
    });

    it('should revert when non owner to interact with Shield', async() => {
      await expect(
        shield.setAlpacaPerBlock(ethers.utils.parseEther('1'))
      ).to.be.revertedWith('Ownable: caller is not the owner');

      await expect(
        shield.setBonus(1, 500, 7000)
      ).to.be.revertedWith('Ownable: caller is not the owner');

      await expect(
        shield.mintWarchest(await dev.getAddress(), ethers.utils.parseEther('1'))
      ).to.be.revertedWith('Ownable: caller is not the owner');

      await expect(
        shield.addPool(1, stakingTokens[0].address, false)
      ).to.be.revertedWith('Ownable: caller is not the owner');

      await expect(
        shield.setPool(1, 100, false)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert when adjust param through Timelock + Shield when migration has not been done', async() => {
      const eta = (await TimeHelpers.latest()).add(TimeHelpers.duration.days(ethers.BigNumber.from('4')));
      await timelockAsDev.queueTransaction(
        shield.address, '0', 'addPool(uint256,address,bool)',
        ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'address', 'bool'],
          [100, stakingTokens[0].address, false]), eta
      );

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('4')));

      await expect(timelockAsDev.executeTransaction(
        shield.address, '0', 'addPool(uint256,address,bool)',
        ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'address', 'bool'],
          [100, stakingTokens[0].address, false]), eta
      )).to.be.revertedWith('Ownable: caller is not the owner');
    })

    it('should migrate successfully', async() => {
      const eta = (await TimeHelpers.latest()).add(TimeHelpers.duration.days(ethers.BigNumber.from('4')));
      await timelockAsDev.queueTransaction(
        fairLaunch.address, '0', 'transferOwnership(address)',
        ethers.utils.defaultAbiCoder.encode(
          ['address'],
          [shield.address]), eta
      );

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('4')));

      await timelockAsDev.executeTransaction(
        fairLaunch.address, '0', 'transferOwnership(address)',
        ethers.utils.defaultAbiCoder.encode(
          ['address'],
          [shield.address]), eta
      );

      expect(await fairLaunch.owner()).to.be.eq(shield.address);
    })
  });

  context("when adjust FairLaunchV1 params via Shield + Timelock", async() => {
    beforeEach(async() => {
      await fairLaunch.transferOwnership(shield.address);

      expect(await fairLaunch.owner()).to.be.eq(shield.address);
      expect(await shield.owner()).to.be.eq(timelock.address);
    });

    it('should add new pool when Timelock is passed ETA', async() => {
      const eta = (await TimeHelpers.latest()).add(TimeHelpers.duration.days(ethers.BigNumber.from('4')));
      await timelockAsDev.queueTransaction(
        shield.address, '0', 'addPool(uint256,address,bool)',
        ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'address', 'bool'],
          [100, stakingTokens[0].address, false]), eta
      );

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('4')));

      await timelockAsDev.executeTransaction(
        shield.address, '0', 'addPool(uint256,address,bool)',
        ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'address', 'bool'],
          [100, stakingTokens[0].address, false]), eta
      );

      expect((await fairLaunch.poolInfo(0)).allocPoint).to.be.bignumber.eq(100);
      expect((await fairLaunch.poolInfo(0)).stakeToken).to.be.eq(stakingTokens[0].address);
    });

    it('should set pool on existed pool when Timelock is passed ETA', async() => {
      let eta = (await TimeHelpers.latest()).add(TimeHelpers.duration.days(ethers.BigNumber.from('4')));
      await timelockAsDev.queueTransaction(
        shield.address, '0', 'addPool(uint256,address,bool)',
        ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'address', 'bool'],
          [100, stakingTokens[0].address, false]), eta
      );

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('4')));

      await timelockAsDev.executeTransaction(
        shield.address, '0', 'addPool(uint256,address,bool)',
        ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'address', 'bool'],
          [100, stakingTokens[0].address, false]), eta
      );

      expect((await fairLaunch.poolInfo(0)).allocPoint).to.be.bignumber.eq(100);
      expect((await fairLaunch.poolInfo(0)).stakeToken).to.be.eq(stakingTokens[0].address);

      eta = (await TimeHelpers.latest()).add(TimeHelpers.duration.days(ethers.BigNumber.from('4')));
      await timelockAsDev.queueTransaction(
        shield.address, '0', 'setPool(uint256,uint256,bool)',
        ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'uint256', 'bool'],
          [0, 200, false]), eta
      );

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('4')));

      await timelockAsDev.executeTransaction(
        shield.address, '0', 'setPool(uint256,uint256,bool)',
        ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'uint256', 'bool'],
          [0, 200, false]), eta
      );

      expect((await fairLaunch.poolInfo(0)).allocPoint).to.be.bignumber.eq(200);
      expect((await fairLaunch.poolInfo(0)).stakeToken).to.be.eq(stakingTokens[0].address);
    });

    it('should set bonus on FLV1 when Timelock is passed ETA', async() => {
      let eta = (await TimeHelpers.latest()).add(TimeHelpers.duration.days(ethers.BigNumber.from('4')));
      await timelockAsDev.queueTransaction(
        shield.address, '0', 'setBonus(uint256,uint256,uint256)',
        ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'uint256', 'uint256'],
          [2, 888888, 7000]), eta
      );

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('4')));

      await timelockAsDev.executeTransaction(
        shield.address, '0', 'setBonus(uint256,uint256,uint256)',
        ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'uint256', 'uint256'],
          [2, 888888, 7000]), eta
      );

      expect(await fairLaunch.bonusMultiplier()).to.be.bignumber.eq(2);
      expect(await fairLaunch.bonusEndBlock()).to.be.bignumber.eq(888888);
      expect(await fairLaunch.bonusLockUpBps()).to.be.bignumber.eq(7000);
    });

    it('should set alpaca per block on FLV1 when Timelock is passed ETA', async() => {
      let eta = (await TimeHelpers.latest()).add(TimeHelpers.duration.days(ethers.BigNumber.from('4')));
      await timelockAsDev.queueTransaction(
        shield.address, '0', 'setAlpacaPerBlock(uint256)',
        ethers.utils.defaultAbiCoder.encode(
          ['uint256'],
          [88]), eta
      );

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('4')));

      await timelockAsDev.executeTransaction(
        shield.address, '0', 'setAlpacaPerBlock(uint256)',
        ethers.utils.defaultAbiCoder.encode(
          ['uint256'],
          [88]), eta
      );

      expect(await fairLaunch.alpacaPerBlock()).to.be.bignumber.eq(88);
    });

    it('should allow to mint Alpaca if mintCount <= 8m', async() => {
      let eta = (await TimeHelpers.latest()).add(TimeHelpers.duration.days(ethers.BigNumber.from('4')));
      await timelockAsDev.queueTransaction(
        shield.address, '0', 'mintWarchest(address,uint256)',
        ethers.utils.defaultAbiCoder.encode(
          ['address','uint256'],
          [await alice.getAddress(), ethers.utils.parseEther('2750000')]), eta
      );

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('4')));

      await timelockAsDev.executeTransaction(
        shield.address, '0', 'mintWarchest(address,uint256)',
        ethers.utils.defaultAbiCoder.encode(
          ['address','uint256'],
          [await alice.getAddress(), ethers.utils.parseEther('2750000')]), eta
      );

      expect(await shield.mintCount()).to.be.bignumber.eq(ethers.utils.parseEther('3000000'));
      expect(await alpacaToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('2750000'));

      eta = (await TimeHelpers.latest()).add(TimeHelpers.duration.days(ethers.BigNumber.from('4')));
      await timelockAsDev.queueTransaction(
        shield.address, '0', 'mintWarchest(address,uint256)',
        ethers.utils.defaultAbiCoder.encode(
          ['address','uint256'],
          [await alice.getAddress(), ethers.utils.parseEther('5000000')]), eta
      );

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('4')));

      await timelockAsDev.executeTransaction(
        shield.address, '0', 'mintWarchest(address,uint256)',
        ethers.utils.defaultAbiCoder.encode(
          ['address','uint256'],
          [await alice.getAddress(), ethers.utils.parseEther('5000000')]), eta
      );

      expect(await shield.mintCount()).to.be.bignumber.eq(ethers.utils.parseEther('8000000'));
      expect(await alpacaToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('7750000'));
    });

    it('should revert when mintCount > 8m', async() => {
      let eta = (await TimeHelpers.latest()).add(TimeHelpers.duration.days(ethers.BigNumber.from('4')));
      await timelockAsDev.queueTransaction(
        shield.address, '0', 'mintWarchest(address,uint256)',
        ethers.utils.defaultAbiCoder.encode(
          ['address','uint256'],
          [await alice.getAddress(), ethers.utils.parseEther('2750000')]), eta
      );

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('4')));

      await timelockAsDev.executeTransaction(
        shield.address, '0', 'mintWarchest(address,uint256)',
        ethers.utils.defaultAbiCoder.encode(
          ['address','uint256'],
          [await alice.getAddress(), ethers.utils.parseEther('2750000')]), eta
      );

      expect(await shield.mintCount()).to.be.bignumber.eq(ethers.utils.parseEther('3000000'));
      expect(await alpacaToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('2750000'));

      eta = (await TimeHelpers.latest()).add(TimeHelpers.duration.days(ethers.BigNumber.from('4')));
      await timelockAsDev.queueTransaction(
        shield.address, '0', 'mintWarchest(address,uint256)',
        ethers.utils.defaultAbiCoder.encode(
          ['address','uint256'],
          [await alice.getAddress(), ethers.utils.parseEther('5000001')]), eta
      );

      await TimeHelpers.increase(TimeHelpers.duration.days(ethers.BigNumber.from('4')));

      await expect(timelockAsDev.executeTransaction(
        shield.address, '0', 'mintWarchest(address,uint256)',
        ethers.utils.defaultAbiCoder.encode(
          ['address','uint256'],
          [await alice.getAddress(), ethers.utils.parseEther('5000001')]), eta
      )).to.be.revertedWith('Shield::mintWarchest:: mint exceeded mintLimit');
      expect(await shield.mintCount()).to.be.bignumber.eq(ethers.utils.parseEther('3000000'));
      expect(await alpacaToken.balanceOf(await alice.getAddress())).to.be.bignumber.eq(ethers.utils.parseEther('2750000'));
    });
  });
});