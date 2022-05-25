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
  const TITLE = "upgrade_delta_neutral_vault_gateway";
  const DELTA_NEUTRAL_VAULT_GATEWAY_VERSION = "DeltaNeutralVaultGateway";
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
  const EXACT_ETA = "1653116400";

  const config = getConfig();

  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = await getDeployer();
  const toBeUpgradedAvInfos = TARGETED_VAULTS.map((tv) => {
    const vault = config.DeltaNeutralVaults.find((v) => tv == v.symbol);
    if (vault === undefined) {
      throw `error: not found vault with ${tv} symbol`;
    }
    if (vault.config === "") {
      throw `error: not found config address`;
    }

    return vault;
  });
  let nonce = await deployer.getTransactionCount();

  for (const automatedAvInfo of toBeUpgradedAvInfos) {
    console.log("------------------");
    console.log(`> Upgrading DeltaNeutralVaultGateway for ${automatedAvInfo.symbol} through Timelock + ProxyAdmin`);
    console.log("> Prepare upgrade & deploy if needed a new IMPL automatically.");
    const NewImpl = await ethers.getContractFactory(DELTA_NEUTRAL_VAULT_GATEWAY_VERSION);
    const preparedNewVault = await upgrades.prepareUpgrade(automatedAvInfo.gateway, NewImpl);
    console.log(`> Implementation address: ${preparedNewVault}`);
    console.log("✅ Done");

    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `> Queue tx to upgrade ${automatedAvInfo.symbol} gateway`,
        config.ProxyAdmin,
        "0",
        "upgrade(address,address)",
        ["address", "address"],
        [automatedAvInfo.gateway, preparedNewVault],
        EXACT_ETA,
        { nonce: nonce++ }
      )
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  fileService.writeJson(`${timestamp}_${TITLE}`, timelockTransactions);
};

export default func;
func.tags = ["UpgradeDeltaNeutralVaultGateway"];
