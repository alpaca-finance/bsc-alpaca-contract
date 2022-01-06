import { ethers, network, upgrades, waffle } from "hardhat";
import { Signer, constants, BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  FairLaunch,
  FairLaunch__factory,
  MockERC20,
  MockERC20__factory,
  PancakeMasterChef,
  PancakeMasterChef__factory,
  PancakePair,
  PancakePair__factory,
  PancakeswapV2Worker02,
  PancakeswapV2Worker02__factory,
  Vault,
  Vault__factory,
  Actions,
  Actions__factory,
  Timelock,
  Timelock__factory,
  ConfigurableInterestVaultConfig__factory,
} from "../../typechain";
import mainnetConfig from "../../.mainnet.json";
import * as timeHelpers from "../helpers/time";
import { setBep20Balance } from "../helpers/storage";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
const { expect } = chai;

describe("Actions", () => {
  const DEPLOYER = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";

  /// Action instance
  let actions: Actions;

  // Accounts
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let cat: SignerWithAddress;
  let eve: SignerWithAddress;

  // Contract Signer
  let timelockAsDeployer: Timelock;

  let actionsAsAlice: Actions;

  let busdAsAlice: MockERC20;

  let wbnbVaultAsAlice: Vault;
  let busdVaultAsAlice: Vault;

  async function fixture() {
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [DEPLOYER],
    });
    deployer = await ethers.getSigner(DEPLOYER);
    [alice, bob, cat, eve] = await ethers.getSigners();

    // Set Alice balances
    await setBep20Balance(mainnetConfig.Tokens.BUSD, alice.address, 1, ethers.utils.parseEther("88888888888888"));

    const Actions = await ethers.getContractFactory("Actions", deployer);
    actions = await Actions.deploy(mainnetConfig.Tokens.WBNB);

    // Contract signer
    const targetedVaults = [];
    targetedVaults.push(mainnetConfig.Vaults.find((v) => v.symbol === "ibWBNB")!);
    targetedVaults.push(mainnetConfig.Vaults.find((v) => v.symbol === "ibBUSD")!);

    // Whitelisted Actions to be able to call `work`
    timelockAsDeployer = Timelock__factory.connect(mainnetConfig.Timelock, deployer);
    const executeTime = (await timeHelpers.latest()).add(timeHelpers.duration.days(BigNumber.from(2))).toNumber();

    for (const vault of targetedVaults) {
      await timelockAsDeployer.queueTransaction(
        vault.config,
        "0",
        "setWhitelistedCallers(address[],bool)",
        ethers.utils.defaultAbiCoder.encode(["address[]", "bool"], [[actions.address], true]),
        executeTime
      );
    }
    await timeHelpers.increase(timeHelpers.duration.days(ethers.BigNumber.from(2)));
    for (const vault of targetedVaults) {
      await timelockAsDeployer.executeTransaction(
        vault.config,
        "0",
        "setWhitelistedCallers(address[],bool)",
        ethers.utils.defaultAbiCoder.encode(["address[]", "bool"], [[actions.address], true]),
        executeTime
      );
      expect(
        await ConfigurableInterestVaultConfig__factory.connect(vault.config, deployer).whitelistedCallers(
          actions.address
        )
      ).to.deep.eq(true);
    }

    actionsAsAlice = Actions__factory.connect(actions.address, alice);

    busdAsAlice = MockERC20__factory.connect(mainnetConfig.Tokens.BUSD, alice);
    wbnbVaultAsAlice = Vault__factory.connect(targetedVaults[0].address, alice);
    busdVaultAsAlice = Vault__factory.connect(targetedVaults[1].address, bob);
  }

  beforeEach(async () => {
    await waffle.loadFixture(fixture);
  });

  describe("#execute", () => {
    context("when Alice open multiple positions at once", () => {
      it("should combined positions with 1 surrogate", async () => {
        await busdAsAlice.approve(actions.address, ethers.utils.parseEther("2"));
        const tx = await actionsAsAlice.execute(
          [1, 2],
          [0, 0],
          [
            "0x",
            ethers.utils.defaultAbiCoder.encode(
              ["address", "uint256", "address", "uint256", "uint256", "uint256", "bytes"],
              [
                busdVaultAsAlice.address,
                0,
                pancakeswapV2Worker.address,
                ethers.utils.parseEther("1"),
                ethers.utils.parseEther("1"),
                0,
                ethers.utils.defaultAbiCoder.encode(
                  ["address", "bytes"],
                  [addStrat.address, ethers.utils.defaultAbiCoder.encode(["uint256"], [0])]
                ),
              ]
            ),
          ]
        );
        console.log((await tx.wait()).gasUsed.toString());
      });
    });
  });
});
