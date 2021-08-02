import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  WaultSwapRestrictedStrategyAddBaseTokenOnly,
  WaultSwapRestrictedStrategyAddBaseTokenOnly__factory,
  WaultSwapRestrictedStrategyLiquidate,
  WaultSwapRestrictedStrategyLiquidate__factory,
  WaultSwapRestrictedStrategyPartialCloseLiquidate,
  WaultSwapRestrictedStrategyPartialCloseLiquidate__factory,
  WaultSwapRestrictedStrategyPartialCloseMinimizeTrading,
  WaultSwapRestrictedStrategyPartialCloseMinimizeTrading__factory,
  WaultSwapRestrictedStrategyWithdrawMinimizeTrading,
  WaultSwapRestrictedStrategyWithdrawMinimizeTrading__factory,
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
    "USDT-TUSD WaultswapWorker",
    "BUSD-BTCB WaultswapWorker",
    "USDT-BTCB WaultswapWorker",
    "ETH-BTCB WaultswapWorker",
    "TUSD-USDT WaultswapWorker",
    "MATIC-USDT WaultswapWorker",
    "ETH-USDT WaultswapWorker",
    "BTCB-USDT WaultswapWorker",
    "BUSD-USDT WaultswapWorker",
    "WEX-USDT WaultswapWorker",
    "ALPACA-USDT WaultswapWorker",
    "WBNB-ALPACA WaultswapWorker",
    "USDT-ALPACA WaultswapWorker",
    "USDT-ETH WaultswapWorker",
    "BETH-ETH WaultswapWorker",
    "BTCB-ETH WaultswapWorker",
    "BUSD-ETH WaultswapWorker",
    "BTCB-BUSD WaultswapWorker",
    "USDT-BUSD WaultswapWorker",
    "WBNB-BUSD WaultswapWorker",
    "ETH-BUSD WaultswapWorker",
    "WAULTx-WBNB WaultswapWorker",
    "ALPACA-WBNB WaultswapWorker",
    "BUSD-WBNB WaultswapWorker",
    "WEX-WBNB WaultswapWorker",
  ];

  const config = getConfig();
  const whitelistedWorkerAddrs = mapWorkers(WHITELIST_WORKERS).map((w) => w.address);
  const wNativeRelayer = WNativeRelayer__factory.connect(
    config.SharedConfig.WNativeRelayer,
    (await ethers.getSigners())[0]
  );

  if (DEPLOY_STRATS.includes(Strats.btokenOnly)) {
    /**
     * Restricted StrategyAddBaseTokenOnly V2
     */
    console.log(">> Deploying an upgradable WaultEx Restricted StrategyAddBaseTokenOnly V2 contract");
    const WaultSwapRestrictedStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyAddBaseTokenOnly",
      (
        await ethers.getSigners()
      )[0]
    )) as WaultSwapRestrictedStrategyAddBaseTokenOnly__factory;
    const strategyRestrictedAddBaseTokenOnlyV2 = (await upgrades.deployProxy(
      WaultSwapRestrictedStrategyAddBaseTokenOnly,
      [config.Exchanges.Waultswap.WaultswapRouter]
    )) as WaultSwapRestrictedStrategyAddBaseTokenOnly;
    await strategyRestrictedAddBaseTokenOnlyV2.deployed();
    console.log(`>> Deployed at ${strategyRestrictedAddBaseTokenOnlyV2.address}`);
    console.log("✅ Done");

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyRestrictedAddBaseTokenOnlyV2");
      await strategyRestrictedAddBaseTokenOnlyV2.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }
  }

  if (DEPLOY_STRATS.includes(Strats.liquidateAll)) {
    /**
     * Restricted StrategyLiquidate V2
     */
    console.log(">> Deploying an upgradable WaultEx Restricted StrategyLiquidate V2 contract");
    const WaultSwapRestrictedStrategyLiquidate = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyLiquidate",
      (
        await ethers.getSigners()
      )[0]
    )) as WaultSwapRestrictedStrategyLiquidate__factory;
    const strategyRestrictedLiquidateV2 = (await upgrades.deployProxy(WaultSwapRestrictedStrategyLiquidate, [
      config.Exchanges.Waultswap.WaultswapRouter,
    ])) as WaultSwapRestrictedStrategyLiquidate;
    await strategyRestrictedLiquidateV2.deployed();
    console.log(`>> Deployed at ${strategyRestrictedLiquidateV2.address}`);
    console.log("✅ Done");

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyRestrictedLiquidateV2");
      await strategyRestrictedLiquidateV2.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }
  }

  if (DEPLOY_STRATS.includes(Strats.withdrawMinimize)) {
    /**
     * Restricted StrategyWithdrawMinimizeTrading V2
     */
    console.log(">> Deploying an upgradable WaultEx Restricted StrategyWithdrawMinimizeTrading V2 contract");
    const WaultSwapRestrictedStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyWithdrawMinimizeTrading",
      (
        await ethers.getSigners()
      )[0]
    )) as WaultSwapRestrictedStrategyWithdrawMinimizeTrading__factory;
    const strategyRestrictedWithdrawMinimizeTradingV2 = (await upgrades.deployProxy(
      WaultSwapRestrictedStrategyWithdrawMinimizeTrading,
      [config.Exchanges.Waultswap.WaultswapRouter, config.Tokens.WBNB, config.SharedConfig.WNativeRelayer]
    )) as WaultSwapRestrictedStrategyWithdrawMinimizeTrading;
    await strategyRestrictedWithdrawMinimizeTradingV2.deployed();
    console.log(`>> Deployed at ${strategyRestrictedWithdrawMinimizeTradingV2.address}`);

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyRestrictedWithdrawMinimizeTradingV2");
      await strategyRestrictedWithdrawMinimizeTradingV2.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }

    console.log(">> Whitelist RestrictedStrategyWithdrawMinimizeTrading V2 on WNativeRelayer");
    await wNativeRelayer.setCallerOk([strategyRestrictedWithdrawMinimizeTradingV2.address], true);
    console.log("✅ Done");
  }

  if (DEPLOY_STRATS.includes(Strats.partialCloseLiquidate)) {
    /**
     * Restricted StrategyPartialCloseLiquidate V2
     */
    console.log(">> Deploying an upgradable Restricted StrategyPartialCloseLiquidate V2 contract");
    const WaultSwapRestrictedStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyPartialCloseLiquidate",
      (
        await ethers.getSigners()
      )[0]
    )) as WaultSwapRestrictedStrategyPartialCloseLiquidate__factory;
    const restrictedStrategyPartialCloseLiquidate = (await upgrades.deployProxy(
      WaultSwapRestrictedStrategyPartialCloseLiquidate,
      [config.Exchanges.Waultswap.WaultswapRouter]
    )) as WaultSwapRestrictedStrategyPartialCloseLiquidate;
    await restrictedStrategyPartialCloseLiquidate.deployed();
    console.log(`>> Deployed at ${restrictedStrategyPartialCloseLiquidate.address}`);
    console.log("✅ Done");

    console.log(">> Whitelisting workers for strategyRestrictedLiquidateV2");
    await restrictedStrategyPartialCloseLiquidate.setWorkersOk(whitelistedWorkerAddrs, true);
    console.log("✅ Done");
  }

  if (DEPLOY_STRATS.includes(Strats.partialCloseWithdrawMinizmie)) {
    /**
     * Restricted StrategyPartialCloseMinimizeTrading V2
     */
    console.log(">> Deploying an upgradable Restricted StrategyPartialCloseMinimizeTrading V2 contract");
    const WaultSwapRestrictedStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyPartialCloseMinimizeTrading",
      (
        await ethers.getSigners()
      )[0]
    )) as WaultSwapRestrictedStrategyPartialCloseMinimizeTrading__factory;
    const strategyRestrictedPartialCloseMinimizeTradingV2 = (await upgrades.deployProxy(
      WaultSwapRestrictedStrategyPartialCloseMinimizeTrading,
      [config.Exchanges.Waultswap.WaultswapRouter, config.Tokens.WBNB, config.SharedConfig.WNativeRelayer]
    )) as WaultSwapRestrictedStrategyPartialCloseMinimizeTrading;
    await strategyRestrictedPartialCloseMinimizeTradingV2.deployed();
    console.log(`>> Deployed at ${strategyRestrictedPartialCloseMinimizeTradingV2.address}`);

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyRestrictedPartialCloseMinimizeTradingV2");
      await strategyRestrictedPartialCloseMinimizeTradingV2.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }

    console.log(">> Whitelist RestrictedStrategyPartialCloseMinimizeTrading V2 on WNativeRelayer");
    await wNativeRelayer.setCallerOk([strategyRestrictedPartialCloseMinimizeTradingV2.address], true);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["WaultSwapShareRestrictedStrategies"];
