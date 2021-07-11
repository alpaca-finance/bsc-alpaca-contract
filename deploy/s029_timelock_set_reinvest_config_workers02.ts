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

interface IWorkerReinvestConfig {
  WORKER_NAME: string,
  ADDRESS: string,
  REINVEST_BOUNTY_BPS: string,
  REINVEST_THRESHOLD: string,
  REINVEST_PATH: Array<string>
}

type IWorkerReinvestConfigs = Array<IWorkerReinvestConfig>

interface IWorkerReinvestConfigInput {
  WORKER_NAME: string,
  REINVEST_BOUNTY_BPS: string,
  REINVEST_THRESHOLD: string,
  REINVEST_PATH: Array<string>
}

type IWorkerReinvestConfigInputs = Array<IWorkerReinvestConfigInput>

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
  const workerInputs: IWorkerReinvestConfigInputs = [
    {
      WORKER_NAME: "BUSD-ALPACA PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'BUSD', 'ALPACA']
    }
  ]
  const EXACT_ETA = '1625816700';









  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig
  const executionTxs: Array<string> = []
  const allWorkers: IWorkers = config.Vaults.reduce((accum, vault) => {
    return accum.concat(vault.workers.map(worker => {
      return {
        WORKER_NAME: worker.name,
        ADDRESS: worker.address
      }
    }))
  }, [] as IWorkers)
  const reinvestConfigs: IWorkerReinvestConfigs = workerInputs.map((reinvestConfig) => {
    // 1. find each worker having an identical name as workerInput
    // 2. if hit return
    // 3. other wise throw error
    const hit = allWorkers.find((worker) => {
      return worker.WORKER_NAME === reinvestConfig.WORKER_NAME
    })
    if (hit === undefined) throw new Error(`could not find ${reinvestConfig.WORKER_NAME}`)

    const tokenList: any = config.Tokens
    const reinvestPath: Array<string> = reinvestConfig.REINVEST_PATH.map((p) => {
      const addr = tokenList[p]
      if (addr === undefined) {
        throw(`error: path: unable to find address of ${p}`)
      }
      return addr
    })

    return {
      WORKER_NAME: hit.WORKER_NAME,
      ADDRESS: hit.ADDRESS,
      REINVEST_BOUNTY_BPS: reinvestConfig.REINVEST_BOUNTY_BPS,
      REINVEST_THRESHOLD: ethers.utils.parseEther(reinvestConfig.REINVEST_THRESHOLD).toString(),
      REINVEST_PATH: reinvestPath
    }
  })

  const timelock = Timelock__factory.connect(config.Timelock, (await ethers.getSigners())[0]);

  for(let i = 0; i < reinvestConfigs.length; i++) {
    console.log("========")
    console.log(`>> Setting reinvest params to: ${reinvestConfigs[i].WORKER_NAME} at ${reinvestConfigs[i].ADDRESS} through Timelock`)
    console.log(`>> Queue tx on Timelock to update reinvest config`);
    await timelock.queueTransaction(
      reinvestConfigs[i].ADDRESS, '0',
      'setReinvestConfig(uint256,uint256,address[])',
      ethers.utils.defaultAbiCoder.encode(['uint256','uint256','address[]'],
      [reinvestConfigs[i].REINVEST_BOUNTY_BPS, reinvestConfigs[i].REINVEST_THRESHOLD, reinvestConfigs[i].REINVEST_PATH]), 
      EXACT_ETA, { gasPrice: 100000000000 });
    console.log("✅ Done");
    
    reinvestConfigs[i].REINVEST_PATH = reinvestConfigs[i].REINVEST_PATH.map((hop) => `'${hop}'`)
    console.log(`>> Generate executeTransaction:`);
    const executionTx = `await timelock.executeTransaction('${reinvestConfigs[i].ADDRESS}', '0', 'setReinvestConfig(uint256,uint256,address[])', ethers.utils.defaultAbiCoder.encode(['uint256','uint256','address[]'], ['${reinvestConfigs[i].REINVEST_BOUNTY_BPS}', '${reinvestConfigs[i].REINVEST_THRESHOLD}', [${reinvestConfigs[i].REINVEST_PATH}]]), ${EXACT_ETA})`
    console.log(executionTx);
    console.log("✅ Done");
    
    executionTxs.push(`// Config reinvest params of ${reinvestConfigs[i].WORKER_NAME}\n${executionTx}`)
  }

  console.log("=========")
  executionTxs.forEach((eTx) => console.log(eTx))
};

export default func;
func.tags = ['TimelockSetReinvestConfigWorkers02'];