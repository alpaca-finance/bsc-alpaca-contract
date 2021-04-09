import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { StrategyAddBaseTokenOnly__factory, StrategyLiquidate__factory, StrategyWithdrawMinimizeTrading__factory, Timelock__factory, WNativeRelayer__factory } from '../typechain';

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

  const ROUTER = '0xf46A02489B99C5A4a5cC31AA3F9eBD6A501D4B49';
  const WBNB = '0xDfb1211E2694193df5765d54350e1145FD2404A1';
  const WNATIVE_RELAYER = '0x7e2284c8CC74F13FA6c218c4231b0786E6204728';










  console.log(">> Deploying an upgradable StrategyWithdrawMinimize contract");
  const StrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
    "StrategyWithdrawMinimizeTrading",
    (await ethers.getSigners())[0],
  )) as StrategyWithdrawMinimizeTrading__factory;
  const strategyWithdrawMinimizeTrading = await upgrades.deployProxy(
    StrategyWithdrawMinimizeTrading, [ROUTER, WBNB, WNATIVE_RELAYER]);
  await strategyWithdrawMinimizeTrading.deployed()
  console.log(`>> Deployed at ${strategyWithdrawMinimizeTrading.address}`);

  console.log(">> Whitelist StrategyWithdrawMinimizeTrading on WNativeRelayer");
  const wNativeRelayer = WNativeRelayer__factory.connect(WNATIVE_RELAYER, (await ethers.getSigners())[0]);
  await wNativeRelayer.setCallerOk([strategyWithdrawMinimizeTrading.address], true);
  console.log("✅ Done")
};

export default func;
func.tags = ['StrategyWithdrawMinimizeTrading'];