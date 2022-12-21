import { AIP8AUSDStaking__factory } from "./../../../../typechain/factories/AIP8AUSDStaking__factory";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { getConfig } from "../../../entities/config";

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
  const config = getConfig();

  if (!config.AUSDStaking!) {
    throw new Error(`ERROR No address AUSDStaking`);
  }

  const ops = isFork() ? { gasLimit: 2000000 } : {};

  const aip8AusdStaking = AIP8AUSDStaking__factory.connect(config.AUSDStaking!, deployer);
  console.log(`>> AIP8AusdStaking: ${aip8AusdStaking.address}`);

  const enableEmergencyWithdrawTx = await aip8AusdStaking.enableEmergencyWithdraw(ops);
  console.log("Done at: ", enableEmergencyWithdrawTx.hash);
};

export default func;
func.tags = ["AIP8AUSDStakingSetEmergencyWithdraw"];
