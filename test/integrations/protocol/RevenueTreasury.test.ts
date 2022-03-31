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
  MockSwapRouter__factory,
  MockVault,
  MockVault__factory
} from "../../../typechain";

chai.use(solidity);
const { expect } = chai;

describe("RevenueTreasury", () => {
  // Contact Instance
  let alpaca: MockERC20;
  let usdt: MockERC20;
  let busd: MockERC20;

  let treasury: RevenueTreasury;
  let grassHouse: MockGrassHouse;

  let router: MockSwapRouter;

  let vault: MockVault;

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
    [alpaca, usdt, busd] = await deployHelper.deployBEP20([
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
      {
        name: "BUSD",
        symbol: "BUSD",
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
    router = await MockSwapRouter.deploy();

    usdt.transfer(router.address, ethers.utils.parseEther("100000"));
    busd.transfer(router.address, ethers.utils.parseEther("100000"));
    alpaca.transfer(router.address, ethers.utils.parseEther("100000"));

    // Deploy Vault
    const MockVault = (await ethers.getContractFactory("MockVault", deployer)) as MockVault__factory;
    vault = await MockVault.deploy(usdt.address);

    // Deploy Treasury
    const splitBps = 5000;
    const remaining = ethers.utils.parseEther("10000");
    const RevenueTreasury = (await ethers.getContractFactory("RevenueTreasury", deployer)) as RevenueTreasury__factory;
    const revenueTreasury = (await upgrades.deployProxy(RevenueTreasury, [
      busd.address,
      grassHouse.address,
      vault.address,
      router.address,
      remaining,
      splitBps
    ])) as RevenueTreasury;
    treasury = await revenueTreasury.deployed();
    treasury.setRewardPath([busd.address, alpaca.address]);
    treasury.setVaultSwapPath([busd.address, usdt.address]);

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
        expect(await treasury.token()).to.be.eq(busd.address);
        expect(await treasury.remaining()).to.be.eq(ethers.utils.parseEther("10000"));
      });
    });

    describe("if the address is not grasshouse", async () => {
      it("should revert", async () => {
        const RevenueTreasury = (await ethers.getContractFactory("RevenueTreasury", deployer)) as RevenueTreasury__factory;
        await expect(upgrades.deployProxy(RevenueTreasury, [
          usdt.address,
          alpaca.address, // should be grasshouse
          vault.address,
          router.address,
          ethers.utils.parseEther("10000"),
          5000
        ])).to.be.revertedWith("Address: low-level delegate call failed");
      });
    });

    describe("if the address is not router", async () => {
      it("should revert", async () => {
        const RevenueTreasury = (await ethers.getContractFactory("RevenueTreasury", deployer)) as RevenueTreasury__factory;
        await expect(upgrades.deployProxy(RevenueTreasury, [
          usdt.address,
          grassHouse.address,
          vault.address,
          vault.address, //should be router
          ethers.utils.parseEther("10000"),
          5000
        ])).to.be.revertedWith("Address: low-level delegate call failed");
      });
    });

    describe("if the split bps is exceed 10000", async () => {
      it("should revert", async () => {
        const RevenueTreasury = (await ethers.getContractFactory("RevenueTreasury", deployer)) as RevenueTreasury__factory;
        await expect(upgrades.deployProxy(RevenueTreasury, [
          usdt.address,
          grassHouse.address,
          vault.address,
          router.address,
          ethers.utils.parseEther("1000"),
          10001 // should be less than 10000
        ])).to.be.revertedWith("RevenueTreasury_InvalidBps()");
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
        const newRouter = await MockSwapRouter.deploy();

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
    describe("when owner set reinvest paths and start with busd token", async () => {
      it("should work", async () => {
        await expect(treasury.setRewardPath([busd.address, alpaca.address]))
          .to.emit(treasury, "LogSetRewardPath")
          .withArgs(deployerAddress, [busd.address, alpaca.address]);


        await expect(
          treasury.setRewardPath([busd.address, usdt.address, alpaca.address])
        )
          .to.emit(treasury, "LogSetRewardPath")
          .withArgs(deployerAddress, [busd.address, usdt.address, alpaca.address]);
      });
    });

    describe("when as owner set reinvest paths with length less than 2", async () => {
      it("should revert", async () => {
        await expect(treasury.setRewardPath([alpaca.address])).to.be.revertedWith(
          "RevenueTreasury_InvalidSwapPathLength()"
        );
      });
    });

    describe("when as owner set reinvest paths but not start with alpaca token", async () => {
      it("should revert", async () => {
        await expect(
          treasury.setRewardPath([alpaca.address, usdt.address])
        ).to.be.revertedWith("RevenueTreasury_InvalidSwapPath()");
      });
    });
  });

  context("#setVaultSwapPath", async () => {
    describe("when owner set reinvest paths and start with busd token", async () => {
      it("should work", async () => {
        await expect(treasury.setVaultSwapPath([busd.address, usdt.address]))
          .to.emit(treasury, "LogSetVaultSwapPath")
          .withArgs(deployerAddress, [busd.address, usdt.address]);

        await expect(
          treasury.setVaultSwapPath([busd.address, alpaca.address, usdt.address])
        )
          .to.emit(treasury, "LogSetVaultSwapPath")
          .withArgs(deployerAddress, [busd.address, alpaca.address, usdt.address]);
      });
    });

    describe("when as owner set reinvest paths with length less than 2", async () => {
      it("should revert", async () => {
        await expect(treasury.setVaultSwapPath([alpaca.address])).to.be.revertedWith(
          "RevenueTreasury_InvalidSwapPathLength()"
        );
      });
    });

    describe("when as owner set reinvest paths but not start with alpaca token", async () => {
      it("should revert", async () => {
        await expect(
          treasury.setVaultSwapPath([alpaca.address, usdt.address])
        ).to.be.revertedWith("RevenueTreasury_InvalidSwapPath()");
      });
    });
  });

  context("#setSplitBps", async () => {
    describe("if bps < 10000", async () => {
      it("should work", async () => {
        await expect(treasury.setSplitBps(50))
          .to.emit(treasury, "LogSetSplitBps")
          .withArgs(deployerAddress, 5000, 50);
      });
    });

    describe("if bps > 10000", async () => {
      it("should revert", async () => {
        await expect(treasury.setSplitBps(10001)).to.be.revertedWith(
          "RevenueTreasury_InvalidBps()"
        );
      });
    });

    describe("if the caller is not owner", async () => {
      it("should revert", async () => {
        await expect(treasuryAsAlice.setSplitBps(10001)).to.be.revertedWith("'Ownable: caller is not the owner");
      });
    });
  });

  context("#feedGrassHouse", async () => {
    describe("If amount to cover < remaining", async () => {
      it("should split token into 50:50", async () => {
        await busd.transfer(treasury.address, ethers.utils.parseEther("100"));

        expect(await busd.balanceOf(treasury.address)).to.be.eq(ethers.utils.parseEther("100"));

        expect(treasury.feedGrassHouse()).to.emit(treasury, "LogFeedGrassHouse")
          .withArgs(deployerAddress, ethers.utils.parseEther("50"))
          .to.emit(treasury, "LogSettleBadDebt")
          .withArgs(deployerAddress, ethers.utils.parseEther("50"));

        expect(await busd.balanceOf(treasury.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await usdt.balanceOf(vault.address)).to.be.eq(ethers.utils.parseEther("50"));
        expect(await alpaca.balanceOf(grassHouse.address)).to.be.eq(ethers.utils.parseEther("50"));
      });
    });

    describe("If amount to cover < remaining and split bps = 100", async () => {
      it("should split transfer all and feed none", async () => {
        await treasury.setSplitBps(10000);
        await busd.transfer(treasury.address, ethers.utils.parseEther("100"));

        expect(await busd.balanceOf(treasury.address)).to.be.eq(ethers.utils.parseEther("100"));

        expect(treasury.feedGrassHouse()).to.emit(treasury, "LogFeedGrassHouse")
          .withArgs(deployerAddress, ethers.utils.parseEther("0"))
          .to.emit(treasury, "LogSettleBadDebt")
          .withArgs(deployerAddress, ethers.utils.parseEther("100"));

        expect(await busd.balanceOf(treasury.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await usdt.balanceOf(vault.address)).to.be.eq(ethers.utils.parseEther("100"));
        expect(await alpaca.balanceOf(grassHouse.address)).to.be.eq(ethers.utils.parseEther("0"));
      });
    });

    describe("If amount to cover < remaining and split bps = 0", async () => {
      it("should split swapp all and transfer non", async () => {
        await treasury.setSplitBps(0);
        await busd.transfer(treasury.address, ethers.utils.parseEther("100"));

        expect(await busd.balanceOf(treasury.address)).to.be.eq(ethers.utils.parseEther("100"));

        expect(treasury.feedGrassHouse()).to.emit(treasury, "LogFeedGrassHouse")
          .withArgs(deployerAddress, ethers.utils.parseEther("100"))
          .to.emit(treasury, "LogSettleBadDebt")
          .withArgs(deployerAddress, ethers.utils.parseEther("0"));

        expect(await busd.balanceOf(treasury.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await usdt.balanceOf(vault.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await alpaca.balanceOf(grassHouse.address)).to.be.eq(ethers.utils.parseEther("100"));
      });
    });

    describe("If amount to cover > remaining", async () => {
      it("should transfer only to cover bad debt", async () => {
        await busd.transfer(treasury.address, ethers.utils.parseEther("30000"));

        expect(await busd.balanceOf(treasury.address)).to.be.eq(ethers.utils.parseEther("30000"));

        expect(treasury.feedGrassHouse()).to.emit(treasury, "LogFeedGrassHouse")
          .withArgs(deployerAddress, ethers.utils.parseEther("20000"))
          .to.emit(treasury, "LogSettleBadDebt")
          .withArgs(deployerAddress, ethers.utils.parseEther("10000"));

        expect(await busd.balanceOf(treasury.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await usdt.balanceOf(vault.address)).to.be.eq(ethers.utils.parseEther("10000"));
        expect(await alpaca.balanceOf(grassHouse.address)).to.be.eq(ethers.utils.parseEther("20000"));
      });
    });

    describe("If remaining = 0", async () => {
      it("should swap all to reward and feed grasshouse", async () => {
        // Cover all remaining first
        await busd.transfer(treasury.address, ethers.utils.parseEther("20000"));

        expect(await busd.balanceOf(treasury.address)).to.be.eq(ethers.utils.parseEther("20000"));

        expect(treasury.feedGrassHouse()).to.emit(treasury, "LogFeedGrassHouse")
          .withArgs(deployerAddress, ethers.utils.parseEther("10000"))
          .to.emit(treasury, "LogSettleBadDebt")
          .withArgs(deployerAddress, ethers.utils.parseEther("10000"));

        expect(await busd.balanceOf(treasury.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await usdt.balanceOf(vault.address)).to.be.eq(ethers.utils.parseEther("10000"));
        expect(await alpaca.balanceOf(grassHouse.address)).to.be.eq(ethers.utils.parseEther("10000"));

        // Another round of revenue distribution
        await busd.transfer(treasury.address, ethers.utils.parseEther("5000"));
        expect(await busd.balanceOf(treasury.address)).to.be.eq(ethers.utils.parseEther("5000"));

        expect(treasury.feedGrassHouse()).to.emit(treasury, "LogFeedGrassHouse")
          .withArgs(deployerAddress, ethers.utils.parseEther("5000"));

        expect(await busd.balanceOf(treasury.address)).to.be.eq(ethers.utils.parseEther("0"));
        expect(await usdt.balanceOf(vault.address)).to.be.eq(ethers.utils.parseEther("10000"));
        expect(await alpaca.balanceOf(grassHouse.address)).to.be.eq(ethers.utils.parseEther("15000"));
      });
    });

    describe("In case there's no need for vault swap", async () => {
      it("should work", async () => {
        await treasury.setToken(usdt.address);
        await treasury.setRewardPath([usdt.address, alpaca.address]);
        await treasury.setVaultSwapPath([]);
        await usdt.transfer(treasury.address, ethers.utils.parseEther("20000"));

        expect(treasury.feedGrassHouse()).to.emit(treasury, "LogFeedGrassHouse")
          .withArgs(deployerAddress, ethers.utils.parseEther("10000"))
          .to.emit(treasury, "LogSettleBadDebt")
          .withArgs(deployerAddress, ethers.utils.parseEther("10000"));

        expect(await usdt.balanceOf(vault.address)).to.be.eq(ethers.utils.parseEther("10000"));
        expect(await alpaca.balanceOf(grassHouse.address)).to.be.eq(ethers.utils.parseEther("10000"));
      });
    });

    describe("In case there's no need for reward swap", async () => {
      it("should work", async () => {
        await treasury.setToken(alpaca.address);
        await treasury.setRewardPath([]);
        await treasury.setVaultSwapPath([alpaca.address, usdt.address]);
        await alpaca.transfer(treasury.address, ethers.utils.parseEther("20000"));

        expect(treasury.feedGrassHouse()).to.emit(treasury, "LogFeedGrassHouse")
          .withArgs(deployerAddress, ethers.utils.parseEther("10000"))
          .to.emit(treasury, "LogSettleBadDebt")
          .withArgs(deployerAddress, ethers.utils.parseEther("10000"));

        expect(await usdt.balanceOf(vault.address)).to.be.eq(ethers.utils.parseEther("10000"));
        expect(await alpaca.balanceOf(grassHouse.address)).to.be.eq(ethers.utils.parseEther("10000"));
      });
    });

    describe("If token has been changed but swap path hasn't been changed", async () => {
      it("should revert", async () => {
        await treasury.setToken(usdt.address);
        await usdt.transfer(treasury.address, ethers.utils.parseEther("20000"));

        expect(treasury.feedGrassHouse()).to.be.revertedWith("RevenueTreasury_InvalidSwapPath()");

      });
    });

    describe("If vault has been changed but swap path hasn't been changed", async () => {
      it("should revert", async () => {
        // Deploy Vault
        const MockVault = (await ethers.getContractFactory("MockVault", deployer)) as MockVault__factory;
        const alpacaVault = await MockVault.deploy(alpaca.address);

        await treasury.setVault(alpacaVault.address);
        await usdt.transfer(treasury.address, ethers.utils.parseEther("20000"));

        expect(treasury.feedGrassHouse()).to.be.revertedWith("RevenueTreasury_InvalidSwapPath()");

      });
    });

    describe("If grassHouse has been changed but swap path hasn't been changed", async () => {
      it("should revert", async () => {
        // Deploy GrassHouse
        const MockGrassHouse = (await ethers.getContractFactory("MockGrassHouse", deployer)) as MockGrassHouse__factory;
        const usdtGrassHouse = await MockGrassHouse.deploy(usdt.address);


        await treasury.setGrassHouse(usdtGrassHouse.address);
        await usdt.transfer(treasury.address, ethers.utils.parseEther("20000"));

        expect(treasury.feedGrassHouse()).to.be.revertedWith("RevenueTreasury_InvalidSwapPath()");

      });
    });
  });
});
