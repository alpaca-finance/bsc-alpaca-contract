import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { mapWorkers } from "../../../entities/worker";
import { FileService, TimelockService } from "../../../services";
import { TimelockEntity, WorkerEntity } from "../../../entities";

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
  const TITLE = "cakemaxi-worker02-turn-on-new-partial-close-strats";
  const ADD_STRAT = "";
  const LIQ_STRAT = "";

  const OK_FLAG = true;
  const STRATEGY = ["0xdE0DD9Ed04a04f08A96D7E80D72A3D18E2F766A6", "0xd34Ffa026D2754118Cb32525df93eb9a3AC57761"];
  const WORKERS = [
    "TUSD CakeMaxiWorker",
    "BTCB CakeMaxiWorker",
    "USDT CakeMaxiWorker",
    "ETH CakeMaxiWorker",
    "BUSD CakeMaxiWorker",
    "WBNB CakeMaxiWorker",
  ];
  const EXACT_ETA = "1627884000";

  const miniWorkers: Array<WorkerEntity.IMiniWorker> = mapWorkers(WORKERS).map((w) => {
    return {
      name: w.name,
      address: w.address,
    };
  });
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];

  for (const miniWorker of miniWorkers) {
    if (ADD_STRAT && LIQ_STRAT) {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          `Setting critical strats for ${miniWorker.name}`,
          miniWorker.address,
          "0",
          "setCriticalStrategies(address,address)",
          ["address", "address"],
          [ADD_STRAT, LIQ_STRAT],
          EXACT_ETA
        )
      );
    }

    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `set strategy for ${miniWorker.name}`,
        miniWorker.address,
        "0",
        "setStrategyOk(address[],bool)",
        ["address[]", "bool"],
        [STRATEGY, OK_FLAG],
        EXACT_ETA
      )
    );
  }

  FileService.write(TITLE, timelockTransactions);
};

export default func;
func.tags = ["TimelockUpdateAddStratWorkers"];
