import { ConfigFileHelper } from "./../../../helper/config-file-helper";
import { AutomatedVaultController } from "../../../../typechain/AutomatedVaultController";
import { AutomatedVaultController__factory } from "../../../../typechain/factories/AutomatedVaultController__factory";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { getDeployer } from "../../../../utils/deployer-helper";

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

  const deployer = await getDeployer();
  console.log(">> Deploying an upgradable AutomatedVaultController contract");
  const AutomatedVaultController = (await ethers.getContractFactory(
    "AutomatedVaultController",
    deployer
  )) as AutomatedVaultController__factory;
  const avController = (await upgrades.deployProxy(AutomatedVaultController, [[], []])) as AutomatedVaultController;
  console.log(`>> Deployed at ${avController.address}`);

  const cfh = new ConfigFileHelper();
  cfh.setAVController(avController.address);
};

export default func;
func.tags = ["AVController"];
