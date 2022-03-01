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
  FairLaunchRelayer__factory
} from "../../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
const { expect } = chai;

// Constants
const FAIR_LAUNCH_POOL_ID = 0;
const MINI_FL_ADDRESS = "0x838B7F64Fa89d322C563A6f904851A13a164f84C";
const ANYSWAP_ROUTER = "0xABd380327Fe66724FFDa91A87c772FB8D00bE488";
const DESTINATION_CHAIN_ID = 250; // FTM MAINNET

// Accounts
let deployer: SignerWithAddress;

/// Mock instance(s)
let proxyToken: MockProxyToken;
let fairLaunch: MockFairLaunch;

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

    // Deploy feeder
    const FairLaunchRelayer = (await ethers.getContractFactory("FairLaunchRelayer", deployer)) as FairLaunchRelayer__factory;
    const fairLaunchRelayer = (await upgrades.deployProxy(FairLaunchRelayer, [
      alpaca.address,
      proxyToken.address,
      fairLaunch.address,
      FAIR_LAUNCH_POOL_ID,
      ANYSWAP_ROUTER,
      MINI_FL_ADDRESS,
      DESTINATION_CHAIN_ID
    ])) as FairLaunchRelayer;
    relayer = await fairLaunchRelayer.deployed();

  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("when run test", async () => {
    it("shoud work", async () => {
      expect(1).to.be.eq(1);
    });
  });

});
