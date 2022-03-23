import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { MiniFL, MiniFL__factory } from "../../../../typechain";
import { getConfig } from "../../../entities/config";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const config = getConfig();

  const REWARD_TOKEN_ADDRESS = config.Tokens.ALPACA!;
  const MAX_ALPACA_PER_SECOND = ethers.utils.parseEther("1");

  const deployer = (await ethers.getSigners())[0];

  console.log("> Deploying MiniFL");
  const MiniFL = (await ethers.getContractFactory("MiniFL", deployer)) as MiniFL__factory;
  const miniFL = (await upgrades.deployProxy(MiniFL, [REWARD_TOKEN_ADDRESS, MAX_ALPACA_PER_SECOND])) as MiniFL;
  const tx = await miniFL.deployTransaction.wait(3);

  console.log("> Deployed block: ", tx.blockNumber);
  console.log("> MiniFL address:", miniFL.address);
};

export default func;
func.tags = ["MiniFL"];
