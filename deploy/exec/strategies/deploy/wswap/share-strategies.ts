import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  StrategyOracleLiquidate,
  StrategyOracleMinimize,
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
import { getStratFactory, Strats } from "../../../../entities/strats";
import { getConfig } from "../../../../entities/config";
import { mapWorkers } from "../../../../entities/worker";
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

  const DEPLOY_STRATS = [Strats.oracleLiquidate];
  const WHITELIST_WORKERS: string[] = [
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

  const config = getConfig();
  const whitelistedWorkerAddrs = mapWorkers(WHITELIST_WORKERS).map((w) => w.address);
  const deployer = await getDeployer();
  const wNativeRelayer = WNativeRelayer__factory.connect(config.SharedConfig.WNativeRelayer, deployer);
  let nonce = await deployer.getTransactionCount();

  if (DEPLOY_STRATS.includes(Strats.btokenOnly)) {
    /**
     * Restricted StrategyAddBaseTokenOnly V2
     */
    console.log(">> Deploying an upgradable WaultEx Restricted StrategyAddBaseTokenOnly V2 contract");
    const WaultSwapRestrictedStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyAddBaseTokenOnly",
      deployer
    )) as WaultSwapRestrictedStrategyAddBaseTokenOnly__factory;
    const strategyRestrictedAddBaseTokenOnlyV2 = (await upgrades.deployProxy(
      WaultSwapRestrictedStrategyAddBaseTokenOnly,
      [config.YieldSources.Waultswap!.WaultswapRouter]
    )) as WaultSwapRestrictedStrategyAddBaseTokenOnly;
    await strategyRestrictedAddBaseTokenOnlyV2.deployTransaction.wait(3);
    console.log(`>> Deployed at ${strategyRestrictedAddBaseTokenOnlyV2.address}`);
    console.log("✅ Done");

    nonce = await deployer.getTransactionCount();

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyRestrictedAddBaseTokenOnlyV2");
      await strategyRestrictedAddBaseTokenOnlyV2.setWorkersOk(whitelistedWorkerAddrs, true, { nonce: nonce++ });
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
      deployer
    )) as WaultSwapRestrictedStrategyLiquidate__factory;
    const strategyRestrictedLiquidateV2 = (await upgrades.deployProxy(WaultSwapRestrictedStrategyLiquidate, [
      config.YieldSources.Waultswap!.WaultswapRouter,
    ])) as WaultSwapRestrictedStrategyLiquidate;
    await strategyRestrictedLiquidateV2.deployTransaction.wait(3);
    console.log(`>> Deployed at ${strategyRestrictedLiquidateV2.address}`);
    console.log("✅ Done");

    nonce = await deployer.getTransactionCount();

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyRestrictedLiquidateV2");
      await strategyRestrictedLiquidateV2.setWorkersOk(whitelistedWorkerAddrs, true, { nonce: nonce++ });
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
      deployer
    )) as WaultSwapRestrictedStrategyWithdrawMinimizeTrading__factory;
    const strategyRestrictedWithdrawMinimizeTradingV2 = (await upgrades.deployProxy(
      WaultSwapRestrictedStrategyWithdrawMinimizeTrading,
      [config.YieldSources.Waultswap!.WaultswapRouter, config.Tokens.WBNB, config.SharedConfig.WNativeRelayer]
    )) as WaultSwapRestrictedStrategyWithdrawMinimizeTrading;
    await strategyRestrictedWithdrawMinimizeTradingV2.deployTransaction.wait(3);
    console.log(`>> Deployed at ${strategyRestrictedWithdrawMinimizeTradingV2.address}`);

    nonce = await deployer.getTransactionCount();

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyRestrictedWithdrawMinimizeTradingV2");
      await strategyRestrictedWithdrawMinimizeTradingV2.setWorkersOk(whitelistedWorkerAddrs, true, { nonce: nonce++ });
      console.log("✅ Done");
    }

    console.log(">> Whitelist RestrictedStrategyWithdrawMinimizeTrading V2 on WNativeRelayer");
    await wNativeRelayer.setCallerOk([strategyRestrictedWithdrawMinimizeTradingV2.address], true, { nonce: nonce++ });
    console.log("✅ Done");
  }

  if (DEPLOY_STRATS.includes(Strats.partialCloseLiquidate)) {
    /**
     * Restricted StrategyPartialCloseLiquidate V2
     */
    console.log(">> Deploying an upgradable Restricted StrategyPartialCloseLiquidate V2 contract");
    const WaultSwapRestrictedStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyPartialCloseLiquidate",
      deployer
    )) as WaultSwapRestrictedStrategyPartialCloseLiquidate__factory;
    const restrictedStrategyPartialCloseLiquidate = (await upgrades.deployProxy(
      WaultSwapRestrictedStrategyPartialCloseLiquidate,
      [config.YieldSources.Waultswap!.WaultswapRouter]
    )) as WaultSwapRestrictedStrategyPartialCloseLiquidate;
    await restrictedStrategyPartialCloseLiquidate.deployTransaction.wait(3);
    console.log(`>> Deployed at ${restrictedStrategyPartialCloseLiquidate.address}`);
    console.log("✅ Done");

    nonce = await deployer.getTransactionCount();

    console.log(">> Whitelisting workers for strategyRestrictedLiquidateV2");
    await restrictedStrategyPartialCloseLiquidate.setWorkersOk(whitelistedWorkerAddrs, true, { nonce: nonce++ });
    console.log("✅ Done");
  }

  if (DEPLOY_STRATS.includes(Strats.partialCloseWithdrawMinizmie)) {
    /**
     * Restricted StrategyPartialCloseMinimizeTrading V2
     */
    console.log(">> Deploying an upgradable Restricted StrategyPartialCloseMinimizeTrading V2 contract");
    const WaultSwapRestrictedStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "WaultSwapRestrictedStrategyPartialCloseMinimizeTrading",
      deployer
    )) as WaultSwapRestrictedStrategyPartialCloseMinimizeTrading__factory;
    const strategyRestrictedPartialCloseMinimizeTradingV2 = (await upgrades.deployProxy(
      WaultSwapRestrictedStrategyPartialCloseMinimizeTrading,
      [config.YieldSources.Waultswap!.WaultswapRouter, config.Tokens.WBNB, config.SharedConfig.WNativeRelayer]
    )) as WaultSwapRestrictedStrategyPartialCloseMinimizeTrading;
    await strategyRestrictedPartialCloseMinimizeTradingV2.deployTransaction.wait(3);
    console.log(`>> Deployed at ${strategyRestrictedPartialCloseMinimizeTradingV2.address}`);

    nonce = await deployer.getTransactionCount();

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyRestrictedPartialCloseMinimizeTradingV2");
      await strategyRestrictedPartialCloseMinimizeTradingV2.setWorkersOk(whitelistedWorkerAddrs, true, {
        nonce: nonce++,
      });
      console.log("✅ Done");
    }

    console.log(">> Whitelist RestrictedStrategyPartialCloseMinimizeTrading V2 on WNativeRelayer");
    await wNativeRelayer.setCallerOk([strategyRestrictedPartialCloseMinimizeTradingV2.address], true, {
      nonce: nonce++,
    });
    console.log("✅ Done");
  }

  if (DEPLOY_STRATS.includes(Strats.oracleMinimize)) {
    /**
     * Restricted StrategyOracleMinimize
     */
    console.log(">> Deploying an upgradable StrategyOracleMinimize contract");
    const StrategyOracleMinimizeFactory = await getStratFactory("WaultSwap", Strats.oracleMinimize);
    const strategyOracleMinimize = (await upgrades.deployProxy(StrategyOracleMinimizeFactory, [
      "Waultswap Oracle Minimize",
      config.YieldSources.Waultswap!.WaultswapRouter,
      config.SharedConfig.WNativeRelayer,
      config.Oracle.OracleMedianizer,
      "0x8F10473D815b330878EB94A5AB6B3533c0cFF36D",
      "9500",
    ])) as StrategyOracleMinimize;
    await strategyOracleMinimize.deployTransaction.wait(3);
    console.log(`>> Deployed at ${strategyOracleMinimize.address}`);

    nonce = await deployer.getTransactionCount();

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for StrategyOracleMinimize");
      await strategyOracleMinimize.setWorkersOk(whitelistedWorkerAddrs, true, { nonce: nonce++ });
      console.log("✅ Done");
    }

    console.log(">> Whitelist StrategyOracleMinimize on WNativeRelayer");
    await wNativeRelayer.setCallerOk([strategyOracleMinimize.address], true, { nonce: nonce++ });
    console.log("✅ Done");
  }

  if (DEPLOY_STRATS.includes(Strats.oracleLiquidate)) {
    /**
     * Restricted StrategyOracleLiquidate
     */
    console.log(">> Deploying an upgradable StrategyOracleLiquidate contract");
    const StrategyOracleLiquidateFactory = await getStratFactory("WaultSwap", Strats.oracleLiquidate);
    const strategyOracleLiquidate = (await upgrades.deployProxy(StrategyOracleLiquidateFactory, [
      "Waultswap Oracle Liquidate",
      config.YieldSources.Waultswap!.WaultswapRouter,
      config.Oracle.OracleMedianizer,
      "0x8F10473D815b330878EB94A5AB6B3533c0cFF36D",
      "9500",
    ])) as StrategyOracleLiquidate;
    await strategyOracleLiquidate.deployTransaction.wait(3);
    console.log(`>> Deployed at ${strategyOracleLiquidate.address}`);

    nonce = await deployer.getTransactionCount();

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for StrategyOracleMinimize");
      await strategyOracleLiquidate.setWorkersOk(whitelistedWorkerAddrs, true, { nonce: nonce++ });
      console.log("✅ Done");
    }
  }
};

export default func;
func.tags = ["WaultSwapShareRestrictedStrategies"];
