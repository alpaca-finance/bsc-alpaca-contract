import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { VaultAip25__factory } from "../../../../typechain";
import { getDeployer } from "../../../../utils/deployer-helper";
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

  const TARGETED_VAULTS = ["ibBTCB"];

  const config = getConfig();
  const toBeMigrated = TARGETED_VAULTS.map((tv) => {
    const vault = config.Vaults.find((v) => tv == v.symbol);
    if (vault === undefined) {
      throw `error: not found vault with ${tv} symbol`;
    }
    if (vault.config === "") {
      throw `error: not found config address`;
    }

    return vault;
  });

  const deployer = await getDeployer();
  let nonce = await deployer.getTransactionCount();

  for (const vault of toBeMigrated) {
    const vaultAIP25 = VaultAip25__factory.connect(vault.address, deployer);

    const migrateTx = await vaultAIP25.migrate({ nonce: nonce++ });
    const migrateReceipt = await migrateTx.wait();

    if (migrateReceipt.status === 1) {
      console.log(`✅ ${vault.symbol} done migrate at ${migrateReceipt.transactionHash}`);
    } else {
      console.log(`❌ ${vault.symbol} fail to migrate`);
    }
  }
};

export default func;
func.tags = ["AIP25Migrate"];
