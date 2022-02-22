import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedSingleAssetStrategyLiquidate,
  PancakeswapV2RestrictedSingleAssetStrategyLiquidate__factory,
  PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate,
  PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate__factory,
  PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading,
  PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading__factory,
  PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading,
  PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading__factory,
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

  const DEPLOY_STRATS = [Strats.partialCloseLiquidate, Strats.partialCloseWithdrawMinizmie];
  const WHITELIST_WORKERS: string[] = [
    "TUSD CakeMaxiWorker",
    "BTCB CakeMaxiWorker",
    "USDT CakeMaxiWorker",
    "ETH CakeMaxiWorker",
    "BUSD CakeMaxiWorker",
    "WBNB CakeMaxiWorker",
  ];

  const config = getConfig();
  const whitelistedWorkerAddrs = mapWorkers(WHITELIST_WORKERS).map((w) => w.address);
  const wNativeRelayer = WNativeRelayer__factory.connect(
    config.SharedConfig.WNativeRelayer,
    (await ethers.getSigners())[0]
  );

  if (DEPLOY_STRATS.includes(Strats.btokenOnly)) {
    /**
     * Restricted Single Asset StrategyAddBaseTokenOnly V2
     */
    console.log(">> Deploying an upgradable Restricted Single Asset StrategyAddBaseTokenOnly V2 contract");
    const PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly",
      (
        await ethers.getSigners()
      )[0]
    )) as PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly__factory;

    const singleStrategyRestrictedAddBaseTokenOnlyV2 = (await upgrades.deployProxy(
      PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly,
      [config.YieldSources.Pancakeswap!.RouterV2]
    )) as PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly;

    await singleStrategyRestrictedAddBaseTokenOnlyV2.deployed();
    console.log(`>> Deployed at ${singleStrategyRestrictedAddBaseTokenOnlyV2.address}`);
    console.log("✅ Done");

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly");
      await singleStrategyRestrictedAddBaseTokenOnlyV2.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }
  }

  if (DEPLOY_STRATS.includes(Strats.liquidateAll)) {
    /**
     * Restricted Single Asset StrategyLiquidate V2
     */
    console.log(">> Deploying an upgradable Restricted Single Asset StrategyLiquidate V2 contract");
    const PancakeswapV2RestrictedSingleAssetStrategyLiquidate = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedSingleAssetStrategyLiquidate",
      (
        await ethers.getSigners()
      )[0]
    )) as PancakeswapV2RestrictedSingleAssetStrategyLiquidate__factory;

    const singleStrategyRestrictedLiquidateV2 = (await upgrades.deployProxy(
      PancakeswapV2RestrictedSingleAssetStrategyLiquidate,
      [config.YieldSources.Pancakeswap!.RouterV2]
    )) as PancakeswapV2RestrictedSingleAssetStrategyLiquidate;

    await singleStrategyRestrictedLiquidateV2.deployed();
    console.log(`>> Deployed at ${singleStrategyRestrictedLiquidateV2.address}`);
    console.log("✅ Done");

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for PancakeswapV2RestrictedSingleAssetStrategyLiquidate");
      await singleStrategyRestrictedLiquidateV2.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }
  }

  if (DEPLOY_STRATS.includes(Strats.partialCloseLiquidate)) {
    /**
     * Restricted Single Asset StrategyPartialCloseLiquidate V2
     */
    console.log(">> Deploying an upgradable Restricted Single Asset StrategyPartialCloseLiquidate V2 contract");
    const PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate",
      (
        await ethers.getSigners()
      )[0]
    )) as PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate__factory;

    const singleStrategyRestrictedPartialCloseLiquidateV2 = (await upgrades.deployProxy(
      PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate,
      [config.YieldSources.Pancakeswap!.RouterV2]
    )) as PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate;

    await singleStrategyRestrictedPartialCloseLiquidateV2.deployed();
    console.log(`>> Deployed at ${singleStrategyRestrictedPartialCloseLiquidateV2.address}`);
    console.log("✅ Done");

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for PancakeswapV2RestrictedSingleAssetStrategyPartialCloseLiquidate");
      await singleStrategyRestrictedPartialCloseLiquidateV2.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }
  }

  if (DEPLOY_STRATS.includes(Strats.withdrawMinimize)) {
    /**
     * Restricted Single Asset StrategyWithdrawMinimizeTrading V2
     */
    console.log(">> Deploying an upgradable Restricted Single Asset StrategyWithdrawMinimizeTrading V2 contract");
    const PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading",
      (
        await ethers.getSigners()
      )[0]
    )) as PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading__factory;

    const singleAssetStrategyRestrictedWithdrawMinimizeTradingV2 = (await upgrades.deployProxy(
      PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading,
      [config.YieldSources.Pancakeswap!.RouterV2, config.SharedConfig.WNativeRelayer]
    )) as PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading;
    await singleAssetStrategyRestrictedWithdrawMinimizeTradingV2.deployed();

    console.log(`>> Deployed at ${singleAssetStrategyRestrictedWithdrawMinimizeTradingV2.address}`);

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading");
      await singleAssetStrategyRestrictedWithdrawMinimizeTradingV2.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }

    console.log(">> Whitelist RestrictedSingleAssetStrategyWithdrawMinimizeTrading V2 on WNativeRelayer");
    await wNativeRelayer.setCallerOk([singleAssetStrategyRestrictedWithdrawMinimizeTradingV2.address], true);
    console.log("✅ Done");
  }

  if (DEPLOY_STRATS.includes(Strats.partialCloseWithdrawMinizmie)) {
    /**
     * Restricted Single Asset StrategyPartialCloseMinimizeTrading V2
     */
    console.log(">> Deploying an upgradable Restricted Single Asset StrategyPartialCloseMinimizeTrading V2 contract");
    const PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading",
      (
        await ethers.getSigners()
      )[0]
    )) as PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading__factory;

    const singleAssetStrategyRestrictedPartialCloseMinimizeTradingV2 = (await upgrades.deployProxy(
      PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading,
      [config.YieldSources.Pancakeswap!.RouterV2, config.SharedConfig.WNativeRelayer]
    )) as PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading;
    await singleAssetStrategyRestrictedPartialCloseMinimizeTradingV2.deployed();

    console.log(`>> Deployed at ${singleAssetStrategyRestrictedPartialCloseMinimizeTradingV2.address}`);

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for PancakeswapV2RestrictedSingleAssetStrategyPartialCloseMinimizeTrading");
      await singleAssetStrategyRestrictedPartialCloseMinimizeTradingV2.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }

    console.log(">> Whitelist RestrictedSingleAssetStrategyPartialCloseMinimizeTrading V2 on WNativeRelayer");
    await wNativeRelayer.setCallerOk([singleAssetStrategyRestrictedPartialCloseMinimizeTradingV2.address], true);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["ShareSingleAssetStrategiesV2"];
