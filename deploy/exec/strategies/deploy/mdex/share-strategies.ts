import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades, network } from "hardhat";
import {
  MdexRestrictedStrategyAddBaseTokenOnly,
  MdexRestrictedStrategyAddBaseTokenOnly__factory,
  MdexRestrictedStrategyLiquidate,
  MdexRestrictedStrategyLiquidate__factory,
  MdexRestrictedStrategyPartialCloseLiquidate,
  MdexRestrictedStrategyPartialCloseLiquidate__factory,
  MdexRestrictedStrategyPartialCloseMinimizeTrading,
  MdexRestrictedStrategyPartialCloseMinimizeTrading__factory,
  MdexRestrictedStrategyWithdrawMinimizeTrading,
  MdexRestrictedStrategyWithdrawMinimizeTrading__factory,
  WNativeRelayer__factory,
} from "../../../../../typechain";
import MainnetConfig from "../../../../../.mainnet.json";
import TestnetConfig from "../../../../../.testnet.json";
import { Strats } from "../../../../entities/strats";
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
  const WHITELIST_WOKERS: Array<string> = [];

  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig;
  const wNativeRelayer = WNativeRelayer__factory.connect(
    config.SharedConfig.WNativeRelayer,
    (await ethers.getSigners())[0]
  );
  const whitelistedWorkerAddrs = mapWorkers(WHITELIST_WOKERS).map((worker) => worker.address);

  if (DEPLOY_STRATS.includes(Strats.btokenOnly)) {
    /**
     * Restricted StrategyAddBaseTokenOnly
     */
    console.log(">> Deploying an upgradable Restricted Mdex StrategyAddBaseTokenOnly contract");
    const MdexRestrictedStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
      "MdexRestrictedStrategyAddBaseTokenOnly",
      (
        await ethers.getSigners()
      )[0]
    )) as MdexRestrictedStrategyAddBaseTokenOnly__factory;
    const strategyRestrictedAddBaseTokenOnly = (await upgrades.deployProxy(MdexRestrictedStrategyAddBaseTokenOnly, [
      config.YieldSources.Mdex.MdexRouter,
      config.Tokens.MDX,
    ])) as MdexRestrictedStrategyAddBaseTokenOnly;
    await strategyRestrictedAddBaseTokenOnly.deployed();
    console.log(`>> Deployed at ${strategyRestrictedAddBaseTokenOnly.address}`);
    console.log("✅ Done");

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyRestrictedAddBaseTokenOnly");
      await strategyRestrictedAddBaseTokenOnly.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }
  }

  if (DEPLOY_STRATS.includes(Strats.liquidateAll)) {
    /**
     * Restricted StrategyLiquidate
     */
    console.log(">> Deploying an upgradable Restricted StrategyLiquidate V2 contract");
    const MdexRestrictedStrategyLiquidate = (await ethers.getContractFactory(
      "MdexRestrictedStrategyLiquidate",
      (
        await ethers.getSigners()
      )[0]
    )) as MdexRestrictedStrategyLiquidate__factory;
    const strategyRestrictedLiquidate = (await upgrades.deployProxy(MdexRestrictedStrategyLiquidate, [
      config.YieldSources.Mdex.MdexRouter,
      config.Tokens.MDX,
    ])) as MdexRestrictedStrategyLiquidate;
    await strategyRestrictedLiquidate.deployed();
    console.log(`>> Deployed at ${strategyRestrictedLiquidate.address}`);
    console.log("✅ Done");

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyRestrictedLiquidateV2");
      await strategyRestrictedLiquidate.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }
  }

  if (DEPLOY_STRATS.includes(Strats.withdrawMinimize)) {
    /**
     * Restricted StrategyWithdrawMinimizeTrading
     */
    console.log(">> Deploying an upgradable Restricted StrategyWithdrawMinimizeTrading V2 contract");
    const MdexRestrictedStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
      "MdexRestrictedStrategyWithdrawMinimizeTrading",
      (
        await ethers.getSigners()
      )[0]
    )) as MdexRestrictedStrategyWithdrawMinimizeTrading__factory;
    const strategyRestrictedWithdrawMinimizeTrading = (await upgrades.deployProxy(
      MdexRestrictedStrategyWithdrawMinimizeTrading,
      [config.YieldSources.Mdex.MdexRouter, config.Tokens.WBNB, config.SharedConfig.WNativeRelayer, config.Tokens.MDX]
    )) as MdexRestrictedStrategyWithdrawMinimizeTrading;
    await strategyRestrictedWithdrawMinimizeTrading.deployed();
    console.log(`>> Deployed at ${strategyRestrictedWithdrawMinimizeTrading.address}`);

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyRestrictedWithdrawMinimizeTradingV2");
      await strategyRestrictedWithdrawMinimizeTrading.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }

    console.log(">> Whitelist RestrictedStrategyWithdrawMinimizeTrading V2 on WNativeRelayer");
    await wNativeRelayer.setCallerOk([strategyRestrictedWithdrawMinimizeTrading.address], true);
    console.log("✅ Done");
  }

  if (DEPLOY_STRATS.includes(Strats.partialCloseLiquidate)) {
    /**
     * Restricted StrategyPartialCloseLiquidate
     */
    console.log(">> Deploying an upgradable Restricted StrategyPartialCloseLiquidate contract");
    const MdexRestrictedStrategyPartialCloseLiquidate = (await ethers.getContractFactory(
      "MdexRestrictedStrategyPartialCloseLiquidate",
      (
        await ethers.getSigners()
      )[0]
    )) as MdexRestrictedStrategyPartialCloseLiquidate__factory;
    const restrictedStrategyPartialCloseLiquidate = (await upgrades.deployProxy(
      MdexRestrictedStrategyPartialCloseLiquidate,
      [config.YieldSources.Mdex.MdexRouter, config.Tokens.MDX]
    )) as MdexRestrictedStrategyPartialCloseLiquidate;
    await restrictedStrategyPartialCloseLiquidate.deployed();
    console.log(`>> Deployed at ${restrictedStrategyPartialCloseLiquidate.address}`);
    console.log("✅ Done");

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyRestrictedLiquidateV2");
      await restrictedStrategyPartialCloseLiquidate.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }
  }

  if (DEPLOY_STRATS.includes(Strats.partialCloseWithdrawMinizmie)) {
    /**
     * Restricted StrategyPartialCloseMinimizeTrading V2
     */
    console.log(">> Deploying an upgradable Restricted StrategyPartialCloseMinimizeTrading V2 contract");
    const MdexRestrictedStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
      "MdexRestrictedStrategyPartialCloseMinimizeTrading",
      (
        await ethers.getSigners()
      )[0]
    )) as MdexRestrictedStrategyPartialCloseMinimizeTrading__factory;
    const strategyRestrictedPartialCloseMinimizeTrading = (await upgrades.deployProxy(
      MdexRestrictedStrategyPartialCloseMinimizeTrading,
      [config.YieldSources.Mdex.MdexRouter, config.Tokens.WBNB, config.SharedConfig.WNativeRelayer, config.Tokens.MDX]
    )) as MdexRestrictedStrategyPartialCloseMinimizeTrading;
    await strategyRestrictedPartialCloseMinimizeTrading.deployed();
    console.log(`>> Deployed at ${strategyRestrictedPartialCloseMinimizeTrading.address}`);

    if (whitelistedWorkerAddrs.length > 0) {
      console.log(">> Whitelisting workers for strategyRestrictedPartialCloseMinimizeTradingV2");
      await strategyRestrictedPartialCloseMinimizeTrading.setWorkersOk(whitelistedWorkerAddrs, true);
      console.log("✅ Done");
    }

    console.log(">> Whitelist strategyRestrictedPartialCloseMinimizeTradingV2 V2 on WNativeRelayer");
    await wNativeRelayer.setCallerOk([strategyRestrictedPartialCloseMinimizeTrading.address], true);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["MdexShareRestrictedStrategies"];
