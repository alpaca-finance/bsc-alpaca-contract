import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { SingleAssetWorkerConfig__factory } from '../../../../typechain';

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
  const SIMPLE_ORACLE_ADDR = '0x166f56F2EDa9817cAB77118AE4FCAA0002A17eC7';
  const PANCAKE_ROUTER_V2 = '0x10ED43C718714eb63d5aA57B78B54704E256024E'














  console.log(">> Deploying an upgradable SingleAssetWorkerConfig contract");
  const SingleAssetWorkerConfig = (await ethers.getContractFactory(
    'SingleAssetWorkerConfig',
    (await ethers.getSigners())[0]
  )) as SingleAssetWorkerConfig__factory;
  const workerConfig = await upgrades.deployProxy(
    SingleAssetWorkerConfig,[SIMPLE_ORACLE_ADDR, PANCAKE_ROUTER_V2]
  );
  await workerConfig.deployed();
  console.log(`>> Deployed at ${workerConfig.address}`);
};

export default func;
func.tags = ['SingleAssetWorkerConfig'];