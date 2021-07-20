import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { Timelock__factory, GrazingRange__factory } from '../../../../typechain'

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
  const PROXY_ADMIN = '0x2c6c09b46d00A88161B7e4AcFaFEc58990548aC2';
  const NEW_IMPL = '';
  const GRAZING_RANGE = '0x9Ff38741EB7594aCE7DD8bb8107Da38aEE7005D6';

  const TIMELOCK = '0xb3c3aE82358DF7fC0bd98629D5ed91767e45c337';
  const EXACT_ETA = '1619701680';









  const timelock = Timelock__factory.connect(TIMELOCK, (await ethers.getSigners())[0]);

  let newImpl = NEW_IMPL;
  console.log(`>> Upgrading Grazing Range at ${GRAZING_RANGE} through Timelock + ProxyAdmin`);
  if (newImpl === '') {
    console.log('>> NEW_IMPL is not set. Prepare upgrade a new IMPL automatically.');
    const newGrazingRange = (await ethers.getContractFactory('GrazingRange')) as GrazingRange__factory;
    const preparedNewGrazingRange = await upgrades.prepareUpgrade(GRAZING_RANGE, newGrazingRange)
    newImpl = preparedNewGrazingRange;
    console.log(`>> New implementation deployed at: ${preparedNewGrazingRange}`);
    console.log("✅ Done");
  }

  console.log(`>> Queue tx on Timelock to upgrade the implementation`);
  await timelock.queueTransaction(PROXY_ADMIN, '0', 'upgrade(address,address)', ethers.utils.defaultAbiCoder.encode(['address','address'], [GRAZING_RANGE, newImpl]), EXACT_ETA);
  console.log("✅ Done");

  console.log(`>> Generate executeTransaction:`);
  console.log(`await timelock.executeTransaction('${PROXY_ADMIN}', '0', 'upgrade(address,address)', ethers.utils.defaultAbiCoder.encode(['address','address'], ['${GRAZING_RANGE}','${newImpl}']), ${EXACT_ETA})`);
  console.log("✅ Done");
};

export default func;
func.tags = ['TimelockUpgradeGrazingRange'];