import { ConfigFileHelper } from "./../../../helper/config-file-helper";
import { AutomatedVaultController__factory } from "../../../../typechain/factories/AutomatedVaultController__factory";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { getConfig } from "../../../entities/config";
import { compare } from "../../../../utils/address";
import { Config } from "../../../interfaces/config";

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
  validateInput(CREDITOR_NAMES, PRIVATE_VAULT_SYMBOLS, config);

  // FIND ADDRESS FOR CREDITORS AND PRIVATE VAULT NAME
  const creditorAddrs = CREDITOR_NAMES.map((name) => {
    const creditorResult = config.Creditors!.find((creditor) => creditor.name === name);

    if (creditorResult === undefined) {
      throw `error: not found creditor with name ${name} `;
    }

    if (creditorResult.address === "") {
      throw `error: not found creditor config address`;
    }
    return creditorResult.address;
  });

  const pvAddrs = PRIVATE_VAULT_SYMBOLS.map((tv) => {
    const vault = config.DeltaNeutralVaults.find((v) => tv == v.symbol);
    if (vault === undefined) {
      throw `error: not found vault with ${tv} symbol`;
    }
    if (vault.config === "") {
      throw `error: not found vault config address`;
    }
    return vault.config;
  });

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
    console.log(`>> Set PRIVATEVAULT TO : ${pvAddrs}`);
    await avController.setPrivateVaults(pvAddrs, ops);
  }

  const cfh = new ConfigFileHelper();
  cfh.setCreditToAVController(creditorAddrs);
};

function validateInput(creditors: string[], privateVaults: string[], config: Config) {
  creditors.map((creditor) => {
    const creditorResult = config.Creditors!.find((o) => compare(o.name, creditor));
    if (!creditorResult) {
      throw new Error(`ERROR Not found Creditor Input :${creditor}`);
    }
  });

  if (!config.AutomatedVaultController?.address) {
    throw new Error(`ERROR No address AutomatedVaultController`);
  }

  privateVaults.map((pv) => {
    if (!config.DeltaNeutralVaults.find((dlt) => compare(dlt.symbol, pv))) {
      throw new Error(`ERROR NOT FOUND PRIVATE_VAULTS_ADDRESS :${pv}`);
    }
  });
}

export default func;
func.tags = ["AVControllerSetParams"];
