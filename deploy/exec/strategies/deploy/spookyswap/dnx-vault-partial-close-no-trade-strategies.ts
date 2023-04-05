import { SpookySwapDnxStrategyPartialCloseNoTrading } from "../../../../../typechain";
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
    "USDC-WFTM 3x SPK1 DeltaNeutralSpookyWorker",
    "WFTM-USDC 3x SPK1 DeltaNeutralSpookyWorker",
    "USDC-WFTM 3x SPK2 DeltaNeutralSpookyWorker",
    "WFTM-USDC 3x SPK2 DeltaNeutralSpookyWorker",
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
    new UpgradeableContractDeployer<SpookySwapDnxStrategyPartialCloseNoTrading>(
      deployer,
      "SpookySwapDnxStrategyPartialCloseNoTrading"
    );
  const { contract: strategyDnxPartialCloseNoTrade } = await stratDnxPartialCloseNoTradeDeployer.deploy([
    config.YieldSources.SpookySwap?.SpookyRouter,
  ]);

  config = configFileHelper.setSharedStrategyOnKey(
    "SpookySwap",
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
func.tags = ["SpookySwapDnxVaultStrategiesPartialCloseNoTrade"];
