import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import {
  GrazingRange,
  GrazingRange__factory,
} from "../typechain";

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

  const REWARD_HOLDER = '0x212C2a2891227f39B48D655C5ecA0b1377daFF90'




  console.log('>> Deploying an upgradable GrazingRange contract');
  const GrazingRange = (await ethers.getContractFactory(
    'GrazingRange',
    (await ethers.getSigners())[0]
  )) as GrazingRange__factory;
  const grazingRange = await upgrades.deployProxy(
    GrazingRange,
    [REWARD_HOLDER]
  ) as GrazingRange;
  await grazingRange.deployed();
  console.log(`>> Deployed at ${grazingRange.address}`);
  console.log("✅ Done")
}

export default func;
func.tags = ['GrazingRange'];