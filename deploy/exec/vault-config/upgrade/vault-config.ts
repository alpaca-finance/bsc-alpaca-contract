import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades, network } from "hardhat";
import { ConfigurableInterestVaultConfig__factory, Timelock__factory } from "../../../../typechain";
import MainnetConfig from "../../../../.mainnet.json";
import TestnetConfig from "../../../../.testnet.json";
import { getConfig } from "../../../entities/config";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";

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
  const TITLE = "upgrade_vault_config_for_nft_staking";
  const TARGETED_VAULT_CONFIG = [
    "ibWBNB",
    "ibBUSD",
    "ibETH",
    "ibALPACA",
    "ibUSDT",
    "ibBTCB",
    "ibTUSD",
    "ibUSDC",
    "ibCAKE",
  ];
  const EXACT_ETA = "1655751600";

  const config = getConfig();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = (await ethers.getSigners())[0];

  const toBeUpgradedVaults = TARGETED_VAULT_CONFIG.map((tv) => {
    const vault = config.Vaults.find((v) => tv == v.symbol);
    if (vault === undefined) {
      throw `error: not found vault with ${tv} symbol`;
    }
    if (vault.config === "") {
      throw `error: not found config address`;
    }

    return vault;
  });

  console.log(`>> Prepare upgrade vault config through Timelock + ProxyAdmin`);

  let nonce = await deployer.getTransactionCount();

  for (const toBeUpgradedVault of toBeUpgradedVaults) {
    console.log(">> Prepare upgrade a new IMPL. (It should return the same impl address)");
    const NewVaultConfig = (await ethers.getContractFactory(
      "ConfigurableInterestVaultConfig"
    )) as ConfigurableInterestVaultConfig__factory;
    const preparedNewVaultConfig = await upgrades.prepareUpgrade(toBeUpgradedVaults[0].config, NewVaultConfig);
    console.log(`>> Implementation deployed at: ${preparedNewVaultConfig}`);
    console.log("✅ Done");

    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `Upgrade ${toBeUpgradedVault.symbol} Vault Config`,
        config.ProxyAdmin,
        "0",
        "upgrade(address,address)",
        ["address", "address"],
        [toBeUpgradedVault.config, preparedNewVaultConfig],
        EXACT_ETA,
        { nonce: nonce++ }
      )
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  fileService.writeJson(`${timestamp}_${TITLE}`, timelockTransactions);
};

export default func;
func.tags = ["UpgradeVaultConfig"];
