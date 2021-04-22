import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { PancakeswapV2StrategyAddTwoSidesOptimal__factory } from '../typechain';

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
    VAULT_ADDR: '0x7C9e73d4C71dae564d41F78d56439bB4ba87592f',
    ROUTER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56'
  }, {
    VAULT_ADDR: '0xbfF4a34A4644a113E8200D7F1D79b3555f723AfE',
    ROUTER: '0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56'
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