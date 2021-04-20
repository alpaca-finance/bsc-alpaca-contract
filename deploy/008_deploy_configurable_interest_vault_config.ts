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
  const FAIR_LAUNCH_ADDR = '0xac2fefDaF83285EA016BE3f5f1fb039eb800F43D';
  const MIN_DEBT_SIZE = ethers.utils.parseEther('200');
  const RESERVE_POOL_BPS = '1000';
  const KILL_PRIZE_BPS = '500';
  const INTEREST_MODEL = '0x038cd7a6A397d7f5D07a0c76A4610a7Ca64eb7d3';
  const WNATV_ADDR = '0xDfb1211E2694193df5765d54350e1145FD2404A1';
  const WNATV_RLY_ADDR = '0x7e2284c8CC74F13FA6c218c4231b0786E6204728';











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