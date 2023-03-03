import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { RepurchaseBorrowStrategy__factory } from "../../../../typechain";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { WorkerEntity } from "../../../entities";
import { getConfig } from "../../../entities/config";
import { mapWorkers } from "../../../entities/worker";

interface ISetWhitelistedStratWorkers {
  STRAT_NAME: string;
  STRAT_ADDR: string;
  WORKERS: Array<string>;
}

type ISetWhitelistedStratsWorkers = Array<ISetWhitelistedStratWorkers>;

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

  const WHITELISTED_STRATS_WORKERS: ISetWhitelistedStratsWorkers = [
    {
      STRAT_NAME: "StrategyPartialCloseNoTrade",
      STRAT_ADDR: config.SharedStrategies.Biswap?.StrategyPartialCloseNoTrade!,
      WORKERS: ["WBNB-USDT L8x BSW1 DeltaNeutralBiswapWorker"],
    },
  ];

  const deployer = await getDeployer();
  let nonce = await deployer.getTransactionCount();

  for (let i = 0; i < WHITELISTED_STRATS_WORKERS.length; i++) {
    const params = WHITELISTED_STRATS_WORKERS[i];
    const ops = isFork() ? { nonce: nonce++, gasLimit: 2000000 } : { nonce: nonce++ };
    const miniWorkers = mapWorkers(params.WORKERS!);
    const WORKER_ADDRESSES = miniWorkers.map((miniWorker) => miniWorker.address);
    const strat = RepurchaseBorrowStrategy__factory.connect(params.STRAT_ADDR, deployer);
    await strat.setWorkersOk(WORKER_ADDRESSES, true, ops);
    console.log(`await '${params.STRAT_ADDR}'.setWorkersOk('${WORKER_ADDRESSES}', true)`);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["SetSharedStratsWhitelistedWorkers"];
