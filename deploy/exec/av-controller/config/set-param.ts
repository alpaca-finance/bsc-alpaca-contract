import { Converter } from "./../../../helper/converter";
import { ConfigFileHelper } from "./../../../helper/config-file-helper";
import { AutomatedVaultController__factory } from "../../../../typechain/factories/AutomatedVaultController__factory";
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

  const CREDITOR_NAMES: string[] = ["xAlpacaCreditor"];
  const PRIVATE_VAULT_SYMBOLS: string[] = ["n8x-BNBUSDT-PCS2"];

  const deployer = await getDeployer();
  const config = getConfig();

  // VALIDATING CREDITORS
  if (!config.AutomatedVaultController?.address) {
    throw new Error(`ERROR No address AutomatedVaultController`);
  }
  // FIND ADDRESS FOR CREDITORS AND PRIVATE VAULT NAME
  const converter = new Converter();

  const creditorAddrs = converter.convertCreditorNameToAddress(CREDITOR_NAMES);
  const pvAddrs = converter.convertDeltaSymbolToAddress(PRIVATE_VAULT_SYMBOLS, "address");

  console.log(">> Set param AutomatedVaultController contract");
  let nonce = await deployer.getTransactionCount();
  const ops = isFork() ? { nonce: nonce++, gasLimit: 2000000 } : { nonce: nonce++ };

  const avController = AutomatedVaultController__factory.connect(config.AutomatedVaultController!.address, deployer);
  console.log(`>> AVController :${avController.address}`);

  if (creditorAddrs.length > 0) {
    console.log(`>> Set CREDITORS TO : ${creditorAddrs}`);
    await avController.setCreditors(creditorAddrs, ops);
  }

  if (pvAddrs.length > 0) {
    console.log(`>> Add PRIVATEVAULT TO : ${pvAddrs}`);
    await avController.addPrivateVaults(pvAddrs, ops);
  }

  const cfh = new ConfigFileHelper();
  cfh.setCreditToAVController(creditorAddrs);
};

export default func;
func.tags = ["AVControllerSetParams"];
