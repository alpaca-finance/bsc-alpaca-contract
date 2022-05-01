import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  BiswapStrategyAddBaseTokenOnly,
  BiswapStrategyLiquidate,
  BiswapStrategyPartialCloseLiquidate,
  BiswapStrategyPartialCloseMinimizeTrading,
  BiswapStrategyWithdrawMinimizeTrading,
  WNativeRelayer__factory,
} from "../../../../../typechain";
import { Strats } from "../../../../entities/strats";
import { mapWorkers } from "../../../../entities/worker";
import { getDeployer } from "../../../../../utils/deployer-helper";
import { UpgradeableContractDeployer } from "../../../../deployer";
import { ConfigFileHelper } from "../../../../helper";

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

  const DEPLOY_STRATS = [
    Strats.btokenOnly,
    Strats.liquidateAll,
    Strats.withdrawMinimize,
    Strats.partialCloseLiquidate,
    Strats.partialCloseWithdrawMinizmie,
  ];
  const WHITELIST_WOKERS: Array<string> = [];

  const deployer = await getDeployer();
  const configFileHelper = new ConfigFileHelper();
  let config = configFileHelper.getConfig();

  const wNativeRelayer = WNativeRelayer__factory.connect(config.SharedConfig.WNativeRelayer, deployer);
  const whitelistedWorkerAddrs = mapWorkers(WHITELIST_WOKERS).map((worker) => worker.address);

  if (DEPLOY_STRATS.includes(Strats.btokenOnly)) {
    /**
     * BiswapStrategyAddBaseTokenOnly
     */
    const biswapStratAddBaseTokenDeployer = new UpgradeableContractDeployer<BiswapStrategyAddBaseTokenOnly>(
      deployer,
      "BiswapStrategyAddBaseTokenOnly"
    );
    const { contract: strategyAddBaseTokenOnly } = await biswapStratAddBaseTokenDeployer.deploy([
      config.YieldSources.Biswap!.BiswapRouterV2,
    ]);

    config = configFileHelper.setSharedStrategyOnKey(
      "Biswap",
      "StrategyAddBaseTokenOnly",
      strategyAddBaseTokenOnly.address
    );

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyAddBaseTokenOnly");
      await strategyAddBaseTokenOnly.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }
  }

  if (DEPLOY_STRATS.includes(Strats.liquidateAll)) {
    /**
     * BiswapStrategyLiquidate
     */
    const biswapStratLiquidateDeployer = new UpgradeableContractDeployer<BiswapStrategyLiquidate>(
      deployer,
      "BiswapStrategyLiquidate"
    );
    const { contract: strategyLiquidate } = await biswapStratLiquidateDeployer.deploy([
      config.YieldSources.Biswap!.BiswapRouterV2,
    ]);

    config = configFileHelper.setSharedStrategyOnKey("Biswap", "StrategyLiquidate", strategyLiquidate.address);

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyLiquidate");
      await strategyLiquidate.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }
  }

  if (DEPLOY_STRATS.includes(Strats.withdrawMinimize)) {
    /**
     * BiswapStrategyWithdrawMinimizeTrading
     */
    const biswapStratWithdrawMinimizeTrading = new UpgradeableContractDeployer<BiswapStrategyWithdrawMinimizeTrading>(
      deployer,
      "BiswapStrategyWithdrawMinimizeTrading"
    );
    const { contract: strategyWithdrawMinimizeTrading } = await biswapStratWithdrawMinimizeTrading.deploy([
      config.YieldSources.Biswap!.BiswapRouterV2,
      config.SharedConfig.WNativeRelayer,
    ]);

    config = configFileHelper.setSharedStrategyOnKey(
      "Biswap",
      "StrategyWithdrawMinimizeTrading",
      strategyWithdrawMinimizeTrading.address
    );

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyWithdrawMinimizeTrading");
      await strategyWithdrawMinimizeTrading.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }

    console.log(">> Whitelist strategyWithdrawMinimizeTrading on WNativeRelayer");
    await wNativeRelayer.setCallerOk([strategyWithdrawMinimizeTrading.address], true);
    console.log("✅ Done");
  }

  if (DEPLOY_STRATS.includes(Strats.partialCloseLiquidate)) {
    /**
     * BiswapStrategyPartialCloseLiquidate
     */
    const strategyPartialCloseLiquidateDeployer = new UpgradeableContractDeployer<BiswapStrategyPartialCloseLiquidate>(
      deployer,
      "BiswapStrategyPartialCloseLiquidate"
    );
    const { contract: strategyPartialCloseLiquidate } = await strategyPartialCloseLiquidateDeployer.deploy([
      config.YieldSources.Biswap!.BiswapRouterV2,
    ]);

    config = configFileHelper.setSharedStrategyOnKey(
      "Biswap",
      "StrategyPartialCloseLiquidate",
      strategyPartialCloseLiquidate.address
    );

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyLiquidate");
      await strategyPartialCloseLiquidate.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }
  }

  if (DEPLOY_STRATS.includes(Strats.partialCloseWithdrawMinizmie)) {
    /**
     * BiswapStrategyPartialCloseMinimizeTrading
     */
    const strategyPartialCloseMinimizeTradingDeployer =
      new UpgradeableContractDeployer<BiswapStrategyPartialCloseMinimizeTrading>(
        deployer,
        "BiswapStrategyPartialCloseMinimizeTrading"
      );
    const { contract: strategyPartialCloseMinimizeTrading } = await strategyPartialCloseMinimizeTradingDeployer.deploy([
      config.YieldSources.Biswap!.BiswapRouterV2,
      config.SharedConfig.WNativeRelayer,
    ]);

    config = configFileHelper.setSharedStrategyOnKey(
      "Biswap",
      "StrategyPartialCloseMinimizeTrading",
      strategyPartialCloseMinimizeTrading.address
    );

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyPartialCloseMinimizeTrading");
      await strategyPartialCloseMinimizeTrading.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }

    console.log(">> Whitelist strategyPartialCloseMinimizeTrading on WNativeRelayer");
    await wNativeRelayer.setCallerOk([strategyPartialCloseMinimizeTrading.address], true);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["BiswapShareStrategies"];
