import { ethers, upgrades, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  MiniFL,
  MiniFL__factory,
  MockERC20,
  MockERC20__factory,
  Rewarder1,
  Rewarder1__factory,
} from "../../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import * as timeHelpers from "../../helpers/time";
import * as assertHelpers from "../../helpers/assert";

chai.use(solidity);
const { expect } = chai;

describe("MiniFL", () => {
  const ALPACA_REWARD_PER_SEC = ethers.utils.parseEther("10");

  // Accounts
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let dev: SignerWithAddress;

  let alpacaToken: MockERC20;
  let extraRewardToken: MockERC20;
  let miniFL: MiniFL;
  let stakingTokens: MockERC20[];

  // Contract as Signer
  let alpacaTokenAsAlice: MockERC20;
  let alpacaTokenAsBob: MockERC20;
  let alpacaTokenAsDev: MockERC20;

  let stoken0AsAlice: MockERC20;
  let stoken0AsBob: MockERC20;
  let stoken0AsDev: MockERC20;

  let stoken1AsAlice: MockERC20;
  let stoken1AsBob: MockERC20;
  let stoken1AsDev: MockERC20;

  let stoken2AsAlice: MockERC20;
  let stoken2AsBob: MockERC20;
  let stoken2AsDev: MockERC20;

  let stoken3AsAlice: MockERC20;
  let stoken3AsBob: MockERC20;
  let stoken3AsDev: MockERC20;

  let miniFLasAlice: MiniFL;
  let miniFLasBob: MiniFL;
  let miniFLasDev: MiniFL;

  async function fixture() {
    [deployer, alice, bob, dev] = await ethers.getSigners();

    // Deploy ALPACA
    const MockERC20 = (await ethers.getContractFactory("MockERC20", deployer)) as MockERC20__factory;
    alpacaToken = (await upgrades.deployProxy(MockERC20, [`ALPACA`, `ALPACA`, 18])) as MockERC20;
    extraRewardToken = (await upgrades.deployProxy(MockERC20, ["EXTRA", "EXTRA", 18])) as MockERC20;

    // Deploy MiniFL
    const MiniFL = (await ethers.getContractFactory("MiniFL", deployer)) as MiniFL__factory;
    miniFL = (await upgrades.deployProxy(MiniFL, [alpacaToken.address, ALPACA_REWARD_PER_SEC])) as MiniFL;

    stakingTokens = new Array();
    for (let i = 0; i < 4; i++) {
      const mockERC20 = (await upgrades.deployProxy(MockERC20, [`STOKEN${i}`, `STOKEN${i}`, 18])) as MockERC20;
      await Promise.all([
        mockERC20.mint(deployer.address, ethers.utils.parseEther("1000000")),
        mockERC20.mint(alice.address, ethers.utils.parseEther("1000000")),
        mockERC20.mint(bob.address, ethers.utils.parseEther("1000000")),
      ]);
      stakingTokens.push(mockERC20);
    }

    alpacaTokenAsAlice = MockERC20__factory.connect(alpacaToken.address, alice);
    alpacaTokenAsBob = MockERC20__factory.connect(alpacaToken.address, bob);
    alpacaTokenAsDev = MockERC20__factory.connect(alpacaToken.address, dev);

    stoken0AsAlice = MockERC20__factory.connect(stakingTokens[0].address, alice);
    stoken0AsBob = MockERC20__factory.connect(stakingTokens[0].address, bob);
    stoken0AsDev = MockERC20__factory.connect(stakingTokens[0].address, dev);

    stoken1AsAlice = MockERC20__factory.connect(stakingTokens[1].address, alice);
    stoken1AsBob = MockERC20__factory.connect(stakingTokens[1].address, bob);
    stoken1AsDev = MockERC20__factory.connect(stakingTokens[1].address, dev);

    stoken2AsAlice = MockERC20__factory.connect(stakingTokens[2].address, alice);
    stoken2AsBob = MockERC20__factory.connect(stakingTokens[2].address, bob);
    stoken2AsDev = MockERC20__factory.connect(stakingTokens[2].address, dev);

    stoken3AsAlice = MockERC20__factory.connect(stakingTokens[3].address, alice);
    stoken3AsBob = MockERC20__factory.connect(stakingTokens[3].address, bob);
    stoken3AsDev = MockERC20__factory.connect(stakingTokens[3].address, dev);

    miniFLasAlice = MiniFL__factory.connect(miniFL.address, alice);
    miniFLasBob = MiniFL__factory.connect(miniFL.address, bob);
    miniFLasDev = MiniFL__factory.connect(miniFL.address, dev);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  context("#addPool", async () => {
    it("should add new pool", async () => {
      for (let i = 0; i < stakingTokens.length; i++) {
        await miniFL.addPool(1, stakingTokens[i].address, ethers.constants.AddressZero, false, true);
      }
      expect(await miniFL.poolLength()).to.eq(stakingTokens.length);
      expect(await miniFL.totalAllocPoint()).to.be.eq(stakingTokens.length);
    });

    it("should revert when the stakeToken is already added to the pool", async () => {
      for (let i = 0; i < stakingTokens.length; i++) {
        await miniFL.addPool(1, stakingTokens[i].address, ethers.constants.AddressZero, false, true);
      }
      expect(await miniFL.poolLength()).to.eq(stakingTokens.length);
      expect(await miniFL.totalAllocPoint()).to.be.eq(stakingTokens.length);

      await expect(
        miniFL.addPool(1, stakingTokens[0].address, ethers.constants.AddressZero, false, true)
      ).to.be.revertedWith("MiniFL_DuplicatePool()");
    });
  });

  context("#deposit", async () => {
    beforeEach(async () => {
      await miniFL.addPool(1, stakingTokens[0].address, ethers.constants.AddressZero, false, true);
    });

    context("when deposit to not existed pool", async () => {
      it("should revert", async () => {
        await expect(miniFL.deposit(deployer.address, 88, ethers.utils.parseEther("100"))).to.be.reverted;
      });
    });

    context("when pool is debtToken", async () => {
      beforeEach(async () => {
        await miniFL.addPool(1, stakingTokens[1].address, ethers.constants.AddressZero, true, true);
      });

      context("when msg.sender is NOT allow to stake debtToken", async () => {
        context("when `_for` is the same as `msg.sender`", async () => {
          it("should revert", async () => {
            await expect(miniFLasAlice.deposit(alice.address, 1, ethers.utils.parseEther("100"))).to.be.revertedWith(
              "MiniFL_Forbidden()"
            );
          });
        });

        context("when `_for` is different from `msg.sender`", async () => {
          it("should revert", async () => {
            await expect(miniFLasAlice.deposit(bob.address, 1, ethers.utils.parseEther("100"))).to.be.revertedWith(
              "MiniFL_Forbidden()"
            );
          });
        });
      });

      context("when msg.sender is allow to stake debtToken", async () => {
        context("when `_for` is the same as `msg.sender", async () => {
          it("should work", async () => {
            await miniFL.approveStakeDebtToken([1], [alice.address], true);

            expect(await miniFL.stakeDebtTokenAllowance(1, alice.address)).to.be.eq(true);

            const aliceStoken1Before = await stoken1AsAlice.balanceOf(alice.address);

            await stoken1AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
            await miniFLasAlice.deposit(alice.address, 1, ethers.utils.parseEther("100"));

            const aliceStoken1After = await stoken1AsAlice.balanceOf(alice.address);

            expect(aliceStoken1After).to.be.eq(aliceStoken1Before.sub(ethers.utils.parseEther("100")));
          });
        });

        context("when `_for` is different from `msg.sender", async () => {
          it("should work", async () => {
            await miniFL.approveStakeDebtToken([1], [alice.address], true);

            expect(await miniFL.stakeDebtTokenAllowance(1, alice.address)).to.be.eq(true);

            const aliceStoken1Before = await stoken1AsAlice.balanceOf(alice.address);

            await stoken1AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
            await miniFLasAlice.deposit(bob.address, 1, ethers.utils.parseEther("100"));

            const aliceStoken1After = await stoken1AsAlice.balanceOf(alice.address);

            expect(aliceStoken1After).to.be.eq(aliceStoken1Before.sub(ethers.utils.parseEther("100")));
          });
        });
      });
    });

    context("when pool is ibToken", async () => {
      context("when `_for` is different from `msg.sender`", async () => {
        it("should revert", async () => {
          await expect(miniFL.deposit(bob.address, 0, ethers.utils.parseEther("100"))).to.be.revertedWith(
            "MiniFL_Forbidden()"
          );
        });
      });

      context("when `_for` is the same as `msg.sender", async () => {
        it("should work", async () => {
          const aliceStoken0Before = await stoken0AsAlice.balanceOf(alice.address);

          await stoken0AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
          await miniFLasAlice.deposit(alice.address, 0, ethers.utils.parseEther("100"));

          const aliceStoken0After = await stoken0AsAlice.balanceOf(alice.address);

          expect(aliceStoken0After).to.be.eq(aliceStoken0Before.sub(ethers.utils.parseEther("100")));
        });
      });
    });

    context("when pool has rewarder", async () => {
      let rewarder1: Rewarder1;

      beforeEach(async () => {
        const Rewarder1 = (await ethers.getContractFactory("Rewarder1", deployer)) as Rewarder1__factory;
        rewarder1 = (await upgrades.deployProxy(Rewarder1, [
          "MockRewarder1",
          miniFL.address,
          extraRewardToken.address,
          ALPACA_REWARD_PER_SEC,
        ])) as Rewarder1;

        await miniFL.addPool(1, stakingTokens[1].address, rewarder1.address, false, true);
        await rewarder1.addPool(1, 1, true);

        await miniFL.addPool(1, stakingTokens[2].address, rewarder1.address, true, true);
        await miniFL.approveStakeDebtToken([2], [alice.address], true);
        await rewarder1.addPool(1, 2, true);
        expect(await miniFL.stakeDebtTokenAllowance(2, alice.address)).to.be.eq(true);
      });

      context("when pool is debtToken", async () => {
        context("when msg.sender is allow to stake debtToken", async () => {
          context("when `_for` is the same as `msg.sender", async () => {
            it("should work", async () => {
              const aliceStoken2Before = await stoken2AsAlice.balanceOf(alice.address);

              await stoken2AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
              await miniFLasAlice.deposit(alice.address, 2, ethers.utils.parseEther("100"));

              const aliceStoken2After = await stoken2AsAlice.balanceOf(alice.address);

              expect((await rewarder1.userInfo(2, alice.address)).amount).to.be.eq(ethers.utils.parseEther("100"));
              expect((await rewarder1.userInfo(2, bob.address)).amount).to.be.eq(ethers.utils.parseEther("0"));
              expect(aliceStoken2After).to.be.eq(aliceStoken2Before.sub(ethers.utils.parseEther("100")));
            });
          });

          context("when `_for` is different from `msg.sender", async () => {
            it("should work", async () => {
              const aliceStoken2Before = await stoken2AsAlice.balanceOf(alice.address);

              await stoken2AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
              await miniFLasAlice.deposit(bob.address, 2, ethers.utils.parseEther("100"));

              const aliceStoken2After = await stoken2AsAlice.balanceOf(alice.address);

              expect((await rewarder1.userInfo(2, bob.address)).amount).to.be.eq(ethers.utils.parseEther("100"));
              expect((await rewarder1.userInfo(2, alice.address)).amount).to.be.eq(ethers.utils.parseEther("0"));
              expect(aliceStoken2After).to.be.eq(aliceStoken2Before.sub(ethers.utils.parseEther("100")));
            });
          });
        });
      });

      context("when pool is ibToken", async () => {
        context("when `_for` is the same as `msg.sender", async () => {
          it("should work", async () => {
            const aliceStoken1Before = await stoken1AsAlice.balanceOf(alice.address);

            await stoken1AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
            await miniFLasAlice.deposit(alice.address, 1, ethers.utils.parseEther("100"));

            const aliceStoken1After = await stoken1AsAlice.balanceOf(alice.address);

            expect((await rewarder1.userInfo(1, alice.address)).amount).to.be.eq(ethers.utils.parseEther("100"));
            expect(aliceStoken1After).to.be.eq(aliceStoken1Before.sub(ethers.utils.parseEther("100")));
          });
        });
      });
    });
  });

  context("#withdraw", async () => {
    beforeEach(async () => {
      // Set ALPACA per Second here to make sure that even if no ALPACA in MiniFL, it still works
      await miniFL.setAlpacaPerSecond(ALPACA_REWARD_PER_SEC, true);
      await miniFL.addPool(1, stakingTokens[0].address, ethers.constants.AddressZero, false, true);

      await stoken0AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
      await miniFLasAlice.deposit(alice.address, 0, ethers.utils.parseEther("100"));
    });

    context("when pool is debtToken", async () => {
      beforeEach(async () => {
        await miniFL.addPool(1, stakingTokens[1].address, ethers.constants.AddressZero, true, true);
        await miniFL.approveStakeDebtToken([1], [alice.address], true);

        await stoken1AsAlice.approve(miniFL.address, ethers.utils.parseEther("200"));
        await miniFLasAlice.deposit(alice.address, 1, ethers.utils.parseEther("100"));
        await miniFLasAlice.deposit(bob.address, 1, ethers.utils.parseEther("100"));
      });

      context("when msg.sender is NOT allow to stake debtToken", async () => {
        context("when `_for` is the same as `msg.sender`", async () => {
          it("should revert", async () => {
            await expect(miniFLasBob.withdraw(bob.address, 1, ethers.utils.parseEther("100"))).to.be.revertedWith(
              "MiniFL_Forbidden()"
            );
          });
        });

        context("when `_for` is different from `msg.sender`", async () => {
          it("should revert", async () => {
            await expect(miniFLasBob.withdraw(alice.address, 1, ethers.utils.parseEther("100"))).to.be.revertedWith(
              "MiniFL_Forbidden()"
            );
          });
        });
      });

      context("when msg.sender is allow to stake debtToken", async () => {
        context("when `_for` is the same as `msg.sender", async () => {
          it("should work", async () => {
            const aliceStoken1Before = await stoken1AsAlice.balanceOf(alice.address);

            await miniFLasAlice.withdraw(alice.address, 1, ethers.utils.parseEther("100"));

            const aliceStoken1After = await stoken1AsAlice.balanceOf(alice.address);

            expect(aliceStoken1After).to.be.eq(aliceStoken1Before.add(ethers.utils.parseEther("100")));
            expect(await miniFL.pendingAlpaca(1, alice.address)).to.be.gt(0);
          });
        });

        context("when `_for` is different from `msg.sender", async () => {
          it("should work", async () => {
            const aliceStoken1Before = await stoken1AsAlice.balanceOf(alice.address);

            await miniFLasAlice.withdraw(bob.address, 1, ethers.utils.parseEther("100"));

            const aliceStoken1After = await stoken1AsAlice.balanceOf(alice.address);

            expect(aliceStoken1After).to.be.eq(aliceStoken1Before.add(ethers.utils.parseEther("100")));
            expect(await miniFL.pendingAlpaca(1, bob.address)).to.be.gt(0);
          });
        });
      });
    });

    context("when pool is ibToken", async () => {
      context("when `_for` is different from `msg.sender`", async () => {
        it("should revert", async () => {
          await expect(miniFLasAlice.withdraw(bob.address, 0, ethers.utils.parseEther("100"))).to.be.revertedWith(
            "MiniFL_Forbidden()"
          );
        });
      });

      context("when `_for` is the same as `msg.sender", async () => {
        it("should work", async () => {
          const aliceStoken0Before = await stoken0AsAlice.balanceOf(alice.address);

          await miniFLasAlice.withdraw(alice.address, 0, ethers.utils.parseEther("100"));

          const aliceStoken0After = await stoken0AsAlice.balanceOf(alice.address);

          expect(aliceStoken0After).to.be.eq(aliceStoken0Before.add(ethers.utils.parseEther("100")));
          expect(await miniFL.pendingAlpaca(0, alice.address)).to.be.gt(0);
        });
      });
    });

    context("when pool has rewarder", async () => {
      let rewarder1: Rewarder1;

      beforeEach(async () => {
        const Rewarder1 = (await ethers.getContractFactory("Rewarder1", deployer)) as Rewarder1__factory;
        rewarder1 = (await upgrades.deployProxy(Rewarder1, [
          "MockRewarder1",
          miniFL.address,
          extraRewardToken.address,
          ALPACA_REWARD_PER_SEC,
        ])) as Rewarder1;

        // Set Reward Per Second here to make sure that even if no reward in Rewarder1, it still works
        await rewarder1.setRewardPerSecond(ALPACA_REWARD_PER_SEC, true);

        await miniFL.addPool(1, stakingTokens[1].address, rewarder1.address, false, true);
        await rewarder1.addPool(1, 1, true);
        await stoken1AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
        await miniFLasAlice.deposit(alice.address, 1, ethers.utils.parseEther("100"));

        await miniFL.addPool(1, stakingTokens[2].address, rewarder1.address, true, true);
        await miniFL.approveStakeDebtToken([2], [alice.address], true);
        await rewarder1.addPool(1, 2, true);
        expect(await miniFL.stakeDebtTokenAllowance(2, alice.address)).to.be.eq(true);
        await stoken2AsAlice.approve(miniFL.address, ethers.utils.parseEther("200"));
        await miniFLasAlice.deposit(alice.address, 2, ethers.utils.parseEther("100"));
        await miniFLasAlice.deposit(bob.address, 2, ethers.utils.parseEther("100"));
      });

      context("when pool is debtToken", async () => {
        context("when msg.sender is allow to stake debtToken", async () => {
          context("when `_for` is the same as `msg.sender", async () => {
            it("should work", async () => {
              const aliceStoken2Before = await stoken2AsAlice.balanceOf(alice.address);

              await miniFLasAlice.withdraw(alice.address, 2, ethers.utils.parseEther("100"));

              const aliceStoken2After = await stoken2AsAlice.balanceOf(alice.address);

              expect(aliceStoken2After).to.be.eq(aliceStoken2Before.add(ethers.utils.parseEther("100")));
              expect(await miniFL.pendingAlpaca(2, alice.address)).to.be.gt(0);
              expect((await rewarder1.userInfo(2, alice.address)).amount).to.be.eq(0);
              expect(await rewarder1.pendingToken(2, alice.address)).to.be.gt(0);
            });
          });

          context("when `_for` is different from `msg.sender", async () => {
            it("should work", async () => {
              const aliceStoken2Before = await stoken2AsAlice.balanceOf(alice.address);

              await miniFLasAlice.withdraw(bob.address, 2, ethers.utils.parseEther("100"));

              const aliceStoken2After = await stoken2AsAlice.balanceOf(alice.address);

              expect(aliceStoken2After).to.be.eq(aliceStoken2Before.add(ethers.utils.parseEther("100")));
              expect(await miniFL.pendingAlpaca(2, bob.address)).to.be.gt(0);
              expect((await rewarder1.userInfo(2, bob.address)).amount).to.be.eq(0);
              expect(await rewarder1.pendingToken(2, bob.address)).to.be.gt(0);
            });
          });
        });
      });

      context("when pool is ibToken", async () => {
        context("when `_for` is the same as `msg.sender", async () => {
          it("should work", async () => {
            const aliceStoken1Before = await stoken1AsAlice.balanceOf(alice.address);

            await miniFLasAlice.withdraw(alice.address, 1, ethers.utils.parseEther("100"));

            const aliceStoken1After = await stoken1AsAlice.balanceOf(alice.address);

            expect(aliceStoken1After).to.be.eq(aliceStoken1Before.add(ethers.utils.parseEther("100")));
            expect(await miniFL.pendingAlpaca(1, alice.address)).to.be.gt(0);
            expect((await rewarder1.userInfo(1, alice.address)).amount).to.be.eq(0);
            expect(await rewarder1.pendingToken(1, alice.address)).to.be.gt(0);
          });
        });
      });
    });
  });

  context("#harvest", async () => {
    let stages: any = {};
    let rewarder1: Rewarder1;

    beforeEach(async () => {
      stages = {};

      const Rewarder1 = await ethers.getContractFactory("Rewarder1");
      rewarder1 = (await upgrades.deployProxy(Rewarder1, [
        "MockRewarder1",
        miniFL.address,
        extraRewardToken.address,
        ALPACA_REWARD_PER_SEC,
      ])) as Rewarder1;

      await alpacaToken.mint(deployer.address, ethers.utils.parseEther("1000000"));
      await alpacaToken.transfer(miniFL.address, ethers.utils.parseEther("1000000"));

      await extraRewardToken.mint(deployer.address, ethers.utils.parseEther("1000000"));
      await extraRewardToken.transfer(rewarder1.address, ethers.utils.parseEther("1000000"));

      await rewarder1.setRewardPerSecond(ALPACA_REWARD_PER_SEC, true);
      await miniFL.setAlpacaPerSecond(ALPACA_REWARD_PER_SEC, true);

      await miniFL.addPool(1, stakingTokens[0].address, ethers.constants.AddressZero, false, true);

      await miniFL.addPool(1, stakingTokens[1].address, ethers.constants.AddressZero, true, true);
      await miniFL.approveStakeDebtToken([1], [alice.address], true);

      await miniFL.addPool(1, stakingTokens[2].address, rewarder1.address, false, true);
      await rewarder1.addPool(1, 2, true);

      await miniFL.addPool(1, stakingTokens[3].address, rewarder1.address, true, true);
      await rewarder1.addPool(1, 3, true);
      await miniFL.approveStakeDebtToken([3], [alice.address], true);

      await stoken0AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
      await miniFLasAlice.deposit(alice.address, 0, ethers.utils.parseEther("100"));
      stages["alice_deposit_0"] = await timeHelpers.latest();

      await stoken1AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
      await miniFLasAlice.deposit(bob.address, 1, ethers.utils.parseEther("100"));
      stages["alice_deposit_1"] = await timeHelpers.latest();

      await stoken2AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
      await miniFLasAlice.deposit(alice.address, 2, ethers.utils.parseEther("100"));
      stages["alice_deposit_2"] = await timeHelpers.latest();

      await stoken3AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
      await miniFLasAlice.deposit(bob.address, 3, ethers.utils.parseEther("100"));
      stages["alice_deposit_3"] = await timeHelpers.latest();
    });

    context("when no pending rewards", async () => {
      it("should get no rewards when user harvests", async () => {
        expect(await miniFL.pendingAlpaca(0, deployer.address)).to.be.eq(0);

        const alpaceBefore = await alpacaToken.balanceOf(deployer.address);
        await miniFL.harvest(0);
        const alpacaAfter = await alpacaToken.balanceOf(deployer.address);

        expect(alpacaAfter).to.be.eq(alpaceBefore);
      });
    });

    context("when Bob harvest from debtToken pool", async () => {
      it("should work", async () => {
        const bobAlpacaBefore = await alpacaToken.balanceOf(bob.address);

        await miniFLasBob.harvest(1);
        stages["bob_withdraw_1"] = await timeHelpers.latest();

        const pool1allocPoint = (await miniFL.poolInfo(1)).allocPoint;
        const totalAllocPoint = await miniFL.totalAllocPoint();
        const bobAlpacaAfter = await alpacaToken.balanceOf(bob.address);
        const expectedAlpacaReward = stages["bob_withdraw_1"]
          .sub(stages["alice_deposit_1"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(pool1allocPoint)
          .div(totalAllocPoint);
        expect(bobAlpacaAfter).to.be.eq(bobAlpacaBefore.add(expectedAlpacaReward));
      });
    });

    context("when Alice harvest from ibToken pool", async () => {
      it("should work", async () => {
        const aliceAlpacaBefore = await alpacaToken.balanceOf(alice.address);

        await miniFLasAlice.harvest(0);
        stages["alice_withdraw_0"] = await timeHelpers.latest();

        const pool0allocPoint = (await miniFL.poolInfo(0)).allocPoint;
        const totalAllocPoint = await miniFL.totalAllocPoint();
        const aliceAlpacaAfter = await alpacaToken.balanceOf(alice.address);
        const expectedIbReward = stages["alice_withdraw_0"]
          .sub(stages["alice_deposit_0"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(pool0allocPoint)
          .div(totalAllocPoint);
        expect(aliceAlpacaAfter).to.be.eq(aliceAlpacaBefore.add(expectedIbReward));
      });
    });

    context("when not enough ALPACA to harvest", async () => {
      it("should revert", async () => {
        const currentBlockTimestamp = await timeHelpers.latest();
        await timeHelpers.set(currentBlockTimestamp.add(ethers.BigNumber.from("365").mul("24").mul("60").mul("60")));

        await expect(miniFLasAlice.harvest(0)).to.be.reverted;
      });
    });

    context("when pool has rewarder", async () => {
      context("when Bob harvest from debtToken pool", async () => {
        it("should work", async () => {
          const bobAlpacaBefore = await alpacaToken.balanceOf(bob.address);
          const extraBefore = await extraRewardToken.balanceOf(bob.address);

          await miniFLasBob.harvest(3);
          stages["bob_withdraw_3"] = await timeHelpers.latest();

          const pool3allocPoint = (await miniFL.poolInfo(3)).allocPoint;
          const totalAllocPoint = await miniFL.totalAllocPoint();
          const expectedAlpacaReward = stages["bob_withdraw_3"]
            .sub(stages["alice_deposit_3"])
            .mul(ALPACA_REWARD_PER_SEC)
            .mul(pool3allocPoint)
            .div(totalAllocPoint);
          const rewarder1Pool3allocPoint = (await rewarder1.poolInfo(3)).allocPoint;
          const rewarder1TotalAllocPoint = await rewarder1.totalAllocPoint();
          const expectedExtraReward = stages["bob_withdraw_3"]
            .sub(stages["alice_deposit_3"])
            .mul(ALPACA_REWARD_PER_SEC)
            .mul(rewarder1Pool3allocPoint)
            .div(rewarder1TotalAllocPoint);

          const bobAlpacaAfter = await alpacaToken.balanceOf(bob.address);
          expect(bobAlpacaAfter).to.be.eq(bobAlpacaBefore.add(expectedAlpacaReward));

          const extraAfter = await extraRewardToken.balanceOf(bob.address);
          expect(extraAfter).to.be.eq(extraBefore.add(expectedExtraReward));
        });
      });

      context("when Alice harvest from ibToken pool", async () => {
        it("should work", async () => {
          const aliceAlpacaBefore = await alpacaToken.balanceOf(alice.address);
          const aliceExtraBefore = await extraRewardToken.balanceOf(alice.address);

          await miniFLasAlice.harvest(2);
          stages["alice_withdraw_2"] = await timeHelpers.latest();

          const pool2allocPoint = (await miniFL.poolInfo(2)).allocPoint;
          const totalAllocPoint = await miniFL.totalAllocPoint();
          const expectedAlpacaReward = stages["alice_withdraw_2"]
            .sub(stages["alice_deposit_2"])
            .mul(ALPACA_REWARD_PER_SEC)
            .mul(pool2allocPoint)
            .div(totalAllocPoint);

          const rewarder1Pool2allocPoint = (await rewarder1.poolInfo(2)).allocPoint;
          const rewarder1TotalAllocPoint = await rewarder1.totalAllocPoint();
          const expectedExtraReward = stages["alice_withdraw_2"]
            .sub(stages["alice_deposit_2"])
            .mul(ALPACA_REWARD_PER_SEC)
            .mul(rewarder1Pool2allocPoint)
            .div(rewarder1TotalAllocPoint);

          const aliceAlpacaAfter = await alpacaToken.balanceOf(alice.address);
          expect(aliceAlpacaAfter).to.be.eq(aliceAlpacaBefore.add(expectedAlpacaReward));

          const aliceExtraAfter = await extraRewardToken.balanceOf(alice.address);
          expect(aliceExtraAfter).to.be.eq(aliceExtraBefore.add(expectedExtraReward));
        });
      });

      context("when not enough ALPACA to harvest", async () => {
        it("should revert", async () => {
          const currentBlockTimestamp = await timeHelpers.latest();
          await timeHelpers.set(currentBlockTimestamp.add(ethers.BigNumber.from("365").mul("24").mul("60").mul("60")));

          await expect(miniFLasAlice.harvest(2)).to.be.reverted;
        });
      });

      context("when not enough EXTRA to harvest", async () => {
        it("should revert", async () => {
          const targetTimestamp = (await timeHelpers.latest()).add(
            ethers.BigNumber.from("365").mul("24").mul("60").mul("60")
          );
          await alpacaToken.mint(miniFL.address, targetTimestamp.mul(ALPACA_REWARD_PER_SEC));
          await timeHelpers.set(targetTimestamp);

          await expect(miniFLasAlice.harvest(2)).to.be.reverted;
        });
      });
    });
  });

  context("#setAlpacaPerSecond", async () => {
    context("when Alice try to set ALPACA per second", async () => {
      it("should revert", async () => {
        await expect(miniFLasAlice.setAlpacaPerSecond(ALPACA_REWARD_PER_SEC, true)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    context("when new ALPACA per second more than max ALPACA per second", async () => {
      it("should revert", async () => {
        await expect(miniFL.setAlpacaPerSecond(ALPACA_REWARD_PER_SEC.add(1), true)).to.be.revertedWith(
          "MiniFL_InvalidArguments()"
        );
      });
    });

    context("when new ALPACA per second less than max ALPACA per second", async () => {
      it("should work", async () => {
        await miniFL.setAlpacaPerSecond(ethers.utils.parseEther("1"), true);
        expect(await miniFL.alpacaPerSecond()).to.be.eq(ethers.utils.parseEther("1"));
      });
    });
  });

  context("#setMaxAlpacaPerSecond", async () => {
    context("when Alice try to set max ALPACA per second", async () => {
      it("should revert", async () => {
        await expect(miniFLasAlice.setMaxAlpacaPerSecond(ALPACA_REWARD_PER_SEC)).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
      });
    });

    context("when new max ALPACA per second less than alpaca per second", async () => {
      it("should revert", async () => {
        await miniFL.setAlpacaPerSecond(ALPACA_REWARD_PER_SEC, true);
        await expect(miniFL.setMaxAlpacaPerSecond(ALPACA_REWARD_PER_SEC.sub(1))).to.be.revertedWith(
          "MiniFL_InvalidArguments()"
        );
      });
    });

    context("when new max ALPACA per second more than ALPACA per second", async () => {
      it("should work", async () => {
        await miniFL.setMaxAlpacaPerSecond(ALPACA_REWARD_PER_SEC.add(1));
        expect(await miniFL.maxAlpacaPerSecond()).to.be.eq(ALPACA_REWARD_PER_SEC.add(1));
      });
    });
  });

  context("#emergencyWithdraw", async () => {
    let rewarder1: Rewarder1;

    beforeEach(async () => {
      await alpacaToken.mint(deployer.address, ethers.utils.parseEther("1000000"));
      await alpacaToken.transfer(miniFL.address, ethers.utils.parseEther("1000000"));

      await miniFL.setAlpacaPerSecond(ALPACA_REWARD_PER_SEC, true);

      await miniFL.addPool(1, stakingTokens[0].address, ethers.constants.AddressZero, false, true);

      await miniFL.addPool(1, stakingTokens[1].address, ethers.constants.AddressZero, true, true);
      await miniFL.approveStakeDebtToken([1], [alice.address], true);

      const Rewarder1 = (await ethers.getContractFactory("Rewarder1", deployer)) as Rewarder1__factory;
      rewarder1 = (await upgrades.deployProxy(Rewarder1, [
        "MockRewarder1",
        miniFL.address,
        extraRewardToken.address,
        ALPACA_REWARD_PER_SEC,
      ])) as Rewarder1;
      await rewarder1.setRewardPerSecond(ALPACA_REWARD_PER_SEC, true);
      await miniFL.addPool(1, stakingTokens[2].address, rewarder1.address, false, true);
      await rewarder1.addPool(1, 2, true);

      await stoken0AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
      await miniFLasAlice.deposit(alice.address, 0, ethers.utils.parseEther("100"));

      await stoken1AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
      await miniFLasAlice.deposit(bob.address, 1, ethers.utils.parseEther("100"));

      await stoken2AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
      await miniFLasAlice.deposit(alice.address, 2, ethers.utils.parseEther("100"));
    });

    context("when pool is ibToken", async () => {
      it("should work", async () => {
        const stoken0before = await stakingTokens[0].balanceOf(alice.address);

        await miniFLasAlice.emergencyWithdraw(0);

        const stoken0after = await stakingTokens[0].balanceOf(alice.address);

        const aliceInfo = await miniFL.userInfo(0, alice.address);
        expect(stoken0after).to.be.eq(stoken0before.add(ethers.utils.parseEther("100")));
        expect(aliceInfo.amount).to.be.eq(0);
        expect(aliceInfo.rewardDebt).to.be.eq(0);
      });

      context("when pool has rewarder", async () => {
        it("should work", async () => {
          const stoken2before = await stakingTokens[2].balanceOf(alice.address);
          expect((await rewarder1.userInfo(2, alice.address)).amount).to.be.eq(ethers.utils.parseEther("100"));

          await miniFLasAlice.emergencyWithdraw(2);

          const stoken2after = await stakingTokens[2].balanceOf(alice.address);

          const aliceInfo = await miniFL.userInfo(2, alice.address);
          expect(stoken2after).to.be.eq(stoken2before.add(ethers.utils.parseEther("100")));
          expect((await rewarder1.userInfo(2, alice.address)).amount).to.be.eq(0);
          expect(aliceInfo.amount).to.be.eq(0);
          expect(aliceInfo.rewardDebt).to.be.eq(0);

          const pendingExtraReward = await rewarder1.pendingToken(2, alice.address);
          expect(pendingExtraReward).to.be.gt(0);

          await timeHelpers.increase(ethers.BigNumber.from("86400"));

          expect(await rewarder1.pendingToken(2, alice.address)).to.be.eq(pendingExtraReward);
        });
      });
    });

    context("when pool is debtToken", async () => {
      it("should revert", async () => {
        await expect(miniFLasAlice.emergencyWithdraw(1)).to.be.revertedWith("MiniFL_Forbidden()");
        await expect(miniFLasBob.emergencyWithdraw(1)).to.be.revertedWith("MiniFL_Forbidden()");
      });
    });
  });

  context("#complex", async () => {
    let stages: any = {};
    let rewarder1: Rewarder1;

    beforeEach(async () => {
      stages = {};

      const Rewarder1 = await ethers.getContractFactory("Rewarder1");
      rewarder1 = (await upgrades.deployProxy(Rewarder1, [
        "MockRewarder1",
        miniFL.address,
        extraRewardToken.address,
        ALPACA_REWARD_PER_SEC,
      ])) as Rewarder1;

      await alpacaToken.mint(deployer.address, ethers.utils.parseEther("1000000"));
      await alpacaToken.transfer(miniFL.address, ethers.utils.parseEther("1000000"));

      await extraRewardToken.mint(deployer.address, ethers.utils.parseEther("1000000"));
      await extraRewardToken.transfer(rewarder1.address, ethers.utils.parseEther("1000000"));

      await miniFL.setAlpacaPerSecond(ALPACA_REWARD_PER_SEC, true);
      await rewarder1.setRewardPerSecond(ALPACA_REWARD_PER_SEC, true);

      await miniFL.addPool(1, stakingTokens[0].address, ethers.constants.AddressZero, false, true);
      await rewarder1.addPool(1, 0, true);
    });

    it("should work", async () => {
      let aliceDepositAmount = ethers.utils.parseEther("100");
      let bobDepositAmount = ethers.utils.parseEther("400");
      let totalAmount = ethers.utils.parseEther("100").add(ethers.utils.parseEther("400"));

      let aliceExpectedAlpacaReward = ethers.BigNumber.from("0");
      let bobExpectedAlpacaReward = ethers.BigNumber.from("0");
      let aliceExpectedExtraReward = ethers.BigNumber.from("0");
      let bobExpectedExtraReward = ethers.BigNumber.from("0");

      await stoken0AsAlice.approve(miniFL.address, ethers.constants.MaxUint256);
      await stoken0AsBob.approve(miniFL.address, ethers.constants.MaxUint256);

      // Alice deposit
      await miniFLasAlice.deposit(alice.address, 0, aliceDepositAmount);
      stages["alice_deposit_0"] = await timeHelpers.latest();

      // Bob deposit
      await miniFLasBob.deposit(bob.address, 0, bobDepositAmount);
      stages["bob_deposit_0"] = await timeHelpers.latest();

      // Assert expectedAlpacaReward for both Bob & Alice
      aliceExpectedAlpacaReward = aliceExpectedAlpacaReward.add(
        stages["bob_deposit_0"].sub(stages["alice_deposit_0"]).mul(ALPACA_REWARD_PER_SEC)
      );
      expect(await miniFL.pendingAlpaca(0, alice.address)).to.be.eq(aliceExpectedAlpacaReward);
      expect(await miniFL.pendingAlpaca(0, bob.address)).to.be.eq(bobExpectedAlpacaReward);

      // Assuming 1 day pass
      await timeHelpers.increase(ethers.BigNumber.from("86400"));
      stages["advance_time_0"] = await timeHelpers.latest();

      // Assert expectedAlpacaReward for both Bob & Alice
      aliceExpectedAlpacaReward = aliceExpectedAlpacaReward.add(
        stages["advance_time_0"]
          .sub(stages["bob_deposit_0"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(aliceDepositAmount)
          .div(totalAmount)
      );
      bobExpectedAlpacaReward = bobExpectedAlpacaReward.add(
        stages["advance_time_0"]
          .sub(stages["bob_deposit_0"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(bobDepositAmount)
          .div(totalAmount)
      );
      expect(await miniFL.pendingAlpaca(0, alice.address)).to.be.eq(aliceExpectedAlpacaReward);
      expect(await miniFL.pendingAlpaca(0, bob.address)).to.be.eq(bobExpectedAlpacaReward);

      // Assuming Alice withdraw half of her deposit
      await miniFLasAlice.withdraw(alice.address, 0, aliceDepositAmount.div(2));
      stages["alice_withdraw_1"] = await timeHelpers.latest();

      // Assert expectedAlpacaReward for both Bob & Alice
      aliceExpectedAlpacaReward = aliceExpectedAlpacaReward.add(
        stages["alice_withdraw_1"]
          .sub(stages["advance_time_0"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(aliceDepositAmount)
          .div(totalAmount)
      );
      bobExpectedAlpacaReward = bobExpectedAlpacaReward.add(
        stages["alice_withdraw_1"]
          .sub(stages["advance_time_0"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(bobDepositAmount)
          .div(totalAmount)
      );
      expect(await miniFL.pendingAlpaca(0, alice.address)).to.be.eq(aliceExpectedAlpacaReward);
      expect(await miniFL.pendingAlpaca(0, bob.address)).to.be.eq(bobExpectedAlpacaReward);

      // Update deposit amount
      aliceDepositAmount = aliceDepositAmount.sub(aliceDepositAmount.div(2));
      totalAmount = aliceDepositAmount.add(bobDepositAmount);

      // Assuming 1 day pass
      await timeHelpers.increase(ethers.BigNumber.from("86400"));
      stages["advance_time_1"] = await timeHelpers.latest();

      // Assert expectedAlpacaReward for both Bob & Alice
      aliceExpectedAlpacaReward = aliceExpectedAlpacaReward.add(
        stages["advance_time_1"]
          .sub(stages["alice_withdraw_1"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(aliceDepositAmount)
          .div(totalAmount)
      );
      bobExpectedAlpacaReward = bobExpectedAlpacaReward.add(
        stages["advance_time_1"]
          .sub(stages["alice_withdraw_1"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(bobDepositAmount)
          .div(totalAmount)
      );
      assertHelpers.assertBigNumberClosePercent(
        await miniFL.pendingAlpaca(0, alice.address),
        aliceExpectedAlpacaReward
      );
      assertHelpers.assertBigNumberClosePercent(await miniFL.pendingAlpaca(0, bob.address), bobExpectedAlpacaReward);

      // Enabling rewarder1
      await miniFL.setPool(0, 1, rewarder1.address, true, true);
      stages["enable_rewarder"] = await timeHelpers.latest();

      expect(await miniFL.rewarder(0)).to.be.eq(rewarder1.address);

      // Assert expectedAlpacaReward for both Bob & Alice
      aliceExpectedAlpacaReward = aliceExpectedAlpacaReward.add(
        stages["enable_rewarder"]
          .sub(stages["advance_time_1"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(aliceDepositAmount)
          .div(totalAmount)
      );
      bobExpectedAlpacaReward = bobExpectedAlpacaReward.add(
        stages["enable_rewarder"]
          .sub(stages["advance_time_1"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(bobDepositAmount)
          .div(totalAmount)
      );
      assertHelpers.assertBigNumberClosePercent(
        await miniFL.pendingAlpaca(0, alice.address),
        aliceExpectedAlpacaReward
      );
      assertHelpers.assertBigNumberClosePercent(await miniFL.pendingAlpaca(0, bob.address), bobExpectedAlpacaReward);

      // Alice deposit
      await miniFLasAlice.deposit(alice.address, 0, aliceDepositAmount.mul(2));
      stages["alice_deposit_0"] = await timeHelpers.latest();

      // Assert expectedAlpacaReward for both Bob & Alice
      aliceExpectedAlpacaReward = aliceExpectedAlpacaReward.add(
        stages["alice_deposit_0"]
          .sub(stages["enable_rewarder"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(aliceDepositAmount)
          .div(totalAmount)
      );
      bobExpectedAlpacaReward = bobExpectedAlpacaReward.add(
        stages["alice_deposit_0"]
          .sub(stages["enable_rewarder"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(bobDepositAmount)
          .div(totalAmount)
      );
      assertHelpers.assertBigNumberClosePercent(
        await miniFL.pendingAlpaca(0, alice.address),
        aliceExpectedAlpacaReward
      );
      assertHelpers.assertBigNumberClosePercent(await miniFL.pendingAlpaca(0, bob.address), bobExpectedAlpacaReward);

      // Assert expectedExtraReward for both Alice & Bob
      expect(await rewarder1.pendingToken(0, alice.address)).to.be.eq(0);
      expect(await rewarder1.pendingToken(0, bob.address)).to.be.eq(0);

      // Update deposit balance
      aliceDepositAmount = aliceDepositAmount.add(aliceDepositAmount.mul(2));
      totalAmount = aliceDepositAmount.add(bobDepositAmount);

      // Assert balances on rewarder1
      expect((await rewarder1.userInfo(0, alice.address)).amount).to.be.eq(aliceDepositAmount);
      expect((await rewarder1.userInfo(0, bob.address)).amount).to.be.eq(0);

      // Assuming 1 day pass
      await timeHelpers.increase(ethers.BigNumber.from("86400"));
      stages["advance_time_2"] = await timeHelpers.latest();

      // Assert expectedAlpacaReward for both Bob & Alice
      aliceExpectedAlpacaReward = aliceExpectedAlpacaReward.add(
        stages["advance_time_2"]
          .sub(stages["alice_deposit_0"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(aliceDepositAmount)
          .div(totalAmount)
      );
      bobExpectedAlpacaReward = bobExpectedAlpacaReward.add(
        stages["advance_time_2"]
          .sub(stages["alice_deposit_0"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(bobDepositAmount)
          .div(totalAmount)
      );
      assertHelpers.assertBigNumberClosePercent(
        await miniFL.pendingAlpaca(0, alice.address),
        aliceExpectedAlpacaReward
      );
      assertHelpers.assertBigNumberClosePercent(await miniFL.pendingAlpaca(0, bob.address), bobExpectedAlpacaReward);

      // Assert expectedExtraReward for both Bob & Alice
      aliceExpectedExtraReward = aliceExpectedExtraReward.add(
        stages["advance_time_2"]
          .sub(stages["alice_deposit_0"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(aliceDepositAmount)
          .div(totalAmount)
      );
      assertHelpers.assertBigNumberClosePercent(
        await rewarder1.pendingToken(0, alice.address),
        aliceExpectedExtraReward
      );
      expect(await rewarder1.pendingToken(0, bob.address)).to.be.eq(0);

      // Assuming 1 day pass
      await timeHelpers.increase(ethers.BigNumber.from("86400"));
      stages["advance_time_3"] = await timeHelpers.latest();

      // Assert expectedAlpacaReward for both Bob & Alice
      aliceExpectedAlpacaReward = aliceExpectedAlpacaReward.add(
        stages["advance_time_3"]
          .sub(stages["advance_time_2"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(aliceDepositAmount)
          .div(totalAmount)
      );
      bobExpectedAlpacaReward = bobExpectedAlpacaReward.add(
        stages["advance_time_3"]
          .sub(stages["advance_time_2"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(bobDepositAmount)
          .div(totalAmount)
      );
      assertHelpers.assertBigNumberClosePercent(
        await miniFL.pendingAlpaca(0, alice.address),
        aliceExpectedAlpacaReward
      );
      assertHelpers.assertBigNumberClosePercent(await miniFL.pendingAlpaca(0, bob.address), bobExpectedAlpacaReward);

      // Assert expectedExtraReward for both Bob & Alice
      aliceExpectedExtraReward = aliceExpectedExtraReward.add(
        stages["advance_time_3"]
          .sub(stages["advance_time_2"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(aliceDepositAmount)
          .div(totalAmount)
      );
      assertHelpers.assertBigNumberClosePercent(
        await rewarder1.pendingToken(0, alice.address),
        aliceExpectedExtraReward
      );
      expect(await rewarder1.pendingToken(0, bob.address)).to.be.eq(0);

      // Bob withdraw some of his deposit
      await miniFLasBob.withdraw(bob.address, 0, bobDepositAmount.div(2));
      stages["bob_withdraw_1"] = await timeHelpers.latest();

      // Assert expectedAlpacaReward for both Bob & Alice
      aliceExpectedAlpacaReward = aliceExpectedAlpacaReward.add(
        stages["bob_withdraw_1"]
          .sub(stages["advance_time_3"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(aliceDepositAmount)
          .div(totalAmount)
      );
      bobExpectedAlpacaReward = bobExpectedAlpacaReward.add(
        stages["bob_withdraw_1"]
          .sub(stages["advance_time_3"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(bobDepositAmount)
          .div(totalAmount)
      );
      assertHelpers.assertBigNumberClosePercent(
        await miniFL.pendingAlpaca(0, alice.address),
        aliceExpectedAlpacaReward
      );
      assertHelpers.assertBigNumberClosePercent(await miniFL.pendingAlpaca(0, bob.address), bobExpectedAlpacaReward);

      // Assert expectedExtraReward for both Bob & Alice
      aliceExpectedExtraReward = aliceExpectedExtraReward.add(
        stages["bob_withdraw_1"]
          .sub(stages["advance_time_3"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(aliceDepositAmount)
          .div(totalAmount)
      );

      assertHelpers.assertBigNumberClosePercent(
        await rewarder1.pendingToken(0, alice.address),
        aliceExpectedExtraReward
      );
      // Bob expect to get nothing from rewarder due to he has not interact with MiniFL
      // after rewarder1 is added.
      expect(await rewarder1.pendingToken(0, bob.address)).to.be.eq(0);

      // Update deposit balance
      bobDepositAmount = bobDepositAmount.sub(bobDepositAmount.div(2));
      totalAmount = aliceDepositAmount.add(bobDepositAmount);

      // Assert balances on Rewarder
      expect((await rewarder1.userInfo(0, alice.address)).amount).to.be.eq(aliceDepositAmount);
      expect((await rewarder1.userInfo(0, bob.address)).amount).to.be.eq(bobDepositAmount);

      // Assuming 1 day pass
      await timeHelpers.increase(ethers.BigNumber.from("86400"));
      stages["advance_time_4"] = await timeHelpers.latest();

      // Assert expectedAlpacaReward for both Bob & Alice
      aliceExpectedAlpacaReward = aliceExpectedAlpacaReward.add(
        stages["advance_time_4"]
          .sub(stages["bob_withdraw_1"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(aliceDepositAmount)
          .div(totalAmount)
      );
      bobExpectedAlpacaReward = bobExpectedAlpacaReward.add(
        stages["advance_time_4"]
          .sub(stages["bob_withdraw_1"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(bobDepositAmount)
          .div(totalAmount)
      );
      assertHelpers.assertBigNumberClosePercent(
        await miniFL.pendingAlpaca(0, alice.address),
        aliceExpectedAlpacaReward
      );
      assertHelpers.assertBigNumberClosePercent(await miniFL.pendingAlpaca(0, bob.address), bobExpectedAlpacaReward);

      // Assert expectedExtraReward for both Bob & Alice
      aliceExpectedExtraReward = aliceExpectedExtraReward.add(
        stages["advance_time_4"]
          .sub(stages["bob_withdraw_1"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(aliceDepositAmount)
          .div(totalAmount)
      );
      bobExpectedExtraReward = bobExpectedExtraReward.add(
        stages["advance_time_4"]
          .sub(stages["bob_withdraw_1"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(bobDepositAmount)
          .div(totalAmount)
      );

      assertHelpers.assertBigNumberClosePercent(
        await rewarder1.pendingToken(0, alice.address),
        aliceExpectedExtraReward
      );
      assertHelpers.assertBigNumberClosePercent(await rewarder1.pendingToken(0, bob.address), bobExpectedExtraReward);

      // Alice deposit more
      await miniFLasAlice.deposit(alice.address, 0, aliceDepositAmount.mul(2));
      stages["alice_deposit_0"] = await timeHelpers.latest();

      // Assert expectedAlpacaReward for both Bob & Alice
      aliceExpectedAlpacaReward = aliceExpectedAlpacaReward.add(
        stages["alice_deposit_0"]
          .sub(stages["advance_time_4"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(aliceDepositAmount)
          .div(totalAmount)
      );
      bobExpectedAlpacaReward = bobExpectedAlpacaReward.add(
        stages["alice_deposit_0"]
          .sub(stages["advance_time_4"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(bobDepositAmount)
          .div(totalAmount)
      );
      assertHelpers.assertBigNumberClosePercent(
        await miniFL.pendingAlpaca(0, alice.address),
        aliceExpectedAlpacaReward
      );
      assertHelpers.assertBigNumberClosePercent(await miniFL.pendingAlpaca(0, bob.address), bobExpectedAlpacaReward);

      // Assert expectedExtraReward for both Bob & Alice
      aliceExpectedExtraReward = aliceExpectedExtraReward.add(
        stages["alice_deposit_0"]
          .sub(stages["advance_time_4"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(aliceDepositAmount)
          .div(totalAmount)
      );
      bobExpectedExtraReward = bobExpectedExtraReward.add(
        stages["alice_deposit_0"]
          .sub(stages["advance_time_4"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(bobDepositAmount)
          .div(totalAmount)
      );

      assertHelpers.assertBigNumberClosePercent(
        await rewarder1.pendingToken(0, alice.address),
        aliceExpectedExtraReward
      );
      assertHelpers.assertBigNumberClosePercent(await rewarder1.pendingToken(0, bob.address), bobExpectedExtraReward);

      // Update deposit balance
      aliceDepositAmount = aliceDepositAmount.add(aliceDepositAmount.mul(2));
      totalAmount = aliceDepositAmount.add(bobDepositAmount);

      // Assert balances on Rewarder
      expect((await rewarder1.userInfo(0, alice.address)).amount).to.be.eq(aliceDepositAmount);
      expect((await rewarder1.userInfo(0, bob.address)).amount).to.be.eq(bobDepositAmount);

      // Assuming 1 day pass
      await timeHelpers.increase(ethers.BigNumber.from("86400"));
      stages["advance_time_5"] = await timeHelpers.latest();

      // Assert expectedAlpacaReward for both Bob & Alice
      aliceExpectedAlpacaReward = aliceExpectedAlpacaReward.add(
        stages["advance_time_5"]
          .sub(stages["alice_deposit_0"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(aliceDepositAmount)
          .div(totalAmount)
      );
      bobExpectedAlpacaReward = bobExpectedAlpacaReward.add(
        stages["advance_time_5"]
          .sub(stages["alice_deposit_0"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(bobDepositAmount)
          .div(totalAmount)
      );
      assertHelpers.assertBigNumberClosePercent(
        await miniFL.pendingAlpaca(0, alice.address),
        aliceExpectedAlpacaReward
      );
      assertHelpers.assertBigNumberClosePercent(await miniFL.pendingAlpaca(0, bob.address), bobExpectedAlpacaReward);

      // Assert expectedExtraReward for both Bob & Alice
      aliceExpectedExtraReward = aliceExpectedExtraReward.add(
        stages["advance_time_5"]
          .sub(stages["alice_deposit_0"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(aliceDepositAmount)
          .div(totalAmount)
      );
      bobExpectedExtraReward = bobExpectedExtraReward.add(
        stages["advance_time_5"]
          .sub(stages["alice_deposit_0"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(bobDepositAmount)
          .div(totalAmount)
      );

      assertHelpers.assertBigNumberClosePercent(
        await rewarder1.pendingToken(0, alice.address),
        aliceExpectedExtraReward
      );
      assertHelpers.assertBigNumberClosePercent(await rewarder1.pendingToken(0, bob.address), bobExpectedExtraReward);
    });
  });
});
