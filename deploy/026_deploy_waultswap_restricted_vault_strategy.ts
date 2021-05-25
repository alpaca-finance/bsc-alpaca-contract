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
    VAULT_ADDR: '0x...',
    ROUTER: '0x...',
    WHITELIST_WORKER: [
      "0x...",
      "0x..."
    ]
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

    console.log(">> Whitelisting Workers")
    const tx = await strategyRestrictedAddTwoSidesOptimal.setWorkersOk(NEW_PARAMS[i].WHITELIST_WORKER, true)
    console.log(">> Done at: ", tx.hash)
  }
};

export default func;
func.tags = ['WaultSwapRestrictedVaultStrategies'];