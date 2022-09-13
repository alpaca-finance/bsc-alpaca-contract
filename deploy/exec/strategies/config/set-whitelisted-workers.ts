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
      STRAT_NAME: "StrategyRepurchaseBorrow",
      STRAT_ADDR: config.SharedStrategies.All?.StrategyRepurchaseBorrow!,
      WORKERS: [
        "USDT-WBNB 3x DeltaNeutralPancakeswapWorker",
        "WBNB-USDT 3x DeltaNeutralPancakeswapWorker",

        "USDT-WBNB 8x PCS1 DeltaNeutralPancakeswapWorker",
        "WBNB-USDT 8x PCS1 DeltaNeutralPancakeswapWorker",

        "USDT-WBNB 8x PCS2 DeltaNeutralPancakeswapWorker",
        "WBNB-USDT 8x PCS2 DeltaNeutralPancakeswapWorker",

        // "BUSD-WBNB 3x PCS1 DeltaNeutralPancakeswapWorker", skip
        // "WBNB-BUSD 3x PCS1 DeltaNeutralPancakeswapWorker", skip

        "USDT-WBNB 3x PCS2 DeltaNeutralPancakeswapWorker",
        "WBNB-USDT 3x PCS2 DeltaNeutralPancakeswapWorker",

        "BUSD-WBNB 3x PCS2 DeltaNeutralPancakeswapWorker",
        "WBNB-BUSD 3x PCS2 DeltaNeutralPancakeswapWorker",

        "USDT-WBNB 3x PCS3 DeltaNeutralPancakeswapWorker",
        "WBNB-USDT 3x PCS3 DeltaNeutralPancakeswapWorker",

        "BTCB-BUSD L3x PCS1 DeltaNeutralPancakeswapWorker",
        "BUSD-BTCB L3x PCS1 DeltaNeutralPancakeswapWorker",

        "BTCB-BUSD L3x PCS2 DeltaNeutralPancakeswapWorker",
        "BUSD-BTCB L3x PCS2 DeltaNeutralPancakeswapWorker",

        "WBNB-BUSD L3x PCS1 DeltaNeutralPancakeswapWorker",
        "BUSD-WBNB L3x PCS1 DeltaNeutralPancakeswapWorker",

        "USDT-WBNB 8x PCS3 DeltaNeutralPancakeswapWorker",
        "WBNB-USDT 8x PCS3 DeltaNeutralPancakeswapWorker",

        "BTCB-BUSD L8x PCS1 DeltaNeutralPancakeswapWorker",
        "BUSD-BTCB L8x PCS1 DeltaNeutralPancakeswapWorker",

        "WBNB-USDT L8x PCS1 DeltaNeutralPancakeswapWorker",
        "USDT-WBNB L8x PCS1 DeltaNeutralPancakeswapWorker",

        "USDT-ETH 3x BSW1 DeltaNeutralBiswapWorker",
        "ETH-USDT 3x BSW1 DeltaNeutralBiswapWorker",

        "ETH-USDT L3x BSW1 DeltaNeutralBiswapWorker",
        "USDT-ETH L3x BSW1 DeltaNeutralBiswapWorker",

        "USDT-WBNB 8x BSW1 DeltaNeutralBiswapWorker",
        "WBNB-USDT 8x BSW1 DeltaNeutralBiswapWorker",
      ],
    },
    {
      STRAT_NAME: "StrategyRepurchaseRepay",
      STRAT_ADDR: config.SharedStrategies.All?.StrategyRepurchaseRepay!,
      WORKERS: [
        "USDT-WBNB 3x DeltaNeutralPancakeswapWorker",
        "WBNB-USDT 3x DeltaNeutralPancakeswapWorker",

        "USDT-WBNB 8x PCS1 DeltaNeutralPancakeswapWorker",
        "WBNB-USDT 8x PCS1 DeltaNeutralPancakeswapWorker",

        "USDT-WBNB 8x PCS2 DeltaNeutralPancakeswapWorker",
        "WBNB-USDT 8x PCS2 DeltaNeutralPancakeswapWorker",

        // "BUSD-WBNB 3x PCS1 DeltaNeutralPancakeswapWorker", skip
        // "WBNB-BUSD 3x PCS1 DeltaNeutralPancakeswapWorker", skip

        "USDT-WBNB 3x PCS2 DeltaNeutralPancakeswapWorker",
        "WBNB-USDT 3x PCS2 DeltaNeutralPancakeswapWorker",

        "BUSD-WBNB 3x PCS2 DeltaNeutralPancakeswapWorker",
        "WBNB-BUSD 3x PCS2 DeltaNeutralPancakeswapWorker",

        "USDT-WBNB 3x PCS3 DeltaNeutralPancakeswapWorker",
        "WBNB-USDT 3x PCS3 DeltaNeutralPancakeswapWorker",

        "BTCB-BUSD L3x PCS1 DeltaNeutralPancakeswapWorker",
        "BUSD-BTCB L3x PCS1 DeltaNeutralPancakeswapWorker",

        "BTCB-BUSD L3x PCS2 DeltaNeutralPancakeswapWorker",
        "BUSD-BTCB L3x PCS2 DeltaNeutralPancakeswapWorker",

        "WBNB-BUSD L3x PCS1 DeltaNeutralPancakeswapWorker",
        "BUSD-WBNB L3x PCS1 DeltaNeutralPancakeswapWorker",

        "USDT-WBNB 8x PCS3 DeltaNeutralPancakeswapWorker",
        "WBNB-USDT 8x PCS3 DeltaNeutralPancakeswapWorker",

        "BTCB-BUSD L8x PCS1 DeltaNeutralPancakeswapWorker",
        "BUSD-BTCB L8x PCS1 DeltaNeutralPancakeswapWorker",

        "WBNB-USDT L8x PCS1 DeltaNeutralPancakeswapWorker",
        "USDT-WBNB L8x PCS1 DeltaNeutralPancakeswapWorker",

        "USDT-ETH 3x BSW1 DeltaNeutralBiswapWorker",
        "ETH-USDT 3x BSW1 DeltaNeutralBiswapWorker",

        "ETH-USDT L3x BSW1 DeltaNeutralBiswapWorker",
        "USDT-ETH L3x BSW1 DeltaNeutralBiswapWorker",

        "USDT-WBNB 8x BSW1 DeltaNeutralBiswapWorker",
        "WBNB-USDT 8x BSW1 DeltaNeutralBiswapWorker",
      ],
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
