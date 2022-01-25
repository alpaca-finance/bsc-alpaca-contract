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
    miniFL = (await upgrades.deployProxy(MiniFL, [alpacaToken.address])) as MiniFL;

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
        await miniFL.addPool(1, stakingTokens[i].address, ethers.constants.AddressZero, false);
      }
      expect(await miniFL.poolLength()).to.eq(stakingTokens.length);
      expect(await miniFL.totalAllocPoint()).to.be.eq(stakingTokens.length);
    });

    it("should revert when the stakeToken is already added to the pool", async () => {
      for (let i = 0; i < stakingTokens.length; i++) {
        await miniFL.addPool(1, stakingTokens[i].address, ethers.constants.AddressZero, false);
      }
      expect(await miniFL.poolLength()).to.eq(stakingTokens.length);
      expect(await miniFL.totalAllocPoint()).to.be.eq(stakingTokens.length);

      await expect(miniFL.addPool(1, stakingTokens[0].address, ethers.constants.AddressZero, false)).to.be.revertedWith(
        "MiniFL_DuplicatePool()"
      );
    });
  });

  context("#deposit", async () => {
    beforeEach(async () => {
      await miniFL.addPool(1, stakingTokens[0].address, ethers.constants.AddressZero, false);
    });

    context("when deposit to not existed pool", async () => {
      it("should revert", async () => {
        await expect(miniFL.deposit(deployer.address, 88, ethers.utils.parseEther("100"))).to.be.reverted;
      });
    });

    context("when pool is debtToken", async () => {
      beforeEach(async () => {
        await miniFL.addPool(1, stakingTokens[1].address, ethers.constants.AddressZero, true);
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
        rewarder1 = (await upgrades.deployProxy(Rewarder1, [extraRewardToken.address, miniFL.address])) as Rewarder1;

        await miniFL.addPool(1, stakingTokens[1].address, rewarder1.address, false);
        await rewarder1.addPool(1, 1);

        await miniFL.addPool(1, stakingTokens[2].address, rewarder1.address, true);
        await miniFL.approveStakeDebtToken([2], [alice.address], true);
        await rewarder1.addPool(1, 2);
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
      await miniFL.setAlpacaPerSecond(ALPACA_REWARD_PER_SEC);
      await miniFL.addPool(1, stakingTokens[0].address, ethers.constants.AddressZero, false);

      await stoken0AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
      await miniFLasAlice.deposit(alice.address, 0, ethers.utils.parseEther("100"));
    });

    context("when pool is debtToken", async () => {
      beforeEach(async () => {
        await miniFL.addPool(1, stakingTokens[1].address, ethers.constants.AddressZero, true);
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
        rewarder1 = (await upgrades.deployProxy(Rewarder1, [extraRewardToken.address, miniFL.address])) as Rewarder1;

        // Set Reward Per Second here to make sure that even if no reward in Rewarder1, it still works
        await rewarder1.setRewardPerSecond(ALPACA_REWARD_PER_SEC);

        await miniFL.addPool(1, stakingTokens[1].address, rewarder1.address, false);
        await rewarder1.addPool(1, 1);
        await stoken1AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
        await miniFLasAlice.deposit(alice.address, 1, ethers.utils.parseEther("100"));

        await miniFL.addPool(1, stakingTokens[2].address, rewarder1.address, true);
        await miniFL.approveStakeDebtToken([2], [alice.address], true);
        await rewarder1.addPool(1, 2);
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

    beforeEach(async () => {
      stages = {};
      await alpacaToken.mint(deployer.address, ethers.utils.parseEther("1000000"));
      await alpacaToken.transfer(miniFL.address, ethers.utils.parseEther("1000000"));

      await miniFL.setAlpacaPerSecond(ALPACA_REWARD_PER_SEC);

      await miniFL.addPool(1, stakingTokens[0].address, ethers.constants.AddressZero, false);

      await miniFL.addPool(1, stakingTokens[1].address, ethers.constants.AddressZero, true);
      await miniFL.approveStakeDebtToken([1], [alice.address], true);

      await stoken0AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
      await miniFLasAlice.deposit(alice.address, 0, ethers.utils.parseEther("100"));
      stages["alice_deposit_0"] = await timeHelpers.latest();

      await stoken1AsAlice.approve(miniFL.address, ethers.utils.parseEther("100"));
      await miniFLasAlice.deposit(bob.address, 1, ethers.utils.parseEther("100"));
      stages["alice_deposit_1"] = await timeHelpers.latest();
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

        const bobAlpacaAfter = await alpacaToken.balanceOf(bob.address);
        const expectedAlpacaReward = stages["bob_withdraw_1"]
          .sub(stages["alice_deposit_1"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(1)
          .div(2);
        expect(bobAlpacaAfter).to.be.eq(bobAlpacaBefore.add(expectedAlpacaReward));
      });
    });

    context("when Alice harvest from ibToken pool", async () => {
      it("should work", async () => {
        const aliceAlpacaBefore = await alpacaToken.balanceOf(alice.address);

        await miniFLasAlice.harvest(0);
        stages["alice_withdraw_0"] = await timeHelpers.latest();

        const aliceAlpacaAfter = await alpacaToken.balanceOf(alice.address);
        const expectedIbReward = stages["alice_withdraw_0"]
          .sub(stages["alice_deposit_0"])
          .mul(ALPACA_REWARD_PER_SEC)
          .mul(1)
          .div(2);
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
  });
});
