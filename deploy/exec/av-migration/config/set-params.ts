import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { getConfig } from "../../../entities/config";
import { AVMigration__factory } from "../../../../typechain";
import { Converter } from "../../../helper";

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

  const migrationPathInputs = [{ srcVault: "n3x-BNBUSDT-PCS2", dstVault: "n3x-BNBUSDT-PCS1" }];

  const config = getConfig();

  const deployer = await getDeployer();
  const converter = new Converter();

  const migrationPaths = migrationPathInputs.map((input) => {
    return {
      srcVault: converter.convertDeltaSymboltoObj([input.srcVault])[0].address,
      dstVault: converter.convertDeltaSymboltoObj([input.dstVault])[0].address,
    };
  });

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
