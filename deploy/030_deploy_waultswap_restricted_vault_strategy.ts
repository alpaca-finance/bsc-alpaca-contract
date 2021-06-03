import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import {
  WaultSwapRestrictedStrategyAddTwoSidesOptimal,
  WaultSwapRestrictedStrategyAddTwoSidesOptimal__factory } from '../typechain';

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
    // BNB Vault
    VAULT_ADDR: '0xd7D069493685A581d27824Fc46EdA46B7EfC0063',
    ROUTER: '0xD48745E39BbED146eEC15b79cBF964884F9877c2',
    WHITELIST_WORKERS: []
  }, {
    // BUSD Vault
    VAULT_ADDR: '0x7C9e73d4C71dae564d41F78d56439bB4ba87592f',
    ROUTER: '0xD48745E39BbED146eEC15b79cBF964884F9877c2',
    WHITELIST_WORKERS: []
  }, {
    // ETH Vault
    VAULT_ADDR: '0xbfF4a34A4644a113E8200D7F1D79b3555f723AfE',
    ROUTER: '0xD48745E39BbED146eEC15b79cBF964884F9877c2',
    WHITELIST_WORKERS: []
  }, {
    // ALPACA Vault
    VAULT_ADDR: '0xf1bE8ecC990cBcb90e166b71E368299f0116d421',
    ROUTER: '0xD48745E39BbED146eEC15b79cBF964884F9877c2',
    WHITELIST_WORKERS: []
  }, {
    // USDT Vault
    VAULT_ADDR: '0x158Da805682BdC8ee32d52833aD41E74bb951E59',
    ROUTER: '0xD48745E39BbED146eEC15b79cBF964884F9877c2',
    WHITELIST_WORKERS: []
  }, {
    // BTCB Vault
    VAULT_ADDR: '0x08FC9Ba2cAc74742177e0afC3dC8Aed6961c24e7',
    ROUTER: '0xD48745E39BbED146eEC15b79cBF964884F9877c2',
    WHITELIST_WORKERS: []
  }]








  for(let i = 0; i < NEW_PARAMS.length; i++ ) {
    console.log(">> Deploying an upgradable Restricted StrategyAddTwoSidesOptimalV2 contract");
    const StrategyRestrictedAddTwoSidesOptimal = (await ethers.getContractFactory(
      'WaultSwapRestrictedStrategyAddTwoSidesOptimal',
      (await ethers.getSigners())[0]
    )) as WaultSwapRestrictedStrategyAddTwoSidesOptimal__factory;
    const strategyRestrictedAddTwoSidesOptimal = await upgrades.deployProxy(
      StrategyRestrictedAddTwoSidesOptimal,[NEW_PARAMS[i].ROUTER, NEW_PARAMS[i].VAULT_ADDR]
    ) as WaultSwapRestrictedStrategyAddTwoSidesOptimal;
    await strategyRestrictedAddTwoSidesOptimal.deployed();
    console.log(`>> Deployed at ${strategyRestrictedAddTwoSidesOptimal.address}`);
    
    if(NEW_PARAMS[i].WHITELIST_WORKERS.length > 0) {
      console.log(">> Whitelisting Workers")
      const tx = await strategyRestrictedAddTwoSidesOptimal.setWorkersOk(NEW_PARAMS[i].WHITELIST_WORKERS, true)
      console.log(">> Done at: ", tx.hash)
    }
  }
};

export default func;
func.tags = ['WaultSwapRestrictedVaultStrategies'];