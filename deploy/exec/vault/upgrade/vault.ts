import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { getConfig } from "../../../entities/config";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";
import { getDeployer } from "../../../../utils/deployer-helper";

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
  const TITLE = "downgrade_vaults_to_normal_vault";
  const VAULT_VERSION = "Vault";
  const TARGETED_VAULTS = ["ibWBNB", "ibBUSD", "ibETH", "ibALPACA", "ibUSDT", "ibBTCB", "ibTUSD", "ibUSDC"];
  const EXACT_ETA = "1649232000";

  const config = getConfig();

  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = await getDeployer();
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
        "upgrade(address,address)",
        ["address", "address"],
        [vault.address, preparedNewVault],
        EXACT_ETA,
        { nonce: nonce++ }
      )
    );
  }

  fileService.writeJson(TITLE, timelockTransactions);
};

export default func;
func.tags = ["UpgradeVault"];
