import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  BiswapStrategyAddBaseTokenOnly,
  BiswapStrategyAddBaseTokenOnly__factory,
  BiswapStrategyLiquidate,
  BiswapStrategyLiquidate__factory,
  BiswapStrategyPartialCloseLiquidate__factory,
  BiswapStrategyPartialCloseMinimizeTrading,
  BiswapStrategyPartialCloseMinimizeTrading__factory,
  BiswapStrategyWithdrawMinimizeTrading,
  BiswapStrategyWithdrawMinimizeTrading__factory,
  WNativeRelayer__factory,
} from "../../../../../typechain";
import { Strats } from "../../../../entities/strats";
import { mapWorkers } from "../../../../entities/worker";
import { getConfig } from "../../../../entities/config";
import { getDeployer } from "../../../../../utils/deployer-helper";

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
  const WHITELIST_WOKERS: string[] = [];

  const config = getConfig();
  const deployer = await getDeployer();

  const wNativeRelayer = WNativeRelayer__factory.connect(config.SharedConfig.WNativeRelayer, deployer);
  const whitelistedWorkerAddrs = mapWorkers(WHITELIST_WOKERS).map((worker) => worker.address);

  if (DEPLOY_STRATS.includes(Strats.btokenOnly)) {
    /**
     * BiswapStrategyAddBaseTokenOnly
     */
    console.log(">> Deploying an upgradable BiswapStrategyAddBaseTokenOnly contract");
    const BiswapStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "BiswapStrategyAddBaseTokenOnly",
      deployer
    )) as BiswapStrategyAddBaseTokenOnly__factory;
    const strategyAddBaseTokenOnly = (await upgrades.deployProxy(BiswapStrategyAddBaseTokenOnly, [
      config.YieldSources.Biswap!.BiswapRouterV2,
    ])) as BiswapStrategyAddBaseTokenOnly;
    const deployedTx = await strategyAddBaseTokenOnly.deployTransaction.wait(3);
    console.log(`>> Deployed at ${strategyAddBaseTokenOnly.address}`);
    console.log(`>> Deployed block: ${deployedTx.blockNumber}`);
    console.log("✅ Done");

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
    console.log(">> Deploying an upgradable BiswapStrategyLiquidate contract");
    const BiswapStrategyLiquidate = (await ethers.getContractFactory(
      "BiswapStrategyLiquidate",
      deployer
    )) as BiswapStrategyLiquidate__factory;
    const strategyLiquidate = (await upgrades.deployProxy(BiswapStrategyLiquidate, [
      config.YieldSources.Biswap!.BiswapRouterV2,
    ])) as BiswapStrategyLiquidate;
    const deployedTx = await strategyLiquidate.deployTransaction.wait(3);
    console.log(`>> Deployed at ${strategyLiquidate.address}`);
    console.log(`>> Deployed block: ${deployedTx.blockNumber}`);
    console.log("✅ Done");

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
    console.log(">> Deploying an upgradable BiswapStrategyWithdrawMinimizeTrading contract");
    const BiswapStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "BiswapStrategyWithdrawMinimizeTrading",
      deployer
    )) as BiswapStrategyWithdrawMinimizeTrading__factory;
    const strategyWithdrawMinimizeTrading = (await upgrades.deployProxy(BiswapStrategyWithdrawMinimizeTrading, [
      config.YieldSources.Biswap!.BiswapRouterV2,
      config.SharedConfig.WNativeRelayer,
    ])) as BiswapStrategyWithdrawMinimizeTrading;
    const deployedTx = await strategyWithdrawMinimizeTrading.deployTransaction.wait(3);
    console.log(`>> Deployed at ${strategyWithdrawMinimizeTrading.address}`);
    console.log(`>> Deployed block: ${deployedTx.blockNumber}`);

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
    console.log(">> Deploying an upgradable BiswapStrategyPartialCloseLiquidate contract");
    const BiswapStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "BiswapStrategyPartialCloseLiquidate",
      deployer
    )) as BiswapStrategyPartialCloseLiquidate__factory;
    const restrictedStrategyPartialCloseLiquidate = (await upgrades.deployProxy(BiswapStrategyPartialCloseLiquidate, [
      config.YieldSources.Biswap!.BiswapRouterV2,
    ])) as BiswapStrategyLiquidate;
    const deployedTx = await restrictedStrategyPartialCloseLiquidate.deployTransaction.wait(3);
    console.log(`>> Deployed at ${restrictedStrategyPartialCloseLiquidate.address}`);
    console.log(`>> Deployed block: ${deployedTx.blockNumber}`);
    console.log("✅ Done");

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyLiquidate");
      await restrictedStrategyPartialCloseLiquidate.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }
  }

  if (DEPLOY_STRATS.includes(Strats.partialCloseWithdrawMinizmie)) {
    /**
     * BiswapStrategyPartialCloseMinimizeTrading
     */
    console.log(">> Deploying an upgradable BiswapStrategyPartialCloseMinimizeTrading contract");
    const BiswapStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "BiswapStrategyPartialCloseMinimizeTrading",
      deployer
    )) as BiswapStrategyPartialCloseMinimizeTrading__factory;
    const strategyPartialCloseMinimizeTrading = (await upgrades.deployProxy(BiswapStrategyPartialCloseMinimizeTrading, [
      config.YieldSources.Biswap!.BiswapRouterV2,
      config.SharedConfig.WNativeRelayer,
    ])) as BiswapStrategyPartialCloseMinimizeTrading;
    const deployedTx = await strategyPartialCloseMinimizeTrading.deployTransaction.wait(3);

    console.log(`>> Deployed block: ${deployedTx.blockNumber}`);
    console.log(`>> Deployed at ${strategyPartialCloseMinimizeTrading.address}`);

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
