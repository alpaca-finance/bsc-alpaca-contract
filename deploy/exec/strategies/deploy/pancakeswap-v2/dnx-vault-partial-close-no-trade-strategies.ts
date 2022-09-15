import { PancakeswapV2RestrictedDnxStrategyPartialCloseNoTrading } from "../../../../../typechain";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer } from "../../../../../utils/deployer-helper";
import { UpgradeableContractDeployer } from "../../../../deployer";
import { ConfigFileHelper } from "../../../../helper";
import { WorkerEntity } from "../../../../entities";
import { mapWorkers } from "../../../../entities/worker";

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

  const WHITELISTED_WORKERS = [
    "USDT-WBNB 3x DeltaNeutralPancakeswapWorker",
    "WBNB-USDT 3x DeltaNeutralPancakeswapWorker",

    "USDT-WBNB 8x PCS1 DeltaNeutralPancakeswapWorker",
    "WBNB-USDT 8x PCS1 DeltaNeutralPancakeswapWorker",

    "USDT-WBNB 8x PCS2 DeltaNeutralPancakeswapWorker",
    "WBNB-USDT 8x PCS2 DeltaNeutralPancakeswapWorker",

    "WBNB-BUSD 3x PCS1 DeltaNeutralPancakeswapWorker",
    "BUSD-WBNB 3x PCS1 DeltaNeutralPancakeswapWorker",

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
  ];

  const miniWorkers: Array<WorkerEntity.IMiniWorker> = mapWorkers(WHITELISTED_WORKERS).map((w) => {
    return {
      name: w.name,
      address: w.address,
    };
  });

  const deployer = await getDeployer();
  const configFileHelper = new ConfigFileHelper();
  let config = configFileHelper.getConfig();

  const stratDnxPartialCloseNoTradeDeployer =
    new UpgradeableContractDeployer<PancakeswapV2RestrictedDnxStrategyPartialCloseNoTrading>(
      deployer,
      "PancakeswapV2RestrictedDnxStrategyPartialCloseNoTrading"
    );
  const { contract: strategyDnxPartialCloseNoTrade } = await stratDnxPartialCloseNoTradeDeployer.deploy([
    config.YieldSources.PancakeswapMasterChefV2!.RouterV2,
  ]);

  config = configFileHelper.setSharedStrategyOnKey(
    "Pancakeswap",
    "StrategyPartialCloseNoTrade",
    strategyDnxPartialCloseNoTrade.address
  );

  const worker_addresses = miniWorkers.map((miniWorker) => miniWorker.address);
  if (worker_addresses.length > 0) {
    console.log(">> Whitelisting Workers");
    const tx = await strategyDnxPartialCloseNoTrade.setWorkersOk(worker_addresses, true);
    console.log("✅ Done at: ", tx.hash);
  }

  // set strategy address to whitelisted workers
  for (const workerAddress of worker_addresses) {
    configFileHelper.addOrSetWorkerStrategy(
      workerAddress,
      "StrategyPartialCloseNoTrade",
      strategyDnxPartialCloseNoTrade.address
    );
  }
};

export default func;
func.tags = ["PancakeswapDnxVaultStrategiesPartialCloseNoTrade"];
