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
    '0x436F523d778dAa6a32DAf64CdEdDC55c35509949',
    '0xf4Aa9C8ABb2aaa4Ae0A6cC7b0cA8752073ac3b86'
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