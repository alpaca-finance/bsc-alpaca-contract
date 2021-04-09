import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { IWorker__factory, IStrategy__factory, Timelock__factory } from '../typechain'

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

  const PROXY_ADDRESSES = [
    '0x166f56F2EDa9817cAB77118AE4FCAA0002A17eC7',
    '0xADaBC5FC5da42c85A84e66096460C769a151A8F8',
    '0x53dbb71303ad0F9AFa184B8f7147F9f12Bb5Dc01',
    '0xd7D069493685A581d27824Fc46EdA46B7EfC0063',
    '0xd7b805E88c5F52EDE71a9b93F7048c8d632DBEd4',
    '0x7C9e73d4C71dae564d41F78d56439bB4ba87592f'
  ];
  // PROXY_ADMIN
  // Testnet: 0x2c6c09b46d00A88161B7e4AcFaFEc58990548aC2
  // Mainnet: 0x5379F32C8D5F663EACb61eeF63F722950294f452
  const PROXY_ADMIN = '0x5379F32C8D5F663EACb61eeF63F722950294f452';
  
  const TIMELOCK = '0x2D5408f2287BF9F9B05404794459a846651D0a59';
  const EXACT_ETA = '1615789200';











  const timelock = Timelock__factory.connect(TIMELOCK, (await ethers.getSigners())[0]);
  console.log(">> Queuing transaction to change admin to Master ProxyAdmin Contract");
  for(let i = 0; i < PROXY_ADDRESSES.length; i++ ) {
    console.log(`>> Changing admin of ${PROXY_ADDRESSES[i]} to ProxyAdmin`);
    await timelock.queueTransaction(
      PROXY_ADDRESSES[i], '0',
      'changeAdmin(address)',
      ethers.utils.defaultAbiCoder.encode(['address'], [PROXY_ADMIN]), EXACT_ETA)
    console.log("✅ Done")
    console.log("timelock execution");
    console.log(`await timelock.executeTransaction('${PROXY_ADDRESSES[i]}', '0', 'changeAdmin(address)', ethers.utils.defaultAbiCoder.encode(['address'],['${PROXY_ADMIN}']), ${EXACT_ETA})`);
  }
};

export default func;
func.tags = ['TimelockChangeAdminProxy'];