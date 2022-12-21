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

  const TITLE = "upgrade_automated_vault_controller";
  const AutomatedVaultController = "AutomatedVaultController";
  const EXACT_ETA = "1671685200";

  const deployer = await getDeployer();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  console.log(">> Upgrading AutomatedVaultController contract");

  const config = getConfig();
  const newAutomatedVaultController = await ethers.getContractFactory(AutomatedVaultController);
  const preparedAVController = await upgrades.prepareUpgrade(
    config.AutomatedVaultController?.address!,
    newAutomatedVaultController
  );
  console.log(`> Implementation address: ${preparedAVController}`);
  console.log("✅ Done");

  const ops = isFork() ? { gasLimit: 2000000 } : {};

  const chainId = await deployer.getChainId();

  timelockTransactions.push(
    await TimelockService.queueTransaction(
      chainId,
      `> Queue tx to upgrade ${config.AutomatedVaultController?.address!}`,
      config.ProxyAdmin,
      "0",
      "upgrade(address,address)",
      ["address", "address"],
      [config.AutomatedVaultController?.address!, preparedAVController],
      EXACT_ETA,
      ops
    )
  );

  const timestamp = Math.floor(Date.now() / 1000);
  fileService.writeJson(`${timestamp}_${TITLE}`, timelockTransactions);
};

export default func;
func.tags = ["UpgradeAVController"];
