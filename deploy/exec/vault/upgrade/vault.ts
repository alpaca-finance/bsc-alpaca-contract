import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { getConfig } from "../../../entities/config";
import { TimelockEntity } from "../../../entities";
import { FileService, TimelockService } from "../../../services";

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
  const TITLE = "upgrade_vault_to_aip42";
  const VAULT_VERSION = "VaultAip42";
  const TARGETED_VAULTS = ["ibWBNB", "ibBUSD", "ibETH", "ibALPACA", "ibUSDT", "ibBTCB", "ibTUSD"];
  const EXACT_ETA = "1629957600";

  const config = getConfig();

  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const [deployer] = await ethers.getSigners();
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
  let nonce = await deployer.getTransactionCount();

  for (const vault of toBeUpgradedVaults) {
    console.log("------------------");
    console.log(`> Upgrading Vault at ${vault.symbol} through Timelock + ProxyAdmin`);
    console.log("> Prepare upgrade & deploy if needed a new IMPL automatically.");
    const NewVault = await ethers.getContractFactory(VAULT_VERSION);
    const preparedNewVault = await upgrades.prepareUpgrade(vault.address, NewVault);
    console.log(`> Implementation address: ${preparedNewVault}`);
    console.log("✅ Done");

    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `> Queue tx to upgrade ${vault.symbol}`,
        config.ProxyAdmin,
        "0",
        "upgrade(address,adress)",
        ["address", "address"],
        [vault.address, preparedNewVault],
        EXACT_ETA,
        { nonce: nonce++ }
      )
    );
  }

  FileService.write(TITLE, timelockTransactions);
};

export default func;
func.tags = ["UpgradeVault"];
