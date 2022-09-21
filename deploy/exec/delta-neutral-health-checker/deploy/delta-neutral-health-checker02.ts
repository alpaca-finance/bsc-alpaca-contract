import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { DeltaNeutralVault04HealthChecker02 } from "../../../../typechain";
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

  const deltaNeutralVault04HealthChecker02 = new UpgradeableContractDeployer<DeltaNeutralVault04HealthChecker02>(
    deployer,
    "DeltaNeutralVault04HealthChecker02"
  );
  const { contract: deltaHealthchecker02 } = await deltaNeutralVault04HealthChecker02.deploy([]);

  configFileHelper.setDeltaNeutralHealthChecker(deltaHealthchecker02.address);
};

export default func;
func.tags = ["deltaNeutralVaultHealthChecker02"];
