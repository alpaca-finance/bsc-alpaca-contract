import { ethers, upgrades } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ProxyAdmin__factory } from "../../../../typechain/factories/ProxyAdmin__factory";
import { compare } from "../../../../utils/address";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { TimelockEntity } from "../../../entities";
import { getConfig } from "../../../entities/config";
import { Converter } from "../../../helper";
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
  const TITLE = "upgrade_ftm_delta_neutral_vault_config02";
  const DELTA_NEUTRAL_VAULT_CONFIG = "DeltaNeutralVaultConfig02";
  const TARGETED_VAULTS = ["n3x-FTMUSDC-SPK1", "n3x-FTMUSDC-SPK2"];
  const EXACT_ETA = "1680865200";

  const config = getConfig();

  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = await getDeployer();
  const chainId = await deployer.getChainId();
  const converter = new Converter();
  const tobeUpgradeVaultConfigs = converter.convertDeltaSymboltoObj(TARGETED_VAULTS);
  let nonce = await deployer.getTransactionCount();

  for (const vault of tobeUpgradeVaultConfigs) {
    console.log("------------------");
    console.log(`> Upgrading DeltaNeutralVaultConfig at ${vault.symbol} through Timelock + ProxyAdmin`);
    console.log("> Prepare upgrade & deploy if needed a new IMPL automatically.");
    const NewVaultConfig = await ethers.getContractFactory(DELTA_NEUTRAL_VAULT_CONFIG);
    const preparedNewVaultConfig = await upgrades.prepareUpgrade(vault.config, NewVaultConfig);
    console.log(`> Implementation address: ${preparedNewVaultConfig}`);
    console.log("✅ Done");

    const proxyAdmin = ProxyAdmin__factory.connect(config.ProxyAdmin, deployer);

    const ops = isFork() ? { nonce: nonce++, gasLimit: 2000000 } : { nonce: nonce++ };
    if (compare(await proxyAdmin.owner(), config.Timelock)) {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          chainId,
          `> Queue tx to upgrade ${vault.symbol} config`,
          config.ProxyAdmin,
          "0",
          "upgrade(address,address)",
          ["address", "address"],
          [vault.config, preparedNewVaultConfig],
          EXACT_ETA,
          ops
        )
      );
    } else {
      console.log("> Execute upgrade contract without Timelock");
      await proxyAdmin.upgrade(vault.config, preparedNewVaultConfig.toString(), ops);
    }
  }

  const timestamp = Math.floor(Date.now() / 1000);
  fileService.writeJson(`${timestamp}_${TITLE}`, timelockTransactions);
};

export default func;
func.tags = ["UpgradeDeltaNeutralVaultConfig"];
