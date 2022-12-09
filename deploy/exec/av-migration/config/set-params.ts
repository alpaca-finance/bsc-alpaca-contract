import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { getConfig } from "../../../entities/config";
import { AVMigration__factory } from "../../../../typechain";
import { Converter } from "../../../helper";
import { compare } from "../../../../utils/address";
import { zeroAddress } from "ethereumjs-util";

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

  const migrationPathInputs = [
    { srcVault: "n3x-BNBBUSD-PCS2", dstVault: "n3x-BNBBUSD-PCS1" },

    { srcVault: "n3x-BNBUSDT-PCS2", dstVault: "n3x-BNBUSDT-PCS1" },
    { srcVault: "n3x-BNBUSDT-PCS3", dstVault: "n3x-BNBUSDT-PCS1" },
    { srcVault: "n3x-ETHUSDT-BSW1", dstVault: "n3x-BNBUSDT-PCS1" },

    { srcVault: "n8x-BNBUSDT-PCS3", dstVault: "n8x-BNBUSDT-PCS1" },
    { srcVault: "n8x-BNBUSDT-BSW1", dstVault: "n8x-BNBUSDT-PCS1" },

    { srcVault: "L3x-BUSDBTCB-PCS2", dstVault: "L3x-BUSDBTCB-PCS1" },
    { srcVault: "L8x-BUSDBTCB-PCS1", dstVault: "L3x-BUSDBTCB-PCS1" },
  ];

  const config = getConfig();

  const deployer = await getDeployer();
  const converter = new Converter();

  const migrationPaths = migrationPathInputs.map((input) => {
    return {
      srcVault: converter.convertDeltaSymboltoObj([input.srcVault])[0].address,
      dstVault: converter.convertDeltaSymboltoObj([input.dstVault])[0].address,
    };
  });

  if (!config.AutomatedVaultExecutor?.migrator || compare(config.AutomatedVaultExecutor?.migrator, zeroAddress())) {
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
