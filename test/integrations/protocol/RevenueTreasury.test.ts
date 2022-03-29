import { ethers, waffle, upgrades } from "hardhat";
import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { DeployHelper } from "../../helpers/deploy";
import {
  MockERC20,
  MockERC20__factory,
  MockGrassHouse,
  MockGrassHouse__factory,
  RevenueTreasury,
  RevenueTreasury__factory,
  MockSwapRouter,
  MockSwapRouter__factory
} from "../../../typechain";

chai.use(solidity);
const { expect } = chai;

describe("RevenueTreasury", () => {
  // Contact Instance
  let alpaca: MockERC20;
  let usdt: MockERC20;

  let treasury: RevenueTreasury;
  let grassHouse: MockGrassHouse;

  let router: MockSwapRouter;

  // Accounts
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let deployerAddress: string;
  let aliceAddress: string;

  // Contract Signer
  let alpacaAsAlice: MockERC20;
  let usdtAsAlice: MockERC20;

  let treasuryAsAlice: RevenueTreasury;
  async function fixture() {
    [deployer, alice, bob] = await ethers.getSigners();
    [deployerAddress, aliceAddress] = await Promise.all([deployer.getAddress(), alice.getAddress()]);

    const deployHelper = new DeployHelper(deployer);

    // Deploy ALPACA

    /// Setup token stuffs
    [alpaca, usdt] = await deployHelper.deployBEP20([
      {
        name: "ALPACA",
        symbol: "ALPACA",
        decimals: "18",
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("10000000000000") },
          { address: aliceAddress, amount: ethers.utils.parseEther("10000000000000") },
        ],
      },
      {
        name: "USDT",
        symbol: "USDT",
        decimals: "18",
        holders: [
          { address: deployerAddress, amount: ethers.utils.parseEther("10000000000000") },
          { address: aliceAddress, amount: ethers.utils.parseEther("10000000000000") },
        ],
      },
    ]);

    // Deploy GrassHouse
    const MockGrassHouse = (await ethers.getContractFactory("MockGrassHouse", deployer)) as MockGrassHouse__factory;
    grassHouse = await MockGrassHouse.deploy(alpaca.address);

    // Deploy router
    const MockSwapRouter = (await ethers.getContractFactory("MockSwapRouter", deployer)) as MockSwapRouter__factory;
    router = await MockSwapRouter.deploy(usdt.address, alpaca.address);

    usdt.transfer(router.address, ethers.utils.parseEther("100000"));
    alpaca.transfer(router.address, ethers.utils.parseEther("100000"));

    // Deploy feeder
    const RevenueTreasury = (await ethers.getContractFactory("RevenueTreasury", deployer)) as RevenueTreasury__factory;
    const revenueTreasury = (await upgrades.deployProxy(RevenueTreasury, [
      usdt.address,
      grassHouse.address,
      router.address
    ])) as RevenueTreasury;
    treasury = await revenueTreasury.deployed();

    // MINT
    await alpaca.mint(deployerAddress, ethers.utils.parseEther("8888888"));
    await alpaca.mint(aliceAddress, ethers.utils.parseEther("8888888"));

    await usdt.mint(deployerAddress, ethers.utils.parseEther("8888888"));
    await usdt.mint(aliceAddress, ethers.utils.parseEther("8888888"));

    // Assign contract signer
    alpacaAsAlice = MockERC20__factory.connect(alpaca.address, alice);
    usdtAsAlice = MockERC20__factory.connect(usdt.address, alice);

    treasuryAsAlice = RevenueTreasury__factory.connect(treasury.address, alice);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("#initialize", () => {
    describe("if initialized correctly", async () => {
      it("should work", async () => {
        expect(await treasury.owner()).to.be.eq(deployerAddress);
        expect(await treasury.grassHouse()).to.be.eq(grassHouse.address);
        expect(await treasury.grasshouseToken()).to.be.eq(alpaca.address);
        expect(await treasury.token()).to.be.eq(usdt.address);
      });
    });

    describe("if the address is not grasshouse", async () => {
      it("should revert", async () => {
        const RevenueTreasury = (await ethers.getContractFactory("RevenueTreasury", deployer)) as RevenueTreasury__factory;
        await expect(upgrades.deployProxy(RevenueTreasury, [
          usdt.address,
          alpaca.address,
          router.address
        ])).to.be.revertedWith("Address: low-level delegate call failed");
      });
    });

    describe("if the address is not router", async () => {
      it("should revert", async () => {
        const RevenueTreasury = (await ethers.getContractFactory("RevenueTreasury", deployer)) as RevenueTreasury__factory;
        await expect(upgrades.deployProxy(RevenueTreasury, [
          usdt.address,
          alpaca.address,
          router.address
        ])).to.be.revertedWith("Address: low-level delegate call failed");
      });
    });
  });

  context("#setNewGrassHouse", () => {
    describe("if the address is grasshouse", async () => {
      it("should work", async () => {
        // Deploy GrassHouse
        const MockGrassHouse = (await ethers.getContractFactory("MockGrassHouse", deployer)) as MockGrassHouse__factory;
        const newGrassHouse = await MockGrassHouse.deploy(usdt.address);

        await treasury.setGrassHouse(newGrassHouse.address);

        expect(await treasury.grasshouseToken()).to.be.eq(usdt.address);
      });
    });
    describe("if the address is not grasshouse", async () => {
      it("should revert", async () => {
        await expect(treasury.setGrassHouse(usdt.address)).to.be.revertedWith("Transaction reverted: function selector was not recognized and there's no fallback function");
      });
    });
    describe("if the caller is not owner", async () => {
      it("should revert", async () => {
        await expect(treasuryAsAlice.setGrassHouse(usdt.address)).to.be.revertedWith("'Ownable: caller is not the owner");
      });
    });
  });

  context("#setRouter", () => {
    describe("if the address is router", async () => {
      it("should work", async () => {
        // Deploy GrassHouse
        const MockSwapRouter = (await ethers.getContractFactory("MockSwapRouter", deployer)) as MockSwapRouter__factory;
        const newRouter = await MockSwapRouter.deploy(usdt.address, alpaca.address);

        await treasury.setRouter(newRouter.address);

        expect(await treasury.router()).to.be.eq(newRouter.address);
      });
    });
    describe("if the address is not grasshouse", async () => {
      it("should revert", async () => {
        await expect(treasury.setGrassHouse(usdt.address)).to.be.revertedWith("Transaction reverted: function selector was not recognized and there's no fallback function");
      });
    });
    describe("if the caller is not owner", async () => {
      it("should revert", async () => {
        await expect(treasuryAsAlice.setGrassHouse(usdt.address)).to.be.revertedWith("'Ownable: caller is not the owner");
      });
    });
  });

  context("#setRewardPath", async () => {
    context("when as owner set reinvest paths and start with alpaca token", async () => {
      it("should work", async () => {
        await expect(treasury.setRewardPath([usdt.address, alpaca.address]))
          .to.emit(treasury, "LogSetRewardPath")
          .withArgs(deployerAddress, [usdt.address, alpaca.address]);

        const randomAddress = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
        await expect(
          treasury.setRewardPath([usdt.address, randomAddress, alpaca.address])
        )
          .to.emit(treasury, "LogSetRewardPath")
          .withArgs(deployerAddress, [usdt.address, randomAddress, alpaca.address]);
      });
    });

    context("when as owner set reinvest paths with length less than 2", async () => {
      it("should revert", async () => {
        await expect(treasury.setRewardPath([alpaca.address])).to.be.revertedWith(
          "RevenueTreasury_InvalidRewardPathLength()"
        );
      });
    });

    context("when as owner set reinvest paths but not start with alpaca token", async () => {
      it("should revert", async () => {
        await expect(
          treasury.setRewardPath([alpaca.address, usdt.address])
        ).to.be.revertedWith("RevenueTreasury_InvalidRewardPath()");
      });
    });
  });

  describe("#settle", async () => {
    it("should work correctly", async () => {
      await usdt.transfer(treasury.address, ethers.utils.parseEther("100"));
      // await alpaca.transfer(treasury.address, ethers.utils.parseEther("100"));
      expect(await usdt.balanceOf(treasury.address)).to.be.eq(ethers.utils.parseEther("100"));

      await treasury.settle();

      expect(await usdt.balanceOf(treasury.address)).to.be.eq(ethers.utils.parseEther("0"));
      expect(await alpaca.balanceOf(grassHouse.address)).to.be.eq(ethers.utils.parseEther("100"));
    });
  });
});
