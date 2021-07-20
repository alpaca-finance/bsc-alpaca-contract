import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades, network } from 'hardhat';
import { Timelock__factory, PancakeswapV2Worker, PancakeswapV2Worker__factory, PancakeswapV2WorkerMigrate, PancakeswapV2WorkerMigrate__factory, WaultSwapWorker02__factory, CakeMaxiWorker02__factory, PancakeswapV2Worker02__factory } from '../../../../typechain'
import MainnetConfig from '../../../../.mainnet.json'
import TestnetConfig from '../../../../.testnet.json'

interface IWorker {
  WORKER_NAME: string,
  ADDRESS: string
}

type IWorkers = Array<IWorker>

interface IWorkerInput {
  WORKER_NAME: string,
}

type IWorkerInputs = Array<IWorkerInput>

/**
 * @description Deployment script for setting workers' beneficial vault related data
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
  const workerInputs: IWorkerInputs = [
    // {
    //   WORKER_NAME: "CAKE-WBNB PancakeswapWorker",
    // } // Example
  ]
  const rewardPathInput: Array<string> = ['CAKE', 'BUSD', 'ALPACA']
  const EXACT_ETA = '1620575100';
  const BENEFICIAL_VAULT_BOUNTY_BPS = ''; // Address of treasury account
  const BENEFICIAL_VAULT_ADDRESS = ''; // Treasury bounty bps
  









  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig
  const allWorkers: IWorkers = config.Vaults.reduce((accum, vault) => {
    return accum.concat(vault.workers.map(worker => {
      return {
        WORKER_NAME: worker.name,
        ADDRESS: worker.address
      }
    }))
  }, [] as IWorkers)

  // get REWARD_PATH as a list of address based on a list of its symbol on config.Tokens
  const REWARD_PATH: Array<string> = rewardPathInput.map((tokenName) => {
    const hit = ((config.Tokens as unknown) as Record<string, string | undefined>)[tokenName]
    if (!!hit) return hit
    throw new Error('could not find ${tokenName}')
  })
  const REWARD_PATH_STRINGIFY: string = REWARD_PATH.map((path) => `'${path}'`).join(',')
  const TO_BE_UPGRADE_WORKERS: IWorkers = workerInputs.map((workerInput) => {
    // 1. find each worker having an identical name as workerInput
    // 2. if hit return
    // 3. other wise throw error
    const hit = allWorkers.find((worker) => {
      return worker.WORKER_NAME === workerInput.WORKER_NAME
    })

    if(!!hit) return hit

    throw new Error(`could not find ${workerInput.WORKER_NAME}`)
  })
  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);

  for(let i = 0; i < TO_BE_UPGRADE_WORKERS.length; i++) {
    console.log(`>> Setting Beneficial Related Data to: ${TO_BE_UPGRADE_WORKERS[i].WORKER_NAME} at ${TO_BE_UPGRADE_WORKERS[i].ADDRESS} through Timelock + ProxyAdmin`)
    console.log(`>> Queue tx on Timelock to upgrade the implementation`);
    await timelock.queueTransaction(TO_BE_UPGRADE_WORKERS[i].ADDRESS, '0', 'setBeneficialVaultRelatedData(uint256,address,address[])', ethers.utils.defaultAbiCoder.encode(['uint256','address','address[]'], [BENEFICIAL_VAULT_BOUNTY_BPS, BENEFICIAL_VAULT_ADDRESS, REWARD_PATH]), EXACT_ETA, { gasPrice: 100000000000 });
    console.log("✅ Done");

    console.log(`>> Generate executeTransaction:`);
    console.log(`await timelock.executeTransaction('${TO_BE_UPGRADE_WORKERS[i].ADDRESS}', '0', 'setBeneficialVaultRelatedData(uint256,address,address[])', ethers.utils.defaultAbiCoder.encode('uint256','address','address[]'], ['${BENEFICIAL_VAULT_BOUNTY_BPS}', '${BENEFICIAL_VAULT_ADDRESS}', [${REWARD_PATH_STRINGIFY}]]), ${EXACT_ETA})`);
    console.log("✅ Done");
  }

};

export default func;
func.tags = ['TimelockAddBeneficialBuybackFieldsWorkers02'];