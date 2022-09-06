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

  const WHITELISTED_WORKERS = ["USDT-WBNB 3x DeltaNeutralPancakeswapWorker"];

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
};

export default func;
func.tags = ["PancakeswapDnxVaultStrategiesPartialCloseNoTrade"];
