import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { 
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly,
  PancakeswapV2RestrictedStrategyAddBaseTokenOnly__factory,
  PancakeswapV2RestrictedStrategyLiquidate,
  PancakeswapV2RestrictedStrategyLiquidate__factory,
  PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading,
  PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading__factory,
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

  const ROUTER_V2 = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
  const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  const WNATIVE_RELAYER = '0xE1D2CA01bc88F325fF7266DD2165944f3CAf0D3D';
  const WHITELIST_WOKERS = [
    // BNB (12)
    "0x7Af938f0EFDD98Dc513109F6A7E85106D26E16c4",
    "0x0aD12Bc160B523E7aBfBe3ABaDceE8F1b6116089",
    "0x831332f94C4A0092040b28ECe9377AfEfF34B25a",
    "0x05bDF33f03017eaFdEEccD68406E1281a1deF62d",
    "0xA1644132Ca692ba0657637A31CE0F6B99f052C5E",
    "0xDcd9f075B1Ff638e757226626a3b3606D7795f80",
    "0xBB77F1625c4C3374ea0BAF42FAC74F7b7Ae9E4c6",
    "0x2E7f32e38EA5a5fcb4494d9B626d2d393B176B1E",
    "0x4193D35D0cB598d92703ED69701f5d568aCa015c",
    "0xa726E9E5c007253fe7589879136FDf24dA6DA393",
    "0x9B13982d094b4fCca4aFF741A96834ff66E4d8bd",
    "0x730bce145a55A07C2D7363db7110466c5c26E472",
    // BUSD (7)
    "0xC5954CA8988988362f60498d5aDEc67BA466492B",
    "0x51782E39A0aF33f542443419c223434Bb4A5a695",
    "0x693430Fe5F1b0a61b232132d0567295c288eA482",
    "0xB82B93FcF1818513889c0E1F3628484Ce5017A14",
    "0xe632ac75f2d0A97F7b1ef3a8a16d653C4c82b1fb",
    "0xeBdECF3a21D95453A89440A4E32B9559E47073E7",
    "0x2C4a246e532542DFaE3d575003C7f5c6583BFD8c",
    // ETH (2)
    "0xd6260DB3A84C7BfdAFcD82325397B8E70B39627f",
    "0xaA5c95181c02DfB8173813149e52c8C9E4E14124",
    // ALPACA (1)
    "0xeF1C5D2c20b22Ae50437a2F3bd258Ab1117D1BaD"
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

  /**
   * Restricted StrategyPartialCloseMinimizeTrading V2
   */
   console.log(">> Deploying an upgradable Restricted StrategyPartialCloseMinimizeTrading V2 contract");
   const PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading = (await ethers.getContractFactory(
     "PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading",
     (await ethers.getSigners())[0],
   )) as PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading__factory;
   const strategyRestrictedPartialCloseMinimizeTradingV2 = await upgrades.deployProxy(
    PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading, [ROUTER_V2, WBNB, WNATIVE_RELAYER]) as PancakeswapV2RestrictedStrategyPartialCloseMinimizeTrading;
   await strategyRestrictedPartialCloseMinimizeTradingV2.deployed()
   console.log(`>> Deployed at ${strategyRestrictedPartialCloseMinimizeTradingV2.address}`);
 
   console.log(">> Whitelisting workers for strategyRestrictedPartialCloseMinimizeTradingV2")
   await strategyRestrictedPartialCloseMinimizeTradingV2.setWorkersOk(WHITELIST_WOKERS, true)
   console.log("✅ Done")
 
   console.log(">> Whitelist strategyRestrictedPartialCloseMinimizeTradingV2 V2 on WNativeRelayer");
   await wNativeRelayer.setCallerOk([strategyRestrictedPartialCloseMinimizeTradingV2.address], true);
   console.log("✅ Done")
};

export default func;
func.tags = ['ShareRestrictedStrategiesV2'];