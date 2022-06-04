import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { WorkerConfig__factory } from "../../../../typechain";
import { getConfig } from "../../../entities/config";
import { Multicall2Service } from "../../../services/multicall/multicall2";
import { BigNumber, BigNumberish } from "ethers";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";
import { compare } from "../../../../utils/address";

interface SetConfigInput {
  WORKER: string;
  ACCEPT_DEBT?: boolean;
  WORK_FACTOR?: BigNumberish;
  KILL_FACTOR?: BigNumberish;
  MAX_PRICE_DIFF?: BigNumberish;
}

interface SetConfigDerivedInput {
  workerName: string;
  ownerAddress: string;
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
  const TITLE = "adjust_CAKEUSDT_max_lev";
  const UPDATES: Array<SetConfigInput> = [
    {
      WORKER: "CAKE-USDT PancakeswapWorker",
      WORK_FACTOR: 7000,
      KILL_FACTOR: 8333,
    },
  ];
  const EXACT_ETA = "1654253100";

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
        const [currentConfig, ownerAddress] = await multicallService.multiContractCall<
          [{ acceptDebt: boolean; workFactor: BigNumber; killFactor: BigNumber; maxPriceDiff: BigNumber }, string]
        >([
          {
            contract: workerConfig,
            functionName: "workers",
            params: [workerInfo.address],
          },
          {
            contract: workerConfig,
            functionName: "owner",
          },
        ]);

        inputs.push({
          workerName: UPDATES[i].WORKER,
          workerAddress: workerInfo.address,
          ownerAddress,
          workerConfigAddress: workerInfo.config,
          acceptDebt: UPDATES[i].ACCEPT_DEBT !== undefined ? UPDATES[i].ACCEPT_DEBT! : currentConfig.acceptDebt,
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
    if (compare(config.Timelock, input.ownerAddress)) {
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
    } else {
      console.log("----------------");
      console.log("> Setting risk parameters for", input.workerName);
      const workerConfig = WorkerConfig__factory.connect(input.workerConfigAddress, deployer);
      const tx = await workerConfig.setConfigs(
        [input.workerAddress],
        [
          {
            acceptDebt: input.acceptDebt,
            workFactor: input.workFactor,
            killFactor: input.killFactor,
            maxPriceDiff: input.maxPriceDiff,
          },
        ]
      );
      await tx.wait(3);
      console.log(">> Transaction Hash:", tx.hash);
    }
  }

  const ts = Math.floor(new Date().getTime() / 1000);
  fileService.writeJson(`${ts}_${TITLE}`, timelockTransactions);
};

export default func;
func.tags = ["TimelockUpdateWorkerWorkerConfigParams"];
