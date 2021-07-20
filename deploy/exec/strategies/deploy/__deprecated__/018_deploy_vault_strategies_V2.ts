import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { PancakeswapV2StrategyAddTwoSidesOptimal__factory } from '../../../../../typechain';

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
    VAULT_ADDR: '0xb5913CD4C508f07025678CeF939BcC54D3024C39',
    ROUTER: '0x367633909278A3C91f4cB130D8e56382F00D1071'
  }]








  for(let i = 0; i < NEW_PARAMS.length; i++ ) {
    console.log(">> Deploying an upgradable StrategyAddTwoSidesOptimalV2 contract");
    const StrategyAddTwoSidesOptimal = (await ethers.getContractFactory(
      'PancakeswapV2StrategyAddTwoSidesOptimal',
      (await ethers.getSigners())[0]
    )) as PancakeswapV2StrategyAddTwoSidesOptimal__factory;
    const strategyAddTwoSidesOptimal = await upgrades.deployProxy(
      StrategyAddTwoSidesOptimal,[NEW_PARAMS[i].ROUTER, NEW_PARAMS[i].VAULT_ADDR]
    );
    await strategyAddTwoSidesOptimal.deployed();
    console.log(`>> Deployed at ${strategyAddTwoSidesOptimal.address}`);
  }
};

export default func;
func.tags = ['VaultStrategiesV2'];