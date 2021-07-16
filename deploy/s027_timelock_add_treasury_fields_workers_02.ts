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
  const workerInputs: Array<string> = [
    "BUSD-ALPACA PancakeswapWorker",
  ]
  const EXACT_ETA = '1626252600';
  const TREASURY_ACCOUNT = '0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De'; // Address of treasury account
  const TREASURY_BOUNTY_BPS = '300'; // Treasury bounty bps









  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig
  const allWorkers: IWorkers = config.Vaults.reduce((accum, vault) => {
    return accum.concat(vault.workers.map(worker => {
      return {
        WORKER_NAME: worker.name,
        ADDRESS: worker.address
      }
    }))
  }, [] as IWorkers)
  const TO_BE_UPGRADE_WORKERS: IWorkers = workerInputs.map((workerInput) => {
    // 1. find each worker having an identical name as workerInput
    // 2. if hit return
    // 3. other wise throw error
    const hit = allWorkers.find((worker) => {
      return worker.WORKER_NAME === workerInput
    })

    if(!!hit) return hit

    throw new Error(`could not find ${workerInput}`)
  })
  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);

  for(let i = 0; i < TO_BE_UPGRADE_WORKERS.length; i++) {
    console.log(`>> Setting Treasury account to: ${TO_BE_UPGRADE_WORKERS[i].WORKER_NAME} at ${TO_BE_UPGRADE_WORKERS[i].ADDRESS} through Timelock`)
    await timelock.queueTransaction(TO_BE_UPGRADE_WORKERS[i].ADDRESS, '0', 'setTreasuryConfig(address,uint256)', ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [TREASURY_ACCOUNT, TREASURY_BOUNTY_BPS]), EXACT_ETA, { gasPrice: 100000000000 });
    console.log("✅ Done");

    console.log(`>> Generate executeTransaction:`);
    console.log(`await timelock.executeTransaction('${TO_BE_UPGRADE_WORKERS[i].ADDRESS}', '0', 'setTreasuryConfig(address,uint256)', ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], ['${TREASURY_ACCOUNT}', '${TREASURY_BOUNTY_BPS}']), ${EXACT_ETA})`);
    console.log("✅ Done");
  }

};

export default func;
func.tags = ['TimelockAddTreasuryFieldsWorkers02'];