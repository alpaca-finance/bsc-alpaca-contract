import { ethers, upgrades, waffle } from "hardhat";
import { Signer, BigNumberish, utils, Wallet, BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  AlpacaToken,
  AlpacaToken__factory,
  StronkAlpaca,
  StronkAlpaca__factory,
  StronkAlpacaRelayer,
  StronkAlpacaRelayer__factory
} from "../typechain";
import * as TimeHelpers from "./helpers/time"

chai.use(solidity);
const { expect } = chai;

describe("StronkAlpaca and StronkAlpacaRelayer", () => {
  /// Constant
  const ADDRESS0 = "0x0000000000000000000000000000000000000000";

  // Instance(s)
  let stronkAlpaca: StronkAlpaca;
  let stronkAlpacaAsAlice: StronkAlpaca
  let stronkAlpacaAsBob: StronkAlpaca;
  let alpacaToken: AlpacaToken;
  let alpacaTokenAsAlice: AlpacaToken;
  let alpacaTokenAsBob: AlpacaToken;

  // Accounts
  let deployer: Signer;
  let admin: Signer;
  let alice: Signer;
  let bob: Signer;
  let nowBlock: number;

  beforeEach(async () => {
    nowBlock = (await TimeHelpers.latestBlockNumber()).toNumber();
    [deployer, admin, alice, bob] = await ethers.getSigners();
    // Deploy ALPACAs
    const AlpacaToken = (await ethers.getContractFactory(
      "AlpacaToken",
      deployer
    )) as AlpacaToken__factory;
    alpacaToken = await AlpacaToken.deploy(nowBlock, nowBlock + 300);
    await alpacaToken.deployed();

    alpacaTokenAsAlice = AlpacaToken__factory.connect(alpacaToken.address, alice);
    alpacaTokenAsBob = AlpacaToken__factory.connect(alpacaToken.address, bob);

    const StronkAlpaca = (await ethers.getContractFactory(
      "StronkAlpaca",
      deployer
    )) as StronkAlpaca__factory;
    stronkAlpaca = await StronkAlpaca.deploy(alpacaToken.address, nowBlock+50, nowBlock + 100, nowBlock + 500);
    await stronkAlpaca.deployed();

    stronkAlpacaAsAlice = StronkAlpaca__factory.connect(stronkAlpaca.address, alice);
    stronkAlpacaAsBob = StronkAlpaca__factory.connect(stronkAlpaca.address, bob);
  });

  context('when alice and bob want to hodl StronkAlpaca', async () => {
    it('should be able hodl successfully with correct balances', async () => {
      const aliceAddress = await alice.getAddress()
      const bobAddress = await bob.getAddress()

      // 100 Alpaca to alice
      await alpacaToken.mint(aliceAddress, ethers.utils.parseEther('120'))
      await alpacaToken.lock(aliceAddress, ethers.utils.parseEther('100'))

      // 50 Alpaca to bob
      await alpacaToken.mint(bobAddress, ethers.utils.parseEther('50'))
      await alpacaToken.lock(bobAddress, ethers.utils.parseEther('50'))

      // Advance 50 blocks to reach holdStartBlock
      await TimeHelpers.advanceBlockTo(nowBlock + 50)
      // Alice prepare hodl
      expect(await stronkAlpaca.getRelayerAddress(aliceAddress)).to.equal(ADDRESS0)
      await expect(stronkAlpacaAsAlice.prepareHodl())
        .to.emit(stronkAlpacaAsAlice, 'PrepareHodl')
      const aliceRelayerAddress = await stronkAlpaca.getRelayerAddress(aliceAddress)
      expect(aliceRelayerAddress).to.not.equal(ADDRESS0)

      // Bob prepare hodl
      expect(await stronkAlpaca.getRelayerAddress(bobAddress)).to.equal(ADDRESS0)
      await expect(stronkAlpacaAsBob.prepareHodl())
        .to.emit(stronkAlpacaAsBob, 'PrepareHodl')
      const bobRelayerAddress = await stronkAlpaca.getRelayerAddress(bobAddress)
      expect(bobRelayerAddress).to.not.equal(ADDRESS0)

      // make sure bobRelayerAddress != aliceRelayerAddress
      expect(bobRelayerAddress).to.not.equal(aliceRelayerAddress)

      // Alice transferAll locked Alpaca token to relayer, so that we expect to see both of their balance and lock amount correct
      expect(await alpacaToken.balanceOf(aliceAddress)).to.deep.equal(ethers.utils.parseEther('20'))
      expect(await alpacaToken.lockOf(aliceAddress)).to.deep.equal(ethers.utils.parseEther('100'))
      expect(await alpacaToken.balanceOf(aliceRelayerAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.lockOf(aliceRelayerAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      await alpacaTokenAsAlice.transferAll(aliceRelayerAddress)
      expect(await alpacaToken.balanceOf(aliceAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.lockOf(aliceAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.balanceOf(aliceRelayerAddress)).to.deep.equal(ethers.utils.parseEther('20'))
      expect(await alpacaToken.lockOf(aliceRelayerAddress)).to.deep.equal(ethers.utils.parseEther('100'))

      // Bob transferAll locked Alpaca token to relayer, so that we expect to see both of their balance and lock amount correct
      expect(await alpacaToken.balanceOf(bobAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.lockOf(bobAddress)).to.deep.equal(ethers.utils.parseEther('50'))
      expect(await alpacaToken.balanceOf(bobRelayerAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.lockOf(bobRelayerAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      await alpacaTokenAsBob.transferAll(bobRelayerAddress)
      expect(await alpacaToken.balanceOf(bobAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.lockOf(bobAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.balanceOf(bobRelayerAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.lockOf(bobRelayerAddress)).to.deep.equal(ethers.utils.parseEther('50'))

      // Alice hodl!
      expect(await alpacaToken.balanceOf(stronkAlpaca.address)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.lockOf(stronkAlpaca.address)).to.deep.equal(ethers.utils.parseEther('0'))
      await expect(stronkAlpacaAsAlice.hodl())
        .to.emit(stronkAlpacaAsAlice, 'Hodl')
        .withArgs(aliceAddress, aliceRelayerAddress, ethers.utils.parseEther('100'))
      expect(await alpacaToken.balanceOf(stronkAlpaca.address)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.lockOf(stronkAlpaca.address)).to.deep.equal(ethers.utils.parseEther('100'))
      expect(await alpacaToken.balanceOf(aliceRelayerAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.lockOf(aliceRelayerAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.balanceOf(aliceAddress)).to.deep.equal(ethers.utils.parseEther('20'))
      expect(await alpacaToken.lockOf(aliceAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await stronkAlpaca.balanceOf(aliceAddress)).to.deep.equal(ethers.utils.parseEther('100'))

      // Bob hodl!
      await expect(stronkAlpacaAsBob.hodl())
        .to.emit(stronkAlpacaAsBob, 'Hodl')
        .withArgs(bobAddress, bobRelayerAddress, ethers.utils.parseEther('50'))
      expect(await alpacaToken.balanceOf(stronkAlpaca.address)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.lockOf(stronkAlpaca.address)).to.deep.equal(ethers.utils.parseEther('150'))
      expect(await alpacaToken.balanceOf(bobRelayerAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.lockOf(bobRelayerAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.balanceOf(bobAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.lockOf(bobAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await stronkAlpaca.balanceOf(bobAddress)).to.deep.equal(ethers.utils.parseEther('50'))

      // Evaluate the final balance of stronkAlpaca
      expect(await stronkAlpaca.totalSupply()).to.deep.equal(ethers.utils.parseEther('150'))
    })
  })

  context('when alice has already called prepareHodl once', async () => {
    it('should not allow to prepareHodl when user has already prepare hodl', async () => {
      const aliceAddress = await alice.getAddress()
      //100 alpaca to alice and then lock with 100
      await alpacaToken.mint(aliceAddress, ethers.utils.parseEther('100'))
      await alpacaToken.lock(aliceAddress, ethers.utils.parseEther('100'))
      // Advance 50 blocks to reach holdStartBlock
      await TimeHelpers.advanceBlockTo(nowBlock + 50)
      await stronkAlpacaAsAlice.prepareHodl()
      await expect(stronkAlpacaAsAlice.prepareHodl())
        .to.be
        .revertedWith('StronkAlpaca::prepareHodl: user has already prepared hodl')
    })
  })

  context('when alice want to hodl StronkAlpaca before hodlableStartBlock', async () => {
    it('should not allow to do so when block.number is not reach hodlableStartBlock', async () => {
      await expect(stronkAlpacaAsAlice.prepareHodl())
        .to.be
        .revertedWith('StronkAlpaca::prepareHodl: block.number not reach hodlableStartBlock')
    })
  })

  context('when alice want to hodl StronkAlpaca after hodlableEndBlock', async () => {
    it('should not allow to do so when block.number exceeds hodlableEndBlock', async () => {
      const aliceAddress = await alice.getAddress()
      //100 alpaca to alice and then lock with 100
      await alpacaToken.mint(aliceAddress, ethers.utils.parseEther('100'))
      await alpacaToken.lock(aliceAddress, ethers.utils.parseEther('100'))
      //Advance block to not be able to hodl
      await TimeHelpers.advanceBlockTo(nowBlock + 100)
      await expect(stronkAlpacaAsAlice.prepareHodl())
        .to.be
        .revertedWith('StronkAlpaca::prepareHodl: block.number exceeds hodlableEndBlock')
    })
    it(`should not allow to do so before balance of user's lockAlpaca is zero or less than zero`, async () => {
      const aliceAddress = await alice.getAddress()
      //100 alpaca to alice and then lock with 0
      await alpacaToken.mint(aliceAddress, ethers.utils.parseEther('100'))
      await alpacaToken.lock(aliceAddress, ethers.utils.parseEther('0'))
      //Advance block to be able to prepareHodl
      await TimeHelpers.advanceBlockTo(nowBlock + 50)
      await expect(stronkAlpacaAsAlice.prepareHodl())
      .to.be.
      revertedWith(`StronkAlpaca::preparehodl: user's lockAlpaca must be greater than zero`)
    })
  })

  context('when alice want to hodl StronkAlpaca but haven\'t prepare hodl', async () => {
    it('should not allow alice to do hodl', async () => {
      await expect(stronkAlpacaAsAlice.hodl())
        .to.be
        .revertedWith('StronkAlpaca::hodl: user has not preapare hodl yet')
    })
  })

  context('when the relayer is created (prepareHodl)', async() => {
    it('should allow transferAllAlpaca to be called by only StronkAlpaca contract', async () => {
      const aliceAddress = await alice.getAddress()
      //100 alpaca to alice and then lock.
      await alpacaToken.mint(aliceAddress, ethers.utils.parseEther('100'))
      await alpacaToken.lock(aliceAddress, ethers.utils.parseEther('100'))
      // Advance 50 blocks to reach holdStartBlock
      await TimeHelpers.advanceBlockTo(nowBlock + 50)
      await stronkAlpacaAsAlice.prepareHodl()
      const aliceRelayerAddress = await stronkAlpaca.getRelayerAddress(aliceAddress)
      const relayerAsAlice = StronkAlpacaRelayer__factory.connect(aliceRelayerAddress, alice)
      const relayerAsBob = StronkAlpacaRelayer__factory.connect(aliceRelayerAddress, bob)

      await expect(relayerAsAlice.transferAllAlpaca())
        .to.be
        .revertedWith('Ownable: caller is not the owner')
      await expect(relayerAsBob.transferAllAlpaca())
        .to.be
        .revertedWith('Ownable: caller is not the owner')
      expect(await relayerAsAlice.owner()).to.be.equal(stronkAlpaca.address)
    })
  })

  context('when alice and bob wants to unhodl', async() => {
    it('should swap Strong Alpaca with Alpaca successfully after doing hodl properly', async () => {
      const aliceAddress = await alice.getAddress()
      const bobAddress = await bob.getAddress()

      // mint alpaca for alice and bob
      await alpacaToken.mint(aliceAddress, ethers.utils.parseEther('120'))
      await alpacaToken.lock(aliceAddress, ethers.utils.parseEther('100'))
      await alpacaToken.mint(bobAddress, ethers.utils.parseEther('50'))
      await alpacaToken.lock(bobAddress, ethers.utils.parseEther('50'))

      // Advance 50 blocks to reach holdStartBlock
      await TimeHelpers.advanceBlockTo(nowBlock + 50)
      // prepare hodl
      await stronkAlpacaAsAlice.prepareHodl()
      const aliceRelayerAddress = await stronkAlpaca.getRelayerAddress(aliceAddress)
      await stronkAlpacaAsBob.prepareHodl()
      const bobRelayerAddress = await stronkAlpaca.getRelayerAddress(bobAddress)

      // transfer alapace to relayer
      await alpacaTokenAsAlice.transferAll(aliceRelayerAddress)
      await alpacaTokenAsBob.transferAll(bobRelayerAddress)

      // hodl
      await stronkAlpacaAsAlice.hodl()
      await stronkAlpacaAsBob.hodl()

      // fast forward to the lockEndBlock
      await TimeHelpers.advanceBlockTo(nowBlock + 500)

      // locked token of StronkAlpaca should be 150 while StronkAlpaca supply should be 150
      expect(await alpacaToken.lockOf(stronkAlpaca.address)).to.deep.equal(ethers.utils.parseEther('150'))
      expect(await stronkAlpaca.totalSupply()).to.deep.equal(ethers.utils.parseEther('150'))

      // alice unhodl
      expect(await stronkAlpaca.balanceOf(aliceAddress)).to.deep.equal(ethers.utils.parseEther('100'))
      expect(await alpacaToken.balanceOf(aliceAddress)).to.deep.equal(ethers.utils.parseEther('20'))
      // approve to be able to transfer stronkhodl
      await stronkAlpacaAsAlice.approve(stronkAlpaca.address, ethers.utils.parseEther('100'))
      await expect(stronkAlpacaAsAlice.unhodl())
        .to.emit(stronkAlpacaAsAlice, 'Unhodl')
        .withArgs(aliceAddress, ethers.utils.parseEther('100'))
      expect(await stronkAlpaca.balanceOf(aliceAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.balanceOf(aliceAddress)).to.deep.equal(ethers.utils.parseEther('120'))

      // locked token of StronkAlpaca should be 0, and the alpaca token should be (all - 100)
      expect(await alpacaToken.balanceOf(stronkAlpaca.address)).to.deep.equal(ethers.utils.parseEther('50'))
      expect(await alpacaToken.lockOf(stronkAlpaca.address)).to.deep.equal(ethers.utils.parseEther('0'))

      // stronkAlpaca does not store any stronkAlpaca, but burn instead
      expect(await stronkAlpaca.balanceOf(stronkAlpaca.address)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await stronkAlpaca.totalSupply()).to.deep.equal(ethers.utils.parseEther('50'))

      // bob unhodl
      expect(await stronkAlpaca.balanceOf(bobAddress)).to.deep.equal(ethers.utils.parseEther('50'))
      expect(await alpacaToken.balanceOf(bobAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      // approve to be able to transfer stronkhodl
      await stronkAlpacaAsBob.approve(stronkAlpaca.address, ethers.utils.parseEther('50'))
      await expect(stronkAlpacaAsBob.unhodl())
        .to.emit(stronkAlpacaAsBob, 'Unhodl')
        .withArgs(bobAddress, ethers.utils.parseEther('50'))
      expect(await stronkAlpaca.balanceOf(bobAddress)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.balanceOf(bobAddress)).to.deep.equal(ethers.utils.parseEther('50'))

      // stronkAlpaca does not store any stronkAlpaca, but burn instead
      expect(await alpacaToken.balanceOf(stronkAlpaca.address)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await alpacaToken.lockOf(stronkAlpaca.address)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await stronkAlpaca.balanceOf(stronkAlpaca.address)).to.deep.equal(ethers.utils.parseEther('0'))
      expect(await stronkAlpaca.totalSupply()).to.deep.equal(ethers.utils.parseEther('0'))
    })

    it('should not allow to do so before alpacaToken.endReleaseBlock', async () => {
      await expect(stronkAlpacaAsAlice.unhodl())
        .to.be
        .revertedWith('StronkAlpaca::unhodl: block.number have not reach alpacaToken.endReleaseBlock')
    })

    it('should not allow to do so before lockEndBlock', async () => {
      // fast forward to alpacaToken.endReleaseBlock
      await TimeHelpers.advanceBlockTo(nowBlock + 300)
      await expect(stronkAlpacaAsAlice.unhodl())
        .to.be
        .revertedWith('StronkAlpaca::unhodl: block.number have not reach lockEndBlock')
    })
  })
})
