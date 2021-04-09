import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { IVault, IVault__factory, WorkerConfig__factory } from '../typechain';

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
  const SIMPLE_ORACLE_ADDR = '0xFb0645d38e35DA4C4Aa0079366B7d9905f162fCe';














  console.log(">> Deploying an upgradable WorkerConfig contract");
  const WorkerConfig = (await ethers.getContractFactory(
    'WorkerConfig',
    (await ethers.getSigners())[0]
  )) as WorkerConfig__factory;
  const workerConfig = await upgrades.deployProxy(
    WorkerConfig,[SIMPLE_ORACLE_ADDR]
  );
  await workerConfig.deployed();
  console.log(`>> Deployed at ${workerConfig.address}`);
};

export default func;
func.tags = ['WorkerConfig'];