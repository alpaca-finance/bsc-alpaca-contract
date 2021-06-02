import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { ConfigurableInterestVaultConfig__factory } from '../typechain';

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
  const FAIR_LAUNCH_ADDR = '0xA625AB01B08ce023B2a342Dbb12a16f2C8489A8F';
  const MIN_DEBT_SIZE = ethers.utils.parseEther('0.002');
  const RESERVE_POOL_BPS = '1000';
  const KILL_PRIZE_BPS = '500';
  const INTEREST_MODEL = '0x375D32FadA30d7e6Fea242FCa221a22CC6d52B30';
  const WNATV_ADDR = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  const WNATV_RLY_ADDR = '0xE1D2CA01bc88F325fF7266DD2165944f3CAf0D3D';











  console.log(">> Deploying an upgradable configurableInterestVaultConfig contract");
  const ConfigurableInterestVaultConfig = (await ethers.getContractFactory(
    'ConfigurableInterestVaultConfig',
    (await ethers.getSigners())[0]
  )) as ConfigurableInterestVaultConfig__factory;
  const configurableInterestVaultConfig = await upgrades.deployProxy(
    ConfigurableInterestVaultConfig,
    [MIN_DEBT_SIZE, RESERVE_POOL_BPS, KILL_PRIZE_BPS,
    INTEREST_MODEL, WNATV_ADDR, WNATV_RLY_ADDR, FAIR_LAUNCH_ADDR]
  );
  await configurableInterestVaultConfig.deployed();
  console.log(`>> Deployed at ${configurableInterestVaultConfig.address}`);

};

export default func;
func.tags = ['ConfigurableInterestVaultConfig'];