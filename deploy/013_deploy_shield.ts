import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { Shield__factory, Timelock__factory } from '../typechain';

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

  const TIMELOCK = '0x2D5408f2287BF9F9B05404794459a846651D0a59'; // Timelock address
  const FAIRLAUNCHV1 = '0xA625AB01B08ce023B2a342Dbb12a16f2C8489A8F'; // FairLaunchV1 address
  const TIMELOCK_TRANSFEROWNERSHIP_ETA = '1617102000'; // exact eta where ownership's FLV1 need to be transferred to Shield












  console.log(">> Deploying Sheild contract");
  const Shield = (await ethers.getContractFactory(
    "Shield",
    (await ethers.getSigners())[0])) as Shield__factory;
  const shield = await Shield.deploy(
    TIMELOCK,
    FAIRLAUNCHV1,
  );
  await shield.deployed();
  console.log(`>> Deployed at ${shield.address}`);
  console.log("✅ Done");

  const timelock = Timelock__factory.connect(TIMELOCK, (await ethers.getSigners())[0]);

  console.log(">> Timelock: TransferOwnership of FLV1 from Timelock to Shield");
  await timelock.queueTransaction(
    FAIRLAUNCHV1, '0',
    'transferOwnership(address)',
    ethers.utils.defaultAbiCoder.encode(
      ['address'], [shield.address]
    ), TIMELOCK_TRANSFEROWNERSHIP_ETA
  );
  console.log("✅ Done");

  console.log("generate timelock.executeTransaction:")
  console.log(`await timelock.executeTransaction('${FAIRLAUNCHV1}', '0', 'transferOwnership(address)', ethers.utils.defaultAbiCoder.encode(['address'],['${shield.address}']), ${TIMELOCK_TRANSFEROWNERSHIP_ETA})`)
  console.log("✅ Done");
};

export default func;
func.tags = ['Shield'];