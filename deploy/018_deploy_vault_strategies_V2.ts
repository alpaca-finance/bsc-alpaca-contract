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
    VAULT_ADDR: '0xd7D069493685A581d27824Fc46EdA46B7EfC0063',
    ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E'
  }, {
    VAULT_ADDR: '0x7C9e73d4C71dae564d41F78d56439bB4ba87592f',
    ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E'
  }, {
    VAULT_ADDR: '0xbfF4a34A4644a113E8200D7F1D79b3555f723AfE',
    ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E'
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