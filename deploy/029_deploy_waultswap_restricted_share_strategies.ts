import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import {
  WaultSwapRestrictedStrategyAddBaseTokenOnly,
  WaultSwapRestrictedStrategyAddBaseTokenOnly__factory,
  WaultSwapRestrictedStrategyLiquidate,
  WaultSwapRestrictedStrategyLiquidate__factory,
  WaultSwapRestrictedStrategyPartialCloseMinimizeTrading,
  WaultSwapRestrictedStrategyPartialCloseMinimizeTrading__factory,
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

  const ROUTER = '0xD48745E39BbED146eEC15b79cBF964884F9877c2';
  const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  const WNATIVE_RELAYER = '0xE1D2CA01bc88F325fF7266DD2165944f3CAf0D3D';
  const WHITELIST_WORKERS: string[] = []









  /**
   * Restricted StrategyAddBaseTokenOnly V2
   */
  console.log(">> Deploying an upgradable WaultEx Restricted StrategyAddBaseTokenOnly V2 contract");
  const WaultSwapRestrictedStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
    "WaultSwapRestrictedStrategyAddBaseTokenOnly",
    (await ethers.getSigners())[0],
  )) as WaultSwapRestrictedStrategyAddBaseTokenOnly__factory;
  const strategyRestrictedAddBaseTokenOnlyV2 = await upgrades.deployProxy(WaultSwapRestrictedStrategyAddBaseTokenOnly, [ROUTER]) as WaultSwapRestrictedStrategyAddBaseTokenOnly;
  await strategyRestrictedAddBaseTokenOnlyV2.deployed()
  console.log(`>> Deployed at ${strategyRestrictedAddBaseTokenOnlyV2.address}`);
  console.log("✅ Done")
  
  if(WHITELIST_WORKERS.length > 0) {
    console.log(">> Whitelisting workers for strategyRestrictedAddBaseTokenOnlyV2")
    await strategyRestrictedAddBaseTokenOnlyV2.setWorkersOk(WHITELIST_WORKERS, true)
    console.log("✅ Done")
  }
  
  /**
   * Restricted StrategyLiquidate V2
   */
  console.log(">> Deploying an upgradable WaultEx Restricted StrategyLiquidate V2 contract");
  const WaultSwapRestrictedStrategyLiquidate = (await ethers.getContractFactory(
    "WaultSwapRestrictedStrategyLiquidate",
    (await ethers.getSigners())[0],
  )) as WaultSwapRestrictedStrategyLiquidate__factory;
  const strategyRestrictedLiquidateV2 = await upgrades.deployProxy(WaultSwapRestrictedStrategyLiquidate, [ROUTER]) as WaultSwapRestrictedStrategyLiquidate;
  await strategyRestrictedLiquidateV2.deployed();
  console.log(`>> Deployed at ${strategyRestrictedLiquidateV2.address}`);
  console.log("✅ Done")
  
  if(WHITELIST_WORKERS.length > 0) {
    console.log(">> Whitelisting workers for strategyRestrictedLiquidateV2")
    await strategyRestrictedLiquidateV2.setWorkersOk(WHITELIST_WORKERS, true)
    console.log("✅ Done")
  }

  /**
   * Restricted StrategyWithdrawMinimizeTrading V2
   */
  console.log(">> Deploying an upgradable WaultEx Restricted StrategyWithdrawMinimizeTrading V2 contract");
  const WaultSwapRestrictedStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
    "WaultSwapRestrictedStrategyWithdrawMinimizeTrading",
    (await ethers.getSigners())[0],
  )) as WaultSwapRestrictedStrategyWithdrawMinimizeTrading__factory;
  const strategyRestrictedWithdrawMinimizeTradingV2 = await upgrades.deployProxy(
    WaultSwapRestrictedStrategyWithdrawMinimizeTrading, [ROUTER, WBNB, WNATIVE_RELAYER]) as WaultSwapRestrictedStrategyWithdrawMinimizeTrading;
  await strategyRestrictedWithdrawMinimizeTradingV2.deployed()
  console.log(`>> Deployed at ${strategyRestrictedWithdrawMinimizeTradingV2.address}`);
  
  if(WHITELIST_WORKERS.length > 0) {
    console.log(">> Whitelisting workers for strategyRestrictedWithdrawMinimizeTradingV2")
    await strategyRestrictedWithdrawMinimizeTradingV2.setWorkersOk(WHITELIST_WORKERS, true)
    console.log("✅ Done")
  }

  console.log(">> Whitelist RestrictedStrategyWithdrawMinimizeTrading V2 on WNativeRelayer");
  const wNativeRelayer = WNativeRelayer__factory.connect(WNATIVE_RELAYER, (await ethers.getSigners())[0]);
  await wNativeRelayer.setCallerOk([strategyRestrictedWithdrawMinimizeTradingV2.address], true);
  console.log("✅ Done")

  /**
   * Restricted StrategyPartialCloseMinimizeTrading V2
   */
   console.log(">> Deploying an upgradable WaultEx Restricted StrategyPartialCloseMinimizeTrading V2 contract");
   const WaultSwapRestrictedStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
     "WaultSwapRestrictedStrategyPartialCloseMinimizeTrading",
     (await ethers.getSigners())[0],
   )) as WaultSwapRestrictedStrategyPartialCloseMinimizeTrading__factory;
   const strategyRestrictedPartialCloseMinimizeTradingV2 = await upgrades.deployProxy(
    WaultSwapRestrictedStrategyPartialCloseMinimizeTrading, [ROUTER, WBNB, WNATIVE_RELAYER]) as WaultSwapRestrictedStrategyPartialCloseMinimizeTrading;
   await strategyRestrictedPartialCloseMinimizeTradingV2.deployed()
   console.log(`>> Deployed at ${strategyRestrictedPartialCloseMinimizeTradingV2.address}`);
   
   if(WHITELIST_WORKERS.length > 0) {
     console.log(">> Whitelisting workers for strategyRestrictedPartialCloseMinimizeTradingV2")
     await strategyRestrictedPartialCloseMinimizeTradingV2.setWorkersOk(WHITELIST_WORKERS, true)
     console.log("✅ Done")
   }
 
   console.log(">> Whitelist RestrictedStrategyPartialCloseMinimizeTrading V2 on WNativeRelayer");
   await wNativeRelayer.setCallerOk([strategyRestrictedPartialCloseMinimizeTradingV2.address], true);
   console.log("✅ Done")
};

export default func;
func.tags = ['WaultSwapShareRestrictedStrategies'];