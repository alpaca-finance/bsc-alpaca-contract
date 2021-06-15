import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import {
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm,
  PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm__factory } from '../typechain';

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
    // USDT Vault
    VAULT_ADDR: '0xb5913CD4C508f07025678CeF939BcC54D3024C39',
    ROUTER: '0x367633909278A3C91f4cB130D8e56382F00D1071',
    WHITELIST_WORKERS: []
  }, {
    // BTCB Vault
    VAULT_ADDR: '0xB8Eca31D1862B6330E376fA795609056c7421EB0',
    ROUTER: '0x367633909278A3C91f4cB130D8e56382F00D1071',
    WHITELIST_WORKERS: []
  }]








  for(let i = 0; i < NEW_PARAMS.length; i++ ) {
    console.log(">> Deploying an upgradable RestrictedSingleAssetStrategyAddTwoSidesOptimalV2 contract");
    const PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm = (await ethers.getContractFactory(
      'PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm',
      (await ethers.getSigners())[0]
    )) as PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm__factory;

    const singleAssetStrategyRestrictedAddBaseWithFarm = await upgrades.deployProxy(
      PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm,[NEW_PARAMS[i].ROUTER, NEW_PARAMS[i].VAULT_ADDR]
    ) as PancakeswapV2RestrictedSingleAssetStrategyAddBaseWithFarm;
    
    await singleAssetStrategyRestrictedAddBaseWithFarm.deployed();
    console.log(`>> Deployed at ${singleAssetStrategyRestrictedAddBaseWithFarm.address}`);
    
    if(NEW_PARAMS[i].WHITELIST_WORKERS.length > 0) {
      console.log(">> Whitelisting Workers")
      const tx = await singleAssetStrategyRestrictedAddBaseWithFarm.setWorkersOk(NEW_PARAMS[i].WHITELIST_WORKERS, true)
      console.log(">> Done at: ", tx.hash)
    }
  }
};

export default func;
func.tags = ['RestrictedSingleAssetVaultStrategiesV2'];