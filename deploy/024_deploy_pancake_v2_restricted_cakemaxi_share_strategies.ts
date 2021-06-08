import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { 
  PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedCakeMaxiStrategyLiquidate,
  PancakeswapV2RestrictedCakeMaxiStrategyLiquidate__factory,
  PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading,
  PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading__factory,
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

  const ROUTER_V2 = '0x367633909278A3C91f4cB130D8e56382F00D1071';
  const WNATIVE_RELAYER = '0x7e2284c8CC74F13FA6c218c4231b0786E6204728';
  const WHITELIST_WOKERS: Array<string> = []









  /**
   * Restricted CakeMaxi StrategyAddBaseTokenOnly V2
   */
  console.log(">> Deploying an upgradable Restricted CakeMaxi StrategyAddBaseTokenOnly V2 contract");
  const PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
    "PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly",
    (await ethers.getSigners())[0],
  )) as PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly__factory;

  const cakeMaxiStrategyRestrictedAddBaseTokenOnlyV2 = await upgrades.deployProxy(PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly, [ROUTER_V2]) as PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly;
  
  await cakeMaxiStrategyRestrictedAddBaseTokenOnlyV2.deployed()
  console.log(`>> Deployed at ${cakeMaxiStrategyRestrictedAddBaseTokenOnlyV2.address}`);
  console.log("✅ Done")

  if(WHITELIST_WOKERS.length > 0) {
    console.log(">> Whitelisting workers for PancakeswapV2RestrictedCakeMaxiStrategyAddBaseTokenOnly")
    await cakeMaxiStrategyRestrictedAddBaseTokenOnlyV2.setWorkersOk(WHITELIST_WOKERS, true)
    console.log("✅ Done")
  }
  
  /**
   * Restricted CakeMaxi StrategyLiquidate V2
   */
  console.log(">> Deploying an upgradable Restricted CakeMaxi StrategyLiquidate V2 contract");
  const PancakeswapV2RestrictedCakeMaxiStrategyLiquidate = (await ethers.getContractFactory(
    "PancakeswapV2RestrictedCakeMaxiStrategyLiquidate",
    (await ethers.getSigners())[0],
  )) as PancakeswapV2RestrictedCakeMaxiStrategyLiquidate__factory;

  const cakeMaxiStrategyRestrictedLiquidateV2 = await upgrades.deployProxy(PancakeswapV2RestrictedCakeMaxiStrategyLiquidate, [ROUTER_V2]) as PancakeswapV2RestrictedCakeMaxiStrategyLiquidate;
  
  await cakeMaxiStrategyRestrictedLiquidateV2.deployed();
  console.log(`>> Deployed at ${cakeMaxiStrategyRestrictedLiquidateV2.address}`);
  console.log("✅ Done")
  
  if(WHITELIST_WOKERS.length > 0) {
    console.log(">> Whitelisting workers for PancakeswapV2RestrictedCakeMaxiStrategyLiquidate")
    await cakeMaxiStrategyRestrictedLiquidateV2.setWorkersOk(WHITELIST_WOKERS, true)
    console.log("✅ Done")
  }

  /**
   * Restricted CakeMaxi StrategyWithdrawMinimizeTrading V2
   */
  console.log(">> Deploying an upgradable Restricted CakeMaxi StrategyWithdrawMinimizeTrading V2 contract");
  const PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
    "PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading",
    (await ethers.getSigners())[0],
  )) as PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading__factory;

  const cakeMaxiStrategyRestrictedWithdrawMinimizeTradingV2 = await upgrades.deployProxy(
    PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading, [ROUTER_V2, WNATIVE_RELAYER]) as PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading;
  await cakeMaxiStrategyRestrictedWithdrawMinimizeTradingV2.deployed()

  console.log(`>> Deployed at ${cakeMaxiStrategyRestrictedWithdrawMinimizeTradingV2.address}`);
  
  if(WHITELIST_WOKERS.length > 0) {
    console.log(">> Whitelisting workers for PancakeswapV2RestrictedCakeMaxiStrategyWithdrawMinimizeTrading")
    await cakeMaxiStrategyRestrictedWithdrawMinimizeTradingV2.setWorkersOk(WHITELIST_WOKERS, true)
    console.log("✅ Done")
  }

  console.log(">> Whitelist RestrictedCakeMaxiStrategyWithdrawMinimizeTrading V2 on WNativeRelayer");
  const wNativeRelayer = WNativeRelayer__factory.connect(WNATIVE_RELAYER, (await ethers.getSigners())[0]);
  await wNativeRelayer.setCallerOk([cakeMaxiStrategyRestrictedWithdrawMinimizeTradingV2.address], true);
  console.log("✅ Done")
};

export default func;
func.tags = ['ShareCakeMaxiStrategiesV2'];