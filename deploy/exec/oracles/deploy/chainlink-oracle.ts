import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { ChainLinkPriceOracle__factory } from '../../../../typechain';

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















  console.log(">> Deploying an upgradable ChainLinkPriceOracle contract");
  const ChainLinkPriceOracle = (await ethers.getContractFactory(
    'ChainLinkPriceOracle',
    (await ethers.getSigners())[0]
  )) as ChainLinkPriceOracle__factory;
  const chainLinkPriceOracle = await upgrades.deployProxy(
    ChainLinkPriceOracle
  );
  await chainLinkPriceOracle._deployed();
  console.log(`>> Deployed at ${chainLinkPriceOracle.address}`);
};

export default func;
func.tags = ['ChainLinkPriceOracle'];