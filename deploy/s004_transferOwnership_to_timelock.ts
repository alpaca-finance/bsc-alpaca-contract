import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import {  Ownable__factory } from '../typechain'
import { ethers, network } from 'hardhat';
import MainnetConfig from '../.mainnet.json'
import TestnetConfig from '../.testnet.json'

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

  const TO_BE_LOCKED = [
    '0x0c1F049ebE3E0537C7E7ce428Bb468d5F6bF83b3',
    '0x3282d2a151ca00BfE7ed17Aa16E42880248CD3Cd'
  ];








  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig

  for(let i = 0; i < TO_BE_LOCKED.length; i++ ) {
    console.log(`>> Transferring ownership of ${TO_BE_LOCKED[i]} to TIMELOCK`);
    const ownable = Ownable__factory.connect(TO_BE_LOCKED[i], (await ethers.getSigners())[0]);
    await ownable.transferOwnership(config.Timelock);
    console.log("✅ Done")
  }
};

export default func;
func.tags = ['TransferOwnershipToTimeLock'];