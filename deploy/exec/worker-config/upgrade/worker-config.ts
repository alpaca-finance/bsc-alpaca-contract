import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { Timelock__factory, PancakeswapV2Worker, PancakeswapV2Worker__factory, PancakeswapV2WorkerMigrate, PancakeswapV2WorkerMigrate__factory, WorkerConfig__factory } from '../../../../typechain'

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
  // PROXY_ADMIN
  // Testnet: 0x2c6c09b46d00A88161B7e4AcFaFEc58990548aC2
  // Mainnet: 0x5379F32C8D5F663EACb61eeF63F722950294f452
  const PROXY_ADMIN = '0x5379F32C8D5F663EACb61eeF63F722950294f452';
  const NEW_IMPL = '';
  const TO_BE_UPGRADE_WORKER_CONFIG = '0xADaBC5FC5da42c85A84e66096460C769a151A8F8';

  const TIMELOCK = '0x2D5408f2287BF9F9B05404794459a846651D0a59';
  const EXACT_ETA = '1622885400';









  const timelock = Timelock__factory.connect(TIMELOCK, (await ethers.getSigners())[0]);

  let newImpl = NEW_IMPL;
  console.log(`>> Upgrading Worker at ${TO_BE_UPGRADE_WORKER_CONFIG} through Timelock + ProxyAdmin`);
  if (newImpl === '') {
    console.log('>> NEW_IMPL is not set. Prepare upgrade a new IMPL automatically.');
    const NewWorkerConfig = (await ethers.getContractFactory('WorkerConfig')) as WorkerConfig__factory;
    const preparedNewWorkerConfig = await upgrades.prepareUpgrade(TO_BE_UPGRADE_WORKER_CONFIG, NewWorkerConfig)
    newImpl = preparedNewWorkerConfig;
    console.log(`>> New implementation deployed at: ${preparedNewWorkerConfig}`);
    console.log("✅ Done");
  }

  console.log(`>> Queue tx on Timelock to upgrade the implementation`);
  await timelock.queueTransaction(PROXY_ADMIN, '0', 'upgrade(address,address)', ethers.utils.defaultAbiCoder.encode(['address','address'], [TO_BE_UPGRADE_WORKER_CONFIG, newImpl]), EXACT_ETA, { gasPrice: 100000000000 });
  console.log("✅ Done");

  console.log(`>> Generate executeTransaction:`);
  console.log(`await timelock.executeTransaction('${PROXY_ADMIN}', '0', 'upgrade(address,address)', ethers.utils.defaultAbiCoder.encode(['address','address'], ['${TO_BE_UPGRADE_WORKER_CONFIG}','${newImpl}']), ${EXACT_ETA})`);
  console.log("✅ Done");
};

export default func;
func.tags = ['UpgradeWorkerConfig'];