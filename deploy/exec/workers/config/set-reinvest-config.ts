import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, network } from 'hardhat';
import { Timelock__factory } from '../../../../typechain'
import MainnetConfig from '../../../../.mainnet.json'
import TestnetConfig from '../../../../.testnet.json'
import { FileService, TimelockService } from '../../../services';
import { TimelockEntity } from '../../../entities';

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
  REINVEST_PATH?: Array<string>
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
  const title = 'set-wault-pools-reinvest-config'
  const workerInputs: IWorkerReinvestConfigInputs = [
    {
      WORKER_NAME: "WEX-WBNB WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'WBNB'],
    },
    {
      WORKER_NAME: "BUSD-WBNB WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'WBNB'],
    },
    {
      WORKER_NAME: "ALPACA-WBNB WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'WBNB'],
    },
    {
      WORKER_NAME: "WAULTx-WBNB WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'WBNB'],
    },
    {
      WORKER_NAME: "ETH-BUSD WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'WBNB', 'BUSD'],
    },
    {
      WORKER_NAME: "WBNB-BUSD WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'WBNB', 'BUSD'],
    },
    {
      WORKER_NAME: "USDT-BUSD WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'WBNB', 'BUSD'],
    },
    {
      WORKER_NAME: "BTCB-BUSD WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'WBNB', 'BUSD'],
    },
    {
      WORKER_NAME: "BUSD-ETH WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'WBNB', 'ETH'],
    },
    {
      WORKER_NAME: "BTCB-ETH WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'WBNB', 'ETH'],
    },
    {
      WORKER_NAME: "BETH-ETH WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'WBNB', 'ETH'],
    },
    {
      WORKER_NAME: "USDT-ETH WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'WBNB', 'ETH'],
    },
    {
      WORKER_NAME: "USDT-ALPACA WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'WBNB', 'ALPACA'],
    },
    {
      WORKER_NAME: "WBNB-ALPACA WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'WBNB', 'ALPACA'],
    },
    {
      WORKER_NAME: "ALPACA-USDT WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'USDT'],
    },
    {
      WORKER_NAME: "WEX-USDT WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'USDT'],
    },
    {
      WORKER_NAME: "BUSD-USDT WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'USDT'],
    },
    {
      WORKER_NAME: "BTCB-USDT WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'USDT'],
    },
    {
      WORKER_NAME: "ETH-USDT WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'USDT'],
    },
    {
      WORKER_NAME: "MATIC-USDT WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'USDT'],
    },
    {
      WORKER_NAME: "ETH-BTCB WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'BTCB'],
    },
    {
      WORKER_NAME: "USDT-BTCB WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'BTCB'],
    },
    {
      WORKER_NAME: "BUSD-BTCB WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '2000',
      REINVEST_PATH: ['WEX', 'BTCB'],
    },
  ]
  const EXACT_ETA = '1626868800';









  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig
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
    let reinvestPath: Array<string> = []
    if(reinvestConfig.REINVEST_PATH) {
      reinvestPath = reinvestConfig.REINVEST_PATH.map((p) => {
        const addr = tokenList[p]
        if (addr === undefined) {
          throw(`error: path: unable to find address of ${p}`)
        }
        return addr
      })
    }

    return {
      WORKER_NAME: hit.WORKER_NAME,
      ADDRESS: hit.ADDRESS,
      REINVEST_BOUNTY_BPS: reinvestConfig.REINVEST_BOUNTY_BPS,
      REINVEST_THRESHOLD: ethers.utils.parseEther(reinvestConfig.REINVEST_THRESHOLD).toString(),
      REINVEST_PATH: reinvestPath
    }
  })

  const timelockTransactions: Array<TimelockEntity.Transaction> = []

  for(const reinvestConfig of reinvestConfigs) {
    if(reinvestConfig.WORKER_NAME.includes('CakeMaxiWorker')) {
      timelockTransactions.push(await TimelockService.queueTransaction(
        `setting reinvest params for ${reinvestConfig.WORKER_NAME}`,
        reinvestConfig.ADDRESS,
        '0',
        'setReinvestConfig(uint256,uint256)',
        ['uint256','uint256'],
        [reinvestConfig.REINVEST_BOUNTY_BPS, reinvestConfig.REINVEST_THRESHOLD],
        EXACT_ETA
      ))
    } else {
      timelockTransactions.push(await TimelockService.queueTransaction(
        `setting reinvest params for ${reinvestConfig.WORKER_NAME}`,
        reinvestConfig.ADDRESS,
        '0',
        'setReinvestConfig(uint256,uint256,address[])',
        ['uint256','uint256','address[]'],
        [reinvestConfig.REINVEST_BOUNTY_BPS, reinvestConfig.REINVEST_THRESHOLD, reinvestConfig.REINVEST_PATH],
        EXACT_ETA
      ))
    }
  }

  await FileService.write(`${title}`, timelockTransactions)
};

export default func;
func.tags = ['TimelockSetReinvestConfigWorkers02'];