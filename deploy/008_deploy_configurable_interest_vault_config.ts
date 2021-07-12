import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades, network } from 'hardhat';
import { ConfigurableInterestVaultConfig__factory } from '../typechain';
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
  const MIN_DEBT_SIZE = ethers.utils.parseEther('100');
  const RESERVE_POOL_BPS = '1000';
  const KILL_PRIZE_BPS = '250';
  const TREASURY_KILL_BPS = '250';
  const TREASURY_ADDR = '';









  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig

  console.log(">> Deploying an upgradable configurableInterestVaultConfig contract");
  const ConfigurableInterestVaultConfig = (await ethers.getContractFactory(
    'ConfigurableInterestVaultConfig',
    (await ethers.getSigners())[0]
  )) as ConfigurableInterestVaultConfig__factory;
  const configurableInterestVaultConfig = await upgrades.deployProxy(
    ConfigurableInterestVaultConfig,
    [
      MIN_DEBT_SIZE, 
      RESERVE_POOL_BPS, 
      KILL_PRIZE_BPS,
      config.SharedConfig.TripleSlopeModelStable20Max150, 
      config.Tokens.WBNB, 
      config.SharedConfig.WNativeRelayer, 
      config.FairLaunch.address,
      TREASURY_KILL_BPS,
      TREASURY_ADDR
    ]
  );
  await configurableInterestVaultConfig.deployed();
  console.log(`>> Deployed at ${configurableInterestVaultConfig.address}`);

};

export default func;
func.tags = ['ConfigurableInterestVaultConfig'];