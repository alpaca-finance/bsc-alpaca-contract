import { BiswapDnxStrategyPartialCloseNoTrading } from "../../../../../typechain";
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
    "USDT-ETH 3x BSW1 DeltaNeutralBiswapWorker",
    "ETH-USDT 3x BSW1 DeltaNeutralBiswapWorker",

    "ETH-USDT L3x BSW1 DeltaNeutralBiswapWorker",
    "USDT-ETH L3x BSW1 DeltaNeutralBiswapWorker",

    "USDT-WBNB 8x BSW1 DeltaNeutralBiswapWorker",
    "WBNB-USDT 8x BSW1 DeltaNeutralBiswapWorker",
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

  const stratDnxPartialCloseNoTradeDeployer = new UpgradeableContractDeployer<BiswapDnxStrategyPartialCloseNoTrading>(
    deployer,
    "BiswapDnxStrategyPartialCloseNoTrading"
  );
  const { contract: strategyDnxPartialCloseNoTrade } = await stratDnxPartialCloseNoTradeDeployer.deploy([
    config.YieldSources.Biswap?.BiswapRouterV2,
  ]);

  config = configFileHelper.setSharedStrategyOnKey(
    "Biswap",
    "StrategyPartialCloseNoTrade",
    strategyDnxPartialCloseNoTrade.address
  );

  const worker_addresses = miniWorkers.map((miniWorker) => miniWorker.address);
  if (worker_addresses.length > 0) {
    console.log(">> Whitelisting Workers");
    const tx = await strategyDnxPartialCloseNoTrade.setWorkersOk(worker_addresses, true);
    console.log("✅ Done at: ", tx.hash);
  }
};

export default func;
func.tags = ["BiswapDnxVaultStrategiesPartialCloseNoTrade"];
