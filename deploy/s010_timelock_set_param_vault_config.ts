import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, network } from 'hardhat';
import { Timelock__factory } from '../typechain'
import MainnetConfig from '../.mainnet.json'
import TestnetConfig from '../.testnet.json'

interface IInput {
  VAULT_SYMBOL: string
  MIN_DEBT_SIZE: string
  RESERVE_POOL_BPS: string
  KILL_PRIZE_BPS: string
  INTEREST_MODEL: string
  EXACT_ETA: string
}

interface IInfo extends IInput {
  VAULT_CONFIG: string
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

  const NEW_PARAMS: Array<IInput> = [{
    VAULT_SYMBOL: 'ibWBNB',
    MIN_DEBT_SIZE: '0.2',
    RESERVE_POOL_BPS: '1000',
    KILL_PRIZE_BPS: '500',
    INTEREST_MODEL: '0x111ae8da53D0998260DfdfA2172d4f88f969d386',
    EXACT_ETA: '1626063180',
  }, {
    VAULT_SYMBOL: 'ibBUSD',
    MIN_DEBT_SIZE: '100',
    RESERVE_POOL_BPS: '1000',
    KILL_PRIZE_BPS: '500',
    INTEREST_MODEL: '0x111ae8da53D0998260DfdfA2172d4f88f969d386',
    EXACT_ETA: '1626063180',
  }, {
    VAULT_SYMBOL: 'ibETH',
    MIN_DEBT_SIZE: '0.04',
    RESERVE_POOL_BPS: '1000',
    KILL_PRIZE_BPS: '500',
    INTEREST_MODEL: '0x111ae8da53D0998260DfdfA2172d4f88f969d386',
    EXACT_ETA: '1626063180'
  }, {
    VAULT_SYMBOL: 'ibALPACA',
    MIN_DEBT_SIZE: '50',
    RESERVE_POOL_BPS: '1000',
    KILL_PRIZE_BPS: '500',
    INTEREST_MODEL: '0x111ae8da53D0998260DfdfA2172d4f88f969d386',
    EXACT_ETA: '1626063180'
  }, {
    VAULT_SYMBOL: 'ibUSDT',
    MIN_DEBT_SIZE: '100',
    RESERVE_POOL_BPS: '1000',
    KILL_PRIZE_BPS: '500',
    INTEREST_MODEL: '0x111ae8da53D0998260DfdfA2172d4f88f969d386',
    EXACT_ETA: '1626063180'
  }, {
    VAULT_SYMBOL: 'ibBTCB',
    MIN_DEBT_SIZE: '0.002',
    RESERVE_POOL_BPS: '1000',
    KILL_PRIZE_BPS: '500',
    INTEREST_MODEL: '0x111ae8da53D0998260DfdfA2172d4f88f969d386',
    EXACT_ETA: '1626063180'
  }]








  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig
  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);

  /// @dev derived input
  const infos: Array<IInfo> = NEW_PARAMS.map((n) => {
    const vault = config.Vaults.find((v) => v.symbol === n.VAULT_SYMBOL)
    if(vault === undefined) throw new Error(`error: unable to map ${n.VAULT_SYMBOL} to any vault`)

    return {
      VAULT_SYMBOL: n.VAULT_SYMBOL,
      VAULT_CONFIG: vault.config,
      MIN_DEBT_SIZE: n.MIN_DEBT_SIZE,
      RESERVE_POOL_BPS: n.RESERVE_POOL_BPS,
      KILL_PRIZE_BPS: n.KILL_PRIZE_BPS,
      INTEREST_MODEL: n.INTEREST_MODEL,
      EXACT_ETA: n.EXACT_ETA
    }
  })

  for(const info of infos) {
    console.log("===================================================================================")
    console.log(`>> Queuing transaction to update ${info.VAULT_SYMBOL} Vault config`);
    // function setParams(
    //   uint256 _minDebtSize,
    //   uint256 _reservePoolBps,
    //   uint256 _killBps,
    //   InterestModel _interestModel,
    //   address _wrappedNative,
    //   address _wNativeRelayer,
    //   address _fairLaunch
    // )
    await timelock.queueTransaction(
      info.VAULT_CONFIG, '0',
      'setParams(uint256,uint256,uint256,address,address,address,address)',
      ethers.utils.defaultAbiCoder.encode(
        ['uint256','uint256','uint256','address','address','address','address'],
        [ethers.utils.parseEther(info.MIN_DEBT_SIZE), info.RESERVE_POOL_BPS, info.KILL_PRIZE_BPS, info.INTEREST_MODEL, config.Tokens.WBNB, config.SharedConfig.WNativeRelayer, config.FairLaunch.address]), info.EXACT_ETA)
    console.log("✅ Done")
    console.log("timelock execution:");
    console.log(`await timelock.executeTransaction('${info.VAULT_CONFIG}', '0', 'setParams(uint256,uint256,uint256,address,address,address,address)', ethers.utils.defaultAbiCoder.encode(['uint256','uint256','uint256','address','address','address','address'],['${ethers.utils.parseEther(info.MIN_DEBT_SIZE)}', '${info.RESERVE_POOL_BPS}', '${info.KILL_PRIZE_BPS}', '${info.INTEREST_MODEL}', '${config.Tokens.WBNB}', '${config.SharedConfig.WNativeRelayer}', '${config.FairLaunch.address}']), ${info.EXACT_ETA})`);
  }
};

export default func;
func.tags = ['TimelockSetParamsVaultConfig'];