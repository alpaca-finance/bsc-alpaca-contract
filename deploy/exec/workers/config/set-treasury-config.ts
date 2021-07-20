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
    "CAKE-WBNB PancakeswapWorker",
    "BTCB-WBNB PancakeswapWorker",
    "ETH-WBNB PancakeswapWorker",
    "DOT-WBNB PancakeswapWorker",
    "UNI-WBNB PancakeswapWorker",
    "LINK-WBNB PancakeswapWorker",
    "XVS-WBNB PancakeswapWorker",
    "YFI-WBNB PancakeswapWorker",
    "ITAM-WBNB PancakeswapWorker",
    "BUSD-WBNB PancakeswapWorker",
    "bMXX-WBNB PancakeswapWorker",
    "BELT-WBNB PancakeswapWorker",
    "BOR-WBNB PancakeswapWorker",
    "BRY-WBNB PancakeswapWorker",
    "pCWS-WBNB PancakeswapWorker",
    "SWINGBY-WBNB PancakeswapWorker",
    "DODO-WBNB PancakeswapWorker",
    "USDT-WBNB PancakeswapWorker",
    "ODDZ-WBNB PancakeswapWorker",
    "ADA-WBNB PancakeswapWorker",
    "TRX-WBNB PancakeswapWorker",
    "BTT-WBNB PancakeswapWorker",
    "USDT-BUSD PancakeswapWorker",
    "WBNB-BUSD PancakeswapWorker",
    "VAI-BUSD PancakeswapWorker",
    "USDC-BUSD PancakeswapWorker",
    "DAI-BUSD PancakeswapWorker",
    "UST-BUSD PancakeswapWorker",
    "BTCB-BUSD PancakeswapWorker",
    "ALPACA-BUSD PancakeswapWorker",
    "CAKE-BUSD PancakeswapWorker",
    "FORM-BUSD PancakeswapWorker",
    "TUSD-BUSD PancakeswapWorker",
    "COMP-ETH PancakeswapWorker",
    "SUSHI-ETH PancakeswapWorker",
    "WBNB-ETH PancakeswapWorker",
    "BUSD-USDT PancakeswapWorker",
    "WBNB-USDT PancakeswapWorker",
    "CAKE-USDT PancakeswapWorker",
    "USDC-USDT PancakeswapWorker",
    "WBNB-BTCB PancakeswapWorker",
    "BUSD-BTCB PancakeswapWorker",
    "WEX-WBNB WaultswapWorker",
    "BUSD-WBNB WaultswapWorker",
    "ALPACA-WBNB WaultswapWorker",
    "WAULTx-WBNB WaultswapWorker",
    "ETH-BUSD WaultswapWorker",
    "WBNB-BUSD WaultswapWorker",
    "USDT-BUSD WaultswapWorker",
    "BTCB-BUSD WaultswapWorker",
    "BUSD-ETH WaultswapWorker",
    "BTCB-ETH WaultswapWorker",
    "BETH-ETH WaultswapWorker",
    "USDT-ETH WaultswapWorker",
    "USDT-ALPACA WaultswapWorker",
    "WBNB-ALPACA WaultswapWorker",
    "ALPACA-USDT WaultswapWorker",
    "WEX-USDT WaultswapWorker",
    "BUSD-USDT WaultswapWorker",
    "BTCB-USDT WaultswapWorker",
    "ETH-USDT WaultswapWorker",
    "MATIC-USDT WaultswapWorker",
    "ETH-BTCB WaultswapWorker",
    "USDT-BTCB WaultswapWorker",
    "BUSD-BTCB WaultswapWorker", 
    "WBNB CakeMaxiWorker",
    "BUSD CakeMaxiWorker",
    "ETH CakeMaxiWorker",
    "USDT CakeMaxiWorker",
    "BTCB CakeMaxiWorker",
  ]
  const TREASURY_ACCOUNT = '0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De';
  const TREASURY_BOUNTY_BPS = '300';
  const EXACT_ETA = '1626705000';









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
  const executionTxs: Array<String> = []

  for(let i = 0; i < TO_BE_UPGRADE_WORKERS.length; i++) {
    console.log(`>> Setting Treasury account to: ${TO_BE_UPGRADE_WORKERS[i].WORKER_NAME} at ${TO_BE_UPGRADE_WORKERS[i].ADDRESS} through Timelock`)
    await timelock.queueTransaction(TO_BE_UPGRADE_WORKERS[i].ADDRESS, '0', 'setTreasuryConfig(address,uint256)', ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [TREASURY_ACCOUNT, TREASURY_BOUNTY_BPS]), EXACT_ETA, { gasPrice: 100000000000 });
    console.log("✅ Done");

    console.log(`>> Generate executeTransaction:`);
    const executionTx = `await timelock.executeTransaction('${TO_BE_UPGRADE_WORKERS[i].ADDRESS}', '0', 'setTreasuryConfig(address,uint256)', ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], ['${TREASURY_ACCOUNT}', '${TREASURY_BOUNTY_BPS}']), ${EXACT_ETA})`
    console.log(executionTx);
    console.log("✅ Done");

    executionTxs.push(`// Config treasury fields of ${TO_BE_UPGRADE_WORKERS[i].WORKER_NAME}\n${executionTx}\n`)
  }

  console.log("\n\n\n")
  for(const exTx of executionTxs) console.log(exTx)
};

export default func;
func.tags = ['TimelockAddTreasuryFieldsWorkers02'];