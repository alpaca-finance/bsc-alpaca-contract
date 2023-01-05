import { DeltaNeutralVaultReader__factory } from "./../../../../typechain/factories/DeltaNeutralVaultReader__factory";
import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
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

  console.log(">> Deploying an DeltaNeutralVaultReader contract");

  const AVReader = (await ethers.getContractFactory(
    "DeltaNeutralVaultReader",
    deployer
  )) as DeltaNeutralVaultReader__factory;
  const avReader = await AVReader.deploy();

  await avReader.deployTransaction.wait(3);

  console.log(`>> Deployed at ${avReader.address}`);
  console.log("✅ Done");
};

export default func;
func.tags = ["DeltaNeutralVaultReader"];
