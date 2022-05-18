import { DeltaNeutralVault__factory } from "./../../../../typechain/factories/DeltaNeutralVault__factory";
import { ProxyAdmin__factory } from "./../../../../typechain/factories/ProxyAdmin__factory";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { getConfig } from "../../../entities/config";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";
import { getDeployer, getTimeLock } from "../../../../utils/deployer-helper";
import { UpgradeableContractDeployer } from "../../../deployer/contract-deployer";
import { DeltaNeutralVault } from "../../../../typechain";

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
  const TITLE = "upgrade_delta_neutral_vault";
  const DELTA_NEUTRAL_VAULT = "DeltaNeutralVault";

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
  const EXACT_ETA = "1651893300";

  const config = getConfig();

  console.log("FORK JAA");
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = await getDeployer();
  console.log("deployer", deployer.address);
  const toBeUpgradedVaults = TARGETED_VAULTS.map((tv) => {
    const vault = config.DeltaNeutralVaults.find((v) => tv == v.symbol);
    if (vault === undefined) {
      throw `error: not found vault with ${tv} symbol`;
    }
    if (vault.config === "") {
      throw `error: not found config address`;
    }

    return vault;
  });

  //deploy contract
  //proxy
  const timeLock = await getTimeLock();
  const proxyAdminAstl = ProxyAdmin__factory.connect(config.ProxyAdmin, timeLock);

  for (const vault of toBeUpgradedVaults) {
    console.log("------------------");
    console.log(`> Upgrading DeltaNeutralVault at ${vault.symbol} through Timelock + ProxyAdmin`);
    console.log("> Prepare upgrade & deploy if needed a new IMPL automatically.");

    await proxyAdminAstl.upgrade(vault.address, `0xfcc7e1be7ceb6b428123716fd24532a5071907f9`);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["UpgradeDeltaNeutralVaultFORK"];
