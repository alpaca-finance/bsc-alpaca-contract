import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { Timelock__factory, Vault, Vault__factory } from '../typechain'

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
  const NEW_IMPL = '0x7EEAA96bf1aBaA206615046c0991E678a2b12Da1';
  const TO_BE_UPGRADE_VAULT = '0x7C9e73d4C71dae564d41F78d56439bB4ba87592f';

  const TIMELOCK = '0x2D5408f2287BF9F9B05404794459a846651D0a59';
  const EXACT_ETA = '1616574600';

  const NEW_DEBT_TOKEN = '0x02dA7035beD00ae645516bDb0c282A7fD4AA7442';
  const DEBT_PID = '7';









  const timelock = Timelock__factory.connect(TIMELOCK, (await ethers.getSigners())[0]);

  let newImpl = NEW_IMPL;
  console.log(`>> Upgrading Vault at ${TO_BE_UPGRADE_VAULT} through Timelock + ProxyAdmin`);
  if (newImpl === '') {
    console.log('>> NEW_IMPL is not set. Prepare upgrade a new IMPL automatically.');
    const NewVaultFactory = (await ethers.getContractFactory('Vault')) as Vault__factory;
    const preparedNewVault = await upgrades.prepareUpgrade(TO_BE_UPGRADE_VAULT, NewVaultFactory)
    newImpl = preparedNewVault;
    console.log(`>> New implementation deployed at: ${preparedNewVault}`);
    console.log("✅ Done");
  }

  console.log(`>> Queue tx on Timelock to upgrade the implementation`);
  await timelock.queueTransaction(PROXY_ADMIN, '0', 'upgrade(address,address)', ethers.utils.defaultAbiCoder.encode(['address','address'], [TO_BE_UPGRADE_VAULT, newImpl]), EXACT_ETA);
  console.log("✅ Done");

  console.log(`>> Generate executeTransaction:`);
  console.log(`await timelock.executeTransaction('${PROXY_ADMIN}', '0', 'upgrade(address,address)', ethers.utils.defaultAbiCoder.encode(['address','address'], ['${TO_BE_UPGRADE_VAULT}','${newImpl}']), ${EXACT_ETA})`);
  console.log("✅ Done");

  let newDebtToken = NEW_DEBT_TOKEN
  if (newDebtToken !== '') {
    console.log(`>> Queue tx on Timelock to updateDebtToken on the Vault`);
    await timelock.queueTransaction(TO_BE_UPGRADE_VAULT, '0', 'updateDebtToken(address,uint256)', ethers.utils.defaultAbiCoder.encode(['address','uint256'], [NEW_DEBT_TOKEN, DEBT_PID]), EXACT_ETA);
    console.log("✅ Done");

    console.log(`>> Generate executeTransaction:`);
    console.log(`await timelock.executeTransaction('${TO_BE_UPGRADE_VAULT}', '0', 'updateDebtToken(address,uint256)', ethers.utils.defaultAbiCoder.encode(['address','uint256'], ['${NEW_DEBT_TOKEN}', ${DEBT_PID}]), ${EXACT_ETA})`);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['UpgradeVault'];