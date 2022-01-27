import { ethers, upgrades, waffle } from "hardhat";
import { Signer, constants, BigNumber } from "ethers";
import { solidity } from "ethereum-waffle";
import chai from "chai";
import "@openzeppelin/test-helpers";
import * as TimeHelpers from "../../../helpers/time";
import {
  DeltaNeutralVaultConfig,
  DeltaNeutralVaultConfig__factory,
  MockWBNB,
  WNativeRelayer,
  WNativeRelayer__factory,
} from "../../../../typechain";
import { DeployHelper } from "../../../helpers/deploy";

chai.use(solidity);
const { expect } = chai;

describe("DeltaNeutralVaultConfig", () => {
  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let eve: Signer;

  let deployerAddress: string;
  let aliceAddress: string;
  let bobAddress: string;
  let eveAddress: string;

  let deltaNeutralVaultConfigAsAlice: DeltaNeutralVaultConfig;
  let deltaNeutralVaultConfigAsDeployer: DeltaNeutralVaultConfig;

  const WRAP_NATIVE_ADDR = ethers.constants.AddressZero;
  const WNATIVE_RELAYER = ethers.constants.AddressZero;
  const FAIR_LAUNCH_ADDR = ethers.constants.AddressZero;
  const REBALANCE_FACTOR = "6500";
  const POSITION_VALUE_TOLERANCE_BPS = "1000";

  // DeltaNeutralVaultConfig instance
  let deltaNeutralVaultConfig: DeltaNeutralVaultConfig;

  async function fixture() {
    [deployer, alice, bob, eve] = await ethers.getSigners();
    [deployerAddress, aliceAddress, bobAddress, eveAddress] = await Promise.all([
      deployer.getAddress(),
      alice.getAddress(),
      bob.getAddress(),
      eve.getAddress(),
    ]);

    const DeltaNeutralVaultConfig = (await ethers.getContractFactory(
      "DeltaNeutralVaultConfig",
      deployer
    )) as DeltaNeutralVaultConfig__factory;

    deltaNeutralVaultConfig = (await upgrades.deployProxy(DeltaNeutralVaultConfig, [
      WRAP_NATIVE_ADDR,
      WNATIVE_RELAYER,
      FAIR_LAUNCH_ADDR,
      REBALANCE_FACTOR,
      POSITION_VALUE_TOLERANCE_BPS,
    ])) as DeltaNeutralVaultConfig;
    await deltaNeutralVaultConfig.deployed();

    // Assign contract signer
    deltaNeutralVaultConfigAsAlice = deltaNeutralVaultConfig.connect(alice);
    deltaNeutralVaultConfigAsDeployer = deltaNeutralVaultConfig.connect(deployer);
  }
  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  describe("#setParams", async () => {
    context("when an owner set params", async () => {
      it("should work", async () => {
        const NEW_WRAP_NATIVE_ADDR = "0x0000000000000000000000000000000000000001";
        const NEW_WNATIVE_RELAYER = "0x0000000000000000000000000000000000000002";
        const NEW_FAIR_LAUNCH_ADDR = "0x0000000000000000000000000000000000000003";
        const NEW_REBALANCE_FACTOR = "6600";
        const NEW_POSITION_VALUE_TOLERANCE_BPS = "1200";

        await deltaNeutralVaultConfigAsDeployer.setParams(
          NEW_WRAP_NATIVE_ADDR,
          NEW_WNATIVE_RELAYER,
          NEW_FAIR_LAUNCH_ADDR,
          NEW_REBALANCE_FACTOR,
          NEW_POSITION_VALUE_TOLERANCE_BPS
        );

        const WRAP_NATIVE_ADDR_ = await deltaNeutralVaultConfigAsDeployer.getWrappedNativeAddr();
        const WNATIVE_RELAYER_ = await deltaNeutralVaultConfigAsDeployer.getWNativeRelayer();
        const FAIR_LAUNCH_ADDR_ = await deltaNeutralVaultConfigAsDeployer.fairLaunchAddr();
        const REBALANCE_FACTOR_ = await deltaNeutralVaultConfigAsDeployer.rebalanceFactor();
        const POSITION_VALUE_TOLERANCE_BPS_ = await deltaNeutralVaultConfigAsDeployer.positionValueTolerance();

        expect(WRAP_NATIVE_ADDR_).to.equal(NEW_WRAP_NATIVE_ADDR);
        expect(WNATIVE_RELAYER_).to.equal(NEW_WNATIVE_RELAYER);
        expect(FAIR_LAUNCH_ADDR_).to.equal(NEW_FAIR_LAUNCH_ADDR);
        expect(REBALANCE_FACTOR_).to.equal(NEW_REBALANCE_FACTOR);
        expect(POSITION_VALUE_TOLERANCE_BPS_).to.equal(NEW_POSITION_VALUE_TOLERANCE_BPS);
      });
    });
    context("when non owner try to set params", async () => {
      it("should be reverted", async () => {
        await expect(
          deltaNeutralVaultConfigAsAlice.setParams(
            WRAP_NATIVE_ADDR,
            WNATIVE_RELAYER,
            FAIR_LAUNCH_ADDR,
            REBALANCE_FACTOR,
            POSITION_VALUE_TOLERANCE_BPS,
            { from: aliceAddress }
          )
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });
  describe("#setWhitelistedCallers", async () => {
    context("when an owner set whitelistedCallers", async () => {
      it("should work", async () => {
        await deltaNeutralVaultConfigAsDeployer.setWhitelistedCallers([aliceAddress, bobAddress], true);

        const aliceWhitelistedCallers_true = await deltaNeutralVaultConfigAsDeployer.whitelistedCallers(aliceAddress);
        const bobWhitelistedCallers_true = await deltaNeutralVaultConfigAsDeployer.whitelistedCallers(bobAddress);

        expect(aliceWhitelistedCallers_true).to.equal(true);
        expect(bobWhitelistedCallers_true).to.equal(true);

        await deltaNeutralVaultConfigAsDeployer.setWhitelistedCallers([aliceAddress, bobAddress], false);

        const aliceWhitelistedCallers_false = await deltaNeutralVaultConfigAsDeployer.whitelistedCallers(aliceAddress);
        const bobWhitelistedCallers_false = await deltaNeutralVaultConfigAsDeployer.whitelistedCallers(bobAddress);

        expect(aliceWhitelistedCallers_false).to.equal(false);
        expect(bobWhitelistedCallers_false).to.equal(false);
      });
    });
    context("when non owner try to set whitelistedCallers", async () => {
      it("should be reverted", async () => {
        await expect(
          deltaNeutralVaultConfigAsAlice.setWhitelistedCallers([aliceAddress, bobAddress], true)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });
  describe("#setWhitelistedRebalancer", async () => {
    context("when an owner set whitelistedRebalancer", async () => {
      it("should work", async () => {
        await deltaNeutralVaultConfigAsDeployer.setWhitelistedRebalancer([bobAddress], true);

        const bobWhitelistedRebalancer_true = await deltaNeutralVaultConfigAsDeployer.whitelistedRebalancers(
          bobAddress
        );

        expect(bobWhitelistedRebalancer_true).to.equal(true);

        await deltaNeutralVaultConfigAsDeployer.setWhitelistedRebalancer([bobAddress], false);

        const bobWhitelistedRebalancer_false = await deltaNeutralVaultConfigAsDeployer.whitelistedRebalancers(
          bobAddress
        );

        expect(bobWhitelistedRebalancer_false).to.equal(false);
      });
    });
    context("when non owner try to set whitelistedRebalancer", async () => {
      it("should be reverted", async () => {
        await expect(deltaNeutralVaultConfigAsAlice.setWhitelistedRebalancer([bobAddress], true)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });
  });
});
