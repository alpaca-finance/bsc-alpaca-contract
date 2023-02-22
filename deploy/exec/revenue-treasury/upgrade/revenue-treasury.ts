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
  const TITLE = "fantom_upgrade_revenue_treasury";
  const REVENUE_TREASURY_VERSION = "FantomRevenueTreasury";
  const EXACT_ETA = "1676818800";

  const config = getConfig();

  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = await getDeployer();
  const chainId = await deployer.getChainId();
  const revenueTreasury = config.RevenueTreasury;
  if (!revenueTreasury) {
    throw new Error("revenueTreasury is not found in config");
  }
  const proxyAdmin = ProxyAdmin__factory.connect(config.ProxyAdmin, deployer);
  const proxyAdminOwner = await proxyAdmin.owner();

  let nonce = await deployer.getTransactionCount();

  if (compare(proxyAdminOwner, config.Timelock)) {
    console.log("------------------");
    console.log(`> Upgrading RevenueTreasury through Timelock + ProxyAdmin`);
    console.log("> Prepare upgrade & deploy if needed a new IMPL automatically.");
    const NewReveneTreasury = await ethers.getContractFactory(REVENUE_TREASURY_VERSION);
    const preparedRevenueTreasury = await upgrades.prepareUpgrade(revenueTreasury, NewReveneTreasury);
    console.log(`> Implementation address: ${preparedRevenueTreasury}`);
    console.log("✅ Done");

    timelockTransactions.push(
      await TimelockService.queueTransaction(
        chainId,
        `> Queue tx to upgrade RevenueTreasury`,
        config.ProxyAdmin,
        "0",
        "upgrade(address,address)",
        ["address", "address"],
        [revenueTreasury, preparedRevenueTreasury],
        EXACT_ETA,
        { nonce: nonce++ }
      )
    );
  } else {
    console.log("------------------");
    console.log(`> Upgrading RevenueTreasury through ProxyAdmin`);
    console.log("> Upgrade & deploy if needed a new IMPL automatically.");
    const RevenueTreasury = await ethers.getContractFactory(REVENUE_TREASURY_VERSION);
    const preparedRevenueTreasury = await upgrades.prepareUpgrade(revenueTreasury, RevenueTreasury);
    console.log(`> Implementation address: ${preparedRevenueTreasury}`);

    // Perform actual upgrade
    await upgrades.upgradeProxy(preparedRevenueTreasury, RevenueTreasury);
    console.log("✅ Done");
  }

  if (timelockTransactions.length > 0) {
    const timestamp = Math.floor(new Date().getTime() / 1000);
    fileService.writeJson(`${timestamp}_${TITLE}`, timelockTransactions);
  }
};

export default func;
func.tags = ["UpgradeRevenueTreasury"];
