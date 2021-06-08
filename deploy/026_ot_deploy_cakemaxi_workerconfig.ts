import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { IVault, IVault__factory, CakeMaxiWorkerConfig__factory } from '../typechain';

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
  const PANCAKE_ROUTER_V2 = '0x367633909278A3C91f4cB130D8e56382F00D1071'














  console.log(">> Deploying an upgradable CakeMaxiWorkerConfig contract");
  const CakeMaxiWorkerConfig = (await ethers.getContractFactory(
    'CakeMaxiWorkerConfig',
    (await ethers.getSigners())[0]
  )) as CakeMaxiWorkerConfig__factory;
  const workerConfig = await upgrades.deployProxy(
    CakeMaxiWorkerConfig,[SIMPLE_ORACLE_ADDR, PANCAKE_ROUTER_V2]
  );
  await workerConfig.deployed();
  console.log(`>> Deployed at ${workerConfig.address}`);
};

export default func;
func.tags = ['CakeMaxiWorkerConfig'];