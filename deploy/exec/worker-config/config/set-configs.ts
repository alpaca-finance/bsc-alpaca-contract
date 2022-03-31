import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { WorkerConfig__factory } from "../../../../typechain";
import { getConfig } from "../../../entities/config";
import { Multicall2Service } from "../../../services/multicall/multicall2";
import { BigNumber, BigNumberish } from "ethers";
import { TimelockEntity } from "../../../entities";
import { FileService, TimelockService } from "../../../services";

interface SetConfigInput {
  WORKER: string;
  ACCEPT_DEBT?: boolean;
  WORK_FACTOR?: BigNumberish;
  KILL_FACTOR?: BigNumberish;
  MAX_PRICE_DIFF?: BigNumberish;
}

interface SetConfigDerivedInput {
  workerName: string;
  workerAddress: string;
  workerConfigAddress: string;
  acceptDebt: boolean;
  workFactor: BigNumberish;
  killFactor: BigNumberish;
  maxPriceDiff: BigNumberish;
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
  const TITLE = "adjust_BUSD-ALPACA_kill_factor";
  const UPDATES: Array<SetConfigInput> = [
    {
      WORKER: "BUSD-ALPACA PancakeswapWorker",
      KILL_FACTOR: "8333",
    },
  ];
  const EXACT_ETA = "1648535400";

  const config = getConfig();
  const [deployer] = await ethers.getSigners();
  const multicallService = new Multicall2Service(config.MultiCall, deployer);
  const inputs: Array<SetConfigDerivedInput> = [];
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];

  /// @dev derived input
  for (let i = 0; i < UPDATES.length; i++) {
    for (let j = 0; j < config.Vaults.length; j++) {
      const workerInfo = config.Vaults[j].workers.find((w) => w.name == UPDATES[i].WORKER);
      if (workerInfo !== undefined) {
        const workerConfig = WorkerConfig__factory.connect(workerInfo.config, deployer);
        const [currentConfig] = await multicallService.multiContractCall<
          [{ acceptDebt: boolean; workFactor: BigNumber; killFactor: BigNumber; maxPriceDiff: BigNumber }]
        >([
          {
            contract: workerConfig,
            functionName: "workers",
            params: [workerInfo.address],
          },
        ]);

        inputs.push({
          workerName: UPDATES[i].WORKER,
          workerAddress: workerInfo.address,
          workerConfigAddress: workerInfo.config,
          acceptDebt: UPDATES[i].ACCEPT_DEBT || currentConfig.acceptDebt,
          workFactor: UPDATES[i].WORK_FACTOR || currentConfig.workFactor,
          killFactor: UPDATES[i].KILL_FACTOR || currentConfig.killFactor,
          maxPriceDiff: UPDATES[i].MAX_PRICE_DIFF || currentConfig.maxPriceDiff,
        });
        break;
      }
    }
  }

  if (inputs.length != UPDATES.length) {
    throw "error: cannot derived all input";
  }

  let nonce = await deployer.getTransactionCount();
  for (const input of inputs) {
    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `>> Timelock: Setting WorkerConfig for ${input.workerName} via Timelock`,
        input.workerConfigAddress,
        "0",
        "setConfigs(address[],(bool,uint64,uint64,uint64)[])",
        ["address[]", "(bool acceptDebt,uint64 workFactor,uint64 killFactor,uint64 maxPriceDiff)[]"],
        [
          [input.workerAddress],
          [
            {
              acceptDebt: input.acceptDebt,
              workFactor: input.workFactor,
              killFactor: input.killFactor,
              maxPriceDiff: input.maxPriceDiff,
            },
          ],
        ],
        EXACT_ETA,
        { nonce: nonce++ }
      )
    );
  }

  FileService.write(TITLE, timelockTransactions);
};

export default func;
func.tags = ["TimelockUpdateWorkerWorkerConfigParams"];
