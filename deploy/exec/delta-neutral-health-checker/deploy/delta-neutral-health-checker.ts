import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { DeltaNeutralVault04HealthChecker } from "../../../../typechain";
import { getDeployer } from "../../../../utils/deployer-helper";
import { UpgradeableContractDeployer } from "../../../deployer";
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
  const configFileHelper = new ConfigFileHelper();
  const deployer = await getDeployer();

  const deltaNeutralVault04HealthChecker = new UpgradeableContractDeployer<DeltaNeutralVault04HealthChecker>(
    deployer,
    "DeltaNeutralVault04HealthChecker"
  );
  const { contract: deltaHealthchecker } = await deltaNeutralVault04HealthChecker.deploy([]);

  configFileHelper.setDeltaNeutralHealthChecker(deltaHealthchecker.address);
};

export default func;
func.tags = ["deltaNeutralVaultHealthChecker"];
