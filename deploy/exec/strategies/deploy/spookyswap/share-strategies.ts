import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  SpookySwapStrategyAddBaseTokenOnly,
  SpookySwapStrategyAddBaseTokenOnly__factory,
  SpookySwapStrategyLiquidate,
  SpookySwapStrategyLiquidate__factory,
  SpookySwapStrategyPartialCloseLiquidate,
  SpookySwapStrategyPartialCloseLiquidate__factory,
  SpookySwapStrategyPartialCloseMinimizeTrading,
  SpookySwapStrategyPartialCloseMinimizeTrading__factory,
  SpookySwapStrategyWithdrawMinimizeTrading,
  SpookySwapStrategyWithdrawMinimizeTrading__factory,
  WNativeRelayer__factory,
} from "../../../../../typechain";
import { Strats } from "../../../../entities/strats";
import { getConfig } from "../../../../entities/config";
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

  const DEPLOY_STRATS = [
    Strats.btokenOnly,
    Strats.liquidateAll,
    Strats.withdrawMinimize,
    Strats.partialCloseLiquidate,
    Strats.partialCloseWithdrawMinizmie,
  ];
  const WHITELIST_WORKERS: string[] = [];

  const config = getConfig();
  const whitelistedWorkerAddrs = mapWorkers(WHITELIST_WORKERS).map((w) => w.address);
  const deployer = (await ethers.getSigners())[0];
  const wNativeRelayer = WNativeRelayer__factory.connect(config.SharedConfig.WNativeRelayer, deployer);

  if (DEPLOY_STRATS.includes(Strats.btokenOnly)) {
    /**
     * Restricted StrategyAddBaseTokenOnly
     */
    console.log(">> Deploying an upgradable SpookySwap - StrategyAddBaseTokenOnly contract");
    const SpookySwapStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "SpookySwapStrategyAddBaseTokenOnly",
      deployer
    )) as SpookySwapStrategyAddBaseTokenOnly__factory;
    const strategyAddBaseTokenOnly = (await upgrades.deployProxy(SpookySwapStrategyAddBaseTokenOnly, [
      config.YieldSources.SpookySwap!.SpookyRouter,
    ])) as SpookySwapStrategyAddBaseTokenOnly;
    await strategyAddBaseTokenOnly.deployTransaction.wait(3);
    console.log(`>> Deployed at ${strategyAddBaseTokenOnly.address}`);
    console.log("✅ Done");

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategy add base token only");
      await strategyAddBaseTokenOnly.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }
  }

  if (DEPLOY_STRATS.includes(Strats.liquidateAll)) {
    /**
     * Restricted StrategyLiquidate
     */
    console.log(">> Deploying an upgradable SpookySwap - StrategyLiquidate contract");
    const SpookySwapStrategyLiquidate = (await ethers.getContractFactory(
      "SpookySwapStrategyLiquidate",
      deployer
    )) as SpookySwapStrategyLiquidate__factory;
    const strategyLiquidate = (await upgrades.deployProxy(SpookySwapStrategyLiquidate, [
      config.YieldSources.SpookySwap!.SpookyRouter,
    ])) as SpookySwapStrategyLiquidate;
    await strategyLiquidate.deployTransaction.wait(3);
    console.log(`>> Deployed at ${strategyLiquidate.address}`);
    console.log("✅ Done");

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategy liquidate");
      await strategyLiquidate.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }
  }

  if (DEPLOY_STRATS.includes(Strats.withdrawMinimize)) {
    /**
     * Restricted StrategyWithdrawMinimizeTrading
     */
    console.log(">> Deploying an upgradable Spooky - StrategyWithdrawMinimizeTrading contract");
    const SpookySwapStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "SpookySwapStrategyWithdrawMinimizeTrading",
      deployer
    )) as SpookySwapStrategyWithdrawMinimizeTrading__factory;
    const strategyWithdrawMinimizeTrading = (await upgrades.deployProxy(SpookySwapStrategyWithdrawMinimizeTrading, [
      config.YieldSources.SpookySwap!.SpookyRouter,
      config.SharedConfig.WNativeRelayer,
    ])) as SpookySwapStrategyWithdrawMinimizeTrading;
    await strategyWithdrawMinimizeTrading.deployed();
    console.log(`>> Deployed at ${strategyWithdrawMinimizeTrading.address}`);

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategy withdraw minimize trading");
      await strategyWithdrawMinimizeTrading.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }

    console.log(">> Whitelist StrategyWithdrawMinimizeTrading on WNativeRelayer");
    await wNativeRelayer.setCallerOk([strategyWithdrawMinimizeTrading.address], true);
    console.log("✅ Done");
  }

  if (DEPLOY_STRATS.includes(Strats.partialCloseLiquidate)) {
    /**
     * Restricted StrategyPartialCloseLiquidate
     */
    console.log(">> Deploying an upgradable Spooky - StrategyPartialCloseLiquidate contract");
    const SpookySwapStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "SpookySwapStrategyPartialCloseLiquidate",
      deployer
    )) as SpookySwapStrategyPartialCloseLiquidate__factory;
    const strategyPartialCloseLiquidate = (await upgrades.deployProxy(SpookySwapStrategyPartialCloseLiquidate, [
      config.YieldSources.SpookySwap!.SpookyRouter,
    ])) as SpookySwapStrategyPartialCloseLiquidate;
    await strategyPartialCloseLiquidate.deployTransaction.wait(3);
    console.log(`>> Deployed at ${strategyPartialCloseLiquidate.address}`);
    console.log("✅ Done");

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyRestrictedLiquidate");
      await strategyPartialCloseLiquidate.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }
  }

  if (DEPLOY_STRATS.includes(Strats.partialCloseWithdrawMinizmie)) {
    /**
     * Restricted StrategyPartialCloseMinimizeTrading
     */
    console.log(">> Deploying an upgradable Spooky - StrategyPartialCloseMinimizeTrading contract");
    const SpookySwapStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "SpookySwapStrategyPartialCloseMinimizeTrading",
      deployer
    )) as SpookySwapStrategyPartialCloseMinimizeTrading__factory;
    const strategyPartialCloseMinimizeTrading = (await upgrades.deployProxy(
      SpookySwapStrategyPartialCloseMinimizeTrading,
      [config.YieldSources.SpookySwap!.SpookyRouter, config.SharedConfig.WNativeRelayer]
    )) as SpookySwapStrategyPartialCloseMinimizeTrading;
    await strategyPartialCloseMinimizeTrading.deployTransaction.wait(3);
    console.log(`>> Deployed at ${strategyPartialCloseMinimizeTrading.address}`);

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategy partial close minimize trading");
      await strategyPartialCloseMinimizeTrading.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }

    console.log(">> Whitelist strategy partial close minimize trading on WNativeRelayer");
    await wNativeRelayer.setCallerOk([strategyPartialCloseMinimizeTrading.address], true);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["SpookySwapShareRestrictedStrategies"];
