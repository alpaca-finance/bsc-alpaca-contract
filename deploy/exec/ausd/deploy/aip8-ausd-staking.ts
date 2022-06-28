import { AIP8AUSDStaking } from "../../../../typechain/AIP8AUSDStaking";
import { AIP8AUSDStaking__factory } from "./../../../../typechain/factories/AIP8AUSDStaking__factory";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ConfigFileHelper } from "../../../helper";
import { UpgradeableContractDeployer } from "../../../deployer";

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

  const PID = 25;
  const FAIR_LUNCH_ADDRESS = "0xa625ab01b08ce023b2a342dbb12a16f2c8489a8f";

  const deployer = await getDeployer();

  console.log(">> Deploying an upgradable AIP8AUSDStaking contract");

  const AUSDStakingDeployer = new UpgradeableContractDeployer<AIP8AUSDStaking>(deployer, "AIP8AUSDStaking");

  const { contract: AIP8AUSDStaking } = await AUSDStakingDeployer.deploy([FAIR_LUNCH_ADDRESS, PID]);

  const configFile = new ConfigFileHelper();

  configFile.setAUSDStaking(AIP8AUSDStaking.address);
};

export default func;
func.tags = ["AIP8AUSDStaking"];
