import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import {
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedSingleAssetStrategyLiquidate,
  PancakeswapV2RestrictedSingleAssetStrategyLiquidate__factory,
  PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading,
  PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading__factory,
  PancakeswapV2RestrictedSingleAssetStrategyPartialCloseWithdrawMinimizeTrading,
  PancakeswapV2RestrictedSingleAssetStrategyPartialCloseWithdrawMinimizeTrading__factory,
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

  const ROUTER_V2 = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
  const WNATIVE_RELAYER = '0xE1D2CA01bc88F325fF7266DD2165944f3CAf0D3D';
  const WHITELIST_WOKERS: Array<string> = []









  /**
   * Restricted Single Asset StrategyAddBaseTokenOnly V2
   */
  console.log(">> Deploying an upgradable Restricted Single Asset StrategyAddBaseTokenOnly V2 contract");
  const PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
    "PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly",
    (await ethers.getSigners())[0],
  )) as PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly__factory;

  const singleStrategyRestrictedAddBaseTokenOnlyV2 = await upgrades.deployProxy(PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly, [ROUTER_V2]) as PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly;
  
  await singleStrategyRestrictedAddBaseTokenOnlyV2.deployed()
  console.log(`>> Deployed at ${singleStrategyRestrictedAddBaseTokenOnlyV2.address}`);
  console.log("✅ Done")

  if(WHITELIST_WOKERS.length > 0) {
    console.log(">> Whitelisting workers for PancakeswapV2RestrictedSingleAssetStrategyAddBaseTokenOnly")
    await singleStrategyRestrictedAddBaseTokenOnlyV2.setWorkersOk(WHITELIST_WOKERS, true)
    console.log("✅ Done")
  }
  
  /**
   * Restricted Single Asset StrategyLiquidate V2
   */
  console.log(">> Deploying an upgradable Restricted Single Asset StrategyLiquidate V2 contract");
  const PancakeswapV2RestrictedSingleAssetStrategyLiquidate = (await ethers.getContractFactory(
    "PancakeswapV2RestrictedSingleAssetStrategyLiquidate",
    (await ethers.getSigners())[0],
  )) as PancakeswapV2RestrictedSingleAssetStrategyLiquidate__factory;

  const singleStrategyRestrictedLiquidateV2 = await upgrades.deployProxy(PancakeswapV2RestrictedSingleAssetStrategyLiquidate, [ROUTER_V2]) as PancakeswapV2RestrictedSingleAssetStrategyLiquidate;
  
  await singleStrategyRestrictedLiquidateV2.deployed();
  console.log(`>> Deployed at ${singleStrategyRestrictedLiquidateV2.address}`);
  console.log("✅ Done")
  
  if(WHITELIST_WOKERS.length > 0) {
    console.log(">> Whitelisting workers for PancakeswapV2RestrictedSingleAssetStrategyLiquidate")
    await singleStrategyRestrictedLiquidateV2.setWorkersOk(WHITELIST_WOKERS, true)
    console.log("✅ Done")
  }

  /**
   * Restricted Single Asset StrategyWithdrawMinimizeTrading V2
   */
  console.log(">> Deploying an upgradable Restricted Single Asset StrategyWithdrawMinimizeTrading V2 contract");
  const PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
    "PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading",
    (await ethers.getSigners())[0],
  )) as PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading__factory;

  const singleAssetStrategyRestrictedWithdrawMinimizeTradingV2 = await upgrades.deployProxy(
    PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading, [ROUTER_V2, WNATIVE_RELAYER]) as PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading;
  await singleAssetStrategyRestrictedWithdrawMinimizeTradingV2.deployed()

  console.log(`>> Deployed at ${singleAssetStrategyRestrictedWithdrawMinimizeTradingV2.address}`);
  
  if(WHITELIST_WOKERS.length > 0) {
    console.log(">> Whitelisting workers for PancakeswapV2RestrictedSingleAssetStrategyWithdrawMinimizeTrading")
    await singleAssetStrategyRestrictedWithdrawMinimizeTradingV2.setWorkersOk(WHITELIST_WOKERS, true)
    console.log("✅ Done")
  }

  console.log(">> Whitelist RestrictedSingleAssetStrategyWithdrawMinimizeTrading V2 on WNativeRelayer");
  const wNativeRelayer = WNativeRelayer__factory.connect(WNATIVE_RELAYER, (await ethers.getSigners())[0]);
  await wNativeRelayer.setCallerOk([singleAssetStrategyRestrictedWithdrawMinimizeTradingV2.address], true);
  console.log("✅ Done")

  /**
   * Restricted Single Asset StrategyPartialCloseWithdrawMinimizeTrading V2
   */
   console.log(">> Deploying an upgradable Restricted Single Asset StrategyPartialCloseWithdrawMinimizeTrading V2 contract");
   const PancakeswapV2RestrictedSingleAssetStrategyPartialCloseWithdrawMinimizeTrading = (await ethers.getContractFactory(
     "PancakeswapV2RestrictedSingleAssetStrategyPartialCloseWithdrawMinimizeTrading",
     (await ethers.getSigners())[0],
   )) as PancakeswapV2RestrictedSingleAssetStrategyPartialCloseWithdrawMinimizeTrading__factory;
 
   const singleAssetStrategyRestrictedPartialCloseWithdrawMinimizeTradingV2 = await upgrades.deployProxy(
     PancakeswapV2RestrictedSingleAssetStrategyPartialCloseWithdrawMinimizeTrading, [ROUTER_V2, WNATIVE_RELAYER]) as PancakeswapV2RestrictedSingleAssetStrategyPartialCloseWithdrawMinimizeTrading;
   await singleAssetStrategyRestrictedPartialCloseWithdrawMinimizeTradingV2.deployed()
 
   console.log(`>> Deployed at ${singleAssetStrategyRestrictedPartialCloseWithdrawMinimizeTradingV2.address}`);
   
   if(WHITELIST_WOKERS.length > 0) {
     console.log(">> Whitelisting workers for PancakeswapV2RestrictedSingleAssetStrategyPartialCloseWithdrawMinimizeTrading")
     await singleAssetStrategyRestrictedPartialCloseWithdrawMinimizeTradingV2.setWorkersOk(WHITELIST_WOKERS, true)
     console.log("✅ Done")
   }
 
   console.log(">> Whitelist RestrictedSingleAssetStrategyPartialCloseWithdrawMinimizeTrading V2 on WNativeRelayer");
   const wNativeRelayerPartial = WNativeRelayer__factory.connect(WNATIVE_RELAYER, (await ethers.getSigners())[0]);
   await wNativeRelayerPartial.setCallerOk([singleAssetStrategyRestrictedPartialCloseWithdrawMinimizeTradingV2.address], true);
   console.log("✅ Done")
};

export default func;
func.tags = ['ShareSingleAssetStrategiesV2'];