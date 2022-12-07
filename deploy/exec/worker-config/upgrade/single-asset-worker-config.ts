import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  SingleAssetWorkerConfig,
  SingleAssetWorkerConfig__factory,
  Timelock__factory,
  WorkerConfig__factory,
} from "../../../../typechain";
import { getConfig } from "../../../entities/config";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const config = getConfig();
  /*
  ░██╗░░░░░░░██╗░█████╗░██████╗░███╗░░██╗██╗███╗░░██╗░██████╗░
  ░██║░░██╗░░██║██╔══██╗██╔══██╗████╗░██║██║████╗░██║██╔════╝░
  ░╚██╗████╗██╔╝███████║██████╔╝██╔██╗██║██║██╔██╗██║██║░░██╗░
  ░░████╔═████║░██╔══██║██╔══██╗██║╚████║██║██║╚████║██║░░╚██╗
  ░░╚██╔╝░╚██╔╝░██║░░██║██║░░██║██║░╚███║██║██║░╚███║╚██████╔╝
  ░░░╚═╝░░░╚═╝░░╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚══╝╚═╝╚═╝░░╚══╝░╚═════╝░
  Check all variables below before execute the deployment script
  */
  const TITLE = "upgrade_singleasset_worker_config";
  const TO_BE_UPGRADE_WORKER_CONFIG = config.SharedConfig.PancakeswapSingleAssetWorkerConfig!;
  const EXACT_ETA = "1655751600";

  const deployer = (await ethers.getSigners())[0];
  const chainId = await deployer.getChainId();
  console.log(`>> Upgrading Worker at ${TO_BE_UPGRADE_WORKER_CONFIG} through Timelock + ProxyAdmin`);
  const NewSingleAssetWorkerConfig = (await ethers.getContractFactory(
    "SingleAssetWorkerConfig"
  )) as SingleAssetWorkerConfig__factory;
  const preparedNewSingleAssetWorkerConfig = await upgrades.prepareUpgrade(
    TO_BE_UPGRADE_WORKER_CONFIG,
    NewSingleAssetWorkerConfig
  );
  console.log(`>> New implementation deployed at: ${preparedNewSingleAssetWorkerConfig}`);
  console.log("✅ Done");

  let nonce = await deployer.getTransactionCount();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];

  timelockTransactions.push(
    await TimelockService.queueTransaction(
      chainId,
      "Upgrading single asset worker config",
      config.ProxyAdmin,
      "0",
      "upgrade(address,address)",
      ["address", "address"],
      [TO_BE_UPGRADE_WORKER_CONFIG, preparedNewSingleAssetWorkerConfig],
      EXACT_ETA,
      { nonce: nonce++ }
    )
  );

  const timestamp = Math.floor(Date.now() / 1000);
  fileService.writeJson(`${timestamp}_${TITLE}`, timelockTransactions);
};

export default func;
func.tags = ["UpgradeSingleAssetWorkerConfig"];
