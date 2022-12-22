import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { ethers, upgrades } from "hardhat";
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

  const TITLE = "upgrade_aip8_ausd_staking";
  const AIP8AUSDSTAKING = "AIP8AUSDStaking";
  const EXACT_ETA = "1671793200";

  const deployer = await getDeployer();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  console.log(">> Upgrading AIP8AUSDStaking contract");

  const config = getConfig();
  const newAIP8AUSDStaking = await ethers.getContractFactory(AIP8AUSDSTAKING);
  const preparedAIP8AUSDStaking = await upgrades.prepareUpgrade(config.AUSDStaking!, newAIP8AUSDStaking);
  console.log(`> Implementation address: ${preparedAIP8AUSDStaking}`);
  console.log("✅ Done");

  const ops = isFork() ? { gasLimit: 2000000 } : {};

  const chainId = await deployer.getChainId();

  timelockTransactions.push(
    await TimelockService.queueTransaction(
      chainId,
      `> Queue tx to upgrade ${config.AUSDStaking!}`,
      config.ProxyAdmin,
      "0",
      "upgrade(address,address)",
      ["address", "address"],
      [config.AUSDStaking!, preparedAIP8AUSDStaking],
      EXACT_ETA,
      ops
    )
  );

  const timestamp = Math.floor(Date.now() / 1000);
  fileService.writeJson(`${timestamp}_${TITLE}`, timelockTransactions);
};

export default func;
func.tags = ["UpgradeAIP8AUSDStaking"];
