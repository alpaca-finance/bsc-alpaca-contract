import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { VaultAip29HotFix__factory } from "../../../../typechain";
import { getDeployer } from "../../../../utils/deployer-helper";
import { getConfig } from "../../../entities/config";
import { parseEther } from "ethers/lib/utils";

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

  const TARGETED_VAULTS = ["ibBUSD"];
  const VAULT_DEBT_VAL = "8302898.780974642181632752"

  const config = getConfig();
  const toPullTokens = TARGETED_VAULTS.map((tv) => {
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

  for (const vault of toPullTokens) {
    const vaultAip29 = VaultAip29HotFix__factory.connect(vault.address, deployer);

    const tx = await vaultAip29.setVaultDebtVal(parseEther(VAULT_DEBT_VAL), { nonce: nonce++ });
    const txReceipt = await tx.wait();

    if (txReceipt.status === 1) {
      console.log(`✅ ${vault.symbol} set debt val at ${txReceipt.transactionHash}`);
    } else {
      console.log(`❌ ${vault.symbol} fail to set debt`);
    }
  }
};

export default func;
func.tags = ["AIP29SetDebtVal"];
