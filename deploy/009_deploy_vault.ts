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

  const SHIELD_ADDR = '0x1963f84395C8cf464E5483dE7f2f434c3F1b4656';
  const FAIR_LAUNCH_ADDR = '0xA625AB01B08ce023B2a342Dbb12a16f2C8489A8F';
  const ALLOC_POINT_FOR_DEPOSIT = 0;
  const ALLOC_POINT_FOR_OPEN_POSITION = 0;
  const CONFIG_ADDR = '0x709b102EF4b605197C75CfEA45F455A4e7ce065B';
  const BASE_TOKEN_ADDR = '0x55d398326f99059ff775485246999027b3197955'
  const VAULT_NAME = 'USDT VAULT'
  const NAME = 'Interest Bearing USDT'
  const SYMBOL = 'ibUSDT';
  const WNATIVE_RELAYER_ADDR = '0xE1D2CA01bc88F325fF7266DD2165944f3CAf0D3D';
  const TIMELOCK = '0x2D5408f2287BF9F9B05404794459a846651D0a59';
  const EXACT_ETA = '1622082600';
  const DEBT_FAIR_LAUNCH_PID = '15';





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

  console.log(`>> Queue Transaction to add a ${SYMBOL} pool through Timelock`);
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