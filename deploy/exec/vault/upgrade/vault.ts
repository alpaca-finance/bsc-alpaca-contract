import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { getConfig } from "../../../entities/config";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ProxyAdmin__factory } from "../../../../typechain";
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
  const TITLE = "upgrade_all_vaults_support_nftstaking";
  const VAULT_VERSION = "VaultAip42";
  const TARGETED_VAULTS = ["ibTOMB"];
  const EXACT_ETA = "1655753400";

  const config = getConfig();

  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = await getDeployer();
  const chainId = await deployer.getChainId();
  const toBeUpgradedVaults = TARGETED_VAULTS.map((tv) => {
    const vault = config.Vaults.find((v) => tv == v.symbol);
    if (vault === undefined) {
      throw `error: not found vault with ${tv} symbol`;
    }
    if (vault.config === "") {
      throw `error: not found config address`;
    }

    return vault;
  });
  const proxyAdmin = ProxyAdmin__factory.connect(config.ProxyAdmin, deployer);
  const proxyAdminOwner = await proxyAdmin.owner();

  let nonce = await deployer.getTransactionCount();

  for (const vault of toBeUpgradedVaults) {
    if (compare(proxyAdminOwner, config.Timelock)) {
      console.log("------------------");
      console.log(`> Upgrading Vault at ${vault.symbol} through Timelock + ProxyAdmin`);
      console.log("> Prepare upgrade & deploy if needed a new IMPL automatically.");
      const NewVault = await ethers.getContractFactory(VAULT_VERSION);
      const preparedNewVault = await upgrades.prepareUpgrade(vault.address, NewVault);
      console.log(`> Implementation address: ${preparedNewVault}`);
      console.log("✅ Done");

      timelockTransactions.push(
        await TimelockService.queueTransaction(
          chainId,
          `> Queue tx to upgrade ${vault.symbol}`,
          config.ProxyAdmin,
          "0",
          "upgrade(address,address)",
          ["address", "address"],
          [vault.address, preparedNewVault],
          EXACT_ETA,
          { nonce: nonce++ }
        )
      );
    } else {
      console.log("------------------");
      console.log(`> Upgrading Vault at ${vault.symbol} through ProxyAdmin`);
      console.log("> Upgrade & deploy if needed a new IMPL automatically.");
      const NewVaultFactory = await ethers.getContractFactory(VAULT_VERSION);
      const preparedNewVault = await upgrades.prepareUpgrade(vault.address, NewVaultFactory);
      console.log(`> Implementation address: ${preparedNewVault}`);

      // Perform actual upgrade
      await upgrades.upgradeProxy(vault.address, NewVaultFactory);
      console.log("✅ Done");
    }
  }

  if (timelockTransactions.length > 0) {
    const timestamp = Math.floor(new Date().getTime() / 1000);
    fileService.writeJson(`${timestamp}_${TITLE}`, timelockTransactions);
  }
};

export default func;
func.tags = ["UpgradeVault"];
