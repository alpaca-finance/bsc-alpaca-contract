import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import {  Ownable, Ownable__factory } from '../typechain'
import { ethers, upgrades } from 'hardhat';

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

  const TIMELOCK_ADDRESS = '0x2D5408f2287BF9F9B05404794459a846651D0a59';
  const TO_BE_LOCKED = [
    '0x06d0c5B027C8e1BFce561B8af34B87A2A3Ff005d',
    '0x6ad3A0d891C59677fbbB22E071613253467C382A',
    '0x3713EF00842713B1681d6532dbf72ce5B91B84cc'
  ];











  for(let i = 0; i < TO_BE_LOCKED.length; i++ ) {
    console.log(`>> Transferring ownership of ${TO_BE_LOCKED[i]} to TIMELOCK`);
    const ownable = Ownable__factory.connect(TO_BE_LOCKED[i], (await ethers.getSigners())[0]);
    await ownable.transferOwnership(TIMELOCK_ADDRESS);
    console.log("✅ Done")
  }
};

export default func;
func.tags = ['TransferOwnershipToTimeLock'];