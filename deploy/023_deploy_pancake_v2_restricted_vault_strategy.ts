import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import {
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory } from '../typechain';

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

  const NEW_PARAMS = [{
    VAULT_ADDR: '0xd7D069493685A581d27824Fc46EdA46B7EfC0063', // bnb
    ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    WHITELIST_WORKER: [
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
    ]
  }, {
    VAULT_ADDR: '0x7C9e73d4C71dae564d41F78d56439bB4ba87592f', // busd
    ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    WHITELIST_WORKER: [
      // BUSD (7)
      "0xC5954CA8988988362f60498d5aDEc67BA466492B",
      "0x51782E39A0aF33f542443419c223434Bb4A5a695",
      "0x693430Fe5F1b0a61b232132d0567295c288eA482",
      "0xB82B93FcF1818513889c0E1F3628484Ce5017A14",
      "0xe632ac75f2d0A97F7b1ef3a8a16d653C4c82b1fb",
      "0xeBdECF3a21D95453A89440A4E32B9559E47073E7",
      "0x2C4a246e532542DFaE3d575003C7f5c6583BFD8c",
    ]
  }, {
    VAULT_ADDR: '0xbfF4a34A4644a113E8200D7F1D79b3555f723AfE', // eth
    ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    WHITELIST_WORKER: [
      // ETH (2)
      "0xd6260DB3A84C7BfdAFcD82325397B8E70B39627f",
      "0xaA5c95181c02DfB8173813149e52c8C9E4E14124",
    ]
  },{
    VAULT_ADDR: '0xf1bE8ecC990cBcb90e166b71E368299f0116d421', // ALPACA
    ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    WHITELIST_WORKER: [
      // ALPACA (1)
      "0xeF1C5D2c20b22Ae50437a2F3bd258Ab1117D1BaD"  ]
  }]








  for(let i = 0; i < NEW_PARAMS.length; i++ ) {
    console.log(">> Deploying an upgradable Restricted StrategyAddTwoSidesOptimalV2 contract");
    const StrategyRestrictedAddTwoSidesOptimal = (await ethers.getContractFactory(
      'PancakeswapV2RestrictedStrategyAddTwoSidesOptimal',
      (await ethers.getSigners())[0]
    )) as PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory;
    const strategyRestrictedAddTwoSidesOptimal = await upgrades.deployProxy(
      StrategyRestrictedAddTwoSidesOptimal,[NEW_PARAMS[i].ROUTER, NEW_PARAMS[i].VAULT_ADDR]
    ) as PancakeswapV2RestrictedStrategyAddTwoSidesOptimal;
    await strategyRestrictedAddTwoSidesOptimal.deployed();
    console.log(`>> Deployed at ${strategyRestrictedAddTwoSidesOptimal.address}`);

    console.log(">> Whitelisting Workers")
    const tx = await strategyRestrictedAddTwoSidesOptimal.setWorkersOk(NEW_PARAMS[i].WHITELIST_WORKER, true)
    console.log(">> Done at: ", tx.hash)
  }
};

export default func;
func.tags = ['RestrictedVaultStrategiesV2'];