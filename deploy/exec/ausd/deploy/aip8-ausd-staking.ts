import { AIP8AUSDStaking } from "../../../../typechain/AIP8AUSDStaking";
import { AIP8AUSDStaking__factory } from "./../../../../typechain/factories/AIP8AUSDStaking__factory";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ConfigFileHelper, Converter } from "../../../helper";
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

  const configFile = new ConfigFileHelper();
  const FAIR_LUNCH_ADDRESS = configFile.getConfig().FairLaunch?.address;

  if (!FAIR_LUNCH_ADDRESS) {
    throw new Error("ERROR NO FAIR LUNCH ADDRESS");
  }

  const deployer = await getDeployer();

  const AUSDStakingDeployer = new UpgradeableContractDeployer<AIP8AUSDStaking>(deployer, "AIP8AUSDStaking");
  const { contract: AIP8AUSDStaking } = await AUSDStakingDeployer.deploy([FAIR_LUNCH_ADDRESS, PID]);

  configFile.setAUSDStaking(AIP8AUSDStaking.address);
};

export default func;
func.tags = ["AIP8AUSDStaking"];
