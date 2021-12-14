import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { Timelock__factory } from "../../../../typechain";
import MainnetConfig from "../../../../.mainnet.json";
import TestnetConfig from "../../../../.testnet.json";

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
  const workerInputs: Array<string> = ["CAKE-WBNB PancakeswapWorker"];
  const MAX_REINVEST_BOUNTY_BPS = "";
  const EXACT_ETA = "1620575100";

  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig;
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

  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);

  for (let i = 0; i < TO_BE_UPDATED_WORKERS.length; i++) {
    console.log(
      `>> Setting Beneficial Related Data to: ${TO_BE_UPDATED_WORKERS[i].WORKER_NAME} at ${TO_BE_UPDATED_WORKERS[i].ADDRESS} through Timelock`
    );
    console.log(`>> Queue tx on Timelock to upgrade the implementation`);
    await timelock.queueTransaction(
      TO_BE_UPDATED_WORKERS[i].ADDRESS,
      "0",
      "setMaxReinvestBountyBps(uint256)",
      ethers.utils.defaultAbiCoder.encode(["uint256"], [MAX_REINVEST_BOUNTY_BPS]),
      EXACT_ETA,
      { gasPrice: 100000000000 }
    );
    console.log("✅ Done");

    console.log(`>> Generate executeTransaction:`);
    console.log(
      `await timelock.executeTransaction('${TO_BE_UPDATED_WORKERS[i].ADDRESS}', '0', 'setMaxReinvestBountyBps(uint256)', ethers.utils.defaultAbiCoder.encode(['uint256'], ['${MAX_REINVEST_BOUNTY_BPS}']), ${EXACT_ETA})`
    );
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["TimelockSetMaxReinvestBountyBpsWorkers02"];
