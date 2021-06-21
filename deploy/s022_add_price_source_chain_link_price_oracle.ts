import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { ChainLinkPriceOracle__factory } from '../typechain'
import MainnetConfig from '../.mainnet.json'

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

  const CHAIN_LINK_PRICE_ORACLE_ADDR = '';
  const TOKEN0S = [
    MainnetConfig['Tokens']['WBNB']
  ];
  const TOKEN1S = [
    MainnetConfig['Tokens']['BUSD']
  ];
  const AGGREGATORV3S = [
    ''
  ];





  





  const chainLinkPriceOracle = ChainLinkPriceOracle__factory.connect(CHAIN_LINK_PRICE_ORACLE_ADDR, (await ethers.getSigners())[0]);
  console.log(">> Adding price source to chain link price oracle");
  await chainLinkPriceOracle.setPriceFeeds(TOKEN0S, TOKEN1S, AGGREGATORV3S ,{ gasLimit: '10000000' });
  console.log("✅ Done")
};

export default func;
func.tags = ['AddSourceChainLinkPriceOracle'];