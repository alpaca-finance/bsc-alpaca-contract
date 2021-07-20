import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { PancakeswapV2StrategyAddBaseTokenOnly__factory,
  PancakeswapV2StrategyLiquidate__factory,
  PancakeswapV2StrategyWithdrawMinimizeTrading__factory,
  WNativeRelayer__factory
 } from '../../../../../typechain';

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
  const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  const WNATIVE_RELAYER = '0xE1D2CA01bc88F325fF7266DD2165944f3CAf0D3D';









  /**
   * StrategyAddBaseTokenOnly V2
   */
  console.log(">> Deploying an upgradable StrategyAddBaseTokenOnly V2 contract");
  const PancakeswapV2StrategyAddBaseTokenOnly = (await ethers.getContractFactory(
    "PancakeswapV2StrategyAddBaseTokenOnly",
    (await ethers.getSigners())[0],
  )) as PancakeswapV2StrategyAddBaseTokenOnly__factory;
  const strategyAddBaseTokenOnlyV2 = await upgrades.deployProxy(PancakeswapV2StrategyAddBaseTokenOnly, [ROUTER_V2]);
  await strategyAddBaseTokenOnlyV2.deployed()
  console.log(`>> Deployed at ${strategyAddBaseTokenOnlyV2.address}`);
  console.log("✅ Done")
  
  /**
   * StrategyLiquidate V2
   */
  console.log(">> Deploying an upgradable StrategyLiquidate V2 contract");
  const PancakeswapV2StrategyLiquidate = (await ethers.getContractFactory(
    "PancakeswapV2StrategyLiquidate",
    (await ethers.getSigners())[0],
  )) as PancakeswapV2StrategyLiquidate__factory;
  const strategyLiquidateV2 = await upgrades.deployProxy(PancakeswapV2StrategyLiquidate, [ROUTER_V2]);
  await strategyLiquidateV2.deployed();
  console.log(`>> Deployed at ${strategyLiquidateV2.address}`);
  console.log("✅ Done")

  /**
   * StrategyWithdrawMinimizeTrading V2
   */
  console.log(">> Deploying an upgradable StrategyWithdrawMinimizeTrading V2 contract");
  const PancakeswapV2StrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
    "PancakeswapV2StrategyWithdrawMinimizeTrading",
    (await ethers.getSigners())[0],
  )) as PancakeswapV2StrategyWithdrawMinimizeTrading__factory;
  const strategyWithdrawMinimizeTradingV2 = await upgrades.deployProxy(
    PancakeswapV2StrategyWithdrawMinimizeTrading, [ROUTER_V2, WBNB, WNATIVE_RELAYER]);
  await strategyWithdrawMinimizeTradingV2.deployed()
  console.log(`>> Deployed at ${strategyWithdrawMinimizeTradingV2.address}`);

  console.log(">> Whitelist StrategyWithdrawMinimizeTrading V2 on WNativeRelayer");
  const wNativeRelayer = WNativeRelayer__factory.connect(WNATIVE_RELAYER, (await ethers.getSigners())[0]);
  await wNativeRelayer.setCallerOk([strategyWithdrawMinimizeTradingV2.address], true);
  console.log("✅ Done")
};

export default func;
func.tags = ['ShareStrategiesV2'];