import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, network } from 'hardhat';
import { Timelock__factory } from '../../../../typechain'
import MainnetConfig from '../../../../.mainnet.json'
import TestnetConfig from '../../../../.testnet.json'

interface IInput {
  VAULT_SYMBOL: string
  MIN_DEBT_SIZE: string
  RESERVE_POOL_BPS: string
  KILL_PRIZE_BPS: string
  INTEREST_MODEL: string
  EXACT_ETA: string
  TREASURY_KILL_BPS: string
  TREASURY_ADDR: string
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
    VAULT_SYMBOL: 'ibTUSD',
    MIN_DEBT_SIZE: '100',
    RESERVE_POOL_BPS: '1000',
    KILL_PRIZE_BPS: '500',
    INTEREST_MODEL: '0xADcfBf2e8470493060FbE0A0aFAC66d2cB028e9c',
    TREASURY_KILL_BPS: '0',
    TREASURY_ADDR: '0x0FfA891ab6f410bbd7403b709e7d38D7a812125B',
    EXACT_ETA: '1626423300',
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
      TREASURY_ADDR: n.TREASURY_ADDR,
      TREASURY_KILL_BPS: n.TREASURY_KILL_BPS,
      EXACT_ETA: n.EXACT_ETA
    }
  })

  for(const info of infos) {
    console.log("===================================================================================")
    console.log(`>> Queuing transaction to update ${info.VAULT_SYMBOL} Vault config`);
    // function setParams(
      // uint256 _minDebtSize,
      // uint256 _reservePoolBps,
      // uint256 _killBps,
      // InterestModel _interestModel,
      // address _getWrappedNativeAddr,
      // address _getWNativeRelayer,
      // address _getFairLaunchAddr,
      // uint256 _getKillTreasuryBps,
      // address _treasury
    // )
    await timelock.queueTransaction(
      info.VAULT_CONFIG, '0',
      'setParams(uint256,uint256,uint256,address,address,address,address,uint256,address)',
      ethers.utils.defaultAbiCoder.encode(
        ['uint256','uint256','uint256','address','address','address','address','uint256','address'],
        [ethers.utils.parseEther(info.MIN_DEBT_SIZE), info.RESERVE_POOL_BPS, info.KILL_PRIZE_BPS, info.INTEREST_MODEL, config.Tokens.WBNB, config.SharedConfig.WNativeRelayer, config.FairLaunch.address, info.TREASURY_KILL_BPS, info.TREASURY_ADDR]), info.EXACT_ETA)
    console.log("✅ Done")
    console.log("timelock execution:");
    console.log(`await timelock.executeTransaction('${info.VAULT_CONFIG}', '0', 'setParams(uint256,uint256,uint256,address,address,address,address,uint256,address)', ethers.utils.defaultAbiCoder.encode(['uint256','uint256','uint256','address','address','address','address','uint256','address'],['${ethers.utils.parseEther(info.MIN_DEBT_SIZE)}', '${info.RESERVE_POOL_BPS}', '${info.KILL_PRIZE_BPS}', '${info.INTEREST_MODEL}', '${config.Tokens.WBNB}', '${config.SharedConfig.WNativeRelayer}', '${config.FairLaunch.address}', '${info.TREASURY_KILL_BPS}', '${info.TREASURY_ADDR}']), ${info.EXACT_ETA})`);
  }
};

export default func;
func.tags = ['TimelockSetParamsVaultConfig'];