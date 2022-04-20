import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { mapWorkers } from "../../../entities/worker";
import { fileService, TimelockService } from "../../../services";
import { TimelockEntity, WorkerEntity } from "../../../entities";
import { getDeployer } from "../../../../utils/deployer-helper";

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
  const TITLE = "waultswap_allow_oracle_minimize_and_liquidate";
  const ADD_STRAT = "";
  const LIQ_STRAT = "";

  const OK_FLAG = true;
  const STRATEGY = ["0x82573b46630cA335A7cA68a0AE42d0eE6a02df68", "0x3DA8c388cd5e5a7011EBd084D3708a117067eBbc"];
  const WORKERS = [
    "WEX-WBNB WaultswapWorker",
    "BUSD-WBNB WaultswapWorker",
    "ALPACA-WBNB WaultswapWorker",
    "WAULTx-WBNB WaultswapWorker",
    "ETH-BUSD WaultswapWorker",
    "WBNB-BUSD WaultswapWorker",
    "USDT-BUSD WaultswapWorker",
    "BTCB-BUSD WaultswapWorker",
    "WUSD-BUSD WaultswapWorker",
    "BUSD-ETH WaultswapWorker",
    "BTCB-ETH WaultswapWorker",
    "BETH-ETH WaultswapWorker",
    "USDT-ETH WaultswapWorker",
    "USDT-ALPACA WaultswapWorker",
    "WBNB-ALPACA WaultswapWorker",
    "ALPACA-USDT WaultswapWorker",
    "WEX-USDT WaultswapWorker",
    "BUSD-USDT WaultswapWorker",
    "BTCB-USDT WaultswapWorker",
    "ETH-USDT WaultswapWorker",
    "MATIC-USDT WaultswapWorker",
    "TUSD-USDT WaultswapWorker",
    "ETH-BTCB WaultswapWorker",
    "USDT-BTCB WaultswapWorker",
    "BUSD-BTCB WaultswapWorker",
    "USDT-TUSD WaultswapWorker",
  ];
  const EXACT_ETA = "1649233800";

  const miniWorkers: Array<WorkerEntity.IMiniWorker> = mapWorkers(WORKERS).map((w) => {
    return {
      name: w.name,
      address: w.address,
    };
  });
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = await getDeployer();
  let nonce = await deployer.getTransactionCount();

  for (const miniWorker of miniWorkers) {
    if (ADD_STRAT != "" && LIQ_STRAT != "") {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          `Setting critical strats for ${miniWorker.name}`,
          miniWorker.address,
          "0",
          "setCriticalStrategies(address,address)",
          ["address", "address"],
          [ADD_STRAT, LIQ_STRAT],
          EXACT_ETA,
          { nonce: nonce++ }
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
        EXACT_ETA,
        { nonce: nonce++ }
      )
    );
  }

  fileService.writeJson(TITLE, timelockTransactions);
};

export default func;
func.tags = ["TimelockUpdateAddStratWorkers"];
