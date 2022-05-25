import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getConfig } from "../../../entities/config";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { DeltaNeutralVaultConfig02__factory } from "../../../../typechain";
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

  const DELTA_VAULT_SYMBOL = ["n8x-BNBUSDT-PCS2"];

  const deployer = await getDeployer();
  const config = getConfig();
  const CONTROLLER = config.AutomatedVaultController!.address;

  // VALIDATING ALL DLTA_VAULT_SYMBOL
  const converter = new Converter();
  const configs = converter.convertDeltaSymbolToAddress(DELTA_VAULT_SYMBOL, "config");

  console.log(">> Set controller to DeltaNeutralVaultConfig contract");
  let nonce = await deployer.getTransactionCount();
  const ops = isFork() ? { nonce: nonce++, gasLimit: 2000000 } : { nonce: nonce++ };
  for (const config of configs) {
    console.log(`>> Set Controller : ${CONTROLLER} for config : ${config}`);
    const deltaVaultConfig = DeltaNeutralVaultConfig02__factory.connect(config, deployer);

    await deltaVaultConfig.setController(CONTROLLER, ops);
  }
  console.log("✅ Done");
};

export default func;
func.tags = ["DeltaNeutralVaultConfigSetController"];
