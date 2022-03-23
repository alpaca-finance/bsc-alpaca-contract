import { SpookyWorker03__factory } from "./../../../../typechain/factories/SpookyWorker03__factory";
import { TombWorker03__factory } from "./../../../../typechain/factories/TombWorker03__factory";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { ConfigEntity } from "../../../entities";
import { getDeployer } from "../../../../utils/deployer-helper";

interface IWorker {
  WORKER_NAME: string;
  ADDRESS: string;
}

type IWorkers = Array<IWorker>;

/**
 * @description Deployment script for setting workers' beneficial vault related data
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
  const workerInputs: Array<string> = [
    "WFTM-ALPACA SpookyWorker",
    "TUSD-USDC SpookyWorker",
    "WFTM-USDC SpookyWorker",
    "MIM-WFTM SpookyWorker",
    "DAI-WFTM SpookyWorker",
    "fUSDT-WFTM SpookyWorker",
    "BTC-WFTM SpookyWorker",
    "ALPACA-WFTM SpookyWorker",
    "ETH-WFTM SpookyWorker",
    "BOO-WFTM SpookyWorker",
    "USDC-WFTM SpookyWorker",
    "WFTM-TOMB TombWorker",
    "TSHARE-WFTM TombWorker",
    "TOMB-WFTM TombWorker",
  ];
  const MAX_REINVEST_BOUNTY_BPS = "900";

  const config = ConfigEntity.getConfig();
  const allWorkers: IWorkers = config.Vaults.reduce((accum, vault) => {
    return accum.concat(
      vault.workers.map((worker) => {
        return {
          WORKER_NAME: worker.name,
          ADDRESS: worker.address,
        };
      })
    );
  }, [] as IWorkers);

  const TO_BE_UPDATED_WORKERS: IWorkers = workerInputs.map((workerInput) => {
    // 1. find each worker having an identical name as workerInput
    // 2. if hit return
    // 3. other wise throw error
    const hit = allWorkers.find((worker) => {
      return worker.WORKER_NAME === workerInput;
    });

    if (!!hit) return hit;

    throw new Error(`could not find ${workerInput}`);
  });

  const deployer = await getDeployer();

  let nonce = await deployer.getTransactionCount();

  for (let i = 0; i < TO_BE_UPDATED_WORKERS.length; i++) {
    console.log(`>> Set max reinvest for ${TO_BE_UPDATED_WORKERS[i].WORKER_NAME}`);
    if (TO_BE_UPDATED_WORKERS[i].WORKER_NAME.includes("TombWorker")) {
      const tombWorker03 = TombWorker03__factory.connect(TO_BE_UPDATED_WORKERS[i].ADDRESS, deployer);
      await tombWorker03.setMaxReinvestBountyBps(MAX_REINVEST_BOUNTY_BPS, {
        nonce: nonce++,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      console.log("✅ Done");
      continue;
    }
    const spookyWorker03 = SpookyWorker03__factory.connect(TO_BE_UPDATED_WORKERS[i].ADDRESS, deployer);
    await spookyWorker03.setMaxReinvestBountyBps(MAX_REINVEST_BOUNTY_BPS, {
      nonce: nonce++,
      gasPrice: ethers.utils.parseUnits("10", "gwei"),
    });
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["SetMaxReinvestBountyBpsWorkers03"];
