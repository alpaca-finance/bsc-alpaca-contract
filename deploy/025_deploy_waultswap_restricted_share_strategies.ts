import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import {
  WaultSwapRestrictedStrategyAddBaseTokenOnly,
  WaultSwapRestrictedStrategyAddBaseTokenOnly__factory,
  WaultSwapRestrictedStrategyLiquidate,
  WaultSwapRestrictedStrategyLiquidate__factory,
  WaultSwapRestrictedStrategyWithdrawMinimizeTrading,
  WaultSwapRestrictedStrategyWithdrawMinimizeTrading__factory,
  WNativeRelayer__factory
} from '../typechain';

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

  const ROUTER = '0x...';
  const WBNB = '0x...';
  const WNATIVE_RELAYER = '0x...';
  const WHITELIST_WOKERS = [
    "0x...",
    "0x...",
    "0x..."
  ]









  /**
   * Restricted StrategyAddBaseTokenOnly V2
   */
  console.log(">> Deploying an upgradable Restricted StrategyAddBaseTokenOnly V2 contract");
  const WaultSwapRestrictedStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
    "WaultSwapRestrictedStrategyAddBaseTokenOnly",
    (await ethers.getSigners())[0],
  )) as WaultSwapRestrictedStrategyAddBaseTokenOnly__factory;
  const strategyRestrictedAddBaseTokenOnlyV2 = await upgrades.deployProxy(WaultSwapRestrictedStrategyAddBaseTokenOnly, [ROUTER]) as WaultSwapRestrictedStrategyAddBaseTokenOnly;
  await strategyRestrictedAddBaseTokenOnlyV2.deployed()
  console.log(`>> Deployed at ${strategyRestrictedAddBaseTokenOnlyV2.address}`);
  console.log("✅ Done")

  console.log(">> Whitelisting workers for strategyRestrictedAddBaseTokenOnlyV2")
  await strategyRestrictedAddBaseTokenOnlyV2.setWorkersOk(WHITELIST_WOKERS, true)
  console.log("✅ Done")
  
  /**
   * Restricted StrategyLiquidate V2
   */
  console.log(">> Deploying an upgradable Restricted StrategyLiquidate V2 contract");
  const WaultSwapRestrictedStrategyLiquidate = (await ethers.getContractFactory(
    "WaultSwapRestrictedStrategyLiquidate",
    (await ethers.getSigners())[0],
  )) as WaultSwapRestrictedStrategyLiquidate__factory;
  const strategyRestrictedLiquidateV2 = await upgrades.deployProxy(WaultSwapRestrictedStrategyLiquidate, [ROUTER]) as WaultSwapRestrictedStrategyLiquidate;
  await strategyRestrictedLiquidateV2.deployed();
  console.log(`>> Deployed at ${strategyRestrictedLiquidateV2.address}`);
  console.log("✅ Done")

  console.log(">> Whitelisting workers for strategyRestrictedLiquidateV2")
  await strategyRestrictedLiquidateV2.setWorkersOk(WHITELIST_WOKERS, true)
  console.log("✅ Done")

  /**
   * Restricted StrategyWithdrawMinimizeTrading V2
   */
  console.log(">> Deploying an upgradable Restricted StrategyWithdrawMinimizeTrading V2 contract");
  const WaultSwapRestrictedStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
    "WaultSwapRestrictedStrategyWithdrawMinimizeTrading",
    (await ethers.getSigners())[0],
  )) as WaultSwapRestrictedStrategyWithdrawMinimizeTrading__factory;
  const strategyRestrictedWithdrawMinimizeTradingV2 = await upgrades.deployProxy(
    WaultSwapRestrictedStrategyWithdrawMinimizeTrading, [ROUTER, WBNB, WNATIVE_RELAYER]) as WaultSwapRestrictedStrategyWithdrawMinimizeTrading;
  await strategyRestrictedWithdrawMinimizeTradingV2.deployed()
  console.log(`>> Deployed at ${strategyRestrictedWithdrawMinimizeTradingV2.address}`);

  console.log(">> Whitelisting workers for strategyRestrictedWithdrawMinimizeTradingV2")
  await strategyRestrictedWithdrawMinimizeTradingV2.setWorkersOk(WHITELIST_WOKERS, true)
  console.log("✅ Done")

  console.log(">> Whitelist RestrictedStrategyWithdrawMinimizeTrading V2 on WNativeRelayer");
  const wNativeRelayer = WNativeRelayer__factory.connect(WNATIVE_RELAYER, (await ethers.getSigners())[0]);
  await wNativeRelayer.setCallerOk([strategyRestrictedWithdrawMinimizeTradingV2.address], true);
  console.log("✅ Done")
};

export default func;
func.tags = ['WaultSwapShareRestrictedStrategies'];