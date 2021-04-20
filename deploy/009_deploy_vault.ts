import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { DebtToken, DebtToken__factory, FairLaunch, FairLaunch__factory, Timelock, Timelock__factory, Vault, Vault__factory, WNativeRelayer, WNativeRelayer__factory } from '../typechain';
import { ethers, upgrades } from 'hardhat';

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

  const SHIELD_ADDR = '0x938350DF8BF3bD81Baae368b72132f1Bd14E7C13';
  const FAIR_LAUNCH_ADDR = '0xac2fefDaF83285EA016BE3f5f1fb039eb800F43D';
  const ALLOC_POINT_FOR_DEPOSIT = 0;
  const ALLOC_POINT_FOR_OPEN_POSITION = 0;
  const CONFIG_ADDR = '0x06d0c5B027C8e1BFce561B8af34B87A2A3Ff005d';
  const BASE_TOKEN_ADDR = '0x354b3a11D5Ea2DA89405173977E271F58bE2897D'
  const VAULT_NAME = 'ALPACA VAULT'
  const NAME = 'Interest Bearing ALPACA'
  const SYMBOL = 'ibALPACA';
  const WNATIVE_RELAYER_ADDR = '0x7e2284c8CC74F13FA6c218c4231b0786E6204728';
  const TIMELOCK = '0xb3c3aE82358DF7fC0bd98629D5ed91767e45c337';
  const EXACT_ETA = '1618916400';
  const DEBT_FAIR_LAUNCH_PID = '11';





  console.log(`>> Deploying debt${SYMBOL}`)
  const DebtToken = (await ethers.getContractFactory(
    "DebtToken",
    (await ethers.getSigners())[0]
  )) as DebtToken__factory;
  const debtToken = await upgrades.deployProxy(DebtToken, [
    `debt${SYMBOL}_V2`, `debt${SYMBOL}_V2`, TIMELOCK]) as DebtToken;
  await debtToken.deployed();
  console.log(`>> Deployed at ${debtToken.address}`);

  console.log(`>> Deploying an upgradable Vault contract for ${VAULT_NAME}`);
  const Vault = (await ethers.getContractFactory(
    'Vault',
    (await ethers.getSigners())[0]
  )) as Vault__factory;
  const vault = await upgrades.deployProxy(
    Vault,[CONFIG_ADDR, BASE_TOKEN_ADDR, NAME, SYMBOL, 18, debtToken.address]
  ) as Vault;
  await vault.deployed();
  console.log(`>> Deployed at ${vault.address}`);

  console.log(">> Set okHolders on DebtToken to be be Vault")
  await debtToken.setOkHolders([vault.address, FAIR_LAUNCH_ADDR], true)
  console.log("✅ Done");

  console.log(">> Transferring ownership of debtToken to Vault");
  await debtToken.transferOwnership(vault.address);
  console.log("✅ Done");

  const timelock = Timelock__factory.connect(
    TIMELOCK, (await ethers.getSigners())[0]
  ) as Timelock

  console.log(">> Queue Transaction to add a debtToken pool through Timelock");
  await timelock.queueTransaction(SHIELD_ADDR, '0', 'addPool(uint256,address,bool)', ethers.utils.defaultAbiCoder.encode(['uint256','address','bool'], [ALLOC_POINT_FOR_OPEN_POSITION, debtToken.address, true]), EXACT_ETA);
  console.log("✅ Done");

  console.log(">> Generate timelock executeTransaction")
  console.log(`await timelock.executeTransaction('${SHIELD_ADDR}', '0', 'addPool(uint256,address,bool)', ethers.utils.defaultAbiCoder.encode(['uint256','address','bool'], [${ALLOC_POINT_FOR_OPEN_POSITION}, '${debtToken.address}', true]), ${EXACT_ETA})`);
  console.log("✅ Done");

  console.log(">> Sleep for 10000msec waiting for fairLaunch to update the pool");
  await new Promise(resolve => setTimeout(resolve, 10000));
  console.log("✅ Done");

  console.log(">> link pool with vault");
  await vault.setFairLaunchPoolId(DEBT_FAIR_LAUNCH_PID, { gasLimit: '2000000' });
  console.log("✅ Done");

  console.log(">> Queue Transaction to add a Vault token pool through Timelock");
  await timelock.queueTransaction(SHIELD_ADDR, '0', 'addPool(uint256,address,bool)', ethers.utils.defaultAbiCoder.encode(['uint256','address','bool'], [ALLOC_POINT_FOR_DEPOSIT, vault.address, true]), EXACT_ETA);
  console.log("✅ Done");

  console.log(">> Generate timelock executeTransaction")
  console.log(`await timelock.executeTransaction('${SHIELD_ADDR}', '0', 'addPool(uint256,address,bool)', ethers.utils.defaultAbiCoder.encode(['uint256','address','bool'], [${ALLOC_POINT_FOR_DEPOSIT}, '${vault.address}', true]), ${EXACT_ETA})`);
  console.log("✅ Done");

  const wNativeRelayer = WNativeRelayer__factory.connect(
    WNATIVE_RELAYER_ADDR, (await ethers.getSigners())[0]
  ) as WNativeRelayer;

  console.log(">> Whitelisting Vault on WNativeRelayer Contract");
  await wNativeRelayer.setCallerOk([vault.address], true);
  console.log("✅ Done");

};

export default func;
func.tags = ['Vault'];