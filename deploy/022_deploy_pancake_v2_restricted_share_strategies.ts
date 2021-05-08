import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { 
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedStrategyLiquidate,
  PancakeswapV2RestrictedStrategyLiquidate__factory,
  PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading,
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

  const ROUTER_V2 = '0x367633909278A3C91f4cB130D8e56382F00D1071';
  const WBNB = '0xDfb1211E2694193df5765d54350e1145FD2404A1';
  const WNATIVE_RELAYER = '0x7e2284c8CC74F13FA6c218c4231b0786E6204728';

  const WHITELIST_WOKERS = [
    '0x2c12663339Fdce1A3088C0245FC2499255ccF7eC',
    '0xf20E73385397284f37c47963E2515156fCf33360',
    '0xA950ee51Ac3b27a1a6C87D6448D6717ACBc7b0A8',
    '0x8Da719444090875B476A7163F8A363fB30F2440c',
    '0x09207DF4c9D3E62346997e39526fb0e46Ce45539',
    '0x87501549129FB8A960F870CCcDc0153D8b926b4E',
    '0x9d25cEec06a6A732c8647BA717f986Bf67794a80',
    '0xF4964FDD35D9443b766adD8bdEb98C4E8592a7ea',
    '0x933d7fABE41cBc5e9483bD8CD0407Cf375a8e0C3',
    '0x3C437EBe897fd8A624F762A1c9e79A3759b57615',
    '0x7b3cD9e6C631Fbeac75A4f017DDa06009C32Ab63',
    '0x4cE3C78b1706FbC6070451A184D2d4E52145A51b',
    '0xA498326A4A481832bb6Ca97cC98dA47dc0452618',
    '0xDf605784D78D42b5507Be14D6533a835E2692A16',
    '0x29000295C94a9739cB6F6A7Bf407684f6c372286',
    '0xcF133249342444781ac4Fd5C101a0874ef88BA3A',
    '0x8B9e246D217e94ff67EA2d48fC6299366D3f984b',
    '0xA06635050bA513B872a24F3316b68fdD98C424D3',
    '0xa7133b1e009e542ee5f6F6Dd786D9B35382600a2',
    '0xeC1928f6dC3aa5069A6837f390f803f996A65285',
    '0xC8149CAc51AC1bb5009Dd71e50C54a7dec96aB30',
    '0xd9811CeD97545243a13608924d6648251B07ed1A',
    '0x4Ce9EBac0b85c406af33d2Ba92502F4317511e18'
  ]









  /**
   * Restricted StrategyAddBaseTokenOnly V2
   */
  console.log(">> Deploying an upgradable Restricted StrategyAddBaseTokenOnly V2 contract");
  const PancakeswapV2RestrictedStrategyAddBaseTokenOnly = (await ethers.getContractFactory(
    "PancakeswapV2RestrictedStrategyAddBaseTokenOnly",
    (await ethers.getSigners())[0],
  )) as PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory;
  const strategyRestrictedAddBaseTokenOnlyV2 = await upgrades.deployProxy(PancakeswapV2RestrictedStrategyAddBaseTokenOnly, [ROUTER_V2]) as PancakeswapV2RestrictedStrategyAddBaseTokenOnly;
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
  const PancakeswapV2RestrictedStrategyLiquidate = (await ethers.getContractFactory(
    "PancakeswapV2RestrictedStrategyLiquidate",
    (await ethers.getSigners())[0],
  )) as PancakeswapV2RestrictedStrategyLiquidate__factory;
  const strategyRestrictedLiquidateV2 = await upgrades.deployProxy(PancakeswapV2RestrictedStrategyLiquidate, [ROUTER_V2]) as PancakeswapV2RestrictedStrategyLiquidate;
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
  const PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading = (await ethers.getContractFactory(
    "PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading",
    (await ethers.getSigners())[0],
  )) as PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading__factory;
  const strategyRestrictedWithdrawMinimizeTradingV2 = await upgrades.deployProxy(
    PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading, [ROUTER_V2, WBNB, WNATIVE_RELAYER]) as PancakeswapV2RestrictedStrategyWithdrawMinimizeTrading;
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
func.tags = ['ShareRestrictedStrategiesV2'];