import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import {
  PancakeswapV2RestrictedCakeMaxiStrategyAddBaseWithFarm,
  PancakeswapV2RestrictedCakeMaxiStrategyAddBaseWithFarm__factory } from '../typechain';

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
    ]
  }, {
    VAULT_ADDR: '0x7C9e73d4C71dae564d41F78d56439bB4ba87592f', // busd
    ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    WHITELIST_WORKER: [
    ]
  }, {
    VAULT_ADDR: '0xbfF4a34A4644a113E8200D7F1D79b3555f723AfE', // eth
    ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    WHITELIST_WORKER: [
    ]
  },{
    VAULT_ADDR: '0xf1bE8ecC990cBcb90e166b71E368299f0116d421', // ALPACA
    ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    WHITELIST_WORKER: [  ]
  }]








  for(let i = 0; i < NEW_PARAMS.length; i++ ) {
    console.log(">> Deploying an upgradable RestrictedCakeMaxiStrategyAddTwoSidesOptimalV2 contract");
    const PancakeswapV2RestrictedCakeMaxiStrategyAddBaseWithFarm = (await ethers.getContractFactory(
      'PancakeswapV2RestrictedCakeMaxiStrategyAddBaseWithFarm',
      (await ethers.getSigners())[0]
    )) as PancakeswapV2RestrictedCakeMaxiStrategyAddBaseWithFarm__factory;

    const cakeMaxiStrategyRestrictedAddBaseWithFarm = await upgrades.deployProxy(
      PancakeswapV2RestrictedCakeMaxiStrategyAddBaseWithFarm,[NEW_PARAMS[i].ROUTER, NEW_PARAMS[i].VAULT_ADDR]
    ) as PancakeswapV2RestrictedCakeMaxiStrategyAddBaseWithFarm;
    
    await cakeMaxiStrategyRestrictedAddBaseWithFarm.deployed();
    console.log(`>> Deployed at ${cakeMaxiStrategyRestrictedAddBaseWithFarm.address}`);

    console.log(">> Whitelisting Workers")
    const tx = await cakeMaxiStrategyRestrictedAddBaseWithFarm.setWorkersOk(NEW_PARAMS[i].WHITELIST_WORKER, true)
    console.log(">> Done at: ", tx.hash)
  }
};

export default func;
func.tags = ['RestrictedCakeMaxiVaultStrategiesV2'];