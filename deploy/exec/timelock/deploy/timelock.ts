import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { Timelock__factory } from "../../../../typechain";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  /*
  ░██╗░░░░░░░██╗░█████╗░██████╗░███╗░░██╗██╗███╗░░██╗░██████╗░
  ░██║░░██╗░░██║██╔══██╗██╔══██╗████╗░██║██║████╗░██║██╔════╝░
  ░╚██╗████╗██╔╝███████║██████╔╝██╔██╗██║██║██╔██╗██║██║░░██╗░
  ░░████╔═████║░██╔══██║██╔══██╗██║╚████║██║██║╚████║██║░░╚██╗
  ░░╚██╔╝░╚██╔╝░██║░░██║██║░░██║██║░╚███║██║██║░╚███║╚██████╔╝
  ░░░╚═╝░░░╚═╝░░╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚══╝╚═╝╚═╝░░╚══╝░╚═════╝░
  Check all variables below before execute the deployment script
  */

  const ADMIN_ADDRESS = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";
  const DELAY_IN_DAYS = 1;

  console.log("> Deploying Timelock");
  const Timelock = (await ethers.getContractFactory("Timelock", (await ethers.getSigners())[0])) as Timelock__factory;
  const timelock = await Timelock.deploy(ADMIN_ADDRESS, DELAY_IN_DAYS * 24 * 60 * 60);
  console.log(`> Timelock is deployed at: ${timelock.address}`);
};

export default func;
func.tags = ["Timelock"];
