import { DeltaNeutralPancakeMCV2Worker02__factory } from "./../../../../typechain/factories/DeltaNeutralPancakeMCV2Worker02__factory";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { mapWorkers } from "../../../entities/worker";
import { fileService, TimelockService } from "../../../services";
import { TimelockEntity, WorkerEntity } from "../../../entities";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { compare } from "../../../../utils/address";
import { getConfig } from "../../../entities/config";

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

  const TITLE = "busd_alpaca_workers_allow_strategy-oracle-minimize";
  const ADD_STRAT = "";
  const LIQ_STRAT = "";

  const OK_FLAG = true;
  const STRATEGY = ["0x6ab62a0766691400f7f7c7b2106c774cb83936ef"];
  const WORKERS = ["ALPACA-BUSD PancakeswapWorker", "BUSD-ALPACA PancakeswapWorker"];
  const EXACT_ETA = "1702009800";
  let nonce = 21633;

  const miniWorkers: Array<WorkerEntity.IMiniWorker> = mapWorkers(WORKERS).map((w) => {
    return {
      name: w.name,
      address: w.address,
    };
  });
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = await getDeployer();
  const chainId = await deployer.getChainId();

  for (const miniWorker of miniWorkers) {
    const worker = DeltaNeutralPancakeMCV2Worker02__factory.connect(miniWorker.address, deployer);
    const owner = await worker.owner();
    const ops = isFork() ? { nonce: nonce++, gasLimit: 2000000 } : { nonce: nonce++ };
    if (compare(owner, config.Timelock)) {
      if (ADD_STRAT != "" && LIQ_STRAT != "") {
        timelockTransactions.push(
          await TimelockService.queueTransaction(
            chainId,
            `Setting critical strats for ${miniWorker.name}`,
            miniWorker.address,
            "0",
            "setCriticalStrategies(address,address)",
            ["address", "address"],
            [ADD_STRAT, LIQ_STRAT],
            EXACT_ETA,
            ops
          )
        );
      }

      timelockTransactions.push(
        await TimelockService.queueTransaction(
          chainId,
          `set strategy for ${miniWorker.name}`,
          miniWorker.address,
          "0",
          "setStrategyOk(address[],bool)",
          ["address[]", "bool"],
          [STRATEGY, OK_FLAG],
          EXACT_ETA,
          ops
        )
      );
    } else {
      console.log(`>> Set strategy for ${miniWorker.name}`);
      await worker.setStrategyOk(STRATEGY, OK_FLAG, ops);
      console.log("✅ Done");
    }
  }

  if (timelockTransactions.length > 0) {
    const timestamp = Math.floor(Date.now() / 1000);
    fileService.writeJson(`${timestamp}_${TITLE}`, timelockTransactions);
  }
};

export default func;
func.tags = ["TimelockUpdateAddStratWorkers"];
