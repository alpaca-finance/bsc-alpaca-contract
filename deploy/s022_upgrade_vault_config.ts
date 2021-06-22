import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades, network } from 'hardhat';
import { ConfigurableInterestVaultConfig__factory, Timelock__factory } from '../typechain'
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
  const NEW_IMPL = '0xA3462163973FD13aB43F9262AB9f20d03b569DB3';
  const TARGETED_VAULT_CONFIG = ['ibALPACA', 'ibUSDT', 'ibBTCB'];
  const EXACT_ETA = '1624333500';







  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig

  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);
  const toBeUpgradedVaults = TARGETED_VAULT_CONFIG.map((tv) => {
    const vault = config.Vaults.find((v) => tv == v.symbol)
    if(vault === undefined) {
      throw `error: not found vault with ${tv} symbol`
    }
    if(vault.config === "") {
      throw `error: not found config address`
    }

    return vault
  })



  let newImpl = NEW_IMPL;
  console.log(`>> Prepare upgrade vault config through Timelock + ProxyAdmin`);
  if (newImpl === '') {
    console.log('>> NEW_IMPL is not set. Prepare upgrade a new IMPL automatically.');
    const NewVaultConfig = (await ethers.getContractFactory('ConfigurableInterestVaultConfig')) as ConfigurableInterestVaultConfig__factory;
    const preparedNewVaultConfig = await upgrades.prepareUpgrade(toBeUpgradedVaults[0].config, NewVaultConfig)
    newImpl = preparedNewVaultConfig;
    console.log(`>> New implementation deployed at: ${preparedNewVaultConfig}`);
    console.log("✅ Done");
  }

  for(const toBeUpgradedVault of toBeUpgradedVaults) {
    console.log(`>> Queue tx on Timelock to upgrade the implementation`);
    await timelock.queueTransaction(config.ProxyAdmin, '0', 'upgrade(address,address)', ethers.utils.defaultAbiCoder.encode(['address','address'], [toBeUpgradedVault.config, newImpl]), EXACT_ETA, { gasPrice: 100000000000 });
    console.log("✅ Done");

    console.log(`>> Generate executeTransaction:`);
    console.log(`await timelock.executeTransaction('${config.ProxyAdmin}', '0', 'upgrade(address,address)', ethers.utils.defaultAbiCoder.encode(['address','address'], ['${toBeUpgradedVault.config}','${newImpl}']), ${EXACT_ETA})`);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['UpgradeVaultConfig'];