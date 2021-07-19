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
      WORKER_NAME: "CAKE-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "BTCB-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "ETH-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "DOT-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "UNI-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "LINK-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "XVS-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "YFI-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "ITAM-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "BUSD-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "bMXX-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "BELT-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "BOR-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "BRY-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "pCWS-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "SWINGBY-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "DODO-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "USDT-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "ODDZ-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "ADA-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "TRX-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "BTT-WBNB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB'],
    },
    {
      WORKER_NAME: "USDT-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'BUSD'],
    },
    {
      WORKER_NAME: "WBNB-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'BUSD'],
    },
    {
      WORKER_NAME: "VAI-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'BUSD'],
    },
    {
      WORKER_NAME: "USDC-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'BUSD'],
    },
    {
      WORKER_NAME: "DAI-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'BUSD'],
    },
    {
      WORKER_NAME: "UST-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'BUSD'],
    },
    {
      WORKER_NAME: "BTCB-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'BUSD'],
    },
    {
      WORKER_NAME: "ALPACA-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'BUSD'],
    },
    {
      WORKER_NAME: "CAKE-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'BUSD'],
    },
    {
      WORKER_NAME: "FORM-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'BUSD'],
    },
    {
      WORKER_NAME: "TUSD-BUSD PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'BUSD'],
    },
    {
      WORKER_NAME: "COMP-ETH PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB', 'ETH'],
    },
    {
      WORKER_NAME: "SUSHI-ETH PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB', 'ETH'],
    },
    {
      WORKER_NAME: "WBNB-ETH PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB', 'ETH'],
    },
    {
      WORKER_NAME: "BUSD-USDT PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'USDT'],
    },
    {
      WORKER_NAME: "WBNB-USDT PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'USDT'],
    },
    {
      WORKER_NAME: "CAKE-USDT PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'USDT'],
    },
    {
      WORKER_NAME: "USDC-USDT PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'USDT'],
    },
    {
      WORKER_NAME: "WBNB-BTCB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB', 'BTCB'],
    },
    {
      WORKER_NAME: "BUSD-BTCB PancakeswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['CAKE', 'WBNB', 'BTCB'],
    },
    {
      WORKER_NAME: "WEX-WBNB WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'WBNB'],
    },
    {
      WORKER_NAME: "BUSD-WBNB WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'WBNB'],
    },
    {
      WORKER_NAME: "ALPACA-WBNB WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'WBNB'],
    },
    {
      WORKER_NAME: "WAULTx-WBNB WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'WBNB'],
    },
    {
      WORKER_NAME: "ETH-BUSD WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'WBNB', 'BUSD'],
    },
    {
      WORKER_NAME: "WBNB-BUSD WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'WBNB', 'BUSD'],
    },
    {
      WORKER_NAME: "USDT-BUSD WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'WBNB', 'BUSD'],
    },
    {
      WORKER_NAME: "BTCB-BUSD WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'WBNB', 'BUSD'],
    },
    {
      WORKER_NAME: "BUSD-ETH WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'WBNB', 'ETH'],
    },
    {
      WORKER_NAME: "BTCB-ETH WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'WBNB', 'ETH'],
    },
    {
      WORKER_NAME: "BETH-ETH WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'WBNB', 'ETH'],
    },
    {
      WORKER_NAME: "USDT-ETH WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'WBNB', 'ETH'],
    },
    {
      WORKER_NAME: "USDT-ALPACA WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'WBNB', 'ALPACA'],
    },
    {
      WORKER_NAME: "WBNB-ALPACA WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'WBNB', 'ALPACA'],
    },
    {
      WORKER_NAME: "ALPACA-USDT WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'USDT'],
    },
    {
      WORKER_NAME: "WEX-USDT WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'USDT'],
    },
    {
      WORKER_NAME: "BUSD-USDT WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'USDT'],
    },
    {
      WORKER_NAME: "BTCB-USDT WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'USDT'],
    },
    {
      WORKER_NAME: "ETH-USDT WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'USDT'],
    },
    {
      WORKER_NAME: "MATIC-USDT WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'USDT'],
    },
    {
      WORKER_NAME: "ETH-BTCB WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'BTCB'],
    },
    {
      WORKER_NAME: "USDT-BTCB WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'BTCB'],
    },
    {
      WORKER_NAME: "BUSD-BTCB WaultswapWorker",
      REINVEST_BOUNTY_BPS: '300',
      REINVEST_THRESHOLD: '1',
      REINVEST_PATH: ['WEX', 'BTCB'],
    },
  ]
  const EXACT_ETA = '1626705000';









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
    
    executionTxs.push(`// Config reinvest params of ${reinvestConfigs[i].WORKER_NAME}\n${executionTx}\n`)
  }

  console.log("\n\n\n")
  for(const exTx of executionTxs) console.log(exTx)
};

export default func;
func.tags = ['TimelockSetReinvestConfigWorkers02'];