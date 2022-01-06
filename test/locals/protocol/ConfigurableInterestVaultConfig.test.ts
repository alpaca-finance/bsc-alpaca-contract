import { ethers, upgrades, waffle } from "hardhat";
import { Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import { ConfigurableInterestVaultConfig, ConfigurableInterestVaultConfig__factory } from "../../../typechain";

chai.use(solidity);
const { expect } = chai;

describe("Configuration Vault ", () => {
  const RESERVE_POOL_BPS = "300"; // 3% reserve pool
  const KILL_PRIZE_BPS = "250"; // 2.5% Kill prize
  const MIN_DEBT_SIZE = ethers.utils.parseEther("1"); // 1 BTOKEN min debt size
  const KILL_TREASURY_BPS = "250";
  const INTEREST_MODEL = ethers.constants.AddressZero;
  const WRAP_NATIVE_ADDR = ethers.constants.AddressZero;
  const WNATIVE_RELAYER = ethers.constants.AddressZero;
  const FAIR_LAUNCH_ADDR = ethers.constants.AddressZero;
  const TREASURY_ADDR = ethers.constants.AddressZero;

  let configVault: ConfigurableInterestVaultConfig;

  // Accounts
  let deployer: Signer;

  async function fixture() {
    [deployer] = await ethers.getSigners();

    const ConfigurableInterestVaultConfig = (await ethers.getContractFactory(
      "ConfigurableInterestVaultConfig",
      deployer
    )) as ConfigurableInterestVaultConfig__factory;
    configVault = (await upgrades.deployProxy(ConfigurableInterestVaultConfig, [
      MIN_DEBT_SIZE,
      RESERVE_POOL_BPS,
      KILL_PRIZE_BPS,
      INTEREST_MODEL,
      WRAP_NATIVE_ADDR,
      WNATIVE_RELAYER,
      FAIR_LAUNCH_ADDR,
      KILL_TREASURY_BPS,
      TREASURY_ADDR,
    ])) as ConfigurableInterestVaultConfig;
    await configVault.deployed();
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("when default Config Vault's params", async () => {
    it("should return the default address when no treasury account", async () => {
      expect(await configVault.getTreasuryAddr()).to.be.eq("0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51");
    });

    it("should return the kill treasury price bps correctly", async () => {
      expect(await configVault.getKillTreasuryBps()).to.be.eq("250");
    });

    it("should pass when kill_prize + kill_treasury <= maxbps", async () => {
      expect((await configVault.getKillTreasuryBps()).add(await configVault.getKillBps())).to.be.lte("500");
    });
  });

  context("when update Config Vault's params", async () => {
    it("should return treasury address correctly when update", async () => {
      const deployerAddress = await deployer.getAddress();
      await configVault.setParams(
        MIN_DEBT_SIZE,
        RESERVE_POOL_BPS,
        KILL_PRIZE_BPS,
        INTEREST_MODEL,
        WRAP_NATIVE_ADDR,
        WNATIVE_RELAYER,
        FAIR_LAUNCH_ADDR,
        KILL_TREASURY_BPS,
        deployerAddress
      );
      expect(await configVault.getTreasuryAddr()).to.be.eq(deployerAddress);
    });

    it("should reverted with over maxbps < kill_prize + kill_treasury", async () => {
      const deployerAddress = await deployer.getAddress();
      const killPrizeOver = "600";
      const treasuryOver = "600";
      expect(
        configVault.setParams(
          MIN_DEBT_SIZE,
          RESERVE_POOL_BPS,
          killPrizeOver,
          INTEREST_MODEL,
          WRAP_NATIVE_ADDR,
          WNATIVE_RELAYER,
          FAIR_LAUNCH_ADDR,
          ethers.constants.Zero,
          deployerAddress
        )
      ).to.be.revertedWith("ConfigurableInterestVaultConfig::setParams:: kill bps exceeded max kill bps");

      expect(
        configVault.setParams(
          MIN_DEBT_SIZE,
          RESERVE_POOL_BPS,
          ethers.constants.Zero,
          INTEREST_MODEL,
          WRAP_NATIVE_ADDR,
          WNATIVE_RELAYER,
          FAIR_LAUNCH_ADDR,
          treasuryOver,
          deployerAddress
        )
      ).to.be.revertedWith("ConfigurableInterestVaultConfig::setParams:: kill bps exceeded max kill bps");
    });
  });
});
