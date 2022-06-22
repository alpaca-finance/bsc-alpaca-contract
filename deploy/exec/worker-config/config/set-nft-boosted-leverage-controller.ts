import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { WorkerConfig__factory } from "../../../../typechain";
import { getConfig } from "../../../entities/config";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";
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
  const config = getConfig();

  const TITLE = "set_single_asset_worker_config_nft_boosted_leverage_controller";
  const WORKER_CONFIG_ADDRESS = config.SharedConfig.PancakeswapSingleAssetWorkerConfig;
  const NFT_BOOSTED_LEVERAGE_CONTROLLER_ADDRESS = config.NFT?.NFTBoostedLeverageController;
  const EXACT_ETA = "1655753400";

  const [deployer] = await ethers.getSigners();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];

  /// @dev derived input
  if (!WORKER_CONFIG_ADDRESS) throw new Error("WORKER_CONFIG_ADDRESS is required");
  if (!NFT_BOOSTED_LEVERAGE_CONTROLLER_ADDRESS) throw new Error("NFT_BOOSTED_LEVERAGE_CONTROLLER_ADDRESS is required");

  const ownerAddress = await WorkerConfig__factory.connect(WORKER_CONFIG_ADDRESS, deployer).owner();

  let nonce = await deployer.getTransactionCount();
  if (compare(config.Timelock, ownerAddress)) {
    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `>> Timelock: Setting NFT boosted leverage for ${WORKER_CONFIG_ADDRESS} via Timelock`,
        WORKER_CONFIG_ADDRESS,
        "0",
        "setNFTBoostedLeverageController(address)",
        ["address"],
        [NFT_BOOSTED_LEVERAGE_CONTROLLER_ADDRESS],
        EXACT_ETA,
        { nonce: nonce++ }
      )
    );
  } else {
    console.log("----------------");
    console.log("> Setting NFT boosted leverage for", WORKER_CONFIG_ADDRESS);
    const workerConfig = WorkerConfig__factory.connect(WORKER_CONFIG_ADDRESS, deployer);
    const tx = await workerConfig.setNFTBoostedLeverageController(NFT_BOOSTED_LEVERAGE_CONTROLLER_ADDRESS);
    await tx.wait(3);
    console.log(">> Transaction Hash:", tx.hash);
  }

  if (timelockTransactions.length > 0) {
    const ts = Math.floor(new Date().getTime() / 1000);
    fileService.writeJson(`${ts}_${TITLE}`, timelockTransactions);
  }
};

export default func;
func.tags = ["SetNftBoostedLeverageController"];
