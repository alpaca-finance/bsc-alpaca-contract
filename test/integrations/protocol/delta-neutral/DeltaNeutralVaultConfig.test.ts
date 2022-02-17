import { ethers, upgrades, waffle } from "hardhat";
import { Signer } from "ethers";
import { solidity } from "ethereum-waffle";
import chai from "chai";
import "@openzeppelin/test-helpers";
import { DeltaNeutralVaultConfig, DeltaNeutralVaultConfig__factory } from "../../../../typechain";
import { DeployHelper, IDeltaNeutralVaultConfig } from "../../../helpers/deploy";

chai.use(solidity);
const { expect } = chai;

interface SwapRoute {
  swapRouter: string;
  paths: string[];
}

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
  const ALPACA_BOUNTY_BPS = "100";

  const TOKEN_SOURCE_ADDR = "0x0000000000000000000000000000000000000001";
  const TOKEN_DESTINATION_ADDR = "0x0000000000000000000000000000000000000002";
  const SWAP_ROUTER_ADDR = "0x0000000000000000000000000000000000000003";
  const TREASURY_ADDR = "0x0000000000000000000000000000000000000004";
  const ALPACA_TOKEN_ADDR = "0x0000000000000000000000000000000000000005";

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

    const deltaNeutralConfig = {
      wNativeAddr: WRAP_NATIVE_ADDR,
      wNativeRelayer: WNATIVE_RELAYER,
      fairlaunchAddr: FAIR_LAUNCH_ADDR,
      rebalanceFactor: REBALANCE_FACTOR,
      positionValueTolerance: POSITION_VALUE_TOLERANCE_BPS,
      treasuryAddr: TREASURY_ADDR,
      alpacaBountyBps: ALPACA_BOUNTY_BPS,
      alpacaTokenAddress: ALPACA_TOKEN_ADDR,
    } as IDeltaNeutralVaultConfig;

    const DeltaNeutralVaultConfig = (await ethers.getContractFactory(
      "DeltaNeutralVaultConfig",
      deployer
    )) as DeltaNeutralVaultConfig__factory;

    const deployHelper = new DeployHelper(deployer);
    deltaNeutralVaultConfig = await deployHelper.deployDeltaNeutralVaultConfig(deltaNeutralConfig);

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
        const NEW_TREASURY_BPS = "0x0000000000000000000000000000000000000004";
        const NEW_REBALANCE_FACTOR = "6600";
        const NEW_POSITION_VALUE_TOLERANCE_BPS = "1200";
        const NEW_ALPACA_BOUNTY_BPS = "200";

        await deltaNeutralVaultConfigAsDeployer.setParams(
          NEW_WRAP_NATIVE_ADDR,
          NEW_WNATIVE_RELAYER,
          NEW_FAIR_LAUNCH_ADDR,
          NEW_REBALANCE_FACTOR,
          NEW_POSITION_VALUE_TOLERANCE_BPS,
          NEW_TREASURY_BPS,
          NEW_ALPACA_BOUNTY_BPS
        );

        const WRAP_NATIVE_ADDR_ = await deltaNeutralVaultConfigAsDeployer.getWrappedNativeAddr();
        const WNATIVE_RELAYER_ = await deltaNeutralVaultConfigAsDeployer.getWNativeRelayer();
        const FAIR_LAUNCH_ADDR_ = await deltaNeutralVaultConfigAsDeployer.fairLaunchAddr();
        const REBALANCE_FACTOR_ = await deltaNeutralVaultConfigAsDeployer.rebalanceFactor();
        const POSITION_VALUE_TOLERANCE_BPS_ = await deltaNeutralVaultConfigAsDeployer.positionValueTolerance();
        const TREASURY_BPS_ = await deltaNeutralVaultConfigAsDeployer.treasury();
        const ALPACA_BOUNTY_BPS = await deltaNeutralVaultConfigAsDeployer.alpacaBountyBps();

        expect(WRAP_NATIVE_ADDR_).to.equal(NEW_WRAP_NATIVE_ADDR);
        expect(WNATIVE_RELAYER_).to.equal(NEW_WNATIVE_RELAYER);
        expect(FAIR_LAUNCH_ADDR_).to.equal(NEW_FAIR_LAUNCH_ADDR);
        expect(REBALANCE_FACTOR_).to.equal(NEW_REBALANCE_FACTOR);
        expect(POSITION_VALUE_TOLERANCE_BPS_).to.equal(NEW_POSITION_VALUE_TOLERANCE_BPS);
        expect(TREASURY_BPS_).to.equal(NEW_TREASURY_BPS);
        expect(ALPACA_BOUNTY_BPS).to.equal(NEW_ALPACA_BOUNTY_BPS);
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
            TREASURY_ADDR,
            ALPACA_BOUNTY_BPS,
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

  describe("#setwhitelistedReinvestors", async () => {
    context("when an owner set whitelistedReinvestors", async () => {
      it("should work", async () => {
        await deltaNeutralVaultConfigAsDeployer.setwhitelistedReinvestors([bobAddress], true);
        const bobWhitelistedReinvestor_true = await deltaNeutralVaultConfigAsDeployer.whitelistedReinvestors(
          bobAddress
        );

        expect(bobWhitelistedReinvestor_true).to.equal(true);

        await deltaNeutralVaultConfigAsDeployer.setwhitelistedReinvestors([bobAddress], false);

        const bobWhitelistedReinvestor_false = await deltaNeutralVaultConfigAsDeployer.whitelistedReinvestors(
          bobAddress
        );
        expect(bobWhitelistedReinvestor_false).to.equal(false);
      });
    });

    context("when non owner try to set whitelistedReinvestors", async () => {
      it("should be reverted", async () => {
        await expect(deltaNeutralVaultConfigAsAlice.setwhitelistedReinvestors([bobAddress], true)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    describe("#setValueLimit", async () => {
      context("when not an owner call setValueLimit ", async () => {
        it("should revert", async () => {
          await expect(deltaNeutralVaultConfigAsAlice.setValueLimit(ethers.utils.parseEther("2"))).to.reverted;
        });
      });

      context("when an owner call setValueLimit ", async () => {
        it("should work", async () => {
          const setValueLimitTx = await deltaNeutralVaultConfigAsDeployer.setValueLimit(ethers.utils.parseEther("2"));

          expect(setValueLimitTx)
            .to.emit(deltaNeutralVaultConfig, "LogSetValueLimit")
            .withArgs(deployerAddress, ethers.utils.parseEther("2"));
        });
      });
    });

    describe("#isVaultSizeAcceptable", async () => {
      const maxVaultPositionValue = ethers.utils.parseEther("2");
      beforeEach(async () => {
        await deltaNeutralVaultConfigAsDeployer.setValueLimit(maxVaultPositionValue);
      });
      context("when isVaultSizeAcceptable is called", async () => {
        it("should return true if new total position value <= maxVaultPositionValue", async () => {
          expect(await deltaNeutralVaultConfig.isVaultSizeAcceptable(maxVaultPositionValue)).to.eq(true);
        });

        it("should return false if new total position value > maxVaultPositionValue", async () => {
          expect(await deltaNeutralVaultConfig.isVaultSizeAcceptable(maxVaultPositionValue.add(1))).to.eq(false);
        });
      });
    });
  });

  describe("#setSwapRouter", async () => {
    context("when as owner set swap router", async () => {
      it("should work", async () => {
        await expect(deltaNeutralVaultConfig.setSwapRouter(SWAP_ROUTER_ADDR))
          .to.emit(deltaNeutralVaultConfig, "LogSetSwapRouter")
          .withArgs(deployerAddress, SWAP_ROUTER_ADDR);
      });
    });

    context("when as owner set swap router back to zero address", async () => {
      it("should revert", async () => {
        await deltaNeutralVaultConfig.setSwapRouter(SWAP_ROUTER_ADDR);
        await expect(deltaNeutralVaultConfig.setSwapRouter(ethers.constants.AddressZero)).to.be.revertedWith(
          "DeltaNeutralVaultConfig_InvalidSwapRouter()"
        );
      });
    });
  });

  describe("#setReinvestPath", async () => {
    context("when as owner set reinvest paths and start with alpaca token", async () => {
      it("should work", async () => {
        await expect(deltaNeutralVaultConfig.setReinvestPath([ALPACA_TOKEN_ADDR, TOKEN_DESTINATION_ADDR]))
          .to.emit(deltaNeutralVaultConfig, "LogSetReinvestPath")
          .withArgs(deployerAddress, [ALPACA_TOKEN_ADDR, TOKEN_DESTINATION_ADDR]);

        await expect(
          deltaNeutralVaultConfig.setReinvestPath([ALPACA_TOKEN_ADDR, TOKEN_SOURCE_ADDR, TOKEN_DESTINATION_ADDR])
        )
          .to.emit(deltaNeutralVaultConfig, "LogSetReinvestPath")
          .withArgs(deployerAddress, [ALPACA_TOKEN_ADDR, TOKEN_SOURCE_ADDR, TOKEN_DESTINATION_ADDR]);
      });
    });

    context("when as owner set reinvest paths with length less than 2", async () => {
      it("should revert", async () => {
        await expect(deltaNeutralVaultConfig.setReinvestPath([ALPACA_TOKEN_ADDR])).to.be.revertedWith(
          "InvalidReinvestPathLength()"
        );
      });
    });

    context("when as owner set reinvest paths but not start with alpaca token", async () => {
      it("should revert", async () => {
        await expect(
          deltaNeutralVaultConfig.setReinvestPath([TOKEN_SOURCE_ADDR, TOKEN_DESTINATION_ADDR])
        ).to.be.revertedWith("DeltaNeutralVaultConfig_InvalidReinvestPath()");
      });
    });
  });

  describe("#setFees", async () => {
    context("when not owner call setFees", async () => {
      it("should revert", async () => {
        await expect(deltaNeutralVaultConfigAsAlice.setFees(0, 0, 0)).to.be.reverted;
      });
    });
    context("when set too much fee", async () => {
      it("should revert", async () => {
        await expect(deltaNeutralVaultConfig.setFees(1001, 1002, 1003)).to.be.revertedWith(
          "TooMuchFee(1001, 1002, 1003)"
        );
      });
    });
    context("when owner call setFees", async () => {
      it("should be able to set fee", async () => {
        const setFeesTx = await deltaNeutralVaultConfig.setFees(500, 500, 500);
        expect(await deltaNeutralVaultConfig.depositFeeBps()).to.eq(500);
        expect(await deltaNeutralVaultConfig.withdrawalFeeBps()).to.eq(500);
        expect(await deltaNeutralVaultConfig.mangementFeeBps()).to.eq(500);
        expect(setFeesTx).to.emit(deltaNeutralVaultConfig, "LogSetFees").withArgs(deployerAddress, 500, 500, 500);
      });
    });
  });

  describe("#setAlpacaBountyBps", async () => {
    context("when not owner call setAlpacaBountyBps", async () => {
      it("should revert", async () => {
        await expect(deltaNeutralVaultConfigAsAlice.setAlpacaBountyBps(0)).to.be.reverted;
      });
    });
    context("when set too much AlpacaBountyBps", async () => {
      it("should revert", async () => {
        await expect(deltaNeutralVaultConfig.setAlpacaBountyBps(2501)).to.be.revertedWith(
          "DeltaNeutralVaultConfig_TooMuchBounty(2501)"
        );
      });
    });
    context("when owner call setAlpacaBountyBps", async () => {
      it("should be able to setAlpacaBountyBps", async () => {
        const setAlpacaBountyTx = await deltaNeutralVaultConfig.setAlpacaBountyBps(500);
        expect(await deltaNeutralVaultConfig.alpacaBountyBps()).to.eq(500);
        expect(setAlpacaBountyTx).to.emit(deltaNeutralVaultConfig, "LogSetAlpacaBounty").withArgs(deployerAddress, 500);
      });
    });
  });
});
