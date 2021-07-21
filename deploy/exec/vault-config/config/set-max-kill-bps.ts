import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, network } from 'hardhat';
import { Timelock__factory } from '../../../../typechain'
import MainnetConfig from '../../../../.mainnet.json'
import TestnetConfig from '../../../../.testnet.json'

interface IInput {
  configAddress: string
  maxKillBps: string
}

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
  const TARGETED_VAULT_CONFIG = [{
    VAULT_SYMBOL: 'ibWBNB',
    MAX_KILL_BPS: '500'
  }, {
    VAULT_SYMBOL: 'ibBUSD',
    MAX_KILL_BPS: '500'
  }, {
    VAULT_SYMBOL: 'ibETH',
    MAX_KILL_BPS: '500'
  }, {
    VAULT_SYMBOL: 'ibALPACA',
    MAX_KILL_BPS: '500'
  }, {
    VAULT_SYMBOL: 'ibUSDT',
    MAX_KILL_BPS: '500'
  }, {
    VAULT_SYMBOL: 'ibBTCB',
    MAX_KILL_BPS: '500'
  }, {
    VAULT_SYMBOL: 'ibTUSD',
    MAX_KILL_BPS: '500'
  }];
  const EXACT_ETA = '1626321600';







  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig

  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);
  const inputs: Array<IInput> = TARGETED_VAULT_CONFIG.map((tv) => {
    const vault = config.Vaults.find((v) => tv.VAULT_SYMBOL == v.symbol)
    if(vault === undefined) {
      throw `error: not found vault with ${tv} symbol`
    }
    if(vault.config === "") {
      throw `error: not found config address`
    }

    return {
      configAddress: vault.config,
      maxKillBps: tv.MAX_KILL_BPS
    }
  })

  for(const i of inputs) {
    console.log(`>> Queue tx on Timelock to upgrade the implementation`);
    await timelock.queueTransaction(i.configAddress, '0', 'setMaxKillBps(uint256)', ethers.utils.defaultAbiCoder.encode(['uint256'], [i.maxKillBps]), EXACT_ETA);
    console.log("✅ Done");

    console.log(`>> Generate executeTransaction:`);
    console.log(`await timelock.executeTransaction('${i.configAddress}', '0', 'setMaxKillBps(uint256)', ethers.utils.defaultAbiCoder.encode(['uint256'], ['${i.maxKillBps}']), ${EXACT_ETA})`);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['SetMaxKillBps'];