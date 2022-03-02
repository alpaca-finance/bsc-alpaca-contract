import chai from "chai";
import "@openzeppelin/test-helpers";
import { solidity } from "ethereum-waffle";
import { BigNumber } from "ethers";
import { ethers, upgrades, waffle } from "hardhat";
import {
  MockERC20,
  MockERC20__factory,
  MockProxyToken,
  MockProxyToken__factory,
  MockFairLaunch,
  MockFairLaunch__factory,
  FairLaunchRelayer,
  FairLaunchRelayer__factory,
  MockAnySwapV4Router,
  MockAnySwapV4Router__factory
} from "../../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
const { expect } = chai;

// Constants
const FAIR_LAUNCH_POOL_ID = 0;
const MINI_FL_ADDRESS = "0x838B7F64Fa89d322C563A6f904851A13a164f84C";
const DESTINATION_CHAIN_ID = 250; // FTM MAINNET

// Accounts
let deployer: SignerWithAddress;

/// Mock instance(s)
let proxyToken: MockProxyToken;
let fairLaunch: MockFairLaunch;
let anyswapRouter: MockAnySwapV4Router;

/// Token-related instance(s)
let alpaca: MockERC20;

/// Contracts
let relayer: FairLaunchRelayer;

describe("FairLaunchRelayer", () => {
  async function fixture() {
    [deployer] = await ethers.getSigners();

    const deployerAddress = await deployer.getAddress();

    // PREPARE ORACLE
    const ERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    alpaca = (await upgrades.deployProxy(ERC20, ["ALPACA", "ALPACA", "18"])) as MockERC20;
    await alpaca.deployed();

    // Deploy PROXYTOKEN
    const MockProxyToken = (await ethers.getContractFactory("MockProxyToken", deployer)) as MockProxyToken__factory;
    const mockProxyToken = (await upgrades.deployProxy(MockProxyToken, ["PROXYTOKEN", "PROXYTOKEN"])) as MockProxyToken;
    proxyToken = await mockProxyToken.deployed();

    // Deploy FairLaunch
    const MockFairLaunch = (await ethers.getContractFactory("MockFairLaunch", deployer)) as MockFairLaunch__factory;
    fairLaunch = await MockFairLaunch.deploy(alpaca.address, proxyToken.address);

    await fairLaunch.addPool(0, proxyToken.address, true);

    // Deploy Mock Anyswap router

    const MockAnySwapV4Router = (await ethers.getContractFactory(
      "MockAnySwapV4Router",
      deployer
    )) as MockAnySwapV4Router__factory;
    anyswapRouter = await MockAnySwapV4Router.deploy();

    // Deploy relayer
    const FairLaunchRelayer = (await ethers.getContractFactory("FairLaunchRelayer", deployer)) as FairLaunchRelayer__factory;
    const fairLaunchRelayer = (await upgrades.deployProxy(FairLaunchRelayer, [
      alpaca.address,
      proxyToken.address,
      fairLaunch.address,
      FAIR_LAUNCH_POOL_ID,
      anyswapRouter.address,
      MINI_FL_ADDRESS,
      DESTINATION_CHAIN_ID
    ])) as FairLaunchRelayer;
    relayer = await fairLaunchRelayer.deployed();
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("#initialize", () => {
    describe("when params were set correctly", async () => {
      it("shoud work", async () => {
        expect(await relayer.owner()).to.be.eq(deployer.address);
        expect(await relayer.fairLaunch()).to.be.eq(fairLaunch.address);
        expect(await relayer.router()).to.be.eq(anyswapRouter.address);
        expect(await relayer.proxyToken()).to.be.eq(proxyToken.address);
      });
    })
    describe("when fairlaunch's pool id has not been set", async () => {
      it("should revert", async () => {
        const FairLaunchRelayer = (await ethers.getContractFactory("FairLaunchRelayer", deployer)) as FairLaunchRelayer__factory;
        await expect(upgrades.deployProxy(FairLaunchRelayer, [
          alpaca.address,
          proxyToken.address,
          fairLaunch.address,
          1, // We have added only pool 0
          anyswapRouter.address,
          MINI_FL_ADDRESS,
          DESTINATION_CHAIN_ID
        ])).to.be.revertedWith("Address: low-level delegate call failed");
      });
    });
    describe("when fairlaunch's pool stakeToken did not match", async () => {
      it("should revert", async () => {
        await fairLaunch.addPool(0, alpaca.address, true);
        const FairLaunchRelayer = (await ethers.getContractFactory("FairLaunchRelayer", deployer)) as FairLaunchRelayer__factory;
        await expect(upgrades.deployProxy(FairLaunchRelayer, [
          alpaca.address,
          proxyToken.address,
          fairLaunch.address,
          1, // This pool should be alpaca address
          anyswapRouter.address,
          MINI_FL_ADDRESS,
          DESTINATION_CHAIN_ID
        ])).to.be.revertedWith("FairLaunchRelayer_StakeTokenMismatch()");
      });
    });
    describe("when token is not a ERC20", async () => {
      it("should revert", async () => {
        const FairLaunchRelayer = (await ethers.getContractFactory("FairLaunchRelayer", deployer)) as FairLaunchRelayer__factory;
        await expect(upgrades.deployProxy(FairLaunchRelayer, [
          deployer.address, // should be erc 20
          proxyToken.address,
          fairLaunch.address,
          0,
          anyswapRouter.address,
          MINI_FL_ADDRESS,
          DESTINATION_CHAIN_ID
        ])).to.be.revertedWith("Address: low-level delegate call failed");

        await expect(upgrades.deployProxy(FairLaunchRelayer, [
          alpaca.address,
          deployer.address, // should be erc20
          fairLaunch.address,
          0,
          anyswapRouter.address,
          MINI_FL_ADDRESS,
          DESTINATION_CHAIN_ID
        ])).to.be.revertedWith("Address: low-level delegate call failed");
      });
    });

    describe("when contract is not an expected contract", async () => {
      it("should revert", async () => {
        const FairLaunchRelayer = (await ethers.getContractFactory("FairLaunchRelayer", deployer)) as FairLaunchRelayer__factory;
        await expect(upgrades.deployProxy(FairLaunchRelayer, [
          alpaca.address,
          proxyToken.address,
          proxyToken.address, // should be fairlaunch contract address
          0,
          anyswapRouter.address,
          MINI_FL_ADDRESS,
          DESTINATION_CHAIN_ID
        ])).to.be.revertedWith("Address: low-level delegate call failed");

        await expect(upgrades.deployProxy(FairLaunchRelayer, [
          alpaca.address,
          proxyToken.address,
          fairLaunch.address,
          0,
          fairLaunch.address, // should be anyswap contract address
          MINI_FL_ADDRESS,
          DESTINATION_CHAIN_ID
        ])).to.be.revertedWith("Address: low-level delegate call failed");
      });
    });
  });
});
