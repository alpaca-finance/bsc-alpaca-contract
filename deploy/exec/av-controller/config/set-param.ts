import { ConfigFileHelper } from "./../../../helper/config-file-helper";
import { AutomatedVaultController__factory } from "../../../../typechain/factories/AutomatedVaultController__factory";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { getConfig } from "../../../entities/config";
import { compare } from "../../../../utils/address";

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

  const CREDITOR_ADDRS: string[] = ["0xe259B3057fCd601E01eF9AB5D2F933D6779663bD"];
  const PRIVATE_VAULT_ADDRS: string[] = ["0xC57876a95A4f31a0A4FDB0329Fc78e00B092cC94"];

  const deployer = await getDeployer();
  const config = getConfig();

  // VALIDATING CREDITORS
  validateInput(CREDITOR_ADDRS, PRIVATE_VAULT_ADDRS);

  console.log(">> Set param AutomatedVaultController contract");
  let nonce = await deployer.getTransactionCount();
  const ops = isFork() ? { nonce: nonce++, gasLimit: 2000000 } : { nonce: nonce++ };

  const avController = AutomatedVaultController__factory.connect(config.AutomatedVaultController!.address, deployer);
  console.log(`>> AVController :${avController.address}`);

  if (CREDITOR_ADDRS.length > 0) {
    console.log(`>> Set CREDITORS TO : ${CREDITOR_ADDRS}`);
    await avController.setCreditors(CREDITOR_ADDRS, ops);
  }

  if (PRIVATE_VAULT_ADDRS.length > 0) {
    console.log(`>> Set PRIVATEVAULT TO : ${PRIVATE_VAULT_ADDRS}`);
    await avController.setPrivateVaults(PRIVATE_VAULT_ADDRS, ops);
  }
  const cfh = new ConfigFileHelper();
  cfh.setCreditToAVController(CREDITOR_ADDRS);
};

function validateInput(creditors: string[], privateVaults: string[]) {
  const config = getConfig();
  creditors.map((creditor) => {
    const creditorResult = config.Creditors!.find((o) => compare(o.address, creditor));
    if (!creditorResult) {
      throw new Error(`ERROR Not found Creditor Input :${creditor}`);
    }
  });

  if (!config.AutomatedVaultController?.address) {
    throw new Error(`ERROR No address AutomatedVaultController`);
  }

  privateVaults.map((pv) => {
    if (!config.DeltaNeutralVaults.find((dlt) => compare(dlt.address, pv))) {
      throw new Error(`ERROR NOT FOUND PRIVATE_VAULTS_ADDRESS :${pv}`);
    }
  });
}

export default func;
func.tags = ["AVControllerSetParams"];
