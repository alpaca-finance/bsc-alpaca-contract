import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ConfigurableInterestVaultConfig__factory } from '../typechain'
import { ethers } from 'hardhat';

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

  const CONFIG_ADDRESS = '';
  const FAIR_LAUNCH_ADDR = '';
  const MIN_DEBT_SIZE = ethers.utils.parseEther('1');
  const RESERVE_POOL_BPS = '1000'
  const KILL_PRIZE_BPS = '1000'
  const INTEREST_MODEL = '0xDa76598183f11c5a8a3D8EF7A065BFC2Dc009a0D';
  const WNATV_ADDR = '0xd419CEfb9471475B1a27aC3bA46233563180F17B';
  const WNATV_RELAYER = ''



  const interestVaultConfig = ConfigurableInterestVaultConfig__factory.connect(
    CONFIG_ADDRESS, (await ethers.getSigners())[0]);

  console.log(">> Setting params");

  await interestVaultConfig.setParams(
    MIN_DEBT_SIZE,
    RESERVE_POOL_BPS,
    KILL_PRIZE_BPS,
    INTEREST_MODEL,
    WNATV_ADDR,
    WNATV_RELAYER,
    FAIR_LAUNCH_ADDR, { gasLimit: '300000' }
  )
  console.log("✅ Done");
};

export default func;
func.tags = ['SetParamsVaultConfig'];