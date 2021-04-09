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

  const NEW_PARAMS = [{
    VAULT_NAME: 'BNB',
    VAULT_CONFIG: '0x53dbb71303ad0F9AFa184B8f7147F9f12Bb5Dc01',
    MIN_DEBT_SIZE: ethers.utils.parseEther('2'),
    RESERVE_POOL_BPS: '1000',
    KILL_PRIZE_BPS: '500',
    INTEREST_MODEL: '0x375D32FadA30d7e6Fea242FCa221a22CC6d52B30',
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    WNATIVE_RELAYER: '0xE1D2CA01bc88F325fF7266DD2165944f3CAf0D3D',
    FAIRLAUNCH: '0xA625AB01B08ce023B2a342Dbb12a16f2C8489A8F',
    TIMELOCK: '0x2D5408f2287BF9F9B05404794459a846651D0a59',
    EXACT_ETA: '1617926400',
  }, {
    VAULT_NAME: 'BUSD',
    VAULT_CONFIG: '0xd7b805E88c5F52EDE71a9b93F7048c8d632DBEd4',
    MIN_DEBT_SIZE: ethers.utils.parseEther('400'),
    RESERVE_POOL_BPS: '1000',
    KILL_PRIZE_BPS: '500',
    INTEREST_MODEL: '0x375D32FadA30d7e6Fea242FCa221a22CC6d52B30',
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    WNATIVE_RELAYER: '0xE1D2CA01bc88F325fF7266DD2165944f3CAf0D3D',
    FAIRLAUNCH: '0xA625AB01B08ce023B2a342Dbb12a16f2C8489A8F',
    TIMELOCK: '0x2D5408f2287BF9F9B05404794459a846651D0a59',
    EXACT_ETA: '1617926400',
  }]










  for(let i = 0; i < NEW_PARAMS.length; i++) {
    const timelock = Timelock__factory.connect(NEW_PARAMS[i].TIMELOCK, (await ethers.getSigners())[0]);
    console.log("===================================================================================")
    console.log(`>> Queuing transaction to update ${NEW_PARAMS[i].VAULT_NAME} Vault config`);
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
      NEW_PARAMS[i].VAULT_CONFIG, '0',
      'setParams(uint256,uint256,uint256,address,address,address,address)',
      ethers.utils.defaultAbiCoder.encode(
        ['uint256','uint256','uint256','address','address','address','address'],
        [NEW_PARAMS[i].MIN_DEBT_SIZE, NEW_PARAMS[i].RESERVE_POOL_BPS, NEW_PARAMS[i].KILL_PRIZE_BPS, NEW_PARAMS[i].INTEREST_MODEL, NEW_PARAMS[i].WBNB, NEW_PARAMS[i].WNATIVE_RELAYER, NEW_PARAMS[i].FAIRLAUNCH]), NEW_PARAMS[i].EXACT_ETA)
    console.log("✅ Done")
    console.log("timelock execution:");
    console.log(`await timelock.executeTransaction('${NEW_PARAMS[i].VAULT_CONFIG}', '0', 'setParams(uint256,uint256,uint256,address,address,address,address)', ethers.utils.defaultAbiCoder.encode(['uint256','uint256','uint256','address','address','address','address'],['${NEW_PARAMS[i].MIN_DEBT_SIZE}', '${NEW_PARAMS[i].RESERVE_POOL_BPS}', '${NEW_PARAMS[i].KILL_PRIZE_BPS}', '${NEW_PARAMS[i].INTEREST_MODEL}', '${NEW_PARAMS[i].WBNB}', '${NEW_PARAMS[i].WNATIVE_RELAYER}', '${NEW_PARAMS[i].FAIRLAUNCH}']), ${NEW_PARAMS[i].EXACT_ETA})`);
  }
};

export default func;
func.tags = ['TimelockSetParamsVaultConfig'];