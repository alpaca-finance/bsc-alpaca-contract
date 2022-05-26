import { DeltaNeutralVaultsEntity } from "./../../../interfaces/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { getConfig } from "../../../entities/config";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";
import { getDeployer } from "../../../../utils/deployer-helper";
import { Converter } from "../../../helper";

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
  const TITLE = "upgrade_delta_neutral_vault_config";
  const DELTA_NEUTRAL_VAULT = "DeltaNeutralVaultConfig02";
  const TARGETED_VAULTS = [
    "n3x-BNBUSDT-PCS1",
    "n8x-BNBUSDT-PCS1",
    "n8x-BNBUSDT-PCS2",
    "n3x-BNBBUSD-PCS1",
    "n3x-BNBUSDT-PCS2",
    "n3x-BNBBUSD-PCS2",
    "n3x-BNBUSDT-PCS3",
    "n3x-ETHUSDT-BSW1",
    "L3x-USDTETH-BSW1",
    "L3x-BUSDBTCB-PCS1",
  ];
  const EXACT_ETA = "1652860800";

  const config = getConfig();

  config.DeltaNeutralVaults.map((av) => console.log(av.symbol));

  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = await getDeployer();
  const converter = new Converter();
  const tobeUpgradeVaultConfigs = converter.convertDeltaSymboltoObj(TARGETED_VAULTS);
  let nonce = await deployer.getTransactionCount();

  for (const vault of tobeUpgradeVaultConfigs) {
    console.log("------------------");
    console.log(`> Upgrading DeltaNeutralVaultConfig at ${vault} through Timelock + ProxyAdmin`);
    console.log("> Prepare upgrade & deploy if needed a new IMPL automatically.");
    const NewVault = await ethers.getContractFactory(DELTA_NEUTRAL_VAULT);
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
        [vault.address, "0xDb7ba1805b8284b1Ad662F03eF4259e4919DC1c5"],
        EXACT_ETA,
        { nonce: nonce++ }
      )
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  fileService.writeJson(`${timestamp}_${TITLE}`, timelockTransactions);
};

export default func;
func.tags = ["UpgradeDeltaNeutralVault"];
