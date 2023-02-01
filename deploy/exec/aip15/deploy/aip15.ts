import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { ConfigEntity } from "../../../entities";
import { getDeployer } from "../../../../utils/deployer-helper";
import { Aip15, Aip15__factory } from "../../../../typechain";

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
  const config = ConfigEntity.getConfig();
  const FAIRLAUNCH_ADDRESS = config.FairLaunch!.address;
  const FEB_EMISSION_DUMMY_ADDRESS = "0x0B7713c019aAC955ee0A4D92B6c9c47949520A7e";
  const FEB_EMISSION_POOL_ID = 29;
  const TARGET_EMISSION = ethers.utils.parseEther("250000");

  const deployer = await getDeployer();

  console.log("> Deploying an upgradable Aip15 contract");
  const Aip15 = (await ethers.getContractFactory("Aip15", deployer)) as Aip15__factory;
  const aip15 = (await upgrades.deployProxy(Aip15, [
    FAIRLAUNCH_ADDRESS,
    FEB_EMISSION_DUMMY_ADDRESS,
    FEB_EMISSION_POOL_ID,
    TARGET_EMISSION,
  ])) as Aip15;

  await aip15.deployTransaction.wait(3);
  console.log(`> Deployed at ${aip15.address}`);
  console.log("> ✅ Done");
};

export default func;
func.tags = ["Aip15"];
