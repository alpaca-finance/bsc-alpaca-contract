import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers, upgrades, waffle } from "hardhat";
import {
  EmissionForwarder,
  EmissionForwarder__factory,
  MockERC20,
  MockERC20__factory,
  MockProxyToken,
  MockProxyToken__factory,
  MockFairLaunch,
  MockFairLaunch__factory,
  MockAnySwapV4Router,
  MockAnySwapV4Router__factory,
  IAnyswapV1ERC20,
} from "../../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { FakeContract, smock } from "@defi-wonderland/smock";

chai.should();
chai.use(smock.matchers);
chai.use(solidity);
const { expect } = chai;

// Constants
const FAIR_LAUNCH_POOL_ID = 0;
const MINI_FL_ADDRESS = "0x838B7F64Fa89d322C563A6f904851A13a164f84C";
const DESTINATION_CHAIN_ID = 250; // FTM MAINNET
const RELAYER_NAME = "ALPACA-FTM Relayer";

// Accounts
let deployer: SignerWithAddress;
let alice: SignerWithAddress;

/// Mock instance(s)
let proxyToken: MockProxyToken;
let fairLaunch: MockFairLaunch;
let anyswapRouter: MockAnySwapV4Router;
let anyAlpaca: FakeContract<IAnyswapV1ERC20>;

/// Token-related instance(s)
let alpaca: MockERC20;
let alpacaAsDeployer: MockERC20;

/// Contracts
let emissionForwarder: EmissionForwarder;
let emissionForwarderAsAlice: EmissionForwarder;

