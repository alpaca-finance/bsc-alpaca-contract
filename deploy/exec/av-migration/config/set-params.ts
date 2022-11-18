import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { getConfig } from "../../../entities/config";
import { AVMigration__factory } from "../../../../typechain";

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

  const migrationPaths = [
    { srcVault: "0x96C607E34008630dC8132F517A33Be2772835f9c", dstVault: "0xd1464C0D4424a353C4F243A11C806BdCbd783092" },
  ];

  const deployer = await getDeployer();
  const config = getConfig();

  if (!config.AutomatedVaultExecutor?.migrator) {
    throw new Error(`ERROR No migrator address`);
  }

  console.log(">> Set param AVMigration contract");
  let nonce = await deployer.getTransactionCount();
  const ops = isFork() ? { gasLimit: 2000000 } : {};

  const avMigration = AVMigration__factory.connect(config.AutomatedVaultExecutor?.migrator, deployer);
  await avMigration.setMigrationPaths(migrationPaths, { ...ops, nonce: nonce++ });

  console.table(migrationPaths);
};

export default func;
func.tags = ["AVMigrationSetParams"];
