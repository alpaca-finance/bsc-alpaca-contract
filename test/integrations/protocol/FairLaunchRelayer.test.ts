import chai from "chai";
import "@openzeppelin/test-helpers";
import { solidity } from "ethereum-waffle";
import { BigNumber, Signer } from "ethers";
import { ethers, upgrades, waffle } from "hardhat";
import {
  MockERC20,
  MockERC20__factory,
} from "../../../typechain";

chai.use(solidity);
const { expect } = chai;

const FOREVER = "2000000000";

// Accounts
let deployer: Signer;

/// Mdex-related instance(s)

/// Token-related instance(s)
let token0: MockERC20;

describe("FairLaunchRelayer", () => {
  async function fixture() {
    [deployer] = await ethers.getSigners();

    const deployerAddress = await deployer.getAddress();

    // PREPARE ORACLE
    const ERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    token0 = (await upgrades.deployProxy(ERC20, ["token0", "token0", "18"])) as MockERC20;
    await token0.deployed();
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
