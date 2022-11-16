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
    { srcVault: "0xe9Bd0B7333596d0a87DED9EE1a782AA052B711AB", dstVault: "0x96C607E34008630dC8132F517A33Be2772835f9c" },
  ];

  const deployer = await getDeployer();
  const config = getConfig();

  if (!config.AVMigration) {
    throw new Error(`ERROR No address AVMigration`);
  }

  console.log(">> Set param AVMigration contract");
  let nonce = await deployer.getTransactionCount();
  const ops = isFork() ? { gasLimit: 2000000 } : {};

  const avMigration = AVMigration__factory.connect(config.AVMigration, deployer);
  await avMigration.setMigrationPaths(migrationPaths, { ...ops, nonce: nonce++ });

  console.table(migrationPaths);
};

export default func;
func.tags = ["AVMigrationSetParams"];
