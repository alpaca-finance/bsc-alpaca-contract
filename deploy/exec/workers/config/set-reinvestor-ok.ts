import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { TimelockEntity } from "../../../entities";
import { mapWorkers } from "../../../entities/worker";
import { fileService, TimelockService } from "../../../services";
import { ethers } from "hardhat";
import { PancakeswapWorker__factory } from "../../../../typechain";
import { compare } from "../../../../utils/address";
import { getConfig } from "../../../entities/config";
/**
 * @description Deployment script for upgrades workers to 02 version
 * @param  {HardhatRuntimeEnvironment} hre
 */
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
  const fileName = "mainnet-set-reinvestor-ok_USDT-WBNB 8x BSW1 DeltaNeutralBiswapWorker";
  const workerInputs: Array<string> = ["USDT-WBNB 8x BSW1 DeltaNeutralBiswapWorker"];
  const REINVESTOR = "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De";
  const IS_ENABLE = true;
  const EXACT_ETA = "1657603800";

  const targetedWorkers = mapWorkers(workerInputs);
  const config = getConfig();
  const deployer = (await ethers.getSigners())[0];
  const chainId = await deployer.getChainId();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  let nonce = await deployer.getTransactionCount();

  for (const targetedWorker of targetedWorkers) {
    const worker = PancakeswapWorker__factory.connect(targetedWorker.address, ethers.provider);
    const ownerAddress = await worker.owner();

    if (compare(ownerAddress, config.Timelock)) {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          chainId,
          `set reinvestor for ${targetedWorker.name}`,
          targetedWorker.address,
          "0",
          "setReinvestorOk(address[],bool)",
          ["address[]", "bool"],
          [[REINVESTOR], IS_ENABLE],
          EXACT_ETA,
          { nonce: nonce++ }
        )
      );
    } else {
      const setReinvestorTx = await worker.setReinvestorOk([REINVESTOR], IS_ENABLE);
      await setReinvestorTx.wait(3);
    }
  }

  if (timelockTransactions.length > 0) {
    const ts = Math.floor(Date.now() / 1000);
    fileService.writeJson(`${ts}_${fileName}`, timelockTransactions);
  }
};

export default func;
func.tags = ["WorkerSetReinvestorOk"];
