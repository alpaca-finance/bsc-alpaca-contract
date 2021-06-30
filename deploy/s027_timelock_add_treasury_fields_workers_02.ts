import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades, network } from 'hardhat';
import { Timelock__factory, PancakeswapV2Worker, PancakeswapV2Worker__factory, PancakeswapV2WorkerMigrate, PancakeswapV2WorkerMigrate__factory, WaultSwapWorker02__factory, CakeMaxiWorker02__factory, PancakeswapV2Worker02__factory } from '../typechain'
import MainnetConfig from '../.mainnet.json'
import TestnetConfig from '../.testnet.json'

interface IWorker {
  WORKER_NAME: string,
  ADDRESS: string
}

type IWorkers = Array<IWorker>

/**
 * @description Deployment script for upgrades workers to 02 version
 * @param  {HardhatRuntimeEnvironment} hre
 */
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
  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig
  const TO_BE_UPGRADE_WORKERS: IWorkers = [
    // {
    //   WORKER_NAME: "CAKE-WBNB PancakeswapWorker",
    //   ADDRESS: "0x7Af938f0EFDD98Dc513109F6A7E85106D26E16c4",
    // } // Example
  ];
  const EXACT_ETA = '1620575100';
  const TREASURY_ACCOUNT = ''; // Address of treasury account
  const TREASURY_BOUNTY_BPS = ''; // Treasury bounty bps






  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);

  for(let i = 0; i < TO_BE_UPGRADE_WORKERS.length; i++) {
    console.log(`>> Setting Treasury account to: ${TO_BE_UPGRADE_WORKERS[i].WORKER_NAME} at ${TO_BE_UPGRADE_WORKERS[i].ADDRESS} through Timelock + ProxyAdmin`)
    console.log(`>> Queue tx on Timelock to upgrade the implementation`);
    await timelock.queueTransaction(TO_BE_UPGRADE_WORKERS[i].ADDRESS, '0', 'setTreasuryAccount(address)', ethers.utils.defaultAbiCoder.encode(['address'], [TREASURY_ACCOUNT]), EXACT_ETA, { gasPrice: 100000000000 });
    console.log("✅ Done");

    console.log(`>> Generate executeTransaction:`);
    console.log(`await timelock.executeTransaction('${TO_BE_UPGRADE_WORKERS[i].ADDRESS}', '0', 'setTreasuryAccount(address)', ethers.utils.defaultAbiCoder.encode(['address'], ['${TREASURY_ACCOUNT}']), ${EXACT_ETA})`);
    console.log("✅ Done");

    console.log(`>> Setting Treasury bounty Bps to: ${TO_BE_UPGRADE_WORKERS[i].WORKER_NAME} at ${TO_BE_UPGRADE_WORKERS[i].ADDRESS} through Timelock + ProxyAdmin`)
    console.log(`>> Queue tx on Timelock to upgrade the implementation`);
    await timelock.queueTransaction(TO_BE_UPGRADE_WORKERS[i].ADDRESS, '0', 'setTreasuryBountyBps(uint256)', ethers.utils.defaultAbiCoder.encode(['uint256'], [TREASURY_BOUNTY_BPS]), EXACT_ETA, { gasPrice: 100000000000 });
    console.log("✅ Done");

    console.log(`>> Generate executeTransaction:`);
    console.log(`await timelock.executeTransaction('${TO_BE_UPGRADE_WORKERS[i].ADDRESS}', '0', 'setTreasuryBountyBps(uint256)', ethers.utils.defaultAbiCoder.encode(['uint256'], ['${TREASURY_BOUNTY_BPS}']), ${EXACT_ETA})`);
    console.log("✅ Done");
  }

};

export default func;
func.tags = ['TimelockAddTreasuryFieldsWorkers02'];