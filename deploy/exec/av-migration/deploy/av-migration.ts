import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { getDeployer } from "../../../../utils/deployer-helper";
import { AVMigration__factory } from "../../../../typechain";
import { ConfigFileHelper } from "../../../helper";

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
  const cfh = new ConfigFileHelper();

  const deployer = await getDeployer();

  console.log(">> Deploying an AVMigration contract");
  const AVMigration = (await ethers.getContractFactory("AVMigration", deployer)) as AVMigration__factory;
  const avMigration = await AVMigration.deploy();

  await avMigration.deployTransaction.wait(3);

  cfh.setAVMigration(avMigration.address);

  console.log(`>> Deployed at ${avMigration.address}`);
  console.log("✅ Done");
};

export default func;
func.tags = ["AVMigration"];