describe("EmissionForwarder", () => {
  async function fixture() {
    [deployer, alice] = await ethers.getSigners();

    // Deploy ERC-20
    const ERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    alpaca = (await upgrades.deployProxy(ERC20, ["ALPACA", "ALPACA", "18"])) as MockERC20;
    await alpaca.deployed();
    alpacaAsDeployer = MockERC20__factory.connect(alpaca.address, deployer);

    // MINT
    await alpaca.mint(await deployer.getAddress(), ethers.utils.parseEther("8888888"));
    await alpaca.mint(await alice.getAddress(), ethers.utils.parseEther("8888888"));

    // Deploy PROXYTOKEN
    const MockProxyToken = (await ethers.getContractFactory("MockProxyToken", deployer)) as MockProxyToken__factory;
    const mockProxyToken = (await upgrades.deployProxy(MockProxyToken, ["PROXYTOKEN", "PROXYTOKEN"])) as MockProxyToken;
    proxyToken = await mockProxyToken.deployed();

    // Deploy FairLaunch
    const MockFairLaunch = (await ethers.getContractFactory("MockFairLaunch", deployer)) as MockFairLaunch__factory;
    fairLaunch = await MockFairLaunch.deploy(alpaca.address, proxyToken.address);

    await fairLaunch.addPool(0, proxyToken.address, true);

    // Mock anyALPACA
    anyAlpaca = await smock.fake("IAnyswapV1ERC20");

    // Deploy Mock Anyswap router
    const MockAnySwapV4Router = (await ethers.getContractFactory(
      "MockAnySwapV4Router",
      deployer
    )) as MockAnySwapV4Router__factory;
    anyswapRouter = await MockAnySwapV4Router.deploy();

    // Deploy EmissionForwarder
    const EmissionForwarder = (await ethers.getContractFactory(
      "EmissionForwarder",
      deployer
    )) as EmissionForwarder__factory;
    emissionForwarder = (await upgrades.deployProxy(EmissionForwarder, [
      RELAYER_NAME,
      alpaca.address,
      anyAlpaca.address,
      proxyToken.address,
      fairLaunch.address,
      FAIR_LAUNCH_POOL_ID,
      anyswapRouter.address,
      MINI_FL_ADDRESS,
      DESTINATION_CHAIN_ID,
    ])) as EmissionForwarder;
    emissionForwarderAsAlice = EmissionForwarder__factory.connect(emissionForwarder.address, alice);

    // Transfer Ownership
    await proxyToken.setOkHolders([emissionForwarder.address, fairLaunch.address], true);
    await proxyToken.transferOwnership(emissionForwarder.address);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("#initialize", () => {
    describe("when params were set correctly", async () => {
      it("shoud work", async () => {
        expect(await emissionForwarder.name()).to.be.eq(RELAYER_NAME);
        expect(await emissionForwarder.owner()).to.be.eq(deployer.address);
        expect(await emissionForwarder.fairLaunch()).to.be.eq(fairLaunch.address);
        expect(await emissionForwarder.router()).to.be.eq(anyswapRouter.address);
        expect(await emissionForwarder.proxyToken()).to.be.eq(proxyToken.address);
      });
    });
    describe("when fairlaunch's pool id has not been set", async () => {
      it("should revert", async () => {
        const EmissionForwarder = (await ethers.getContractFactory(
          "EmissionForwarder",
          deployer
        )) as EmissionForwarder__factory;
        await expect(
          upgrades.deployProxy(EmissionForwarder, [
            RELAYER_NAME,
            alpaca.address,
            anyAlpaca.address,
            proxyToken.address,
            fairLaunch.address,
            1, // We have added only pool 0
            anyswapRouter.address,
            MINI_FL_ADDRESS,
            DESTINATION_CHAIN_ID,
          ])
        ).to.be.revertedWith("Address: low-level delegate call failed");
      });
    });
    describe("when fairlaunch's pool stakeToken did not match", async () => {
      it("should revert", async () => {
        await fairLaunch.addPool(0, alpaca.address, true);
        const EmissionForwarder = (await ethers.getContractFactory(
          "EmissionForwarder",
          deployer
        )) as EmissionForwarder__factory;
        await expect(
          upgrades.deployProxy(EmissionForwarder, [
            RELAYER_NAME,
            alpaca.address,
            anyAlpaca.address,
            proxyToken.address,
            fairLaunch.address,
            1, // This pool should be alpaca address
            anyswapRouter.address,
            MINI_FL_ADDRESS,
            DESTINATION_CHAIN_ID,
          ])
        ).to.be.revertedWith("EmissionForwarder_StakeTokenMismatch()");
      });
    });
    describe("when token is not a ERC20", async () => {
      it("should revert", async () => {
        const EmissionForwarder = (await ethers.getContractFactory(
          "EmissionForwarder",
          deployer
        )) as EmissionForwarder__factory;
        await expect(
          upgrades.deployProxy(EmissionForwarder, [
            RELAYER_NAME,
            deployer.address, // should be erc 20
            anyAlpaca.address,
            proxyToken.address,
            fairLaunch.address,
            0,
            anyswapRouter.address,
            MINI_FL_ADDRESS,
            DESTINATION_CHAIN_ID,
          ])
        ).to.be.revertedWith("Address: low-level delegate call failed");

        await expect(
          upgrades.deployProxy(EmissionForwarder, [
            RELAYER_NAME,
            alpaca.address,
            anyAlpaca.address,
            deployer.address, // should be erc20
            fairLaunch.address,
            0,
            anyswapRouter.address,
            MINI_FL_ADDRESS,
            DESTINATION_CHAIN_ID,
          ])
        ).to.be.revertedWith("Address: low-level delegate call failed");
      });
    });

    describe("when contract is not an expected contract", async () => {
      it("should revert", async () => {
        const EmissionForwarder = (await ethers.getContractFactory(
          "EmissionForwarder",
          deployer
        )) as EmissionForwarder__factory;
        await expect(
          upgrades.deployProxy(EmissionForwarder, [
            RELAYER_NAME,
            alpaca.address,
            anyAlpaca.address,
            proxyToken.address,
            proxyToken.address, // should be fairlaunch contract address
            0,
            anyswapRouter.address,
            MINI_FL_ADDRESS,
            DESTINATION_CHAIN_ID,
          ])
        ).to.be.revertedWith("Address: low-level delegate call failed");

        await expect(
          upgrades.deployProxy(EmissionForwarder, [
            RELAYER_NAME,
            alpaca.address,
            anyAlpaca.address,
            proxyToken.address,
            fairLaunch.address,
            0,
            fairLaunch.address, // should be anyswap contract address
            MINI_FL_ADDRESS,
            DESTINATION_CHAIN_ID,
          ])
        ).to.be.revertedWith("Address: low-level delegate call failed");
      });
    });

    describe("when anyToken is not AnyswapV1ERC20-compatible", async () => {
      it("should revert", async () => {
        const EmissionForwarder = (await ethers.getContractFactory(
          "EmissionForwarder",
          deployer
        )) as EmissionForwarder__factory;
        await expect(
          upgrades.deployProxy(EmissionForwarder, [
            RELAYER_NAME,
            alpaca.address,
            alpaca.address, // alpaca is not AnyswapV1ERC20-compatible
            proxyToken.address,
            fairLaunch.address,
            0,
            anyswapRouter.address,
            MINI_FL_ADDRESS,
            DESTINATION_CHAIN_ID,
          ])
        ).to.be.revertedWith("Address: low-level delegate call failed");
      });
    });
  });

  context("#fairLaunchDeposit", () => {
    describe("when relayer to deposit 1 proxy token to fairlaunch", () => {
      it("should work", async () => {
        await expect(emissionForwarder.fairLaunchDeposit()).to.be.emit(emissionForwarder, "LogFairLaunchDeposit");
        expect(await proxyToken.balanceOf(fairLaunch.address)).to.be.eq(ethers.utils.parseEther("1"));
      });
    });
    describe("when already deposit proxy token in fair launch", () => {
      it("should revert", async () => {
        await expect(emissionForwarder.fairLaunchDeposit()).to.be.emit(emissionForwarder, "LogFairLaunchDeposit");
        expect(await proxyToken.balanceOf(fairLaunch.address)).to.be.eq(ethers.utils.parseEther("1"));
        await expect(emissionForwarder.fairLaunchDeposit()).to.be.revertedWith("EmissionForwarder_AlreadyDeposited()");
      });
    });
    describe("when other address try call fairLaunchDeposit", () => {
      it("should revert", async () => {
        await expect(emissionForwarderAsAlice.fairLaunchDeposit()).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });
  });

  context("#fairLaunchWithdraw", () => {
    describe("when relayer want to withdraw 1 proxy token from fairlaunch, and burn", () => {
      it("should work", async () => {
        await emissionForwarder.fairLaunchDeposit();
        await expect(emissionForwarder.fairLaunchWithdraw()).to.be.emit(emissionForwarder, "LogFairLaunchWithdraw");
        expect(await proxyToken.balanceOf(fairLaunch.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await proxyToken.balanceOf(emissionForwarder.address)).to.be.eq(ethers.utils.parseEther("0"));
      });
    });
    describe("when other address try call fairLaunchWithdraw", () => {
      it("should revert", async () => {
        await expect(emissionForwarderAsAlice.fairLaunchWithdraw()).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });
  });

  context("#forwardToken", () => {
    describe("when everything is in normal state", async () => {
      it("should work correctly", async () => {
        // Fund mock fairlaunch and sent pending reward
        await alpacaAsDeployer.transfer(fairLaunch.address, ethers.utils.parseEther("1000"));
        await fairLaunch.setPendingAlpaca(ethers.utils.parseEther("1000"));

        // Make anyToken.underlying returns alpaca.address
        anyAlpaca.underlying.returns(alpaca.address);

        // Perform the actual forwardToken
        await expect(emissionForwarder.forwardToken()).to.be.emit(emissionForwarder, "LogForwardToken");

        expect(await alpaca.balanceOf(emissionForwarder.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await alpaca.balanceOf(anyAlpaca.address)).to.be.eq(ethers.utils.parseEther("1000"));
      });
    });
    describe("if amount to forward exceed maxCrossChainAmount", async () => {
      it("should forward only maxCrossChainAmount", async () => {
        // Fund mock fairlaunch and sent pending reward
        await alpacaAsDeployer.transfer(fairLaunch.address, ethers.utils.parseEther("2000"));
        await fairLaunch.setPendingAlpaca(ethers.utils.parseEther("1500"));

        // Make anyToken.underlying returns alpaca.address
        anyAlpaca.underlying.returns(alpaca.address);

        // Perform the actual forwardToken
        await expect(emissionForwarder.forwardToken()).to.be.emit(emissionForwarder, "LogForwardToken");

        expect(await alpaca.balanceOf(emissionForwarder.address)).to.be.eq(ethers.utils.parseEther("500"));
        expect(await alpaca.balanceOf(anyAlpaca.address)).to.be.eq(ethers.utils.parseEther("1000"));
      });
    });
    describe("even if harvest call failed but there's enough token to forward", () => {
      it("should continue to forward", async () => {
        // Assume that there should be 1000 alpaca to be harvest but will fail because of insufficient funds
        await fairLaunch.setPendingAlpaca(ethers.utils.parseEther("1000"));

        // Make anyToken.underlying returns alpaca.address
        anyAlpaca.underlying.returns(alpaca.address);

        // If there are enough alpaca sit in the relayer to be forwarded, it should still work
        await alpacaAsDeployer.transfer(emissionForwarder.address, ethers.utils.parseEther("1000"));
        await expect(emissionForwarder.forwardToken()).to.be.emit(emissionForwarder, "LogForwardToken");
        expect(await alpaca.balanceOf(emissionForwarder.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await alpaca.balanceOf(anyAlpaca.address)).to.be.eq(ethers.utils.parseEther("1000"));
      });
    });
    describe("if the amount to be forward are too small", () => {
      it("should revert", async () => {
        // Fund mock fairlaunch and sent pending reward
        await alpacaAsDeployer.transfer(fairLaunch.address, ethers.utils.parseEther("1000"));
        // Assume that there should be 400 alpaca to be harvest but will fail because of insufficient funds
        await fairLaunch.setPendingAlpaca(ethers.utils.parseEther("400"));

        // Make anyToken.underlying returns alpaca.address
        anyAlpaca.underlying.returns(alpaca.address);

        // If overall the amount to forward is less than threshold (1000 tokens), should revert
        // Existing fund 500, to claim 400 => to forward = 900
        // which is less than 1000
        await alpacaAsDeployer.transfer(emissionForwarder.address, ethers.utils.parseEther("500"));
        await expect(emissionForwarder.forwardToken()).to.be.revertedWith("EmissionForwarder_AmoutTooSmall()");
      });
    });
  });

  context("#setMaxCrossChainAmount", () => {
    describe("if the value > minimum amount", async () => {
      it("should work correctly", async () => {
        await expect(emissionForwarder.setMaxCrossChainAmount(ethers.utils.parseEther("1000"))).to.be.emit(
          emissionForwarder,
          "LogSetMaxCrossChainAmount"
        );
        await expect(emissionForwarder.setMaxCrossChainAmount(ethers.utils.parseEther("2000"))).to.be.emit(
          emissionForwarder,
          "LogSetMaxCrossChainAmount"
        );
      });
    });
    describe("if the value < minimum amount", async () => {
      it("should revert", async () => {
        await expect(emissionForwarder.setMaxCrossChainAmount(ethers.utils.parseEther("500"))).to.be.revertedWith(
          "EmissionForwarder_MaxCrossChainAmountTooLow()"
        );
      });
    });
  });
});
