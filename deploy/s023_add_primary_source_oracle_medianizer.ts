import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { OracleMedianizer__factory } from '../typechain'
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

  const ORACLE_MEDIANIZER_ADDR = '';
  const TOKEN0 = MainnetConfig['Tokens']['WBNB'];
  const TOKEN1 = MainnetConfig['Tokens']['BUSD'];
  const MAXPRICEDEVIATION = 0;
  const SOURCES = [''];





  




  const oracleMedianizer = OracleMedianizer__factory.connect(ORACLE_MEDIANIZER_ADDR, (await ethers.getSigners())[0]);
  console.log(">> Adding primary source to oracle medianizer");
  await oracleMedianizer.setPrimarySources(TOKEN0, TOKEN1, MAXPRICEDEVIATION, SOURCES, { gasLimit: '10000000' });
  console.log("✅ Done")
};

export default func;
func.tags = ['AddSourceOracleMedianizer'];