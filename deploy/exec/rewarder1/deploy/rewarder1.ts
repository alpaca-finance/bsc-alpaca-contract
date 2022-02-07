import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { Rewarder1, Rewarder1__factory } from "../../../../typechain";
import { getConfig } from "../../../entities/config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const config = getConfig();

  const NAME = "WFTM Rewarder";
  const MINI_FL_ADDRESS = config.MiniFL!.address;
  const REWARD_TOKEN_ADDRESS = config.Tokens.WFTM!;
  const MAX_REWARD_PER_SEC = ethers.utils.parseEther("1");

  const deployer = (await ethers.getSigners())[0];

  console.log("> Deploying Rewarder1");
  const Rewarder1 = (await ethers.getContractFactory("Rewarder1", deployer)) as Rewarder1__factory;
  const rewarder1 = (await upgrades.deployProxy(Rewarder1, [
    NAME,
    MINI_FL_ADDRESS,
    REWARD_TOKEN_ADDRESS,
    MAX_REWARD_PER_SEC,
  ])) as Rewarder1;
  const tx = await rewarder1.deployTransaction.wait(3);

  console.log("> Deployed block: ", tx.blockNumber);
  console.log("> Rewarder1 address:", rewarder1.address);
};

export default func;
func.tags = ["Rewarder1"];
