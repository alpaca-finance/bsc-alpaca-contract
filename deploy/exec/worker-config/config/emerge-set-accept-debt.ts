import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { WorkerConfig__factory } from "../../../../typechain";
import { getConfig } from "../../../entities/config";
import _ from "lodash";

interface DerivedSetAcceptDebt {
  workerAddress: string;
  workerName: string;
  workerConfigAddress: string;
  acceptDebt: boolean;
}

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
  const UPDATES: Array<string> = [
    "BUSD-ALPACA PancakeswapWorker",
    "HIGH-BUSD PancakeswapWorker",
    "USDT-BUSD PancakeswapWorker",
    "WBNB-BUSD PancakeswapWorker",
    "VAI-BUSD PancakeswapWorker",
    "USDC-BUSD PancakeswapWorker",
    "DAI-BUSD PancakeswapWorker",
    "UST-BUSD PancakeswapWorker",
    "BTCB-BUSD PancakeswapWorker",
    "ALPACA-BUSD PancakeswapWorker",
    "CAKE-BUSD PancakeswapWorker",
    "BUSD CakeMaxiWorker",
    "FORM-BUSD PancakeswapWorker",
    "TUSD-BUSD PancakeswapWorker",
    "ORBS-BUSD PancakeswapWorker",
    "TRX-BUSD PancakeswapWorker",
    "BTT-BUSD PancakeswapWorker",
    "PMON-BUSD PancakeswapWorker",
    "PHA-BUSD PancakeswapWorker",
    "POTS-BUSD PancakeswapWorker",
    "BMON-BUSD PancakeswapWorker",
    "WBNB-BUSD BiswapWorker",
    "GQ-BUSD BiswapWorker",
    "pSTAKE-BUSD PancakeswapWorker",
  ];
  const ACCEPT_DEBT = true;

  const config = getConfig();
  const [deployer] = await ethers.getSigners();
  const inputs: Array<DerivedSetAcceptDebt> = [];

  for (let i = 0; i < UPDATES.length; i++) {
    for (let j = 0; j < config.Vaults.length; j++) {
      const workerInfo = config.Vaults[j].workers.find((w) => w.name == UPDATES[i]);
      if (workerInfo !== undefined) {
        inputs.push({
          workerName: UPDATES[i],
          workerAddress: workerInfo.address,
          workerConfigAddress: workerInfo.config,
          acceptDebt: ACCEPT_DEBT,
        });
        break;
      }
    }
  }

  if (inputs.length != UPDATES.length) {
    throw "error: cannot derived all input";
  }

  let nonce = await deployer.getTransactionCount();
  const grouppedWorkerConfig = _.groupBy(inputs, (i) => i.workerConfigAddress);

  for (const workerConfigAddress of Object.keys(grouppedWorkerConfig)) {
    console.log(`> Set accept debt for workers in ${workerConfigAddress}`);
    const workerConfig = WorkerConfig__factory.connect(workerConfigAddress, deployer);
    const tx = await workerConfig.emergencySetAcceptDebt(
      grouppedWorkerConfig[workerConfigAddress].map((i) => i.workerAddress),
      ACCEPT_DEBT,
      { nonce: nonce++ }
    );
    console.log(`> ✅ Done at ${tx.hash}`);
  }
};

export default func;
func.tags = ["SetEmergencyWorkerConfigAcceptDebt"];
