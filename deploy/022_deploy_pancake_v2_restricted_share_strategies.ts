import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedStrategyLiquidate__factory,
  PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading__factory,
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

  const ROUTER_V2 = '';
  const WBNB = '';
  const WNATIVE_RELAYER = '';









  /**
   * Restricted StrategyAddBaseTokenOnly V2
   */
  console.log(">> Deploying an upgradable Restricted StrategyAddBaseTokenOnly V2 contract");
  const PancakeswapV2RestrictedStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
    "PancakeswapV2RestrictedStrategyAddBaseTokenOnly",
    (await ethers.getSigners())[0],
  )) as PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory;
  const strategyRestrictedAddBaseTokenOnlyV2 = await upgrades.deployProxy(PancakeswapV2RestrictedStrategyAddBaseTokenOnly, [ROUTER_V2]);
  await strategyRestrictedAddBaseTokenOnlyV2.deployed()
  console.log(`>> Deployed at ${strategyRestrictedAddBaseTokenOnlyV2.address}`);
  console.log("✅ Done")
  
  /**
   * Restricted StrategyLiquidate V2
   */
  console.log(">> Deploying an upgradable Restricted StrategyLiquidate V2 contract");
  const PancakeswapV2RestrictedStrategyLiquidate = (await ethers.getContractFactory(
    "PancakeswapV2RestrictedStrategyLiquidate",
    (await ethers.getSigners())[0],
  )) as PancakeswapV2RestrictedStrategyLiquidate__factory;
  const strategyRestrictedLiquidateV2 = await upgrades.deployProxy(PancakeswapV2RestrictedStrategyLiquidate, [ROUTER_V2]);
  await strategyRestrictedLiquidateV2.deployed();
  console.log(`>> Deployed at ${strategyRestrictedLiquidateV2.address}`);
  console.log("✅ Done")

  /**
   * Restricted StrategyWithdrawMinimizeTrading V2
   */
  console.log(">> Deploying an upgradable Restricted StrategyWithdrawMinimizeTrading V2 contract");
  const PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
    "PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading",
    (await ethers.getSigners())[0],
  )) as PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading__factory;
  const strategyRestrictedWithdrawMinimizeTradingV2 = await upgrades.deployProxy(
    PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading, [ROUTER_V2, WBNB, WNATIVE_RELAYER]);
  await strategyRestrictedWithdrawMinimizeTradingV2.deployed()
  console.log(`>> Deployed at ${strategyRestrictedWithdrawMinimizeTradingV2.address}`);

  console.log(">> Whitelist RestrictedStrategyWithdrawMinimizeTrading V2 on WNativeRelayer");
  const wNativeRelayer = WNativeRelayer__factory.connect(WNATIVE_RELAYER, (await ethers.getSigners())[0]);
  await wNativeRelayer.setCallerOk([strategyRestrictedWithdrawMinimizeTradingV2.address], true);
  console.log("✅ Done")
};

export default func;
func.tags = ['ShareRestrictedStrategiesV2'];